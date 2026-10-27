import { mcpError } from "../errors.js";
import { invalidGrantError, isInvalidGrantPayload, sendWithRefresh } from "./authRetry.js";

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
    throw mcpError("reddit_not_connected", "Reconnect Reddit.", 409);
  }
  const basic = Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString("base64");
  const response = await fetchImpl("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
      "user-agent": "PostPath/0.1 by 1stStep.ai",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: secrets.refresh_token,
    }),
  });
  const payload = await readJson(response);
  if (isInvalidGrantPayload(payload)) {
    throw invalidGrantError("Reddit refresh token was revoked. Reconnect.");
  }
  if (!response.ok || !payload.access_token) {
    throw mcpError("reddit_auth_failed", "Reddit needs to be connected again.", 502);
  }
  return {
    ...secrets,
    access_token: payload.access_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
}

async function ensureAccess({ secrets, oauth, fetchImpl, now = Date.now(), onSecrets }) {
  if (secrets.access_token && secrets.expires_at && Date.parse(secrets.expires_at) > now + 60_000) {
    return secrets;
  }
  if (!secrets.refresh_token || !oauth?.clientId || !oauth?.clientSecret) {
    if (secrets.access_token) return secrets;
    throw mcpError("reddit_not_connected", "Reconnect Reddit.", 409);
  }
  const next = await refreshAccess({ secrets, oauth, fetchImpl, now });
  if (onSecrets) await onSecrets(next);
  return next;
}

export async function publishRedditPost({
  post,
  connection,
  secrets,
  oauth,
  fetchImpl = fetch,
  onSecrets,
  onNeedsReconnect,
}) {
  let fresh = await ensureAccess({ secrets, oauth, fetchImpl, onSecrets });
  const subreddit = String(post.tags?.[0] || connection.default_subreddit || "")
    .trim()
    .replace(/^r\//i, "");
  if (!subreddit) {
    throw mcpError(
      "reddit_subreddit_required",
      "Set tags[0] to the target subreddit name (without r/) before publishing to Reddit.",
      400,
    );
  }
  const title = String(post.title || post.caption || "").slice(0, 300);
  const text = String(post.description || post.caption || "").slice(0, 40000);
  if (!title) throw mcpError("invalid_post", "Reddit posts need a title.", 400);

  const body = new URLSearchParams({
    api_type: "json",
    kind: "self",
    sr: subreddit,
    title,
    text,
  });
  if (post.media_url && /^https?:\/\//i.test(String(post.media_url))) {
    body.set("kind", "link");
    body.set("url", String(post.media_url));
    body.delete("text");
  }

  const budget = { used: false };
  const sent = await sendWithRefresh({
    budget,
    secrets: fresh,
    refresh: (current) => refreshAccess({ secrets: current, oauth, fetchImpl }),
    onSecrets,
    onNeedsReconnect,
    send: (current) =>
      fetchImpl("https://oauth.reddit.com/api/submit", {
        method: "POST",
        headers: {
          authorization: `Bearer ${current.access_token}`,
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "PostPath/0.1 by 1stStep.ai",
        },
        body,
      }),
  });
  fresh = sent.secrets;
  const response = sent.response;
  const payload = await readJson(response);
  const errors = payload?.json?.errors;
  if (!response.ok || (Array.isArray(errors) && errors.length)) {
    const message = Array.isArray(errors) && errors[0] ? errors[0].join(": ") : "Reddit submit failed.";
    throw mcpError("reddit_publish_failed", message, 502);
  }
  const data = payload?.json?.data || {};
  return {
    platform_post_id: String(data.id || data.name || ""),
    published_url: data.url || (data.id ? `https://www.reddit.com/r/${subreddit}/comments/${data.id}/` : null),
  };
}
