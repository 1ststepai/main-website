// End-to-end, production-shaped flow on a throwaway loopback server:
// draft-only PAT -> HTTP MCP create_draft -> desk approve -> mock publish per network,
// and proof that the draft-only connector cannot publish or turn auto-post on.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { resetMcpSessions } from "../src/mcp/http.js";
import { freePorts } from "./helpers/ports.js";
import { giveOwnX } from "./helpers/ownX.js";

const NETWORKS = ["youtube", "facebook", "instagram", "x", "tiktok", "pinterest"];
// Pinterest pins images from a public https URL, so it gets its own image draft.
const VIDEO_NETWORKS = NETWORKS.filter((n) => n !== "pinterest");
const BRAND = "swing-trade-pros";

async function boot() {
  const [port, oauthPort] = await freePorts(2);
  const home = giveOwnX(mkdtempSync(join(tmpdir(), "pp-prod-e2e-")));
  const env = { SOCIAL_MCP_HOME: home, SOCIAL_MCP_OAUTH_PORT: String(oauthPort), SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_PUBLISH_MODE: "mock" };
  const engine = createEngine({ home, env, fetchImpl: async () => { throw new Error("network disabled in tests"); } });
  const desk = createDeskServer({ engine, env, port });
  const { url } = await desk.start({ open: false });
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  return { home, url, engine, async stop() { await desk.stop(); resetMcpSessions(); rmSync(home, { recursive: true, force: true }); } };
}

async function desk(base, path, body) {
  const res = await fetch(`${base}${path.replace(/^\//, "")}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

async function rpc(response) {
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(line ? line.slice(6) : text);
}

async function mcpSession(base, token) {
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" };
  const init = await fetch(`${base}mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "marketing-desk-e2e", version: "0" } } }) });
  assert.equal(init.status, 200);
  const session = init.headers.get("mcp-session-id");
  await rpc(init);
  const h = { ...headers, "mcp-session-id": session };
  await fetch(`${base}mcp`, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  let id = 2;
  return {
    async call(name, args) {
      const res = await fetch(`${base}mcp`, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: "tools/call", params: { name, arguments: args } }) });
      return rpc(res);
    },
    async list() {
      const res = await fetch(`${base}mcp`, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: "tools/list", params: {} }) });
      return rpc(res);
    },
  };
}

