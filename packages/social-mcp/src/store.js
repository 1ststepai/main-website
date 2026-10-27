import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { decryptJson, encryptJson, loadOrCreateKey } from "./crypto.js";
import { mcpError } from "./errors.js";
import { paths } from "./home.js";
import { socialId } from "./ids.js";

function emptyDb() {
  return {
    version: 1,
    profiles: {},
    connections: {},
    posts: {},
    audit: [],
  };
}

export function createStore({ home, env = process.env, now = () => Date.now() } = {}) {
  const homePaths = paths(home);
  const key = loadOrCreateKey(homePaths, env);
  let db = loadDb(homePaths.dbFile);

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
    const profileId = String(id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(profileId)) {
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

  function connectionKey(profileId, platform) {
    return `${profileId}:${platform}`;
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
    const row = getConnection(profileId, platform);
    if (!row) throw mcpError("not_connected", `${platform} is not connected for this profile.`, 409);
    row.secrets_enc = encryptJson(secrets, `conn:${platform}`, key);
    row.updated_at = new Date(now()).toISOString();
    persist();
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
    if (create && db.posts[post.id]) {
      throw mcpError("conflict", "Post already exists.", 409);
    }
    db.posts[post.id] = post;
    persist();
    return publicPost(post);
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
    deleteConnection,
    listPosts,
    getPost,
    savePost,
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
    throw mcpError("db_corrupt", "Local social-mcp database could not be read.", 503);
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
