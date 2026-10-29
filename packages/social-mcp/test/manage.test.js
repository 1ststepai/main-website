import { giveOwnX } from "./helpers/ownX.js";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { EXECUTORS } from "../src/manage/executors.js";
import { MANAGE_ACTIONS, API_LIMITS } from "../src/manage/actions.js";
import { accessStatus, LEGACY_SCOPES } from "../src/manage/scopes.js";
import { META_SCOPES, X_SCOPES, YOUTUBE_SCOPES } from "../src/oauth/providers.js";
import { freePort, freePorts } from "./helpers/ports.js";

const FULL = { youtube: YOUTUBE_SCOPES, facebook: META_SCOPES, instagram: META_SCOPES, x: X_SCOPES };

function res(status, body) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => "" }, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
}

/** Records every call and answers like each API. Never touches the network. */
function apiMock() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    const u = String(url);
    calls.push({ method, url: u, body: init.body });
    if (u.includes("/channels?") && method === "GET") return res(200, { items: [{ id: "UC1", brandingSettings: { channel: { title: "1ststep.ai" } } }] });
    if (u.includes("/playlists?") && method === "GET") return res(200, { items: [{ id: "PL1", snippet: { title: "Old" }, status: { privacyStatus: "private" } }] });
    if (u.includes("/videos?") && method === "GET") return res(200, { items: [{ id: "v1", snippet: { title: "Old", categoryId: "22" }, status: { privacyStatus: "private" } }] });
    if (u.includes("channelBanners/insert")) return res(200, { url: "https://yt3.example/banner" });
    if (method === "DELETE" && u.includes("googleapis")) return res(204);
    if (u.includes("/users/by/username/")) return res(200, { data: { id: "99" } });
    if (u.includes("/tweets/") && method === "DELETE") return res(200, { data: { deleted: true } });
    if (u.includes("media/upload")) return res(200, { data: { id: "m1", processing_info: { state: "succeeded" } } });
    return res(200, { id: "x1", success: true, data: { id: "t1", liked: true, following: true } });
  };
  return { calls, fetchImpl };
}

const PARAMS = {
  "youtube.update_channel": { description: "New description" },
  "youtube.upload_banner": { media_path: "banner.png" },
  "youtube.create_playlist": { title: "Tips" },
  "youtube.update_playlist": { playlist_id: "PL1", title: "New" },
  "youtube.delete_playlist": { playlist_id: "PL1" },
  "youtube.add_playlist_item": { playlist_id: "PL1", video_id: "v1" },
  "youtube.remove_playlist_item": { playlist_item_id: "pi1" },
  "youtube.update_video": { video_id: "v1", title: "New", tags: ["a"] },
  "youtube.set_visibility": { video_id: "v1", privacy_status: "unlisted" },
  "youtube.delete_video": { video_id: "v1" },
  "facebook.edit_post": { post_id: "p1", message: "Edited" },
  "facebook.delete_post": { post_id: "p1" },
  "facebook.update_page": { about: "About" },
  "facebook.comment_hide": { comment_id: "c1" },
  "facebook.comment_delete": { comment_id: "c1" },
  "facebook.comment_reply": { comment_id: "c1", message: "Thanks" },
  "instagram.comment_hide": { comment_id: "c1" },
  "instagram.comment_delete": { comment_id: "c1" },
  "instagram.comment_reply": { comment_id: "c1", message: "Thanks" },
  "instagram.set_comments_enabled": { media_id: "m1", enabled: false },
  "x.create_post": { text: "Hello", media_paths: ["clip.png"] },
  "x.reply": { in_reply_to: "t0", text: "Reply" },
  "x.delete_post": { tweet_id: "t1" },
  "x.like": { tweet_id: "t1" },
  "x.follow": { username: "1ststepai" },
};

