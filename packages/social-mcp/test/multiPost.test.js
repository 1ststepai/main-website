import { giveOwnX } from "./helpers/ownX.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";

const NOW = () => Date.parse("2026-06-01T12:00:00.000Z");

async function rig(profile = { id: "acme", name: "Acme" }) {
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "social-multi-")));
  const mediaDir = join(home, "media");
  mkdirSync(mediaDir, { recursive: true });
  const media = join(mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(64, 1));
  let calls = 0;
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
    now: NOW,
  });
  await engine.upsertProfile(profile);
  for (const platform of ["youtube", "facebook", "instagram"]) {
    engine.store.saveConnection(
      { profile_id: profile.id, platform, account_label: platform, channel_id: "c", page_id: "p", instagram_id: "ig" },
      { access_token: "token", refresh_token: "rt", page_access_token: "page", expires_at: "2099-01-01T00:00:00.000Z" },
    );
  }
  return {
    home,
    engine,
    media,
    calls: () => calls,
    async stop() {
      await engine.oauth.stop();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

test("one draft fans out on approval and create does not publish", async () => {
  const rigged = await rig();
  try {
    const created = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube", "facebook", "instagram"],
      title: "One video",
      caption: "Shared caption",
      media_path: rigged.media,
      privacy_status: "private",
      instagram_public_confirmed: true,
      source: "mcp",
    });
    assert.equal(rigged.calls(), 0);
    assert.equal(created.posts.length, 3);
    assert.ok(created.posts.every((post) => post.status === "draft"));
    assert.equal(created.posts.find((post) => post.platform === "youtube").privacy_status, "private");
    assert.equal(created.posts.find((post) => post.platform === "facebook").privacy_status, "private");
    assert.equal(created.posts.find((post) => post.platform === "instagram").privacy_status, "public");
    assert.equal(created.bundle.source, "mcp");
    const queue = rigged.engine.listQueue().queue;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].source, "mcp");
    const approved = await rigged.engine.approveBundle({ bundle_id: created.bundle.id });
    assert.equal(rigged.calls(), 0);
    assert.equal(approved.results.filter((row) => row.ok).length, 3);
    assert.equal(approved.bundle.status, "complete");
    assert.equal(rigged.engine.listQueue().queue.length, 0);
    for (const post of created.posts) {
      const stored = rigged.engine.store.getPost(post.id);
      assert.equal(stored.status, "published");
      assert.equal(stored.result_source, "mock");
    }
  } finally {
    await rigged.stop();
  }
});

test("one platform failing does not block the others", async () => {
  const rigged = await rig();
  try {
    rigged.engine.store.deleteConnection("acme", "facebook");
    const created = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube", "facebook", "instagram"],
      title: "Partial",
      caption: "Shared",
      media_path: rigged.media,
      instagram_public_confirmed: true,
    });
    const approved = await rigged.engine.approveBundle({ bundle_id: created.bundle.id });
    const byPlatform = Object.fromEntries(approved.results.map((row) => [row.platform, row]));
    assert.equal(byPlatform.youtube.ok, true);
    assert.equal(byPlatform.instagram.ok, true);
    assert.equal(byPlatform.facebook.ok, false);
    assert.equal(byPlatform.facebook.error.code, "not_connected");
    assert.equal(rigged.engine.store.getPost(created.bundle.child_ids.youtube).status, "published");
    assert.equal(rigged.engine.store.getPost(created.bundle.child_ids.facebook).status, "draft");
    assert.equal(approved.bundle.status, "partial");
  } finally {
    await rigged.stop();
  }
});

test("instagram approval waits for an explicit public confirmation", async () => {
  const rigged = await rig();
  try {
    const created = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube", "instagram"],
      title: "Needs confirm",
      caption: "Shared",
      media_path: rigged.media,
    });
    await assert.rejects(
      () => rigged.engine.approveBundle({ bundle_id: created.bundle.id }),
      /Instagram publishes as a public Reel/,
    );
    assert.equal(rigged.engine.store.getPost(created.bundle.child_ids.youtube).status, "draft");
    assert.equal(rigged.engine.store.getPost(created.bundle.child_ids.instagram).status, "draft");
  } finally {
    await rigged.stop();
  }
});

test("approve for a time schedules every target and does not publish", async () => {
  const rigged = await rig();
  try {
    const created = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube", "facebook"],
      title: "Later",
      caption: "Shared",
      media_path: rigged.media,
      source: "desk",
    });
    const approved = await rigged.engine.approveBundle({
      bundle_id: created.bundle.id,
      scheduled_at: "2026-06-02T15:00:00.000Z",
    });
    assert.equal(approved.bundle.status, "scheduled");
    assert.equal(rigged.calls(), 0);
    assert.equal(rigged.engine.store.getPost(created.bundle.child_ids.youtube).status, "scheduled");
    assert.equal(rigged.engine.store.getPost(created.bundle.child_ids.facebook).status, "scheduled");
    const queue = rigged.engine.listQueue().queue;
    assert.equal(queue[0].scheduled_at, "2026-06-02T15:00:00.000Z");
  } finally {
    await rigged.stop();
  }
});

test("discard removes a waiting draft from the queue", async () => {
  const rigged = await rig();
  try {
    const created = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube"],
      title: "Drop me",
      caption: "Shared",
      media_path: rigged.media,
    });
    await rigged.engine.discardItem({ bundle_id: created.bundle.id });
    assert.equal(rigged.engine.listQueue().queue.length, 0);
    assert.equal(rigged.engine.store.getPost(created.bundle.child_ids.youtube), null);
  } finally {
    await rigged.stop();
  }
});

