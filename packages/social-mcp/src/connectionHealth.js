/**
 * Expiring-token sweep: one row per brand x network with expiry and health.
 * Reads only public connection metadata (token_meta timestamps/booleans, status).
 * Never decrypts secrets and never returns token values.
 */
export const HEALTH_BRANDS = ["1ststep-ai", "swing-trade-pros", "skillsprout"];
export const HEALTH_NETWORKS = ["youtube", "facebook", "instagram", "x", "tiktok", "pinterest"];

const DAY = 86_400_000;
const WARN_DAYS = 2;

// Refresh-token lifetimes from the platforms' docs (see PR for links).
const RULES = {
  // Google: refresh tokens die 7 days after consent while the OAuth app is in Testing.
  youtube: { refreshDays: (ctx) => (ctx.googleTesting ? 7 : null), source: "google" },
  google_business: { refreshDays: (ctx) => (ctx.googleTesting ? 7 : null), source: "google" },
  // Meta Page tokens from a long-lived user token have no fixed expiry; dev mode is fine for app roles.
  facebook: { refreshDays: () => null, source: "meta" },
  instagram: { refreshDays: () => null, source: "meta" },
  // X: offline.access refresh tokens have no documented fixed lifetime; access tokens last 2 h.
  x: { refreshDays: () => null, source: "x" },
  // TikTok: refresh_expires_in is 365 days.
  tiktok: { refreshDays: () => 365, source: "tiktok" },
  // Pinterest: refresh tokens expire (refresh_token_expires_in, 60 days by default).
  pinterest: { refreshDays: () => 60, source: "pinterest" },
};

function iso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function googleTestingMode(env = process.env) {
  return String(env.POSTPATH_GOOGLE_PUBLISHING_STATUS || "testing").trim().toLowerCase() !== "production";
}

export function connectionHealthRow({ profileId, platform, connection, now = Date.now(), googleTesting = true }) {
  const base = { profile_id: profileId, platform };
  if (!connection) return { ...base, connected: false, health: "not_connected", action: "connect", flags: [] };
  const meta = connection.token_meta || {};
  const rule = RULES[platform] || { refreshDays: () => null };
  const flags = [];
  const authorizedAt = Date.parse(meta.authorized_at || connection.connected_at || "");
  const explicit = Date.parse(meta.refresh_expires_at || "");
  const days = rule.refreshDays({ googleTesting });
  const refreshExpires = Number.isFinite(explicit) ? explicit : days && Number.isFinite(authorizedAt) ? authorizedAt + days * DAY : NaN;
  if (rule.source === "google" && googleTesting) flags.push("google_testing_7_day_refresh");
  if (!meta.has_refresh_token && connection.token_meta) flags.push("no_refresh_token");

  let health = "ok";
  let action = null;
  if (connection.status === "needs_reconnect") {
    health = "needs_reconnect";
    action = "reconnect";
  } else if (Number.isFinite(refreshExpires) && refreshExpires <= now) {
    health = "expired";
    action = "reconnect";
  } else if (Number.isFinite(refreshExpires) && refreshExpires - now <= WARN_DAYS * DAY) {
    health = "expiring_soon";
    action = "reconnect";
  } else if (!connection.has_secrets) {
    health = "needs_reconnect";
    action = "reconnect";
  }
  const accessExpires = Date.parse(meta.access_expires_at || "");
  return {
    ...base,
    connected: true,
    account_label: connection.account_label || null,
    health,
    action,
    flags,
    authorized_at: iso(authorizedAt),
    access_expires_at: iso(accessExpires),
    refresh_expires_at: iso(refreshExpires),
    refresh_expiry_estimated: !Number.isFinite(explicit) && Number.isFinite(refreshExpires),
    days_left: Number.isFinite(refreshExpires) ? Math.floor((refreshExpires - now) / DAY) : null,
    note:
      flags.includes("google_testing_7_day_refresh")
        ? "Google app is in Testing mode: this sign-in stops working 7 days after it was granted. Reconnect weekly, or publish the OAuth consent screen to In production."
        : null,
  };
}

/** Sweep every brand x network. `connections` are store.listConnections() rows (already secret-free). */
export function connectionHealthSweep({ connections = [], profiles = [], now = Date.now(), env = process.env, networks = HEALTH_NETWORKS } = {}) {
  const googleTesting = googleTestingMode(env);
  const brandIds = [...new Set([...HEALTH_BRANDS, ...profiles.map((p) => p.id || p.profile_id).filter(Boolean)])];
  const index = new Map(connections.map((c) => [`${c.profile_id}:${c.platform}`, c]));
  const rows = [];
  for (const profileId of brandIds) {
    for (const platform of networks) {
      rows.push(connectionHealthRow({ profileId, platform, connection: index.get(`${profileId}:${platform}`), now, googleTesting }));
    }
  }
  const count = (h) => rows.filter((r) => r.health === h).length;
  return {
    checked_at: new Date(now).toISOString(),
    google_testing_mode: googleTesting,
    summary: {
      ok: count("ok"),
      expiring_soon: count("expiring_soon"),
      expired: count("expired"),
      needs_reconnect: count("needs_reconnect"),
      not_connected: count("not_connected"),
    },
    rows,
  };
}
