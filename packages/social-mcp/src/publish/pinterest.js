import { mcpError } from "../errors.js";

async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function resolveBoardId(accessToken, connection, fetchImpl) {
  if (connection.board_id) return String(connection.board_id);
  const response = await fetchImpl("https://api.pinterest.com/v5/boards?page_size=1", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJson(response);
  const board = payload.items?.[0];
  if (!response.ok || !board?.id) {
    throw mcpError("pinterest_board_required", "Create a Pinterest board (or reconnect) before publishing pins.", 409);
  }
  return String(board.id);
}

export async function publishPinterestPin({ post, connection, secrets, fetchImpl = fetch }) {
  const token = secrets.access_token;
  if (!token) throw mcpError("pinterest_not_connected", "Reconnect Pinterest.", 409);
  const mediaUrl = String(post.media_url || "").trim();
  if (!/^https:\/\//i.test(mediaUrl)) {
    throw mcpError("media_url_required", "Pinterest pins need a public https media_url.", 400);
  }
  const boardId = await resolveBoardId(token, connection, fetchImpl);
  const title = String(post.title || post.caption || "Pin").slice(0, 100);
  const description = String(post.description || post.caption || "").slice(0, 800);

  const response = await fetchImpl("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      board_id: boardId,
      title,
      description,
      media_source: {
        source_type: "image_url",
        url: mediaUrl,
      },
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.id) {
    throw mcpError("pinterest_publish_failed", payload?.message || "Pinterest pin create failed.", 502);
  }
  return {
    platform_post_id: String(payload.id),
    published_url: payload.link || null,
    note: `Pinned to board ${boardId}.`,
  };
}