test("vidIQ is required for 1ststep-ai YouTube and optional for other profiles", async () => {
  const rigged = await rig({ id: "1ststep-ai", name: "1stStep" });
  try {
    const profile = rigged.engine.store.getProfile("1ststep-ai");
    assert.equal(profile.require_vidiq, true);
    const created = await rigged.engine.createDraft({
      profile_id: "1ststep-ai",
      platforms: ["youtube", "facebook"],
      title: "Checked",
      caption: "Shared",
      media_path: rigged.media,
    });
    assert.equal(rigged.engine.listQueue().queue[0].vidiq_needed, true);
    await assert.rejects(() => rigged.engine.approveBundle({ bundle_id: created.bundle.id }), /vidIQ/);
    assert.equal(rigged.engine.store.getPost(created.bundle.child_ids.facebook).status, "draft");
    await rigged.engine.attachVidiqCheck({ bundle_id: created.bundle.id, score: 72, notes: "Title is clear" });
    const approved = await rigged.engine.approveBundle({ bundle_id: created.bundle.id });
    assert.equal(approved.results.every((row) => row.ok), true);
  } finally {
    await rigged.stop();
  }
});

test("a single-platform draft stays compatible and presets fill the caption", async () => {
  const rigged = await rig();
  try {
    await rigged.engine.upsertProfile({
      id: "acme",
      name: "Acme",
      presets: { caption_footer: "Link in bio", hashtags: ["postpath"], platforms: ["youtube", "facebook"] },
    });
    const single = await rigged.engine.createDraft({
      profile_id: "acme",
      platform: "x",
      caption: "hello from postpath",
    });
    assert.equal(single.bundle, undefined);
    assert.equal(single.post.platform, "x");
    assert.equal(rigged.engine.store.listBundles().length, 0);
    const multi = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube"],
      caption: "Hello",
      media_path: rigged.media,
    });
    assert.match(multi.bundle.caption, /Link in bio/);
    assert.ok(multi.bundle.tags.includes("postpath"));
    assert.equal(rigged.engine.store.getProfile("acme").require_vidiq, undefined);
    const titled = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube", "facebook", "instagram"],
      caption: "Every social media scheduler I tried was garbage. So I built my own. #buildinpublic #indiehacker #so",
      media_path: rigged.media,
      overrides: { youtube: { title: "I built my own scheduler" } },
    });
    assert.equal(titled.bundle.title, "I built my own scheduler");
    const trimmed = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube"],
      caption: "Every social media scheduler I tried was garbage. So I built my own. #buildinpublic #indiehacker #so",
      media_path: rigged.media,
    });
    assert.equal(trimmed.bundle.title, "Every social media scheduler I tried was garbage. So I built my own.");
    assert.doesNotMatch(trimmed.bundle.title, /#/);
  } finally {
    await rigged.stop();
  }
});

test("desk approve queue posts the bundle and keeps each result", async () => {
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "social-multi-desk-")));
  const mediaDir = join(home, "media");
  mkdirSync(mediaDir, { recursive: true });
  const media = join(mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(32, 2));
  const env = { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "48781", SOCIAL_MCP_DESK_PORT: "48780" };
  const engine = createEngine({ home, env, fetchImpl: async () => { throw new Error("network"); }, now: NOW });
  const desk = createDeskServer({ engine, env, port: 48780 });
  try {
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    engine.store.saveConnection(
      { profile_id: "acme", platform: "youtube", account_label: "Channel", channel_id: "c" },
      { access_token: "token", refresh_token: "rt", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const { url } = await desk.start({ open: false });
    const created = await engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube"],
      title: "Desk queue",
      caption: "Shared",
      media_path: media,
      source: "mcp",
    });
    const status = await fetch(`${url}api/status`).then((res) => res.json());
    assert.equal(status.queue[0].source, "mcp");
    assert.equal(status.queue[0].title, "Desk queue");
    const approved = await fetch(`${url}api/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle_id: created.bundle.id }),
    }).then((res) => res.json());
    assert.equal(approved.ok, true);
    assert.equal(approved.results[0].ok, true);
    assert.equal(approved.queue.length, 0);
  } finally {
    await desk.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("one approve click fans out a caption and media to every network in the bundle", async () => {
  const rigged = await rig();
  try {
    for (const platform of ["bluesky", "linkedin", "x", "threads"]) {
      rigged.engine.store.saveConnection(
        { profile_id: "acme", platform, account_label: platform },
        { access_token: "token", refresh_token: "rt", page_access_token: "page", expires_at: "2099-01-01T00:00:00.000Z" },
      );
    }
    const platforms = ["youtube", "facebook", "instagram", "bluesky", "linkedin", "x", "threads"];
    const overrides = {};
    for (const platform of platforms) overrides[platform] = { caption: `${platform} caption` };
    const created = await rigged.engine.createDraft({
      profile_id: "acme",
      platforms,
      title: "One click",
      caption: "Shared caption",
      media_path: rigged.media,
      instagram_public_confirmed: true,
      overrides,
    });
    const queue = rigged.engine.listQueue().queue[0];
    assert.equal(queue.instagram_needs_confirm, false);
    assert.equal(queue.platforms.length, platforms.length);
    assert.ok(created.posts.every((post) => post.caption.includes(post.platform)));
    const approved = await rigged.engine.approveBundle({ bundle_id: created.bundle.id });
    assert.equal(approved.results.length, platforms.length);
    assert.deepEqual(
      approved.results.map((row) => row.platform).sort(),
      [...platforms].sort(),
    );
    assert.equal(approved.results.every((row) => row.ok), true);
    assert.equal(rigged.calls(), 0);
  } finally {
    await rigged.stop();
  }
});
