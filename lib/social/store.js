import { fetchWithTimeout } from "../http/fetchWithTimeout.js";
import { socialError } from "./errors.js";

const memory = { current: null };

export function createMemorySocialKv() {
  const values = new Map();
  const expires = new Map();
  return {
    async get(key) {
      const expiry = expires.get(key);
      if (expiry && expiry <= Date.now()) {
        values.delete(key);
        expires.delete(key);
        return null;
      }
      return values.has(key) ? values.get(key) : null;
    },
    async take(key) {
      const expiry = expires.get(key);
      const value = expiry && expiry <= Date.now() ? null : (values.get(key) ?? null);
      values.delete(key);
      expires.delete(key);
      return value;
    },
    async set(key, value, ttlSeconds) {
      values.set(key, String(value));
      if (ttlSeconds) expires.set(key, Date.now() + ttlSeconds * 1000);
      else expires.delete(key);
    },
    async del(key) {
      values.delete(key);
      expires.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

export function useSocialStore(store) {
  memory.current = store;
}

export function resetSocialStore() {
  memory.current = null;
}

function kvConfiguration() {
  const url = String(process.env.KV_REST_API_URL || "");
  const token = String(process.env.KV_REST_API_TOKEN || "");
  if (!url || !token) {
    throw socialError(503, "social_not_configured", "Admin storage is not configured");
  }
  const parsed = new URL(url);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local) {
    throw socialError(503, "social_not_configured", "KV_REST_API_URL must use HTTPS");
  }
  return { url: parsed.toString().replace(/\/$/, ""), token };
}

async function command(parts) {
  const { url, token } = kvConfiguration();
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parts),
  }, 5000);
  if (!response.ok) {
    throw socialError(503, "social_storage_unavailable", "Social storage is unavailable.");
  }
  const payload = await response.json();
  if (payload.error) throw socialError(503, "social_storage_unavailable", "Social storage is unavailable.");
  return payload;
}

export async function kvGet(key) {
  if (memory.current) return memory.current.get(key);
  const response = await command(["GET", key]);
  return response.result == null ? null : String(response.result);
}

export async function kvSet(key, value, ttlSeconds) {
  if (memory.current) return memory.current.set(key, value, ttlSeconds);
  if (ttlSeconds) await command(["SET", key, String(value), "EX", String(ttlSeconds)]);
  else await command(["SET", key, String(value)]);
}

export async function kvDel(key) {
  if (memory.current) return memory.current.del(key);
  await command(["DEL", key]);
}

async function readJson(key, fallback) {
  const raw = await kvGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function postKey(id) {
  return `social:v1:post:${id}`;
}

function indexKey(brandId) {
  return `social:v1:index:${brandId}`;
}

export async function getPost(id) {
  if (!id) return null;
  const raw = await kvGet(postKey(id));
  if (!raw) return null;
  try {
    const post = JSON.parse(raw);
    return post && typeof post === "object" ? post : null;
  } catch {
    return null;
  }
}

export async function listPosts(brandId) {
  const ids = await readJson(indexKey(brandId), []);
  if (!Array.isArray(ids)) return [];
  const posts = [];
  for (const id of ids) {
    const post = await getPost(id);
    if (post && post.brand_id === brandId) posts.push(post);
  }
  return posts;
}

export async function savePost(post, { create = false, indexLimit = 500 } = {}) {
  if (create) {
    const ids = await readJson(indexKey(post.brand_id), []);
    if (Array.isArray(ids) && ids.length >= indexLimit) {
      throw socialError(409, "brand_full", "This brand has reached the draft storage limit.");
    }
  }
  await kvSet(postKey(post.id), JSON.stringify(post));
  if (create) {
    const ids = await readJson(indexKey(post.brand_id), []);
    const next = [post.id, ...(Array.isArray(ids) ? ids.filter((id) => id !== post.id) : [])];
    await kvSet(indexKey(post.brand_id), JSON.stringify(next.slice(0, indexLimit)));
  }
}

export async function appendAudit(event) {
  const key = "social:v1:audit";
  const events = await readJson(key, []);
  const next = [event, ...(Array.isArray(events) ? events : [])].slice(0, 300);
  await kvSet(key, JSON.stringify(next));
  return event;
}

export async function listAudit() {
  const events = await readJson("social:v1:audit", []);
  return Array.isArray(events) ? events : [];
}

function connectionKey(brandId, platform) {
  return `social:v1:connection:${brandId}:${platform}`;
}

export async function getConnectionEnvelope(brandId, platform) {
  return kvGet(connectionKey(brandId, platform));
}

export async function saveConnectionEnvelope(brandId, platform, envelope) {
  await kvSet(connectionKey(brandId, platform), envelope);
}

export async function deleteConnection(brandId, platform) {
  await kvDel(connectionKey(brandId, platform));
}

function tokenKey(hash) {
  return `social:v1:token:${hash}`;
}

export async function getTokenRecord(hash) {
  const raw = await kvGet(tokenKey(hash));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveTokenRecord(record) {
  await kvSet(tokenKey(record.token_hash), JSON.stringify(record));
  const hashes = await readJson("social:v1:token-index", []);
  const next = [record.token_hash, ...(Array.isArray(hashes) ? hashes.filter((item) => item !== record.token_hash) : [])];
  await kvSet("social:v1:token-index", JSON.stringify(next.slice(0, 100)));
}

export async function listTokenRecords() {
  const hashes = await readJson("social:v1:token-index", []);
  if (!Array.isArray(hashes)) return [];
  const records = [];
  for (const hash of hashes) {
    const record = await getTokenRecord(hash);
    if (record) records.push(record);
  }
  return records;
}

export async function countTokenRecords() {
  const hashes = await readJson("social:v1:token-index", []);
  return Array.isArray(hashes) ? hashes.length : 0;
}

function grantKey(brandId, postId, kind) {
  return `social:v1:grant:${brandId}:${postId}:${kind}`;
}

export async function saveGrant(grant) {
  await kvSet(grantKey(grant.brand_id, grant.post_id, grant.kind), JSON.stringify(grant), 60 * 60);
}

export async function getGrant(brandId, postId, kind) {
  const raw = await kvGet(grantKey(brandId, postId, kind));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteGrant(brandId, postId, kind) {
  await kvDel(grantKey(brandId, postId, kind));
}

function jobKey(postId) {
  return `social:v1:job:${postId}`;
}

export async function getJobEnvelope(postId) {
  return kvGet(jobKey(postId));
}

export async function saveJobEnvelope(postId, envelope) {
  await kvSet(jobKey(postId), envelope);
}

export async function deleteJob(postId) {
  await kvDel(jobKey(postId));
}

export async function saveNonce(nonce, brandId) {
  await kvSet(`social:v1:nonce:${nonce}`, brandId, 600);
}

export async function takeNonce(nonce) {
  const key = `social:v1:nonce:${nonce}`;
  if (memory.current) return memory.current.take(key);
  // GETDEL is atomic across serverless instances; never emulate with GET + DEL.
  const response = await command(["GETDEL", key]);
  return response.result == null ? null : String(response.result);
}
