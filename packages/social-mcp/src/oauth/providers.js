import { createHash, randomBytes } from "node:crypto";
import { mcpError } from "../errors.js";
import { CONNECT_ORDER, PLATFORMS } from "../platforms.js";
import { SEARCH_DATA_SCOPES } from "../seo/searchData.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const META_GRAPH = "https://graph.facebook.com/v22.0";
const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const LINKEDIN_AUTH = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
const X_AUTH = "https://twitter.com/i/oauth2/authorize";
const X_TOKEN = "https://api.twitter.com/2/oauth2/token";
const PINTEREST_AUTH = "https://www.pinterest.com/oauth/";
const PINTEREST_TOKEN = "https://api.pinterest.com/v5/oauth/token";
const REDDIT_AUTH = "https://www.reddit.com/api/v1/authorize";
const REDDIT_TOKEN = "https://www.reddit.com/api/v1/access_token";
const SNAP_AUTH = "https://accounts.snapchat.com/login/oauth2/authorize";
const SNAP_TOKEN = "https://accounts.snapchat.com/login/oauth2/access_token";
const THREADS_AUTH = "https://threads.net/oauth/authorize";
const THREADS_TOKEN = "https://graph.threads.net/oauth/access_token";
const THREADS_GRAPH = "https://graph.threads.net/v1.0";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  // youtube.force-ssl covers every manage call PostPath makes (channels.update,
  // channelBanners.insert, playlists, playlistItems, videos.update, videos.delete)
  // plus comments and captions, which the broader "youtube" scope does not.
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export const GBP_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/userinfo.email",
];

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

export const THREADS_SCOPES = ["threads_basic", "threads_content_publish"];
export const TIKTOK_SCOPES = ["video.upload"];
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];
export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access", "like.write", "follows.write", "media.write"];
export const PINTEREST_SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"];
export const REDDIT_SCOPES = ["identity", "submit", "read"];
export const SNAP_SCOPES = ["snapchat-marketing-api"];

function requireEnv(env, name, label) {
  const value = String(env[name] || "").trim();
  if (!value) throw mcpError("oauth_not_configured", `${label} is not configured (${name}).`, 503);
  return value;
}

