import { mcpError } from "../errors.js";
import { invalidGrantError, isInvalidGrantPayload, readJson, sendWithRefresh } from "./authRetry.js";

const THREADS_GRAPH = "https://graph.threads.net/v1.0";

async function refreshAccess({ secrets, fetchImpl, now = Date.now() }) {
  if (!secrets.access_token) throw mcpError("threads_not_connected", "Reconnect Threads.", 409);
  const response = await fetchImpl(
    `${THREADS_GRAPH}/refresh_access_token?${new URLSearchParams({
      grant_type: "th_refresh_token",
      access_token: secrets.access_token,
    })}`,
  );
  const payload = await readJson(response);
  if (isInvalidGrantPayload(payload)) {
    throw invalidGrantError("Threads token was revoked. Reconnect.");
  }
  if (!response.ok || !payload.access_token) {
    throw mcpError("threads_auth_failed", "Threads needs to be connected again.", 502);
  }
  return {
    ...secrets,
    access_token: payload.access_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 60 * 24 * 60 * 60) * 1000).toISOString(),
  };
}

async function ensureAccess({ secrets, fetchImpl, now = Date.now(), onSecrets }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  if (!secrets.access_token) throw mcpError("threads_not_connected", "Reconnect Threads.", 409);
  const next = await refreshAccess({ secrets, fetchImpl, now });
  if (onSecrets) await onSecrets(next);
  return next;
}

export async function publishThreadsPost({
  post,
  connection,
  secrets,
  fetchImpl = fetch,
  onSecrets,
  onNeedsReconnect,
}) {
  let fresh = await ensureAccess({ secrets, fetchImpl, onSecrets });
  const userId = connection.threads_user_id || "me";
  const text = String(post.caption || post.description || post.title || "").slice(0, 500);
  if (!text && !post.media_url) {
    throw mcpError("invalid_post", "Threads posts need caption text and/or media_url.", 400);
  }

  const createParamsFor = (token) => {
    const params = new URLSearchParams({
      media_type: post.media_url ? "IMAGE" : "TEXT",
      text,
      access_token: token,
    });
    if (post.media_url) {
      if (!/^https:\/\//i.test(String(post.media_url))) {
        throw mcpError("media_url_required", "Threads image posts need a public https media_url.", 400);
      }
      params.set("image_url", String(post.media_url));
    }
    return params;
  };

  const budget = { used: false };
  const refresh = (current) => refreshAccess({ secrets: current, fetchImpl });
  const createdSent = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh,
    onSecrets,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl(`${THREADS_GRAPH}/${userId}/threads`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: createParamsFor(current.access_token),
      }),
  });
  fresh = createdSent.secrets;
  const created = await readJson(createdSent.response);
  if (!createdSent.response.ok || !created.id) {
    throw mcpError("threads_publish_failed", created?.error?.message || "Threads container create failed.", 502);
  }

  const publishSent = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh,
    onSecrets,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl(`${THREADS_GRAPH}/${userId}/threads_publish`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: created.id,
          access_token: current.access_token,
        }),
      }),
  });
  const published = await readJson(publishSent.response);
  if (!publishSent.response.ok || !published.id) {
    throw mcpError("threads_publish_failed", published?.error?.message || "Threads publish failed.", 502);
  }
  return {
    platform_post_id: String(published.id),
    published_url: null,
    note: "Threads post published.",
  };
}
