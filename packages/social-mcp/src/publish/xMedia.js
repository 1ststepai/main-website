import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { mcpError } from "../errors.js";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { readJson, sendWithRefresh } from "./authRetry.js";

/**
 * X API v2 chunked media upload (docs.x.com/x-api/media/quickstart/media-upload-chunked):
 *   POST /2/media/upload/initialize   JSON {media_type, total_bytes, media_category}
 *   POST /2/media/upload/{id}/append  multipart segment_index + media (<= 5 MB each)
 *   POST /2/media/upload/{id}/finalize
 *   GET  /2/media/upload?command=STATUS&media_id=  while processing_info is pending/in_progress
 * Needs the media.write user scope. Uses only the brand's own (bring-your-own) X app token.
 */
export const X_MEDIA_API = "https://api.x.com/2/media/upload";
const MB = 1024 * 1024;
export const X_SEGMENT = 4 * MB;
const STATUS_POLL_LIMIT = 60;

const TYPES = {
  ".jpg": { mime: "image/jpeg", category: "tweet_image", max: 5 * MB },
  ".jpeg": { mime: "image/jpeg", category: "tweet_image", max: 5 * MB },
  ".png": { mime: "image/png", category: "tweet_image", max: 5 * MB },
  ".webp": { mime: "image/webp", category: "tweet_image", max: 5 * MB },
  ".gif": { mime: "image/gif", category: "tweet_gif", max: 15 * MB },
  ".mp4": { mime: "video/mp4", category: "tweet_video", max: 8 * 1024 * MB },
  ".mov": { mime: "video/quicktime", category: "tweet_video", max: 8 * 1024 * MB },
};

export function xMediaKind(filePath) {
  const kind = TYPES[extname(String(filePath)).toLowerCase()];
  if (!kind) throw mcpError("invalid_media", "X media must be JPG, PNG, WEBP, GIF, MP4 or MOV.", 400);
  return kind;
}

/** A Post may carry up to 4 photos, or 1 animated GIF, or 1 video. */
export function xMediaPaths(post) {
  const list = Array.isArray(post?.media_paths) && post.media_paths.length ? post.media_paths : post?.media_path ? [post.media_path] : [];
  if (!list.length) return [];
  const kinds = list.map(xMediaKind);
  const single = kinds.some((k) => k.category !== "tweet_image");
  if (single && list.length > 1) throw mcpError("invalid_media", "An X post can carry one video or one GIF, or up to 4 images.", 400);
  if (list.length > 4) throw mcpError("invalid_media", "An X post can carry up to 4 images.", 400);
  return list;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failed(payload, fallback) {
  const detail = payload?.detail || payload?.errors?.[0]?.message || payload?.title;
  return mcpError("x_media_failed", detail ? `X media upload: ${detail}` : fallback, 502);
}

export async function uploadXMedia({ filePath, auth, fetchImpl, sleep = defaultSleep }) {
  const kind = xMediaKind(filePath);
  const size = statSync(filePath).size;
  if (!size) throw mcpError("invalid_media", "The media file is empty.", 400);
  if (size > kind.max) throw mcpError("invalid_media", `X ${kind.category} files are limited to ${Math.round(kind.max / MB)} MB.`, 400);

  const init = await auth((token) =>
    fetchImpl(`${X_MEDIA_API}/initialize`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ media_type: kind.mime, total_bytes: size, media_category: kind.category }),
    }),
  );
  const opened = await readJson(init);
  const mediaId = opened?.data?.id;
  if (!init.ok || !mediaId) throw failed(opened, "X did not start the media upload.");

  const bytes = readFileSync(filePath);
  for (let index = 0, offset = 0; offset < size; index += 1, offset += X_SEGMENT) {
    const segment = bytes.subarray(offset, Math.min(offset + X_SEGMENT, size));
    const sent = await auth((token) => {
      const form = new FormData();
      form.append("segment_index", String(index));
      form.append("media", new Blob([segment], { type: "application/octet-stream" }), "chunk");
      return fetchImpl(`${X_MEDIA_API}/${mediaId}/append`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
    });
    if (!sent.ok) throw failed(await readJson(sent), `X rejected media segment ${index} (HTTP ${sent.status}).`);
  }

  const fin = await auth((token) =>
    fetchImpl(`${X_MEDIA_API}/${mediaId}/finalize`, { method: "POST", headers: { authorization: `Bearer ${token}` } }),
  );
  let state = await readJson(fin);
  if (!fin.ok) throw failed(state, "X did not finalize the media upload.");

  for (let attempt = 0; attempt < STATUS_POLL_LIMIT; attempt += 1) {
    const info = state?.data?.processing_info;
    if (!info || info.state === "succeeded") return String(mediaId);
    if (info.state === "failed") throw failed({ detail: info.error?.message }, "X could not process the media.");
    await sleep(Math.max(1, Number(info.check_after_secs) || 1) * 1000);
    const polled = await auth((token) =>
      fetchImpl(`${X_MEDIA_API}?command=STATUS&media_id=${encodeURIComponent(mediaId)}`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    state = await readJson(polled);
    if (!polled.ok) throw failed(state, "X media status could not be read.");
  }
  throw mcpError("x_media_failed", "X is still processing the media. Try publishing again shortly.", 504);
}

/** Upload every media file on the post; returns media_ids in order. */
export async function uploadXPostMedia({ post, mediaRoot, secretsRef, budget, refresh, onSecrets, onNeedsReconnect, fetchImpl, sleep }) {
  const paths = xMediaPaths(post);
  if (!paths.length) return [];
  if (!mediaRoot) throw mcpError("media_root_missing", "PostPath media directory is not available.", 503);
  const auth = async (send) => {
    const sent = await sendWithRefresh({
      budget,
      secrets: secretsRef.current,
      refresh,
      onSecrets,
      onNeedsReconnect,
      send: (current) => send(current.access_token),
    });
    secretsRef.current = sent.secrets;
    return sent.response;
  };
  const ids = [];
  for (const path of paths) {
    ids.push(await uploadXMedia({ filePath: resolveSafeMediaPath(path, mediaRoot), auth, fetchImpl, sleep }));
  }
  return ids;
}
