import { THUMBNAIL_MAX_BYTES, YOUTUBE_CHUNK_BYTES } from "../constants.js";
import { socialError } from "../errors.js";

const UPLOAD_HOSTS = new Set(["www.googleapis.com", "googleapis.com", "youtube.googleapis.com"]);
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function nextChunkRange(offset, total, chunkBytes = YOUTUBE_CHUNK_BYTES) {
  if (!Number.isInteger(offset) || !Number.isInteger(total) || offset < 0 || total <= 0) {
    throw socialError(400, "invalid_video", "Video size is invalid.");
  }
  if (chunkBytes % (256 * 1024) !== 0) {
    throw socialError(500, "invalid_chunk", "Chunk size is invalid.");
  }
  if (offset >= total) return null;
  const size = Math.min(chunkBytes, total - offset);
  return { start: offset, end: offset + size - 1, size };
}

function header(response, name) {
  if (!response?.headers) return "";
  if (typeof response.headers.get === "function") return response.headers.get(name) || "";
  const key = Object.keys(response.headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? String(response.headers[key] || "") : "";
}

async function readBody(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: String(text).slice(0, 180) };
  }
}

function googleMessage(payload, status) {
  const message = payload?.error?.message || payload?.error_description || payload?.raw || `YouTube request failed (${status})`;
  return String(message).replace(/ya29\.[A-Za-z0-9_\-]+/g, "[redacted]").slice(0, 300);
}

function assertSessionUrl(location) {
  let url;
  try {
    url = new URL(location);
  } catch {
    throw socialError(502, "youtube_upload_failed", "YouTube did not start the upload.");
  }
  if (url.protocol !== "https:" || !UPLOAD_HOSTS.has(url.hostname)) {
    throw socialError(502, "youtube_upload_failed", "YouTube returned an unexpected upload location.");
  }
  return url.toString();
}

async function ensureAccess({ secrets, oauth, fetchImpl, now }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  if (!secrets.refresh_token) {
    throw socialError(409, "youtube_not_connected", "YouTube needs to be connected again.");
  }
  if (!oauth?.clientId || !oauth?.clientSecret) {
    throw socialError(503, "social_not_configured", "Google OAuth is not configured.");
  }
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
  const payload = await readBody(response);
  if (!response.ok || !payload.access_token) {
    throw socialError(502, "youtube_auth_failed", googleMessage(payload, response.status));
  }
  return {
    ...secrets,
    access_token: payload.access_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
}

async function startSession({ post, accessToken, total, contentType, fetchImpl }) {
  const endpoint = new URL("https://www.googleapis.com/upload/youtube/v3/videos");
  endpoint.searchParams.set("uploadType", "resumable");
  endpoint.searchParams.set("part", "snippet,status");
  const response = await fetchImpl(endpoint, {
    method: "POST",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=utf-8",
      "x-upload-content-length": String(total),
      "x-upload-content-type": contentType,
    },
    body: JSON.stringify({
      snippet: {
        title: post.title,
        description: post.description || "",
        tags: post.tags || [],
        categoryId: "22",
      },
      status: {
        privacyStatus: post.privacy_status || "private",
        selfDeclaredMadeForKids: false,
      },
    }),
  });
  const location = header(response, "location");
  if (!location) {
    const payload = await readBody(response);
    throw socialError(502, "youtube_upload_failed", googleMessage(payload, response.status));
  }
  return assertSessionUrl(location);
}

async function probeSession(sessionUri, accessToken, total, fetchImpl) {
  const response = await fetchImpl(sessionUri, {
    method: "PUT",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-length": "0",
      "content-range": `bytes */${total}`,
    },
  });
  if (response.status === 200 || response.status === 201) {
    const payload = await readBody(response);
    return { done: true, videoId: payload.id || null, next: total };
  }
  if (response.status === 308) {
    const range = header(response, "range");
    const match = /bytes=(\d+)-(\d+)/.exec(range);
    return { done: false, next: match ? Number(match[2]) + 1 : 0, videoId: null };
  }
  const payload = await readBody(response);
  throw socialError(502, "youtube_upload_failed", googleMessage(payload, response.status));
}

async function putChunk({ sessionUri, accessToken, bytes, start, end, total, contentType, fetchImpl }) {
  const response = await fetchImpl(sessionUri, {
    method: "PUT",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-length": String(bytes.length),
      "content-range": `bytes ${start}-${end}/${total}`,
      "content-type": contentType,
    },
    body: bytes,
  });
  if (response.status === 200 || response.status === 201) {
    const payload = await readBody(response);
    if (!payload.id) throw socialError(502, "youtube_upload_failed", "YouTube did not return a video id.");
    return { done: true, videoId: payload.id, next: total };
  }
  if (response.status === 308) {
    const range = header(response, "range");
    const match = /bytes=(\d+)-(\d+)/.exec(range);
    return { done: false, videoId: null, next: match ? Number(match[2]) + 1 : end + 1 };
  }
  const payload = await readBody(response);
  throw socialError(502, "youtube_upload_failed", googleMessage(payload, response.status));
}

