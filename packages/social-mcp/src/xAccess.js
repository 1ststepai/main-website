// X is bring-your-own-app only. It stays hidden and refused on every desk until
// that desk's own oauth.env holds an X Client ID and Secret entered by its user.
// Process env, build files, and any shared or built-in credentials are ignored on
// purpose: PostPath never ships, shares, or falls back to someone else's X app.
import { existsSync, readFileSync } from "node:fs";
import { parseEnvFile } from "./envFile.js";
import { mcpError } from "./errors.js";

export const X_UNAVAILABLE_MESSAGE =
  "X isn't available on this desk. Add your own X developer app (Client ID and Secret) under App credentials → Use your own X developer app.";

export function ownXCredentials(homePaths) {
  const file = homePaths?.oauthEnv;
  if (!file || !existsSync(file)) return { clientId: "", clientSecret: "" };
  try {
    const values = parseEnvFile(readFileSync(file, "utf8"));
    return {
      clientId: String(values.X_CLIENT_ID || "").trim(),
      clientSecret: String(values.X_CLIENT_SECRET || "").trim(),
    };
  } catch {
    return { clientId: "", clientSecret: "" };
  }
}

export function xAvailable(homePaths) {
  const own = ownXCredentials(homePaths);
  return Boolean(own.clientId && own.clientSecret);
}

export function assertXAvailable(homePaths) {
  if (!xAvailable(homePaths)) throw mcpError("x_unavailable", X_UNAVAILABLE_MESSAGE, 403);
}

// Replace config.x with this desk's own credentials only (never env or defaults).
export function withOwnX(config, homePaths) {
  if (!config) return config;
  const own = ownXCredentials(homePaths);
  return { ...config, x: { ...(config.x || {}), clientId: own.clientId, clientSecret: own.clientSecret } };
}

export function isXPlatform(value) {
  return String(value || "").trim().toLowerCase() === "x";
}
