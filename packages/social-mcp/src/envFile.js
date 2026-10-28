import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_OAUTH_PORT, paths } from "./home.js";
import { oauthRedirectHost } from "./oauth/redirect.js";

const OAUTH_KEYS = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "META_APP_ID",
  "META_APP_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "PINTEREST_APP_ID",
  "PINTEREST_APP_SECRET",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "SNAPCHAT_CLIENT_ID",
  "SNAPCHAT_CLIENT_SECRET",
  "SOCIAL_MCP_OAUTH_PORT",
  "SOCIAL_MCP_OAUTH_REDIRECT_HOST",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "REPLICATE_API_TOKEN",
  "FAL_KEY",
  "ANTHROPIC_API_KEY",
  "SOCIAL_MCP_MEDIA_PROVIDER",
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

const SECRET_KEYS = new Set([
  ...OAUTH_KEYS.filter((key) => key.endsWith("_SECRET") || key.endsWith("_API_KEY") || key.endsWith("_API_TOKEN") || key === "FAL_KEY"),
]);

export function mergeOAuthInput(current = {}, input = {}) {
  const next = { ...current };
  for (const key of OAUTH_KEYS) {
    if (input[key] === undefined) continue;
    const value = String(input[key] ?? "").trim();
    if (SECRET_KEYS.has(key) && (!value || value.includes("••••"))) continue;
    if (value) next[key] = value;
    else delete next[key];
  }
  if (input.GOOGLE_OAUTH_CLIENT_ID !== undefined && !String(input.GOOGLE_OAUTH_CLIENT_ID || "").trim()) {
    delete next.GOOGLE_OAUTH_CLIENT_ID;
    delete next.GOOGLE_OAUTH_CLIENT_SECRET;
  }
  if (input.META_APP_ID !== undefined && !String(input.META_APP_ID || "").trim()) {
    delete next.META_APP_ID;
    delete next.META_APP_SECRET;
  }
  return next;
}

export function saveOAuthEnvFile(input, homePaths = paths()) {
  const current = existsSync(oauthEnvPath(homePaths))
    ? parseEnvFile(readFileSync(oauthEnvPath(homePaths), "utf8"))
    : {};
  const next = mergeOAuthInput(current, input);
  const port = Number(process.env.SOCIAL_MCP_OAUTH_PORT || DEFAULT_OAUTH_PORT);
  const redirectHost = oauthRedirectHost(process.env);
  const lines = [
    "# PostPath OAuth apps — local only. Do not commit.",
    "# Google Desktop loopback stays on 127.0.0.1. SOCIAL_MCP_OAUTH_REDIRECT_HOST does not change it.",
    `# http://127.0.0.1:${port}`,
    "# Other providers. Meta rejects http://127.0.0.1 and accepts http://localhost.",
    "# SOCIAL_MCP_OAUTH_REDIRECT_HOST=localhost",
    `# http://${redirectHost}:${port}/oauth/callback`,
    "# Media generation keys stay in this file. They are not sent to 1stStep.",
    "# OPENAI_API_KEY= GEMINI_API_KEY= XAI_API_KEY= REPLICATE_API_TOKEN= FAL_KEY= ANTHROPIC_API_KEY=",
    "# Optional override when a Web client already uses the path form:",
    "# GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:47831/oauth/callback",
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

function mask(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 4) return "••••••••";
  return `••••${text.slice(-4)}`;
}

export function publicOAuthConfig(values = {}) {
  return {
    GOOGLE_OAUTH_CLIENT_ID: values.GOOGLE_OAUTH_CLIENT_ID || "",
    GOOGLE_OAUTH_CLIENT_SECRET: values.GOOGLE_OAUTH_CLIENT_SECRET ? mask(values.GOOGLE_OAUTH_CLIENT_SECRET) : "",
    META_APP_ID: values.META_APP_ID || "",
    META_APP_SECRET: values.META_APP_SECRET ? mask(values.META_APP_SECRET) : "",
    TIKTOK_CLIENT_KEY: values.TIKTOK_CLIENT_KEY || "",
    TIKTOK_CLIENT_SECRET: values.TIKTOK_CLIENT_SECRET ? mask(values.TIKTOK_CLIENT_SECRET) : "",
    LINKEDIN_CLIENT_ID: values.LINKEDIN_CLIENT_ID || "",
    LINKEDIN_CLIENT_SECRET: values.LINKEDIN_CLIENT_SECRET ? mask(values.LINKEDIN_CLIENT_SECRET) : "",
    X_CLIENT_ID: values.X_CLIENT_ID || "",
    X_CLIENT_SECRET: values.X_CLIENT_SECRET ? mask(values.X_CLIENT_SECRET) : "",
    PINTEREST_APP_ID: values.PINTEREST_APP_ID || "",
    PINTEREST_APP_SECRET: values.PINTEREST_APP_SECRET ? mask(values.PINTEREST_APP_SECRET) : "",
    REDDIT_CLIENT_ID: values.REDDIT_CLIENT_ID || "",
    REDDIT_CLIENT_SECRET: values.REDDIT_CLIENT_SECRET ? mask(values.REDDIT_CLIENT_SECRET) : "",
    SNAPCHAT_CLIENT_ID: values.SNAPCHAT_CLIENT_ID || "",
    SNAPCHAT_CLIENT_SECRET: values.SNAPCHAT_CLIENT_SECRET ? mask(values.SNAPCHAT_CLIENT_SECRET) : "",
    has_google: Boolean(values.GOOGLE_OAUTH_CLIENT_ID && values.GOOGLE_OAUTH_CLIENT_SECRET),
    has_meta: Boolean(values.META_APP_ID && values.META_APP_SECRET),
    has_tiktok: Boolean(values.TIKTOK_CLIENT_KEY && values.TIKTOK_CLIENT_SECRET),
    has_linkedin: Boolean(values.LINKEDIN_CLIENT_ID && values.LINKEDIN_CLIENT_SECRET),
    has_x: Boolean(values.X_CLIENT_ID && values.X_CLIENT_SECRET),
    has_pinterest: Boolean(values.PINTEREST_APP_ID && values.PINTEREST_APP_SECRET),
    has_reddit: Boolean(values.REDDIT_CLIENT_ID && values.REDDIT_CLIENT_SECRET),
    has_snapchat: Boolean(values.SNAPCHAT_CLIENT_ID && values.SNAPCHAT_CLIENT_SECRET),
    OPENAI_API_KEY: values.OPENAI_API_KEY ? mask(values.OPENAI_API_KEY) : "",
    GEMINI_API_KEY: values.GEMINI_API_KEY ? mask(values.GEMINI_API_KEY) : "",
    XAI_API_KEY: values.XAI_API_KEY ? mask(values.XAI_API_KEY) : "",
    REPLICATE_API_TOKEN: values.REPLICATE_API_TOKEN ? mask(values.REPLICATE_API_TOKEN) : "",
    FAL_KEY: values.FAL_KEY ? mask(values.FAL_KEY) : "",
    has_openai: Boolean(values.OPENAI_API_KEY),
    has_google_media: Boolean(values.GEMINI_API_KEY),
    has_xai: Boolean(values.XAI_API_KEY),
    has_replicate: Boolean(values.REPLICATE_API_TOKEN),
    has_fal: Boolean(values.FAL_KEY),
    ANTHROPIC_API_KEY: values.ANTHROPIC_API_KEY ? mask(values.ANTHROPIC_API_KEY) : "",
    has_anthropic: Boolean(values.ANTHROPIC_API_KEY),
  };
}

export { OAUTH_KEYS };
