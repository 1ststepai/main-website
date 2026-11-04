import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { giveOwnX } from "./helpers/ownX.js";
import { createEngine } from "../src/engine.js";
import { xMediaPaths, uploadXMedia } from "../src/publish/xMedia.js";
import { pinterestMediaPlan, publishPinterestPin } from "../src/publish/pinterest.js";
import { publishTikTokFromFile } from "../src/publish/tiktok.js";
import { connectionHealthSweep, connectionHealthRow } from "../src/connectionHealth.js";
import { parseArgs, runSmoke } from "../scripts/smoke.mjs";

const MB = 1024 * 1024;
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => "" }, text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? {})), json: async () => body });
const nosleep = async () => {};
function dirWith(files) {
  const dir = mkdtempSync(join(tmpdir(), "pm-"));
  for (const [name, size] of Object.entries(files)) writeFileSync(join(dir, name), Buffer.alloc(size, 1));
  return dir;
}

// ---- X ----
test("X media limits: up to 4 images, or a single video", () => {
  assert.equal(xMediaPaths({ media_paths: ["a.jpg", "b.jpg", "c.png", "d.webp"] }).length, 4);
  assert.throws(() => xMediaPaths({ media_paths: ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"] }));
  assert.throws(() => xMediaPaths({ media_paths: ["a.mp4", "b.jpg"] }));
});

test("X chunked v2 upload: initialize, append segments, finalize, poll STATUS", async () => {
  const dir = dirWith({ "v.mp4": 9 * MB });
  const calls = [];
  let polls = 0;
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, method: init.method || "GET", body: init.body });
    if (href.endsWith("/initialize")) return res(200, { data: { id: "m1" } });
    if (href.endsWith("/append")) return res(200, {});
    if (href.endsWith("/finalize")) return res(200, { data: { id: "m1", processing_info: { state: "pending", check_after_secs: 1 } } });
    if (href.includes("command=STATUS")) return res(200, { data: { id: "m1", processing_info: { state: ++polls > 1 ? "succeeded" : "in_progress" } } });
    throw new Error(href);
  };
  const id = await uploadXMedia({ filePath: join(dir, "v.mp4"), auth: (send) => send("t"), fetchImpl, sleep: nosleep });
  assert.equal(id, "m1");
  const init = JSON.parse(calls[0].body);
  assert.equal(init.media_category, "tweet_video");
  assert.equal(init.total_bytes, 9 * MB);
  assert.equal(calls.filter((c) => c.href.endsWith("/append")).length, 3);
  assert.equal(polls, 2);
});

// ---- Pinterest ----
test("Pinterest media plan: local video, local image base64, https image, https video rejected", () => {
  const dir = dirWith({ "v.mp4": 10, "i.png": 10 });
  assert.equal(pinterestMediaPlan({ media_path: "v.mp4" }, dir).kind, "video");
  assert.equal(pinterestMediaPlan({ media_path: "i.png" }, dir).kind, "image_base64");
  assert.equal(pinterestMediaPlan({ media_url: "https://cdn.example/a.jpg" }, dir).kind, "image_url");
  assert.throws(() => pinterestMediaPlan({ media_url: "https://cdn.example/a.mp4" }, dir), /media_path/);
});

test("Pinterest video pin: register, upload without bearer, poll, create video_id pin", async () => {
  const dir = dirWith({ "v.mp4": 2048 });
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.endsWith("/v5/media") && init.method === "POST") return res(201, { media_id: "md1", upload_url: "https://bucket.mock/up", upload_parameters: { key: "k" } });
    if (href.startsWith("https://bucket.mock/")) return res(204, "");
    if (href.endsWith("/v5/media/md1")) return res(200, { status: "succeeded" });
    if (href.endsWith("/v5/pins")) return res(201, { id: "pin9" });
    throw new Error(href);
  };
  const fresh = { access_token: "a", refresh_token: "r", expires_at: new Date(Date.now() + 3600e3).toISOString() };
  const out = await publishPinterestPin({ post: { media_path: "v.mp4", title: "t" }, connection: { board_id: "b1" }, secrets: fresh, oauth: {}, mediaRoot: dir, fetchImpl, sleep: nosleep });
  assert.equal(out.platform_post_id || out.id, "pin9");
  const up = calls.find((c) => c.href.startsWith("https://bucket.mock/"));
  assert.equal(JSON.stringify(up.init.headers || {}).toLowerCase().includes("bearer"), false);
  const pin = JSON.parse(calls.find((c) => c.href.endsWith("/v5/pins")).init.body);
  assert.equal(pin.media_source.source_type, "video_id");
  assert.equal(pin.media_source.media_id, "md1");
});

