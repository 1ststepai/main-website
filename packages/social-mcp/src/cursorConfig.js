import { MCP_SERVER_KEY } from "./brand.js";
import { buildSocialMcpServerEntry } from "./clientConfigs.js";

export {
  buildSocialMcpServerEntry,
  defaultCursorMcpPath,
  installClient,
  installCursorMcp,
  listClientStatus,
  mergeCursorMcpConfig,
  readCursorMcpStatus,
  socialMcpBinPath,
} from "./clientConfigs.js";

export function publicMcpClientConfig(entry = buildSocialMcpServerEntry()) {
  return {
    mcpServers: {
      [MCP_SERVER_KEY]: {
        command: entry.command,
        args: [...(entry.args || [])],
      },
    },
  };
}
