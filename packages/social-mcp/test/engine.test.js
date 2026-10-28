import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { missingProviders } from "../src/oauth/providers.js";
import { youtubeFetchMock } from "./helpers/youtubeFetchMock.js";
import { seedXConnection, xTweetFetchMock } from "./helpers/xFetchMock.js";
import { PLATFORM_TEXT_LIMITS } from "../src/publish/validate.js";

test("missingProviders reports full OAuth chain gaps", () => {
  assert.deepEqual(missingProviders([]), [
    "youtube",
    "meta",
    "tiktok",
    "linkedin",
    "x",
    "threads",
    "pinterest",
    "google_business",
    "reddit",
    "snapchat",
  ]);
  assert.deepEqual(
    missingProviders([
      { platform: "youtube" },
      { platform: "facebook" },
      { platform: "instagram" },
      { platform: "tiktok" },
      { platform: "linkedin" },
      { platform: "x" },
      { platform: "threads" },
      { platform: "pinterest" },
      { platform: "google_business" },
      { platform: "reddit" },
      { platform: "snapchat" },
    ]),
    [],
  );
});

test("draft schedule and due publish path for youtube", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  const mediaDir = join(home, "media");
  mkdirSync(mediaDir, { recursive: true });
  const media = join(mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(2048, 1));
  const calls = [];
  const fetchImpl = youtubeFetchMock(calls, { videoId: "vid123" });

  try {
    const engine = createEngine({
      home,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: "gid",
        GOOGLE_OAUTH_CLIENT_SECRET: "gsecret",
      },
      fetchImpl,
      now: () => Date.parse("2026-10-27T12:00:00.000Z"),
    });
    await engine.upsertProfile({ id: "acme", name: "Acme Co" });
    engine.store.saveConnection(
      {
        profile_id: "acme",
        platform: "youtube",
        account_label: "@acme",
        channel_id: "UCacme",
      },
      {
        refresh_token: "rt",
        access_token: "old",
        expires_at: "2020-01-01T00:00:00.000Z",
      },
    );
    const { post } = await engine.createDraft({
      profile_id: "acme",
      platform: "youtube",
      title: "Test short",
      description: "Body",
      media_path: media,
      privacy_status: "private",
    });
    assert.equal(post.status, "draft");
    assert.equal(post.media_path, media);
    const scheduled = await engine.schedulePost({
      post_id: post.id,
      scheduled_at: "2026-10-27T12:05:00.000Z",
    });
    assert.equal(scheduled.post.status, "scheduled");

    await assert.rejects(() => engine.publishPost({ post_id: post.id }), /scheduled for later/);

    const dueEngine = createEngine({
      home,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: "gid",
        GOOGLE_OAUTH_CLIENT_SECRET: "gsecret",
      },
      fetchImpl,
      now: () => Date.parse("2026-10-27T12:06:00.000Z"),
    });
    const published = await dueEngine.publishDue({ profile_id: "acme" });
    assert.equal(published.count, 1);
    assert.equal(published.results[0].post.status, "published");
    assert.equal(published.results[0].post.platform_post_id, "vid123");
    assert.ok(calls.some((call) => call.url.includes("uploadType=resumable")));
    await dueEngine.oauth.stop();
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("rejects media_path outside the vault media directory", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  const outside = join(home, "outside.mp4");
  writeFileSync(outside, Buffer.alloc(64, 1));
  try {
    const engine = createEngine({ home, now: () => Date.parse("2026-10-27T12:00:00.000Z") });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    await assert.rejects(
      () =>
        engine.createDraft({
          profile_id: "acme",
          platform: "youtube",
          media_path: outside,
        }),
      /media directory/,
    );
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("instagram publish without a file or https url is rejected before upload", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  try {
    const engine = createEngine({ home, now: () => Date.parse("2026-10-27T12:00:00.000Z") });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    engine.store.saveConnection(
      {
        profile_id: "acme",
        platform: "instagram",
        account_label: "@acme",
        instagram_id: "123",
        page_id: "page1",
      },
      { page_access_token: "pat" },
    );
    const { post } = await engine.createDraft({
      profile_id: "acme",
      platform: "instagram",
      caption: "hello",
    });
    await assert.rejects(() => engine.publishPost({ post_id: post.id }), /media_url/);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("x publish posts text tweet", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  try {
    const engine = createEngine({
      home,
      env: { X_CLIENT_ID: "xid", X_CLIENT_SECRET: "xsecret" },
      fetchImpl: xTweetFetchMock({ tweetId: "tw123" }),
      now: () => Date.parse("2026-10-27T12:00:00.000Z"),
    });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    seedXConnection(engine);
    const { post } = await engine.createDraft({
      profile_id: "acme",
      platform: "x",
      caption: "hello from postpath",
    });
    const published = await engine.publishPost({ post_id: post.id });
    assert.equal(published.post.status, "published");
    assert.equal(published.post.platform_post_id, "tw123");
    assert.deepEqual(published.warnings, []);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("publish_post blocks validation errors and surfaces length warnings", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  try {
    const engine = createEngine({
      home,
      env: { X_CLIENT_ID: "xid", X_CLIENT_SECRET: "xsecret" },
      fetchImpl: xTweetFetchMock({ tweetId: "tw-warn" }),
      now: () => Date.parse("2026-10-27T12:00:00.000Z"),
    });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    engine.store.saveConnection(
      { profile_id: "acme", platform: "youtube", account_label: "@acme", channel_id: "UCacme" },
      { refresh_token: "rt", access_token: "old", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    seedXConnection(engine);

    const yt = await engine.createDraft({
      profile_id: "acme",
      platform: "youtube",
      title: "no file",
      description: "missing media",
    });
    await assert.rejects(() => engine.publishPost({ post_id: yt.post.id }), /media_path|validation/i);

    const long = await engine.createDraft({
      profile_id: "acme",
      platform: "x",
      caption: "x".repeat(PLATFORM_TEXT_LIMITS.x + 5),
    });
    const published = await engine.publishPost({ post_id: long.post.id });
    assert.equal(published.post.status, "published");
    assert.ok(published.warnings.some((w) => /280/.test(w)));
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("snapchat and whatsapp publish stay honestly restricted", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  try {
    const engine = createEngine({ home, now: () => Date.parse("2026-10-27T12:00:00.000Z") });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    engine.store.saveConnection(
      { profile_id: "acme", platform: "snapchat", account_label: "Snapchat" },
      { access_token: "s" },
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "whatsapp", account_label: "WhatsApp" },
      { access_token: "w" },
    );
    const snap = await engine.createDraft({ profile_id: "acme", platform: "snapchat", caption: "hi" });
    const wa = await engine.createDraft({ profile_id: "acme", platform: "whatsapp", caption: "hi" });
    await assert.rejects(() => engine.publishPost({ post_id: snap.post.id }), /Marketing API/);
    await assert.rejects(() => engine.publishPost({ post_id: wa.post.id }), /Channels/);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("bluesky connect stores app password session", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  const fetchImpl = async (url) => {
    if (String(url).includes("createSession")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () =>
          JSON.stringify({
            accessJwt: "jwt",
            refreshJwt: "rjwt",
            did: "did:plc:acme",
            handle: "acme.bsky.social",
          }),
      };
    }
    return { ok: false, status: 500, headers: { get: () => "" }, text: async () => "{}" };
  };
  try {
    const engine = createEngine({ home, fetchImpl, now: () => Date.parse("2026-10-27T12:00:00.000Z") });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    const result = await engine.connectBluesky("acme", {
      handle: "acme.bsky.social",
      app_password: "xxxx-xxxx-xxxx-xxxx",
    });
    assert.equal(result.status, "complete");
    assert.equal(result.connection.platform, "bluesky");
    const secrets = engine.store.readSecrets("acme", "bluesky");
    assert.equal(secrets.identifier, "acme.bsky.social");
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
