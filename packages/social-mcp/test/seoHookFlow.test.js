import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";

const NOW = () => Date.parse("2026-06-01T12:00:00.000Z");
const TOPIC = "lead follow-up";
const COPIED = "How founders fix follow up systems today";

test("topic, keywords, score, vidIQ gate, and hook attach stay local and mock approve calls no publisher", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-flow-"));
  const media = join(home, "media");
  let calls = 0;
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0", YOUTUBE_API_KEY: "flow-test-key" },
    now: NOW,
    fetchImpl: async (url) => {
      calls += 1;
      const href = String(url);
      assert.equal(href.includes("googlevideo"), false);
      assert.equal(href.includes("youtube/v3/videos?") || href.includes("/search") || href.includes("/channels"), true);
      if (href.includes("/search")) {
        return { ok: true, json: async () => ({ items: [{ id: { videoId: "flowVid1" } }] }) };
      }
      if (href.includes("/videos")) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: "flowVid1",
                snippet: {
                  title: COPIED,
                  description: "Public description kept only for the copy check.",
                  channelId: "UC1",
                  channelTitle: "Example",
                  publishedAt: "2026-05-01T00:00:00Z",
                },
                statistics: { viewCount: "500" },
                contentDetails: { duration: "PT40S" },
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ items: [{ id: "UC1", statistics: { subscriberCount: "50" } }] }) };
    },
    hookGenerator: async () => [
      {
        spoken: COPIED,
        on_screen_text: "Copied line",
        shot: "Do not use this.",
        beats: [{ t: "0s", text: "Copied" }],
        why: "This repeats the source title.",
      },
      {
        spoken: "Name the bottleneck before you add a tool.",
        on_screen_text: "Name the bottleneck",
        shot: "You point at one note on the desk.",
        beats: [{ t: "0s", text: "Point" }, { t: "4s", text: "Say the next step" }],
        why: "The result shows up before the tour.",
      },
    ],
    structureProvider: async () => ({
      opening_type: "question",
      pattern: "What if {someone} fixed {thing} first?",
      visual_surprise: "One note is already on the desk",
      pacing: { cuts_or_beats: 2, seconds_to_first_payoff: 4 },
      delivery: { on_camera: true, energy: "", eye_contact: true, text_on_screen: true },
      promise: "A smaller next step",
      transcript: "must not be stored",
    }),
  });
  try {
    engine.seo.saveKeywordProfile({
      profile_id: "1ststep-ai",
      name: "1stStep.ai",
      primary: ["lead follow-up", "systems for founders"],
      secondary: ["workflow diagnosis"],
      negative: ["guaranteed revenue"],
    });
    engine.seo.saveKeywordProfile({
      profile_id: "skillsprout",
      name: "SkillSprout",
      primary: ["printable worksheets"],
      secondary: ["teacher worksheets"],
      negative: ["homework answers"],
    });
    const db = JSON.parse(readFileSync(join(home, "db.json"), "utf8"));
    assert.deepEqual(db.seo.keywords["1ststep-ai"].primary, ["lead follow-up", "systems for founders"]);
    assert.deepEqual(db.seo.keywords.skillsprout.primary, ["printable worksheets"]);
    assert.equal(db.posts === undefined || typeof db.posts === "object", true);

    const drafted = await engine.seo.draft({ topic: TOPIC, profile_ids: ["1ststep-ai", "skillsprout"] });
    assert.equal(drafted.drafts.length, 2);
    const youtube = drafted.drafts.find((row) => row.profile_id === "1ststep-ai").channels.find((row) => row.platform === "youtube");
    const preQueue = engine.seo.score({
      profile_id: "1ststep-ai",
      platform: "youtube",
      title: youtube.title,
      description: youtube.description,
      caption: youtube.caption,
      hashtags: youtube.hashtags,
    });
    assert.equal(preQueue.advisory, true);
    assert.equal(preQueue.auto_approve, false);
    assert.equal(typeof preQueue.checklist_score, "number");
    assert.ok(Array.isArray(preQueue.notes));

    const queued = await engine.seo.queueDrafts({
      topic: TOPIC,
      brands: [
        {
          profile_id: "1ststep-ai",
          name: "1stStep.ai",
          channels: drafted.drafts
            .find((row) => row.profile_id === "1ststep-ai")
            .channels.filter((row) => row.platform === "youtube"),
        },
      ],
    });
    const bundleId = queued.created[0].bundle.id;
    await assert.rejects(() => engine.approveBundle({ bundle_id: bundleId }), /vidIQ/);
    assert.equal(calls, 0);

    const found = await engine.hooks.find({ profile_id: "1ststep-ai", topic: TOPIC, format: "shorts" });
    assert.equal(found.examples.length, 1);
    assert.match(found.examples[0].metrics.math, /500 views \/ 50 subscribers/);
    const captured = await engine.hooks.capture({
      video_id: found.examples[0].video_id,
      title: found.examples[0].title,
      metrics: found.examples[0].metrics,
    });
    assert.equal(captured.structure.transcript, undefined);
    assert.equal(JSON.parse(readFileSync(join(home, "db.json"), "utf8")).seo.structures.flowVid1.transcript, undefined);

    const generated = await engine.hooks.generate({
      profile_id: "1ststep-ai",
      topic: TOPIC,
      video_id: "flowVid1",
      title: COPIED,
      source_description: found.examples[0].description,
      draft_id: bundleId,
      pick: 1,
    });
    assert.equal(generated.rejected >= 1, true);
    assert.equal(generated.hooks.some((row) => row.spoken === COPIED), false);
    assert.match(generated.hooks[0].spoken, /bottleneck/);
    assert.equal(generated.attached.auto_approve, false);

    const item = engine.listQueue().queue.find((row) => row.id === bundleId);
    assert.ok(item);
    assert.equal(item.vidiq_needed, true);
    assert.ok(item.seo.notes.some((note) => /vidIQ/.test(note)));
    assert.equal(item.seo.advisory, true);
    assert.equal(item.hook.spoken, generated.hooks[0].spoken);

    engine.attachVidiqCheck({ bundle_id: bundleId, score: 70, notes: "Pasted from vidIQ", checked_at: "2026-06-01T12:00:00.000Z" });
    const post = engine.store.getPost(engine.store.getBundle(bundleId).child_ids.youtube);
    writeFileSync(join(media, "clip.mp4"), Buffer.alloc(32, 1));
    post.media_path = "clip.mp4";
    post.media_content_type = "video/mp4";
    engine.store.savePost(post);
    engine.store.saveConnection(
      { profile_id: "1ststep-ai", platform: "youtube", account_label: "1stStep", channel_id: "UC1" },
      { access_token: "token", refresh_token: "rt", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const beforeApprove = calls;
    const approved = await engine.approveBundle({ bundle_id: bundleId });
    assert.equal(calls, beforeApprove);
    assert.equal(approved.results[0].ok, true);
    assert.equal(approved.results[0].post.result_source, "mock");
    assert.equal(approved.results[0].post.status, "published");
    assert.equal(engine.listQueue().queue.length, 0);
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
