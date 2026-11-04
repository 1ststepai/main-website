import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { initPilot } from "../src/cli.js";
import { createSocialMcpServer } from "../src/mcp/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { freePort, freePorts } from "./helpers/ports.js";

test("pilot desk keeps SEO and Opening routes behind the owner PIN and never returns the owner snapshot", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-pilot-seo-"));
  const [port, oauthPort] = await freePorts(2);
  const env = { SOCIAL_MCP_PILOT_MODE: "1", ANTHROPIC_API_KEY: "", SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_OAUTH_PORT: String(oauthPort) };
  initPilot({ home, pin: "246810", env });
  const engine = createEngine({ home, env });
  const desk = createDeskServer({ engine, env, port });
  try {
    const { url } = await desk.start({ open: false });
    for (const [method, route, body] of [
      ["GET", "api/seo", undefined],
      ["POST", "api/seo/keywords", { profile_id: "broker", primary: ["open enrollment"] }],
      ["POST", "api/seo/search/connect", { profile_id: "broker" }],
      ["POST", "api/hook/voice", { profile_id: "broker", tone: "calm" }],
    ]) {
      const res = await fetch(`${url}${route}`, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
      assert.equal(res.status, 401, route);
    }
    const owner = await fetch(`${url}api/seo/keywords`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-postpath-owner-pin": "246810" },
      body: JSON.stringify({ profile_id: "broker", primary: ["open enrollment"] }),
    }).then((res) => res.json());
    assert.equal(owner.ok, true);
    assert.equal("pats" in owner, false);
    assert.equal("oauth" in owner, false);
    assert.equal("mcp_config" in owner, false);
  } finally {
    await desk.stop?.();
    rmSync(home, { recursive: true, force: true });
  }
});

test("draft-only MCP cannot start the search-data sign-in", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-pilot-seo-mcp-"));
  const env = { SOCIAL_MCP_PILOT_MODE: "1", SOCIAL_MCP_DRAFT_ONLY: "1", ANTHROPIC_API_KEY: "", SOCIAL_MCP_OAUTH_PORT: "0" };
  initPilot({ home, pin: "246810", env });
  const engine = createEngine({ home, env });
  const { server } = createSocialMcpServer({ engine, env });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const res = await client.callTool({ name: "connect_search_data", arguments: { profile_id: "broker" } });
    assert.equal(res.isError, true);
    assert.match(JSON.stringify(res.content), /accounts:write/);
    const newBrand = await client.callTool({ name: "save_keyword_profile", arguments: { profile_id: "new-brand", primary: ["x"] } });
    assert.equal(newBrand.isError, true);
    assert.match(JSON.stringify(newBrand.content), /accounts:write/);
    const renamed = await client.callTool({ name: "save_keyword_profile", arguments: { profile_id: "broker", name: "Renamed" } });
    assert.equal(renamed.isError, true);
    const saved = await client.callTool({ name: "save_keyword_profile", arguments: { profile_id: "broker", primary: ["open enrollment"] } });
    assert.notEqual(saved.isError, true, JSON.stringify(saved.content).slice(0, 300));
    const draft = await client.callTool({ name: "seo_draft", arguments: { profile_id: "broker", topic: "open enrollment checklist" } });
    assert.notEqual(draft.isError, true, JSON.stringify(draft.content).slice(0, 300));
  } finally {
    await client.close();
    rmSync(home, { recursive: true, force: true });
  }
});
