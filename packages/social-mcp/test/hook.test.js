import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { copiedRun } from "../src/hook/originality.js";
import { helpCopy, stepComparison } from "../src/hook/steps.js";

const NOW = () => Date.parse("2026-06-01T12:00:00.000Z");
const SECRET = "gemini-secret-value";

function rig(extra = {}) {
  const home = mkdtempSync(join(tmpdir(), "social-hook-"));
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0", ...(extra.env || {}) },
    fetchImpl: extra.fetchImpl || (async () => {
      throw new Error("network");
    }),
    now: NOW,
    hookGenerator: extra.hookGenerator,
    structureProvider: extra.structureProvider,
  });
  return {
    engine,
    async stop() {
      await engine.oauth.stop();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

test("hook step counts match the owner doc", () => {
  const steps = stepComparison();
  const help = helpCopy();
  const doc = readFileSync(new URL("../../../docs/hook-capture.md", import.meta.url), "utf8");
  assert.equal(steps.manual, 20);
  assert.equal(steps.withKey, 7);
  assert.equal(steps.withKeyReady, 5);
  assert.equal(steps.withoutKey, 8);
  assert.equal(steps.withoutKeyReady, 6);
  assert.match(doc, /20 actions/);
  assert.match(doc, /7 actions/);
  assert.match(doc, /5 actions/);
  assert.match(doc, /8 actions/);
  assert.match(doc, /concept-level only/i);
  assert.match(help.disclaimer, /not a promise about minutes/);
  assert.doesNotMatch(help.summary, /MCP|OAuth/);
  for (const step of steps.manualSteps) assert.match(doc, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("voice seeds are blank placeholders", async () => {
  const rigged = rig();
  try {
    const voices = rigged.engine.hooks.listVoices().voices;
    assert.deepEqual(voices.map((row) => row.profile_id).sort(), ["1ststep-ai", "daysetgo", "skillsprout", "swing-trade-pros"]);
    for (const voice of voices) {
      assert.equal(voice.tone, "");
      assert.equal(voice.energy, "");
      assert.equal(voice.appears_on_camera, null);
      assert.ok(voice.todo.includes("appears_on_camera"));
    }
  } finally {
    await rigged.stop();
  }
});

test("find ranks by views over subscribers and does not download video", async () => {
  const urls = [];
  const rigged = rig({
    env: { YOUTUBE_API_KEY: SECRET },
    fetchImpl: async (url) => {
      const href = String(url);
      urls.push(href);
      assert.equal(href.includes("googlevideo"), false);
      assert.equal(href.includes(SECRET), true);
      if (href.includes("/search")) {
        return {
          ok: true,
          json: async () => ({
            items: [
              { id: { videoId: "shortOne" } },
              { id: { videoId: "longTwo" } },
            ],
          }),
        };
      }
      if (href.includes("/videos")) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: "shortOne",
                snippet: { title: "Family planner short", description: "A public description", channelId: "UC1", channelTitle: "One", publishedAt: "2026-05-01T00:00:00Z" },
                statistics: { viewCount: "1000" },
                contentDetails: { duration: "PT45S" },
              },
              {
                id: "longTwo",
                snippet: { title: "Family planner long", description: "Another public description", channelId: "UC2", channelTitle: "Two", publishedAt: "2026-05-02T00:00:00Z" },
                statistics: { viewCount: "9000" },
                contentDetails: { duration: "PT5M" },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          items: [
            { id: "UC1", statistics: { subscriberCount: "100" } },
            { id: "UC2", statistics: { subscriberCount: "3000" } },
          ],
        }),
      };
    },
  });
  try {
    const found = await rigged.engine.hooks.find({ topic: "family day planner", format: "shorts", days: 90 });
    assert.equal(found.available, true);
    assert.equal(found.vidiq, "not_used");
    assert.equal(found.examples.length, 1);
    assert.equal(found.examples[0].video_id, "shortOne");
    assert.equal(found.examples[0].metrics.math, "1000 views / 100 subscribers = 10.00");
    assert.match(urls[0], /publishedAfter=2026-03-03/);
    assert.equal(urls.some((href) => href.includes("googlevideo")), false);
    assert.equal(rigged.engine.store.readSeo().structures, undefined);
    const failed = await rig({
      env: { YOUTUBE_API_KEY: SECRET },
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => SECRET }),
    });
    try {
      const blocked = await failed.engine.hooks.find({ topic: "family day planner" });
      assert.equal(blocked.available, false);
      assert.equal(String(blocked.message).includes(SECRET), false);
    } finally {
      await failed.stop();
    }
  } finally {
    await rigged.stop();
  }
});

