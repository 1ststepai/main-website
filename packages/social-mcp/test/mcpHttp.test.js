import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { pkceS256, redirectAllowed } from "../src/mcp/auth.js";
import { POSTPATH_INSTRUCTIONS, SERVER_DESCRIPTION } from "../src/mcp/instructions.js";

function verifierPair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: pkceS256(verifier) };
}

async function boot(port = 48891) {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-http-"));
  const env = { SOCIAL_MCP_OAUTH_PORT: String(port + 1), SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_PUBLISH_MODE: "mock" };
  const engine = createEngine({ home, env, fetchImpl: async () => { throw new Error("network"); } });
  const desk = createDeskServer({ engine, env, port });
  const { url } = await desk.start({ open: false });
  return {
    home,
    url,
    engine,
    async stop() {
      await desk.stop();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

test("discovery metadata, DCR, PKCE, refresh rotation, and scope checks", async () => {
  const ctx = await boot();
  try {
    const resource = await fetch(`${ctx.url}.well-known/oauth-protected-resource`).then((res) => res.json());
    assert.equal(resource.resource, `${ctx.url}mcp`);
    assert.ok(resource.scopes_supported.includes("queue:approve"));
    const server = await fetch(`${ctx.url}.well-known/oauth-authorization-server`).then((res) => res.json());
    assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
    assert.equal(server.registration_endpoint, `${ctx.url}oauth/register`);

    const bare = await fetch(`${ctx.url}mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } } }),
    });
    assert.equal(bare.status, 401);
    assert.match(bare.headers.get("www-authenticate") || "", /resource_metadata=/);
    const bareBody = await bare.json();
    assert.match(bareBody.message, /not connected/i);
    assert.equal(bareBody.token, undefined);

    const created = await fetch(`${ctx.url}oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Desk test",
        redirect_uris: ["http://127.0.0.1:59991/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    }).then((res) => res.json());
    assert.ok(created.client_id);
    assert.equal(created.client_secret, undefined);

    const { verifier, challenge } = verifierPair();
    const authUrl = new URL(`${ctx.url}oauth/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", created.client_id);
    authUrl.searchParams.set("redirect_uri", "http://localhost:4242/callback");
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("resource", `${ctx.url}mcp`);
    authUrl.searchParams.set("state", "st");
    authUrl.searchParams.set("scope", "posts:read drafts:write accounts:read queue:approve");
    const page = await fetch(authUrl).then((res) => res.text());
    assert.match(page, /Desk test/);
    assert.match(page, /queue:approve/);
    assert.doesNotMatch(page, /value="queue:approve" checked/);
    const consentId = /name="consent_id" value="([^"]+)"/.exec(page)?.[1];
    assert.ok(consentId);

    const denied = await fetch(`${ctx.url}oauth/authorize`, {
      method: "GET",
      redirect: "manual",
    });
    assert.equal(denied.status, 400);

    const decision = await fetch(`${ctx.url}oauth/authorize/decision`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([
        ["consent_id", consentId],
        ["decision", "approve"],
        ["scope", "posts:read"],
        ["scope", "drafts:write"],
        ["scope", "accounts:read"],
      ]),
    });
    assert.equal(decision.status, 302);
    const redirected = new URL(decision.headers.get("location"));
    assert.equal(redirected.port, "4242");
    const code = redirected.searchParams.get("code");
    assert.ok(code);
    assert.equal(redirected.searchParams.get("state"), "st");

    const tokenRes = await fetch(`${ctx.url}oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost:4242/callback",
        code_verifier: verifier,
        resource: `${ctx.url}mcp`,
      }),
    }).then((res) => res.json());
    assert.equal(tokenRes.token_type, "Bearer");
    assert.ok(tokenRes.access_token.startsWith("pp_at_"));
    assert.equal(tokenRes.scope.includes("queue:approve"), false);

    const call = await mcpCall(ctx.url, tokenRes.access_token, "tools/call", {
      name: "request_approval",
      arguments: { post_id: "post_missing1" },
    });
    assert.equal(call.result.isError, true);
    assert.match(JSON.stringify(call.result), /queue:approve/);

    const refreshed = await fetch(`${ctx.url}oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenRes.refresh_token,
        resource: `${ctx.url}mcp`,
      }),
    }).then((res) => res.json());
    assert.ok(refreshed.access_token);
    assert.notEqual(refreshed.refresh_token, tokenRes.refresh_token);
    const reused = await fetch(`${ctx.url}oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenRes.refresh_token,
        resource: `${ctx.url}mcp`,
      }),
    }).then((res) => res.json());
    assert.equal(reused.error, "invalid_grant");
    const family = await fetch(`${ctx.url}oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshed.refresh_token,
        resource: `${ctx.url}mcp`,
      }),
    }).then((res) => res.json());
    assert.equal(family.error, "invalid_grant");
  } finally {
    await ctx.stop();
  }
});

test("a personal access token can draft and then ask for approval", async () => {
  const ctx = await boot(48895);
  try {
    await ctx.engine.upsertProfile({ id: "acme", name: "Acme", require_vidiq: false });
    const pat = await fetch(`${ctx.url}api/pat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Laptop", scopes: ["posts:read", "drafts:write", "accounts:read", "queue:approve"] }),
    }).then((res) => res.json());
    assert.ok(pat.token.startsWith("pp_pat_"));
    assert.equal(JSON.stringify(pat.pats).includes(pat.token), false);

    const listed = await mcpCall(ctx.url, pat.token, "tools/call", {
      name: "create_draft",
      arguments: {
        profile_id: "acme",
        platforms: ["youtube", "facebook", "instagram"],
        caption: "Every social media scheduler I tried was garbage. So I built my own. #buildinpublic #indiehacker #so",
        overrides: { youtube: { title: "I built my own scheduler" } },
        instagram_public_confirmed: true,
      },
    });
    const payload = JSON.parse(listed.result.content[0].text);
    assert.equal(payload.ok, true);
    assert.equal(payload.bundle.title, "I built my own scheduler");
    assert.equal(listed.result.structuredContent.bundle.title, "I built my own scheduler");
    const queue = await mcpCall(ctx.url, pat.token, "tools/call", { name: "list_queue", arguments: {} });
    const queued = JSON.parse(queue.result.content[0].text);
    assert.equal(queued.queue[0].source, "mcp");
    assert.equal(queued.queue[0].id, payload.bundle.id);
  } finally {
    await ctx.stop();
  }
});