test("Pinterest draft with image/* content type publishes instead of being held", async () => {
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "pm-eng-")));
  mkdirSync(join(home, "media"), { recursive: true });
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.endsWith("/v5/pins")) return res(201, { id: "pinimg" });
    throw new Error(href);
  };
  const engine = createEngine({ home, env: {}, fetchImpl, now: () => Date.parse("2026-06-01T12:00:00Z") });
  await engine.upsertProfile({ id: "acme", name: "Acme" });
  engine.store.saveConnection({ profile_id: "acme", platform: "pinterest", account_label: "A", board_id: "b1" }, { access_token: "a", refresh_token: "r", expires_at: "2027-01-01T00:00:00Z" });
  const d = await engine.createDraft({ profile_id: "acme", platform: "pinterest", title: "pin", media_url: "https://cdn.example/a.jpg", media_content_type: "image/jpeg" });
  const out = await engine.publishPost({ post_id: d.post.id });
  assert.equal(out.post.platform_post_id, "pinimg");
});

// ---- TikTok ----
const ttFresh = { access_token: "act", refresh_token: "rft", expires_at: new Date(Date.now() + 3600e3).toISOString() };
const ttOauth = { clientKey: "k", clientSecret: "s", redirectUri: "http://127.0.0.1:1/cb" };
function ttMock(calls, initBody) {
  return async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.endsWith("/creator_info/query/")) return res(200, { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } });
    if (href.endsWith("/video/init/")) return res(initBody.error?.code === "ok" ? 200 : 403, initBody);
    throw new Error(href);
  };
}

test("TikTok PULL_FROM_URL direct post sends video_url and never PUTs", async () => {
  const calls = [];
  const out = await publishTikTokFromFile({ post: { media_url: "https://media.example.com/v.mp4", tiktok_mode: "direct", caption: "c" }, mediaRoot: dirWith({}), secrets: ttFresh, oauth: ttOauth, fetchImpl: ttMock(calls, { data: { publish_id: "p1" }, error: { code: "ok" } }) });
  assert.equal(out.platform_post_id, "p1");
  assert.equal(out.source, "PULL_FROM_URL");
  const body = JSON.parse(calls.find((c) => c.href.endsWith("/video/init/")).init.body);
  assert.deepEqual(body.source_info, { source: "PULL_FROM_URL", video_url: "https://media.example.com/v.mp4" });
  assert.equal(calls.filter((c) => c.init.method === "PUT").length, 0);
});

for (const [code, expected] of [["unaudited_client_can_only_post_to_private_accounts", "tiktok_unaudited_private_only"], ["url_ownership_unverified", "tiktok_url_unverified"]]) {
  test(`TikTok ${code} surfaces as ${expected}`, async () => {
    await assert.rejects(
      publishTikTokFromFile({ post: { media_url: "https://media.example.com/v.mp4", tiktok_mode: "direct" }, mediaRoot: dirWith({}), secrets: ttFresh, oauth: ttOauth, fetchImpl: ttMock([], { error: { code, message: "x" } }) }),
      (e) => e.code === expected,
    );
  });
}

