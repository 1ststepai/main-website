import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import {
  checkNetwork,
  groupSuggestions,
  readMp4Meta,
  resolvePostForPublish,
} from "../src/desk/public/optimize.js";
import { seedXConnection } from "./helpers/xFetchMock.js";

function mp4({ width, height, duration, timescale = 1000 }) {
  function box(type, payload) {
    const size = 8 + payload.length;
    const header = Buffer.alloc(8);
    header.writeUInt32BE(size);
    header.write(type, 4, "ascii");
    return Buffer.concat([header, payload]);
  }
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(duration, 16);
  const tkhd = Buffer.alloc(92);
  tkhd.writeUInt32BE(Math.round(width * 65536), 76);
  tkhd.writeUInt32BE(Math.round(height * 65536), 80);
  const trak = box("trak", box("tkhd", tkhd));
  const moov = box("moov", Buffer.concat([box("mvhd", mvhd), trak]));
  return Buffer.concat([box("ftyp", Buffer.from("mp42")), moov]);
}

test("an override is what gets published, and an old draft still uses the shared tags", () => {
  const base = {
    platform: "youtube",
    title: "Base title",
    description: "Base description",
    caption: "Base caption",
    tags: ["shared"],
    variants: {
      youtube: { same_as_base: false, title: "Short title", description: "Short copy", tags: ["shortform"], hashtags: ["Shorts"] },
    },
  };
  const resolved = resolvePostForPublish(base);
  assert.equal(resolved.title, "Short title");
  assert.deepEqual(resolved.tags, ["shortform"]);
  assert.match(resolved.description, /#Shorts/);
  assert.equal(base.title, "Base title");
  assert.deepEqual(base.tags, ["shared"]);

  const untouched = resolvePostForPublish({ platform: "reddit", title: "Hello", tags: ["swingtrading"] });
  assert.deepEqual(untouched.tags, ["swingtrading"]);
  const reddit = resolvePostForPublish({
    platform: "reddit",
    title: "Hello",
    tags: ["oldcommunity"],
    variants: { reddit: { same_as_base: false, subreddit: "newcommunity" } },
  });
  assert.equal(reddit.tags[0], "newcommunity");
});

test("checks cite rules and do not invent a score", () => {
  const many = checkNetwork({
    platform: "instagram",
    post: {
      platform: "instagram",
      caption: "Hello #one #two #three #four #five #six",
      variants: { instagram: { same_as_base: true } },
    },
  });
  assert.ok(many.some((item) => item.kind === "rule" && item.field === "hashtags"));
  const tip = checkNetwork({
    platform: "linkedin",
    post: { platform: "linkedin", caption: "Hello #one #two #three #four #five #six" },
  });
  assert.ok(tip.some((item) => item.kind === "tip" && item.field === "hashtags"));
  assert.equal(tip.some((item) => item.score), false);

  const shorts = checkNetwork({
    platform: "youtube",
    post: { platform: "youtube", title: "Desk", description: "Words" },
    media: readMp4Meta(mp4({ width: 1080, height: 1920, duration: 90000 })),
  });
  assert.ok(shorts.some((item) => item.kind === "ok" && /3 minutes/.test(item.message)));
  const wide = checkNetwork({
    platform: "youtube",
    post: { platform: "youtube", title: "Desk", description: "Words" },
    media: readMp4Meta(mp4({ width: 1920, height: 1080, duration: 200000 })),
  });
  assert.ok(wide.some((item) => item.kind === "rule" && /wider/i.test(item.message)));
  assert.ok(wide.some((item) => item.kind === "rule" && /3 minutes/.test(item.message)));
});

test("multi-source suggestions stay pending until the desk accepts one", async () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-variants-"));
  let sent = "";
  const engine = createEngine({
    home,
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes("/2/tweets") && init.method === "POST") {
        sent = JSON.parse(init.body).text;
        return { ok: true, status: 201, headers: { get: () => "" }, text: async () => JSON.stringify({ data: { id: "tw1" } }) };
      }
      return { ok: false, status: 500, headers: { get: () => "" }, text: async () => "{}" };
    },
  });
  try {
    await engine.upsertProfile({ id: "acme", name: "Acme Co" });
    const created = await engine.createDraft({
      profile_id: "acme",
      platform: "x",
      title: "Base",
      caption: "Base caption",
      tags: ["base"],
      variants: { x: { same_as_base: true } },
    });
    assert.equal(created.post.caption, "Base caption");
    const proposed = await engine.proposeSuggestions({
      post_id: created.post.id,
      suggestions: [
        { source: "assistant", platform: "x", field: "caption", value: "Ship the desk" },
        { source: "vidiq", platform: "x", field: "caption", value: "Ship the desk", score: { name: "title score", value: 72 } },
        { source: "tubebuddy", platform: "x", field: "caption", value: "A different line" },
      ],
    });
    assert.equal(proposed.post.caption, "Base caption");
    const group = groupSuggestions(proposed.post.suggestions)[0];
    const assistant = group.items.find((item) => item.source === "assistant");
    const vidiq = group.items.find((item) => item.source === "vidiq");
    const tubebuddy = group.items.find((item) => item.source === "tubebuddy");
    assert.equal(assistant.agreement, "agree");
    assert.equal(vidiq.agreement, "agree");
    assert.equal(vidiq.score.name, "title score");
    assert.equal(vidiq.score.value, 72);
    assert.equal(tubebuddy.agreement, "differ");
    assert.equal(tubebuddy.score, null);
    const rejected = await engine.decideSuggestion({
      post_id: created.post.id,
      suggestion_id: tubebuddy.id,
      decision: "reject",
    });
    assert.equal(rejected.post.variants.x?.same_as_base, undefined);
    const accepted = await engine.decideSuggestion({
      post_id: created.post.id,
      suggestion_id: vidiq.id,
      decision: "accept",
    });
    assert.equal(accepted.post.variants.x.same_as_base, false);
    assert.equal(accepted.post.variants.x.caption, "Ship the desk");
    assert.equal(accepted.post.caption, "Base caption");
    seedXConnection(engine, { profileId: "acme" });
    await engine.publishPost({ post_id: created.post.id });
    assert.equal(sent, "Ship the desk");
    const saved = await engine.saveTagSet({ profile_id: "acme", profile_name: "Acme Co", set_name: "Swing Trade Pros", tags: ["swing", "setups"] });
    await engine.upsertProfile({ id: "acme", name: "Acme Co" });
    const profile = engine.store.getProfile("acme");
    assert.equal(profile.tag_sets[0].name, "Swing Trade Pros");
    assert.deepEqual(profile.tag_sets[0].tags, ["swing", "setups"]);
    assert.equal(saved.tag_set.tags.length, 2);
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
