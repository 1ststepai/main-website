import { mcpError } from "../errors.js";

const THREADS_GRAPH = "https://graph.threads.net/v1.0";

async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function publishThreadsPost({ post, connection, secrets, fetchImpl = fetch }) {
  const token = secrets.access_token;
  if (!token) throw mcpError("threads_not_connected", "Reconnect Threads.", 409);
  const userId = connection.threads_user_id || "me";
  const text = String(post.caption || post.description || post.title || "").slice(0, 500);
  if (!text && !post.media_url) {
    throw mcpError("invalid_post", "Threads posts need caption text and/or media_url.", 400);
  }

  const createParams = new URLSearchParams({
    media_type: post.media_url ? "IMAGE" : "TEXT",
    text,
    access_token: token,
  });
  if (post.media_url) {
    if (!/^https:\/\//i.test(String(post.media_url))) {
      throw mcpError("media_url_required", "Threads image posts need a public https media_url.", 400);
    }
    createParams.set("image_url", String(post.media_url));
  }

  const create = await fetchImpl(`${THREADS_GRAPH}/${userId}/threads`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: createParams,
  });
  const created = await readJson(create);
  if (!create.ok || !created.id) {
    throw mcpError("threads_publish_failed", created?.error?.message || "Threads container create failed.", 502);
  }

  const publish = await fetchImpl(`${THREADS_GRAPH}/${userId}/threads_publish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      creation_id: created.id,
      access_token: token,
    }),
  });
  const published = await readJson(publish);
  if (!publish.ok || !published.id) {
    throw mcpError("threads_publish_failed", published?.error?.message || "Threads publish failed.", 502);
  }
  return {
    platform_post_id: String(published.id),
    published_url: null,
    note: "Threads post published.",
  };
}
