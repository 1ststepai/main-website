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
    throw mcpError("linkedin_not_connected", "Reconnect LinkedIn.", 409);
  }
  const response = await fetchImpl("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: secrets.refresh_token,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw mcpError("linkedin_auth_failed", "LinkedIn needs to be connected again.", 502);
  }
  const next = {
    ...secrets,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || secrets.refresh_token,
    expires_at: new Date(now + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
  if (onSecrets) await onSecrets(next);
  return next;
}

export async function publishLinkedInText({ post, connection, secrets, oauth, fetchImpl = fetch, onSecrets }) {
  const fresh = await ensureAccess({ secrets, oauth, fetchImpl, onSecrets });
  const author = connection.person_urn;
  if (!author) throw mcpError("linkedin_not_connected", "LinkedIn person URN missing. Reconnect LinkedIn.", 409);
  const text = String(post.caption || post.description || post.title || "").slice(0, 3000);
  if (!text) throw mcpError("invalid_post", "LinkedIn posts need caption or description text.", 400);

  const response = await fetchImpl("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${fresh.access_token}`,
      "content-type": "application/json",
      "x-restli-protocol-version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });
  const payload = await readJson(response);
  const id = payload.id || response.headers?.get?.("x-restli-id") || "";
  if (!response.ok || !id) {
    throw mcpError("linkedin_publish_failed", payload?.message || payload?.error_description || "LinkedIn publish failed.", 502);
  }
  return {
    platform_post_id: String(id),
    published_url: null,
    note: "LinkedIn UGC post created.",
  };
}
