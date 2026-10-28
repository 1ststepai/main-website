import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { createEngine } from "../src/engine.js";
import { probeMedia, stripAudio } from "../src/media/audio.js";
import { SILENT_VIDEO_NOTE, createMediaProvider, generateToFile } from "../src/media/providers.js";
import { planFor, resolveDuration, validateAgainstSpec } from "../src/media/specs.js";
import { publicOAuthConfig } from "../src/envFile.js";
import { metaDisclosureParams } from "../src/publish/meta.js";
import { youtubeUploadMetadata } from "../src/publish/youtube.js";

const exec = promisify(execFile);

function engineHome() {
  const home = mkdtempSync(join(tmpdir(), "postpath-media-"));
  let calls = 0;
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("live media network");
    },
  });
  return {
    engine,
    calls: () => calls,
    async stop() {
      await engine.oauth.stop();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

test("network presets group a master by aspect", () => {
  const vertical = planFor(["youtube", "instagram", "tiktok"], { type: "video" });
  assert.deepEqual(vertical.map((row) => row.id), ["youtube_short", "instagram_reel", "tiktok"]);
  assert.equal(new Set(vertical.map((row) => row.aspect)).size, 1);
  const mixed = planFor(["youtube", "tiktok"], {
    type: "video",
    overrides: { youtube: { placement: "youtube_long" } },
  });
  assert.deepEqual(mixed.map((row) => [row.id, row.aspect]), [
    ["youtube_long", "16:9"],
    ["tiktok", "9:16"],
  ]);
  const images = planFor(["instagram", "facebook", "linkedin", "x", "bluesky", "threads"], { type: "image" });
  assert.equal(images.find((row) => row.platform === "instagram").id, "instagram_feed");
  assert.equal(images.find((row) => row.platform === "x").aspect, "16:9");
  assert.throws(() => resolveDuration(
    [
      { kind: "video", label: "A", minDuration: 30, maxDuration: 40 },
      { kind: "video", label: "B", minDuration: 3, maxDuration: 10 },
    ],
    8,
  ), /do not share a duration/);
});

test("validation names the preset a file missed", () => {
  const reel = planFor(["instagram"], { type: "video" })[0];
  const wide = validateAgainstSpec({ width: 1920, height: 1080, duration: 120, video: true, hasAudio: false }, reel);
  assert.equal(wide.ok, false);
  assert.match(wide.message, /9:16/);
  assert.match(wide.message, /90 seconds/);
  const loud = validateAgainstSpec(
    { width: 1080, height: 1920, duration: 8, video: true, hasAudio: true },
    reel,
    { silent: true },
  );
  assert.match(loud.message, /silent/);
});

test("mock image generation fills the queue and does not call a provider", async () => {
  const rig = engineHome();
  try {
    await rig.engine.upsertProfile({ id: "acme", name: "Acme" });
    const created = await rig.engine.createDraft({
      profile_id: "acme",
      platforms: ["instagram", "facebook"],
      title: "Generated",
      caption: "Shared caption",
      overrides: { instagram: { caption: "IG caption" }, facebook: { caption: "FB caption" } },
      media: { generate: { prompt: "A navy desk at night", type: "image", provider: "mock", style: "flat" } },
      wait: true,
    });
    assert.equal(created.bundle.media_status, "ready");
    assert.equal(created.bundle.media_provenance.provider, "mock");
    assert.equal(created.bundle.media_provenance.ai_generated, true);
    assert.equal(created.posts.find((post) => post.platform === "instagram").caption, "IG caption");
    const queue = rig.engine.listQueue().queue;
    const item = queue.find((row) => row.id === created.bundle.id);
    assert.equal(item.prompt, "A navy desk at night");
    assert.equal(item.provider, "mock");
    const ig = item.assets.find((asset) => asset.platform === "instagram");
    const fb = item.assets.find((asset) => asset.platform === "facebook");
    assert.equal(ig.aspect, "4:5");
    assert.equal(ig.spec_ok, true);
    assert.equal(ig.content_type, "image/jpeg");
    assert.match(ig.spec_message, /Instagram feed/);
    assert.equal(fb.aspect, "1:1");
    assert.equal(fb.media_path.endsWith(".jpg"), true);
    assert.equal(rig.calls(), 0);
    const again = await rig.engine.generateMedia({ bundle_id: created.bundle.id, wait: true });
    assert.equal(again.media_status, "ready");
  } finally {
    await rig.stop();
  }
});

test("generated video is silent and blocks approval until it is ready", async () => {
  const rig = engineHome();
  try {
    await rig.engine.upsertProfile({ id: "acme", name: "Acme" });
    const created = await rig.engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube"],
      title: "Silent short",
      caption: "No voice",
      media: { generate: { prompt: "A cursor blinking", type: "video", provider: "mock", duration: 4 } },
      wait: true,
    });
    const post = created.posts[0];
    const probe = await probeMedia(join(rig.engine.store.homePaths.mediaDir, post.media_path));
    assert.equal(probe.hasAudio, false);
    assert.equal(probe.video, true);
    assert.equal(post.ai_generated, true);
    assert.equal(post.media_provenance.silent, true);
    const metadata = youtubeUploadMetadata(post);
    assert.equal(metadata.status.containsSyntheticMedia, true);
    assert.equal(youtubeUploadMetadata({ title: "Own file", privacy_status: "private" }).status.containsSyntheticMedia, undefined);
    assert.deepEqual(metaDisclosureParams(post), { is_ai_generated: "true" });
    created.bundle.media_status = "generating";
    created.bundle.media_owner = process.pid;
    rig.engine.store.saveBundle(created.bundle);
    await assert.rejects(
      () => rig.engine.approveBundle({ bundle_id: created.bundle.id, instagram_public_confirmed: true }),
      /still generating/,
    );
    assert.equal(rig.calls(), 0);
  } finally {
    await rig.stop();
  }
});

