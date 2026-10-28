import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { cardSvg, designCard, sanitizeSvg, writeCaptions } from "../src/media/claude.js";
import { publicOAuthConfig } from "../src/envFile.js";
import { probeMedia } from "../src/media/audio.js";

function rig() {
  const home = mkdtempSync(join(tmpdir(), "postpath-claude-"));
  let calls = 0;
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("live claude");
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

test("mock captions are per network and a passing review does not publish", async () => {
  const box = rig();
  try {
    await box.engine.upsertProfile({ id: "acme", name: "Acme", presets: { hashtags: ["acme"], caption_footer: "— Acme" } });
    const created = await box.engine.createDraft({
      profile_id: "acme",
      platforms: ["instagram", "facebook"],
      title: "Launch",
      caption_provider: "mock",
      review: true,
      review_provider: "mock",
      media: { generate: { prompt: "A navy quote card for the launch", type: "image", provider: "mock", style: "quote" } },
      wait: true,
    });
    const ig = created.posts.find((post) => post.platform === "instagram");
    const fb = created.posts.find((post) => post.platform === "facebook");
    assert.match(ig.caption, /instagram/);
    assert.match(fb.caption, /facebook/);
    assert.equal(created.bundle.media_review.advisory, true);
    assert.match(created.bundle.media_review.summary, /Nothing was approved/);
    assert.equal(created.bundle.media_review.items.some((item) => item.id === "policy"), true);
    assert.equal(box.calls(), 0);
    const approved = await box.engine.approveBundle({
      bundle_id: created.bundle.id,
      instagram_public_confirmed: true,
    });
    assert.equal(approved.results.every((row) => row.ok === false), true);
    assert.match(approved.results[0].error.message, /did not upload/);
    assert.equal(box.engine.store.getBundle(created.bundle.id).status, "draft");
    const queue = box.engine.listQueue().queue[0];
    assert.equal(queue.media_review.advisory, true);
    assert.equal(queue.caption_provider, "mock");
  } finally {
    await box.stop();
  }
});

test("a fake Claude response renders a card and a bad response hides the key", async () => {
  const key = "sk-ant-test-secret";
  const svg = cardSvg({ kind: "announcement", title: "Hello", body: "We shipped", width: 1080, height: 1350 });
  let seen = 0;
  const fetchImpl = async (url, init) => {
    seen += 1;
    assert.match(String(url), /api\.anthropic\.com/);
    assert.equal(init.headers["x-api-key"], key);
    if (seen === 1) {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            model: "claude-sonnet-4-5",
            content: [{ type: "text", text: JSON.stringify({ kind: "announcement", svg }) }],
          });
        },
      };
    }
    throw new Error(`down ${key}`);
  };
  const home = mkdtempSync(join(tmpdir(), "postpath-card-"));
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0", ANTHROPIC_API_KEY: key },
    fetchImpl,
  });
  try {
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    const created = await engine.createDraft({
      profile_id: "acme",
      platforms: ["instagram"],
      title: "Card",
      media: { generate: { prompt: "Announce the launch", type: "image", provider: "claude", style: "announcement" } },
      wait: true,
    });
    const file = join(home, "media", created.posts[0].media_path);
    const probe = await probeMedia(file);
    assert.equal(probe.image || probe.width > 0, true);
    assert.equal(created.posts[0].media_provenance.provider, "claude");
    await assert.rejects(() => writeCaptions({
      provider: "claude",
      prompt: "Hello",
      platforms: ["instagram"],
      key,
      fetchImpl,
      env: {},
    }), (error) => {
      assert.equal(String(error.message).includes(key), false);
      return true;
    });
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("svg from the model cannot carry a script, and html becomes a card", async () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10" fill="#000"/></svg>`;
  assert.doesNotMatch(sanitizeSvg(dirty), /script/i);
  const card = await designCard({
    provider: "claude",
    prompt: "A quote about patience",
    style: "quote",
    width: 1080,
    height: 1080,
    key: "sk-ant-test-secret",
    env: {},
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return JSON.stringify({
          model: "claude-sonnet-4-5",
          content: [{ type: "text", text: JSON.stringify({ kind: "quote", html: "<h1>Patience</h1><script>nope</script>" }) }],
        });
      },
    }),
  });
  assert.match(card.svg, /<svg/);
  assert.doesNotMatch(card.svg, /<script/i);
  const masked = publicOAuthConfig({ ANTHROPIC_API_KEY: "sk-ant-test-secret" });
  assert.equal(masked.ANTHROPIC_API_KEY.includes("sk-ant-test-secret"), false);
  assert.equal(masked.has_anthropic, true);
});
