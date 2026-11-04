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

/** Row key for auto-post that applies to every assistant on one brand + network. */
export const ANY_ASSISTANT = "*";

function rowAllows(row, platform) {
  return Boolean(row?.enabled && Array.isArray(row.networks) && row.networks.includes(platform));
}

export function autoPostAllows(store, { profile_id, connection_id, platform }) {
  const rows = store.readAutoPost()?.[profile_id] || {};
  if (rowAllows(rows[ANY_ASSISTANT], platform)) return true;
  if (!connection_id || connection_id === ANY_ASSISTANT) return false;
  return rowAllows(rows[connection_id], platform);
}

export const OWNER_ONLY_NOTE =
  "Approving, publishing, scheduling, disconnecting accounts, deleting, and changing auto-post settings need the owner on the PostPath desk with their owner PIN. The one exception: publishing on a brand and network where the owner turned auto-post on. An assistant cannot turn auto-post on, cannot approve on the owner's behalf, and has no other way around this.";

export function publishRefusalMessage(targets = []) {
  const where = targets.length ? ` (${targets.map((t) => `${t.profile_id} on ${t.platform}`).join(", ")})` : "";
  return `Not published. Auto-post is off for this brand and network${where}, so the post stays in the approval queue. The owner reviews and approves it on the PostPath desk. Tell the user it is waiting for them there.`;
}

/**
 * Brand + network mode, set only from the desk by the owner. Turning it on needs
 * enabled_by "desk"; the desk route checks the owner PIN (or an explicit confirm when no PIN is set).
 */
export function setNetworkAutoPost(store, { profile_id, platform, enabled, enabled_by = null, now = Date.now() }) {
  if (!profile_id || !store.getProfile(profile_id)) throw mcpError("not_found", "Brand not found.", 404);
  if (!PLATFORMS.includes(platform)) throw mcpError("invalid_platform", `Unknown network: ${platform}.`, 400);
  if (enabled && enabled_by !== "desk") throw mcpError("forbidden", "Auto-post can only be turned on by the owner on the desk.", 403);
  return store.updateAutoPost((autoPost) => {
    autoPost[profile_id] = autoPost[profile_id] || {};
    const row = { ...blankRow(ANY_ASSISTANT), ...(autoPost[profile_id][ANY_ASSISTANT] || {}) };
    const set = new Set(row.networks || []);
    if (enabled) set.add(platform);
    else set.delete(platform);
    row.networks = [...set];
    row.enabled = row.networks.length > 0;
    row.enabled_at = row.enabled ? row.enabled_at || new Date(now).toISOString() : null;
    row.enabled_by = row.enabled ? "desk" : null;
    autoPost[profile_id][ANY_ASSISTANT] = row;
    return { ...row };
  });
}

/** Mode for one brand + network: "auto" only when the owner turned it on there. */
export function networkMode(store, profileId, platform) {
  const rows = store.readAutoPost()?.[profileId] || {};
  if (rowAllows(rows[ANY_ASSISTANT], platform)) return "auto";
  const some = Object.entries(rows).some(([id, row]) => id !== ANY_ASSISTANT && rowAllows(row, platform));
  return some ? "auto_for_some_connections" : "review";
}

const ACTIVITY_CAP = 500;

export function logAutoPostActivity(store, { post, connection_id = null, assistant = "assistant", now = Date.now() }) {
  const entry = {
    at: new Date(now).toISOString(),
    profile_id: post.profile_id,
    platform: post.platform,
    post_id: post.id,
    title: String(post.title || post.caption || "").slice(0, 120),
    status: post.status || null,
    published_url: post.published_url || null,
    connection_id,
    assistant: String(assistant || "assistant").slice(0, 120),
  };
  return store.updateSection("autoPostActivity", (data) => {
    data.entries = Array.isArray(data.entries) ? data.entries : [];
    data.entries.push(entry);
    data.entries = data.entries.slice(-ACTIVITY_CAP);
    return entry;
  });
}

export function listAutoPostActivity(store, { limit = 50 } = {}) {
  const entries = store.readSection("autoPostActivity").entries || [];
  return entries.slice(-limit).reverse();
}
