import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { brandCapMessage, chooseBrandId, scopeToBrand } from "../src/desk/public/brand.js";

test("a brand cap message appears only when enforcement reports a limit", () => {
  assert.equal(brandCapMessage({ enforce: false, profileLimit: 1 }), "");
  assert.equal(brandCapMessage({ enforce: true, profileLimit: null }), "");
  assert.equal(brandCapMessage(null), "");
  assert.equal(brandCapMessage({ enforce: true, profileLimit: 1 }), "Your plan allows 1 brand.");
  assert.equal(brandCapMessage({ enforce: true, profileLimit: 5 }), "Your plan allows 5 brands.");
});

test("the desk remembers a brand that still exists", () => {
  const profiles = [
    { id: "1ststep-ai", name: "1stStep.ai" },
    { id: "swing-trade-pros", name: "Swing Trade Pros" },
  ];
  assert.equal(chooseBrandId(profiles, "swing-trade-pros"), "swing-trade-pros");
  assert.equal(chooseBrandId(profiles, "missing"), "1ststep-ai");
  assert.equal(chooseBrandId([], "swing-trade-pros"), "");
});

test("drafts and connections from one brand never show or publish under the other", async () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-brands-"));
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
    engine.store.saveConnection(
      { profile_id: "1ststep-ai", platform: "bluesky", account_label: "1ststep.bsky.social" },
      { access_token: "token-a", refresh_token: "rt-a" },
    );
    const brandA = await engine.createDraft({
      profile_id: "1ststep-ai",
      platform: "bluesky",
      title: "Brand A draft",
      caption: "Only 1stStep.ai",
    });
    const brandB = await engine.createDraft({
      profile_id: "swing-trade-pros",
      platform: "bluesky",
      title: "Brand B draft",
      caption: "Only Swing Trade Pros",
    });

    const accounts = await engine.listAccounts();
    assert.deepEqual(
      accounts.profiles.map((row) => row.id).sort(),
      ["1ststep-ai", "swing-trade-pros"],
    );
    assert.deepEqual(scopeToBrand(accounts.connections, "1ststep-ai").map((row) => row.account_label), ["1ststep.bsky.social"]);
    assert.deepEqual(scopeToBrand(accounts.connections, "swing-trade-pros"), []);
    assert.deepEqual(engine.store.listConnections("swing-trade-pros"), []);

    const queue = engine.listQueue().queue;
    assert.deepEqual(scopeToBrand(queue, "1ststep-ai").map((row) => row.title), ["Brand A draft"]);
    assert.deepEqual(scopeToBrand(queue, "swing-trade-pros").map((row) => row.title), ["Brand B draft"]);

    await assert.rejects(
      () => engine.publishPost({ post_id: brandB.post.id, force: true }),
      (error) => error.code === "not_connected",
    );
    assert.equal(engine.store.getPost(brandB.post.id).status, "draft");
    assert.equal(calls, 0);

    const published = await engine.publishPost({ post_id: brandA.post.id, force: true });
    assert.equal(published.post.profile_id, "1ststep-ai");
    assert.equal(engine.store.getPost(brandB.post.id).status, "draft");
    assert.equal(engine.store.getPost(brandA.post.id).profile_id, "1ststep-ai");
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
