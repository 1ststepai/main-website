import { mcpError } from "./errors.js";
import { PLATFORMS } from "./home.js";

export const AUTO_POST_RISK_LABEL = "Highest risk: the assistant will post without asking you each time.";

function cleanNetworks(networks) {
  const list = Array.isArray(networks) ? networks.map(String) : [];
  const bad = list.filter((item) => !PLATFORMS.includes(item));
  if (bad.length) throw mcpError("invalid_platform", `Unknown network: ${bad.join(", ")}.`, 400);
  return [...new Set(list)];
}

function blankRow(connectionId) {
  return { connection_id: connectionId, enabled: false, networks: [], enabled_at: null, enabled_by: null, pending_request: null };
}

/** Auto-post for one brand and one connection. Off unless the owner turned it on. */
export function autoPostFor(store, profileId, connectionId) {
  const row = store.readAutoPost()?.[profileId]?.[connectionId];
  return { ...blankRow(connectionId || null), ...(row || {}) };
}

export function listAutoPost(store, profileId) {
  const rows = store.readAutoPost()?.[profileId] || {};
  return Object.values(rows).map((row) => ({ ...blankRow(row.connection_id), ...row }));
}

/** Pure mutation on db.autoPost, so save_brand_context can include it in one atomic write. Never enables. */
export function recordAutoPostRequest(autoPost, { profile_id, connection_id, networks, requested_by, at }) {
  const chosen = cleanNetworks(networks);
  const key = connection_id || "unknown";
  autoPost[profile_id] = autoPost[profile_id] || {};
  const row = { ...blankRow(key), ...(autoPost[profile_id][key] || {}) };
  row.pending_request = chosen.length ? { networks: chosen, requested_at: at, requested_by: requested_by || "assistant" } : null;
  autoPost[profile_id][key] = row;
  return row;
}

export function enableAutoPost(store, { profile_id, connection_id, networks, enabled_by, pilot = false, now = Date.now() }) {
  if (pilot) throw mcpError("pilot_auto_post_disabled", "Auto-post is off in pilot mode. Every draft waits for approval.", 403);
  if (!profile_id || !store.getProfile(profile_id)) throw mcpError("not_found", "Brand not found.", 404);
  if (!connection_id) throw mcpError("invalid_request", "Pick the connection that may auto-post.", 400);
  const chosen = cleanNetworks(networks);
  if (!chosen.length) throw mcpError("invalid_request", "Pick at least one network for auto-post.", 400);
  if (!["desk", "consent"].includes(enabled_by)) throw mcpError("forbidden", "Auto-post can only be turned on by the owner.", 403);
  return store.updateAutoPost((autoPost) => {
    autoPost[profile_id] = autoPost[profile_id] || {};
    const row = { ...blankRow(connection_id), ...(autoPost[profile_id][connection_id] || {}) };
    row.enabled = true;
    row.networks = chosen;
    row.enabled_at = new Date(now).toISOString();
    row.enabled_by = enabled_by;
    row.pending_request = null;
    autoPost[profile_id][connection_id] = row;
    return { ...row };
  });
}

export function disableAutoPost(store, { profile_id, connection_id }) {
  return store.updateAutoPost((autoPost) => {
    const targets = connection_id ? [connection_id] : Object.keys(autoPost[profile_id] || {});
    for (const id of targets) {
      const row = autoPost[profile_id]?.[id];
      if (!row) continue;
      row.enabled = false;
      row.networks = [];
      row.enabled_at = null;
      row.enabled_by = null;
      row.pending_request = null;
    }
    return listAutoPost({ readAutoPost: () => autoPost }, profile_id);
  });
}

export function autoPostAllows(store, { profile_id, connection_id, platform }) {
  if (!connection_id) return false;
  const row = store.readAutoPost()?.[profile_id]?.[connection_id];
  return Boolean(row?.enabled && Array.isArray(row.networks) && row.networks.includes(platform));
}
