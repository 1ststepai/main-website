import { get, head } from "@vercel/blob";
import { THUMBNAIL_MAX_BYTES } from "./constants.js";
import { socialError } from "./errors.js";

export function blobToken() {
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (token.length < 20) {
    throw socialError(503, "social_not_configured", "BLOB_READ_WRITE_TOKEN is not configured");
  }
  return token;
}

export function assertSocialPath(pathname, brandId, postId) {
  const expected = `social/${brandId}/${postId}/`;
  if (
    typeof pathname !== "string"
    || pathname.length > 400
    || !pathname.startsWith(expected)
    || pathname.includes("..")
    || pathname.includes("\\")
    || pathname.includes("//")
  ) {
    throw socialError(400, "invalid_asset", "Asset path is not valid for this post.");
  }
}

function safeBlobError(error) {
  if (error?.statusCode) throw error;
  throw socialError(502, "blob_unavailable", "Stored media could not be read.");
}

export async function issueClientUploadToken({ pathname, contentType, maximumSizeInBytes, validUntil }) {
  const { generateClientTokenFromReadWriteToken } = await import("@vercel/blob/client");
  try {
    return await generateClientTokenFromReadWriteToken({
      token: blobToken(),
      pathname,
      maximumSizeInBytes,
      allowedContentTypes: [contentType],
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  } catch (error) {
    safeBlobError(error);
  }
}

export async function statSocialBlob(pathname) {
  try {
    const meta = await head(pathname, { token: blobToken() });
    if (meta.url) {
      const host = new URL(meta.url).hostname;
      if (!host.endsWith(".blob.vercel-storage.com")) {
        throw socialError(400, "invalid_asset", "Stored media URL is not valid.");
      }
    }
    return {
      size: meta.size,
      contentType: meta.contentType,
      pathname: meta.pathname,
      url: meta.url,
    };
  } catch (error) {
    safeBlobError(error);
  }
}

async function readBounded(stream, max) {
  const reader = stream.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (received < max) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = max - received;
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(Buffer.from(slice));
      received += slice.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = Buffer.concat(chunks);
  if (out.length !== max) {
    throw socialError(502, "blob_short_read", "The stored file ended before the expected byte.");
  }
  return out;
}

export async function readSocialBlobRange(pathname, start, end) {
  const expected = end - start + 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || expected <= 0 || expected > 8 * 1024 * 1024) {
    throw socialError(400, "invalid_range", "Media range is invalid.");
  }
  let result;
  try {
    result = await get(pathname, {
      access: "private",
      useCache: false,
      token: blobToken(),
      headers: { Range: `bytes=${start}-${end}` },
    });
  } catch (error) {
    safeBlobError(error);
  }
  if (!result?.stream) throw socialError(502, "blob_unavailable", "The stored file could not be read.");
  const contentRange = result.headers.get("content-range") || "";
  if (start > 0 && !contentRange.startsWith(`bytes ${start}-`)) {
    await result.stream.cancel().catch(() => {});
    throw socialError(502, "blob_range_unsupported", "Storage did not return the requested video range.");
  }
  if (expected > THUMBNAIL_MAX_BYTES && result.blob?.size && result.blob.size > expected && !contentRange) {
    await result.stream.cancel().catch(() => {});
    throw socialError(502, "blob_range_unsupported", "Storage did not return the requested video range.");
  }
  return readBounded(result.stream, expected);
}
