import { DEFAULT_OAUTH_PORT } from "../home.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function oauthRedirectHost(env = process.env) {
  const raw = String(env.SOCIAL_MCP_OAUTH_REDIRECT_HOST ?? "127.0.0.1").trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(raw)) return raw;
  return "127.0.0.1";
}

export function providerRedirectUri(env = process.env, port = Number(env.SOCIAL_MCP_OAUTH_PORT || DEFAULT_OAUTH_PORT)) {
  return `http://${oauthRedirectHost(env)}:${port}/oauth/callback`;
}

export function googleLoopbackUri(env = process.env, port = Number(env.SOCIAL_MCP_OAUTH_PORT || DEFAULT_OAUTH_PORT)) {
  const configured = String(env.GOOGLE_OAUTH_REDIRECT_URI || "").trim();
  if (configured) return configured;
  return `http://127.0.0.1:${port}`;
}
