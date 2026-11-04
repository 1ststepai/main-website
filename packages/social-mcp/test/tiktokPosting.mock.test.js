import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishTikTokFromFile, tiktokChunkPlan, chooseDirectPostInfo, fetchTikTokPublishStatus } from "../src/publish/tiktok.js";
import { assertProviderConfigured, oauthConfig, authorizationUrl, TIKTOK_SCOPES, exchangeCode } from "../src/oauth/providers.js";
import { connectPlan } from "../src/desk/public/guide.js";

const MB = 1024 * 1024;
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => "" }, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const oauth = { clientKey: "desk-key", clientSecret: "desk-secret", redirectUri: "http://127.0.0.1:1/cb" };
const fresh = { access_token: "act.1", refresh_token: "rft.1", expires_at: new Date(Date.now() + 3600e3).toISOString() };

function media(size) {
  const dir = mkdtempSync(join(tmpdir(), "tt-"));
  writeFileSync(join(dir, "clip.mp4"), Buffer.alloc(size, 1));
  return dir;
}

function mock(calls, { creator = { privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] }, initStatus = 200 } = {}) {
  return async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href.endsWith("/creator_info/query/")) return res(200, { data: creator, error: { code: "ok" } });
    if (href.endsWith("/video/init/")) return res(initStatus, initStatus === 200 ? { data: { upload_url: "https://upload.mock/tt", publish_id: "p_123" }, error: { code: "ok" } } : { error: { code: "scope_not_authorized", message: "no" } });
    if (href.startsWith("https://upload.mock/")) return res(201, "");
    if (href.endsWith("/status/fetch/")) return res(200, { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [777] } });
    throw new Error(`unexpected ${href}`);
  };
}

test("chunk plan follows TikTok media transfer rules", () => {
  assert.deepEqual(tiktokChunkPlan(4 * MB).total_chunk_count, 1);
  assert.equal(tiktokChunkPlan(4 * MB).chunk_size, 4 * MB);
  const doc = tiktokChunkPlan(50_000_123);
  assert.equal(doc.chunk_size, 10 * MB);
  assert.equal(doc.total_chunk_count, Math.floor(50_000_123 / (10 * MB)));
  assert.equal(doc.ranges.at(-1).last, 50_000_122);
  const big = tiktokChunkPlan(200 * MB);
  for (const r of big.ranges) assert.ok(r.last - r.first + 1 <= 128 * MB && r.last - r.first + 1 >= 5 * MB);
  assert.throws(() => tiktokChunkPlan(0));
});

test("inbox (draft) upload: init inbox endpoint, chunked PUT with no bearer on upload_url", async () => {
  const calls = [];
  const out = await publishTikTokFromFile({ post: { media_path: "clip.mp4" }, mediaRoot: media(12 * MB), secrets: fresh, oauth, fetchImpl: mock(calls) });
  assert.equal(out.handoff, "tiktok_inbox");
  assert.equal(out.platform_post_id, "p_123");
  const init = calls.find((c) => c.href.includes("/inbox/video/init/"));
  const body = JSON.parse(init.init.body);
  assert.equal(body.source_info.total_chunk_count, 1);
  assert.equal(body.post_info, undefined);
  const puts = calls.filter((c) => c.init.method === "PUT");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].init.headers.authorization, undefined);
  assert.equal(puts[0].init.headers["content-range"], `bytes 0-${12 * MB - 1}/${12 * MB}`);
  assert.ok(!calls.some((c) => c.href.includes("creator_info")));
});

