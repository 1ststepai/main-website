import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DESK_PORT } from "../home.js";
import { OAUTH_KEYS, loadOAuthEnvFile, mergeOAuthInput, publicOAuthConfig, saveOAuthEnvFile, parseEnvFile } from "../envFile.js";
import { assessOAuthValues, assertOAuthValues } from "../oauth/credentials.js";
import { displayOutcome } from "../publish/outcome.js";
import { installCursorMcp, publicMcpClientConfig, readCursorMcpStatus } from "../cursorConfig.js";
import { googleLoopbackUri, providerRedirectUri } from "../oauth/redirect.js";
import { handleRemoteMcp } from "../mcp/http.js";
import { allowedHost, clientSetup } from "../mcp/clients.js";
import { createPat, listPats, revokePat } from "../mcp/auth.js";
import { openDesktopApp } from "../openApp.js";
import { mcpError } from "../errors.js";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { PRODUCT_NAME, PRODUCT_TITLE } from "../brand.js";
import { handleSeoRoutes } from "../seo/http.js";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");
const MEDIA_LIMIT = 200 * 1024 * 1024;
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function assertLocalHost(req, port, env) {
  const host = String(req.headers.host || "");
  if (!allowedHost(host, env, port)) throw mcpError("forbidden", "Desk is local-only.", 403);
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

function safeMediaName(original) {
  const base = String(original || "video.mp4").split(/[/\\]/).pop();
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
  const suffix = cleaned && /^[A-Za-z0-9]/.test(cleaned) ? cleaned : "video.mp4";
  return `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}-${suffix}`;
}

async function saveMedia(req, mediaRoot) {
  const name = safeMediaName(req.headers["x-postpath-filename"]);
  mkdirSync(mediaRoot, { recursive: true, mode: 0o700 });
  const target = join(mediaRoot, name);
  let size = 0;
  async function* limited(source) {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > MEDIA_LIMIT) throw mcpError("payload_too_large", "Video is larger than 200 MB.", 413);
      yield chunk;
    }
  }
  try {
    await pipeline(limited(req), createWriteStream(target, { mode: 0o600 }));
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  }
  if (!size) {
    rmSync(target, { force: true });
    throw mcpError("invalid_media", "Choose a video file.");
  }
  return { filename: name, bytes: size };
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

function credentialValues(fileValues, env) {
  const merged = { ...fileValues };
  for (const key of OAUTH_KEYS) {
    const fromEnv = String(env[key] || "").trim();
    if (fromEnv) merged[key] = fromEnv;
  }
  return merged;
}

