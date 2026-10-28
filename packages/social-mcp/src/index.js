import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEngine } from "./engine.js";
import { createDeskServer } from "./desk/server.js";
import { createSocialMcpServer } from "./mcp/server.js";

export async function startStdioServer(options = {}) {
  const { server, engine } = createSocialMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, engine };
}

export { createEngine, createDeskServer, createSocialMcpServer };