export function oauthConfig(env, redirectUri, googleRedirectUri = redirectUri) {
  const source = env || process.env;
  return {
    google: {
      clientId: String(source.GOOGLE_OAUTH_CLIENT_ID || "").trim(),
      clientSecret: String(source.GOOGLE_OAUTH_CLIENT_SECRET || "").trim(),
      redirectUri: googleRedirectUri || redirectUri,
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
    linkedin: {
      clientId: String(source.LINKEDIN_CLIENT_ID || "").trim(),
      clientSecret: String(source.LINKEDIN_CLIENT_SECRET || "").trim(),
      redirectUri,
    },
    x: {
      clientId: String(source.X_CLIENT_ID || "").trim(),
      clientSecret: String(source.X_CLIENT_SECRET || "").trim(),
      redirectUri,
    },
    pinterest: {
      clientId: String(source.PINTEREST_APP_ID || "").trim(),
      clientSecret: String(source.PINTEREST_APP_SECRET || "").trim(),
      redirectUri,
    },
    reddit: {
      clientId: String(source.REDDIT_CLIENT_ID || "").trim(),
      clientSecret: String(source.REDDIT_CLIENT_SECRET || "").trim(),
      redirectUri,
    },
    snapchat: {
      clientId: String(source.SNAPCHAT_CLIENT_ID || "").trim(),
      clientSecret: String(source.SNAPCHAT_CLIENT_SECRET || "").trim(),
      redirectUri,
    },
  };
}

const PROVIDER_CHECKS = {
  youtube: (c) => c.google.clientId && c.google.clientSecret,
  google_search: (c) => c.google.clientId && c.google.clientSecret,
  google_business: (c) => c.google.clientId && c.google.clientSecret,
  meta: (c) => c.meta.appId && c.meta.appSecret,
  threads: (c) => c.meta.appId && c.meta.appSecret,
  tiktok: (c) => c.tiktok.clientKey && c.tiktok.clientSecret,
  linkedin: (c) => c.linkedin.clientId && c.linkedin.clientSecret,
  x: (c) => c.x.clientId && c.x.clientSecret,
  pinterest: (c) => c.pinterest.clientId && c.pinterest.clientSecret,
  reddit: (c) => c.reddit.clientId && c.reddit.clientSecret,
  snapchat: (c) => c.snapchat.clientId && c.snapchat.clientSecret,
};

export function assertProviderConfigured(provider, config) {
  const check = PROVIDER_CHECKS[provider];
  if (!check) throw mcpError("invalid_provider", `Unknown OAuth provider: ${provider}.`);
  if (!check(config)) {
    throw mcpError("oauth_not_configured", `OAuth credentials for ${provider} are not configured.`, 503);
  }
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function googleAuthorizationUrl({ clientId, redirectUri, scope, state, pkce, includeGrantedScopes = false }) {
  if (!pkce?.challenge) throw mcpError("oauth_failed", "Google sign-in requires PKCE.", 500);
  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
  };
  if (includeGrantedScopes) params.include_granted_scopes = "true";
  return `${GOOGLE_AUTH}?${new URLSearchParams(params)}`;
}

export function authorizationUrl(provider, { state, config, pkce }) {
  assertProviderConfigured(provider, config);
  if (provider === "youtube") {
    return googleAuthorizationUrl({
      clientId: config.google.clientId,
      redirectUri: config.google.redirectUri,
      scope: YOUTUBE_SCOPES.join(" "),
      state,
      pkce,
      includeGrantedScopes: true,
    });
  }
  if (provider === "google_search") {
    return googleAuthorizationUrl({
      clientId: config.google.clientId,
      redirectUri: config.google.redirectUri,
      scope: SEARCH_DATA_SCOPES.join(" "),
      state,
      pkce,
      includeGrantedScopes: true,
    });
  }
  if (provider === "google_business") {
    return googleAuthorizationUrl({
      clientId: config.google.clientId,
      redirectUri: config.google.redirectUri,
      scope: GBP_SCOPES.join(" "),
      state,
      pkce,
    });
  }
  if (provider === "meta") {
    return `https://www.facebook.com/v22.0/dialog/oauth?${new URLSearchParams({
      client_id: config.meta.appId,
      redirect_uri: config.meta.redirectUri,
      response_type: "code",
      scope: META_SCOPES.join(","),
      state,
    })}`;
  }
  if (provider === "threads") {
    return `${THREADS_AUTH}?${new URLSearchParams({
      client_id: config.meta.appId,
      redirect_uri: config.meta.redirectUri,
      response_type: "code",
      scope: THREADS_SCOPES.join(","),
      state,
    })}`;
  }
  if (provider === "tiktok") {
    return `${TIKTOK_AUTH}?${new URLSearchParams({
      client_key: config.tiktok.clientKey,
      redirect_uri: config.tiktok.redirectUri,
      response_type: "code",
      scope: TIKTOK_SCOPES.join(","),
      state,
    })}`;
  }
  if (provider === "linkedin") {
    return `${LINKEDIN_AUTH}?${new URLSearchParams({
      response_type: "code",
      client_id: config.linkedin.clientId,
      redirect_uri: config.linkedin.redirectUri,
      scope: LINKEDIN_SCOPES.join(" "),
      state,
    })}`;
  }
  if (provider === "x") {
    if (!pkce?.challenge) throw mcpError("oauth_failed", "X OAuth requires PKCE.", 500);
    return `${X_AUTH}?${new URLSearchParams({
      response_type: "code",
      client_id: config.x.clientId,
      redirect_uri: config.x.redirectUri,
      scope: X_SCOPES.join(" "),
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    })}`;
  }
  if (provider === "pinterest") {
    return `${PINTEREST_AUTH}?${new URLSearchParams({
      client_id: config.pinterest.clientId,
      redirect_uri: config.pinterest.redirectUri,
      response_type: "code",
      scope: PINTEREST_SCOPES.join(","),
      state,
    })}`;
  }
  if (provider === "reddit") {
    return `${REDDIT_AUTH}?${new URLSearchParams({
      client_id: config.reddit.clientId,
      response_type: "code",
      state,
      redirect_uri: config.reddit.redirectUri,
      duration: "permanent",
      scope: REDDIT_SCOPES.join(" "),
    })}`;
  }
  if (provider === "snapchat") {
    return `${SNAP_AUTH}?${new URLSearchParams({
      client_id: config.snapchat.clientId,
      redirect_uri: config.snapchat.redirectUri,
      response_type: "code",
      scope: SNAP_SCOPES.join(" "),
      state,
    })}`;
  }
  throw mcpError("invalid_provider", "Unknown OAuth provider.");
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

function tokenBundle(access, refresh, expiresIn, scope = "") {
  return {
    access_token: access,
    refresh_token: refresh || "",
    expires_at: new Date(Date.now() + (Number(expiresIn) || 3600) * 1000).toISOString(),
    scope: String(scope || ""),
  };
}

async function exchangeGoogleCode(code, config, fetchImpl, platform = "youtube", codeVerifier = "") {
  if (!codeVerifier) throw mcpError("oauth_failed", "Google sign-in requires PKCE.", 500);
  const params = {
    code,
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  };
  // Google Desktop clients still reject a token exchange that omits client_secret.
  // The value is not confidential once it ships inside an installer. Send it only
  // when an owner has saved one locally. Do not embed one in the app.
  if (config.google.clientSecret) params.client_secret = config.google.clientSecret;
  const response = await fetchImpl(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.refresh_token || !payload.access_token) {
    throw mcpError("oauth_failed", "Google did not return a refresh token. Allow offline access and try again.", 502);
  }
  const secrets = tokenBundle(payload.access_token, payload.refresh_token, payload.expires_in, payload.scope);
  if (platform === "google_business") {
    return {
      platforms: {
        google_business: {
          record: {
            platform: "google_business",
            account_label: "Google Business Profile",
          },
          secrets,
        },
      },
    };
  }
  if (platform === "search_data") {
    return {
      platforms: {
        search_data: {
          record: {
            platform: "search_data",
            account_label: "Search data",
          },
          secrets,
        },
      },
    };
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
        secrets,
      },
    },
  };
}