test("draft-only PAT drafts over HTTP MCP, desk approves, mock publish hits every network", async () => {
  const ctx = await boot();
  try {
    await ctx.engine.upsertProfile({ id: BRAND, name: "Swing Trade Pros", require_vidiq: false });
    for (const platform of NETWORKS) {
      ctx.engine.store.saveConnection(
        { profile_id: BRAND, platform, account_label: `${BRAND}-${platform}`, page_id: "page-1", instagram_id: "ig-1", channel_id: "ch-1", board_id: "board-1" },
        { access_token: `FAKE_ACCESS_${platform}`, refresh_token: `FAKE_REFRESH_${platform}` },
      );
    }
    const video = join(ctx.home, "media", "clip.mp4");
    writeFileSync(video, Buffer.alloc(2048, 1));

    // 1. Draft-only token: no scopes passed means the default (read + drafts:write).
    const pat = await desk(ctx.url, "/api/pat", { name: "Marketing Desk" });
    assert.equal(pat.status, 201);
    assert.ok(pat.body.token.startsWith("pp_pat_"));
    assert.equal(JSON.stringify(pat.body.pats).includes(pat.body.token), false, "token value never listed");
    const listedPat = pat.body.pats.find((row) => row.name === "Marketing Desk");
    assert.ok(listedPat);
    assert.equal(listedPat.scopes.includes("queue:approve"), false);
    assert.equal(listedPat.scopes.includes("owner"), false);

    const mcp = await mcpSession(ctx.url, pat.body.token);

    // 2. Create a draft for the brand across all six networks.
    const created = await mcp.call("create_draft", {
      profile_id: BRAND,
      platforms: VIDEO_NETWORKS,
      caption: "Three rules we use before every swing trade. #swingtrading",
      overrides: { youtube: { title: "Three swing trade rules" } },
      media_path: video,
      instagram_public_confirmed: true,
    });
    assert.equal(created.result.isError ?? false, false, JSON.stringify(created.result));
    const draft = JSON.parse(created.result.content[0].text);
    assert.equal(draft.ok, true);
    const bundleId = draft.bundle.id;
    const pin = await mcp.call("create_draft", {
      profile_id: BRAND,
      platforms: ["pinterest"],
      caption: "Swing trade checklist",
      media_url: "https://example.com/checklist.jpg",
    });
    assert.equal(pin.result.isError ?? false, false, JSON.stringify(pin.result));
    const pinBundle = JSON.parse(pin.result.content[0].text);
    const pinId = pinBundle.bundle?.id;
    const pinPostId = pinBundle.post?.id || pinBundle.bundle?.posts?.[0]?.id;
    const posts = ctx.engine.store.listPosts({ profileId: BRAND });
    assert.deepEqual(posts.map((p) => p.platform).sort(), [...NETWORKS].sort());
    assert.ok(posts.every((p) => p.status === "draft"), "everything starts as a draft");

    // 3. Draft-only default: the connector cannot publish ...
    const refused = await mcp.call("publish_post", { post_id: posts[0].id });
    assert.equal(refused.result?.isError ?? Boolean(refused.error), true);
    assert.match(JSON.stringify(refused), /queue:approve|scope|not published|refused/i);
    const due = await mcp.call("publish_due", {});
    assert.equal(due.result?.isError ?? Boolean(due.error), true);
    // ... cannot flip auto-post (a request is recorded as pending only) ...
    const ask = await mcp.call("save_brand_context", { profile_id: BRAND, auto_post: { networks: NETWORKS } });
    assert.doesNotMatch(JSON.stringify(ask.result || {}), /"auto_post":\s*"on"/);
    const perms = await mcp.call("get_posting_permissions", { profile_id: BRAND });
    const permText = perms.result.content[0].text;
    assert.doesNotMatch(permText, /"enabled":\s*true/);
    const { autoPostAllows } = await import("../src/autoPost.js");
    for (const platform of NETWORKS) {
      assert.equal(autoPostAllows(ctx.engine.store, { profile_id: BRAND, connection_id: listedPat.id, platform }), false, `auto-post stays off on ${platform}`);
    }
    assert.ok(ctx.engine.store.listPosts({ profileId: BRAND }).every((p) => p.status === "draft"), "nothing was sent by the connector");

    // 4. Owner approves on the desk; mock publisher posts to every network.
    const approved = await desk(ctx.url, "/api/approve", { bundle_id: bundleId, instagram_public_confirmed: true });
    assert.equal(approved.status, 200, JSON.stringify(approved.body).slice(0, 500));
    const pinApproved = await desk(ctx.url, "/api/approve", pinId ? { bundle_id: pinId } : { post_id: pinPostId });
    assert.equal(pinApproved.status, 200, JSON.stringify(pinApproved.body).slice(0, 500));
    const after = ctx.engine.store.listPosts({ profileId: BRAND });
    for (const platform of NETWORKS) {
      const post = after.find((p) => p.platform === platform);
      assert.equal(post.status, "published", `${platform}: ${post.status} ${post.last_error || ""}`);
      assert.equal(post.result_source, "mock");
    }

    // 5. No secret leaks back through the desk status.
    const status = await fetch(`${ctx.url}api/status`).then((r) => r.text());
    assert.equal(status.includes("FAKE_ACCESS_"), false);
    assert.equal(status.includes("FAKE_REFRESH_"), false);
    assert.equal(status.includes(pat.body.token), false);
  } finally {
    await ctx.stop();
  }
});

test("brand-scoped PAT drafts for its brand only; another brand is refused and stays invisible", async () => {
  const ctx = await boot();
  try {
    await ctx.engine.upsertProfile({ id: BRAND, name: "Swing Trade Pros", require_vidiq: false });
    await ctx.engine.upsertProfile({ id: "skillsprout", name: "SkillSprout", require_vidiq: false });
    for (const id of [BRAND, "skillsprout"]) {
      ctx.engine.store.saveConnection({ profile_id: id, platform: "facebook", account_label: `${id}-fb`, page_id: `page-${id}` }, { access_token: `FAKE_ACCESS_${id}` });
    }
    const pat = await desk(ctx.url, "/api/pat", { name: "STP assistant", brands: [BRAND] });
    assert.equal(pat.status, 201, JSON.stringify(pat.body));
    assert.deepEqual(pat.body.pat.brands, [BRAND]);
    const mcp = await mcpSession(ctx.url, pat.body.token);

    const own = await mcp.call("create_draft", { profile_id: BRAND, platforms: ["facebook"], caption: "STP only" });
    assert.equal(own.result.isError ?? false, false, JSON.stringify(own.result));

    const other = await mcp.call("create_draft", { profile_id: "skillsprout", platforms: ["facebook"], caption: "should be refused" });
    assert.equal(other.result?.isError ?? Boolean(other.error), true, "other brand is refused");
    assert.match(JSON.stringify(other), /brand|not allowed|scope|forbidden/i);
    assert.equal(ctx.engine.store.listPosts({ profileId: "skillsprout" }).length, 0, "nothing drafted for the other brand");

    // A draft the owner made for SkillSprout stays invisible to the STP token.
    await ctx.engine.createDraft({ profile_id: "skillsprout", platform: "facebook", caption: "owner draft", source: "desk" });
    const queue = await mcp.call("list_queue", {});
    const text = JSON.stringify(queue.result || queue);
    assert.equal(text.includes("owner draft"), false);
    assert.equal(text.includes("STP only"), true);
    const posts = ctx.engine.store.listPosts();
    assert.ok(posts.filter((p) => p.profile_id === BRAND).every((p) => p.status === "draft"));
  } finally {
    await ctx.stop();
  }
});

