import { createReadStream, statSync } from "node:fs";
import { mcpError } from "../errors.js";
import { resolveSafeMediaPath } from "../mediaPath.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHUNK = 2 * 1024 * 1024;

async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: String(text).slice(0, 180) };
  }
}

async function ensureAccess({ secrets, oauth, fetchImpl, now = Date.now() }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
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
  if (!response.ok || !payload.access_token) {
    throw mcpError("youtube_auth_failed", "YouTube needs to be connected again.", 502);
  }
  return {
    ...secrets,
    access_token: payload.access_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
}

export async function publishYouTubeFromFile({
  post,
  mediaRoot,
  secrets,
  oauth,
  fetchImpl = fetch,
  onSecrets,
}) {
  const filePath = resolveSafeMediaPath(post.media_path, mediaRoot);
  const fresh = await ensureAccess({ secrets, oauth, fetchImpl });
  if (onSecrets && fresh !== secrets) await onSecrets(fresh);

  const stat = statSync(filePath);

  const metadata = {
    snippet: {
      title: String(post.title || "Untitled").slice(0, 100),
      description: String(post.description || post.caption || "").slice(0, 5000),
      tags: Array.isArray(post.tags) ? post.tags.slice(0, 30) : [],
      categoryId: "22",
    },
    status: {
      privacyStatus: post.privacy_status || "private",
      selfDeclaredMadeForKids: false,
    },
  };

  const init = await fetchImpl(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${fresh.access_token}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": post.media_content_type || "video/mp4",
        "x-upload-content-length": String(stat.size),
      },
      body: JSON.stringify(metadata),
    },
  );
  const location = init.headers?.get?.("location") || "";
  if (!init.ok || !location) {
    const payload = await readJson(init);
    throw mcpError("youtube_upload_failed", payload?.error?.message || "YouTube did not start the upload.", 502);
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
    const response = await fetchImpl(location, {
      method: "PUT",
      headers: {
        "content-length": String(size),
        "content-type": post.media_content_type || "video/mp4",
        "content-range": `bytes ${offset}-${end}/${stat.size}`,
      },
      body,
    });
    if (response.status === 308) {
      offset = end + 1;
      continue;
    }
    finalPayload = await readJson(response);
    if (!response.ok || !finalPayload.id) {
      throw mcpError("youtube_upload_failed", finalPayload?.error?.message || "YouTube upload failed.", 502);
    }
    break;
  }

  return {
    platform_post_id: finalPayload.id,
    published_url: `https://www.youtube.com/watch?v=${finalPayload.id}`,
    privacy_status: finalPayload.status?.privacyStatus || post.privacy_status || "private",
  };
}
