import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { mcpError } from "../errors.js";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { invalidGrantError, isInvalidGrantPayload, readJson, sendWithRefresh } from "./authRetry.js";

const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";

async function refreshAccess({ secrets, oauth, fetchImpl, now = Date.now() }) {
  if (!secrets.refresh_token || !oauth?.clientId || !oauth?.clientSecret) {
    throw mcpError("pinterest_not_connected", "Reconnect Pinterest.", 409);
  }
  const basic = Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString("base64");
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: secrets.refresh_token,
    }),
  });
  const payload = await readJson(response);
  if (isInvalidGrantPayload(payload)) {
    throw invalidGrantError("Pinterest refresh token was revoked. Reconnect.");
  }
  if (!response.ok || !payload.access_token) {
    throw mcpError("pinterest_auth_failed", "Pinterest needs to be connected again.", 502);
  }
  return {
    ...secrets,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || secrets.refresh_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
}

async function ensureAccess({ secrets, oauth, fetchImpl, now = Date.now(), onSecrets }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  const next = await refreshAccess({ secrets, oauth, fetchImpl, now });
  if (onSecrets) await onSecrets(next);
  return next;
}

async function resolveBoardId(connection, fetchImpl, budget, secretsRef, refresh, onSecrets, onNeedsReconnect) {
  if (connection.board_id) return String(connection.board_id);
  const sent = await sendWithRefresh({
    budget,
    secrets: secretsRef.current,
    refresh,
    onSecrets: async (next) => {
      secretsRef.current = next;
      if (onSecrets) await onSecrets(next);
    },
    onNeedsReconnect,
    send: (current) =>
      fetchImpl("https://api.pinterest.com/v5/boards?page_size=1", {
        headers: { authorization: `Bearer ${current.access_token}` },
      }),
  });
  secretsRef.current = sent.secrets;
  const payload = await readJson(sent.response);
  const board = payload.items?.[0];
  if (!sent.response.ok || !board?.id) {
    throw mcpError("pinterest_board_required", "Create a Pinterest board (or reconnect) before publishing pins.", 409);
  }
  return String(board.id);
}

const API = "https://api.pinterest.com/v5";
const MB = 1024 * 1024;
const IMAGE_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
const VIDEO_TYPES = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4" };
const MEDIA_POLL_LIMIT = 30;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Decide how the pin's media gets to Pinterest. */
export function pinterestMediaPlan(post, mediaRoot) {
  const localPath = post.media_path ? resolveSafeMediaPath(post.media_path, mediaRoot) : "";
  if (localPath) {
    const ext = extname(localPath).toLowerCase();
    if (VIDEO_TYPES[ext]) return { kind: "video", filePath: localPath, contentType: VIDEO_TYPES[ext] };
    if (IMAGE_TYPES[ext]) {
      if (statSync(localPath).size > 20 * MB) throw mcpError("invalid_media", "Pinterest images are limited to 20 MB.", 400);
      return { kind: "image_base64", filePath: localPath, contentType: IMAGE_TYPES[ext] };
    }
    throw mcpError("invalid_media", "Pinterest pins need a JPG/PNG image or an MP4/MOV/M4V video.", 400);
  }
  const mediaUrl = String(post.media_url || "").trim();
  if (/^https:\/\//i.test(mediaUrl)) {
    if (VIDEO_TYPES[extname(new URL(mediaUrl).pathname).toLowerCase()]) {
      throw mcpError("media_path_required", "Pinterest video pins upload the file itself. Save the video in PostPath (media_path).", 400);
    }
    return { kind: "image_url", url: mediaUrl };
  }
  throw mcpError("media_required", "Pinterest pins need a media file saved in PostPath, or a public https image media_url.", 400);
}