// Only the chosen Page's token is kept. The Meta user token can act on every Page
// in that login, so it is never stored on a brand profile. Publishing uses the
// Page token alone, and a Page token minted from a long-lived user token does not expire.
function metaSecrets(pageToken, expiresIn) {
  return {
    page_access_token: pageToken,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

// Pick the Facebook Page for this profile. A Meta login can cover several Pages,
// so prefer the profile's saved choice (page id or exact name, case-insensitive)
// A login with one Page uses it; with several and no choice, ask (names and ids only).
export function pickMetaPage(pages, preference) {
  const list = Array.isArray(pages) ? pages : [];
  const wanted = String(preference || "").trim();
  if (!wanted) {
    if (list.length <= 1) return list[0] || null;
    const choices = list.map((page) => ({ id: String(page.id), name: String(page.name || "") }));
    const pageList = choices.map((p) => p.name + " (" + p.id + ")").join(", ");
    const error = mcpError(
      "page_choice_required",
      `This Meta login covers ${choices.length} Facebook Pages: ${pageList}. Choose this brand's Page in its profile (Facebook Page), then reconnect.`,
      400,
    );
    error.details = { pages: choices };
    throw error;
  }
  const byId = list.find((page) => page.id === wanted);
  if (byId) return byId;
  const lower = wanted.toLowerCase();
  const byName = list.find((page) => String(page.name || "").toLowerCase() === lower);
  if (byName) return byName;
  throw mcpError(
    "page_not_found",
    `The Facebook Page "${wanted}" was not in this Meta login. Reconnect and tick that Page on the Facebook screen.`,
    400,
  );
}

async function exchangeMetaCode(code, config, fetchImpl, pagePreference = "") {
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
  const page = pickMetaPage(pages, pagePreference);
  const secrets = metaSecrets(page.access_token, expiresIn);
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
  return { platforms };
}

async function exchangeThreadsCode(code, config, fetchImpl) {
  const short = await fetchImpl(THREADS_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: config.meta.redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });
  const payload = await readJson(short);
  if (!short.ok || !payload.access_token) {
    throw mcpError("oauth_failed", "Threads did not return an access token.", 502);
  }
  let accessToken = payload.access_token;
  let expiresIn = Number(payload.expires_in) || 3600;
  const longLived = await fetchImpl(
    `${THREADS_GRAPH}/access_token?${new URLSearchParams({
      grant_type: "th_exchange_token",
      client_secret: config.meta.appSecret,
      access_token: accessToken,
    })}`,
  );
  const longPayload = await readJson(longLived);
  if (longLived.ok && longPayload.access_token) {
    accessToken = longPayload.access_token;
    expiresIn = Number(longPayload.expires_in) || expiresIn;
  }
  const me = await fetchImpl(`${THREADS_GRAPH}/me?fields=id,username,name`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const profile = await readJson(me);
  const label = profile.username ? `@${profile.username}` : profile.name || profile.id || "Threads";
  return {
    platforms: {
      threads: {
        record: {
          platform: "threads",
          account_label: String(label).slice(0, 120),
          threads_user_id: String(profile.id || "").slice(0, 80),
        },
        secrets: tokenBundle(accessToken, "", expiresIn, THREADS_SCOPES.join(",")),
      },
    },
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
        secrets: tokenBundle(token, refresh, payload.expires_in || payload.data?.expires_in, payload.scope || TIKTOK_SCOPES.join(",")),
      },
    },
  };
}

