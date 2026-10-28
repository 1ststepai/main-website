import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { waitingOnYouCount, waitingOnYouLabel } from "../src/desk/public/brand.js";
import { createEngine } from "../src/engine.js";
import { createSocialMcpServer } from "../src/mcp/server.js";
import { POSTPATH_INSTRUCTIONS } from "../src/mcp/instructions.js";

test("queue status stays on the brand and tool results carry the note", async () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-queue-"));
  let calls = 0;
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
  });
  try {
    await engine.upsertProfile({ id: "1ststep-ai", name: "1stStep.ai" });
    await engine.upsertProfile({ id: "swing-trade-pros", name: "Swing Trade Pros" });
    const { server } = createSocialMcpServer({ engine });
    assert.equal(server.isConnected(), false);
    const created = await server._registeredTools.create_draft.handler({
      profile_id: "1ststep-ai",
      platform: "bluesky",
      title: "Hello",
      caption: "A short note",
    });
    const body = JSON.parse(created.content[0].text);
    assert.match(body.queue_note, /^Queue: 1 waiting for approval, 0 need fixes$/);
    assert.equal(body.post.status, "draft");
    assert.equal(calls, 0);

    await engine.createDraft({
      profile_id: "swing-trade-pros",
      platform: "instagram",
      title: "Tags",
      caption: "#one #two #three #four #five #six",
    });
    const failed = await engine.createDraft({
      profile_id: "1ststep-ai",
      platform: "bluesky",
      title: "Old failure",
      caption: "Did not send",
    });
    failed.post.status = "failed";
    failed.post.created_at = "2026-10-27T12:00:00.000Z";
    engine.store.savePost(failed.post);
    const scheduled = await engine.createDraft({
      profile_id: "1ststep-ai",
      platform: "bluesky",
      title: "Later",
      caption: "Send later",
    });
    scheduled.post.status = "scheduled";
    scheduled.post.scheduled_at = "2099-01-01T00:00:00.000Z";
    engine.store.savePost(scheduled.post);

    const all = engine.getQueueStatus();
    const first = engine.getQueueStatus({ profile_id: "1ststep-ai" });
    const second = engine.getQueueStatus({ profile_id: "swing-trade-pros" });
    assert.equal(first.items.some((item) => item.profile_id === "swing-trade-pros"), false);
    assert.equal(second.items.every((item) => item.profile_id === "swing-trade-pros"), true);
    assert.equal(first.items.find((item) => item.title === "Hello").suggested_action, "ask owner to approve");
    assert.match(second.items[0].suggested_action, /^fix: /);
    assert.equal(first.items.find((item) => item.title === "Later").suggested_action, "reschedule");
    assert.equal(first.items.find((item) => item.title === "Old failure").suggested_action, "retry after reconnect");
    assert.equal(first.waiting_for_approval, 1);
    assert.equal(second.need_fixes, 1);
    assert.ok(all.waiting_for_approval >= first.waiting_for_approval);
    assert.match(POSTPATH_INSTRUCTIONS, /get_queue_status/);
    assert.equal(server._registeredResources["postpath://queue"].name, "queue");

    const listed = await server._registeredTools.list_posts.handler({});
    assert.match(JSON.parse(listed.content[0].text).queue_note, /Queue: /);
    assert.equal(calls, 0);
    assert.equal(waitingOnYouLabel(waitingOnYouCount([{ profile_id: "1ststep-ai" }], "1ststep-ai")), "Waiting on you");
    assert.equal(waitingOnYouLabel(2), "Waiting on you · 2");
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
