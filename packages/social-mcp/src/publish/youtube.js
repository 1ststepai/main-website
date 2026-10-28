import { createReadStream, statSync } from "node:fs";
import { mcpError } from "../errors.js";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { invalidGrantError, isInvalidGrantPayload, readJson, sendWithRefresh } from "./authRetry.js";
import { mapPlatformError } from "./outcome.js";

const PRIVACY = new Set(["private", "unlisted", "public"]);

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHUNK = 2 * 1024 * 1024;

async function refreshAccess({ secrets, oauth, fetchImpl, now = Date.now() }) {
  if (!secrets.refresh_token) throw mcpError("youtube_not_connected", "Reconnect YouTube.", 409);
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: secrets.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const payload = await readJson(response);
  if (isInvalidGrantPayload(payload)) {
    throw invalidGrantError("YouTube refresh token was revoked. Reconnect.");
  }
  if (!response.ok || !payload.access_token) {
    throw mcpError("youtube_auth_failed", "YouTube needs to be connected again.", 502);
  }
  return {
    ...secrets,
    access_token: payload.access_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
}

async function ensureAccess({ secrets, oauth, fetchImpl, now = Date.now() }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  return refreshAccess({ secrets, oauth, fetchImpl, now });
}

export async function publishYouTubeFromFile({
  post,
  mediaRoot,
  secrets,
  oauth,
  fetchImpl = fetch,
  onSecrets,
  onNeedsReconnect,
}) {
  const filePath = resolveSafeMediaPath(post.media_path, mediaRoot);
  let fresh = await ensureAccess({ secrets, oauth, fetchImpl });
  if (onSecrets && fresh !== secrets) await onSecrets(fresh);
  const budget = { used: false };

  const stat = statSync(filePath);
  if (!stat.size) throw mcpError("invalid_media", "The video file is empty.", 400);
  const privacy = PRIVACY.has(post.privacy_status) ? post.privacy_status : "private";
  const tags = Array.isArray(post.tags)
    ? post.tags.map((tag) => String(tag).trim().slice(0, 40)).filter(Boolean).slice(0, 30)
    : [];
  const snippet = {
    title: String(post.title || "Untitled").slice(0, 100),
    description: String(post.description || post.caption || "").slice(0, 5000),
    categoryId: "22",
  };
  if (tags.length) snippet.tags = tags;
  const metadata = {
    snippet,
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: false,
      embeddable: privacy === "public",
      notifySubscribers: privacy === "public",
    },
  };

  const opened = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh: (current) => refreshAccess({ secrets: current, oauth, fetchImpl }),
    onSecrets,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          authorization: `Bearer ${current.access_token}`,
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": post.media_content_type || "video/mp4",
          "x-upload-content-length": String(stat.size),
        },
        body: JSON.stringify(metadata),
      }),
  });
  fresh = opened.secrets;
  const init = opened.response;
  const location = init.headers?.get?.("location") || "";
  if (!init.ok || !location) {
    const payload = await readJson(init);
    throw mapPlatformError(init, payload, {
      code: "youtube_upload_failed",
      message: "YouTube did not start the upload.",
    });
  }

  let offset = 0;
  let finalPayload = null;
  while (offset < stat.size) {
    const end = Math.min(offset + CHUNK, stat.size) - 1;
    const size = end - offset + 1;
    const stream = createReadStream(filePath, { start: offset, end });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const uploaded = await sendWithRefresh({
      budget,
      secrets: fresh,
      refresh: (current) => refreshAccess({ secrets: current, oauth, fetchImpl }),
      onSecrets,
      onNeedsReconnect,
      send: (current) =>
        fetchImpl(location, {
          method: "PUT",
          headers: {
            authorization: `Bearer ${current.access_token}`,
            "content-length": String(size),
            "content-type": post.media_content_type || "video/mp4",
            "content-range": `bytes ${offset}-${end}/${stat.size}`,
          },
          body,
        }),
    });
    fresh = uploaded.secrets;
    const response = uploaded.response;
    if (response.status === 308) {
      offset = end + 1;
      continue;
    }
    finalPayload = await readJson(response);
    if (!response.ok || !finalPayload.id) {
      throw mapPlatformError(response, finalPayload, {
        code: "youtube_upload_failed",
        message: "YouTube upload failed.",
      });
    }
    break;
  }

  if (!finalPayload?.id) {
    throw mcpError("youtube_upload_failed", "YouTube did not return a video id.", 502);
  }

  const privacyStatus = finalPayload.status?.privacyStatus || privacy;
  return {
    platform_post_id: finalPayload.id,
    published_url: `https://www.youtube.com/watch?v=${finalPayload.id}`,
    privacy_status: privacyStatus,
    result_source: "platform",
    note:
      privacyStatus === "private"
        ? "YouTube accepted the video as private. A vertical file of 3 minutes or less is what YouTube classifies as a Short after processing. PostPath does not crop or transcode it."
        : "YouTube accepted the video. Confirm the privacy in YouTube Studio. An unverified app can be limited to private uploads.",
  };
}
