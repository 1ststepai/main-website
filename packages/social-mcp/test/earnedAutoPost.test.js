import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEngine } from "../src/engine.js";
import { createSocialMcpServer } from "../src/mcp/server.js";
import { createDeskServer } from "../src/desk/server.js";
import { initOwnerPin } from "../src/pilot/ownerAuth.js";
import { createPat } from "../src/mcp/auth.js";
import { setNetworkAutoPost, autoPostAllows, publishRefusalMessage, listAutoPostActivity } from "../src/autoPost.js";
import { computeReadiness, listDecisions, READINESS_THRESHOLDS } from "../src/approvalHistory.js";
import { POSTPATH_INSTRUCTIONS } from "../src/mcp/instructions.js";
import { autoPostNetworkBody, autoPostSnoozeBody, DESK_ROUTES } from "../src/desk/public/deskApi.js";
import { freePorts } from "./helpers/ports.js";

const DRAFT = ["posts:read", "drafts:write", "accounts:read"];
const FULL = [...DRAFT, "accounts:write", "queue:approve"];
const rec = (decision) => ({ decision });
const many = (n, decision) => Array.from({ length: n }, () => rec(decision));

async function setup({ pin = "246810" } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-earned-"));
  const [port, oauthPort] = await freePorts(2);
  const env = { ANTHROPIC_API_KEY: "", SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_OAUTH_PORT: String(oauthPort) };
  const calls = [];
  const ok = (platform) => async ({ post }) => {
    calls.push({ platform, post_id: post.id });
    return { platform_post_id: `mock_${post.id}`, published_url: `https://example.test/${post.id}`, result_source: "mock" };
  };
  const engine = createEngine({ home, env, publishers: { facebook: ok("facebook"), youtube: ok("youtube"), linkedin: ok("linkedin") } });
  if (pin) initOwnerPin(engine.store.homePaths, pin);
  engine.store.upsertProfile({ id: "acme", name: "Acme" });
  engine.store.saveConnection({ profile_id: "acme", platform: "facebook", account_label: "acme-fb", page_id: "p1" }, { access_token: "tok" });
  const media = path.join(engine.store.homePaths.mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(2048, 1));
  let desk;
  return {
    engine, env, calls, media,
    async deskUrl() {
      desk = createDeskServer({ engine, env, port });
      return (await desk.start({ open: false })).url;
    },
    async cleanup() {
      await desk?.stop();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

async function mcpFor(engine, env, auth) {
  const { server } = createSocialMcpServer({ engine, env, auth });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    client,
    async call(name, args = {}) {
      const res = await client.callTool({ name, arguments: args });
      let body = res.structuredContent;
      if (!body) {
        try { body = JSON.parse(res.content?.[0]?.text || "{}"); } catch { body = { text: res.content?.[0]?.text }; }
      }
      return { error: res.isError === true, body, text: res.content?.map((c) => c.text).join("\n") || "" };
    },
    close: () => client.close(),
  };
}

async function post(url, route, body, pin) {
  const headers = { "content-type": "application/json" };
  if (pin) headers["x-postpath-owner-pin"] = pin;
  const res = await fetch(`${url}${route}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const draft = (ctx, extra = {}) => ({ profile_id: "acme", platform: "facebook", title: "Shop tip", caption: "Three ways to tidy your shelf.", media_path: ctx.media, ...extra });

test("readiness: thresholds are 10 unchanged of last 12 and no rejection in last 5", () => {
  assert.deepEqual(
    { w: READINESS_THRESHOLDS.window, m: READINESS_THRESHOLDS.min_unedited, r: READINESS_THRESHOLDS.reject_window },
    { w: 12, m: 10, r: 5 },
  );
  assert.equal(computeReadiness(many(9, "approved_unedited")).suggest, false, "too few decisions");
  assert.equal(computeReadiness(many(10, "approved_unedited")).suggest, true);
  const tenOfTwelve = [...many(2, "approved_edited"), ...many(10, "approved_unedited")];
  assert.equal(computeReadiness(tenOfTwelve).approved_unedited, 10);
  assert.equal(computeReadiness(tenOfTwelve).window_size, 12);
  assert.equal(computeReadiness(tenOfTwelve).suggest, true);
  const nineOfTwelve = [...many(3, "approved_edited"), ...many(9, "approved_unedited")];
  assert.equal(computeReadiness(nineOfTwelve).suggest, false);
  const recentReject = [...many(10, "approved_unedited"), rec("rejected"), ...many(1, "approved_unedited")];
  assert.equal(computeReadiness(recentReject).recent_rejections, 1);
  assert.equal(computeReadiness(recentReject).suggest, false);
  const oldReject = [rec("rejected"), ...many(1, "approved_unedited"), ...many(10, "approved_unedited")];
  assert.equal(computeReadiness(oldReject).recent_rejections, 0);
  assert.equal(computeReadiness(oldReject).suggest, true, "a rejection 6+ decisions back no longer blocks");
  const oldWindow = [...many(5, "rejected"), ...many(12, "approved_unedited")];
  assert.equal(computeReadiness(oldWindow).suggest, true, "only the last 12 count");
});

test("readiness: Not now snoozes until 10 more decisions", () => {
  const base = many(12, "approved_unedited");
  assert.equal(computeReadiness(base, { snoozedAt: 12 }).suggest, false);
  assert.equal(computeReadiness([...base, ...many(9, "approved_unedited")], { snoozedAt: 12 }).suggest, false);
  const later = computeReadiness([...base, ...many(10, "approved_unedited")], { snoozedAt: 12 });
  assert.equal(later.snoozed, false);
  assert.equal(later.suggest, true);
});

test("permissions: only the desk can enable; off applies to every assistant", async () => {
  const ctx = await setup();
  try {
    assert.throws(() => setNetworkAutoPost(ctx.engine.store, { profile_id: "acme", platform: "facebook", enabled: true, enabled_by: "mcp" }), /desk|owner/i);
    assert.equal(autoPostAllows(ctx.engine.store, { profile_id: "acme", connection_id: "anything", platform: "facebook" }), false);
    setNetworkAutoPost(ctx.engine.store, { profile_id: "acme", platform: "facebook", enabled: true, enabled_by: "desk" });
    assert.equal(autoPostAllows(ctx.engine.store, { profile_id: "acme", connection_id: "anything", platform: "facebook" }), true);
    assert.equal(autoPostAllows(ctx.engine.store, { profile_id: "acme", connection_id: "anything", platform: "youtube" }), false);
    setNetworkAutoPost(ctx.engine.store, { profile_id: "acme", platform: "facebook", enabled: false, enabled_by: "mcp" });
    assert.equal(autoPostAllows(ctx.engine.store, { profile_id: "acme", connection_id: "anything", platform: "facebook" }), false);
  } finally {
    await ctx.cleanup();
  }
});

test("desk: enabling needs the PIN, turning off needs nothing", async () => {
  const ctx = await setup();
  try {
    const url = await ctx.deskUrl();
    const body = { profile_id: "acme", platform: "facebook", enabled: true };
    assert.equal((await post(url, "api/auto-post/network", body)).status, 401);
    assert.equal((await post(url, "api/auto-post/network", { ...body, confirm: true })).status, 401, "confirm is not a PIN substitute");
    assert.equal((await post(url, "api/auto-post/network", body, "000000")).status, 401);
    const on = await post(url, "api/auto-post/network", body, "246810");
    assert.equal(on.status, 200);
    assert.equal(on.body.posting.networks.find((n) => n.platform === "facebook").mode, "auto");
    const off = await post(url, "api/auto-post/network", { ...body, enabled: false });
    assert.equal(off.status, 200);
    assert.equal(off.body.posting.networks.find((n) => n.platform === "facebook").mode, "review");
  } finally {
    await ctx.cleanup();
  }
});

test("desk: with no PIN set, enabling needs an explicit confirm", async () => {
  const ctx = await setup({ pin: "" });
  try {
    const url = await ctx.deskUrl();
    const body = { profile_id: "acme", platform: "facebook", enabled: true };
    assert.equal((await post(url, "api/auto-post/network", body)).status, 400);
    const on = await post(url, "api/auto-post/network", { ...body, confirm: true });
    assert.equal(on.status, 200);
    assert.equal(on.body.posting.pin_required, false);
  } finally {
    await ctx.cleanup();
  }
});

test("MCP: publish is refused while auto-post is off, allowed once the owner turns it on", async () => {
  const ctx = await setup();
  try {
    const pat = createPat(ctx.engine.store, { name: "Helper", scopes: FULL });
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: FULL, connectionId: pat.pat.id });
    const made = await mcp.call("create_draft", draft(ctx));
    assert.equal(made.body.post.status, "draft");
    const refused = await mcp.call("publish_post", { post_id: made.body.post.id });
    assert.equal(refused.error, true);
    assert.match(refused.text, /Not published\. Auto-post is off/);
    assert.match(refused.text, /owner/);
    assert.doesNotMatch(refused.text, /PIN|bypass|workaround|enable_auto/i);
    assert.equal(ctx.calls.length, 0);
    const tools = (await mcp.client.listTools()).tools.map((t) => t.name);
    assert.ok(tools.includes("get_posting_permissions"));
    assert.ok(!tools.some((name) => /enable.*auto|auto.*enable|set_auto/.test(name)), "no tool can turn auto-post on");
    const perms = await mcp.call("get_posting_permissions", { profile_id: "acme" });
    assert.equal(perms.body.networks.find((n) => n.platform === "facebook").mode, "review");
    assert.ok(perms.body.owner_only.length > 0);

    setNetworkAutoPost(ctx.engine.store, { profile_id: "acme", platform: "facebook", enabled: true, enabled_by: "desk" });
    const allowed = await mcp.call("publish_post", { post_id: made.body.post.id });
    assert.equal(allowed.error, false, allowed.text);
    assert.equal(ctx.calls.length, 1);
    const log = listAutoPostActivity(ctx.engine.store);
    assert.equal(log.length, 1);
    assert.equal(log[0].platform, "facebook");
    assert.equal(log[0].assistant, "Helper");
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

test("MCP: refusal message and instructions say plainly what is owner-only", () => {
  const msg = publishRefusalMessage([{ profile_id: "acme", platform: "facebook" }]);
  assert.match(msg, /^Not published\./);
  assert.match(msg, /acme/);
  assert.match(POSTPATH_INSTRUCTIONS, /only the owner/i);
  assert.match(POSTPATH_INSTRUCTIONS, /never|cannot/i);
});

test("history: desk approve and discard record assistant drafts with text, reason and assistant", async () => {
  const ctx = await setup();
  try {
    const pat = createPat(ctx.engine.store, { name: "Helper", scopes: DRAFT });
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: pat.pat.id });
    const a = (await mcp.call("create_draft", draft(ctx))).body.post;
    const b = (await mcp.call("create_draft", draft(ctx, { caption: "Skip this one." }))).body.post;
    await mcp.close();
    const url = await ctx.deskUrl();
    assert.equal((await post(url, "api/approve", { post_id: a.id }, "246810")).status, 200);
    await post(url, "api/discard", { post_id: b.id, reason: "off brand" }, "246810");
    const rows = listDecisions(ctx.engine.store, { profile_id: "acme", platform: "facebook" });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].decision, "approved_unedited");
    assert.deepEqual(rows[0].original_text, rows[0].final_text);
    assert.equal(rows[0].drafted_by.assistant, "Helper");
    assert.equal(rows[1].decision, "rejected");
    assert.equal(rows[1].reason, "off brand");
    assert.ok(rows[1].decided_at);
  } finally {
    await ctx.cleanup();
  }
});

test("desk client: new routes are allowlisted and bodies are validated", () => {
  assert.equal(DESK_ROUTES.autoPostNetwork, "/api/auto-post/network");
  assert.equal(DESK_ROUTES.autoPostSnooze, "/api/auto-post/snooze");
  assert.deepEqual(autoPostNetworkBody({ profileId: "acme", platform: "facebook", enabled: false, confirm: true }), { profile_id: "acme", platform: "facebook", enabled: false });
  assert.deepEqual(autoPostNetworkBody({ profileId: "acme", platform: "facebook", enabled: true, confirm: true }), { profile_id: "acme", platform: "facebook", enabled: true, confirm: true });
  assert.throws(() => autoPostNetworkBody({ profileId: "../x", platform: "facebook" }));
  assert.throws(() => autoPostSnoozeBody({ profileId: "acme", platform: "face book" }));
  const ui = readFileSync(new URL("../src/desk/public/earnedAutoPost.js", import.meta.url), "utf8");
  assert.ok(!/\bAI\b/.test(ui));
  assert.ok(!/fetch\("\/api/.test(ui), "uses deskUrl routes only");
});
