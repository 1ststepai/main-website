import { socialError } from "../errors.js";

// Facebook Page video as an UNPUBLISHED post (platform draft).
// Docs: https://developers.facebook.com/docs/graph-api/reference/page/videos/
//   POST /{page_id}/videos with published=false, file_url=<accessible URL>.
// The resumable "transfer" phase needs the Page access token on every chunk,
// so bytes cannot be handed to an untrusted uploader. The wired path is
// publishFacebookSlice, which uploads a Page Reel to rupload.facebook.com.

export function facebookUnpublishedVideoParams({ fileUrl, title, description }) {
  let url;
  try {
    url = new URL(fileUrl);
  } catch {
    throw socialError(400, "invalid_asset", "file_url is invalid.");
  }
  if (url.protocol !== "https:") throw socialError(400, "invalid_asset", "file_url must be https.");
  const params = new URLSearchParams();
  params.set("file_url", url.toString());
  params.set("published", "false");
  if (title) params.set("title", String(title).slice(0, 255));
  if (description) params.set("description", String(description));
  return params;
}

export async function createFacebookDraftVideo({ pageId, pageToken, fileUrl, title, description, fetchImpl = fetch, version = "v21.0" }) {
  if (!/^\d+$/.test(String(pageId || ""))) throw socialError(400, "invalid_field", "Facebook Page id is invalid.");
  const params = facebookUnpublishedVideoParams({ fileUrl, title, description });
  params.set("access_token", pageToken);
  const response = await fetchImpl(`https://graph.facebook.com/${version}/${pageId}/videos`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const payload = typeof response.json === "function" ? await response.json().catch(() => ({})) : {};
  if (!response.ok || !payload.id) {
    throw socialError(502, "facebook_upload_failed", String(payload?.error?.message || `Facebook upload failed (${response.status})`).slice(0, 300));
  }
  return { video_id: payload.id };
}

const RUPLOAD_HOST = "rupload.facebook.com";
const CHUNK_BYTES = 2 * 1024 * 1024;
const GRAPH = "https://graph.facebook.com/v22.0";

function assertFacebookUploadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw socialError(502, "facebook_upload_failed", "Facebook did not start the upload.");
  }
  if (url.protocol !== "https:" || url.hostname !== RUPLOAD_HOST) {
    throw socialError(502, "facebook_upload_failed", "Facebook returned an unexpected upload location.");
  }
  return url.toString();
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

function metaMessage(payload, status) {
  return String(payload?.error?.message || `Facebook request failed (${status})`).slice(0, 300);
}

async function startReel({ pageId, pageToken, fetchImpl }) {
  const body = new URLSearchParams({ upload_phase: "start", access_token: pageToken });
  const response = await fetchImpl(`${GRAPH}/${pageId}/video_reels`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.video_id || !payload.upload_url) {
    throw socialError(502, "facebook_upload_failed", metaMessage(payload, response.status));
  }
  return { video_id: String(payload.video_id), upload_url: assertFacebookUploadUrl(payload.upload_url) };
}

async function uploadReelChunk({ uploadUrl, pageToken, bytes, start, total, fetchImpl }) {
  const response = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `OAuth ${pageToken}`,
      offset: String(start),
      file_size: String(total),
    },
    body: bytes,
  });
  const payload = await readJson(response);
  if (!response.ok) throw socialError(502, "facebook_upload_failed", metaMessage(payload, response.status));
}

