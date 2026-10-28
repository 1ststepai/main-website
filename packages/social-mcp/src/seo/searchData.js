import { mcpError } from "../errors.js";
import { normalizeProfileId } from "../store.js";
import { SEED_PRESETS, seedById } from "./seeds.js";

export const SEARCH_DATA_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANALYTICS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function readBody(response) {
  try {
    if (typeof response.json === "function") return await response.json();
    const text = typeof response.text === "function" ? await response.text() : "";
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function publicQuery(row) {
  return {
    term: String(row.term || "").slice(0, 80),
    source: row.source,
    views: Number.isFinite(row.views) ? row.views : null,
    clicks: Number.isFinite(row.clicks) ? row.clicks : null,
    impressions: Number.isFinite(row.impressions) ? row.impressions : null,
    checked_at: row.checked_at,
  };
}

async function accessToken(ctx, profileId) {
  const secrets = ctx.store.readSecrets(profileId, "search_data");
  if (!secrets?.access_token && !secrets?.refresh_token) return null;
  const expires = Date.parse(secrets.expires_at || "");
  if (secrets.access_token && Number.isFinite(expires) && expires > ctx.now() + 60_000) return secrets.access_token;
  if (!secrets.refresh_token) return secrets.access_token || null;
  const clientId = String(ctx.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(ctx.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId) throw mcpError("oauth_not_configured", "Google sign-in is not configured on this computer.", 503);
  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: secrets.refresh_token,
  });
  if (clientSecret) params.set("client_secret", clientSecret);
  const response = await ctx.fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const payload = await readBody(response);
  if (!response.ok || !payload.access_token) {
    throw mcpError("search_data_auth", "Google did not refresh search access. Connect search data again.", 502);
  }
  const next = {
    ...secrets,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || secrets.refresh_token,
    expires_at: new Date(ctx.now() + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
    scope: payload.scope || secrets.scope || "",
  };
  ctx.store.updateSecrets(profileId, "search_data", next);
  return next.access_token;
}

function analyticsRows(payload, checkedAt) {
  const headers = Array.isArray(payload?.columnHeaders) ? payload.columnHeaders.map((col) => col.name) : [];
  const termIndex = headers.indexOf("insightTrafficSourceDetail");
  const viewsIndex = headers.indexOf("views");
  const rows = [];
  for (const row of Array.isArray(payload?.rows) ? payload.rows : []) {
    const term = String(row[termIndex] ?? row[0] ?? "").trim();
    if (!term) continue;
    const views = Number(row[viewsIndex] ?? row[1]);
    rows.push({
      term: term.slice(0, 80),
      source: "youtube_analytics",
      views: Number.isFinite(views) ? views : null,
      clicks: null,
      impressions: null,
      checked_at: checkedAt,
    });
  }
  return rows;
}

function consoleRows(payload, checkedAt) {
  const rows = [];
  for (const row of Array.isArray(payload?.rows) ? payload.rows : []) {
    const term = String(row.keys?.[0] || "").trim();
    if (!term) continue;
    rows.push({
      term: term.slice(0, 80),
      source: "search_console",
      views: null,
      clicks: Number.isFinite(row.clicks) ? row.clicks : null,
      impressions: Number.isFinite(row.impressions) ? row.impressions : null,
      checked_at: checkedAt,
    });
  }
  return rows;
}

export async function connectSearchData(ctx, input = {}) {
  const profileId = normalizeProfileId(input.profile_id || input.id);
  if (!ctx.store.getProfile(profileId)) {
    const seed = seedById(profileId);
    if (!seed) throw mcpError("unknown_profile", "Save the brand before connecting search data.");
    ctx.store.upsertProfile({ id: seed.id, name: seed.name, presets: SEED_PRESETS });
  }
  if (typeof ctx.connectSearch !== "function") {
    throw mcpError("search_data_unavailable", "Search data sign-in is not available in this process.", 503);
  }
  const started = await ctx.connectSearch(profileId);
  return {
    ...started,
    scopes: SEARCH_DATA_SCOPES,
    separate_from_publish: true,
    message: "This opens a separate Google sign-in for search terms. It does not change the sign-in used for posting.",
  };
}

export function searchDataStatus(store, profileId) {
  const connection = store.getConnection(profileId, "search_data");
  return {
    connected: Boolean(connection && (connection.has_secrets || connection.secrets_enc || connection.status === "connected")),
    account_label: connection?.account_label || "",
    sites: store.readSeo().sites?.[profileId] || [],
  };
}

export async function syncSearchTerms(ctx, input = {}) {
  const profileId = normalizeProfileId(input.profile_id || input.id);
  if (!ctx.store.getProfile(profileId) || !ctx.store.readSecrets(profileId, "search_data")) {
    return {
      connected: false,
      profile_id: profileId,
      queries: [],
      message: "Search data is not connected for this brand.",
    };
  }
  const status = searchDataStatus(ctx.store, profileId);
  const token = await accessToken(ctx, profileId);
  const end = ctx.now();
  const start = end - (Number(input.days) || 28) * 24 * 60 * 60 * 1000;
  const startDate = isoDay(start);
  const endDate = isoDay(end);
  const checkedAt = new Date(end).toISOString();
  const queries = [];
  const failures = [];
  const analyticsUrl = new URL(ANALYTICS_URL);
  analyticsUrl.searchParams.set("ids", "channel==MINE");
  analyticsUrl.searchParams.set("startDate", startDate);
  analyticsUrl.searchParams.set("endDate", endDate);
  analyticsUrl.searchParams.set("metrics", "views");
  analyticsUrl.searchParams.set("dimensions", "insightTrafficSourceDetail");
  analyticsUrl.searchParams.set("filters", "insightTrafficSourceType==YT_SEARCH");
  analyticsUrl.searchParams.set("sort", "-views");
  analyticsUrl.searchParams.set("maxResults", "25");
  try {
    const response = await ctx.fetchImpl(analyticsUrl, { headers: { authorization: `Bearer ${token}` } });
    const payload = await readBody(response);
    if (!response.ok) failures.push("YouTube search terms are unavailable.");
    else queries.push(...analyticsRows(payload, checkedAt));
  } catch {
    failures.push("YouTube search terms are unavailable.");
  }
  const sites = [];
  if (input.site) sites.push(String(input.site));
  for (const site of status.sites) if (!sites.includes(site)) sites.push(site);
  for (const site of sites) {
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
    try {
      const response = await ctx.fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: 25,
        }),
      });
      const payload = await readBody(response);
      if (!response.ok) failures.push(`Search Console terms are unavailable for ${site}.`);
      else queries.push(...consoleRows(payload, checkedAt));
    } catch {
      failures.push(`Search Console terms are unavailable for ${site}.`);
    }
  }
  const stored = queries.map(publicQuery).filter((row) => row.term);
  ctx.store.updateSeo((seo) => {
    seo.queries = seo.queries || {};
    seo.queries[profileId] = stored;
    return stored;
  });
  return {
    connected: true,
    profile_id: profileId,
    queries: stored,
    failures,
    message: stored.length ? "Saved search terms from the connected account." : "No search terms came back.",
  };
}

export function savedSearchTerms(store, profileId) {
  const all = store.readSeo().queries || {};
  if (!profileId) return all;
  return all[profileId] || [];
}