test("capture stores structure only and gemini is limited to the first 10 seconds", async () => {
  let body = "";
  const rigged = rig({
    env: { GEMINI_API_KEY: SECRET },
    fetchImpl: async (url, options = {}) => {
      assert.equal(String(url).includes("googlevideo"), false);
      assert.match(String(url), /generativelanguage/);
      body = String(options.body || "");
      assert.equal(body.includes(SECRET), false);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      opening_type: "question",
                      pattern: "What if {audience} could {result}?",
                      visual_surprise: "The plan appears on the table",
                      pacing: { cuts_or_beats: 3, seconds_to_first_payoff: 4 },
                      delivery: { on_camera: true, energy: "calm", eye_contact: true, text_on_screen: true },
                      promise: "The day gets a shape",
                      fragment: "one two three four five six seven",
                      transcript: "this whole transcript must not be stored",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    },
  });
  try {
    const captured = await rigged.engine.hooks.capture({ video_id: "abc123xyz", title: "Family planner short" });
    assert.equal(captured.stored_transcript, false);
    assert.equal(captured.structure.fragment, "");
    assert.equal(captured.structure.transcript, undefined);
    assert.equal(captured.structure.structure.opening_type, "question");
    assert.match(body, /"startOffset":"0s"/);
    assert.match(body, /"endOffset":"10s"/);
    assert.match(body, /watch\?v=abc123xyz/);
    const saved = rigged.engine.store.readSeo().structures.abc123xyz;
    assert.equal(JSON.stringify(saved).includes("transcript"), false);
  } finally {
    await rigged.stop();
  }
});

test("assistant observation is stored and a copied hook is rejected", async () => {
  let seenFragment = "unset";
  const rigged = rig({
    hookGenerator: async (brief) => {
      seenFragment = brief.structure.fragment;
      return [
        {
          spoken: "How founders fix follow up systems today",
          on_screen_text: "Fix the follow up",
          shot: "You at the desk, then the checklist.",
          beats: [{ t: "0s", text: "Ask the question" }, { t: "4s", text: "Show the plan" }],
          why: "A question earns the next second.",
        },
        {
          spoken: "Start with the bottleneck you already have.",
          on_screen_text: "Name the bottleneck",
          shot: "Hands on a notepad.",
          beats: [{ t: "0s", text: "State the claim" }],
          why: "The result shows up before the explanation.",
        },
      ];
    },
  });
  try {
    const captured = await rigged.engine.hooks.capture({
      url: "https://www.youtube.com/watch?v=abc123xyz",
      title: "How founders fix follow up systems today",
      observation: {
        opening_type: "question",
        pattern: "What if {someone} fixed {thing} before adding tools?",
        visual_surprise: "The list is already written",
        pacing: { cuts_or_beats: 2, seconds_to_first_payoff: 3 },
        delivery: { on_camera: null, energy: "", eye_contact: null, text_on_screen: true },
        promise: "A smaller next step",
        fragment: "fix follow up",
        transcript: "do not keep this transcript",
      },
    });
    assert.equal(captured.structure.fragment, "fix follow up");
    assert.equal(captured.structure.transcript, undefined);
    const generated = await rigged.engine.hooks.generate({
      profile_id: "1ststep-ai",
      topic: "lead follow-up",
      video_id: "abc123xyz",
      source_description: "A public description that is not the spoken line.",
    });
    assert.equal(seenFragment, undefined);
    assert.equal(generated.rejected, 1);
    assert.equal(generated.hooks.length, 1);
    assert.equal(generated.hooks[0].spoken, "Start with the bottleneck you already have.");
    assert.equal(generated.auto_approve, false);
    assert.equal(copiedRun("how founders fix follow", ["How founders fix follow up systems today"]), "");
    assert.ok(copiedRun("how founders fix follow up", ["How founders fix follow up systems today"]));
  } finally {
    await rigged.stop();
  }
});

