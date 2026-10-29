import { readFileSync, statSync } from "node:fs";
import { mcpError } from "../errors.js";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { invalidGrantError, isInvalidGrantPayload, readJson, sendWithRefresh } from "./authRetry.js";

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

async function refreshAccess({ secrets, oauth, fetchImpl, now = Date.now() }) {
  if (!secrets.refresh_token) throw mcpError("tiktok_not_connected", "Reconnect TikTok.", 409);
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: oauth.clientKey,
      client_secret: oauth.clientSecret,
      grant_type: "refresh_token",
      refresh_token: secrets.refresh_token,
    }),
  });
  const payload = await readJson(response);
  if (isInvalidGrantPayload(payload)) {
    throw invalidGrantError("TikTok refresh token was revoked. Reconnect.");
  }
  const token = payload.access_token || payload.data?.access_token;
  if (!response.ok || !token) throw mcpError("tiktok_auth_failed", "TikTok needs to be connected again.", 502);
  return {
    ...secrets,
    access_token: token,
    refresh_token: payload.refresh_token || payload.data?.refresh_token || secrets.refresh_token,
    expires_at: new Date(now + (Number(payload.expires_in || payload.data?.expires_in) || 86400) * 1000).toISOString(),
  };
}

async function ensureAccess({ secrets, oauth, fetchImpl, now = Date.now() }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  return refreshAccess({ secrets, oauth, fetchImpl, now });
}

const API = "https://open.tiktokapis.com/v2/post/publish";
const MB = 1024 * 1024;
const MIN_CHUNK = 5 * MB;
const TARGET_CHUNK = 10 * MB;
const PRIVACY_LEVELS = new Set(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]);

/**
 * TikTok Media Transfer rules: files under 5 MB go whole; otherwise chunks are
 * 5-64 MB, total_chunk_count = floor(size / chunk_size), and the final chunk
 * absorbs the trailing bytes (up to 128 MB). 1-1000 chunks, sent in order.
 */
export function tiktokChunkPlan(size) {
  const total = Number(size);
  if (!Number.isFinite(total) || total <= 0) throw mcpError("tiktok_upload_failed", "The video file is empty.", 400);
  if (total > 4 * 1024 * MB) throw mcpError("tiktok_upload_failed", "TikTok accepts videos up to 4 GB.", 400);
  const chunkSize = total < MIN_CHUNK ? total : Math.min(total, TARGET_CHUNK);
  const count = Math.max(1, Math.floor(total / chunkSize));
  const ranges = [];
  for (let index = 0; index < count; index += 1) {
    const first = index * chunkSize;
    const last = index === count - 1 ? total - 1 : first + chunkSize - 1;
    ranges.push({ first, last });
  }
  return { video_size: total, chunk_size: chunkSize, total_chunk_count: count, ranges };
}

function tiktokError(payload, fallback) {
  const code = payload?.error?.code;
  if (code === "access_token_invalid") return mcpError("needs_reconnect", "TikTok sign-in expired. Reconnect TikTok.", 401);
  if (code === "scope_not_authorized") {
    return mcpError("needs_reconnect", "TikTok did not grant the posting permission. Reconnect TikTok and allow it.", 403);
  }
  if (code === "rate_limit_exceeded" || code === "spam_risk_too_many_posts") {
    return mcpError("rate_limited", payload?.error?.message || "TikTok rate limit reached.", 429);
  }
  return mcpError("tiktok_upload_failed", payload?.error?.message || fallback, 502);
}