const EXPECT = {
  "youtube.update_channel": ["PUT", "/channels?part=brandingSettings"],
  "youtube.upload_banner": ["POST", "channelBanners/insert"],
  "youtube.create_playlist": ["POST", "/playlists?"],
  "youtube.update_playlist": ["PUT", "/playlists?"],
  "youtube.delete_playlist": ["DELETE", "/playlists?id=PL1"],
  "youtube.add_playlist_item": ["POST", "/playlistItems?"],
  "youtube.remove_playlist_item": ["DELETE", "/playlistItems?id=pi1"],
  "youtube.update_video": ["PUT", "/videos?"],
  "youtube.set_visibility": ["PUT", "/videos?"],
  "youtube.delete_video": ["DELETE", "/videos?id=v1"],
  "facebook.edit_post": ["POST", "/p1"],
  "facebook.delete_post": ["DELETE", "/p1"],
  "facebook.update_page": ["POST", "/page1"],
  "facebook.comment_hide": ["POST", "/c1"],
  "facebook.comment_delete": ["DELETE", "/c1"],
  "facebook.comment_reply": ["POST", "/c1/comments"],
  "instagram.comment_hide": ["POST", "/c1"],
  "instagram.comment_delete": ["DELETE", "/c1"],
  "instagram.comment_reply": ["POST", "/c1/replies"],
  "instagram.set_comments_enabled": ["POST", "/m1"],
  "x.create_post": ["POST", "/2/tweets"],
  "x.reply": ["POST", "/2/tweets"],
  "x.delete_post": ["DELETE", "/2/tweets/t1"],
  "x.like": ["POST", "/users/u1/likes"],
  "x.follow": ["POST", "/users/u1/following"],
};

