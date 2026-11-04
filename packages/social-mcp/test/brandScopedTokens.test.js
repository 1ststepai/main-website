import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEngine } from "../src/engine.js";
import { createSocialMcpServer } from "../src/mcp/server.js";
import { createDeskServer } from "../src/desk/server.js";
import { authenticateBearer, createPat, listPats, normalizeProfiles } from "../src/mcp/auth.js";
import { createPatFile, runPilotCommands } from "../src/cli.js";
import { initOwnerPin } from "../src/pilot/ownerAuth.js";
import { freePorts } from "./helpers/ports.js";

const BRANDS = ["1ststep-ai", "swing-trade-pros", "skillsprout"];
const ALL = ["posts:read", "drafts:write", "accounts:read", "accounts:write", "queue:approve"];

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "pp-brandscope-"));
  const env = { SOCIAL_MCP_PUBLISH_MODE: "mock", ANTHROPIC_API_KEY: "" };
  const engine = createEngine({ home, env, fetchImpl: async () => { throw new Error("network"); } });
  for (const id of BRANDS) {
    engine.store.upsertProfile({ id, name: id });
    engine.store.saveConnection({ profile_id: id, platform: "facebook", account_label: `${id}-page`, page_id: `page-${id}` }, { page_access_token: `EAA${id.replace(/-/g, "")}SECRETSECRETSECRETSECRETSECRET` });
  }
  writeFileSync(path.join(engine.store.homePaths.mediaDir, "clip.mp4"), Buffer.alloc(2048, 1));
  return { home, env, engine, stop: () => { engine.oauth?.stop?.(); rmSync(home, { recursive: true, force: true }); } };
}

async function connect(engine, token) {
  const auth = authenticateBearer(engine.store, token, "unused");
  assert.ok(auth, "token authenticates");
  const { server } = createSocialMcpServer({ engine, auth });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(b);
  return client;
}

function body(result) {
  if (!result.content[0].text.startsWith("{")) throw new Error(result.content[0].text);
  return JSON.parse(result.content[0].text);
}

test("normalizeProfiles: one, several, all", () => {
  assert.equal(normalizeProfiles(undefined), null);
  assert.equal(normalizeProfiles("all"), null);
  assert.equal(normalizeProfiles(["*"]), null);
  assert.deepEqual(normalizeProfiles("skillsprout"), ["skillsprout"]);
  assert.deepEqual(normalizeProfiles("1ststep-ai, Skillsprout skillsprout"), ["1ststep-ai", "skillsprout"]);
  assert.throws(() => normalizeProfiles(["../etc"]));
});

test("createPat rejects unknown brands and stores the allowlist", () => {
  const ctx = setup();
  try {
    assert.throws(() => createPat(ctx.engine.store, { name: "x", profiles: ["nope"] }), /Unknown brand/);
    const { pat } = createPat(ctx.engine.store, { name: "x", profiles: ["skillsprout"] });
    assert.deepEqual(pat.brands, ["skillsprout"]);
    assert.throws(() => createPat(ctx.engine.store, { name: "x", brands: [] }), /at least one brand/);
    assert.deepEqual(createPat(ctx.engine.store, { name: "y", brands: ["1ststep-ai"] }).pat.brands, ["1ststep-ai"]);
    assert.deepEqual(listPats(ctx.engine.store)[0].brands, ["skillsprout"]);
    const all = createPat(ctx.engine.store, { name: "y" });
    assert.deepEqual(all.pat.brands, ["*"]);
  } finally {
    ctx.stop();
  }
});

