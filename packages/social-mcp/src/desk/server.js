import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DESK_PORT } from "../home.js";
import { loadOAuthEnvFile, publicOAuthConfig, saveOAuthEnvFile, parseEnvFile } from "../envFile.js";
import { installCursorMcp, readCursorMcpStatus } from "../cursorConfig.js";
import { openDesktopApp } from "../openApp.js";
import { mcpError } from "../errors.js";
import { PRODUCT_NAME, PRODUCT_TITLE } from "../brand.js";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function assertLocalHost(req, port) {
  const host = String(req.headers.host || "");
  const ok = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  if (!ok) throw mcpError("forbidden", "Desk is local-only.", 403);
}

async function readJson(req, limit = 64_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw mcpError("payload_too_large", "Request body is too large.", 413);
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw mcpError("invalid_json", "JSON body is invalid.");
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function serveStatic(urlPath, res) {
  const relative = urlPath === "/" ? "/index.html" : urlPath;
  if (relative.includes("..") || relative.includes("\0")) {
    sendText(res, 400, "Bad path");
    return;
  }
  const file = join(PUBLIC_DIR, relative.replace(/^\//, ""));
  if (!file.startsWith(PUBLIC_DIR) || !existsSync(file)) {
    sendText(res, 404, "Not found");
    return;
  }
  const type = CONTENT_TYPES[extname(file)] || "application/octet-stream";
  const body = readFileSync(file);
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function oauthReady(values) {
  return {
    google: Boolean(values.GOOGLE_OAUTH_CLIENT_ID && values.GOOGLE_OAUTH_CLIENT_SECRET),
    meta: Boolean(values.META_APP_ID && values.META_APP_SECRET),
    tiktok: Boolean(values.TIKTOK_CLIENT_KEY && values.TIKTOK_CLIENT_SECRET),
    linkedin: Boolean(values.LINKEDIN_CLIENT_ID && values.LINKEDIN_CLIENT_SECRET),
    x: Boolean(values.X_CLIENT_ID && values.X_CLIENT_SECRET),
    pinterest: Boolean(values.PINTEREST_APP_ID && values.PINTEREST_APP_SECRET),
    reddit: Boolean(values.REDDIT_CLIENT_ID && values.REDDIT_CLIENT_SECRET),
    snapchat: Boolean(values.SNAPCHAT_CLIENT_ID && values.SNAPCHAT_CLIENT_SECRET),
  };
}

function anyOauthReady(ready) {
  return Boolean(ready.google || ready.meta || ready.tiktok || ready.linkedin || ready.x || ready.pinterest || ready.reddit || ready.snapchat);
}

export function createDeskServer({ engine, env = process.env, port = Number(env.SOCIAL_MCP_DESK_PORT || DEFAULT_DESK_PORT) }) {
  const homePaths = engine.store.homePaths;

  function snapshot() {
    loadOAuthEnvFile(homePaths, env);
    const envValues = existsSync(homePaths.oauthEnv)
      ? parseEnvFile(readFileSync(homePaths.oauthEnv, "utf8"))
      : {};
    const status = engine.publicStatus();
    const cursor = readCursorMcpStatus();
    const ready = oauthReady(envValues);
    return {
      product: PRODUCT_NAME,
      product_title: PRODUCT_TITLE,
      home: status.home,
      media_dir: status.media_dir,
      oauth_redirect_uri: status.oauth_redirect_uri || `http://127.0.0.1:${env.SOCIAL_MCP_OAUTH_PORT || 47831}/oauth/callback`,
      desk_url: `http://127.0.0.1:${port}/`,
      profiles: status.profiles,
      connections: status.connections,
      platforms: status.platforms,
      oauth: publicOAuthConfig(envValues),
      oauth_ready: ready,
      cursor,
      next_step: !anyOauthReady(ready)
        ? "save_apps"
        : status.profiles.length === 0
          ? "create_profile"
          : "connect",
    };
  }

  const server = createServer(async (req, res) => {
    try {
      assertLocalHost(req, port);
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

      if (req.method === "GET" && url.pathname === "/api/status") {
        sendJson(res, 200, { ok: true, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/profile") {
        const body = await readJson(req);
        const result = await engine.upsertProfile({
          id: body.id || body.profile_id,
          name: body.name,
        });
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/oauth-config") {
        const body = await readJson(req);
        const saved = saveOAuthEnvFile(body, homePaths);
        loadOAuthEnvFile(homePaths, env);
        sendJson(res, 200, { ok: true, oauth: publicOAuthConfig(saved.values), ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/connect") {
        const body = await readJson(req);
        const profileId = String(body.profile_id || body.id || "").trim();
        const name = String(body.name || profileId).trim();
        if (!profileId) throw mcpError("invalid_profile", "Profile id is required.");
        loadOAuthEnvFile(homePaths, env);
        await engine.upsertProfile({ id: profileId, name });
        const result = await engine.connectAccounts(profileId, { platforms: body.platforms });
        sendJson(res, 200, { ok: true, connect: result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/connect-bluesky") {
        const body = await readJson(req);
        const profileId = String(body.profile_id || body.id || "").trim();
        const name = String(body.name || profileId).trim();
        if (!profileId) throw mcpError("invalid_profile", "Profile id is required.");
        await engine.upsertProfile({ id: profileId, name });
        const result = await engine.connectBluesky(profileId, {
          handle: body.handle,
          app_password: body.app_password,
        });
        sendJson(res, 200, { ok: true, connect: result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/install-cursor") {
        const installed = installCursorMcp();
        sendJson(res, 200, { ok: true, installed, ...snapshot() });
        return;
      }

      if (req.method === "GET" && (url.pathname === "/" || extname(url.pathname))) {
        serveStatic(url.pathname, res);
        return;
      }

      sendJson(res, 404, { ok: false, message: "Not found" });
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        ok: false,
        code: error.code || "error",
        message: error.message || "Unexpected error",
      });
    }
  });

  async function listen() {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    // Warm OAuth listener so connect chain is ready.
    await engine.oauth.ensureListening();
    return `http://127.0.0.1:${port}/`;
  }

  async function start({ open = true } = {}) {
    const url = await listen();
    if (open) openDesktopApp(url);
    return { url, port };
  }

  async function stop() {
    await new Promise((resolve) => server.close(() => resolve()));
    await engine.oauth.stop();
  }

  return { start, stop, snapshot, port };
}