test("direct post: queries creator_info, defaults to SELF_ONLY, uses /video/init/", async () => {
  const calls = [];
  const out = await publishTikTokFromFile({ post: { media_path: "clip.mp4", tiktok_mode: "direct", caption: "hi", ai_generated: true }, mediaRoot: media(25 * MB), secrets: fresh, oauth, fetchImpl: mock(calls) });
  assert.equal(out.handoff, "tiktok_direct");
  const order = calls.map((c) => c.href.replace("https://open.tiktokapis.com/v2/post/publish", ""));
  assert.equal(order[0], "/creator_info/query/");
  assert.equal(order[1], "/video/init/");
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.post_info.privacy_level, "SELF_ONLY");
  assert.equal(body.post_info.is_aigc, true);
  assert.equal(body.source_info.total_chunk_count, 2);
  assert.equal(calls.filter((c) => c.init.method === "PUT").length, 2);
});

test("direct post refuses a privacy level creator_info does not offer", () => {
  assert.throws(() => chooseDirectPostInfo({ privacy_level: "PUBLIC_TO_EVERYONE" }, { privacy_level_options: ["SELF_ONLY"] }), /does not allow/);
});

test("scope_not_authorized asks for reconnect", async () => {
  await assert.rejects(
    publishTikTokFromFile({ post: { media_path: "clip.mp4" }, mediaRoot: media(1024), secrets: fresh, oauth, fetchImpl: mock([], { initStatus: 403 }) }),
    (e) => e.code === "needs_reconnect",
  );
});

test("no desk keys: publish refuses, provider not configured, guide hides TikTok", async () => {
  await assert.rejects(
    publishTikTokFromFile({ post: { media_path: "clip.mp4" }, mediaRoot: media(1024), secrets: fresh, oauth: { clientKey: "", clientSecret: "" }, fetchImpl: async () => { throw new Error("no network"); } }),
    (e) => e.code === "oauth_not_configured",
  );
  assert.throws(() => assertProviderConfigured("tiktok", oauthConfig({}, "http://127.0.0.1:1/cb")));
  assert.equal(connectPlan("tiktok", {}).action, "unavailable");
  assert.equal(connectPlan("tiktok", { oauth_ready: { tiktok: true } }).action, "oauth");
});

test("auth URL uses the desk's own client key and the posting scopes", () => {
  const config = oauthConfig({ TIKTOK_CLIENT_KEY: "desk-key", TIKTOK_CLIENT_SECRET: "desk-secret" }, "http://127.0.0.1:1/cb");
  const url = new URL(authorizationUrl("tiktok", { state: "st", config }));
  assert.equal(url.searchParams.get("client_key"), "desk-key");
  assert.deepEqual(url.searchParams.get("scope").split(","), TIKTOK_SCOPES);
  assert.ok(TIKTOK_SCOPES.includes("user.info.basic") && TIKTOK_SCOPES.includes("video.upload") && TIKTOK_SCOPES.includes("video.publish"));
  assert.ok(!url.toString().includes("desk-secret"));
});

test("exchangeTikTokCode posts desk credentials and reads the user", async () => {
  const config = oauthConfig({ TIKTOK_CLIENT_KEY: "desk-key", TIKTOK_CLIENT_SECRET: "desk-secret" }, "http://127.0.0.1:1/cb");
  const seen = [];
  const out = await exchangeCode("tiktok", {
    code: "c1",
    config,
    fetchImpl: async (url, init = {}) => {
      seen.push(String(url));
      if (String(url).includes("/oauth/token/")) {
        const body = new URLSearchParams(init.body);
        assert.equal(body.get("client_key"), "desk-key");
        return res(200, { access_token: "act.x", refresh_token: "rft.x", open_id: "o1", scope: "user.info.basic,video.upload", expires_in: 86400 });
      }
      return res(200, { data: { user: { open_id: "o1", username: "acme" } }, error: { code: "ok" } });
    },
  });
  assert.equal(out.platforms.tiktok.record.account_label, "@acme");
  assert.equal(seen.length, 2);
});

test("status fetch reads publish status", async () => {
  const s = await fetchTikTokPublishStatus({ publishId: "p_123", secrets: fresh, oauth, fetchImpl: mock([]) });
  assert.equal(s.status, "PUBLISH_COMPLETE");
  assert.deepEqual(s.post_ids, ["777"]);
});