test("a mismatched duration is rejected before a file is queued", async () => {
  const rig = engineHome();
  try {
    await rig.engine.upsertProfile({ id: "acme", name: "Acme" });
    await assert.rejects(
      () => rig.engine.createDraft({
        profile_id: "acme",
        platforms: ["instagram"],
        title: "Too short",
        caption: "Reel",
        media: { generate: { prompt: "A cup", type: "video", provider: "mock", duration: 1 } },
        wait: true,
      }),
      /between 3 and 90/,
    );
    const queue = rig.engine.listQueue().queue;
    assert.equal(queue[0].media_status, "failed");
    assert.match(queue[0].media_error, /between 3 and 90/);
  } finally {
    await rig.stop();
  }
});

test("ffmpeg strips audio and a client file follows the same rule", async () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-audio-"));
  const loud = join(home, "loud.mp4");
  await exec("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "color=c=black:s=360x640:d=4",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    "-shortest",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    loud,
  ]);
  const before = await probeMedia(loud);
  assert.equal(before.hasAudio, true);
  await stripAudio(loud);
  assert.equal((await probeMedia(loud)).hasAudio, false);

  const rig = engineHome();
  try {
    await exec("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=black:s=360x640:d=4",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
      "-shortest",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      join(rig.engine.store.homePaths.mediaDir, "client.mp4"),
    ]);
    await rig.engine.upsertProfile({ id: "acme", name: "Acme" });
    const created = await rig.engine.createDraft({
      profile_id: "acme",
      platform: "youtube",
      title: "Client file",
      caption: "From another model",
    });
    const attached = await rig.engine.attachMedia({
      post_id: created.post.id,
      media_path: "client.mp4",
      type: "video",
      prompt: "Made outside PostPath",
      ai_generated: true,
    });
    const file = join(rig.engine.store.homePaths.mediaDir, attached.post.media_path);
    assert.equal((await probeMedia(file)).hasAudio, false);
    assert.equal(attached.post.media_provenance.provider, "client");
    assert.equal(attached.post.ai_generated, true);
    const queue = rig.engine.listQueue().queue[0];
    assert.equal(queue.assets[0].provider, "client");
    assert.equal(queue.assets[0].spec_ok, true);
  } finally {
    await rig.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("provider requests disable audio and never echo the key", async () => {
  const key = "sk-test-secret-value";
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    throw new Error(`provider down ${key}`);
  };
  await assert.rejects(
    () => generateToFile(createMediaProvider("google", { keys: { google: key }, fetchImpl }), {
      type: "video",
      dest: "/tmp/unused.mp4",
      prompt: `A desk. ${SILENT_VIDEO_NOTE}`,
      aspect: "9:16",
      duration: 4,
    }),
    (error) => {
      assert.equal(String(error.message).includes(key), false);
      return true;
    },
  );
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.parameters.generateAudio, false);
  assert.match(seen[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(seen[0].init.headers["x-goog-api-key"], key);

  seen.length = 0;
  await assert.rejects(
    () => generateToFile(createMediaProvider("xai", { keys: { xai: key }, fetchImpl }), {
      type: "video",
      dest: "/tmp/unused.mp4",
      prompt: "A desk",
      aspect: "9:16",
      duration: 4,
    }),
    (error) => {
      assert.equal(String(error.message).includes(key), false);
      return true;
    },
  );
  const xai = JSON.parse(seen[0].init.body);
  assert.equal(xai.audio, false);
  assert.match(xai.prompt, /Silent video/);
  assert.match(seen[0].url, /api\.x\.ai/);

  seen.length = 0;
  await assert.rejects(
    () => generateToFile(createMediaProvider("openai", { keys: { openai: key }, fetchImpl }), {
      type: "image",
      dest: "/tmp/unused.png",
      prompt: "A desk",
      aspect: "1:1",
    }),
    (error) => {
      assert.equal(String(error.message).includes(key), false);
      return true;
    },
  );
  const openai = JSON.parse(seen[0].init.body);
  assert.equal(openai.model, "gpt-image-1");
  assert.match(seen[0].url, /api\.openai\.com/);

  seen.length = 0;
  await assert.rejects(
    () => generateToFile(createMediaProvider("replicate", { keys: { replicate: key }, fetchImpl, env: { REPLICATE_VIDEO_MODEL: "owner/model" } }), {
      type: "video",
      dest: "/tmp/unused.mp4",
      prompt: "A desk",
      aspect: "16:9",
      duration: 4,
    }),
    /provider down/,
  );
  const replicate = JSON.parse(seen[0].init.body);
  assert.equal(replicate.input.generate_audio, false);
  assert.match(seen[0].url, /api\.replicate\.com/);

  await assert.rejects(
    () => generateToFile(createMediaProvider("fal", { keys: { fal: key }, fetchImpl, env: {} }), {
      type: "image",
      dest: "/tmp/unused.png",
      prompt: "A desk",
      aspect: "1:1",
    }),
    /FAL_IMAGE_MODEL/,
  );
  assert.equal(seen.length, 1);

  const masked = publicOAuthConfig({ OPENAI_API_KEY: "sk-live-secret-value" });
  assert.equal(masked.OPENAI_API_KEY.includes("sk-live-secret-value"), false);
  assert.match(masked.OPENAI_API_KEY, /••••/);
  assert.equal(masked.has_openai, true);
});