async function finishReel({ pageId, pageToken, videoId, title, description, videoState, fetchImpl }) {
  const body = new URLSearchParams({
    upload_phase: "finish",
    video_id: videoId,
    video_state: videoState,
    access_token: pageToken,
  });
  if (title) body.set("title", String(title).slice(0, 255));
  if (description) body.set("description", String(description).slice(0, 5000));
  const response = await fetchImpl(`${GRAPH}/${pageId}/video_reels`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await readJson(response);
  if (!response.ok || payload.success === false) {
    throw socialError(502, "facebook_upload_failed", metaMessage(payload, response.status));
  }
}

/**
 * Facebook Page Reels.
 * Bytes upload to rupload.facebook.com. Finish uses DRAFT unless the owner set privacy to public.
 * A draft is not a public post. Docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 */
export async function publishFacebookSlice({
  post,
  secrets,
  job = null,
  readRange,
  fetchImpl,
  now = Date.now(),
  deadline = now + 8000,
}) {
  const pageId = String(secrets.page_id || "");
  if (!/^\d+$/.test(pageId) || !secrets.access_token) {
    throw socialError(409, "facebook_not_connected", "Facebook is not connected for this brand.");
  }
  const total = job?.total_bytes || post.video_asset?.size;
  if (!post.video_asset?.pathname || !Number.isInteger(total) || total <= 0) {
    throw socialError(400, "invalid_video", "Video file is missing.");
  }
  const state = job ? { ...job, total_bytes: total } : {
    phase: "start",
    next_byte: 0,
    total_bytes: total,
    video_id: null,
    upload_url: null,
  };
  const startedAt = Date.now();
  const timeLeft = () => Date.now() - startedAt < Math.max(0, deadline - now);

  if (state.phase === "start" && timeLeft()) {
    const started = await startReel({ pageId, pageToken: secrets.access_token, fetchImpl });
    state.video_id = started.video_id;
    state.upload_url = started.upload_url;
    state.phase = "upload";
    state.next_byte = 0;
  }

  while (state.phase === "upload" && timeLeft()) {
    if (state.next_byte >= total) {
      state.phase = "uploaded";
      break;
    }
    const size = Math.min(CHUNK_BYTES, total - state.next_byte);
    const bytes = await readRange(post.video_asset.pathname, state.next_byte, state.next_byte + size - 1);
    if (!bytes || bytes.length !== size) throw socialError(502, "blob_short_read", "The video file ended before the expected byte.");
    await uploadReelChunk({
      uploadUrl: state.upload_url,
      pageToken: secrets.access_token,
      bytes,
      start: state.next_byte,
      total,
      fetchImpl,
    });
    state.next_byte += size;
  }

  if (state.phase === "upload" && state.next_byte >= total) state.phase = "uploaded";

  if (state.phase === "done" && state.video_state === "PUBLISHED") {
    return {
      done: true,
      secrets,
      job: state,
      publishedUrl: `https://www.facebook.com/reel/${state.video_id}`,
      releaseAssets: true,
    };
  }

  if (state.phase !== "uploaded" && !(state.phase === "done" && state.video_state === "DRAFT" && post.privacy_status === "public")) {
    return { done: false, drafted: false, secrets, job: state, publishedUrl: null, releaseAssets: false };
  }

  if (!timeLeft()) {
    return { done: false, drafted: state.phase === "uploaded", secrets, job: state, publishedUrl: null, releaseAssets: false };
  }

  const videoState = post.privacy_status === "public" ? "PUBLISHED" : "DRAFT";
  await finishReel({
    pageId,
    pageToken: secrets.access_token,
    videoId: state.video_id,
    title: post.title,
    description: post.description || post.caption || "",
    videoState,
    fetchImpl,
  });
  state.phase = "done";
  state.video_state = videoState;
  if (videoState === "DRAFT") {
    return {
      done: false,
      handoff: true,
      drafted: true,
      ref: state.video_id,
      secrets,
      job: state,
      publishedUrl: null,
      releaseAssets: true,
      message: `Unpublished Facebook Reel ${state.video_id}. It is not public. Set privacy to public and publish again only when it should go live, or publish the draft from Meta Business Suite.`,
    };
  }
  return {
    done: true,
    drafted: true,
    secrets,
    job: state,
    publishedUrl: `https://www.facebook.com/reel/${state.video_id}`,
    releaseAssets: true,
  };
}
