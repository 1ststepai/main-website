import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEngine } from "../src/engine.js";
import { createSocialMcpServer } from "../src/mcp/server.js";
import { createDeskServer } from "../src/desk/server.js";
import { initPilot } from "../src/cli.js";
import { initOwnerPin } from "../src/pilot/ownerAuth.js";
import { createPat } from "../src/mcp/auth.js";
import { enableAutoPost } from "../src/autoPost.js";
import { freePort, freePorts } from "./helpers/ports.js";

const FULL = ["posts:read", "drafts:write", "accounts:read", "accounts:write", "queue:approve"];
const DRAFT = ["posts:read", "drafts:write", "accounts:read"];

function mockPublishers() {
  const calls = [];
  const ok = (platform) => async ({ post }) => {
    calls.push({ platform, post_id: post.id });
    return { platform_post_id: `mock_${post.id}`, published_url: `https://example.test/${platform}/${post.id}`, result_source: "mock" };
  };
  return { calls, publishers: { youtube: ok("youtube"), facebook: ok("facebook"), instagram: ok("instagram"), linkedin: ok("linkedin") } };
}

async function setup({ pilot = false, pin = "246810" } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-autopost-"));
  const [port, oauthPort] = await freePorts(2);
  const env = { ANTHROPIC_API_KEY: "", SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_OAUTH_PORT: String(oauthPort) };
  if (pilot) {
    env.SOCIAL_MCP_PILOT_MODE = "1";
    initPilot({ home, pin, env });
  }
  const spy = mockPublishers();
  const engine = createEngine({ home, env, publishers: spy.publishers });
  if (!pilot && pin) initOwnerPin(engine.store.homePaths, pin);
  for (const id of ["acme", "other", "1ststep-ai"]) {
    if (!engine.store.getProfile(id)) engine.store.upsertProfile({ id, name: id });
    for (const platform of ["facebook", "instagram", "youtube"]) {
      engine.store.saveConnection({ profile_id: id, platform, account_label: `${id}-${platform}`, page_id: "p1", ig_user_id: "ig1", channel_id: "c1" }, { access_token: "tok", refresh_token: "rt" });
    }
  }
  const media = path.join(engine.store.homePaths.mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(2048, 1));
  return {
    home,
    env,
    port,
    engine,
    spy,
    media,
    async desk() {
      const desk = createDeskServer({ engine, env, port });
      const { url } = await desk.start({ open: false });
      this.stopDesk = () => desk.stop();
      return url;
    },
    async cleanup() {
      await this.stopDesk?.();
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
        try {
          body = JSON.parse(res.content?.[0]?.text || "{}");
        } catch {
          body = { text: res.content?.[0]?.text };
        }
      }
      return { error: res.isError === true, body, raw: res };
    },
    close: () => client.close(),
  };
}

function draftArgs(ctx, extra = {}) {
  return { profile_id: "acme", platform: "facebook", title: "Shop tip", caption: "Three ways to tidy your shelf.", media_path: ctx.media, ...extra };
}

