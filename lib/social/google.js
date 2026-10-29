import { socialError } from "./errors.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  // youtube.force-ssl covers every manage call PostPath makes (channels.update,
  // channelBanners.insert, playlists, playlistItems, videos.update, videos.delete)
  // plus comments and captions, which the broader "youtube" scope does not.
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export function googleOAuthConfig() {
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw socialError(503, "social_not_configured", "Google OAuth is not configured.");
  }
  let url;
  try {
    url = new URL(redirectUri);
  } catch {
    throw socialError(503, "social_not_configured", "GOOGLE_OAUTH_REDIRECT_URI is not a valid URL.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) {
    throw socialError(503, "social_not_configured", "GOOGLE_OAUTH_REDIRECT_URI must use HTTPS.");
  }
  if (!url.pathname.endsWith("/api/social/oauth/callback")) {
    throw socialError(503, "social_not_configured", "GOOGLE_OAUTH_REDIRECT_URI must end with /api/social/oauth/callback.");
  }
  return { clientId, clientSecret, redirectUri: url.toString() };
}

export function googleAuthorizationUrl({ state, redirectUri, clientId }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function exchangeGoogleCode({ code, redirectUri, clientId, clientSecret, fetchImpl }) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.refresh_token || !payload.access_token) {
    throw socialError(502, "oauth_failed", "Google did not return a refresh token. Reconnect and allow offline access.");
  }
  return {
    refresh_token: payload.refresh_token,
    access_token: payload.access_token,
    expires_at: new Date(Date.now() + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
    scope: String(payload.scope || ""),
  };
}

export async function fetchYouTubeChannel({ accessToken, fetchImpl }) {
  const response = await fetchImpl("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJson(response);
  if (!response.ok) throw socialError(502, "oauth_failed", "The YouTube channel could not be read.");
  const channel = payload.items && payload.items[0];
  if (!channel?.id) throw socialError(502, "oauth_failed", "No YouTube channel was found for that Google account.");
  const label = channel.snippet?.customUrl || channel.snippet?.title || channel.id;
  return {
    channel_id: String(channel.id).slice(0, 80),
    account_label: String(label).slice(0, 120),
  };
}
