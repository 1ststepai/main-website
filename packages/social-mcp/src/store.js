import { closeSync, constants, existsSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { decryptJson, encryptJson, loadOrCreateKey } from "./crypto.js";
import { mcpError } from "./errors.js";
import { paths } from "./home.js";
import { socialId } from "./ids.js";
import { defaultPresets } from "./multiPost.js";

export const POST_STATUSES = [
  "draft",
  "scheduled",
  "approved",
  "publishing",
  "published",
  "handed_off",
  "failed",
  "needs_review",
];

function emptyDb() {
  return {
    version: 1,
    profiles: {},
    connections: {},
    posts: {},
    bundles: {},
    seo: {},
    mcpAuth: emptyMcpAuth(),
    audit: [],
  };
}

function emptyMcpAuth() {
  return { clients: {}, codes: {}, grants: {}, tokens: {}, retiredRefresh: {}, pats: {}, consents: {} };
}

function connectionKey(profileId, platform) {
  return `${profileId}:${platform}`;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withVaultLock(lockFile, fn) {
  const start = Date.now();
  let fd = 0;
  while (!fd) {
    try {
      fd = openSync(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockFile).mtimeMs > 15_000) unlinkSync(lockFile);
      } catch {
        // The other process released the lock between the checks.
      }
      if (Date.now() - start > 5_000) {
        throw mcpError("vault_busy", "Another PostPath process is updating the vault.", 409);
      }
      sleepMs(20);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockFile);
    } catch {
      // Already removed.
    }
  }
}

export function normalizeProfileId(id) {
  const raw = String(id || "").trim().toLowerCase();
  let out = "";
  for (const ch of raw) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "_" || ch === "-") {
      out += ch;
    } else if (out && !out.endsWith("-")) {
      out += "-";
    }
    if (out.length >= 64) break;
  }
  while (out.startsWith("-")) out = out.slice(1);
  while (out.endsWith("-")) out = out.slice(0, -1);
  return out.slice(0, 64);
}