async function post(url, route, body, pin) {
  const headers = { "content-type": "application/json" };
  if (pin) headers["x-postpath-owner-pin"] = pin;
  const res = await fetch(`${url}${route}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test("auto-post is off on a fresh brand and when the question is skipped", async () => {
  const ctx = await setup();
  try {
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: FULL, connectionId: "pat_a" });
    const fresh = await mcp.call("get_brand_context", { profile_id: "acme" });
    assert.equal(fresh.body.brands[0].auto_post.enabled, false);
    await mcp.call("save_brand_context", { profile_id: "acme", audience: "Shop owners" });
    const drafted = await mcp.call("create_draft", draftArgs(ctx));
    assert.equal(drafted.error, false, JSON.stringify(drafted.raw));
    assert.equal(drafted.body.post.status, "draft");
    assert.equal(drafted.body.auto_post, undefined);
    assert.equal(ctx.spy.calls.length, 0);
    assert.equal(ctx.engine.publisherCalls(), 0);
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

test("a saved auto-post request is inert until the owner confirms on the desk", async () => {
  const ctx = await setup();
  try {
    const pat = createPat(ctx.engine.store, { name: "Assistant", scopes: FULL });
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: FULL, connectionId: pat.pat.id });
    const saved = await mcp.call("save_brand_context", { profile_id: "acme", auto_post: { networks: ["facebook"] } });
    assert.equal(saved.error, false, JSON.stringify(saved.raw));
    assert.match(saved.body.auto_post_note, /NOT on/);
    const brand = (await mcp.call("get_brand_context", { profile_id: "acme" })).body.brands[0];
    assert.equal(brand.auto_post.enabled, false);
    assert.deepEqual(brand.auto_post.pending_request.networks, ["facebook"]);
    const drafted = await mcp.call("create_draft", draftArgs(ctx));
    assert.equal(drafted.body.post.status, "draft");
    assert.equal(ctx.spy.calls.length, 0);

    // No MCP tool can turn auto-post on.
    const tools = (await mcp.client.listTools()).tools.map((tool) => tool.name);
    assert.equal(tools.some((name) => /auto.?post/i.test(name)), false);

    const url = await ctx.desk();
    const view = await fetch(`${url}api/auto-post`).then((res) => res.json());
    const row = view.auto_post.brands.find((b) => b.profile_id === "acme").connections.find((c) => c.connection_id === pat.pat.id);
    assert.deepEqual(row.pending_request.networks, ["facebook"]);
    assert.equal(row.enabled, false);
    assert.equal(view.auto_post.risk_label, "Highest risk: the assistant will post without asking you each time.");
    assert.doesNotMatch(JSON.stringify(view), /pp_pat_|hash|token/i);

    const noPin = await post(url, "api/auto-post/enable", { profile_id: "acme", connection_id: pat.pat.id, networks: ["facebook"], confirm: true });
    assert.equal(noPin.status, 401);
    const noConfirm = await post(url, "api/auto-post/enable", { profile_id: "acme", connection_id: pat.pat.id, networks: ["facebook"] }, "246810");
    assert.equal(noConfirm.status, 400);
    assert.match(noConfirm.body.message, /Highest risk/);
    const stranger = await post(url, "api/auto-post/enable", { profile_id: "acme", connection_id: "pat_nope", networks: ["facebook"], confirm: true }, "246810");
    assert.equal(stranger.status, 404);
    assert.equal(ctx.spy.calls.length, 0);

    const on = await post(url, "api/auto-post/enable", { profile_id: "acme", connection_id: pat.pat.id, networks: ["facebook"], confirm: true }, "246810");
    assert.equal(on.status, 200);
    const next = await mcp.call("create_draft", draftArgs(ctx, { caption: "Second tip." }));
    assert.equal(next.body.post.status, "published", JSON.stringify(next.body));
    assert.equal(next.body.auto_post[0].auto_post, "published");
    assert.equal(ctx.spy.calls.length, 1);
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

test("draft-only callers cannot save, request, or enable auto-post", async () => {
  const ctx = await setup();
  try {
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: "pat_d" });
    const res = await mcp.call("save_brand_context", { profile_id: "acme", auto_post: { networks: ["facebook"] } });
    assert.equal(res.error, true);
    assert.deepEqual(ctx.engine.store.readAutoPost(), {});
    assert.throws(() => enableAutoPost(ctx.engine.store, { profile_id: "acme", connection_id: "pat_d", networks: ["facebook"], enabled_by: "mcp" }), /owner/);
    assert.deepEqual(ctx.engine.store.readAutoPost(), {});
    const drafted = await mcp.call("create_draft", draftArgs(ctx));
    assert.equal(drafted.body.post.status, "draft");
    assert.equal(ctx.spy.calls.length, 0);
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

test("turning auto-post off blocks the very next post", async () => {
  const ctx = await setup();
  try {
    const pat = createPat(ctx.engine.store, { name: "Assistant", scopes: DRAFT });
    const url = await ctx.desk();
    await post(url, "api/auto-post/enable", { profile_id: "acme", connection_id: pat.pat.id, networks: ["facebook"], confirm: true }, "246810");
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: pat.pat.id });
    const first = await mcp.call("create_draft", draftArgs(ctx));
    assert.equal(first.body.post.status, "published");
    const off = await post(url, "api/auto-post/disable", { profile_id: "acme", connection_id: pat.pat.id });
    assert.equal(off.status, 200);
    const second = await mcp.call("create_draft", draftArgs(ctx, { caption: "Another one." }));
    assert.equal(second.body.post.status, "draft");
    assert.equal(ctx.spy.calls.length, 1);
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

test("vidIQ, Instagram-public and compliance checks still stop posts with auto-post on", async () => {
  const ctx = await setup();
  try {
    enableAutoPost(ctx.engine.store, { profile_id: "1ststep-ai", connection_id: "pat_v", networks: ["youtube"], enabled_by: "desk" });
    enableAutoPost(ctx.engine.store, { profile_id: "acme", connection_id: "pat_v", networks: ["instagram", "facebook"], enabled_by: "desk" });
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: "pat_v" });

    const yt = await mcp.call("create_draft", { profile_id: "1ststep-ai", platform: "youtube", title: "Build update", description: "Notes", media_path: ctx.media });
    assert.equal(yt.body.post.status, "draft");
    assert.equal(yt.body.auto_post[0].code, "vidiq_required");
    assert.equal(yt.body.post.auto_post.status, "held");

    const ig = await mcp.call("create_draft", { profile_id: "acme", platform: "instagram", caption: "Tip", media_path: ctx.media, media_url: "https://example.test/clip.mp4" });
    assert.equal(ig.body.post.status, "draft");
    assert.equal(ig.body.auto_post[0].code, "instagram_public_unconfirmed");

    const promise = await mcp.call("create_draft", draftArgs(ctx, { caption: "Get the lowest rate today." }));
    assert.equal(promise.body.post.status, "draft");
    assert.equal(promise.body.auto_post[0].code, "compliance_promise");

    assert.equal(ctx.spy.calls.length, 0);

    const igOk = await mcp.call("create_draft", { profile_id: "acme", platform: "instagram", caption: "Tip", media_path: ctx.media, media_url: "https://example.test/clip.mp4", privacy_status: "public", instagram_public_confirmed: true });
    assert.equal(igOk.body.post.status, "published", JSON.stringify(igOk.body.auto_post));
    assert.equal(ctx.spy.calls.length, 1);
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

test("auto-post is scoped to its own connection, brand and networks", async () => {
  const ctx = await setup();
  try {
    enableAutoPost(ctx.engine.store, { profile_id: "acme", connection_id: "pat_on", networks: ["facebook"], enabled_by: "desk" });
    const on = await mcpFor(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: "pat_on" });
    const otherConn = await mcpFor(ctx.engine, ctx.env, { scopes: FULL, connectionId: "pat_other" });
    const stdio = await mcpFor(ctx.engine, ctx.env, undefined);

    assert.equal((await otherConn.call("create_draft", draftArgs(ctx))).body.post.status, "draft");
    assert.equal((await stdio.call("create_draft", draftArgs(ctx))).body.post.status, "draft");
    assert.equal((await on.call("create_draft", draftArgs(ctx, { profile_id: "other" }))).body.post.status, "draft");
    assert.equal((await on.call("create_draft", draftArgs(ctx, { platform: "youtube", description: "x" }))).body.post.status, "draft");
    assert.equal(ctx.spy.calls.length, 0);

    // Multi-network: only the enabled network goes out.
    const multi = await on.call("create_post", { profile_id: "acme", platforms: ["facebook", "youtube"], title: "Shop tip", caption: "Tidy shelves.", media_path: ctx.media });
    const byPlatform = Object.fromEntries(multi.body.posts.map((p) => [p.platform, p.status]));
    assert.deepEqual(byPlatform, { facebook: "published", youtube: "draft" });
    assert.equal(ctx.spy.calls.length, 1);
    assert.equal(ctx.spy.calls[0].platform, "facebook");
    await on.close();
    await otherConn.close();
    await stdio.close();
  } finally {
    await ctx.cleanup();
  }
});

test("pilot mode refuses auto-post: desk routes, consent option, engine", async () => {
  const ctx = await setup({ pilot: true });
  try {
    assert.throws(
      () => enableAutoPost(ctx.engine.store, { profile_id: "acme", connection_id: "pat_p", networks: ["facebook"], enabled_by: "desk", pilot: true }),
      /pilot/i,
    );
    const url = await ctx.desk();
    const list = await fetch(`${url}api/auto-post`);
    assert.equal(list.status, 403);
    const en = await post(url, "api/auto-post/enable", { profile_id: "acme", connection_id: "pat_p", networks: ["facebook"], confirm: true }, "246810");
    assert.equal(en.status, 403);
    assert.equal(en.body.code, "pilot_auto_post_disabled");

    // Even a stored "on" row (from before pilot) does not post in pilot mode.
    ctx.engine.store.updateAutoPost((auto) => {
      auto.acme = { pat_p: { connection_id: "pat_p", enabled: true, networks: ["facebook"] } };
    });
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: "pat_p" });
    const drafted = await mcp.call("create_draft", draftArgs(ctx));
    assert.equal(drafted.body.post.status, "draft");
    assert.equal(drafted.body.auto_post[0].code, "pilot_publish_disabled");

    const client = await fetch(`${url}oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Pilot client", redirect_uris: ["http://127.0.0.1:59991/callback"], token_endpoint_auth_method: "none" }),
    }).then((res) => res.json());
    const page = await consentPage(url, client.client_id);
    assert.doesNotMatch(page.html, /auto_post|Highest risk/);
    assert.equal(ctx.spy.calls.length, 0);
    assert.equal(ctx.engine.publisherCalls(), 0);
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

