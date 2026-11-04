import { rmSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSocialMcpServer } from "../../src/mcp/server.js";
import { createDeskServer } from "../../src/desk/server.js";

// Desk start/stop + temp-home cleanup shared by the feature test suites.
export function deskLifecycle({ engine, env, port, home }) {
  let desk;
  return {
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

// In-memory MCP client wired to a PostPath server, returning parsed tool results.
export async function mcpFor(engine, env, auth) {
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