async function authedJson({ url, body, budget, fresh, oauth, fetchImpl, onSecrets, onNeedsReconnect }) {
  const result = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh: (current) => refreshAccess({ secrets: current, oauth, fetchImpl }),
    onSecrets,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${current.access_token}`, "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify(body),
      }),
  });
  const payload = await readJson(result.response);
  return { ...result, payload };
}

/** Direct Post must read creator_info first and use one of its privacy options. */
export function chooseDirectPostInfo(post, creator) {
  const options = Array.isArray(creator?.privacy_level_options) ? creator.privacy_level_options : [];
  const wanted = String(post?.privacy_level || "").toUpperCase();
  let privacy = "";
  if (wanted) {
    if (!PRIVACY_LEVELS.has(wanted) || !options.includes(wanted)) {
      throw mcpError("tiktok_privacy_unavailable", `TikTok does not allow privacy ${wanted} for this account. Options: ${options.join(", ") || "none"}.`, 400);
    }
    privacy = wanted;
  } else if (options.includes("SELF_ONLY")) {
    privacy = "SELF_ONLY";
  } else {
    throw mcpError("tiktok_privacy_unavailable", "Choose a TikTok privacy level for this post.", 400);
  }
  const info = {
    title: String(post?.caption || post?.title || "").slice(0, 2200),
    privacy_level: privacy,
    disable_comment: Boolean(creator?.comment_disabled || post?.disable_comment),
    disable_duet: Boolean(creator?.duet_disabled || post?.disable_duet),
    disable_stitch: Boolean(creator?.stitch_disabled || post?.disable_stitch),
  };
  if (post?.ai_generated === true || post?.media_provenance?.ai_generated === true) info.is_aigc = true;
  if (post?.brand_content_toggle === true) info.brand_content_toggle = true;
  if (post?.brand_organic_toggle === true) info.brand_organic_toggle = true;
  return info;
}

/**
 * Upload a local video to TikTok. Default mode is "inbox" (draft: the creator
 * finishes in the TikTok app, scope video.upload). post.tiktok_mode === "direct"
 * uses Direct Post (scope video.publish); unaudited apps can post SELF_ONLY only.
 * Uses only the desk's own TikTok client key and secret.
 */
export async function publishTikTokFromFile({
  post,
  mediaRoot,
  secrets,
  oauth,
  fetchImpl = fetch,
  onSecrets,
  onNeedsReconnect,
}) {
  if (!oauth?.clientKey || !oauth?.clientSecret) {
    throw mcpError("oauth_not_configured", "TikTok needs this desk's own TikTok client key and secret.", 503);
  }
  const direct = post?.tiktok_mode === "direct";
  const filePath = resolveSafeMediaPath(post.media_path, mediaRoot);
  let fresh = await ensureAccess({ secrets, oauth, fetchImpl });
  if (onSecrets && fresh !== secrets) await onSecrets(fresh);
  const budget = { used: false };
  const plan = tiktokChunkPlan(statSync(filePath).size);
  const sourceInfo = {
    source: "FILE_UPLOAD",
    video_size: plan.video_size,
    chunk_size: plan.chunk_size,
    total_chunk_count: plan.total_chunk_count,
  };
  const common = { budget, oauth, fetchImpl, onSecrets, onNeedsReconnect };

  let body = { source_info: sourceInfo };
  let initUrl = `${API}/inbox/video/init/`;
  if (direct) {
    const creator = await authedJson({ ...common, fresh, url: `${API}/creator_info/query/`, body: {} });
    fresh = creator.secrets;
    if (!creator.response.ok || (creator.payload?.error?.code && creator.payload.error.code !== "ok")) {
      if (creator.payload?.error?.code === "access_token_invalid" && onNeedsReconnect) await onNeedsReconnect();
      throw tiktokError(creator.payload, "TikTok creator info could not be read.");
    }
    body = { post_info: chooseDirectPostInfo(post, creator.payload?.data || {}), source_info: sourceInfo };
    initUrl = `${API}/video/init/`;
  }

  const opened = await authedJson({ ...common, fresh, url: initUrl, body });
  fresh = opened.secrets;
  const uploadUrl = opened.payload.data?.upload_url;
  const publishId = opened.payload.data?.publish_id;
  if (!opened.response.ok || !uploadUrl || !publishId) {
    throw tiktokError(opened.payload, "TikTok did not start the upload.");
  }

  const bytes = readFileSync(filePath);
  for (const range of plan.ranges) {
    const chunk = bytes.subarray(range.first, range.last + 1);
    // upload_url is pre-signed; no bearer token is sent to it.
    const upload = await fetchImpl(uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": post.media_content_type || "video/mp4",
        "content-length": String(chunk.length),
        "content-range": `bytes ${range.first}-${range.last}/${plan.video_size}`,
      },
      body: chunk,
    });
    if (!upload.ok && upload.status !== 206) {
      throw mcpError("tiktok_upload_failed", `TikTok rejected video chunk ${range.first}-${range.last} (HTTP ${upload.status}).`, 502);
    }
  }

  if (direct) {
    return {
      platform_post_id: String(publishId),
      published_url: null,
      handoff: "tiktok_direct",
      note: "TikTok is processing the post. Check status with publish_id; unaudited apps post as private (SELF_ONLY).",
    };
  }
  return {
    platform_post_id: String(publishId),
    published_url: null,
    handoff: "tiktok_inbox",
    note: "Video is in the TikTok inbox for the creator to finish posting in the app.",
  };
}

// Back-compat name used by the engine.
export const publishTikTokInboxFromFile = publishTikTokFromFile;

/** POST /v2/post/publish/status/fetch/ for a publish_id. */
export async function fetchTikTokPublishStatus({ publishId, secrets, oauth, fetchImpl = fetch, onSecrets, onNeedsReconnect }) {
  const fresh = await ensureAccess({ secrets, oauth, fetchImpl });
  if (onSecrets && fresh !== secrets) await onSecrets(fresh);
  const result = await authedJson({
    budget: { used: false },
    fresh,
    oauth,
    fetchImpl,
    onSecrets,
    onNeedsReconnect,
    url: `${API}/status/fetch/`,
    body: { publish_id: String(publishId) },
  });
  if (!result.response.ok) throw tiktokError(result.payload, "TikTok post status could not be read.");
  const data = result.payload.data || {};
  return {
    status: String(data.status || "UNKNOWN"),
    fail_reason: data.fail_reason || null,
    post_ids: Array.isArray(data.publicaly_available_post_id) ? data.publicaly_available_post_id.map(String) : [],
  };
}