function oauthReady(values) {
  const check = assessOAuthValues(values);
  return {
    google: check.google.configured,
    meta: check.meta.configured,
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

function resolveDueIntervalMs(env) {
  const raw = Number(env.SOCIAL_MCP_DUE_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 1000) return Math.floor(raw);
  return 30_000;
}

export function createDeskServer({ engine, env = process.env, port = Number(env.SOCIAL_MCP_DESK_PORT || DEFAULT_DESK_PORT) }) {
  const homePaths = engine.store.homePaths;
  const dueIntervalMs = resolveDueIntervalMs(env);
  let dueTimer = null;
  let dueInFlight = false;

  async function runPublishDue() {
    if (dueInFlight) return;
    dueInFlight = true;
    try {
      await engine.publishDue();
    } catch {
      // Keep the desk alive; publish_due failures are recorded on each post.
    } finally {
      dueInFlight = false;
    }
  }

  function startDueLoop() {
    if (dueTimer) return;
    dueTimer = setInterval(() => {
      void runPublishDue();
    }, dueIntervalMs);
    if (typeof dueTimer.unref === "function") dueTimer.unref();
  }

  function stopDueLoop() {
    if (!dueTimer) return;
    clearInterval(dueTimer);
    dueTimer = null;
  }

  function snapshot() {
    loadOAuthEnvFile(homePaths, env);
    const fileValues = existsSync(homePaths.oauthEnv)
      ? parseEnvFile(readFileSync(homePaths.oauthEnv, "utf8"))
      : {};
    const envValues = credentialValues(fileValues, env);
    const status = engine.publicStatus();
    const cursor = readCursorMcpStatus();
    const ready = oauthReady(envValues);
    const scheduled_posts = engine.store.listPosts({ status: "scheduled" });
    return {
      product: PRODUCT_NAME,
      product_title: PRODUCT_TITLE,
      home: status.home,
      media_dir: status.media_dir,
      oauth_redirect_uri:
        status.oauth_redirect_uri || providerRedirectUri(env, Number(env.SOCIAL_MCP_OAUTH_PORT || 47831)),
      google_redirect_uri: status.google_redirect_uri || googleLoopbackUri(env, Number(env.SOCIAL_MCP_OAUTH_PORT || 47831)),
      publish_mode: status.publish_mode || "live",
      oauth_check: assessOAuthValues(envValues),
      recent_posts: engine.store.listPosts().slice(0, 30).map((post) => ({
        ...post,
        outcome: post.outcome || displayOutcome(post),
      })),
      desk_url: `http://127.0.0.1:${port}/`,
      profiles: status.profiles,
      connections: status.connections,
      platforms: status.platforms,
      scheduled_posts,
      queue: engine.listQueue().queue,
      due_interval_ms: dueIntervalMs,
      oauth: publicOAuthConfig(envValues),
      oauth_ready: ready,
      cursor,
      mcp_config: publicMcpClientConfig(),
      mcp_remote: clientSetup(env, port),
      pats: listPats(engine.store),
      next_step: !anyOauthReady(ready)
        ? "save_apps"
        : status.profiles.length === 0
          ? "create_profile"
          : "connect",
    };
  }

  const server = createServer(async (req, res) => {
    try {
      assertLocalHost(req, port, env);
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (await handleRemoteMcp(req, res, { engine, store: engine.store, env, port })) return;

      if (req.method === "GET" && url.pathname === "/api/status") {
        sendJson(res, 200, { ok: true, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/profile") {
        const body = await readJson(req);
        const result = await engine.upsertProfile({
          id: body.id || body.profile_id,
          name: body.name,
          require_vidiq: typeof body.require_vidiq === "boolean" ? body.require_vidiq : undefined,
          presets: body.presets,
        });
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/oauth-config") {
        const body = await readJson(req);
        const current = existsSync(homePaths.oauthEnv)
          ? parseEnvFile(readFileSync(homePaths.oauthEnv, "utf8"))
          : {};
        const merged = mergeOAuthInput(current, body);
        assertOAuthValues(merged);
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

      if (req.method === "POST" && url.pathname === "/api/cancel-scheduled") {
        const body = await readJson(req);
        const result = await engine.cancelScheduledPost({ post_id: body.post_id });
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/media") {
        const saved = await saveMedia(req, homePaths.mediaDir);
        sendJson(res, 200, { ok: true, media: saved });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/draft") {
        const body = await readJson(req);
        const profileId = String(body.profile_id || body.id || "").trim();
        const name = String(body.name || profileId).trim();
        if (!profileId) throw mcpError("invalid_profile", "Profile id is required.");
        await engine.upsertProfile({ id: profileId, name });
        const tags = Array.isArray(body.tags)
          ? body.tags
          : String(body.tags || "")
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean);
        const created = await engine.createDraft({
          profile_id: profileId,
          platform: body.platforms ? undefined : body.platform || "youtube",
          platforms: body.platforms,
          overrides: body.overrides,
          title: body.title,
          description: body.description,
          caption: body.caption || body.description,
          tags,
          privacy_status: body.privacy_status,
          media_path: body.media_path,
          media_url: body.media_url,
          media_content_type: body.media_content_type,
          instagram_public_confirmed: body.instagram_public_confirmed === true,
          facebook_public: body.facebook_public === true,
          vidiq: body.vidiq,
          media: body.media,
          caption_provider: body.caption_provider,
          review: body.review === true,
          review_provider: body.review_provider,
          wait: body.wait === true,
          source: "desk",
        });
        sendJson(res, 200, { ok: true, ...created, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/approve") {
        const body = await readJson(req);
        if (body.bundle_id) {
          const result = await engine.approveBundle({
            bundle_id: body.bundle_id,
            scheduled_at: body.scheduled_at,
            instagram_public_confirmed: body.instagram_public_confirmed === true,
          });
          sendJson(res, 200, { ok: true, ...result, ...snapshot() });
          return;
        }
        if (body.scheduled_at) {
          const result = await engine.schedulePost({ post_id: body.post_id, scheduled_at: body.scheduled_at });
          sendJson(res, 200, { ok: true, ...result, ...snapshot() });
          return;
        }
        const result = await engine.publishPost({ post_id: body.post_id, force: true });
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/discard") {
        const body = await readJson(req);
        const result = await engine.discardItem({ bundle_id: body.bundle_id, post_id: body.post_id });
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/media/generate") {
        const body = await readJson(req);
        const result = await engine.generateMedia(body);
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/media/attach") {
        const body = await readJson(req);
        const result = await engine.attachMedia(body);
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/media/remove") {
        const body = await readJson(req);
        const result = await engine.removeMedia(body);
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/media/")) {
        const name = decodeURIComponent(url.pathname.slice("/media/".length));
        try {
          const file = resolveSafeMediaPath(name, homePaths.mediaDir);
          const body = readFileSync(file);
          const type = CONTENT_TYPES[extname(file)] || "application/octet-stream";
          res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
          res.end(body);
        } catch {
          sendJson(res, 404, { ok: false, message: "Media not found" });
        }
        return;
      }

      if (await handleSeoRoutes(req, res, { url, engine, sendJson, readJson, snapshot })) return;

      if (req.method === "POST" && url.pathname === "/api/vidiq") {
        const body = await readJson(req);
        const result = await engine.attachVidiqCheck(body);
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/pat") {
        const body = await readJson(req);
        const created = createPat(engine.store, {
          name: body.name,
          scopes: body.scopes,
          expiresInDays: body.expires_in_days,
        });
        sendJson(res, 201, { ok: true, ...created, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/pat/revoke") {
        const body = await readJson(req);
        const revoked = revokePat(engine.store, String(body.id || ""));
        sendJson(res, 200, { ok: revoked, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/publish") {
        const body = await readJson(req);
        const result = await engine.publishPost({
          post_id: body.post_id,
          force: body.force === true,
          acknowledge: body.acknowledge === true,
        });
        sendJson(res, 200, { ok: true, ...result, ...snapshot() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/forget-vault") {
        const body = await readJson(req);
        if (body.confirm !== "remove saved accounts") {
          throw mcpError("confirm_required", "Saved accounts stay until you confirm removal.", 400);
        }
        const removed = engine.store.forgetVault();
        sendJson(res, 200, {
          ok: true,
          removed,
          message: "Saved accounts were removed. Quit PostPath and open it again. The app itself is still installed.",
        });
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
    startDueLoop();
    if (open) openDesktopApp(url);
    return { url, port, due_interval_ms: dueIntervalMs };
  }

  async function stop() {
    stopDueLoop();
    await new Promise((resolve) => server.close(() => resolve()));
    await engine.oauth.stop();
  }

  return { start, stop, snapshot, port, startDueLoop, stopDueLoop };
}
