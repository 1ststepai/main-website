import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEngine } from "../src/engine.js";
import { createSocialMcpServer } from "../src/mcp/server.js";
import { initPilot } from "../src/cli.js";
import { POSTPATH_INSTRUCTIONS } from "../src/mcp/instructions.js";

const FULL = ["posts:read", "drafts:write", "accounts:read", "accounts:write", "queue:approve"];
const DRAFT = ["posts:read", "drafts:write", "accounts:read"];

function throwingPublishers() {
  const calls = [];
  const fail = (name) => async () => {
    calls.push(name);
    throw new Error("publisher must not be called");
  };
  return { calls, publishers: { youtube: fail("youtube"), facebook: fail("facebook"), instagram: fail("instagram"), x: fail("x") } };
}

async function connect(engine, env, auth) {
  const { server } = createSocialMcpServer({ engine, env, auth });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    let body = res.structuredContent;
    if (!body) {
      try {
        body = JSON.parse(res.content?.[0]?.text || "{}");
      } catch {
        body = { text: res.content?.[0]?.text };
      }
    }
    return { error: res.isError === true, body, raw: res };
  };
  return { call, close: () => client.close() };
}

function setup(env = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-brandctx-"));
  const fullEnv = { ANTHROPIC_API_KEY: "", SOCIAL_MCP_OAUTH_PORT: "0", ...env };
  const spy = throwingPublishers();
  const engine = createEngine({ home, env: fullEnv, publishers: spy.publishers });
  return { home, env: fullEnv, engine, spy, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("instructions tell the assistant to call get_brand_context first and ask once", () => {
  assert.match(POSTPATH_INSTRUCTIONS, /Call get_brand_context first/);
  assert.match(POSTPATH_INSTRUCTIONS, /ask the user about them once/);
});

test("get_brand_context on a fresh brand: blanks stay blank, status partial, auto-post off, no publisher calls", async () => {
  const ctx = setup();
  try {
    await ctx.engine.upsertProfile({ id: "acme", name: "Acme Co" });
    ctx.engine.store.saveConnection({ profile_id: "acme", platform: "facebook", account_label: "Acme Page" }, { access_token: "secret-token-value" });
    const mcp = await connect(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: "pat_draft1" });
    const res = await mcp.call("get_brand_context", { profile_id: "acme" });
    assert.equal(res.error, false, JSON.stringify(res.raw));
    const brand = res.body.brands[0];
    assert.equal(brand.identity.id, "acme");
    assert.equal(brand.identity.name, "Acme Co");
    assert.equal(brand.identity.audience, "");
    assert.equal(brand.voice.tone, "");
    assert.deepEqual(brand.voice.avoid, []);
    assert.equal(brand.voice.appears_on_camera, null);
    assert.deepEqual(brand.voice.hashtags, []);
    assert.equal(brand.voice.caption_footer, "");
    assert.deepEqual(brand.topics.keywords.primary, []);
    assert.equal(brand.topics.pilot_campaign, null);
    for (const field of ["audience", "tone", "avoid", "on_camera_style", "energy", "appears_on_camera", "hashtags", "caption_footer", "keywords.primary"]) {
      assert.ok(brand.missing.includes(field), field);
    }
    assert.equal(brand.missing.includes("connected_accounts"), false);
    assert.equal(brand.status, "partial");
    assert.deepEqual(brand.networks.connected, [{ platform: "facebook", account: "Acme Page", status: "connected" }]);
    assert.doesNotMatch(JSON.stringify(res.body), /secret-token-value|secrets_enc|access_token/);
    assert.equal(brand.networks.privacy_status, "private");
    assert.equal(brand.rules.instagram_always_public, true);
    assert.equal(brand.rules.require_vidiq, false);
    assert.equal(brand.rules.compliance_banner, null);
    assert.equal(brand.rules.this_connection_can, "draft_only");
    assert.deepEqual(brand.auto_post, { enabled: false, networks: [], connection_id: "pat_draft1", enabled_at: null, pending_request: null });
    assert.deepEqual(brand.imports, { enabled: false, note: "not built yet" });

    const unknown = await mcp.call("get_brand_context", { profile_id: "nobody" });
    assert.equal(unknown.body.brands[0].status, "not_set_up");
    assert.ok(unknown.body.brands[0].missing.includes("profile"));

    const approver = await connect(ctx.engine, ctx.env, { scopes: FULL, connectionId: "pat_full1" });
    const full = await approver.call("get_brand_context", {});
    assert.equal(full.body.brands[0].rules.this_connection_can, "approve_and_post");
    assert.equal(ctx.spy.calls.length, 0);
    assert.equal(ctx.engine.publisherCalls(), 0);
    await mcp.close();
    await approver.close();
  } finally {
    ctx.cleanup();
  }
});

test("1ststep-ai reports require_vidiq", async () => {
  const ctx = setup();
  try {
    await ctx.engine.upsertProfile({ id: "1ststep-ai", name: "1stStep.ai" });
    const mcp = await connect(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: "pat_x" });
    const res = await mcp.call("get_brand_context", { profile_id: "1ststep-ai" });
    assert.equal(res.body.brands[0].rules.require_vidiq, true);
    await mcp.close();
  } finally {
    ctx.cleanup();
  }
});