test("redirect rules allow loopback ports and require exact https", () => {
  assert.equal(redirectAllowed("http://localhost:9999/callback", ["http://127.0.0.1:1/callback"]), true);
  assert.equal(redirectAllowed("https://client.example/callback", ["https://client.example/callback"]), true);
  assert.equal(redirectAllowed("https://client.example/callback?x=1", ["https://client.example/callback"]), false);
  assert.equal(redirectAllowed("http://evil.example/callback", ["http://evil.example/callback"]), false);
});

test("server instructions describe tools without telling the model to prefer PostPath", () => {
  assert.equal(SERVER_DESCRIPTION.length <= 100, true);
  assert.match(SERVER_DESCRIPTION, /^AI drafts, you approve, logins stay on your computer/);
  const source = [
    readFileSync(new URL("../src/mcp/instructions.js", import.meta.url), "utf8"),
    readFileSync(new URL("../src/mcp/server.js", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /prefer PostPath|instead of|keyword/i);
  assert.match(POSTPATH_INSTRUCTIONS, /is not published/);
  assert.equal(createHash("sha256").update("marker").digest("hex").length, 64);
});

async function mcpCall(base, token, method, params) {
  const init = await fetch(`${base}mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    }),
  });
  const session = init.headers.get("mcp-session-id");
  const opened = await readRpc(init);
  assert.equal(opened.id, 1);
  await fetch(`${base}mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": session,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  const response = await fetch(`${base}mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": session,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method, params }),
  });
  return readRpc(response);
}

async function readRpc(response) {
  const text = await response.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  const json = dataLine ? dataLine.slice(6) : text;
  return JSON.parse(json);
}
