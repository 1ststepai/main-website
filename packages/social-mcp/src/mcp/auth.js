import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SCOPES, DEFAULT_SCOPES, publicBase, resourceUrl } from "./clients.js";

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const CONSENT_TTL_MS = 10 * 60 * 1000;

export function tokenHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function randomId(prefix, bytes = 32) {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function pkceS256(verifier) {
  return createHash("sha256").update(String(verifier)).digest("base64url");
}

export function validVerifier(verifier) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(String(verifier || ""));
}

function loopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function redirectAllowed(requested, registered) {
  let req;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  if (req.username || req.password || req.hash) return false;
  const list = Array.isArray(registered) ? registered : [];
  if (req.protocol === "http:" && loopback(req.hostname)) {
    return list.some((item) => {
      let reg;
      try {
        reg = new URL(item);
      } catch {
        return false;
      }
      return reg.protocol === "http:" && loopback(reg.hostname) && reg.pathname === req.pathname && reg.search === req.search;
    });
  }
  if (req.protocol === "https:") return list.includes(requested);
  return false;
}

export function normalizeScopes(value) {
  const raw = Array.isArray(value) ? value.join(" ") : String(value || "");
  const out = [];
  for (const scope of raw.split(/\s+/)) {
    if (SCOPES.includes(scope) && !out.includes(scope)) out.push(scope);
  }
  return out;
}

function publicClient(client) {
  if (!client) return null;
  return {
    client_id: client.client_id,
    client_name: client.client_name || "MCP client",
    redirect_uris: client.redirect_uris || [],
    grant_types: client.grant_types || ["authorization_code", "refresh_token"],
    response_types: client.response_types || ["code"],
    token_endpoint_auth_method: "none",
    scope: (client.scope || DEFAULT_SCOPES).join(" "),
  };
}

export function registerClient(store, body = {}) {
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!redirectUris.length || !redirectUris.every((uri) => redirectAllowed(uri, [uri]) || isExactHttps(uri))) {
    const error = new Error("redirect_uris must be loopback http or exact https.");
    error.code = "invalid_client_metadata";
    error.statusCode = 400;
    throw error;
  }
  const now = Date.now();
  const client = {
    client_id: randomId("pp_client_"),
    client_name: String(body.client_name || "MCP client").slice(0, 120),
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: normalizeScopes(body.scope || DEFAULT_SCOPES.join(" ")),
    client_id_issued_at: Math.floor(now / 1000),
  };
  store.withMcpAuth((auth) => {
    auth.clients[client.client_id] = client;
  });
  return publicClient(client);
}

function isExactHttps(uri) {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" && !url.username && !url.hash;
  } catch {
    return false;
  }
}

function privateHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (loopback(host) || host === "0.0.0.0" || host.endsWith(".local") || host === "metadata.google.internal") return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^127\./.test(host)) return true;
  const match = /^172\.(\d+)\./.exec(host);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return false;
}

export async function resolveClient(store, clientId, fetchImpl = fetch) {
  const local = store.readMcpAuth().clients?.[clientId];
  if (local) return local;
  if (!/^https:\/\//.test(String(clientId || ""))) return null;
  let url;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (privateHost(url.hostname) || url.username) return null;
  const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
  if (!response.ok) return null;
  const text = await response.text();
  if (text.length > 32_000) return null;
  const doc = JSON.parse(text);
  const redirects = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String) : [];
  if (!redirects.length) return null;
  return {
    client_id: clientId,
    client_name: String(doc.client_name || "MCP client").slice(0, 120),
    redirect_uris: redirects,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: normalizeScopes(doc.scope || DEFAULT_SCOPES.join(" ")),
    metadata_document: true,
  };
}

export function createConsent(store, fields) {
  const consent = {
    id: randomId("consent_", 16),
    ...fields,
    expires_at: Date.now() + CONSENT_TTL_MS,
  };
  store.withMcpAuth((auth) => {
    auth.consents[consent.id] = consent;
  });
  return consent;
}

export function takeConsent(store, id) {
  return store.withMcpAuth((auth) => {
    const consent = auth.consents[id];
    if (!consent) return null;
    delete auth.consents[id];
    if (consent.expires_at < Date.now()) return null;
    return consent;
  });
}

export function issueCode(store, consent, scopes) {
  const code = randomId("pp_code_", 32);
  const record = {
    client_id: consent.client_id,
    redirect_uri: consent.redirect_uri,
    code_challenge: consent.code_challenge,
    scope: scopes,
    resource: consent.resource,
    expires_at: Date.now() + CODE_TTL_MS,
    used: false,
  };
  store.withMcpAuth((auth) => {
    auth.codes[tokenHash(code)] = record;
  });
  return code;
}

function revokeGrant(auth, grantId) {
  const grant = auth.grants[grantId];
  if (grant) grant.revoked = true;
  for (const [key, token] of Object.entries(auth.tokens)) {
    if (token.grant_id === grantId) delete auth.tokens[key];
  }
}

function issuePair(auth, grantId) {
  const now = Date.now();
  const access = randomId("pp_at_");
  const refresh = randomId("pp_rt_");
  for (const [key, token] of Object.entries(auth.tokens)) {
    if (token.grant_id === grantId && token.kind === "access") delete auth.tokens[key];
  }
  auth.tokens[tokenHash(access)] = { grant_id: grantId, kind: "access", expires_at: now + ACCESS_TTL_MS };
  auth.tokens[tokenHash(refresh)] = { grant_id: grantId, kind: "refresh", expires_at: now + REFRESH_TTL_MS };
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    scope: auth.grants[grantId].scope.join(" "),
  };
}

