import { mcpError } from "../errors.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const META_GRAPH = "https://graph.facebook.com/v22.0";
const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

export const TIKTOK_SCOPES = ["video.upload"];

function requireEnv(env, name, label) {
  const value = String(env[name] || "").trim();
  if (!value) throw mcpError("oauth_not_configured", `${label} is not configured (${name}).`, 503);
  return value;
}

export function oauthConfig(env, redirectUri) {
  const source = env || process.env;
  return {
    google: {
      clientId: String(source.GOOGLE_OAUTH_CLIENT_ID || "").trim(),
      clientSecret: String(source.GOOGLE_OAUTH_CLIENT_SECRET || "").trim(),
      redirectUri,
    },
    meta: {
      appId: String(source.META_APP_ID || "").trim(),
      appSecret: String(source.META_APP_SECRET || "").trim(),
      redirectUri,
    },
    tiktok: {
      clientKey: String(source.TIKTOK_CLIENT_KEY || "").trim(),
      clientSecret: String(source.TIKTOK_CLIENT_SECRET || "").trim(),
      redirectUri,
    },
  };
}

export function assertProviderConfigured(provider, config) {
  if (provider === "youtube") {
    if (!config.google.clientId || !config.google.clientSecret) {
      throw mcpError("oauth_not_configured", "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.", 503);
    }
    return;
  }
  if (provider === "meta") {
    if (!config.meta.appId || !config.meta.appSecret) {
      throw mcpError("oauth_not_configured", "Set META_APP_ID and META_APP_SECRET.", 503);
    }
    return;
  }
  if (provider === "tiktok") {
    if (!config.tiktok.clientKey || !config.tiktok.clientSecret) {
      throw mcpError("oauth_not_configured", "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.", 503);
    }
    return;
  }
  throw mcpError("invalid_provider", "Unknown OAuth provider.");
}