async function exchangeLinkedInCode(code, config, fetchImpl) {
  const response = await fetchImpl(LINKEDIN_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.linkedin.redirectUri,
      client_id: config.linkedin.clientId,
      client_secret: config.linkedin.clientSecret,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw mcpError("oauth_failed", "LinkedIn did not return an access token.", 502);
  }
  const me = await fetchImpl("https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${payload.access_token}` },
  });
  const profile = await readJson(me);
  return {
    platforms: {
      linkedin: {
        record: {
          platform: "linkedin",
          account_label: String(profile.name || profile.email || profile.sub || "LinkedIn").slice(0, 120),
          person_urn: profile.sub ? `urn:li:person:${String(profile.sub).replace(/^urn:li:person:/, "")}` : "",
        },
        secrets: tokenBundle(payload.access_token, payload.refresh_token, payload.expires_in, payload.scope),
      },
    },
  };
}

async function exchangeXCode(code, config, fetchImpl, codeVerifier) {
  if (!codeVerifier) throw mcpError("oauth_failed", "Missing PKCE verifier for X.", 500);
  const basic = Buffer.from(`${config.x.clientId}:${config.x.clientSecret}`).toString("base64");
  const response = await fetchImpl(X_TOKEN, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: config.x.clientId,
      redirect_uri: config.x.redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw mcpError("oauth_failed", "X did not return an access token.", 502);
  }
  const me = await fetchImpl("https://api.twitter.com/2/users/me", {
    headers: { authorization: `Bearer ${payload.access_token}` },
  });
  const profile = await readJson(me);
  const username = profile.data?.username || profile.data?.name || profile.data?.id || "x";
  return {
    platforms: {
      x: {
        record: {
          platform: "x",
          account_label: `@${String(username).replace(/^@/, "")}`.slice(0, 120),
          user_id: String(profile.data?.id || "").slice(0, 80),
        },
        secrets: tokenBundle(payload.access_token, payload.refresh_token, payload.expires_in, payload.scope),
      },
    },
  };
}

async function exchangePinterestCode(code, config, fetchImpl) {
  const basic = Buffer.from(`${config.pinterest.clientId}:${config.pinterest.clientSecret}`).toString("base64");
  const response = await fetchImpl(PINTEREST_TOKEN, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.pinterest.redirectUri,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw mcpError("oauth_failed", "Pinterest did not return an access token.", 502);
  }
  const me = await fetchImpl("https://api.pinterest.com/v5/user_account", {
    headers: { authorization: `Bearer ${payload.access_token}` },
  });
  const profile = await readJson(me);
  return {
    platforms: {
      pinterest: {
        record: {
          platform: "pinterest",
          account_label: String(profile.username || profile.business_name || "Pinterest").slice(0, 120),
        },
        secrets: tokenBundle(payload.access_token, payload.refresh_token, payload.expires_in, payload.scope),
      },
    },
  };
}

