import { socialError } from "./errors.js";

const GRAPH_VERSION = "v22.0";
export const META_GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_read_user_content",
  "read_insights",
  "instagram_manage_comments",
  "instagram_manage_insights",
];

function requireValue(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw socialError(503, "social_not_configured", "Meta OAuth is not configured.");
  return value;
}

export function metaOAuthConfig() {
  const appId = requireValue("META_APP_ID");
  const appSecret = requireValue("META_APP_SECRET");
  const redirectUri = String(process.env.META_OAUTH_REDIRECT_URI || "").trim();
  let url;
  try {
    url = new URL(redirectUri);
  } catch {
    throw socialError(503, "social_not_configured", "META_OAUTH_REDIRECT_URI is not a valid URL.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) {
    throw socialError(503, "social_not_configured", "META_OAUTH_REDIRECT_URI must use HTTPS.");
  }
  if (!url.pathname.endsWith("/api/social/oauth/callback")) {
    throw socialError(503, "social_not_configured", "META_OAUTH_REDIRECT_URI must end with /api/social/oauth/callback.");
  }
  return { appId, appSecret, redirectUri: url.toString() };
}

export function metaAuthorizationUrl({ state, redirectUri, appId }) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: META_SCOPES.join(","),
    state,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function metaMessage(payload, status) {
  const message = payload?.error?.message || payload?.error_description || `Meta request failed (${status})`;
  return String(message).replace(/EAA[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
}

export async function exchangeMetaCode({ code, redirectUri, appId, appSecret, fetchImpl }) {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetchImpl(`${META_GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw socialError(502, "oauth_failed", metaMessage(payload, response.status));
  }
  const exchange = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: payload.access_token,
  });
  const longLived = await fetchImpl(`${META_GRAPH}/oauth/access_token?${exchange.toString()}`);
  const longPayload = await readJson(longLived);
  const accessToken = longLived.ok && longPayload.access_token ? longPayload.access_token : payload.access_token;
  const expiresIn = Number(longPayload.expires_in || payload.expires_in) || 60 * 24 * 60 * 60;
  return {
    access_token: accessToken,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function fetchMetaPages({ accessToken, fetchImpl }) {
  const response = await fetchImpl(
    `${META_GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const payload = await readJson(response);
  if (!response.ok) throw socialError(502, "oauth_failed", metaMessage(payload, response.status));
  const pages = Array.isArray(payload.data) ? payload.data : [];
  return pages
    .filter((page) => page?.id && page?.access_token)
    .map((page) => ({
      id: String(page.id),
      name: String(page.name || page.id).slice(0, 120),
      access_token: String(page.access_token),
      instagram_id: page.instagram_business_account?.id ? String(page.instagram_business_account.id) : "",
      instagram_username: page.instagram_business_account?.username
        ? String(page.instagram_business_account.username).replace(/^@/, "").slice(0, 80)
        : "",
    }));
}
