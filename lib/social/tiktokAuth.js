import { socialError } from "./errors.js";

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_SCOPES = ["video.upload"];

function requireValue(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw socialError(503, "social_not_configured", "TikTok OAuth is not configured.");
  return value;
}

export function tiktokOAuthConfig() {
  const clientKey = requireValue("TIKTOK_CLIENT_KEY");
  const clientSecret = requireValue("TIKTOK_CLIENT_SECRET");
  const redirectUri = String(process.env.TIKTOK_OAUTH_REDIRECT_URI || "").trim();
  let url;
  try {
    url = new URL(redirectUri);
  } catch {
    throw socialError(503, "social_not_configured", "TIKTOK_OAUTH_REDIRECT_URI is not a valid URL.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) {
    throw socialError(503, "social_not_configured", "TIKTOK_OAUTH_REDIRECT_URI must use HTTPS.");
  }
  if (!url.pathname.endsWith("/api/social/oauth/callback")) {
    throw socialError(503, "social_not_configured", "TIKTOK_OAUTH_REDIRECT_URI must end with /api/social/oauth/callback.");
  }
  return { clientKey, clientSecret, redirectUri: url.toString() };
}

export function tiktokAuthorizationUrl({ state, redirectUri, clientKey }) {
  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
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

export async function exchangeTikTokCode({ code, redirectUri, clientKey, clientSecret, fetchImpl }) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const payload = await readJson(response);
  const token = payload.access_token || payload.data?.access_token;
  const refresh = payload.refresh_token || payload.data?.refresh_token;
  if (!response.ok || !token || !refresh) {
    throw socialError(502, "oauth_failed", "TikTok did not return a refresh token. Reconnect and allow video upload.");
  }
  const openId = String(payload.open_id || payload.data?.open_id || "").slice(0, 80);
  const expiresIn = Number(payload.expires_in || payload.data?.expires_in) || 86400;
  return {
    access_token: token,
    refresh_token: refresh,
    open_id: openId,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scope: String(payload.scope || payload.data?.scope || TIKTOK_SCOPES.join(",")),
  };
}

export async function fetchTikTokUser({ accessToken, fetchImpl }) {
  const response = await fetchImpl("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJson(response);
  const user = payload.data?.user || {};
  if (!response.ok || (payload?.error?.code && payload.error.code !== "ok")) {
    throw socialError(502, "oauth_failed", "The TikTok account could not be read.");
  }
  const username = String(user.username || user.display_name || user.open_id || "TikTok").replace(/^@/, "");
  return {
    open_id: String(user.open_id || "").slice(0, 80),
    account_label: `@${username}`.slice(0, 120),
  };
}

export async function refreshTikTokAccess({ refreshToken, clientKey, clientSecret, fetchImpl, now = Date.now() }) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const payload = await readJson(response);
  const token = payload.access_token || payload.data?.access_token;
  if (!response.ok || !token) {
    throw socialError(502, "tiktok_auth_failed", "TikTok needs to be connected again.");
  }
  const expiresIn = Number(payload.expires_in || payload.data?.expires_in) || 86400;
  return {
    access_token: token,
    refresh_token: payload.refresh_token || payload.data?.refresh_token || refreshToken,
    expires_at: new Date(now + expiresIn * 1000).toISOString(),
  };
}