// ---- Instagram ----
test("Instagram local file goes to rupload in one whole-file POST at offset 0", async () => {
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "pm-ig-")));
  const mediaDir = join(home, "media");
  mkdirSync(mediaDir, { recursive: true });
  writeFileSync(join(mediaDir, "r.mp4"), Buffer.alloc(12 * MB, 2));
  const uploads = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith("https://rupload.facebook.com/")) {
      uploads.push(init.headers);
      return res(200, { success: true });
    }
    if (href.includes("status_code")) return res(200, { status_code: "FINISHED" });
    if (href.endsWith("/media")) return res(200, { id: "c1", uri: "https://rupload.facebook.com/ig-api-upload/c1" });
    if (href.includes("/media_publish")) return res(200, { id: "igp" });
    throw new Error(href);
  };
  const engine = createEngine({ home, env: {}, fetchImpl, now: () => Date.parse("2026-06-01T12:00:00Z") });
  await engine.upsertProfile({ id: "acme", name: "Acme" });
  engine.store.saveConnection({ profile_id: "acme", platform: "instagram", account_label: "@a", instagram_id: "ig1", page_id: "pg" }, { page_access_token: "pt" });
  const d = await engine.createDraft({ profile_id: "acme", platform: "instagram", caption: "c", media_path: join(mediaDir, "r.mp4"), privacy_status: "public" });
  const out = await engine.publishPost({ post_id: d.post.id });
  assert.equal(out.post.platform_post_id, "igp");
  assert.equal(uploads.length, 1);
  const h = Object.fromEntries(Object.entries(uploads[0]).map(([k, v]) => [k.toLowerCase(), String(v)]));
  assert.equal(h.offset, "0");
  assert.equal(h.file_size, String(12 * MB));
});

// ---- Health sweep ----
test("health sweep covers every brand x network, flags Google testing 7-day expiry, has no token values", () => {
  const now = Date.parse("2026-06-10T00:00:00Z");
  const connections = [
    { profile_id: "skillsprout", platform: "youtube", has_secrets: true, token_meta: { authorized_at: "2026-06-04T00:00:00Z", has_refresh_token: true } },
    { profile_id: "1ststep-ai", platform: "x", has_secrets: true, status: "needs_reconnect", token_meta: { has_refresh_token: true } },
  ];
  const sweep = connectionHealthSweep({ connections, now, env: {} });
  assert.equal(sweep.rows.length, 3 * 6);
  const yt = sweep.rows.find((r) => r.profile_id === "skillsprout" && r.platform === "youtube");
  assert.equal(yt.health, "expiring_soon");
  assert.ok(yt.flags.includes("google_testing_7_day_refresh"));
  assert.equal(yt.refresh_expires_at, "2026-06-11T00:00:00.000Z");
  assert.equal(sweep.rows.find((r) => r.platform === "x" && r.profile_id === "1ststep-ai").health, "needs_reconnect");
  assert.equal(sweep.summary.not_connected, 16);
  assert.ok(!/access_token|refresh_token"|secret/i.test(JSON.stringify(sweep)));
  const prod = connectionHealthRow({ profileId: "a", platform: "youtube", connection: connections[0], now, googleTesting: false });
  assert.equal(prod.health, "ok");
});

test("store stamps non-secret token metadata and the engine exposes the sweep", async () => {
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "pm-h-")));
  const engine = createEngine({ home, env: {}, fetchImpl: async () => res(500, {}), now: () => Date.parse("2026-06-01T12:00:00Z") });
  await engine.upsertProfile({ id: "acme", name: "Acme" });
  engine.store.saveConnection({ profile_id: "acme", platform: "tiktok", account_label: "t" }, { access_token: "SECRETVALUE", refresh_token: "RT", expires_at: "2026-06-02T00:00:00.000Z" });
  const row = engine.store.listConnections("acme").find((c) => c.platform === "tiktok");
  assert.equal(row.token_meta.has_refresh_token, true);
  assert.equal(row.token_meta.access_expires_at, "2026-06-02T00:00:00.000Z");
  assert.ok(row.signed_in_at);
  assert.ok(row.refresh_expires_at);
  const sweep = engine.connectionHealth();
  assert.ok(!JSON.stringify(sweep).includes("SECRETVALUE"));
  assert.equal(sweep.rows.find((r) => r.profile_id === "acme" && r.platform === "tiktok").health, "ok");
});

