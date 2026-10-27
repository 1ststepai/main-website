import { mcpError } from "../errors.js";
import { sendWithRefresh } from "./authRetry.js";

const META_GRAPH = "https://graph.facebook.com/v22.0";

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
 * Meta page tokens are not refresh tokens. A 401 marks the connection
 * needs_reconnect and does not retry.
 */
function metaSend({ budget, secrets, onNeedsReconnect, fetchImpl, url, params }) {
  return sendWithRefresh({
    budget,
    secrets,
    refresh: null,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...params, access_token: current.page_access_token }),
      }),
  });
}

/**
 * Meta Reels APIs expect a reachable media URL (not a raw local path).
 * Local MCP accepts media_url on the post for Instagram/Facebook publish.
 */
export async function publishMetaReel({
  post,
  platform,
  connection,
  secrets,
  fetchImpl = fetch,
  onNeedsReconnect,
}) {
  const mediaUrl = String(post.media_url || "").trim();
  if (!/^https:\/\//i.test(mediaUrl)) {
    throw mcpError(
      "media_url_required",
      "Instagram/Facebook publish needs a public https media_url on the post (Meta does not accept a bare local file path).",
      400,
    );
  }
  const caption = String(post.caption || post.description || post.title || "").slice(0, 2200);
  const token = secrets.page_access_token;
  if (!token) throw mcpError("meta_not_connected", "Reconnect Meta.", 409);
  const budget = { used: false };

  if (platform === "instagram") {
    const igId = connection.instagram_id;
    if (!igId) throw mcpError("instagram_not_connected", "No Instagram business account on this Meta connection.", 409);
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
    const created = await readJson(createdSent.response);
    if (!createdSent.response.ok || !created.id) {
      throw mcpError("instagram_publish_failed", created?.error?.message || "Instagram container create failed.", 502);
    }
    if ((post.privacy_status || "public") !== "public") {
      return {
        platform_post_id: String(created.id),
        published_url: null,
        handoff: "instagram_container",
        note: "Container created. media_publish runs only when privacy_status is public.",
      };
    }
    const publishSent = await metaSend({
      budget,
      secrets: createdSent.secrets,
      onNeedsReconnect,
      fetchImpl,
      url: `${META_GRAPH}/${igId}/media_publish`,
      params: { creation_id: created.id },
    });
    const published = await readJson(publishSent.response);
    if (!publishSent.response.ok || !published.id) {
      throw mcpError("instagram_publish_failed", published?.error?.message || "Instagram publish failed.", 502);
    }
    return {
      platform_post_id: String(published.id),
      published_url: null,
    };
  }

  const pageId = connection.page_id;
  if (!pageId) throw mcpError("facebook_not_connected", "No Facebook Page on this Meta connection.", 409);
  const createSent = await metaSend({
    budget,
    secrets,
    onNeedsReconnect,
    fetchImpl,
    url: `${META_GRAPH}/${pageId}/video_reels`,
    params: { upload_phase: "start" },
  });
  const videoSent = await metaSend({
    budget,
    secrets: createSent.secrets,
    onNeedsReconnect,
    fetchImpl,
    url: `${META_GRAPH}/${pageId}/videos`,
    params: {
      file_url: mediaUrl,
      description: caption,
      published: String((post.privacy_status || "public") === "public"),
    },
  });
  const payload = await readJson(videoSent.response);
  if (!videoSent.response.ok || !payload.id) {
    const startPayload = await readJson(createSent.response);
    throw mcpError(
      "facebook_publish_failed",
      payload?.error?.message || startPayload?.error?.message || "Facebook video publish failed.",
      502,
    );
  }
  return {
    platform_post_id: String(payload.id),
    published_url: `https://www.facebook.com/watch/?v=${payload.id}`,
    handoff: (post.privacy_status || "public") === "public" ? null : "facebook_unpublished",
  };
}
