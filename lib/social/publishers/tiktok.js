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
  const errorCode = payload?.error?.code;
  if (!response.ok || (errorCode && errorCode !== "ok") || !payload?.data?.upload_url) {
    throw socialError(502, "tiktok_init_failed", String(payload?.error?.message || `TikTok init failed (${response.status})`).slice(0, 300));
  }
  return { publish_id: payload.data.publish_id, upload_url: payload.data.upload_url, plan };
}

/**
 * Headers for one chunk PUT to upload_url. The PUT carries no bearer token per
 * the media transfer guide, so the uploader (agent) can send bytes directly to
 * TikTok and nothing is stored by us. Browser CORS for upload_url is not documented.
 */
export function assertTikTokUploadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw socialError(502, "tiktok_init_failed", "TikTok did not return an upload URL.");
  }
  const host = url.hostname;
  const allowed = host === "tiktokapis.com" || host.endsWith(".tiktokapis.com");
  if (url.protocol !== "https:" || !allowed) {
    throw socialError(502, "tiktok_init_failed", "TikTok returned an unexpected upload location.");
  }
  return url.toString();
}

export function tiktokChunkHeaders({ start, end, total, contentType }) {
  if (!TIKTOK_TYPES.has(contentType)) throw socialError(400, "invalid_asset", "TikTok accepts mp4, quicktime, or webm.");
  return {
    "content-type": contentType,
    "content-length": String(end - start + 1),
    "content-range": `bytes ${start}-${end}/${total}`,
  };
}

async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * TikTok inbox upload. The creator finishes the post in the TikTok app.
 * This does not call the direct-post endpoint and must not be reported as published.
 * Docs: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
 */
export async function publishTikTokSlice({
  post,
  secrets,
  job = null,
  readRange,
  fetchImpl,
  oauth,
  now = Date.now(),
  deadline = now + 8000,
}) {
  let current = secrets;
  if (!current?.access_token || (current.expires_at && Date.parse(current.expires_at) <= now + 60_000)) {
    if (!current?.refresh_token || !oauth?.clientKey || !oauth?.clientSecret) {
      throw socialError(409, "tiktok_not_connected", "TikTok needs to be connected again.");
    }
    const { refreshTikTokAccess } = await import("../tiktokAuth.js");
    const refreshed = await refreshTikTokAccess({
      refreshToken: current.refresh_token,
      clientKey: oauth.clientKey,
      clientSecret: oauth.clientSecret,
      fetchImpl,
      now,
    });
    current = { ...current, ...refreshed };
  }
  const total = job?.total_bytes || post.video_asset?.size;
  const contentType = post.video_asset?.content_type || "video/mp4";
  if (!post.video_asset?.pathname || !Number.isInteger(total) || total <= 0) {
    throw socialError(400, "invalid_video", "Video file is missing.");
  }
  const state = job?.upload_url
    ? { ...job, total_bytes: total }
    : { phase: "init", next_byte: 0, total_bytes: total, upload_url: null, publish_id: null, chunk_size: 0 };
  const startedAt = Date.now();
  const timeLeft = () => Date.now() - startedAt < Math.max(0, deadline - now);

  if (!state.upload_url && timeLeft()) {
    const init = await initTikTokInboxUpload({
      accessToken: current.access_token,
      videoSize: total,
      fetchImpl,
    });
    state.upload_url = assertTikTokUploadUrl(init.upload_url);
    state.publish_id = init.publish_id;
    state.chunk_size = init.plan.chunk_size;
    state.next_byte = 0;
    state.phase = "upload";
  }

  while (state.phase === "upload" && state.next_byte < total && timeLeft()) {
    const size = Math.min(state.chunk_size || total, total - state.next_byte);
    const start = state.next_byte;
    const end = start + size - 1;
    const bytes = await readRange(post.video_asset.pathname, start, end);
    if (!bytes || bytes.length !== size) throw socialError(502, "blob_short_read", "The video file ended before the expected byte.");
    const response = await fetchImpl(state.upload_url, {
      method: "PUT",
      headers: tiktokChunkHeaders({ start, end, total, contentType }),
      body: bytes,
    });
    if (!response.ok) {
      const payload = await readJson(response);
      throw socialError(502, "tiktok_upload_failed", String(payload?.error?.message || `TikTok upload failed (${response.status})`).slice(0, 300));
    }
    state.next_byte = end + 1;
  }

  if (state.next_byte < total) {
    return { done: false, handoff: false, secrets: current, job: state, publishedUrl: null, releaseAssets: false };
  }
  state.phase = "handed_off";
  return {
    done: false,
    handoff: true,
    ref: state.publish_id,
    secrets: current,
    job: state,
    publishedUrl: null,
    releaseAssets: true,
    message: "Video is in the TikTok inbox. Finish the post in the TikTok app. This studio did not publish it.",
  };
}
