import { mcpError } from "../errors.js";
import { invalidGrantError, isInvalidGrantPayload, sendWithRefresh } from "./authRetry.js";

const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";

async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function refreshAccess({ secrets, oauth, fetchImpl, now = Date.now() }) {
  if (!secrets.refresh_token || !oauth?.clientId || !oauth?.clientSecret) {
    throw mcpError("pinterest_not_connected", "Reconnect Pinterest.", 409);
  }
  const basic = Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString("base64");
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: secrets.refresh_token,
    }),
  });
  const payload = await readJson(response);
  if (isInvalidGrantPayload(payload)) {
    throw invalidGrantError("Pinterest refresh token was revoked. Reconnect.");
  }
  if (!response.ok || !payload.access_token) {
    throw mcpError("pinterest_auth_failed", "Pinterest needs to be connected again.", 502);
  }
  return {
    ...secrets,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || secrets.refresh_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
}

async function ensureAccess({ secrets, oauth, fetchImpl, now = Date.now(), onSecrets }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  const next = await refreshAccess({ secrets, oauth, fetchImpl, now });
  if (onSecrets) await onSecrets(next);
  return next;
}

async function resolveBoardId(connection, fetchImpl, budget, secretsRef, refresh, onSecrets, onNeedsReconnect) {
  if (connection.board_id) return String(connection.board_id);
  const sent = await sendWithRefresh({
    budget,
    secrets: secretsRef.current,
    refresh,
    onSecrets: async (next) => {
      secretsRef.current = next;
      if (onSecrets) await onSecrets(next);
    },
    onNeedsReconnect,
    send: (current) =>
      fetchImpl("https://api.pinterest.com/v5/boards?page_size=1", {
        headers: { authorization: `Bearer ${current.access_token}` },
      }),
  });
  secretsRef.current = sent.secrets;
  const payload = await readJson(sent.response);
  const board = payload.items?.[0];
  if (!sent.response.ok || !board?.id) {
    throw mcpError("pinterest_board_required", "Create a Pinterest board (or reconnect) before publishing pins.", 409);
  }
  return String(board.id);
}

export async function publishPinterestPin({
  post,
  connection,
  secrets,
  oauth,
  fetchImpl = fetch,
  onSecrets,
  onNeedsReconnect,
}) {
  let fresh = await ensureAccess({ secrets, oauth, fetchImpl, onSecrets });
  const mediaUrl = String(post.media_url || "").trim();
  if (!/^https:\/\//i.test(mediaUrl)) {
    throw mcpError("media_url_required", "Pinterest pins need a public https media_url.", 400);
  }
  const budget = { used: false };
  const secretsRef = { current: fresh };
  const refresh = (current) => refreshAccess({ secrets: current, oauth, fetchImpl });
  const boardId = await resolveBoardId(connection, fetchImpl, budget, secretsRef, refresh, onSecrets, onNeedsReconnect);
  fresh = secretsRef.current;
  const title = String(post.title || post.caption || "Pin").slice(0, 100);
  const description = String(post.description || post.caption || "").slice(0, 800);

  const sent = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh,
    onSecrets,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: {
          authorization: `Bearer ${current.access_token}`,
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
      }),
  });
  const payload = await readJson(sent.response);
  if (!sent.response.ok || !payload.id) {
    throw mcpError("pinterest_publish_failed", payload?.message || "Pinterest pin create failed.", 502);
  }
  return {
    platform_post_id: String(payload.id),
    published_url: payload.link || null,
    note: `Pinned to board ${boardId}.`,
  };
}