test("save_brand_context saves everything in one call, then reads back ready; zero publisher calls", async () => {
  const ctx = setup();
  try {
    ctx.engine.store.upsertProfile({ id: "acme", name: "Acme" });
    ctx.engine.store.saveConnection({ profile_id: "acme", platform: "youtube", account_label: "@acme" }, { refresh_token: "rt" });
    const mcp = await connect(ctx.engine, ctx.env, { scopes: FULL, connectionId: "pat_full1" });
    const saved = await mcp.call("save_brand_context", {
      profile_id: "acme",
      name: "Acme Co",
      audience: "Small shop owners",
      default_platforms: ["youtube", "facebook"],
      privacy_status: "unlisted",
      hashtags: ["#acme"],
      caption_footer: "acme.example",
      search_terms: { primary: ["shop tips"], secondary: ["retail"], negative: ["free money"] },
      voice: { tone: "plain", avoid: ["hype"], on_camera_style: "talking head", energy: "calm", appears_on_camera: true },
    });
    assert.equal(saved.error, false, JSON.stringify(saved.raw));
    assert.equal(saved.body.saved, true);
    assert.match(saved.body.auto_post_note, /stays off/);
    const brand = (await mcp.call("get_brand_context", { profile_id: "acme" })).body.brands[0];
    assert.equal(brand.identity.name, "Acme Co");
    assert.equal(brand.identity.audience, "Small shop owners");
    assert.deepEqual(brand.networks.default_platforms, ["youtube", "facebook"]);
    assert.equal(brand.networks.privacy_status, "unlisted");
    assert.deepEqual(brand.voice.hashtags, ["#acme"]);
    assert.equal(brand.voice.tone, "plain");
    assert.equal(brand.voice.appears_on_camera, true);
    assert.deepEqual(brand.topics.keywords, { primary: ["shop tips"], secondary: ["retail"], negative: ["free money"] });
    assert.deepEqual(brand.missing, []);
    assert.equal(brand.status, "ready");
    assert.equal(brand.auto_post.enabled, false);

    // A partial update keeps earlier answers and never invents new ones.
    await mcp.call("save_brand_context", { profile_id: "acme", voice: { energy: "warm" } });
    const again = (await mcp.call("get_brand_context", { profile_id: "acme" })).body.brands[0];
    assert.equal(again.voice.energy, "warm");
    assert.equal(again.voice.tone, "plain");
    assert.equal(ctx.engine.publisherCalls(), 0);
    assert.equal(ctx.spy.calls.length, 0);
    await mcp.close();
  } finally {
    ctx.cleanup();
  }
});