test("single-brand token: other brands refused on every path, lists scrubbed", async () => {
  const ctx = setup();
  try {
    const other = await ctx.engine.createDraft({ profile_id: "1ststep-ai", platform: "facebook", caption: "hi", media_path: "clip.mp4" });
    const otherId = (other.post || other.posts[0]).id;
    const { token } = createPat(ctx.engine.store, { name: "stp", scopes: ALL, profiles: ["swing-trade-pros"] });
    const client = await connect(ctx.engine, token);

    const refused = await client.callTool({ name: "create_draft", arguments: { profile_id: "1ststep-ai", platform: "facebook", caption: "x", media_path: "clip.mp4" } });
    assert.equal(refused.isError, true);
    assert.equal(body(refused).code, "brand_not_allowed");

    for (const [name, args] of [
      ["get_post_status", { post_id: otherId }],
      ["update_draft", { post_id: otherId, caption: "pwn" }],
      ["publish_post", { post_id: otherId }],
      ["list_accounts", { profile_id: "skillsprout" }],
      ["seo_draft", { topic: "trading", profile_ids: ["swing-trade-pros", "skillsprout"] }],
    ]) {
      const res = await client.callTool({ name, arguments: args });
      assert.equal(res.isError, true, name);
      assert.equal(body(res).code, "brand_not_allowed", name);
    }
    assert.equal(ctx.engine.store.getPost(otherId).caption, "hi", "other brand's draft untouched");

    const ok = await client.callTool({ name: "create_draft", arguments: { profile_id: "swing-trade-pros", platform: "facebook", caption: "ok", media_path: "clip.mp4" } });
    assert.notEqual(ok.isError, true);

    const accounts = body(await client.callTool({ name: "list_accounts", arguments: {} }));
    assert.deepEqual(accounts.profiles.map((p) => p.id), ["swing-trade-pros"]);
    assert.ok(accounts.connections.every((c) => c.profile_id === "swing-trade-pros"));
    const status = await client.callTool({ name: "status", arguments: {} });
    const text = status.content[0].text;
    assert.doesNotMatch(text, /1ststep-ai|skillsprout/);
    assert.doesNotMatch(text, /SECRET|secrets_enc|smcp_enc_v1/);
    const posts = body(await client.callTool({ name: "list_posts", arguments: {} }));
    assert.ok((posts.posts || []).every((p) => p.profile_id === "swing-trade-pros"));
    await client.close();
  } finally {
    ctx.stop();
  }
});

test("multi-brand token: write without profile_id is refused, all-brands token is unchanged", async () => {
  const ctx = setup();
  try {
    const { token } = createPat(ctx.engine.store, { name: "two", scopes: ALL, profiles: ["swing-trade-pros", "skillsprout"] });
    const client = await connect(ctx.engine, token);
    const due = await client.callTool({ name: "publish_due", arguments: {} });
    assert.equal(body(due).code, "brand_required");
    const ok = await client.callTool({ name: "create_draft", arguments: { profile_id: "skillsprout", platform: "facebook", caption: "ok", media_path: "clip.mp4" } });
    assert.notEqual(ok.isError, true);
    const accounts = body(await client.callTool({ name: "list_accounts", arguments: {} }));
    assert.deepEqual(accounts.profiles.map((p) => p.id).sort(), ["skillsprout", "swing-trade-pros"]);
    await client.close();

    const every = createPat(ctx.engine.store, { name: "all", scopes: ALL });
    const c2 = await connect(ctx.engine, every.token);
    const all = body(await c2.callTool({ name: "list_accounts", arguments: {} }));
    assert.equal(all.profiles.length, 3);
    await c2.close();
  } finally {
    ctx.stop();
  }
});

test("CLI pat create --brands writes a 0600 token scoped to brands", async () => {
  const ctx = setup();
  try {
    ctx.engine.oauth?.stop?.();
    const out = path.join(ctx.home, "tok.txt");
    const lines = [];
    const code = await runPilotCommands(["pat", "create", "--home", ctx.home, "--out", out, "--brands", "skillsprout,1ststep-ai"], { stdout: (l) => lines.push(l), stderr: (l) => lines.push(l), env: { SOCIAL_MCP_HOME: ctx.home } });
    assert.equal(code, 0, lines.join("\n"));
    assert.match(lines.join("\n"), /Brands: skillsprout, 1ststep-ai/);
    assert.doesNotMatch(lines.join("\n"), /pp_pat_/);
    assert.equal(statSync(out).mode & 0o777, 0o600);
    const token = readFileSync(out, "utf8").trim();
    const auth = authenticateBearer(ctx.engine.store, token, "x");
    assert.deepEqual(auth.profiles, ["skillsprout", "1ststep-ai"]);
    assert.throws(() => createPatFile({ home: ctx.home, out: `${out}2`, brands: "ghost" }), /Unknown brand/);
  } finally {
    ctx.stop();
  }
});

test("desk /api/pat accepts a brand picker", async () => {
  const ctx = setup();
  const [port, oauthPort] = await freePorts(2);
  const env = { ...ctx.env, SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_OAUTH_PORT: String(oauthPort) };
  const desk = createDeskServer({ engine: ctx.engine, env, port });
  try {
    const { url } = await desk.start({ open: false });
    const res = await fetch(`${url}api/pat`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: url.replace(/\/$/, "") },
      body: JSON.stringify({ name: "desk", scopes: ["posts:read"], brands: ["skillsprout"] }),
    });
    const data = await res.json();
    assert.equal(res.status, 201, JSON.stringify(data.message || data));
    assert.deepEqual(data.pat.brands, ["skillsprout"]);
  } finally {
    await desk.stop();
    ctx.stop();
  }
});
