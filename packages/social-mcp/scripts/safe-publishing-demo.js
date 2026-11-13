#!/usr/bin/env node
/**
 * Safe PostPath publishing path demo — no live social APIs.
 * Walks: upsert_profile → create_draft → schedule_post → get_post_status
 * in a temporary vault, then deletes it.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEngine } from "../src/engine.js";

const home = mkdtempSync(join(tmpdir(), "postpath-skill-demo-"));
const now = () => Date.parse("2026-10-27T12:00:00.000Z");

async function main() {
  const engine = createEngine({ home, now });
  try {
    const status = engine.publicStatus();
    assert.ok(Array.isArray(status.platforms));
    assert.ok(status.platforms.includes("x"));
    assert.equal(status.platforms.includes("hubspot"), false);

    await engine.upsertProfile({ id: "demo", name: "Skill Demo" });
    const accounts = await engine.listAccounts("demo");
    assert.equal(accounts.connections.length, 0);

    const { post } = await engine.createDraft({
      profile_id: "demo",
      platform: "x",
      caption: "PostPath skill demo — draft only, never sent.",
    });
    assert.equal(post.status, "draft");

    const scheduled = await engine.schedulePost({
      post_id: post.id,
      scheduled_at: "2026-10-28T15:00:00.000Z",
    });
    assert.equal(scheduled.post.status, "scheduled");

    const listed = await engine.listPosts({ profile_id: "demo", status: "scheduled" });
    assert.equal(listed.posts.length, 1);

    const one = await engine.getPostStatus(post.id);
    assert.equal(one.post.status, "scheduled");

    // Deliberately do NOT call publish_post — no network, no live accounts.
    console.log(
      JSON.stringify(
        {
          ok: true,
          demo: "safe-publishing-demo",
          vault: home,
          profile_id: "demo",
          post_id: post.id,
          status: one.post.status,
          scheduled_at: one.post.scheduled_at,
          note: "No publish_post / publish_due called. Live publish remains owner-verified.",
          skill: "postpath-publishing",
        },
        null,
        2,
      ),
    );
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