test("save_brand_context is all or nothing", async () => {
  const ctx = setup();
  try {
    const mcp = await connect(ctx.engine, ctx.env, { scopes: FULL, connectionId: "pat_full1" });
    // Validation passes, but the auto-post part fails inside the write: nothing is kept.
    const { saveBrandContext } = await import("../src/brand/context.js");
    assert.throws(() =>
      saveBrandContext(ctx.engine, { profile_id: "rollback", name: "Rollback", audience: "x", auto_post: { networks: ["myspace"] } }, { connectionId: "pat_full1", scopes: FULL }),
    );
    assert.equal(ctx.engine.store.getProfile("rollback"), null);
    assert.equal(ctx.engine.store.readSeo().keywords?.rollback, undefined);
    const fresh = createEngine({ home: ctx.home, env: ctx.env });
    assert.equal(fresh.store.getProfile("rollback"), null);

    const bad = await mcp.call("save_brand_context", { profile_id: "rollback2", name: "R", default_platforms: ["myspace"] });
    assert.equal(bad.error, true);
    assert.equal(ctx.engine.store.getProfile("rollback2"), null);
    await mcp.close();
  } finally {
    ctx.cleanup();
  }
});

test("draft-only callers cannot save brand context or request auto-post", async () => {
  const ctx = setup();
  try {
    await ctx.engine.upsertProfile({ id: "acme", name: "Acme" });
    const mcp = await connect(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: "pat_draft1", connectUrl: "http://127.0.0.1:47930/" });
    const res = await mcp.call("save_brand_context", { profile_id: "acme", audience: "x", auto_post: { networks: ["facebook"] } });
    assert.equal(res.error, true);
    assert.match(JSON.stringify(res.raw.content), /accounts:write/);
    assert.deepEqual(ctx.engine.store.readAutoPost(), {});
    assert.equal(ctx.engine.store.readSeo().keywords?.acme, undefined);
    await mcp.close();
  } finally {
    ctx.cleanup();
  }
});

test("pilot mode: context shows banner and campaign; saving needs the owner PIN; auto-post requests refused", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-brandctx-pilot-"));
  const env = { SOCIAL_MCP_PILOT_MODE: "1", ANTHROPIC_API_KEY: "", SOCIAL_MCP_OAUTH_PORT: "0" };
  try {
    initPilot({ home, pin: "246810", env });
    const engine = createEngine({ home, env });
    const stdio = await connect(engine, env, undefined);
    const ctx = (await stdio.call("get_brand_context", {})).body.brands[0];
    assert.ok(ctx.rules.compliance_banner.length > 0);
    assert.ok(ctx.topics.pilot_campaign.goals.length > 0);
    assert.equal(ctx.rules.this_connection_can, "draft_only");
    assert.equal(ctx.auto_post.enabled, false);
    const denied = await stdio.call("save_brand_context", { profile_id: ctx.identity.id, audience: "x" });
    assert.equal(denied.error, true);
    assert.match(JSON.stringify(denied.raw.content), /accounts:write/);

    // Even a full-scope caller needs the PIN in pilot, and cannot ask for auto-post.
    const owner = await connect(engine, env, { scopes: FULL, connectionId: "pat_owner" });
    const noPin = await owner.call("save_brand_context", { profile_id: ctx.identity.id, audience: "x" });
    assert.equal(noPin.error, true);
    assert.match(JSON.stringify(noPin.raw.content), /owner PIN/);
    const wrong = await owner.call("save_brand_context", { profile_id: ctx.identity.id, audience: "x", owner_pin: "000000" });
    assert.equal(wrong.error, true);
    const ok = await owner.call("save_brand_context", { profile_id: ctx.identity.id, audience: "Families", owner_pin: "246810" });
    assert.equal(ok.error, false, JSON.stringify(ok.raw));
    const auto = await owner.call("save_brand_context", { profile_id: ctx.identity.id, owner_pin: "246810", auto_post: { networks: ["facebook"] } });
    assert.equal(auto.error, true);
    assert.match(JSON.stringify(auto.raw.content), /pilot/i);
    assert.deepEqual(engine.store.readAutoPost(), {});
    assert.equal(engine.publisherCalls(), 0);
    await stdio.close();
    await owner.close();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
