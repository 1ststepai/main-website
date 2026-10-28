import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mcpError } from "../errors.js";
import { actionSpec, isDestructive, requiredScopes, API_LIMITS, MANAGE_ACTIONS } from "./actions.js";
import { EXECUTORS } from "./executors.js";
import { accessStatus, hasScopes } from "./scopes.js";

/** Publish mode "mock": every account action succeeds locally and calls no network. */
export function mockManageExecutors() {
  return Object.fromEntries(Object.keys(MANAGE_ACTIONS).map((type) => [type, async (_ctx, params) => ({ mock: true, type, ...Object.fromEntries(Object.entries(params).filter(([key]) => key.endsWith("_id"))) })]));
}

export const MANAGE_STATUSES = ["pending_approval", "awaiting_confirm", "executing", "done", "failed", "discarded"];
const CONFIRM_TTL_MS = 5 * 60 * 1000;

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function sameHash(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** The words the owner types to confirm a destructive action. */
export function confirmPhrase(action) {
  return action.type.endsWith("set_visibility") ? action.params.privacy_status.toUpperCase() : "DELETE";
}

function publicAction(row) {
  if (!row) return null;
  const { confirm, ...rest } = row;
  return { ...rest, awaiting_confirm_until: confirm?.expires_at || null };
}

/**
 * Account changes (edit, delete, moderate, follow) live in their own approval queue.
 * Nothing here runs without the owner: an assistant can only queue. Auto-post never applies.
 */
export function createManageQueue({ store, getConfig, fetchImpl, mediaRoot, now = () => Date.now(), pilotOn = () => false, emit = () => {}, executors = EXECUTORS, sleep }) {
  function all() {
    return store.readSection("manageActions");
  }

  function list({ profile_id, status } = {}) {
    return Object.values(all())
      .filter((row) => !profile_id || row.profile_id === profile_id)
      .filter((row) => !status || row.status === status)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(publicAction);
  }

  function get(id) {
    const row = all()[id];
    if (!row) throw mcpError("not_found", "Account action not found.", 404);
    return row;
  }

  function queue({ profile_id, type, params = {}, source = "desk", note = "" } = {}) {
    if (!profile_id || !store.getProfile(profile_id)) throw mcpError("not_found", "Brand not found.", 404);
    const spec = actionSpec(type);
    const clean = Object.fromEntries(Object.entries(spec.validate(params || {})).filter(([, v]) => v !== undefined));
    const connection = store.getConnection(profile_id, spec.platform);
    const missing = connection ? hasScopes(connection, requiredScopes(type, clean)) : requiredScopes(type, clean);
    const stamp = new Date(now()).toISOString();
    const row = {
      id: store.newId("act"),
      profile_id,
      platform: spec.platform,
      type,
      label: spec.label,
      summary: spec.summary(clean),
      params: clean,
      destructive: isDestructive(type, clean),
      status: "pending_approval",
      source: ["desk", "mcp"].includes(source) ? source : "mcp",
      note: String(note || "").slice(0, 500),
      missing_scopes: missing,
      connected: Boolean(connection),
      created_at: stamp,
      updated_at: stamp,
      result: null,
      error: null,
    };
    store.updateSection("manageActions", (rows) => {
      rows[row.id] = row;
    });
    emit("action_queued", { action_id: row.id, platform: row.platform, action_type: type, destructive: row.destructive, source: row.source });
    return { action: publicAction(row), next_step: "The owner approves this in the PostPath desk. Nothing has changed on the account yet." };
  }

  function discard({ id }) {
    const row = get(id);
    if (!["pending_approval", "awaiting_confirm", "failed"].includes(row.status)) throw mcpError("invalid_status", "That action can no longer be discarded.", 409);
    const updated = store.updateSection("manageActions", (rows) => {
      rows[id] = { ...rows[id], status: "discarded", confirm: null, updated_at: new Date(now()).toISOString() };
      return rows[id];
    });
    emit("action_discarded", { action_id: id, action_type: row.type });
    return { action: publicAction(updated) };
  }

  /**
   * Owner approval. A destructive action needs two calls: the first returns a
   * confirm_nonce and the phrase to type; the second sends both back.
   */
  async function approve({ id, confirm_nonce, confirm_text, approved_by } = {}) {
    if (approved_by !== "desk") throw mcpError("forbidden", "Only the owner can approve account changes, in the PostPath desk.", 403);
    if (pilotOn()) throw mcpError("pilot_publish_disabled", "Account changes are off in pilot mode.", 403);
    const row = get(id);
    if (!["pending_approval", "awaiting_confirm", "failed"].includes(row.status)) throw mcpError("invalid_status", "That action can no longer be approved.", 409);

    if (row.destructive) {
      const pending = row.status === "awaiting_confirm" && row.confirm && Date.parse(row.confirm.expires_at) > now();
      if (!pending || !confirm_nonce) {
        const nonce = randomBytes(16).toString("hex");
        const phrase = confirmPhrase(row);
        const expires = new Date(now() + CONFIRM_TTL_MS).toISOString();
        store.updateSection("manageActions", (rows) => {
          rows[id] = { ...rows[id], status: "awaiting_confirm", confirm: { nonce_hash: hash(nonce), phrase, expires_at: expires }, updated_at: new Date(now()).toISOString() };
        });
        emit("action_confirm_requested", { action_id: id, action_type: row.type });
        return { needs_confirm: true, confirm_nonce: nonce, confirm_phrase: phrase, expires_at: expires, action: publicAction(get(id)), message: `This cannot be undone. Type ${phrase} to confirm.` };
      }
      if (!sameHash(hash(confirm_nonce), row.confirm.nonce_hash)) throw mcpError("confirm_mismatch", "That confirmation is not for this action. Start again.", 409);
      if (String(confirm_text || "").trim() !== row.confirm.phrase) throw mcpError("confirm_mismatch", `Type ${row.confirm.phrase} exactly to confirm.`, 400);
    }
    return execute(row);
  }

  async function execute(row) {
    const connection = store.getConnection(row.profile_id, row.platform);
    if (!connection) throw mcpError("not_connected", `${row.platform} is not connected for this brand.`, 409);
    const missing = hasScopes(connection, requiredScopes(row.type, row.params));
    if (missing.length) {
      throw Object.assign(mcpError("needs_reconnect", `Reconnect ${row.platform} for full access first. Missing: ${missing.join(", ")}.`, 409), { details: { missing } });
    }
    const claimed = store.updateSection("manageActions", (rows) => {
      if (!["pending_approval", "awaiting_confirm", "failed"].includes(rows[row.id]?.status)) return null;
      rows[row.id] = { ...rows[row.id], status: "executing", confirm: null, approved_at: new Date(now()).toISOString(), updated_at: new Date(now()).toISOString() };
      return rows[row.id];
    });
    if (!claimed) throw mcpError("dispatch_started", "That action is already running.", 409);
    emit("action_approved", { action_id: row.id, action_type: row.type, destructive: row.destructive });
    const secrets = store.readSecrets(row.profile_id, row.platform);
    const ctx = {
      connection,
      secrets: secrets || {},
      config: getConfig(),
      fetchImpl,
      mediaRoot,
      sleep,
      onSecrets: async (next) => store.updateSecrets(row.profile_id, row.platform, next),
      onNeedsReconnect: async () => store.updateConnection(row.profile_id, row.platform, { status: "needs_reconnect" }),
    };
    try {
      const run = executors[row.type];
      if (!run) throw mcpError("invalid_action", `No runner for ${row.type}.`, 500);
      const result = await run(ctx, row.params);
      const done = store.updateSection("manageActions", (rows) => {
        rows[row.id] = { ...rows[row.id], status: "done", result, error: null, updated_at: new Date(now()).toISOString() };
        return rows[row.id];
      });
      store.appendAudit({ id: store.newId("aud"), at: new Date(now()).toISOString(), action: "account_change", profile_id: row.profile_id, platform: row.platform, detail: row.summary });
      emit("action_done", { action_id: row.id, platform: row.platform, action_type: row.type, url: result?.url || null });
      return { action: publicAction(done) };
    } catch (error) {
      const failed = store.updateSection("manageActions", (rows) => {
        rows[row.id] = { ...rows[row.id], status: "failed", error: { code: error.code || "failed", message: String(error.message || error).slice(0, 300) }, updated_at: new Date(now()).toISOString() };
        return rows[row.id];
      });
      emit("action_failed", { action_id: row.id, platform: row.platform, action_type: row.type, code: error.code || "failed" });
      error.action = publicAction(failed);
      throw error;
    }
  }

  function view(profileId) {
    return {
      access: profileId ? accessStatus(store, profileId) : [],
      actions: list({ profile_id: profileId }),
      catalog: Object.entries(MANAGE_ACTIONS).map(([type, spec]) => ({ type, platform: spec.platform, label: spec.label, destructive: spec.destructive === true ? true : typeof spec.destructive === "function" ? "depends" : false })),
      limits: API_LIMITS,
    };
  }

  return { queue, list, approve, discard, view, types: Object.keys(MANAGE_ACTIONS) };
}