test("a chosen hook leads the caption and the media prompt and stays unapproved", async () => {
  const rigged = rig({
    hookGenerator: async () => [
      {
        spoken: "Name the bottleneck first.",
        on_screen_text: "Name it",
        shot: "You point at one sticky note.",
        beats: [{ t: "0s", text: "Point" }, { t: "5s", text: "Say the next step" }],
        why: "The pattern puts the result before the tour.",
      },
    ],
  });
  try {
    await rigged.engine.upsertProfile({ id: "daysetgo", name: "DaySetGo" });
    await rigged.engine.hooks.capture({
      video_id: "abc123xyz",
      title: "A different title entirely",
      observation: { opening_type: "result_first", pattern: "Name {thing} before {action}." },
    });
    const created = await rigged.engine.createDraft({
      profile_id: "daysetgo",
      platforms: ["facebook", "bluesky"],
      title: "Daily family plan",
      caption: "A simple plan for the day.",
    });
    created.bundle.media_request = { prompt: "old prompt", type: "video", provider: "mock" };
    created.bundle.media_status = "empty";
    rigged.engine.store.saveBundle(created.bundle);
    const generated = await rigged.engine.hooks.generate({
      profile_id: "daysetgo",
      topic: "family day planner",
      video_id: "abc123xyz",
      draft_id: created.bundle.id,
      pick: 1,
    });
    assert.equal(generated.attached.auto_approve, false);
    assert.match(generated.attached.media_prompt, /sticky note/);
    const stored = rigged.engine.store.getBundle(created.bundle.id);
    assert.equal(stored.media_request.prompt, generated.attached.media_prompt);
    assert.match(stored.caption, /^Name the bottleneck first/);
    const child = rigged.engine.store.getPost(stored.child_ids.facebook);
    assert.match(child.caption, /^Name the bottleneck first/);
    const queue = rigged.engine.listQueue().queue;
    assert.equal(queue[0].hook.spoken, "Name the bottleneck first.");
    assert.equal(queue[0].seo.auto_approve, false);
    assert.equal(queue[0].status, undefined);
    assert.equal(rigged.engine.store.getPost(stored.child_ids.facebook).status, "draft");
  } finally {
    await rigged.stop();
  }
});

test("missing keys do not call Gemini or Claude", async () => {
  let calls = 0;
  const rigged = rig({
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
  });
  try {
    const found = await rigged.engine.hooks.find({ topic: "family day planner", profile_id: "daysetgo" });
    assert.equal(found.available, false);
    const captured = await rigged.engine.hooks.capture({ video_id: "abc123xyz" });
    assert.equal(captured.available, false);
    await rigged.engine.hooks.capture({
      video_id: "abc123xyz",
      observation: { opening_type: "pov", pattern: "I tried {thing}." },
    });
    const generated = await rigged.engine.hooks.generate({ profile_id: "daysetgo", topic: "family day planner", video_id: "abc123xyz" });
    assert.equal(generated.mode, "needs_key");
    assert.equal(generated.hooks.length, 0);
    assert.equal(calls, 0);
  } finally {
    await rigged.stop();
  }
});
