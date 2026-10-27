import { closeSync, constants, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { decryptJson, encryptJson, loadOrCreateKey } from "./crypto.js";
import { mcpError } from "./errors.js";
import { paths } from "./home.js";
import { socialId } from "./ids.js";

export const POST_STATUSES = [
  "draft",
  "scheduled",
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
    audit: [],
  };
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
  const inFlight = new Set();

  function locked(fn) {
    return withVaultLock(lockFile, () => {
      db = loadDb(homePaths.dbFile);
      return fn();
    });
  }

  function persist() {
    const tmp = `${homePaths.dbFile}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, homePaths.dbFile);
  }

  function listProfiles() {
    return Object.values(db.profiles).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getProfile(profileId) {
    return db.profiles[String(profileId || "")] || null;
  }

  function upsertProfile({ id, name }) {
    const profileId = normalizeProfileId(id);
    if (profileId.length < 2 || !/^[a-z0-9]/.test(profileId)) {
      throw mcpError("invalid_profile", "Profile id must be 2–64 chars: letters, numbers, _ or -.");
    }
    const stamp = new Date(now()).toISOString();
    const existing = db.profiles[profileId];
    const profile = {
      id: profileId,
      name: String(name || existing?.name || profileId).trim().slice(0, 120) || profileId,
      created_at: existing?.created_at || stamp,
      updated_at: stamp,
    };
    db.profiles[profileId] = profile;
    persist();
    return profile;
  }

  function listConnections(profileId) {
    return Object.values(db.connections)
      .filter((row) => !profileId || row.profile_id === profileId)
      .map(publicConnection);
  }

  function getConnection(profileId, platform) {
    return db.connections[connectionKey(profileId, platform)] || null;
  }

  function saveConnection(record, secrets) {
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
    delete db.connections[connectionKey(profileId, platform)];
    persist();
  }

  function listPosts({ profileId, status } = {}) {
    return Object.values(db.posts)
      .filter((post) => !profileId || post.profile_id === profileId)
      .filter((post) => !status || post.status === status)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .map(publicPost);
  }

  function getPost(postId) {
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

  function appendAudit(entry) {
    db.audit.push(entry);
    if (db.audit.length > 1000) db.audit = db.audit.slice(-1000);
    persist();
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
    claimPost,
    compareAndSetPost,
    releaseClaim,
    isClaimed,
    appendAudit,
    exportPublic,
    newId: socialId,
  };
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