async function consentPage(url, clientId) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authUrl = new URL(`${url}oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", "http://127.0.0.1:59991/callback");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("resource", `${url}mcp`);
  authUrl.searchParams.set("scope", "posts:read drafts:write accounts:read");
  const html = await fetch(authUrl).then((res) => res.text());
  return { html, verifier, consentId: /name="consent_id" value="([^"]+)"/.exec(html)?.[1] };
}

test("consent screen: owner can opt this connection into auto-post with the red label and a confirm tick", async () => {
  const ctx = await setup();
  try {
    const url = await ctx.desk();
    const client = await fetch(`${url}oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Consent client", redirect_uris: ["http://127.0.0.1:59991/callback"], token_endpoint_auth_method: "none" }),
    }).then((res) => res.json());

    // Ticking networks without the confirm box is refused.
    let page = await consentPage(url, client.client_id);
    assert.match(page.html, /Highest risk: the assistant will post without asking you each time\./);
    assert.match(page.html, /Leave auto-post off/);
    const refused = await fetch(`${url}oauth/authorize/decision`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([["consent_id", page.consentId], ["owner_pin", "246810"], ["decision", "approve"], ["scope", "posts:read"], ["scope", "drafts:write"], ["auto_post_profile", "acme"], ["auto_post_network", "facebook"]]),
    });
    assert.equal(refused.status, 400);

    page = await consentPage(url, client.client_id);
    const decision = await fetch(`${url}oauth/authorize/decision`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([
        ["consent_id", page.consentId],
        ["owner_pin", "246810"],
        ["decision", "approve"],
        ["scope", "posts:read"],
        ["scope", "drafts:write"],
        ["auto_post_profile", "acme"],
        ["auto_post_network", "facebook"],
        ["auto_post_confirm", "yes"],
      ]),
    });
    assert.equal(decision.status, 302);
    const code = new URL(decision.headers.get("location")).searchParams.get("code");
    assert.deepEqual(ctx.engine.store.readAutoPost(), {}, "nothing is on until the code is exchanged");
    const tokens = await fetch(`${url}oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: "http://127.0.0.1:59991/callback", code_verifier: page.verifier, resource: `${url}mcp` }),
    }).then((res) => res.json());
    assert.ok(tokens.access_token);
    assert.equal(tokens.grantId, undefined);
    assert.equal(tokens.autoPost, undefined);
    const rows = Object.values(ctx.engine.store.readAutoPost().acme);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].enabled, true);
    assert.equal(rows[0].enabled_by, "consent");
    assert.deepEqual(rows[0].networks, ["facebook"]);
    assert.match(rows[0].connection_id, /^grant_/);

    // The connection's own MCP calls auto-post Facebook only.
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
    const headers = { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" };
    const started = await fetch(`${url}mcp`, { method: "POST", headers, body: JSON.stringify(init) });
    const session = started.headers.get("mcp-session-id");
    await started.text();
    const h2 = { ...headers, ...(session ? { "mcp-session-id": session } : {}) };
    await fetch(`${url}mcp`, { method: "POST", headers: h2, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }).then((r) => r.text());
    const callRes = await fetch(`${url}mcp`, {
      method: "POST",
      headers: h2,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_draft", arguments: draftArgs(ctx) } }),
    }).then((r) => r.text());
    assert.match(callRes, /\\?"status\\?":\s*\\?"published/);
    assert.equal(ctx.spy.calls.length, 1);

    // The desk can turn it off at any time.
    const off = await post(url, "api/auto-post/disable", { profile_id: "acme" });
    assert.equal(off.status, 200);
    assert.equal(Object.values(ctx.engine.store.readAutoPost().acme)[0].enabled, false);
  } finally {
    await ctx.cleanup();
  }
});
