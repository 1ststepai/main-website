import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { zonedToUtc } from "../src/desk/public/schedulePlan.js";
import { createEngine } from "../src/engine.js";

test("New York 10:00 stays 10:00 local across the 2026 clock changes", () => {
  assert.equal(new Date(zonedToUtc("America/New_York", 2026, 3, 3, 10, 0)).toISOString(), "2026-03-03T15:00:00.000Z");
  assert.equal(new Date(zonedToUtc("America/New_York", 2026, 3, 10, 10, 0)).toISOString(), "2026-03-10T14:00:00.000Z");
  assert.equal(new Date(zonedToUtc("America/New_York", 2026, 10, 27, 10, 0)).toISOString(), "2026-10-27T14:00:00.000Z");
  assert.equal(new Date(zonedToUtc("America/New_York", 2026, 11, 3, 10, 0)).toISOString(), "2026-11-03T15:00:00.000Z");
});

test("only a confirmed post is slotted, and a missed slot is not sent later", async () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-plan-"));
  let calls = 0;
  let clock = Date.parse("2026-03-02T15:00:00.000Z");
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
    now: () => clock,
  });
  try {
    await engine.upsertProfile({ id: "acme", name: "1stStep.ai" });
    await engine.upsertProfile({ id: "swing-trade-pros", name: "Swing Trade Pros" });
    await engine.setPostingPlan("acme", {
      timezone: "America/New_York",
      slots: [
        { platform: "youtube", weekday: 2, time: "10:00" },
        { platform: "youtube", weekday: 4, time: "10:00" },
        { platform: "instagram", weekday: "daily", time: "12:00" },
      ],
    });
    const draft = await engine.createDraft({
      profile_id: "acme",
      platforms: ["youtube", "instagram"],
      title: "Test draft",
      caption: "Not published",
      instagram_public_confirmed: true,
    });
    assert.equal(draft.posts.every((post) => post.status === "draft"), true);
    await assert.rejects(
      () => engine.scheduleApprovedPost({ post_id: draft.posts[0].id, confirm: false }),
      (error) => error.code === "confirm_required",
    );
    assert.equal(engine.store.getPost(draft.posts[0].id).status, "draft");
    const suggestion = engine.suggestSlot({ profile_id: "acme", platform: "youtube" });
    assert.equal(suggestion.scheduled, false);
    assert.equal(suggestion.starts_at, "2026-03-03T15:00:00.000Z");
    const approved = await engine.approveBundle({ bundle_id: draft.bundle.id, into_next_slot: true });
    assert.equal(approved.scheduled, true);
    assert.equal(approved.results.every((row) => row.ok), true);
    const youtube = engine.store.listPosts({ profileId: "acme" }).find((post) => post.platform === "youtube");
    const instagram = engine.store.listPosts({ profileId: "acme" }).find((post) => post.platform === "instagram");
    assert.equal(youtube.status, "scheduled");
    assert.equal(youtube.scheduled_at, "2026-03-03T15:00:00.000Z");
    assert.equal(instagram.status, "scheduled");
    assert.equal(instagram.scheduled_at, "2026-03-02T17:00:00.000Z");
    const other = engine.getSchedule("swing-trade-pros");
    assert.equal(other.slots.length, 0);
    const status = engine.getQueueStatus({ profile_id: "acme" });
    assert.match(status.note, /open slots this week for 1stStep.ai/);
    assert.equal(status.items.some((item) => item.profile_id === "swing-trade-pros"), false);

    const late = await engine.createDraft({
      profile_id: "swing-trade-pros",
      platform: "bluesky",
      title: "Late",
      caption: "Wait",
    });
    late.post.status = "scheduled";
    late.post.scheduled_at = "2026-03-02T12:00:00.000Z";
    engine.store.savePost(late.post);
    const due = await engine.publishDue({ profile_id: "swing-trade-pros" });
    assert.equal(due.count, 0);
    assert.equal(calls, 0);
    const missed = engine.store.getPost(late.post.id);
    assert.equal(missed.status, "scheduled");
    assert.equal(missed.schedule_missed, true);
    assert.equal(missed.schedule_note, "missed, reschedule?");
    const again = await engine.publishDue({ profile_id: "swing-trade-pros" });
    assert.equal(again.count, 0);
    assert.equal(calls, 0);
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