async function exchangeRedditCode(code, config, fetchImpl) {
  const basic = Buffer.from(`${config.reddit.clientId}:${config.reddit.clientSecret}`).toString("base64");
  const response = await fetchImpl(REDDIT_TOKEN, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
      "user-agent": "PostPath/0.1 by 1stStep.ai",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.reddit.redirectUri,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw mcpError("oauth_failed", "Reddit did not return an access token.", 502);
  }
  const me = await fetchImpl("https://oauth.reddit.com/api/v1/me", {
    headers: {
      authorization: `Bearer ${payload.access_token}`,
      "user-agent": "PostPath/0.1 by 1stStep.ai",
    },
  });
  const profile = await readJson(me);
  return {
    platforms: {
      reddit: {
        record: {
          platform: "reddit",
          account_label: `u/${String(profile.name || "reddit")}`.slice(0, 120),
        },
        secrets: tokenBundle(payload.access_token, payload.refresh_token, payload.expires_in, payload.scope),
      },
    },
  };
}

async function exchangeSnapchatCode(code, config, fetchImpl) {
  const response = await fetchImpl(SNAP_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.snapchat.redirectUri,
      client_id: config.snapchat.clientId,
      client_secret: config.snapchat.clientSecret,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw mcpError("oauth_failed", "Snapchat did not return an access token. Marketing API approval may be required.", 502);
  }
  return {
    platforms: {
      snapchat: {
        record: {
          platform: "snapchat",
          account_label: "Snapchat",
        },
        secrets: tokenBundle(payload.access_token, payload.refresh_token, payload.expires_in, payload.scope),
      },
    },
  };
}

export async function exchangeCode(provider, { code, config, fetchImpl = fetch, codeVerifier, pagePreference = "" } = {}) {
  assertProviderConfigured(provider, config);
  if (provider === "youtube") return exchangeGoogleCode(code, config, fetchImpl, "youtube", codeVerifier);
  if (provider === "google_search") return exchangeGoogleCode(code, config, fetchImpl, "search_data", codeVerifier);
  if (provider === "google_business") return exchangeGoogleCode(code, config, fetchImpl, "google_business", codeVerifier);
  if (provider === "meta") return exchangeMetaCode(code, config, fetchImpl, pagePreference);
  if (provider === "threads") return exchangeThreadsCode(code, config, fetchImpl);
  if (provider === "tiktok") return exchangeTikTokCode(code, config, fetchImpl);
  if (provider === "linkedin") return exchangeLinkedInCode(code, config, fetchImpl);
  if (provider === "x") return exchangeXCode(code, config, fetchImpl, codeVerifier);
  if (provider === "pinterest") return exchangePinterestCode(code, config, fetchImpl);
  if (provider === "reddit") return exchangeRedditCode(code, config, fetchImpl);
  if (provider === "snapchat") return exchangeSnapchatCode(code, config, fetchImpl);
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

export function missingProviders(connections) {
  const have = new Set(connections.map((row) => row.platform));
  const missing = [];
  for (const provider of CONNECT_ORDER) {
    if (provider === "youtube" && !have.has("youtube")) missing.push("youtube");
    else if (provider === "meta" && !(have.has("facebook") && have.has("instagram"))) missing.push("meta");
    else if (provider === "tiktok" && !have.has("tiktok")) missing.push("tiktok");
    else if (provider === "linkedin" && !have.has("linkedin")) missing.push("linkedin");
    else if (provider === "x" && !have.has("x")) missing.push("x");
    else if (provider === "threads" && !have.has("threads")) missing.push("threads");
    else if (provider === "pinterest" && !have.has("pinterest")) missing.push("pinterest");
    else if (provider === "google_business" && !have.has("google_business")) missing.push("google_business");
    else if (provider === "reddit" && !have.has("reddit")) missing.push("reddit");
    else if (provider === "snapchat" && !have.has("snapchat")) missing.push("snapchat");
  }
  return missing;
}

export { requireEnv, PLATFORMS };
