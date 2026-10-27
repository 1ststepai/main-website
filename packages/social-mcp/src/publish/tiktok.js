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

export async function publishTikTokInboxFromFile({
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

  const opened = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh: (current) => refreshAccess({ secrets: current, oauth, fetchImpl }),
    onSecrets,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
        method: "POST",
        headers: {
          authorization: `Bearer ${current.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          source_info: {
            source: "FILE_UPLOAD",
            video_size: stat.size,
            chunk_size: stat.size,
            total_chunk_count: 1,
          },
        }),
      }),
  });
  fresh = opened.secrets;
  const init = opened.response;
  const initPayload = await readJson(init);
  const uploadUrl = initPayload.data?.upload_url;
  const publishId = initPayload.data?.publish_id;
  if (!init.ok || !uploadUrl || !publishId) {
    throw mcpError("tiktok_upload_failed", initPayload?.error?.message || "TikTok did not start the inbox upload.", 502);
  }

  const bytes = readFileSync(filePath);
  const uploaded = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh: (current) => refreshAccess({ secrets: current, oauth, fetchImpl }),
    onSecrets,
    onNeedsReconnect,
    send: () =>
      fetchImpl(uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": post.media_content_type || "video/mp4",
          "content-length": String(bytes.length),
          "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
        },
        body: bytes,
      }),
  });
  const upload = uploaded.response;
  if (!upload.ok) {
    throw mcpError("tiktok_upload_failed", "TikTok rejected the video upload.", 502);
  }

  return {
    platform_post_id: String(publishId),
    published_url: null,
    handoff: "tiktok_inbox",
    note: "Video is in the TikTok inbox for the creator to finish posting in the app.",
  };
}
