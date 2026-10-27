import { Readable } from "node:stream";
import { get } from "@vercel/blob";
import { THUMBNAIL_CONTENT_TYPES, THUMBNAIL_MAX_BYTES } from "../../lib/social/constants.js";
import { socialError } from "../../lib/social/errors.js";
import { blobToken } from "../../lib/social/blobAccess.js";
import { assertOwner, enforceRateLimit, requestQuery, runSocial, sendJson } from "../../lib/social/http.js";
import { getPost } from "../../lib/social/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed", message: "Method not allowed." });
  }
  return runSocial(res, async () => {
    assertOwner(req);
    enforceRateLimit(req, res, "social-asset", 300);
    const query = requestQuery(req);
    if (query.get("kind") !== "thumbnail") {
      throw socialError(400, "invalid_asset", "Only thumbnails can be previewed.");
    }
    const post = await getPost(query.get("post_id"));
    const asset = post?.thumbnail_asset;
    if (!asset?.pathname || !asset.size || asset.size > THUMBNAIL_MAX_BYTES) {
      throw socialError(404, "not_found", "Thumbnail not found.");
    }
    const result = await get(asset.pathname, {
      access: "private",
      useCache: false,
      token: blobToken(),
    });
    if (!result?.stream || !THUMBNAIL_CONTENT_TYPES.includes(result.blob.contentType)) {
      await result?.stream?.cancel?.().catch(() => {});
      throw socialError(404, "not_found", "Thumbnail not found.");
    }
    if (result.blob.size > THUMBNAIL_MAX_BYTES) {
      await result.stream.cancel().catch(() => {});
      throw socialError(413, "payload_too_large", "Thumbnail is too large to preview.");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", result.blob.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, noarchive");
    if (result.blob.size) res.setHeader("Content-Length", String(result.blob.size));
    Readable.fromWeb(result.stream).pipe(res);
  });
}
