import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { mcpError } from "./errors.js";
import { MCP_SERVER_KEY } from "./brand.js";

const SERVER_KEY = MCP_SERVER_KEY;

export function defaultCursorMcpPath(env = process.env) {
  const override = String(env.CURSOR_MCP_CONFIG || "").trim();
  if (override) return override;
  return join(homedir(), ".cursor", "mcp.json");
}

export function socialMcpBinPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "bin", "social-mcp.js");
}

export const PILOT_CURSOR_ENV = {
  SOCIAL_MCP_PILOT_MODE: "1",
  SOCIAL_MCP_DRAFT_ONLY: "1",
  SOCIAL_MCP_PUBLISH_MODE: "mock",
};

export function buildSocialMcpServerEntry({ command = process.execPath, args, env = {}, pilot = false, home } = {}) {
  const merged = pilot ? { ...PILOT_CURSOR_ENV, ...env } : { ...env };
  const homeDir = String(home || "").trim();
  if (homeDir) merged.SOCIAL_MCP_HOME = resolvePath(homeDir);
  const entry = {
    command,
    args: args || [socialMcpBinPath()],
  };
  if (Object.keys(merged).length) entry.env = merged;
  return entry;
}

export function publicMcpClientConfig(entry = buildSocialMcpServerEntry()) {
  return {
    mcpServers: {
      [SERVER_KEY]: {
        command: entry.command,
        args: [...(entry.args || [])],
      },
    },
  };
}

export function mergeCursorMcpConfig(existing, entry) {
  const base =
    existing && typeof existing === "object"
      ? existing
      : { mcpServers: {} };
  const servers =
    base.mcpServers && typeof base.mcpServers === "object" ? { ...base.mcpServers } : {};
  servers[SERVER_KEY] = entry;
  return {
    ...base,
    mcpServers: servers,
  };
}

export function installCursorMcp({
  configPath = defaultCursorMcpPath(),
  entry = buildSocialMcpServerEntry(),
} = {}) {
  let existing = null;
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      throw mcpError("cursor_config_invalid", `Could not parse ${configPath}. Fix or remove it, then retry.`);
    }
  }
  const next = mergeCursorMcpConfig(existing, entry);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8" });
  return {
    configPath,
    serverKey: SERVER_KEY,
    entry: next.mcpServers[SERVER_KEY],
  };
}

export function readCursorMcpStatus(configPath = defaultCursorMcpPath()) {
  if (!existsSync(configPath)) {
    return { configPath, installed: false, server: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    const server = parsed?.mcpServers?.[SERVER_KEY] || null;
    return { configPath, installed: Boolean(server), server };
  } catch {
    return { configPath, installed: false, server: null, error: "invalid_json" };
  }
}
