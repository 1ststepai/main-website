import { createReadStream, statSync } from "node:fs";
import { mcpError } from "../errors.js";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { readJson, sendWithRefresh } from "./authRetry.js";
import { mapPlatformError } from "./outcome.js";

const META_GRAPH = "https://graph.facebook.com/v22.0";
const CHUNK = 8 * 1024 * 1024;
const IG_POLL_LIMIT = 8;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Meta page tokens are not refresh tokens. A 401 marks the connection
 * needs_reconnect and does not retry.
 */
function metaSend({ budget, secrets, onNeedsReconnect, fetchImpl, url, params, method = "POST" }) {
  return sendWithRefresh({
    budget,
    secrets,
    refresh: null,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl(url, {
        method,
        headers: method === "GET" ? {} : { "content-type": "application/x-www-form-urlencoded" },
        body:
          method === "GET"
            ? undefined
            : new URLSearchParams({ ...params, access_token: current.page_access_token }),
      }),
  });
}

function readSlice(filePath, start, end) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = createReadStream(filePath, { start, end });
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function requireOk(sent, fallback) {
  if (sent.response?.ok) return readJson(sent.response);
  const payload = await readJson(sent.response);
  throw mapPlatformError(sent.response, payload, fallback);
}

async function uploadBinary({ url, filePath, secrets, fetchImpl, onNeedsReconnect, budget }) {
  const stat = statSync(filePath);
  if (!stat.size) throw mcpError("invalid_media", "The video file is empty.", 400);
  let offset = 0;
  let last = {};
  while (offset < stat.size) {
    const end = Math.min(offset + CHUNK, stat.size) - 1;
    const body = await readSlice(filePath, offset, end);
    const sent = await sendWithRefresh({
      budget,
      secrets,
      refresh: null,
      onNeedsReconnect,
      send: (current) =>
        fetchImpl(url, {
          method: "POST",
          headers: {
            authorization: `OAuth ${current.page_access_token}`,
            offset: String(offset),
            file_size: String(stat.size),
            "content-type": "application/octet-stream",
            "content-length": String(body.length),
          },
          body,
        }),
    });
    last = await requireOk(sent, { code: "meta_upload_failed", message: "Meta rejected the video bytes." });
    const transferred = Number(last.bytes_transferred ?? last.offset);
    offset = Number.isFinite(transferred) && transferred > offset ? transferred : end + 1;
  }
  return last;
}

async function pollInstagramContainer({ containerId, secrets, fetchImpl, onNeedsReconnect, budget, sleep }) {
  for (let attempt = 0; attempt < IG_POLL_LIMIT; attempt += 1) {
    const sent = await metaSend({
      budget,
      secrets,
      onNeedsReconnect,
      fetchImpl,
      method: "GET",
      url: `${META_GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(secrets.page_access_token)}`,
      params: {},
    });
    if (!sent.response?.ok) {
      const failure = await readJson(sent.response);
      const mapped = mapPlatformError(sent.response, failure, {
        code: "instagram_publish_failed",
        message: "Instagram did not report container status.",
      });
      if (mapped.code === "rate_limited") throw mapped;
      throw mcpError("instagram_publish_failed", mapped.message, 502);
    }
    const payload = await readJson(sent.response);
    const code = String(payload.status_code || "");
    if (code === "FINISHED" || code === "PUBLISHED") return payload;
    if (code === "ERROR" || code === "EXPIRED") {
      throw mcpError(
        "instagram_publish_failed",
        "Instagram could not process the video. It was not published.",
        502,
      );
    }
    if (attempt === IG_POLL_LIMIT - 1) {
      throw mcpError(
        "instagram_processing",
        "Instagram is still processing the video. It was not published. Publish again after processing finishes.",
        409,
      );
    }
    await sleep(1500);
  }
  throw mcpError("instagram_processing", "Instagram is still processing the video. It was not published.", 409);
}

async function publishInstagram({ post, connection, secrets, mediaRoot, fetchImpl, onNeedsReconnect, budget, sleep }) {
  const igId = connection.instagram_id;
  if (!igId) throw mcpError("instagram_not_connected", "No Instagram business account on this Meta connection.", 409);
  if ((post.privacy_status || "private") !== "public") {
    throw mcpError(
      "instagram_public_only",
      "Instagram Reels publish is public. Set privacy to public only when you mean to publish the Reel. PostPath did not upload the file.",
      400,
    );
  }
  const caption = String(post.caption || post.description || post.title || "").slice(0, 2200);
  const localPath = post.media_path ? resolveSafeMediaPath(post.media_path, mediaRoot) : "";
  let containerId = "";

  if (localPath) {
    const createdSent = await metaSend({
      budget,
      secrets,
      onNeedsReconnect,
      fetchImpl,
      url: `${META_GRAPH}/${igId}/media`,
      params: {
        media_type: "REELS",
        upload_type: "resumable",
        caption,
      },
    });
    const created = await requireOk(createdSent, {
      code: "instagram_publish_failed",
      message: "Instagram did not open a resumable upload.",
    });
    if (!created.id || !created.uri) {
      throw mcpError("instagram_publish_failed", "Instagram did not return an upload URI.", 502);
    }
    containerId = String(created.id);
    await uploadBinary({
      url: created.uri,
      filePath: localPath,
      secrets: createdSent.secrets,
      fetchImpl,
      onNeedsReconnect,
      budget,
    });
    secrets = createdSent.secrets;
  } else {
    const mediaUrl = String(post.media_url || "").trim();
    if (!/^https:\/\//i.test(mediaUrl)) {
      throw mcpError(
        "media_required",
        "Instagram needs a video file saved in PostPath, or a public https media_url.",
        400,
      );
    }
    const createdSent = await metaSend({
      budget,
      secrets,
      onNeedsReconnect,
      fetchImpl,
      url: `${META_GRAPH}/${igId}/media`,
      params: {
        media_type: "REELS",
        video_url: mediaUrl,
        caption,
      },
    });
    const created = await requireOk(createdSent, {
      code: "instagram_publish_failed",
      message: "Instagram container create failed.",
    });
    if (!created.id) {
      throw mcpError("instagram_publish_failed", "Instagram did not return a container id.", 502);
    }
    containerId = String(created.id);
    secrets = createdSent.secrets;
  }

  await pollInstagramContainer({ containerId, secrets, fetchImpl, onNeedsReconnect, budget, sleep });
  const publishSent = await metaSend({
    budget,
    secrets,
    onNeedsReconnect,
    fetchImpl,
    url: `${META_GRAPH}/${igId}/media_publish`,
    params: { creation_id: containerId },
  });
  const published = await requireOk(publishSent, {
    code: "instagram_publish_failed",
    message: "Instagram publish failed.",
  });
  if (!published.id) throw mcpError("instagram_publish_failed", "Instagram did not return a media id.", 502);
  return {
    platform_post_id: String(published.id),
    published_url: null,
    privacy_status: "public",
    result_source: "platform",
    note: "Instagram published the Reel. Instagram content publishing has no private mode, so this Reel is public.",
  };
}

