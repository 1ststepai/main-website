import { giveOwnX } from "./helpers/ownX.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";

const NOW = () => Date.parse("2026-06-01T12:00:00.000Z");

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name || "").toLowerCase()] || "" },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? {})),
  };
}

async function engineWith(fetchImpl, env = {}) {
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "social-mcp-plat-")));
  const mediaDir = join(home, "media");
  mkdirSync(mediaDir, { recursive: true });
  const media = join(mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(2048, 7));
  const engine = createEngine({ home, env, fetchImpl, now: NOW });
  await engine.upsertProfile({ id: "acme", name: "Acme" });
  return { home, engine, media };
}

test("mock publish paths for each implemented platform", async () => {
  const calls = [];
  const { home, engine, media } = await engineWith(
    async (url, init = {}) => {
      const href = String(url);
      calls.push({ href, method: init.method || "GET", authorization: init.headers?.authorization || "" });
      if (href.includes("status_code")) return jsonResponse(200, { status_code: "FINISHED" });
      if (href.includes("graph.facebook.com") && href.endsWith("/media")) return jsonResponse(200, { id: "ig-container" });
      if (href.includes("/media_publish")) return jsonResponse(200, { id: "ig-post" });
      if (href.includes("/video_reels")) return jsonResponse(200, { video_id: "start" });
      if (href.includes("/videos")) return jsonResponse(200, { id: "fb-vid" });
      if (href.includes("/inbox/video/init")) {
        return jsonResponse(200, { data: { upload_url: "https://upload.example/tiktok", publish_id: "tt-inbox" } });
      }
      if (href.includes("upload.example/tiktok")) return jsonResponse(201, "");
      if (href.includes("/ugcPosts")) return jsonResponse(201, { id: "urn:li:share:1" });
      if (href.includes("/2/tweets")) return jsonResponse(201, { data: { id: "tw1" } });
      if (href.includes("/threads_publish")) return jsonResponse(200, { id: "th-post" });
      if (href.includes("/threads")) return jsonResponse(200, { id: "th-container" });
      if (href.includes("/v5/oauth/token")) {
        return jsonResponse(200, { access_token: "pin-access", refresh_token: "pin-refresh", expires_in: 3600 });
      }
      if (href.includes("/v5/pins")) return jsonResponse(201, { id: "pin1" });
      if (href.includes("createSession")) {
        return jsonResponse(200, { accessJwt: "bsky-jwt", refreshJwt: "bsky-refresh", did: "did:plc:acme" });
      }
      if (href.includes("createRecord")) return jsonResponse(200, { uri: "at://did:plc:acme/app.bsky.feed.post/rkey" });
      if (href.includes("/localPosts")) return jsonResponse(200, { name: "accounts/1/locations/2/localPosts/9" });
      if (href.includes("/api/submit")) {
        return jsonResponse(200, { json: { errors: [], data: { id: "abc", url: "https://www.reddit.com/r/acme/comments/abc/" } } });
      }
      return jsonResponse(500, { unexpected: href });
    },
    {
      PINTEREST_APP_ID: "pid",
      PINTEREST_APP_SECRET: "psecret",
      TIKTOK_CLIENT_KEY: "tkey",
      TIKTOK_CLIENT_SECRET: "tsecret",
    },
  );
  try {
    const fresh = { access_token: "live", refresh_token: "rt", expires_at: "2099-01-01T00:00:00.000Z" };
    engine.store.saveConnection(
      { profile_id: "acme", platform: "instagram", account_label: "@acme", instagram_id: "ig1", page_id: "pg" },
      { page_access_token: "pat-ig" },
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "facebook", account_label: "Page", page_id: "pg", instagram_id: "ig1" },
      { page_access_token: "pat-fb" },
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "tiktok", account_label: "@acme", open_id: "o1" },
      fresh,
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "linkedin", account_label: "Acme", person_urn: "urn:li:person:1" },
      fresh,
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "x", account_label: "@acme", user_id: "1" },
      fresh,
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "threads", account_label: "@acme", threads_user_id: "th1" },
      fresh,
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "pinterest", account_label: "Acme", board_id: "board1" },
      { access_token: "pin-old", refresh_token: "pin-rt", expires_at: "2020-01-01T00:00:00.000Z" },
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "bluesky", account_label: "@acme.bsky.social", did: "did:plc:acme", handle: "acme.bsky.social" },
      { identifier: "acme.bsky.social", app_password: "app-pass", access_jwt: "", refresh_jwt: "", did: "did:plc:acme" },
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "google_business", account_label: "Acme", location_name: "accounts/1/locations/2" },
      fresh,
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "reddit", account_label: "u/acme" },
      fresh,
    );

    const ig = await engine.createDraft({
      profile_id: "acme",
      platform: "instagram",
      caption: "ig",
      media_url: "https://cdn.example/a.mp4",
      privacy_status: "public",
    });
    assert.equal((await engine.publishPost({ post_id: ig.post.id })).post.platform_post_id, "ig-post");

    const fb = await engine.createDraft({
      profile_id: "acme",
      platform: "facebook",
      caption: "fb",
      media_url: "https://cdn.example/a.mp4",
      privacy_status: "public",
    });
    assert.equal((await engine.publishPost({ post_id: fb.post.id })).post.status, "published");

    const tt = await engine.createDraft({
      profile_id: "acme",
      platform: "tiktok",
      title: "clip",
      media_path: media,
    });
    const tiktok = await engine.publishPost({ post_id: tt.post.id });
    assert.equal(tiktok.post.status, "handed_off");
    assert.equal(tiktok.post.platform_post_id, "tt-inbox");

    const li = await engine.createDraft({ profile_id: "acme", platform: "linkedin", caption: "li" });
    assert.equal((await engine.publishPost({ post_id: li.post.id })).post.platform_post_id, "urn:li:share:1");

    const x = await engine.createDraft({ profile_id: "acme", platform: "x", caption: "x" });
    assert.equal((await engine.publishPost({ post_id: x.post.id })).post.platform_post_id, "tw1");

    const threads = await engine.createDraft({ profile_id: "acme", platform: "threads", caption: "th" });
    assert.equal((await engine.publishPost({ post_id: threads.post.id })).post.platform_post_id, "th-post");

    const pin = await engine.createDraft({
      profile_id: "acme",
      platform: "pinterest",
      title: "pin",
      media_url: "https://cdn.example/a.jpg",
    });
    const pinned = await engine.publishPost({ post_id: pin.post.id });
    assert.equal(pinned.post.platform_post_id, "pin1");
    assert.equal(engine.store.readSecrets("acme", "pinterest").access_token, "pin-access");
    assert.ok(calls.some((call) => call.href.includes("/v5/oauth/token")));
    assert.ok(calls.some((call) => call.href.includes("/v5/pins") && call.authorization === "Bearer pin-access"));

    const bsky = await engine.createDraft({ profile_id: "acme", platform: "bluesky", caption: "sky" });
    assert.match((await engine.publishPost({ post_id: bsky.post.id })).post.published_url, /bsky\.app/);

    const gbp = await engine.createDraft({ profile_id: "acme", platform: "google_business", caption: "open" });
    assert.match((await engine.publishPost({ post_id: gbp.post.id })).post.platform_post_id, /localPosts/);

    const reddit = await engine.createDraft({
      profile_id: "acme",
      platform: "reddit",
      title: "hello",
      description: "body",
      tags: ["acme"],
    });
    assert.equal((await engine.publishPost({ post_id: reddit.post.id })).post.platform_post_id, "abc");

    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("youtube 401 refreshes once then uploads", async () => {
  let inits = 0;
  let tokens = 0;
  const { home, engine, media } = await engineWith(
    async (url) => {
      const href = String(url);
      if (href.includes("oauth2.googleapis.com/token")) {
        tokens += 1;
        return jsonResponse(200, { access_token: "ya-new", expires_in: 3600 });
      }
      if (href.includes("uploadType=resumable")) {
        inits += 1;
        if (inits === 1) return jsonResponse(401, { error: { message: "unauthorized" } });
        return jsonResponse(200, "", { location: "https://www.googleapis.com/upload/youtube/v3/resumable" });
      }
      if (href.includes("/upload/youtube/v3/resumable")) {
        return jsonResponse(200, { id: "vid401", status: { privacyStatus: "private" } });
      }
      return jsonResponse(500, {});
    },
    { GOOGLE_OAUTH_CLIENT_ID: "gid", GOOGLE_OAUTH_CLIENT_SECRET: "gsecret" },
  );
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "youtube", account_label: "@acme", channel_id: "UC1" },
      { access_token: "ya-old", refresh_token: "ya-rt", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const draft = await engine.createDraft({
      profile_id: "acme",
      platform: "youtube",
      title: "clip",
      description: "body",
      media_path: media,
      privacy_status: "private",
    });
    const published = await engine.publishPost({ post_id: draft.post.id });
    assert.equal(published.post.platform_post_id, "vid401");
    assert.equal(inits, 2);
    assert.equal(tokens, 1);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("meta 401 does not refresh or retry", async () => {
  let calls = 0;
  const { home, engine } = await engineWith(async () => {
    calls += 1;
    return jsonResponse(401, { error: { message: "invalid token" } });
  });
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "instagram", account_label: "@acme", instagram_id: "ig1", page_id: "pg" },
      { page_access_token: "pat" },
    );
    const draft = await engine.createDraft({
      profile_id: "acme",
      platform: "instagram",
      caption: "ig",
      media_url: "https://cdn.example/a.mp4",
      privacy_status: "public",
    });
    await assert.rejects(engine.publishPost({ post_id: draft.post.id }), (error) => error.code === "needs_reconnect");
    assert.equal(calls, 1);
    assert.equal(engine.store.getConnection("acme", "instagram").status, "needs_reconnect");
    assert.equal(engine.store.getPost(draft.post.id).status, "failed");
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("threads 401 refreshes the long-lived token once", async () => {
  let creates = 0;
  let refreshes = 0;
  const { home, engine } = await engineWith(async (url) => {
    const href = String(url);
    if (href.includes("refresh_access_token")) {
      refreshes += 1;
      return jsonResponse(200, { access_token: "th-new", expires_in: 5184000 });
    }
    if (href.includes("/threads_publish")) return jsonResponse(200, { id: "th-live" });
    if (href.includes("/threads")) {
      creates += 1;
      if (creates === 1) return jsonResponse(401, { error: { message: "unauthorized" } });
      return jsonResponse(200, { id: "th-container" });
    }
    return jsonResponse(500, {});
  });
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "threads", account_label: "@acme", threads_user_id: "th1" },
      { access_token: "th-old", refresh_token: "", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const draft = await engine.createDraft({ profile_id: "acme", platform: "threads", caption: "hello" });
    const published = await engine.publishPost({ post_id: draft.post.id });
    assert.equal(published.post.platform_post_id, "th-live");
    assert.equal(creates, 2);
    assert.equal(refreshes, 1);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
