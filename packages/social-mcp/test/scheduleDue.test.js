import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { youtubeFetchMock } from "./helpers/youtubeFetchMock.js";

async function seedYoutubeDraft(engine, media) {
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
  return engine.createDraft({
    profile_id: "acme",
    platform: "youtube",
    title: "Due clip",
    description: "Body",
    media_path: media,
    privacy_status: "private",
  });
}

test("schedule then advance clock then publish_due", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-due-"));
  const mediaDir = join(home, "media");
  mkdirSync(mediaDir, { recursive: true });
  const media = join(mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(2048, 1));
  const calls = [];
  let clock = Date.parse("2026-10-27T12:00:00.000Z");

  try {
    const engine = createEngine({
      home,
      env: {
        GOOGLE_OAUTH_CLIENT_ID: "gid",
        GOOGLE_OAUTH_CLIENT_SECRET: "gsecret",
      },
      fetchImpl: youtubeFetchMock(calls),
      now: () => clock,
    });
    const { post } = await seedYoutubeDraft(engine, media);
    await engine.schedulePost({
      post_id: post.id,
      scheduled_at: "2026-10-27T12:05:00.000Z",
    });

    const early = await engine.publishDue({ profile_id: "acme" });
    assert.equal(early.count, 0);

    clock = Date.parse("2026-10-27T12:06:00.000Z");
    const published = await engine.publishDue({ profile_id: "acme" });
    assert.equal(published.count, 1);
    assert.equal(published.results[0].post.status, "published");
    assert.equal(published.results[0].post.platform_post_id, "vid-due");
    assert.ok(calls.some((call) => call.url.includes("uploadType=resumable")));
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("cancelScheduledPost returns draft with null scheduled_at", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-cancel-"));
  try {
    const engine = createEngine({
      home,
      now: () => Date.parse("2026-10-27T12:00:00.000Z"),
    });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    const { post } = await engine.createDraft({
      profile_id: "acme",
      platform: "x",
      caption: "later",
    });
    await engine.schedulePost({
      post_id: post.id,
      scheduled_at: "2026-10-27T13:00:00.000Z",
    });
    const cancelled = await engine.cancelScheduledPost({ post_id: post.id });
    assert.equal(cancelled.post.status, "draft");
    assert.equal(cancelled.post.scheduled_at, null);

    await assert.rejects(() => engine.cancelScheduledPost({ post_id: post.id }), /Only scheduled/);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("desk due loop calls publishDue and clears on stop", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-loop-"));
  const env = {
    SOCIAL_MCP_OAUTH_PORT: "48014",
    SOCIAL_MCP_DESK_PORT: "48013",
    SOCIAL_MCP_DUE_INTERVAL_MS: "1000",
  };
  const engine = createEngine({ home, env, now: () => Date.parse("2026-10-27T12:00:00.000Z") });
  let calls = 0;
  const original = engine.publishDue.bind(engine);
  engine.publishDue = async (...args) => {
    calls += 1;
    return original(...args);
  };
  const desk = createDeskServer({ engine, env, port: 48013 });
  try {
    const started = await desk.start({ open: false });
    assert.equal(started.due_interval_ms, 1000);
    const status = await fetch(`${started.url}api/status`).then((res) => res.json());
    assert.equal(status.ok, true);
    assert.equal(status.due_interval_ms, 1000);
    assert.ok(Array.isArray(status.scheduled_posts));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.ok(calls >= 2, `expected due loop ticks, got ${calls}`);

    await desk.stop();
    const afterStop = calls;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(calls, afterStop);
  } finally {
    try {
      await desk.stop();
    } catch {
      // already stopped
    }
    rmSync(home, { recursive: true, force: true });
  }
});

test("desk cancel-scheduled API restores draft", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-desk-cancel-"));
  const env = {
    SOCIAL_MCP_OAUTH_PORT: "47996",
    SOCIAL_MCP_DESK_PORT: "47995",
    SOCIAL_MCP_DUE_INTERVAL_MS: "60000",
  };
  const engine = createEngine({
    home,
    env,
    now: () => Date.parse("2026-10-27T12:00:00.000Z"),
  });
  const desk = createDeskServer({ engine, env, port: 47995 });
  try {
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    const { post } = await engine.createDraft({
      profile_id: "acme",
      platform: "x",
      caption: "queued",
    });
    await engine.schedulePost({
      post_id: post.id,
      scheduled_at: "2026-10-27T15:00:00.000Z",
    });
    const { url } = await desk.start({ open: false });
    const before = await fetch(`${url}api/status`).then((res) => res.json());
    assert.equal(before.scheduled_posts.length, 1);
    const cancelled = await fetch(`${url}api/cancel-scheduled`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ post_id: post.id }),
    }).then((res) => res.json());
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.post.status, "draft");
    assert.equal(cancelled.post.scheduled_at, null);
    assert.equal(cancelled.scheduled_posts.length, 0);
    const html = await fetch(url).then((res) => res.text());
    assert.match(html, /Schedules only fire while PostPath is running/);
    assert.match(html, /cannot guarantee the platform did not accept/);
    const deskJs = await fetch(`${url}app.js`).then((res) => res.text());
    assert.match(deskJs, /cancel-scheduled/);
  } finally {
    await desk.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