async function publishFacebook({ post, connection, secrets, mediaRoot, fetchImpl, onNeedsReconnect, budget }) {
  const pageId = connection.page_id;
  if (!pageId) throw mcpError("facebook_not_connected", "No Facebook Page on this Meta connection.", 409);
  const caption = String(post.caption || post.description || post.title || "").slice(0, 2200);
  const isPublic = (post.privacy_status || "private") === "public";
  const localPath = post.media_path ? resolveSafeMediaPath(post.media_path, mediaRoot) : "";

  if (localPath) {
    const startSent = await metaSend({
      budget,
      secrets,
      onNeedsReconnect,
      fetchImpl,
      url: `${META_GRAPH}/${pageId}/video_reels`,
      params: { upload_phase: "start" },
    });
    const started = await requireOk(startSent, {
      code: "facebook_publish_failed",
      message: "Facebook did not start the Reel upload.",
    });
    if (!started.video_id || !started.upload_url) {
      throw mcpError("facebook_publish_failed", "Facebook did not return an upload URL.", 502);
    }
    await uploadBinary({
      url: started.upload_url,
      filePath: localPath,
      secrets: startSent.secrets,
      fetchImpl,
      onNeedsReconnect,
      budget,
    });
    const videoState = isPublic ? "PUBLISHED" : "DRAFT";
    const finishSent = await metaSend({
      budget,
      secrets: startSent.secrets,
      onNeedsReconnect,
      fetchImpl,
      url: `${META_GRAPH}/${pageId}/video_reels`,
      params: {
        upload_phase: "finish",
        video_id: String(started.video_id),
        video_state: videoState,
        description: caption,
        title: String(post.title || "").slice(0, 255),
      },
    });
    await requireOk(finishSent, {
      code: "facebook_publish_failed",
      message: "Facebook did not finish the Reel upload.",
    });
    return {
      platform_post_id: String(started.video_id),
      published_url: isPublic ? `https://www.facebook.com/reel/${started.video_id}` : null,
      privacy_status: isPublic ? "public" : "private",
      handoff: isPublic ? null : "facebook_unpublished",
      result_source: "platform",
      note: isPublic
        ? "Facebook published the Reel on the Page."
        : "Facebook stored the Reel as a Page draft. It is not public.",
    };
  }

  const mediaUrl = String(post.media_url || "").trim();
  if (!/^https:\/\//i.test(mediaUrl)) {
    throw mcpError(
      "media_required",
      "Facebook needs a video file saved in PostPath, or a public https media_url.",
      400,
    );
  }
  const videoSent = await metaSend({
    budget,
    secrets,
    onNeedsReconnect,
    fetchImpl,
    url: `${META_GRAPH}/${pageId}/videos`,
    params: {
      file_url: mediaUrl,
      description: caption,
      published: String(isPublic),
    },
  });
  const payload = await requireOk(videoSent, {
    code: "facebook_publish_failed",
    message: "Facebook video publish failed.",
  });
  if (!payload.id) throw mcpError("facebook_publish_failed", "Facebook did not return a video id.", 502);
  return {
    platform_post_id: String(payload.id),
    published_url: isPublic ? `https://www.facebook.com/watch/?v=${payload.id}` : null,
    privacy_status: isPublic ? "public" : "private",
    handoff: isPublic ? null : "facebook_unpublished",
    result_source: "platform",
    note: isPublic
      ? "Facebook published the video on the Page."
      : "Facebook stored the video as unpublished. It is not public.",
  };
}

export async function publishMetaReel({
  post,
  platform,
  connection,
  secrets,
  mediaRoot,
  fetchImpl = fetch,
  onNeedsReconnect,
  sleep = defaultSleep,
}) {
  const token = secrets?.page_access_token;
  if (!token) throw mcpError("meta_not_connected", "Reconnect Meta.", 409);
  const budget = { used: false };
  if (platform === "instagram") {
    return publishInstagram({ post, connection, secrets, mediaRoot, fetchImpl, onNeedsReconnect, budget, sleep });
  }
  if (platform === "facebook") {
    return publishFacebook({ post, connection, secrets, mediaRoot, fetchImpl, onNeedsReconnect, budget });
  }
  throw mcpError("unsupported_platform", "Meta publish supports facebook and instagram.", 400);
}
