import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { paths } from "./home.js";

const OAUTH_KEYS = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "META_APP_ID",
  "META_APP_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "SOCIAL_MCP_OAUTH_PORT",
];

export function oauthEnvPath(homePaths = paths()) {
  return homePaths.oauthEnv || `${homePaths.root}/oauth.env`;
}

export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadOAuthEnvFile(homePaths = paths(), env = process.env) {
  const file = oauthEnvPath(homePaths);
  if (!existsSync(file)) return { file, values: {}, applied: [] };
  const values = parseEnvFile(readFileSync(file, "utf8"));
  const applied = [];
  for (const key of OAUTH_KEYS) {
    if (!values[key]) continue;
    if (!String(env[key] || "").trim()) {
      env[key] = values[key];
      applied.push(key);
    }
  }
  return { file, values, applied };
}

export function saveOAuthEnvFile(input, homePaths = paths()) {
  const current = existsSync(oauthEnvPath(homePaths))
    ? parseEnvFile(readFileSync(oauthEnvPath(homePaths), "utf8"))
    : {};
  const next = { ...current };
  for (const key of OAUTH_KEYS) {
    if (input[key] === undefined) continue;
    const value = String(input[key] || "").trim();
    if (value) next[key] = value;
    else delete next[key];
  }
  const lines = [
    "# PostPath OAuth apps — local only. Do not commit.",
    "# Redirect URI for every provider:",
    "# http://127.0.0.1:47831/oauth/callback",
    "",
  ];
  for (const key of OAUTH_KEYS) {
    if (next[key]) lines.push(`${key}=${next[key]}`);
  }
  const file = oauthEnvPath(homePaths);
  writeFileSync(file, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows may ignore mode.
  }
  return { file, values: next };
}

export function publicOAuthConfig(values = {}) {
  const mask = (value) => {
    const text = String(value || "");
    if (!text) return "";
    if (text.length <= 8) return "••••••••";
    return `${text.slice(0, 4)}••••${text.slice(-4)}`;
  };
  return {
    GOOGLE_OAUTH_CLIENT_ID: values.GOOGLE_OAUTH_CLIENT_ID || "",
    GOOGLE_OAUTH_CLIENT_SECRET: values.GOOGLE_OAUTH_CLIENT_SECRET ? mask(values.GOOGLE_OAUTH_CLIENT_SECRET) : "",
    META_APP_ID: values.META_APP_ID || "",
    META_APP_SECRET: values.META_APP_SECRET ? mask(values.META_APP_SECRET) : "",
    TIKTOK_CLIENT_KEY: values.TIKTOK_CLIENT_KEY || "",
    TIKTOK_CLIENT_SECRET: values.TIKTOK_CLIENT_SECRET ? mask(values.TIKTOK_CLIENT_SECRET) : "",
    has_google: Boolean(values.GOOGLE_OAUTH_CLIENT_ID && values.GOOGLE_OAUTH_CLIENT_SECRET),
    has_meta: Boolean(values.META_APP_ID && values.META_APP_SECRET),
    has_tiktok: Boolean(values.TIKTOK_CLIENT_KEY && values.TIKTOK_CLIENT_SECRET),
  };
}

export { OAUTH_KEYS };
