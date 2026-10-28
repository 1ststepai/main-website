import { xAvailable } from "../xAccess.js";
import { PLATFORMS } from "../platforms.js";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
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
import { createPat, listGrants, listPats, revokePat } from "../mcp/auth.js";
import { AUTO_POST_RISK_LABEL, disableAutoPost, enableAutoPost, listAutoPost } from "../autoPost.js";
import { openDesktopApp } from "../openApp.js";
import { mcpError } from "../errors.js";
import { createRecorder } from "../recorder.js";
import { createReadStream, statSync } from "node:fs";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { PRODUCT_NAME, PRODUCT_TITLE } from "../brand.js";
import { handleSeoRoutes } from "../seo/http.js";
import { handleHookRoutes } from "../hook/http.js";
import { isPilotMode, PILOT_PUBLISH_MESSAGE } from "../pilot/config.js";
import { editPilotCaption, exportApproved, generateFromTopic, pilotDeskView, queueApproved, regeneratePilot, requestPilotChanges } from "../pilot/loop.js";
import { assertOwnerPin, ownerPinConfigured, pinFromRequest } from "../pilot/ownerAuth.js";
import { FFMPEG_MISSING_MESSAGE } from "../media/audio.js";
import { buildSocialMcpServerEntry } from "../cursorConfig.js";
import { onboardingState, onboardingStep } from "../onboarding.js";
import { brandPageData, brandPageSettings, disableBrandPage, enableBrandPage, profileForSlug, renderBrandPage } from "../brand/brandPage.js";

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
  let ffmpegCache = { at: 0, ok: true, message: "" };
  // Session recorder: off until the owner starts it in the desk. Local files only.
  const recorder = createRecorder({ root: homePaths.recordingsDir || join(homePaths.root, "recordings") });
  const onAppEvent = (event) => recorder.record(event.type, event);
  engine.events?.on?.("event", onAppEvent);

  function ffmpegNote() {
    if (Date.now() - ffmpegCache.at < 60_000) return { ok: ffmpegCache.ok, message: ffmpegCache.message };
    try {
      execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 4000 });
      ffmpegCache = { at: Date.now(), ok: true, message: "" };
    } catch {
      ffmpegCache = { at: Date.now(), ok: false, message: FFMPEG_MISSING_MESSAGE };
    }
    return { ok: ffmpegCache.ok, message: ffmpegCache.message };
  }

  function pilotActive() {
    return isPilotMode(env, homePaths);
  }

  function requireOwner(req, body) {
    if (!ownerPinConfigured(homePaths)) {
      if (pilotActive()) throw mcpError("forbidden", "Connect, settings, keys, and tokens stay off the broker desk.", 403);
      return;
    }
    assertOwnerPin(homePaths, pinFromRequest(req, body));
  }

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
      pilot_mode: pilotActive(),
      x_available: xAvailable(engine.store.homePaths),
      publisher_calls: engine.publisherCalls?.() || 0,
    };
  }

  function publicSnapshot() {
    const full = snapshot();
    if (!pilotActive()) return full;
    const view = pilotDeskView(engine);
    return {
      ok: true,
      product: full.product,
      product_title: full.product_title,
      home: full.home,
      media_dir: full.media_dir,
      pilot_mode: true,
      x_available: xAvailable(engine.store.homePaths),
      publish_mode: "disabled",
      publisher_calls: engine.publisherCalls?.() || 0,
      profiles: (full.profiles || []).map((profile) => ({ id: profile.id, name: profile.name })),
      connections: (full.connections || []).map((row) => ({
        profile_id: row.profile_id,
        platform: row.platform,
        account_label: row.account_label || "",
        status: row.status || "",
      })),
      pilot: { ...view, ffmpeg: ffmpegNote() },
      queue: view.queue,
      recent_posts: (full.recent_posts || []).map((post) => ({
        id: post.id,
        platform: post.platform,
        title: post.title,
        caption: post.caption,
        status: post.status,
        queue_label: post.queue_label || "",
        bundle_id: post.bundle_id || "",
      })),
      next_step: "pick_topic",
      desk_url: full.desk_url,
    };
  }

  function autoPostConnections() {
    return [
      ...listPats(engine.store).map((pat) => ({ id: pat.id, kind: "pat", name: pat.name || "Access token", scopes: pat.scopes || [] })),
      ...listGrants(engine.store),
    ];
  }

  function autoPostView() {
    const connections = autoPostConnections();
    const brands = engine.store.listProfiles().map((profile) => {
      const rows = new Map(listAutoPost(engine.store, profile.id).map((row) => [row.connection_id, row]));
      const list = connections.map((conn) => ({ connection_id: conn.id, kind: conn.kind, name: conn.name, ...blankAuto(), ...(rows.get(conn.id) || {}), active: true }));
      for (const [id, row] of rows) {
        if (!connections.some((conn) => conn.id === id)) list.push({ ...row, connection_id: id, kind: "unknown", name: "Revoked or unknown connection", active: false });
      }
      return { profile_id: profile.id, name: profile.name, connections: list };
    });
    return { auto_post: { risk_label: AUTO_POST_RISK_LABEL, pin_required: ownerPinConfigured(homePaths), networks: PLATFORMS, brands } };
  }

  function brandPageView() {
    const pages = brandPageSettings(engine.store);
    const brands = engine.store.listProfiles().map((profile) => {
      const page = pages[profile.id] || {};
      const enabled = page.enabled === true;
      return { profile_id: profile.id, name: profile.name, enabled, path: enabled ? `/b/${page.slug}` : null, enabled_at: enabled ? page.enabled_at : null };
    });
    return { brand_page: { pin_required: ownerPinConfigured(homePaths), hosting: "local desk only", brands } };
  }

  function blankAuto() {
    return { enabled: false, networks: [], enabled_at: null, enabled_by: null, pending_request: null };
  }

  function deskState() {
    return pilotActive() ? publicSnapshot() : snapshot();
  }

  const server = createServer(async (req, res) => {
    try {
      assertLocalHost(req, port, env);
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (await handleRemoteMcp(req, res, { engine, store: engine.store, env, port })) return;

      if (req.method === "GET" && url.pathname === "/api/status") {
        sendJson(res, 200, { ok: true, ...deskState() });
        return;
      }

      if (pilotActive() && req.method === "POST" && (url.pathname === "/api/publish" || url.pathname === "/api/license")) {
        sendJson(res, 403, {
          ok: false,
          code: "pilot_publish_disabled",
          message: PILOT_PUBLISH_MESSAGE,
          publishers_called: engine.publisherCalls?.() || 0,
        });
        return;
      }

      if (req.method === "GET" && ["/api/pilot/export.txt", "/api/pilot/export.csv", "/api/pilot/export.zip"].includes(url.pathname)) {
        const format = url.pathname.endsWith(".csv") ? "csv" : url.pathname.endsWith(".zip") ? "zip" : "txt";
        const file = exportApproved(engine, format);
        if (format === "txt") {
          sendText(res, 200, file.body, file.type);
          return;
        }
        res.writeHead(200, {
          "content-type": file.type,
          "content-disposition": `attachment; filename="${file.filename}"`,
        });
        res.end(file.body);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/pilot/draft") {
        const body = await readJson(req);
        const result = await generateFromTopic(engine, body, { env });
        sendJson(res, 200, { ok: true, ...result, publishers_called: engine.publisherCalls?.() || 0, ...deskState() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/pilot/regenerate") {
        const body = await readJson(req);
        const result = await regeneratePilot(engine, body, { env });
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/pilot/edit") {
        const body = await readJson(req);
        const result = editPilotCaption(engine, body);
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/pilot/changes") {
        const body = await readJson(req);
        const result = requestPilotChanges(engine, body);
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/vidiq-upsell") {
        sendJson(res, 200, { ok: true, upsell: engine.vidiqUpsellInfo() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/settings/vidiq") {
        const body = await readJson(req);
        requireOwner(req, body);
        sendJson(res, 200, { ok: true, upsell: engine.saveVidiqUpsell(body) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/score") {
        // Open to every desk user (owner and pilot). Opt-in per click; nothing is saved or blocked.
        const body = await readJson(req);
        const interest = ["youtube_suggest", "google_trends"].includes(body.interest) ? body.interest : "off";
        sendJson(res, 200, { ok: true, ...(await engine.score(body, { interest })) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/profile") {
        const body = await readJson(req);
        requireOwner(req, body);
        const result = await engine.upsertProfile({
          id: body.id || body.profile_id,
          name: body.name,
          require_vidiq: typeof body.require_vidiq === "boolean" ? body.require_vidiq : undefined,
          presets: body.presets,
        });
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/oauth-config") {
        const body = await readJson(req);
        requireOwner(req, body);
        const current = existsSync(homePaths.oauthEnv)
          ? parseEnvFile(readFileSync(homePaths.oauthEnv, "utf8"))
          : {};
        const merged = mergeOAuthInput(current, body);
        assertOAuthValues(merged);
        const saved = saveOAuthEnvFile(body, homePaths);
        loadOAuthEnvFile(homePaths, env);
        sendJson(res, 200, { ok: true, oauth: publicOAuthConfig(saved.values), ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/connect") {
        const body = await readJson(req);
        requireOwner(req, body);
        const profileId = String(body.profile_id || body.id || "").trim();
        const name = String(body.name || profileId).trim();
        if (!profileId) throw mcpError("invalid_profile", "Profile id is required.");
        loadOAuthEnvFile(homePaths, env);
        await engine.upsertProfile({ id: profileId, name });
        const result = await engine.connectAccounts(profileId, {
          platforms: body.platforms,
          force: body.reconnect === true,
          open: body.open !== false,
        });
        sendJson(res, 200, { ok: true, connect: result, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/connect-bluesky") {
        const body = await readJson(req);
        requireOwner(req, body);
        const profileId = String(body.profile_id || body.id || "").trim();
        const name = String(body.name || profileId).trim();
        if (!profileId) throw mcpError("invalid_profile", "Profile id is required.");
        await engine.upsertProfile({ id: profileId, name });
        const result = await engine.connectBluesky(profileId, {
          handle: body.handle,
          app_password: body.app_password,
        });
        sendJson(res, 200, { ok: true, connect: result, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/install-cursor") {
        requireOwner(req, {});
        const installed = installCursorMcp({
          entry: buildSocialMcpServerEntry({ pilot: pilotActive(), home: engine.store.homePaths.root }),
        });
        sendJson(res, 200, { ok: true, installed, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/cancel-scheduled") {
        const body = await readJson(req);
        const result = await engine.cancelScheduledPost({ post_id: body.post_id });
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
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
        sendJson(res, 200, { ok: true, ...created, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/approve") {
        const body = await readJson(req);
        if (pilotActive()) {
          const result = queueApproved(engine, { bundle_id: body.bundle_id, post_id: body.post_id });
          sendJson(res, 200, { ok: true, ...result, publishers_called: engine.publisherCalls?.() || 0, ...deskState() });
          return;
        }
        if (body.bundle_id) {
          const result = await engine.approveBundle({
            bundle_id: body.bundle_id,
            scheduled_at: body.scheduled_at,
            instagram_public_confirmed: body.instagram_public_confirmed === true,
          });
          sendJson(res, 200, { ok: true, ...result, ...deskState() });
          return;
        }
        if (body.scheduled_at) {
          const result = await engine.schedulePost({ post_id: body.post_id, scheduled_at: body.scheduled_at });
          sendJson(res, 200, { ok: true, ...result, ...deskState() });
          return;
        }
        const result = await engine.publishPost({ post_id: body.post_id, force: true });
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/discard") {
        const body = await readJson(req);
        const result = await engine.discardItem({ bundle_id: body.bundle_id, post_id: body.post_id });
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/media/generate") {
        const body = await readJson(req);
        const result = await engine.generateMedia(body);
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/media/attach") {
        const body = await readJson(req);
        const result = await engine.attachMedia(body);
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/media/remove") {
        const body = await readJson(req);
        const result = await engine.removeMedia(body);
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
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

      if (pilotActive() && (url.pathname.startsWith("/api/seo") || url.pathname.startsWith("/api/hook"))) {
        // Keyword profiles, search-data sign-in, and on-camera voice are owner settings on a broker desk.
        requireOwner(req, {});
      }
      if (await handleSeoRoutes(req, res, { url, engine, sendJson, readJson, snapshot: deskState })) return;
      if (await handleHookRoutes(req, res, { url, engine, sendJson, readJson, snapshot: deskState })) return;

      if (req.method === "POST" && url.pathname === "/api/vidiq") {
        const body = await readJson(req);
        const result = await engine.attachVidiqCheck(body);
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }

      if (url.pathname.startsWith("/api/auto-post")) {
        if (pilotActive()) {
          sendJson(res, 403, { ok: false, code: "pilot_auto_post_disabled", message: "Auto-post is off in pilot mode. Every draft waits for approval." });
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/auto-post") {
          sendJson(res, 200, { ok: true, ...autoPostView() });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/auto-post/enable") {
          const body = await readJson(req);
          requireOwner(req, body);
          if (body.confirm !== true) {
            throw mcpError("confirm_required", `${AUTO_POST_RISK_LABEL} Send confirm: true to turn it on.`, 400);
          }
          const known = autoPostConnections().some((row) => row.id === body.connection_id);
          if (!known) throw mcpError("not_found", "That connection is not active.", 404);
          enableAutoPost(engine.store, {
            profile_id: String(body.profile_id || ""),
            connection_id: String(body.connection_id || ""),
            networks: body.networks,
            enabled_by: "desk",
          });
          sendJson(res, 200, { ok: true, ...autoPostView() });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/auto-post/disable") {
          // Turning auto-post off is always allowed and takes effect for the next draft.
          const body = await readJson(req);
          disableAutoPost(engine.store, { profile_id: String(body.profile_id || ""), connection_id: body.connection_id ? String(body.connection_id) : null });
          sendJson(res, 200, { ok: true, ...autoPostView() });
          return;
        }
      }

      if (url.pathname === "/api/onboarding" || url.pathname === "/api/onboarding/step") {
        if (req.method === "GET" && url.pathname === "/api/onboarding") {
          sendJson(res, 200, { ok: true, onboarding: onboardingState(engine), pin_required: ownerPinConfigured(homePaths) });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/onboarding/step") {
          const body = await readJson(req);
          requireOwner(req, body);
          const onboarding = await onboardingStep(engine, body);
          sendJson(res, 200, { ok: true, onboarding, pin_required: ownerPinConfigured(homePaths) });
          return;
        }
      }

      if (url.pathname.startsWith("/api/brand-page")) {
        if (req.method === "GET" && url.pathname === "/api/brand-page") {
          sendJson(res, 200, { ok: true, ...brandPageView() });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/brand-page/enable") {
          const body = await readJson(req);
          requireOwner(req, body);
          enableBrandPage(engine.store, { profile_id: String(body.profile_id || "") });
          sendJson(res, 200, { ok: true, ...brandPageView() });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/brand-page/disable") {
          // Turning the page off is always allowed and kills the old link.
          const body = await readJson(req);
          disableBrandPage(engine.store, { profile_id: String(body.profile_id || "") });
          sendJson(res, 200, { ok: true, ...brandPageView() });
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/brand-page/export.html") {
          const profileId = String(url.searchParams.get("profile_id") || "");
          const page = brandPageSettings(engine.store)[profileId];
          const data = page?.enabled ? brandPageData(engine.store, profileId) : null;
          if (!data) {
            sendJson(res, 404, { ok: false, code: "not_found", message: "Turn the brand page on first." });
            return;
          }
          res.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "content-disposition": `attachment; filename="${profileId}-brand-page.html"`,
            "cache-control": "no-store",
          });
          res.end(renderBrandPage(data));
          return;
        }
      }

      if (req.method === "GET" && url.pathname.startsWith("/b/")) {
        const profileId = profileForSlug(engine.store, url.pathname.slice(3));
        const data = profileId ? brandPageData(engine.store, profileId) : null;
        if (!data) {
          sendText(res, 404, "Not found");
          return;
        }
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow",
          "referrer-policy": "no-referrer",
        });
        res.end(renderBrandPage(data));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/pat") {
        const body = await readJson(req);
        requireOwner(req, body);
        const created = createPat(engine.store, {
          name: body.name,
          scopes: body.scopes,
          expiresInDays: body.expires_in_days,
        });
        sendJson(res, 201, { ok: true, ...created, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/pat/revoke") {
        const body = await readJson(req);
        requireOwner(req, body);
        const revoked = revokePat(engine.store, String(body.id || ""));
        sendJson(res, 200, { ok: revoked, ...deskState() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/publish") {
        const body = await readJson(req);
        const result = await engine.publishPost({
          post_id: body.post_id,
          force: body.force === true,
          acknowledge: body.acknowledge === true,
        });
        sendJson(res, 200, { ok: true, ...result, ...deskState() });
        return;
      }

      if (url.pathname === "/api/manage" || url.pathname.startsWith("/api/manage/")) {
        if (!engine.manage) throw mcpError("not_found", "Not found", 404);
        if (req.method === "GET" && url.pathname === "/api/manage") {
          sendJson(res, 200, { ok: true, ...engine.manage.view(String(url.searchParams.get("profile_id") || "")) });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/manage/queue") {
          const body = await readJson(req);
          requireOwner(req, body);
          const result = engine.manage.queue({ ...body, source: "desk" });
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/manage/approve") {
          const body = await readJson(req);
          requireOwner(req, body);
          // The desk is the only place that can approve; destructive changes take a second, typed confirmation.
          const result = await engine.manage.approve({
            id: body.action_id,
            approved_by: "desk",
            confirm_nonce: body.confirm_nonce,
            confirm_text: body.confirm_text,
          });
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/manage/discard") {
          const body = await readJson(req);
          const result = engine.manage.discard({ id: body.action_id });
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
      }

      if (url.pathname === "/api/recordings" || url.pathname.startsWith("/api/recordings/")) {
        if (req.method === "GET" && url.pathname === "/api/recordings") {
          sendJson(res, 200, { ok: true, active: recorder.active, recordings: recorder.list(), saved_in: "recordings folder in your PostPath home" });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/recordings/start") {
          const body = await readJson(req);
          requireOwner(req, body);
          sendJson(res, 200, { ok: true, ...recorder.start({ name: body.name, screen: body.screen === true }) });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/recordings/stop") {
          // Stopping is always allowed, one click.
          sendJson(res, 200, { ok: true, ...recorder.stop() });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/recordings/event") {
          const body = await readJson(req, 8_000);
          const allowed = ["desk_error", "reconnect_started", "screen_capture_started", "screen_capture_stopped"];
          if (!allowed.includes(body.type)) throw mcpError("invalid_event", "Unknown event.", 400);
          sendJson(res, 200, { ok: true, recorded: recorder.record(body.type, body) });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/recordings/video") {
          const id = String(url.searchParams.get("id") || "");
          if (recorder.active?.id !== id && !recorder.list().some((row) => row.id === id)) throw mcpError("not_found", "Unknown recording.", 404);
          const type = String(req.headers["content-type"] || "");
          if (!type.startsWith("video/webm")) throw mcpError("invalid_media", "Only a desk.webm screen recording is saved.", 400);
          const result = await recorder.saveVideo(id, req);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        const fileMatch = url.pathname.match(/^\/api\/recordings\/(rec_[A-Za-z0-9_]+)\/(events\.jsonl|desk\.webm|summary\.md)$/);
        if (req.method === "GET" && fileMatch) {
          const path = recorder.filePath(fileMatch[1], fileMatch[2]);
          const types = { "events.jsonl": "application/x-ndjson", "desk.webm": "video/webm", "summary.md": "text/markdown; charset=utf-8" };
          const headers = { "content-type": types[fileMatch[2]], "content-length": statSync(path).size, "cache-control": "no-store" };
          if (url.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename="${fileMatch[1]}-${fileMatch[2]}"`;
          res.writeHead(200, headers);
          createReadStream(path).pipe(res);
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/recordings/rename") {
          const body = await readJson(req);
          sendJson(res, 200, { ok: true, ...recorder.rename(String(body.id || ""), body.name) });
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/recordings/delete") {
          const body = await readJson(req);
          requireOwner(req, body);
          if (body.confirm !== true) throw mcpError("confirm_required", "Confirm to delete this recording.", 400);
          sendJson(res, 200, { ok: true, ...recorder.remove(String(body.id || "")) });
          return;
        }
      }

      if (req.method === "POST" && url.pathname === "/api/forget-vault") {
        const body = await readJson(req);
        requireOwner(req, body);
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
      recorder.record("error", { code: error.code || "error", route: String(req.url || "").split("?")[0] });
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
    if (!pilotActive()) startDueLoop();
    if (open) openDesktopApp(url);
    return { url, port, due_interval_ms: dueIntervalMs };
  }

  async function stop() {
    stopDueLoop();
    recorder.stop();
    engine.events?.off?.("event", onAppEvent);
    await new Promise((resolve) => server.close(() => resolve()));
    await engine.oauth.stop();
  }

  return { start, stop, snapshot, port, startDueLoop, stopDueLoop, recorder };
}