// ---- Smoke scripts ----
test("smoke: dry run by default, no token means no network", async () => {
  assert.equal(parseArgs(["--platform", "x"]).privatePost, false);
  assert.throws(() => parseArgs(["--platform", "myspace"]));
  let hits = 0;
  const r = await runSmoke(["--platform", "x"], { env: { X_CLIENT_ID: "id" }, fetchImpl: async () => (hits++, res(200, {})) });
  assert.equal(r.mode, "dry-run");
  assert.equal(r.app_env.X_CLIENT_ID, "set");
  assert.equal(hits, 0);
});

test("smoke: dry run probes read-only and never posts or prints token", async () => {
  const seen = [];
  const r = await runSmoke(["--platform", "tiktok"], { env: { SMOKE_TIKTOK_ACCESS_TOKEN: "TOKVAL" }, fetchImpl: async (u) => (seen.push(String(u)), res(200, { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } })) });
  assert.deepEqual(seen, ["https://open.tiktokapis.com/v2/post/publish/creator_info/query/"]);
  assert.equal(r.posted, false);
  assert.ok(!JSON.stringify(r).includes("TOKVAL"));
});

test("smoke: --private-post refused on X; TikTok private post forces SELF_ONLY", async () => {
  const x = await runSmoke(["--platform", "x", "--private-post"], { env: { SMOKE_X_ACCESS_TOKEN: "t" }, fetchImpl: async () => res(200, {}) });
  assert.ok(x.refused);
  assert.equal(x.posted, false);
  const bodies = [];
  const tt = await runSmoke(["--platform", "tiktok", "--private-post", "--media-url", "https://v.example/a.mp4"], {
    env: { SMOKE_TIKTOK_ACCESS_TOKEN: "t" },
    fetchImpl: async (u, i = {}) => (i.body && bodies.push(JSON.parse(i.body)), res(200, { data: { publish_id: "p" }, error: { code: "ok" } })),
  });
  assert.equal(tt.posted, true);
  assert.equal(bodies[0].post_info.privacy_level, "SELF_ONLY");
});

test("Pinterest: a local image/png file and an https image/jpeg both publish end to end (no image_publish_unsupported)", async () => {
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "pm-eng-")));
  mkdirSync(join(home, "media"), { recursive: true });
  writeFileSync(join(home, "media", "card.png"), Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"));
  const bodies = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith("/v5/pins")) {
      bodies.push(JSON.parse(init.body));
      return res(201, { id: `pin${bodies.length}` });
    }
    throw new Error(String(url));
  };
  const engine = createEngine({ home, env: {}, fetchImpl, now: () => Date.parse("2026-06-01T12:00:00Z") });
  await engine.upsertProfile({ id: "acme", name: "Acme" });
  engine.store.saveConnection({ profile_id: "acme", platform: "pinterest", account_label: "A", board_id: "b1" }, { access_token: "a", refresh_token: "r", expires_at: "2027-01-01T00:00:00Z" });
  const local = await engine.createDraft({ profile_id: "acme", platform: "pinterest", title: "local", media_path: join(home, "media", "card.png"), media_content_type: "image/png" });
  const remote = await engine.createDraft({ profile_id: "acme", platform: "pinterest", title: "remote", media_url: "https://cdn.example/a.jpg", media_content_type: "image/jpeg" });
  const a = await engine.publishPost({ post_id: local.post.id });
  const b = await engine.publishPost({ post_id: remote.post.id });
  assert.equal(a.post.status, "published");
  assert.equal(b.post.status, "published");
  assert.equal(bodies[0].media_source.source_type, "image_base64");
  assert.equal(bodies[0].media_source.content_type, "image/png");
  assert.equal(bodies[1].media_source.source_type, "image_url");
});