function coverSource(post, mediaRoot) {
  const url = String(post.cover_image_url || "").trim();
  if (/^https:\/\//i.test(url)) return { cover_image_url: url };
  if (post.cover_image_path) {
    const coverPath = resolveSafeMediaPath(post.cover_image_path, mediaRoot);
    const type = IMAGE_TYPES[extname(coverPath).toLowerCase()];
    if (!type) throw mcpError("invalid_media", "Pinterest cover images must be JPG or PNG.", 400);
    return { cover_image_content_type: type, cover_image_data: readFileSync(coverPath).toString("base64") };
  }
  // Schema allows a keyframe instead of a cover image; docs recommend a cover image URL.
  return { cover_image_key_frame_time: Math.max(0, Number(post.cover_image_key_frame_time) || 1) };
}

/**
 * Video pin flow (developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins#creating-video-pins):
 * POST /v5/media {media_type:"video"} -> multipart POST to upload_url with upload_parameters + file (no bearer)
 * -> GET /v5/media/{id} until succeeded -> pins/create with media_source video_id.
 */
async function uploadPinterestVideo({ plan, call, fetchImpl, sleep }) {
  const registered = await call((token) =>
    fetchImpl(`${API}/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ media_type: "video" }),
    }),
  );
  const reg = await readJson(registered);
  if (!registered.ok || !reg.media_id || !reg.upload_url) {
    throw mcpError("pinterest_upload_failed", reg?.message || "Pinterest did not register the video upload.", 502);
  }
  const form = new FormData();
  for (const [name, value] of Object.entries(reg.upload_parameters || {})) form.append(name, String(value));
  form.append("file", new Blob([readFileSync(plan.filePath)], { type: plan.contentType }), basename(plan.filePath));
  // upload_url is a pre-signed bucket; no bearer token is sent to it.
  const uploaded = await fetchImpl(reg.upload_url, { method: "POST", body: form });
  if (!uploaded.ok) throw mcpError("pinterest_upload_failed", `Pinterest media bucket rejected the video (HTTP ${uploaded.status}).`, 502);

  for (let attempt = 0; attempt < MEDIA_POLL_LIMIT; attempt += 1) {
    const checked = await call((token) =>
      fetchImpl(`${API}/media/${encodeURIComponent(reg.media_id)}`, { headers: { authorization: `Bearer ${token}` } }),
    );
    const status = (await readJson(checked))?.status;
    if (checked.ok && status === "succeeded") return String(reg.media_id);
    if (status === "failed") throw mcpError("pinterest_upload_failed", "Pinterest could not process the video.", 502);
    await sleep(2000);
  }
  throw mcpError("pinterest_upload_failed", "Pinterest is still processing the video. Try again shortly.", 504);
}

export async function publishPinterestPin({
  post,
  connection,
  secrets,
  oauth,
  mediaRoot,
  fetchImpl = fetch,
  onSecrets,
  onNeedsReconnect,
  sleep = defaultSleep,
}) {
  let fresh = await ensureAccess({ secrets, oauth, fetchImpl, onSecrets });
  const plan = pinterestMediaPlan(post, mediaRoot);
  const budget = { used: false };
  const secretsRef = { current: fresh };
  const refresh = (current) => refreshAccess({ secrets: current, oauth, fetchImpl });
  const boardId = await resolveBoardId(connection, fetchImpl, budget, secretsRef, refresh, onSecrets, onNeedsReconnect);
  const call = async (send) => {
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
  let mediaSource;
  if (plan.kind === "video") {
    const mediaId = await uploadPinterestVideo({ plan, call, fetchImpl, sleep });
    mediaSource = { source_type: "video_id", media_id: mediaId, ...coverSource(post, mediaRoot) };
  } else if (plan.kind === "image_base64") {
    mediaSource = { source_type: "image_base64", content_type: plan.contentType, data: readFileSync(plan.filePath).toString("base64") };
  } else {
    mediaSource = { source_type: "image_url", url: plan.url };
  }
  const title = String(post.title || post.caption || "Pin").slice(0, 100);
  const description = String(post.description || post.caption || "").slice(0, 800);
  const link = /^https:\/\//i.test(String(post.link_url || "")) ? String(post.link_url) : undefined;

  const response = await call((token) =>
    fetchImpl(`${API}/pins`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ board_id: boardId, title, description, ...(link ? { link } : {}), media_source: mediaSource }),
    }),
  );
  const payload = await readJson(response);
  if (!response.ok || !payload.id) {
    throw mcpError("pinterest_publish_failed", payload?.message || "Pinterest pin create failed.", 502);
  }
  return {
    platform_post_id: String(payload.id),
    published_url: payload.link || null,
    media_kind: plan.kind,
    note: `Pinned to board ${boardId}.${plan.kind === "video" ? " Video pins may take a moment to finish processing." : ""}`,
  };
}
