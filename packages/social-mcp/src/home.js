import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONNECT_ORDER, PLATFORM_LABELS, PLATFORMS } from "./platforms.js";

export { CONNECT_ORDER, PLATFORM_LABELS, PLATFORMS };
export const DEFAULT_OAUTH_PORT = 47831;
export const DEFAULT_DESK_PORT = 47830;

export function resolveHome(env = process.env) {
  const override = String(env.SOCIAL_MCP_HOME || "").trim();
  if (override) return override;
  return join(homedir(), ".social-mcp");
}

export function ensureHome(home = resolveHome()) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  mkdirSync(join(home, "media"), { recursive: true, mode: 0o700 });
  try {
    chmodSync(home, 0o700);
  } catch {
    // Best effort on platforms that ignore mode.
  }
  return home;
}

export function paths(home = resolveHome()) {
  const root = ensureHome(home);
  return {
    root,
    keyFile: join(root, "master.key"),
    dbFile: join(root, "db.json"),
    mediaDir: join(root, "media"),
    oauthEnv: join(root, "oauth.env"),
    envExample: join(root, "oauth.env.example"),
  };
}

export function homeExists(home = resolveHome()) {
  return existsSync(home);
}