test("one all-brands draft-only token: every draft must name its brand (brand_required), never a default", async () => {
  const ctx = await boot();
  try {
    for (const [id, name] of [[BRAND, "Swing Trade Pros"], ["1ststep-ai", "1stStep.ai"], ["skillsprout", "SkillSprout"]]) {
      await ctx.engine.upsertProfile({ id, name, require_vidiq: false });
    }
    const pat = await desk(ctx.url, "/api/pat", { name: "All brands assistant", all_brands: true });
    assert.equal(pat.status, 201, JSON.stringify(pat.body));
    assert.deepEqual(pat.body.pat.brands, ["*"]);
    assert.deepEqual(pat.body.pat.scopes.includes("queue:approve"), false);
    const mcp = await mcpSession(ctx.url, pat.body.token);

    const before = ctx.engine.store.listPosts().length;
    const missing = await mcp.call("create_draft", { platforms: ["facebook"], caption: "no brand named" });
    assert.equal(missing.result?.isError, true, JSON.stringify(missing));
    // create_draft's schema already requires profile_id; the guard covers every other write tool.
    assert.match(JSON.stringify(missing), /brand_required|at profile_id/);
    const blank = await mcp.call("create_draft", { profile_id: "", platforms: ["facebook"], caption: "blank brand" });
    assert.match(JSON.stringify(blank), /brand_required|at profile_id/);
    assert.equal(ctx.engine.store.listPosts().length, before, "nothing drafted to a default brand");

    for (const id of [BRAND, "1ststep-ai", "skillsprout"]) {
      const ok = await mcp.call("create_draft", { profile_id: id, platforms: ["facebook"], caption: `for ${id}` });
      assert.equal(ok.result.isError ?? false, false, JSON.stringify(ok.result));
    }
    const posts = ctx.engine.store.listPosts();
    assert.deepEqual([...new Set(posts.map((p) => p.profile_id))].sort(), ["1ststep-ai", "skillsprout", BRAND].sort());
    assert.ok(posts.every((p) => p.status === "draft"));
    // Reads still work without a brand and see all three.
    const queue = await mcp.call("list_queue", {});
    assert.equal(queue.result.isError ?? false, false);
    // Publishing stays owner-only.
    const pub = await mcp.call("publish_due", {});
    assert.match(JSON.stringify(pub), /queue:approve/);
  } finally {
    await ctx.stop();
  }
});

test("brand guard: an all-brands token needs a brand on every write tool that takes one", async () => {
  const { requireBrandOnWrite, gateProfiles } = await import("../src/mcp/brandScope.js");
  assert.equal(gateProfiles({ profiles: ["*"] }), null);
  const keys = ["profile_id", "caption"];
  assert.throws(() => requireBrandOnWrite({ args: { caption: "x" }, shapeKeys: keys, readOnly: false }), (e) => e.code === "brand_required");
  assert.throws(() => requireBrandOnWrite({ args: { profile_id: "" }, shapeKeys: keys, readOnly: false }), (e) => e.code === "brand_required");
  assert.deepEqual(requireBrandOnWrite({ args: { profile_id: "skillsprout" }, shapeKeys: keys, readOnly: false }), { profile_id: "skillsprout" });
  assert.deepEqual(requireBrandOnWrite({ args: { post_id: "post_1" }, shapeKeys: keys, readOnly: false }), { post_id: "post_1" });
  assert.deepEqual(requireBrandOnWrite({ args: {}, shapeKeys: keys, readOnly: true }), {});
});
