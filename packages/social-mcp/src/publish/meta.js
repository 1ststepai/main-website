import { mcpError } from "../errors.js";

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
 * Meta Reels APIs expect a reachable media URL (not a raw local path).
 * Local MCP accepts media_url on the post for Instagram/Facebook publish.
 */
export async function publishMetaReel({
  post,
  platform,
  connection,
  secrets,
  fetchImpl = fetch,
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

  if (platform === "instagram") {
    const igId = connection.instagram_id;
    if (!igId) throw mcpError("instagram_not_connected", "No Instagram business account on this Meta connection.", 409);
    const create = await fetchImpl(`${META_GRAPH}/${igId}/media`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: mediaUrl,
        caption,
        access_token: token,
      }),
    });
    const created = await readJson(create);
    if (!create.ok || !created.id) {
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
    const publish = await fetchImpl(`${META_GRAPH}/${igId}/media_publish`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: created.id, access_token: token }),
    });
    const published = await readJson(publish);
    if (!publish.ok || !published.id) {
      throw mcpError("instagram_publish_failed", published?.error?.message || "Instagram publish failed.", 502);
    }
    return {
      platform_post_id: String(published.id),
      published_url: null,
    };
  }

  const pageId = connection.page_id;
  if (!pageId) throw mcpError("facebook_not_connected", "No Facebook Page on this Meta connection.", 409);
  const create = await fetchImpl(`${META_GRAPH}/${pageId}/video_reels`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      upload_phase: "start",
      access_token: token,
    }),
  });
  // Facebook Reels start/upload is multi-phase; for local MCP we use the simpler video edge when a URL is present.
  const video = await fetchImpl(`${META_GRAPH}/${pageId}/videos`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      file_url: mediaUrl,
      description: caption,
      published: String((post.privacy_status || "public") === "public"),
      access_token: token,
    }),
  });
  const payload = await readJson(video);
  if (!video.ok || !payload.id) {
    const startPayload = await readJson(create);
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
