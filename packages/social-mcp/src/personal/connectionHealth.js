/**
 * Personal desk: connection health for Evan's three brands × six networks.
 *
 * INTERFACE for the platforms lane (cursor/pp-prod-platforms):
 *   A connection row may carry any of these optional, non-secret fields and the grid will use them:
 *     refresh_expires_at  ISO time the sign-in stops working (e.g. Google Testing mode: sign-in + 7 days)
 *     signed_in_at        ISO time of the last full browser sign-in (falls back to updated_at, then connected_at)
 *     status              "needs_reconnect" when a publish/refresh hit invalid_grant (already set today)
 *   Or register a per-network function with registerHealthProbe(platform, fn), where
 *     fn(connection, { now }) => { state?, expires_at?, note? } | null
 *   Returning null keeps the default rules below. Probes must never read or return token material.
 */

export const PERSONAL_BRANDS = [
  { id: "1ststep-ai", name: "1stStep.ai" },
  { id: "swing-trade-pros", name: "Swing Trade Pros" },
  { id: "skillsprout", name: "SkillSprout" },
];

export const GRID_NETWORKS = ["youtube", "facebook", "instagram", "x", "tiktok", "pinterest"];

export const NETWORK_LABELS = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  tiktok: "TikTok",
  pinterest: "Pinterest",
};

/** Which app (OAuth client) a network needs; matches oauthReady() keys in desk/server.js. */
export const NETWORK_APP = {
  youtube: "google",
  facebook: "meta",
  instagram: "meta",
  x: "x",
  tiktok: "tiktok",
  pinterest: "pinterest",
};

export const STATES = ["connected", "expiring", "expired", "not_connected", "needs_app"];

const DAY = 86_400_000;
export const GOOGLE_TESTING_DAYS = 7;
export const EXPIRING_WINDOW_MS = 2 * DAY;

const probes = new Map();

export function registerHealthProbe(platform, fn) {
  if (!GRID_NETWORKS.includes(platform) || typeof fn !== "function") throw new Error("bad health probe");
  probes.set(platform, fn);
  return () => probes.delete(platform);
}

function time(value) {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {object|null} connection public connection row (no secrets)
 * @param {object} opts { platform, appReady: boolean, now: ms, googleTesting: boolean }
 * @returns {{ state, expires_at, note }}
 */
export function connectionHealth(connection, { platform, appReady = true, now = Date.now(), googleTesting = true } = {}) {
  if (!connection) {
    return appReady
      ? { state: "not_connected", expires_at: null, note: "" }
      : { state: "needs_app", expires_at: null, note: appNote(platform) };
  }
  const probe = probes.get(platform);
  if (probe) {
    const out = probe(connection, { now });
    if (out && STATES.includes(out.state)) return { expires_at: null, note: "", ...out };
  }
  if (connection.status === "needs_reconnect") {
    return { state: "expired", expires_at: null, note: platform === "youtube" ? "Google ended the sign-in. Reconnect." : "Sign-in stopped working. Reconnect." };
  }
  let expires = time(connection.refresh_expires_at);
  if (expires == null && platform === "youtube" && googleTesting) {
    const signedIn = time(connection.signed_in_at) ?? time(connection.updated_at) ?? time(connection.connected_at);
    if (signedIn != null) expires = signedIn + GOOGLE_TESTING_DAYS * DAY;
  }
  const expires_at = expires == null ? null : new Date(expires).toISOString();
  if (expires != null && expires <= now) return { state: "expired", expires_at, note: "Sign-in expired. Reconnect." };
  if (expires != null && expires - now <= EXPIRING_WINDOW_MS) {
    return { state: "expiring", expires_at, note: `Expires in ${Math.max(1, Math.ceil((expires - now) / 3_600_000))} h.` };
  }
  return { state: "connected", expires_at, note: connection.account_label || "" };
}

function appNote(platform) {
  if (platform === "x") return "Save your own X app (paid API tier) first.";
  if (platform === "tiktok") return "Save your TikTok app first. Posts stay private until TikTok audits it.";
  if (platform === "pinterest") return "Save your Pinterest app first.";
  if (platform === "youtube") return "Save your Google app first.";
  return "Save your Meta app first.";
}

/** Build the 3 × 6 grid. listConnections(profileId) returns public rows; appReady is oauthReady(). */
export function connectionGrid({ listConnections, appReady = {}, now = Date.now(), googleTesting = true }) {
  const rows = PERSONAL_BRANDS.map((brand) => {
    const conns = listConnections(brand.id) || [];
    const cells = GRID_NETWORKS.map((platform) => {
      const conn = conns.find((row) => row.platform === platform) || null;
      const health = connectionHealth(conn, { platform, appReady: Boolean(appReady[NETWORK_APP[platform]]), now, googleTesting });
      return { platform, label: NETWORK_LABELS[platform], account: conn?.account_label || "", ...health };
    });
    return { brand_id: brand.id, brand_name: brand.name, cells };
  });
  return { networks: GRID_NETWORKS.map((id) => ({ id, label: NETWORK_LABELS[id] })), rows, youtube_nudge: youtubeNudge(rows, now) };
}

/** Weekly reminder while Google is in Testing mode: any YouTube cell connected, expiring or expired. */
export function youtubeNudge(rows, now = Date.now()) {
  const due = [];
  for (const row of rows) {
    const cell = row.cells.find((c) => c.platform === "youtube");
    if (!cell || !["expiring", "expired"].includes(cell.state)) continue;
    due.push({ brand_id: row.brand_id, brand_name: row.brand_name, state: cell.state, expires_at: cell.expires_at });
  }
  if (!due.length) return null;
  return {
    brands: due,
    message: "Google Testing mode ends YouTube sign-ins every 7 days. Reconnect YouTube for: " + due.map((d) => d.brand_name).join(", ") + ".",
  };
}

/** Normalise a PAT brand list. Shared field name with the security lane: `brands` = brand ids or ["*"]. */
export function normalizeBrands(value) {
  if (value == null) return ["*"];
  const list = (Array.isArray(value) ? value : [value]).map((v) => String(v).trim()).filter(Boolean);
  if (!list.length) {
    const error = new Error("Pick at least one brand.");
    error.statusCode = 400;
    throw error;
  }
  if (list.includes("*")) return ["*"];
  const known = new Set(PERSONAL_BRANDS.map((b) => b.id));
  const bad = list.filter((id) => !known.has(id));
  if (bad.length) {
    const error = new Error(`Unknown brand: ${bad.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
  return [...new Set(list)];
}
