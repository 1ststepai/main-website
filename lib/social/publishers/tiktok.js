import { socialError } from "../errors.js";

// TikTok Content Posting API — "upload to inbox" (draft) flow, NOT direct post.
// Docs: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
//       https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
// The creator finishes posting from the TikTok app inbox notification.
// Not wired yet: there is no TikTok OAuth connection (scope video.upload) in this PR.

export const TIKTOK_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
const MIN_CHUNK = 5 * 1024 * 1024;
const MAX_CHUNK = 64 * 1024 * 1024;
const TIKTOK_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/** Chunk plan per the media transfer guide (5–64 MB chunks, last may be up to 128 MB). */
export function tiktokChunkPlan(videoSize, chunkSize = 10 * 1024 * 1024) {
  if (!Number.isInteger(videoSize) || videoSize <= 0) throw socialError(400, "invalid_video", "Video size is invalid.");
  if (videoSize <= MAX_CHUNK) return { video_size: videoSize, chunk_size: videoSize, total_chunk_count: 1 };
  if (chunkSize < MIN_CHUNK || chunkSize > MAX_CHUNK) throw socialError(400, "invalid_chunk", "Chunk size is invalid.");
  return { video_size: videoSize, chunk_size: chunkSize, total_chunk_count: Math.floor(videoSize / chunkSize) };
}

/** Server-side: start an inbox upload. Returns publish_id + upload_url (valid 1 hour). */
export async function initTikTokInboxUpload({ accessToken, videoSize, chunkSize, fetchImpl = fetch }) {
  const plan = tiktokChunkPlan(videoSize, chunkSize);
  const response = await fetchImpl(TIKTOK_INIT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", ...plan } }),
  });
  const payload = typeof response.json === "function" ? await response.json().catch(() => ({})) : {};
  if (!response.ok || payload?.error?.code && payload.error.code !== "ok" || !payload?.data?.upload_url) {
    throw socialError(502, "tiktok_init_failed", String(payload?.error?.message || `TikTok init failed (${response.status})`).slice(0, 300));
  }
  return { publish_id: payload.data.publish_id, upload_url: payload.data.upload_url, plan };
}

/**
 * Headers for one chunk PUT to upload_url. The PUT carries no bearer token per
 * the media transfer guide, so the uploader (agent) can send bytes directly to
 * TikTok and nothing is stored by us. Browser CORS for upload_url is not documented.
 */
export function tiktokChunkHeaders({ start, end, total, contentType }) {
  if (!TIKTOK_TYPES.has(contentType)) throw socialError(400, "invalid_asset", "TikTok accepts mp4, quicktime, or webm.");
  return {
    "content-type": contentType,
    "content-length": String(end - start + 1),
    "content-range": `bytes ${start}-${end}/${total}`,
  };
}
