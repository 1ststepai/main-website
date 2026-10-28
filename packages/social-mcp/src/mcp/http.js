import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createSocialMcpServer } from "./server.js";
import { mcpError } from "../errors.js";
import {
  DEFAULT_SCOPES,
  SCOPES,
  authenticateBearer,
  canonicalResource,
  createConsent,
  exchangeCode,
  issueCode,
  normalizeScopes,
  pkceS256,
  redirectAllowed,
  registerClient,
  resolveClient,
  rotateRefresh,
  takeConsent,
  validVerifier,
} from "./auth.js";
import { originAllowed, publicBase } from "./clients.js";

const sessions = new Map();

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function sendJson(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    ...extra,
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(html),
  });
  res.end(html);
}

function cors(res, origin, base) {
  if (origin && originAllowed(origin, base)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
  }
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization, content-type, mcp-protocol-version, mcp-session-id, accept");
  res.setHeader("access-control-expose-headers", "mcp-session-id, www-authenticate");
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function formOrJson(text, type) {
  if (!text) return {};
  if (String(type || "").includes("application/json")) return JSON.parse(text);
  const params = new URLSearchParams(text);
  const body = {};
  for (const [key, value] of params.entries()) {
    if (body[key] === undefined) body[key] = value;
    else if (Array.isArray(body[key])) body[key].push(value);
    else body[key] = [body[key], value];
  }
  return body;
}

function oauthError(res, status, code, description) {
  sendJson(res, status, { error: code, error_description: description });
}

function metadata(base) {
  const resource = `${base}/mcp`;
  return {
    resource: {
      resource,
      authorization_servers: [base],
      scopes_supported: SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "PostPath",
    },
    authorization: {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: SCOPES,
      client_id_metadata_document_supported: true,
    },
  };
}

function consentPage(consent, client) {
  const boxes = (consent.requested_scopes || [])
    .map((scope) => {
      const checked = DEFAULT_SCOPES.includes(scope) ? "checked" : "";
      const note = scope === "queue:approve" ? "Publishes or schedules. Off until you tick it." : "";
      return `<label class="row"><input type="checkbox" name="scope" value="${esc(scope)}" ${checked} /> <span><strong>${esc(scope)}</strong> ${esc(note)}</span></label>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Approve PostPath access</title>
<style>
body{margin:0;background:#070912;color:#f7f8ff;font:16px/1.45 Inter,sans-serif}
main{max-width:520px;margin:8vh auto;padding:28px;border:1px solid rgba(194,210,255,.16);border-radius:22px;background:#101525}
h1{font-size:1.6rem;letter-spacing:-.04em;margin:0 0 8px}
p{color:#b2bed6} .row{display:flex;gap:10px;margin:10px 0} button{font:inherit;border-radius:999px;padding:10px 16px;border:0;cursor:pointer}
.yes{background:linear-gradient(120deg,#6ea0ff,#73def7);color:#071018;font-weight:700} .no{background:transparent;color:#f7f8ff;border:1px solid rgba(194,210,255,.3);margin-left:8px}
</style></head><body><main>
<h1>Approve this connection</h1>
<p><strong>${esc(client.client_name)}</strong> is asking to use PostPath on this computer. Logins stay here. Nothing is published unless you tick queue:approve.</p>
<form method="post" action="/oauth/authorize/decision">
<input type="hidden" name="consent_id" value="${esc(consent.id)}" />
${boxes}
<p><button class="yes" name="decision" value="approve">Approve</button><button class="no" name="decision" value="deny">Deny</button></p>
</form></main></body></html>`;
}

async function handleAuthorize(req, res, ctx) {
  const url = new URL(req.url, ctx.base);
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const challenge = url.searchParams.get("code_challenge") || "";
  const method = url.searchParams.get("code_challenge_method") || "";
  const state = url.searchParams.get("state") || "";
  const resource = url.searchParams.get("resource") || ctx.resource;
  let client;
  try {
    client = await resolveClient(ctx.store, clientId);
  } catch {
    client = null;
  }
  if (!client) return oauthError(res, 400, "invalid_client", "Unknown client. Register it first, or use an https client metadata document.");
  if (url.searchParams.get("response_type") !== "code") return oauthError(res, 400, "unsupported_response_type", "Only authorization code is supported.");
  if (method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return oauthError(res, 400, "invalid_request", "PKCE S256 is required.");
  }
  if (!redirectAllowed(redirectUri, client.redirect_uris)) {
    return oauthError(res, 400, "invalid_request", "redirect_uri is not allowed for this client.");
  }
  if (resource !== ctx.resource) return oauthError(res, 400, "invalid_target", "resource must be this PostPath MCP endpoint.");
  const requested = normalizeScopes(url.searchParams.get("scope") || client.scope || DEFAULT_SCOPES.join(" "));
  const consent = createConsent(ctx.store, {
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uri: redirectUri,
    requested_scopes: requested.length ? requested : DEFAULT_SCOPES,
    code_challenge: challenge,
    resource: ctx.resource,
    state,
  });
  sendHtml(res, 200, consentPage(consent, client));
}

async function handleDecision(req, res, ctx) {
  const body = formOrJson(await readBody(req), req.headers["content-type"]);
  const scopes = normalizeScopes([].concat(body.scope || []));
  const consent = takeConsent(ctx.store, String(body.consent_id || ""));
  if (!consent) return oauthError(res, 400, "invalid_request", "This approval expired. Start the connection again.");
  const client = await resolveClient(ctx.store, consent.client_id);
  const back = new URL(consent.redirect_uri);
  if (body.decision !== "approve") {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("state", consent.state || "");
    res.writeHead(302, { location: back.toString() });
    res.end();
    return;
  }
  const granted = scopes.filter((scope) => consent.requested_scopes.includes(scope));
  if (!granted.length) return oauthError(res, 400, "invalid_scope", "Tick at least one scope.");
  const code = issueCode(ctx.store, consent, granted);
  back.searchParams.set("code", code);
  if (consent.state) back.searchParams.set("state", consent.state);
  if (!client) return oauthError(res, 400, "invalid_client", "Client disappeared.");
  res.writeHead(302, { location: back.toString() });
  res.end();
}

async function handleToken(req, res, ctx) {
  const body = formOrJson(await readBody(req), req.headers["content-type"]);
  const resource = String(body.resource || ctx.resource);
  if (resource !== ctx.resource) return oauthError(res, 400, "invalid_target", "resource must be this PostPath MCP endpoint.");
  try {
    if (body.grant_type === "authorization_code") {
      if (!validVerifier(body.code_verifier)) return oauthError(res, 400, "invalid_grant", "PKCE S256 verifier is required.");
      const tokens = exchangeCode(ctx.store, {
        code: body.code,
        redirectUri: body.redirect_uri,
        verifier: body.code_verifier,
        resource,
      });
      return sendJson(res, 200, tokens);
    }
    if (body.grant_type === "refresh_token") {
      const tokens = rotateRefresh(ctx.store, { refreshToken: body.refresh_token, resource });
      return sendJson(res, 200, tokens);
    }
    return oauthError(res, 400, "unsupported_grant_type", "Use authorization_code or refresh_token.");
  } catch (error) {
    return oauthError(res, error.statusCode || 400, error.code || "invalid_grant", error.message || "Token request failed.");
  }
}

function unauthorized(res, ctx) {
  const metadataUrl = `${ctx.base}/.well-known/oauth-protected-resource`;
  sendJson(
    res,
    401,
    {
      error: "unauthorized",
      message: `PostPath is not connected yet. Open ${ctx.base}/#connect-ai to approve access or create a personal access token. OAuth clients start from ${metadataUrl}.`,
      connect_url: `${ctx.base}/#connect-ai`,
      resource_metadata: metadataUrl,
    },
    { "www-authenticate": `Bearer realm="postpath", resource_metadata="${metadataUrl}"` },
  );
}

async function handleMcp(req, res, ctx, parsedBody) {
  const origin = req.headers.origin;
  if (!originAllowed(origin, ctx.base)) {
    sendJson(res, 403, { error: "forbidden", message: "Origin is not allowed for this PostPath endpoint." });
    return;
  }
  cors(res, origin, ctx.base);
  const header = String(req.headers.authorization || "");
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const auth = presented ? authenticateBearer(ctx.store, presented, ctx.resource) : null;
  if (!auth) return unauthorized(res, ctx);
  const sid = String(req.headers["mcp-session-id"] || "");
  if (sid && sessions.has(sid)) {
    const session = sessions.get(sid);
    if (session.tokenHash !== auth.tokenHash) {
      sendJson(res, 403, { error: "forbidden", message: "This session belongs to a different token." });
      return;
    }
    await session.transport.handleRequest(req, res, parsedBody);
    return;
  }
  if (sid && req.method !== "POST") {
    sendJson(res, 404, { error: "not_found", message: "MCP session was not found." });
    return;
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  const { server } = createSocialMcpServer({
    engine: ctx.engine,
    auth: { ...auth, connectUrl: `${ctx.base}/#connect-ai` },
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
  if (transport.sessionId) {
    sessions.set(transport.sessionId, { transport, server, tokenHash: auth.tokenHash });
    transport.onclose = () => sessions.delete(transport.sessionId);
  }
}

export async function handleRemoteMcp(req, res, { engine, store, env, port }) {
  const base = publicBase(env, port);
  const ctx = { engine, store, env, port, base, resource: canonicalResource(env, port) };
  const url = new URL(req.url || "/", base);
  const origin = req.headers.origin;
  if (req.method === "OPTIONS" && (url.pathname === "/mcp" || url.pathname.startsWith("/oauth/") || url.pathname.startsWith("/.well-known/"))) {
    cors(res, origin, base);
    res.writeHead(204);
    res.end();
    return true;
  }
  if (url.pathname === "/.well-known/oauth-protected-resource" && req.method === "GET") {
    cors(res, origin, base);
    sendJson(res, 200, metadata(base).resource);
    return true;
  }
  if (url.pathname === "/.well-known/oauth-authorization-server" && req.method === "GET") {
    cors(res, origin, base);
    sendJson(res, 200, metadata(base).authorization);
    return true;
  }
  if (url.pathname === "/oauth/register" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      sendJson(res, 201, registerClient(store, body));
    } catch (error) {
      oauthError(res, error.statusCode || 400, error.code || "invalid_client_metadata", error.message);
    }
    return true;
  }
  if (url.pathname === "/oauth/authorize" && req.method === "GET") {
    await handleAuthorize(req, res, ctx);
    return true;
  }
  if (url.pathname === "/oauth/authorize/decision" && req.method === "POST") {
    await handleDecision(req, res, ctx);
    return true;
  }
  if (url.pathname === "/oauth/token" && req.method === "POST") {
    await handleToken(req, res, ctx);
    return true;
  }
  if (url.pathname === "/mcp") {
    let parsed;
    if (req.method === "POST") {
      try {
        const text = await readBody(req);
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        sendJson(res, 400, { error: "invalid_json", message: "MCP request body must be JSON." });
        return true;
      }
    }
    await handleMcp(req, res, ctx, parsed);
    return true;
  }
  return false;
}

export function resetMcpSessions() {
  for (const session of sessions.values()) session.transport.close?.();
  sessions.clear();
}

export { pkceS256 };