export function createStore({ home, env = process.env, now = () => Date.now() } = {}) {
  const homePaths = paths(home);
  const key = loadOrCreateKey(homePaths, env);
  const lockFile = `${homePaths.dbFile}.lock`;
  let db = loadDb(homePaths.dbFile);
  let loadedStamp = fileStamp(homePaths.dbFile);
  let lockDepth = 0;
  const inFlight = new Set();
  let removed = false;

  function rememberStamp() {
    loadedStamp = fileStamp(homePaths.dbFile);
  }

  function ensureFresh() {
    if (removed || lockDepth > 0) return;
    const stamp = fileStamp(homePaths.dbFile);
    if (stamp === loadedStamp) return;
    db = loadDb(homePaths.dbFile);
    loadedStamp = stamp;
  }

  function locked(fn) {
    if (removed) {
      throw mcpError("vault_removed", "Saved accounts were removed. Quit PostPath and open it again.", 409);
    }
    return withVaultLock(lockFile, () => {
      lockDepth += 1;
      try {
        db = loadDb(homePaths.dbFile);
        rememberStamp();
        return fn();
      } finally {
        lockDepth -= 1;
      }
    });
  }

  function readSeo() {
    ensureFresh();
    const seo = db.seo && typeof db.seo === "object" ? db.seo : {};
    return structuredClone(seo);
  }

  function updateSeo(mutator) {
    return locked(() => {
      if (!db.seo || typeof db.seo !== "object") db.seo = {};
      const result = mutator(db.seo);
      persist();
      return result;
    });
  }

  function readAutoPost() {
    ensureFresh();
    return structuredClone(db.autoPost && typeof db.autoPost === "object" ? db.autoPost : {});
  }

  function readSection(name) {
    ensureFresh();
    return structuredClone(db[name] && typeof db[name] === "object" ? db[name] : {});
  }

  function updateSection(name, mutator) {
    if (!["onboarding", "brandPages", "manageActions", "vidiqUpsell"].includes(name)) throw new Error(`Unknown store section: ${name}`);
    return locked(() => {
      if (!db[name] || typeof db[name] !== "object") db[name] = {};
      const result = mutator(db[name]);
      persist();
      return structuredClone(result);
    });
  }

  function updateAutoPost(mutator) {
    return locked(() => {
      if (!db.autoPost || typeof db.autoPost !== "object") db.autoPost = {};
      const result = mutator(db.autoPost);
      persist();
      return result;
    });
  }

  /** All-or-nothing change: the mutator gets the live db; any throw restores the previous copy and nothing is written. */
  function atomic(mutator) {
    return locked(() => {
      const backup = structuredClone(db);
      atomicDepth += 1;
      let result;
      try {
        result = mutator(db, { upsertProfile: upsertProfileBody });
      } catch (error) {
        db = backup;
        throw error;
      } finally {
        atomicDepth -= 1;
      }
      persist();
      return result;
    });
  }

  function forgetVault() {
    if (!removed) {
      locked(() => {
        removed = true;
        db = emptyDb();
      });
    }
    rmSync(homePaths.root, { recursive: true, force: true });
    return { removed: true, path: homePaths.root };
  }

  let atomicDepth = 0;

  function persist() {
    if (atomicDepth > 0) return;
    const tmp = `${homePaths.dbFile}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, homePaths.dbFile);
    rememberStamp();
  }

  function listProfiles() {
    ensureFresh();
    return Object.values(db.profiles).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getProfile(profileId) {
    ensureFresh();
    return db.profiles[String(profileId || "")] || null;
  }

  function upsertProfile({ id, name, require_vidiq, presets } = {}) {
    return locked(() => upsertProfileBody({ id, name, require_vidiq, presets }));
  }

  function upsertProfileBody({ id, name, require_vidiq, presets } = {}) {
    const profileId = normalizeProfileId(id);
    if (profileId.length < 2 || !/^[a-z0-9]/.test(profileId)) {
      throw mcpError("invalid_profile", "Profile id must be 2–64 chars: letters, numbers, _ or -.");
    }
    const stamp = new Date(now()).toISOString();
    const existing = db.profiles[profileId];
    const profile = {
      ...(existing || {}),
      id: profileId,
      name: String(name || existing?.name || profileId).trim().slice(0, 120) || profileId,
      created_at: existing?.created_at || stamp,
      updated_at: stamp,
      presets: existing?.presets || defaultPresets(),
    };
    if (typeof require_vidiq === "boolean") profile.require_vidiq = require_vidiq;
    else if (profile.require_vidiq === undefined && profileId === "1ststep-ai") profile.require_vidiq = true;
    if (presets && typeof presets === "object") {
      profile.presets = { ...defaultPresets(), ...existing?.presets, ...presets };
    }
    db.profiles[profileId] = profile;
    persist();
    return profile;
  }

  function listConnections(profileId) {
    ensureFresh();
    return Object.values(db.connections)
      .filter((row) => !profileId || row.profile_id === profileId)
      .map(publicConnection);
  }

  function getConnection(profileId, platform) {
    ensureFresh();
    return db.connections[connectionKey(profileId, platform)] || null;
  }

  function saveConnection(record, secrets) {
    return locked(() => saveConnectionBody(record, secrets));
  }

  function saveConnectionBody(record, secrets) {
    const stamp = new Date(now()).toISOString();
    const keyName = connectionKey(record.profile_id, record.platform);
    const existing = db.connections[keyName];
    db.connections[keyName] = {
      ...record,
      secrets_enc: encryptJson(secrets, `conn:${record.platform}`, key),
      connected_at: existing?.connected_at || stamp,
      updated_at: stamp,
    };
    persist();
    return publicConnection(db.connections[keyName]);
  }

  function readSecrets(profileId, platform) {
    const row = getConnection(profileId, platform);
    if (!row?.secrets_enc) return null;
    return decryptJson(row.secrets_enc, `conn:${platform}`, key);
  }

  function updateSecrets(profileId, platform, secrets) {
    locked(() => {
      const row = getConnection(profileId, platform);
      if (!row) throw mcpError("not_connected", `${platform} is not connected for this profile.`, 409);
      row.secrets_enc = encryptJson(secrets, `conn:${platform}`, key);
      row.updated_at = new Date(now()).toISOString();
      persist();
    });
  }

  function updateConnection(profileId, platform, patch) {
    return locked(() => updateConnectionBody(profileId, platform, patch));
  }

  function updateConnectionBody(profileId, platform, patch) {
    const row = getConnection(profileId, platform);
    if (!row) return null;
    const safe = { ...patch };
    delete safe.secrets_enc;
    delete safe.profile_id;
    delete safe.platform;
    Object.assign(row, safe, { updated_at: new Date(now()).toISOString() });
    persist();
    return publicConnection(row);
  }

  function deleteConnection(profileId, platform) {
    locked(() => {
      delete db.connections[connectionKey(profileId, platform)];
      persist();
    });
  }

  function listPosts({ profileId, status } = {}) {
    ensureFresh();
    return Object.values(db.posts)
      .filter((post) => !profileId || post.profile_id === profileId)
      .filter((post) => !status || post.status === status)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .map(publicPost);
  }

  function getPost(postId) {
    ensureFresh();
    return db.posts[String(postId || "")] || null;
  }

  function savePost(post, { create = false } = {}) {
    return locked(() => {
      if (create && db.posts[post.id]) {
        throw mcpError("conflict", "Post already exists.", 409);
      }
      if (!POST_STATUSES.includes(post.status)) {
        throw mcpError("invalid_status", `Unknown post status ${post.status}.`, 409);
      }
      db.posts[post.id] = post;
      persist();
      return publicPost(post);
    });
  }

  function claimPost(postId, fromStatuses) {
    return locked(() => {
      const id = String(postId || "");
      const post = db.posts[id];
      if (!post) return { ok: false, reason: "not_found" };
      if (inFlight.has(id)) return { ok: false, reason: "in_flight", status: post.status };
      if (!fromStatuses.includes(post.status)) return { ok: false, reason: "status", status: post.status };
      post.status = "publishing";
      post.error = null;
      post.updated_at = new Date(now()).toISOString();
      inFlight.add(id);
      persist();
      return { ok: true, post };
    });
  }

  function compareAndSetPost(postId, fromStatuses, mutate) {
    return locked(() => {
      const post = db.posts[String(postId || "")];
      if (!post) return { ok: false, reason: "not_found" };
      if (!fromStatuses.includes(post.status)) return { ok: false, reason: "status", status: post.status };
      mutate(post);
      if (!POST_STATUSES.includes(post.status)) {
        throw mcpError("invalid_status", `Unknown post status ${post.status}.`, 409);
      }
      post.updated_at = new Date(now()).toISOString();
      persist();
      return { ok: true, post };
    });
  }

  function releaseClaim(postId) {
    inFlight.delete(String(postId || ""));
  }

  function isClaimed(postId) {
    return inFlight.has(String(postId || ""));
  }

  function listBundles() {
    ensureFresh();
    return Object.values(db.bundles || {}).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  function getBundle(bundleId) {
    ensureFresh();
    return (db.bundles || {})[String(bundleId || "")] || null;
  }

  function saveBundle(bundle) {
    return locked(() => {
      if (!db.bundles) db.bundles = {};
      db.bundles[bundle.id] = bundle;
      persist();
      return { ...bundle };
    });
  }

  function deletePost(postId) {
    return locked(() => {
      delete db.posts[String(postId || "")];
      persist();
    });
  }

  function deleteBundle(bundleId) {
    return locked(() => {
      if (!db.bundles) return;
      delete db.bundles[String(bundleId || "")];
      persist();
    });
  }

  function readMcpAuth() {
    ensureFresh();
    if (!db.mcpAuth) db.mcpAuth = emptyMcpAuth();
    return db.mcpAuth;
  }

  function withMcpAuth(mutator) {
    return locked(() => {
      if (!db.mcpAuth) db.mcpAuth = emptyMcpAuth();
      try {
        return mutator(db.mcpAuth);
      } finally {
        persist();
      }
    });
  }

  function appendAudit(entry) {
    locked(() => {
      db.audit.push(entry);
      if (db.audit.length > 1000) db.audit = db.audit.slice(-1000);
      persist();
    });
  }

  function exportPublic() {
    return {
      profiles: listProfiles(),
      connections: listConnections(),
      posts: listPosts(),
    };
  }

  return {
    key,
    homePaths,
    listProfiles,
    getProfile,
    upsertProfile,
    listConnections,
    getConnection,
    saveConnection,
    readSecrets,
    updateSecrets,
    updateConnection,
    deleteConnection,
    listPosts,
    getPost,
    savePost,
    deletePost,
    listBundles,
    getBundle,
    saveBundle,
    deleteBundle,
    readMcpAuth,
    withMcpAuth,
    claimPost,
    compareAndSetPost,
    releaseClaim,
    isClaimed,
    appendAudit,
    readSeo,
    updateSeo,
    readAutoPost,
    readSection,
    updateSection,
    updateAutoPost,
    atomic,
    exportPublic,
    forgetVault,
    newId: socialId,
  };
}

function fileStamp(file) {
  try {
    const stat = statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function loadDb(file) {
  if (!existsSync(file)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return {
      ...emptyDb(),
      ...parsed,
      profiles: parsed.profiles || {},
      connections: parsed.connections || {},
      posts: parsed.posts || {},
      bundles: parsed.bundles || {},
      seo: parsed.seo && typeof parsed.seo === "object" ? parsed.seo : {},
      mcpAuth: { ...emptyMcpAuth(), ...(parsed.mcpAuth || {}) },
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    };
  } catch {
    throw mcpError("db_corrupt", "Local PostPath database could not be read.", 503);
  }
}

function publicConnection(row) {
  if (!row) return null;
  const { secrets_enc, ...rest } = row;
  return {
    ...rest,
    has_secrets: Boolean(secrets_enc),
  };
}

function publicPost(post) {
  if (!post) return null;
  return { ...post };
}