export function authorizationUrl(provider, { state, config }) {
  assertProviderConfigured(provider, config);
  if (provider === "youtube") {
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.redirectUri,
      response_type: "code",
      scope: YOUTUBE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `${GOOGLE_AUTH}?${params}`;
  }
  if (provider === "meta") {
    const params = new URLSearchParams({
      client_id: config.meta.appId,
      redirect_uri: config.meta.redirectUri,
      response_type: "code",
      scope: META_SCOPES.join(","),
      state,
    });
    return `https://www.facebook.com/v22.0/dialog/oauth?${params}`;
  }
  const params = new URLSearchParams({
    client_key: config.tiktok.clientKey,
    redirect_uri: config.tiktok.redirectUri,
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    state,
  });
  return `${TIKTOK_AUTH}?${params}`;
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

async function exchangeGoogleCode(code, config, fetchImpl) {
  const response = await fetchImpl(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.refresh_token || !payload.access_token) {
    throw mcpError("oauth_failed", "Google did not return a refresh token. Allow offline access and try again.", 502);
  }
  const channel = await fetchYouTubeChannel(payload.access_token, fetchImpl);
  return {
    platforms: {
      youtube: {
        record: {
          platform: "youtube",
          account_label: channel.account_label,
          channel_id: channel.channel_id,
        },
        secrets: {
          refresh_token: payload.refresh_token,
          access_token: payload.access_token,
          expires_at: new Date(Date.now() + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
          scope: String(payload.scope || ""),
        },
      },
    },
  };
}

function metaSecrets(pageToken, userToken, expiresIn) {
  return {
    page_access_token: pageToken,
    user_access_token: userToken,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

async function exchangeMetaCode(code, config, fetchImpl) {
  const short = await fetchImpl(`${META_GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: config.meta.redirectUri,
      code,
    }),
  });
  const shortPayload = await readJson(short);
  if (!short.ok || !shortPayload.access_token) {
    throw mcpError("oauth_failed", "Meta did not return an access token.", 502);
  }
  const exchange = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    fb_exchange_token: shortPayload.access_token,
  });
  const longLived = await fetchImpl(`${META_GRAPH}/oauth/access_token?${exchange}`);
  const longPayload = await readJson(longLived);
  const userToken = longLived.ok && longPayload.access_token ? longPayload.access_token : shortPayload.access_token;
  const expiresIn = Number(longPayload.expires_in || shortPayload.expires_in) || 60 * 24 * 60 * 60;
  const pages = await fetchMetaPages(userToken, fetchImpl);
  if (!pages.length) {
    throw mcpError("oauth_failed", "No Facebook Pages were found for that Meta login.", 502);
  }
  const page = pages[0];
  const secrets = metaSecrets(page.access_token, userToken, expiresIn);
  const platforms = {
    facebook: {
      record: {
        platform: "facebook",
        account_label: page.name,
        page_id: page.id,
        instagram_id: page.instagram_id || null,
      },
      secrets,
    },
  };
  if (page.instagram_id) {
    platforms.instagram = {
      record: {
        platform: "instagram",
        account_label: page.instagram_username ? `@${page.instagram_username}` : page.instagram_id,
        instagram_id: page.instagram_id,
        page_id: page.id,
      },
      secrets,
    };
  }
  return {
    platforms,
    meta_pages: pages.map((item) => ({ id: item.id, name: item.name, instagram_id: item.instagram_id })),
  };
}

async function exchangeTikTokCode(code, config, fetchImpl) {
  const response = await fetchImpl(TIKTOK_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: config.tiktok.clientKey,
      client_secret: config.tiktok.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.tiktok.redirectUri,
    }),
  });
  const payload = await readJson(response);
  const token = payload.access_token || payload.data?.access_token;
  const refresh = payload.refresh_token || payload.data?.refresh_token;
  if (!response.ok || !token || !refresh) {
    throw mcpError("oauth_failed", "TikTok did not return a refresh token.", 502);
  }
  const user = await fetchTikTokUser(token, fetchImpl);
  return {
    platforms: {
      tiktok: {
        record: {
          platform: "tiktok",
          account_label: user.account_label,
          open_id: user.open_id || String(payload.open_id || payload.data?.open_id || ""),
        },
        secrets: {
          access_token: token,
          refresh_token: refresh,
          expires_at: new Date(Date.now() + (Number(payload.expires_in || payload.data?.expires_in) || 86400) * 1000).toISOString(),
          scope: String(payload.scope || payload.data?.scope || TIKTOK_SCOPES.join(",")),
        },
      },
    },
  };
}

export async function exchangeCode(provider, { code, config, fetchImpl = fetch }) {
  assertProviderConfigured(provider, config);
  if (provider === "youtube") return exchangeGoogleCode(code, config, fetchImpl);
  if (provider === "meta") return exchangeMetaCode(code, config, fetchImpl);
  if (provider === "tiktok") return exchangeTikTokCode(code, config, fetchImpl);
  throw mcpError("invalid_provider", "Unknown OAuth provider.");
}

async function fetchYouTubeChannel(accessToken, fetchImpl) {
  const response = await fetchImpl("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJson(response);
  const channel = payload.items?.[0];
  if (!response.ok || !channel?.id) {
    throw mcpError("oauth_failed", "No YouTube channel was found for that Google account.", 502);
  }
  const label = channel.snippet?.customUrl || channel.snippet?.title || channel.id;
  return {
    channel_id: String(channel.id).slice(0, 80),
    account_label: String(label).slice(0, 120),
  };
}

async function fetchMetaPages(accessToken, fetchImpl) {
  const response = await fetchImpl(
    `${META_GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const payload = await readJson(response);
  if (!response.ok) throw mcpError("oauth_failed", "Meta Pages could not be listed.", 502);
  return (Array.isArray(payload.data) ? payload.data : [])
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

async function fetchTikTokUser(accessToken, fetchImpl) {
  const response = await fetchImpl("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await readJson(response);
  const user = payload.data?.user || {};
  if (!response.ok || (payload?.error?.code && payload.error.code !== "ok")) {
    throw mcpError("oauth_failed", "The TikTok account could not be read.", 502);
  }
  const username = String(user.username || user.display_name || user.open_id || "TikTok").replace(/^@/, "");
  return {
    open_id: String(user.open_id || "").slice(0, 80),
    account_label: `@${username}`.slice(0, 120),
  };
}

export function missingProviders(connections, { wantInstagram = true } = {}) {
  const have = new Set(connections.map((row) => row.platform));
  const missing = [];
  if (!have.has("youtube")) missing.push("youtube");
  if (!have.has("facebook") || (wantInstagram && !have.has("instagram"))) missing.push("meta");
  if (!have.has("tiktok")) missing.push("tiktok");
  return missing;
}

// Keep requireEnv exported for tests that document env wiring.
export { requireEnv };
