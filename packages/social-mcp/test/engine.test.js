import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { missingProviders } from "../src/oauth/providers.js";

test("missingProviders reports youtube meta tiktok gaps", () => {
  assert.deepEqual(missingProviders([]), ["youtube", "meta", "tiktok"]);
  assert.deepEqual(missingProviders([{ platform: "youtube" }, { platform: "facebook" }, { platform: "instagram" }]), [
    "tiktok",
  ]);
});

test("draft schedule and due publish path for youtube", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  const mediaDir = join(home, "media");
  mkdirSync(mediaDir, { recursive: true });
  const media = join(mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(2048, 1));
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () =>
          JSON.stringify({
            access_token: "ya29.access",
            expires_in: 3600,
          }),
      };
    }
    if (String(url).includes("uploadType=resumable")) {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === "location" ? "https://www.googleapis.com/upload/youtube/v3/resumable" : "") },
        text: async () => "",
      };
    }
    if (String(url).includes("/upload/youtube/v3/resumable")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        text: async () => JSON.stringify({ id: "vid123", status: { privacyStatus: "private" } }),
      };
    }
    return { ok: false, status: 500, headers: { get: () => "" }, text: async () => "{}" };
  };

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

test("meta publish requires https media_url", async () => {
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