async function setThumbnail({ videoId, accessToken, bytes, contentType, fetchImpl }) {
  const endpoint = new URL("https://www.googleapis.com/upload/youtube/v3/thumbnails/set");
  endpoint.searchParams.set("videoId", videoId);
  endpoint.searchParams.set("uploadType", "media");
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": contentType || "image/jpeg",
      "content-length": String(bytes.length),
    },
    body: bytes,
  });
  if (!response.ok) {
    const payload = await readBody(response);
    throw socialError(502, "youtube_thumbnail_failed", googleMessage(payload, response.status));
  }
}

export async function publishYouTubeSlice({
  post,
  secrets,
  job = null,
  readRange,
  fetchImpl,
  oauth,
  now = Date.now(),
  deadline = now + 8000,
  chunkBytes = YOUTUBE_CHUNK_BYTES,
}) {
  if (!post.video_asset?.pathname || !Number.isInteger(post.video_asset.size) || post.video_asset.size <= 0) {
    throw socialError(400, "invalid_video", "Video file is missing.");
  }
  const currentSecrets = await ensureAccess({ secrets, oauth, fetchImpl, now });
  const total = post.video_asset.size;
  const contentType = post.video_asset.content_type || "video/mp4";
  const state = job ? { ...job, total_bytes: total } : {
    phase: "video",
    next_byte: 0,
    total_bytes: total,
    session_uri: null,
    video_id: null,
  };
  const startedAt = Date.now();
  const budgetMs = Math.max(0, deadline - now);
  const timeLeft = () => Date.now() - startedAt < budgetMs;

  if (state.phase === "done" && state.video_id) {
    return {
      done: true,
      secrets: currentSecrets,
      job: state,
      publishedUrl: `https://www.youtube.com/watch?v=${state.video_id}`,
    };
  }

  if (state.phase !== "thumbnail" && state.phase !== "done") {
    if (!state.session_uri) {
      state.session_uri = await startSession({
        post,
        accessToken: currentSecrets.access_token,
        total,
        contentType,
        fetchImpl,
      });
      state.next_byte = 0;
      state.phase = "video";
    } else {
      const probe = await probeSession(state.session_uri, currentSecrets.access_token, total, fetchImpl);
      state.next_byte = probe.next;
      if (probe.done) {
        state.video_id = probe.videoId || state.video_id;
        state.phase = "thumbnail";
      }
    }

    while (state.phase === "video" && timeLeft()) {
      const range = nextChunkRange(state.next_byte, total, chunkBytes);
      if (!range) {
        state.phase = "thumbnail";
        break;
      }
      const bytes = await readRange(post.video_asset.pathname, range.start, range.end);
      if (!bytes || bytes.length !== range.size) {
        throw socialError(502, "blob_short_read", "The video file ended before the expected byte.");
      }
      const uploaded = await putChunk({
        sessionUri: state.session_uri,
        accessToken: currentSecrets.access_token,
        bytes,
        start: range.start,
        end: range.end,
        total,
        contentType,
        fetchImpl,
      });
      state.next_byte = uploaded.next;
      if (uploaded.done) {
        state.video_id = uploaded.videoId;
        state.phase = "thumbnail";
        break;
      }
    }
  }

  if (state.phase === "thumbnail" && timeLeft()) {
    if (!state.video_id) throw socialError(502, "youtube_upload_failed", "YouTube did not return a video id.");
    if (post.thumbnail_asset?.pathname) {
      const thumbSize = post.thumbnail_asset.size;
      if (!Number.isInteger(thumbSize) || thumbSize <= 0 || thumbSize > THUMBNAIL_MAX_BYTES) {
        throw socialError(400, "invalid_asset", "Thumbnail is missing or too large.");
      }
      const bytes = await readRange(post.thumbnail_asset.pathname, 0, thumbSize - 1);
      await setThumbnail({
        videoId: state.video_id,
        accessToken: currentSecrets.access_token,
        bytes,
        contentType: post.thumbnail_asset.content_type,
        fetchImpl,
      });
    }
    state.phase = "done";
    state.next_byte = total;
    return {
      done: true,
      secrets: currentSecrets,
      job: state,
      publishedUrl: `https://www.youtube.com/watch?v=${state.video_id}`,
    };
  }

  return { done: false, secrets: currentSecrets, job: state, publishedUrl: null };
}
