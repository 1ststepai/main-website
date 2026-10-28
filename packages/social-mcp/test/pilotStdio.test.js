import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { initPilot } from "../src/cli.js";

const bin = fileURLToPath(new URL("../bin/social-mcp.js", import.meta.url));
const root = fileURLToPath(new URL("..", import.meta.url));

async function connect(home, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bin],
    cwd: root,
    env: { ...process.env, SOCIAL_MCP_HOME: home, ANTHROPIC_API_KEY: "", ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "pilot-stdio", version: "0.0.0" });
  await client.connect(transport);
  return {
    client,
    async close() {
      await client.close();
    },
  };
}

async function tool(client, name, args) {
  return client.callTool({ name, arguments: args });
}

function isRefused(result) {
  return result.isError === true;
}

test("a pilot home refuses approve and publish over stdio and still drafts", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-stdio-"));
  try {
    initPilot({ home, pin: "246810" });
    const session = await connect(home, {});
    try {
      const draft = await tool(session.client, "create_draft", {
        profile_id: "broker",
        platforms: ["facebook", "linkedin"],
        caption: "Bring the plan summary to the conversation.",
      });
      assert.equal(draft.isError, undefined);
      const text = draft.content?.[0]?.text || "";
      assert.match(text, /"ok": true/);
      const profile = await tool(session.client, "upsert_profile", { id: "other", name: "Other" });
      assert.equal(isRefused(profile), true);
      assert.match(JSON.stringify(profile), /accounts:write/);
      const connectAccounts = await tool(session.client, "connect_accounts", { profile_id: "broker" });
      assert.equal(isRefused(connectAccounts), true);
      assert.match(JSON.stringify(connectAccounts), /accounts:write/);
      const publish = await tool(session.client, "publish_post", { post_id: "post_missing1" });
      assert.equal(isRefused(publish), true);
      assert.match(JSON.stringify(publish), /queue:approve/);
      const approval = await tool(session.client, "request_approval", { post_id: "post_missing1" });
      assert.equal(isRefused(approval), true);
      assert.match(JSON.stringify(approval), /queue:approve/);
      const due = await tool(session.client, "publish_due", {});
      assert.equal(isRefused(due), true);
      assert.match(JSON.stringify(due), /queue:approve/);
    } finally {
      await session.close();
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
