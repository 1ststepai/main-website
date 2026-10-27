import { socialError } from "../errors.js";
import { META_GRAPH } from "../meta.js";

const RUPLOAD_HOST = "rupload.facebook.com";
const CHUNK_BYTES = 2 * 1024 * 1024;

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
  const message = payload?.error?.message || `Instagram request failed (${status})`;
  return String(message).replace(/EAA[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
}

export function assertInstagramUploadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw socialError(502, "instagram_upload_failed", "Instagram did not start the upload.");
  }
  if (url.protocol !== "https:" || url.hostname !== RUPLOAD_HOST || !url.pathname.includes("/ig-api-upload/")) {
    throw socialError(502, "instagram_upload_failed", "Instagram returned an unexpected upload location.");
  }
  return url.toString();
}

async function createContainer({ igUserId, accessToken, caption, fetchImpl }) {
  const response = await fetchImpl(`${META_GRAPH}/${igUserId}/media`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      media_type: "REELS",
      upload_type: "resumable",
      caption: String(caption || "").slice(0, 2200),
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.id || !payload.uri) {
    throw socialError(502, "instagram_upload_failed", metaMessage(payload, response.status));
  }
  return { id: String(payload.id), uri: assertInstagramUploadUrl(payload.uri) };
}

async function uploadChunk({ uri, accessToken, bytes, start, total, fetchImpl }) {
  const response = await fetchImpl(uri, {
    method: "POST",
    headers: {
      authorization: `OAuth ${accessToken}`,
      offset: String(start),
      file_size: String(total),
    },
    body: bytes,
  });
  const payload = await readJson(response);
  if (!response.ok) throw socialError(502, "instagram_upload_failed", metaMessage(payload, response.status));
  return payload;
}

async function containerStatus({ containerId, accessToken, fetchImpl }) {
  const response = await fetchImpl(`${META_GRAPH}/${containerId}?fields=status_code`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJson(response);
  if (!response.ok) throw socialError(502, "instagram_upload_failed", metaMessage(payload, response.status));
  return String(payload.status_code || "");
}

async function publishContainer({ igUserId, containerId, accessToken, fetchImpl }) {
  const response = await fetchImpl(`${META_GRAPH}/${igUserId}/media_publish`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ creation_id: containerId }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.id) {
    throw socialError(502, "instagram_publish_failed", metaMessage(payload, response.status));
  }
  const lookup = await fetchImpl(`${META_GRAPH}/${payload.id}?fields=permalink`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const media = await readJson(lookup);
  return {
    media_id: String(payload.id),
    permalink: lookup.ok && media.permalink ? String(media.permalink) : "",
  };
}

/**
 * Instagram Reels resumable upload.
 * Draft stage creates the container and uploads bytes. It does not call media_publish.
 * Publish stage calls media_publish, which makes the Reel live. Instagram has no private post.
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing/resumable-uploads/
 */
export async function publishInstagramSlice({
  post,
  secrets,
  job = null,
  readRange,
  fetchImpl,
  now = Date.now(),
  deadline = now + 8000,
}) {
  const igUserId = String(secrets.instagram_id || "");
  if (!/^\d+$/.test(igUserId)) throw socialError(409, "instagram_not_connected", "Instagram is not connected for this brand.");
  if (!secrets.access_token) throw socialError(409, "instagram_not_connected", "Instagram needs to be connected again.");
  const total = job?.total_bytes || post.video_asset?.size;
  if (!post.video_asset?.pathname || !Number.isInteger(total) || total <= 0) {
    throw socialError(400, "invalid_video", "Video file is missing.");
  }
  const state = job ? { ...job, total_bytes: total } : {
    phase: "init",
    next_byte: 0,
    total_bytes: total,
    container_id: null,
    upload_url: null,
    media_id: null,
  };
  const startedAt = Date.now();
  const timeLeft = () => Date.now() - startedAt < Math.max(0, deadline - now);
  const caption = post.caption || post.description || post.title || "";

  if (state.phase === "init" && timeLeft()) {
    const created = await createContainer({
      igUserId,
      accessToken: secrets.access_token,
      caption,
      fetchImpl,
    });
    state.container_id = created.id;
    state.upload_url = created.uri;
    state.phase = "upload";
    state.next_byte = 0;
  }

  while (state.phase === "upload" && timeLeft()) {
    if (state.next_byte >= total) {
      state.phase = "processing";
      break;
    }
    const size = Math.min(CHUNK_BYTES, total - state.next_byte);
    const bytes = await readRange(post.video_asset.pathname, state.next_byte, state.next_byte + size - 1);
    if (!bytes || bytes.length !== size) throw socialError(502, "blob_short_read", "The video file ended before the expected byte.");
    await uploadChunk({
      uri: state.upload_url,
      accessToken: secrets.access_token,
      bytes,
      start: state.next_byte,
      total,
      fetchImpl,
    });
    state.next_byte += size;
  }

  if (state.phase === "processing" && timeLeft()) {
    const status = await containerStatus({
      containerId: state.container_id,
      accessToken: secrets.access_token,
      fetchImpl,
    });
    if (status === "ERROR" || status === "EXPIRED") {
      throw socialError(502, "instagram_upload_failed", `Instagram could not process the Reel (${status}).`);
    }
    if (status === "FINISHED") state.phase = "ready";
  }

  if (state.phase !== "ready" && state.phase !== "done") {
    return { done: false, drafted: false, handoff: false, secrets, job: state, publishedUrl: null, releaseAssets: false };
  }

  if (post.privacy_status !== "public") {
    return {
      done: false,
      drafted: true,
      handoff: false,
      secrets,
      job: { ...state, phase: "ready", video_id: state.container_id },
      publishedUrl: null,
      releaseAssets: false,
      message: "Instagram has the video in an unpublished container. Set privacy to public before publishing. Instagram cannot keep a Reel private.",
    };
  }

  if (!timeLeft()) {
    return { done: false, drafted: true, secrets, job: { ...state, video_id: state.container_id }, publishedUrl: null, releaseAssets: false };
  }

  const published = await publishContainer({
    igUserId,
    containerId: state.container_id,
    accessToken: secrets.access_token,
    fetchImpl,
  });
  state.phase = "done";
  state.media_id = published.media_id;
  state.video_id = published.media_id;
  return {
    done: true,
    drafted: true,
    secrets,
    job: state,
    publishedUrl: published.permalink || `https://www.instagram.com/reel/${published.media_id}/`,
    releaseAssets: true,
  };
}