function setup({ fetchImpl, env = {} } = {}) {
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "pp-manage-")));
  const engine = createEngine({ home, env: { SOCIAL_MCP_PUBLISH_MODE: "real", GOOGLE_OAUTH_CLIENT_ID: "g", GOOGLE_OAUTH_CLIENT_SECRET: "s", X_CLIENT_ID: "x", ...env }, fetchImpl, now: () => Date.now() });
  engine.upsertProfile({ id: "acme", name: "Acme" });
  mkdirSync(engine.store.homePaths.mediaDir, { recursive: true });
  writeFileSync(join(engine.store.homePaths.mediaDir, "banner.png"), Buffer.alloc(64, 1));
  writeFileSync(join(engine.store.homePaths.mediaDir, "clip.png"), Buffer.alloc(64, 1));
  return { home, engine, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function seed(engine, platform, scopes = FULL[platform]) {
  const record = { profile_id: "acme", platform, account_label: `${platform} acct`, granted_scopes: scopes, channel_id: "UC1", page_id: "page1", ig_user_id: "ig1", user_id: "u1" };
  if (scopes === null) delete record.granted_scopes;
  engine.store.saveConnection(record, { access_token: "tok-" + platform, refresh_token: "r", page_access_token: "pt", expires_at: "2099-01-01T00:00:00.000Z" });
}

test("every account action has a runner and calls the expected endpoint (mocked)", async () => {
  assert.equal(Object.keys(MANAGE_ACTIONS).length, 25);
  for (const type of Object.keys(MANAGE_ACTIONS)) assert.ok(EXECUTORS[type], type);
  const { calls, fetchImpl } = apiMock();
  const { engine, cleanup } = setup({ fetchImpl });
  try {
    for (const p of ["youtube", "facebook", "instagram", "x"]) seed(engine, p);
    for (const type of Object.keys(MANAGE_ACTIONS)) {
      calls.length = 0;
      const { action } = engine.manage.queue({ profile_id: "acme", type, params: PARAMS[type], source: "mcp" });
      assert.equal(action.status, "pending_approval");
      assert.equal(calls.length, 0, `${type} queued without a call`);
      let out = await engine.manage.approve({ id: action.id, approved_by: "desk" });
      if (out.needs_confirm) {
        assert.equal(calls.length, 0, `${type} waits for a typed confirmation`);
        out = await engine.manage.approve({ id: action.id, approved_by: "desk", confirm_nonce: out.confirm_nonce, confirm_text: out.confirm_phrase });
      }
      assert.equal(out.action.status, "done", type);
      const [method, part] = EXPECT[type];
      assert.ok(calls.some((c) => c.method === method && c.url.includes(part)), `${type}: ${method} ${part} in ${calls.map((c) => `${c.method} ${c.url}`).join(" | ")}`);
      for (const c of calls) assert.ok(!/localhost|127\.0\.0\.1/.test(c.url));
    }
  } finally {
    cleanup();
  }
});

test("assistants cannot approve; pilot mode refuses; nothing runs before approval", async () => {
  const { calls, fetchImpl } = apiMock();
  const { engine, cleanup } = setup({ fetchImpl });
  try {
    seed(engine, "youtube");
    const { action } = engine.manage.queue({ profile_id: "acme", type: "youtube.update_channel", params: PARAMS["youtube.update_channel"], source: "mcp" });
    await assert.rejects(engine.manage.approve({ id: action.id, approved_by: "mcp" }), /Only the owner/);
    await assert.rejects(engine.manage.approve({ id: action.id }), /Only the owner/);
    assert.equal(calls.length, 0);
    engine.manage.discard({ id: action.id });
    await assert.rejects(engine.manage.approve({ id: action.id, approved_by: "desk" }), /no longer/);
  } finally {
    cleanup();
  }
});

test("destructive actions need the nonce and the exact typed phrase", async () => {
  const { calls, fetchImpl } = apiMock();
  const { engine, cleanup } = setup({ fetchImpl });
  try {
    seed(engine, "youtube");
    const { action } = engine.manage.queue({ profile_id: "acme", type: "youtube.delete_video", params: { video_id: "v1" } });
    assert.equal(action.destructive, true);
    const first = await engine.manage.approve({ id: action.id, approved_by: "desk" });
    assert.equal(first.needs_confirm, true);
    assert.equal(first.confirm_phrase, "DELETE");
    await assert.rejects(engine.manage.approve({ id: action.id, approved_by: "desk", confirm_nonce: first.confirm_nonce, confirm_text: "delete" }), /exactly/);
    await assert.rejects(engine.manage.approve({ id: action.id, approved_by: "desk", confirm_nonce: "wrong", confirm_text: "DELETE" }), /not for this action/);
    assert.equal(calls.length, 0);
    const done = await engine.manage.approve({ id: action.id, approved_by: "desk", confirm_nonce: first.confirm_nonce, confirm_text: "DELETE" });
    assert.equal(done.action.status, "done");
    assert.ok(!("confirm" in done.action));
    const vis = engine.manage.queue({ profile_id: "acme", type: "youtube.set_visibility", params: { video_id: "v1", privacy_status: "public" } });
    assert.equal(vis.action.destructive, false);
    const unlist = engine.manage.queue({ profile_id: "acme", type: "youtube.set_visibility", params: { video_id: "v1", privacy_status: "unlisted" } });
    assert.equal((await engine.manage.approve({ id: unlist.action.id, approved_by: "desk" })).confirm_phrase, "UNLISTED");
  } finally {
    cleanup();
  }
});

test("old connections show reconnect, keep their scopes, and block new actions before any call", async () => {
  const { calls, fetchImpl } = apiMock();
  const { engine, cleanup } = setup({ fetchImpl });
  try {
    seed(engine, "youtube", null);
    seed(engine, "x", LEGACY_SCOPES.x);
    const rows = accessStatus(engine.store, "acme");
    const yt = rows.find((r) => r.platform === "youtube");
    assert.equal(yt.action, "reconnect");
    assert.ok(yt.missing.some((s) => /force-ssl/.test(s.scope)));
    assert.equal(rows.find((r) => r.platform === "facebook").action, "connect");
    assert.ok(rows.find((r) => r.platform === "x").missing.some((s) => s.scope === "like.write"));
    const { action } = engine.manage.queue({ profile_id: "acme", type: "youtube.update_channel", params: { description: "x" } });
    await assert.rejects(engine.manage.approve({ id: action.id, approved_by: "desk" }), (e) => e.code === "needs_reconnect");
    assert.equal(calls.length, 0);
    // A legacy connection still publishes: its record is unchanged.
    assert.equal(engine.store.getConnection("acme", "youtube").account_label, "youtube acct");
    assert.ok(API_LIMITS.instagram.some((l) => /caption/i.test(l)));
  } finally {
    cleanup();
  }
});

async function deskFor(engine, port) {
  const desk = createDeskServer({ engine, env: { SOCIAL_MCP_DESK_PORT: String(port) }, port });
  await desk.start({ open: false });
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  return { desk, base, post };
}

test("desk routes: queue, two-step delete, and the recorder log it with secrets removed", async () => {
  const { fetchImpl } = apiMock();
  const [port, oauthPort] = await freePorts(2);
  const { engine, cleanup } = setup({ fetchImpl, env: { SOCIAL_MCP_OAUTH_PORT: String(oauthPort) } });
  const { desk, base, post } = await deskFor(engine, port);
  try {
    seed(engine, "x");
    const listed0 = await fetch(`${base}/api/recordings`).then((r) => r.json());
    assert.equal(listed0.active, null, "recording is off by default");
    const started = await post("/api/recordings/start", { name: "Demo bob@example.com" });
    assert.match(started.recording.name, /\[email\]/);
    const q = await post("/api/manage/queue", { profile_id: "acme", type: "x.delete_post", params: { tweet_id: "t1" } });
    assert.equal(q.ok, true);
    const step1 = await post("/api/manage/approve", { action_id: q.action.id });
    assert.equal(step1.needs_confirm, true);
    const bad = await post("/api/manage/approve", { action_id: q.action.id, confirm_nonce: step1.confirm_nonce, confirm_text: "nope" });
    assert.equal(bad.ok, false);
    const step2 = await post("/api/manage/approve", { action_id: q.action.id, confirm_nonce: step1.confirm_nonce, confirm_text: "DELETE" });
    assert.equal(step2.action.status, "done");
    engine.emit("account_connected", { platform: "x", access_token: "SECRET123", note: "token ya29.abcdefghijklmnop" });
    const view = await fetch(`${base}/api/manage?profile_id=acme`).then((r) => r.json());
    assert.equal(view.access.find((r) => r.platform === "x").action, "ok");
    const stopped = await post("/api/recordings/stop", {});
    const id = stopped.recording.id;
    const events = await fetch(`${base}/api/recordings/${id}/events.jsonl`).then((r) => r.text());
    assert.match(events, /action_queued/);
    assert.match(events, /action_done/);
    assert.doesNotMatch(events, /SECRET123|ya29\.abc|tok-x|bob@example/);
    const summary = await fetch(`${base}/api/recordings/${id}/summary.md`).then((r) => r.text());
    assert.match(summary, /First item queued/);
    assert.match(summary, /hook in the first 1-2 seconds/);
    const renamed = await post("/api/recordings/rename", { id, name: "Launch demo" });
    assert.equal(renamed.recording.name, "Launch demo");
    const upload = await fetch(`${base}/api/recordings/video?id=${id}`, { method: "POST", headers: { "content-type": "video/webm" }, body: Buffer.from("webm") }).then((r) => r.json());
    assert.equal(upload.ok, true);
    const dl = await fetch(`${base}/api/recordings/${id}/desk.webm?download=1`);
    assert.match(dl.headers.get("content-disposition"), /attachment/);
    assert.equal((await post("/api/recordings/delete", { id })).ok, false, "delete needs confirm");
    assert.equal((await post("/api/recordings/delete", { id, confirm: true })).ok, true);
    assert.equal((await fetch(`${base}/api/recordings`).then((r) => r.json())).recordings.length, 0);
    assert.equal((await fetch(`${base}/api/recordings/rec_bad/desk.webm`)).status, 404);
  } finally {
    await desk.stop();
    cleanup();
  }
});

test("MCP exposes queue and status tools but no approve tool", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/mcp/server.js", import.meta.url), "utf8");
  assert.match(src, /"queue_account_action"/);
  assert.match(src, /"account_access_status"/);
  assert.doesNotMatch(src, /"approve_account_action"/);
  const ui = (await import("node:fs")).readFileSync(new URL("../src/desk/public/manage.js", import.meta.url), "utf8");
  assert.match(ui, /audio: false/);
  assert.doesNotMatch(ui.replace(/\/\/.*$/gm, ""), /\bAI\b/);
});