function issueGrant(auth, { clientId, scope, resource }) {
  const grantId = randomId("grant_", 16);
  auth.grants[grantId] = { client_id: clientId, scope, resource, revoked: false };
  return issuePair(auth, grantId);
}

export function rotateRefresh(store, { refreshToken, resource }) {
  return store.withMcpAuth((auth) => {
    const hash = tokenHash(refreshToken);
    if (auth.retiredRefresh[hash]) {
      revokeGrant(auth, auth.retiredRefresh[hash]);
      const error = new Error("Refresh token was already used. The session was revoked.");
      error.code = "invalid_grant";
      error.statusCode = 400;
      throw error;
    }
    const token = auth.tokens[hash];
    const grant = token ? auth.grants[token.grant_id] : null;
    if (!token || token.kind !== "refresh" || !grant || grant.revoked || token.expires_at < Date.now()) {
      const error = new Error("Refresh token is invalid or expired.");
      error.code = "invalid_grant";
      error.statusCode = 400;
      throw error;
    }
    if (resource && resource !== grant.resource) {
      const error = new Error("resource does not match this token.");
      error.code = "invalid_target";
      error.statusCode = 400;
      throw error;
    }
    delete auth.tokens[hash];
    auth.retiredRefresh[hash] = token.grant_id;
    return { ...issuePair(auth, token.grant_id), token_type: "Bearer" };
  });
}

export function exchangeCode(store, { code, redirectUri, verifier, resource }) {
  return store.withMcpAuth((auth) => {
    const hash = tokenHash(code);
    const record = auth.codes[hash];
    if (!record || record.used || record.expires_at < Date.now()) {
      const error = new Error("Authorization code is invalid or expired.");
      error.code = "invalid_grant";
      error.statusCode = 400;
      throw error;
    }
    if (record.redirect_uri !== redirectUri) {
      const error = new Error("redirect_uri does not match.");
      error.code = "invalid_grant";
      error.statusCode = 400;
      throw error;
    }
    if (!validVerifier(verifier) || !safeEqualHex(pkceS256(verifier), record.code_challenge)) {
      const error = new Error("PKCE verification failed. S256 is required.");
      error.code = "invalid_grant";
      error.statusCode = 400;
      throw error;
    }
    if (resource && resource !== record.resource) {
      const error = new Error("resource does not match the authorization request.");
      error.code = "invalid_target";
      error.statusCode = 400;
      throw error;
    }
    record.used = true;
    return { ...issueGrant(auth, { clientId: record.client_id, scope: record.scope, resource: record.resource }), token_type: "Bearer" };
  });
}

export function authenticateBearer(store, presented, resource) {
  if (!presented) return null;
  const hash = tokenHash(presented);
  const auth = store.readMcpAuth();
  const pat = Object.values(auth.pats || {}).find((item) => item.hash === hash && !item.revoked);
  if (pat) {
    if (pat.expires_at && Date.parse(pat.expires_at) < Date.now()) return null;
    if (!pat.last_used_at || Date.now() - Date.parse(pat.last_used_at) > 60_000) {
      store.withMcpAuth((next) => {
        const row = Object.values(next.pats).find((item) => item.hash === hash);
        if (row) row.last_used_at = new Date().toISOString();
      });
    }
    return { kind: "pat", clientId: pat.id, scopes: pat.scopes, tokenHash: hash };
  }
  const token = auth.tokens?.[hash];
  const grant = token ? auth.grants?.[token.grant_id] : null;
  if (!token || token.kind !== "access" || !grant || grant.revoked || token.expires_at < Date.now()) return null;
  if (grant.resource !== resource) return null;
  return { kind: "oauth", clientId: grant.client_id, scopes: grant.scope, tokenHash: hash, resource: grant.resource };
}

export function createPat(store, { name, scopes, expiresInDays } = {}) {
  const chosen = normalizeScopes(scopes || DEFAULT_SCOPES);
  if (!chosen.length) {
    const error = new Error("Pick at least one scope.");
    error.statusCode = 400;
    throw error;
  }
  const token = randomId("pp_pat_");
  const record = {
    id: randomId("pat_", 8),
    name: String(name || "Personal access token").slice(0, 80),
    hash: tokenHash(token),
    prefix: token.slice(0, 12),
    scopes: chosen,
    expires_at: expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString() : null,
    last_used_at: null,
    created_at: new Date().toISOString(),
    revoked: false,
  };
  store.withMcpAuth((auth) => {
    auth.pats[record.id] = record;
  });
  return { pat: publicPat(record), token };
}

export function listPats(store) {
  return Object.values(store.readMcpAuth().pats || {})
    .filter((item) => !item.revoked)
    .map(publicPat);
}

export function revokePat(store, id) {
  return store.withMcpAuth((auth) => {
    const pat = auth.pats[id];
    if (!pat) return false;
    pat.revoked = true;
    return true;
  });
}

function publicPat(pat) {
  return {
    id: pat.id,
    name: pat.name,
    prefix: pat.prefix,
    scopes: pat.scopes,
    expires_at: pat.expires_at,
    last_used_at: pat.last_used_at,
    created_at: pat.created_at,
  };
}

export function canonicalResource(env, port) {
  return resourceUrl(publicBase(env, port));
}

export { SCOPES, DEFAULT_SCOPES };
