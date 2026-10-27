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

async function ensureAccess({ secrets, oauth, fetchImpl, now = Date.now(), onSecrets }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  if (!secrets.refresh_token || !oauth?.clientId || !oauth?.clientSecret) {
    if (secrets.access_token) return secrets;
    throw mcpError("x_not_connected", "Reconnect X.", 409);
  }
  const basic = Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString("base64");
  const response = await fetchImpl("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: secrets.refresh_token,
      client_id: oauth.clientId,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw mcpError("x_auth_failed", "X needs to be connected again.", 502);
  }
  const next = {
    ...secrets,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || secrets.refresh_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 7200) * 1000).toISOString(),
  };
  if (onSecrets) await onSecrets(next);
  return next;
}

export async function publishXPost({ post, secrets, oauth, fetchImpl = fetch, onSecrets }) {
  const fresh = await ensureAccess({ secrets, oauth, fetchImpl, onSecrets });
  const text = String(post.caption || post.description || post.title || "").slice(0, 280);
  if (!text) throw mcpError("invalid_post", "X posts need caption or description text.", 400);

  const response = await fetchImpl("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${fresh.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  const payload = await readJson(response);
  const id = payload.data?.id;
  if (!response.ok || !id) {
    throw mcpError("x_publish_failed", payload?.detail || payload?.title || "X publish failed.", 502);
  }
  return {
    platform_post_id: String(id),
    published_url: `https://x.com/i/web/status/${id}`,
  };
}
