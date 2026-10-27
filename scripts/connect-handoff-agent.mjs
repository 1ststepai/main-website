import { readFileSync } from "node:fs";
import { connectPlatform } from "../lib/admin/handoffConnections.js";

function readEnvFile(file) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    const error = new Error("The env file could not be read");
    error.code = "env_file_unreadable";
    throw error;
  }
  const parsed = {};
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const platform = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";
const env = { ...process.env };
const envFile = argValue("--env-file");

try {
  if (!platform) {
    console.log(JSON.stringify({
      ok: false,
      status: "setup_needed",
      message: "Usage: node scripts/connect-handoff-agent.mjs <platform> [--env-file path]",
      next_step: "Pass studio-read, codex, dot, cursor, or a grok role id.",
    }));
    process.exitCode = 1;
  } else {
    if (envFile) {
      const loaded = readEnvFile(envFile);
      for (const [key, value] of Object.entries(loaded)) {
        if (!env[key]) env[key] = value;
      }
    }
    const connection = await connectPlatform({ platformId: platform, env, context: "local" });
    console.log(JSON.stringify({ ok: connection.verified, ...connection }));
    if (!connection.verified) process.exitCode = 2;
  }
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    status: "disconnected",
    message: "Connection setup stopped before it could verify.",
    code: error.code || "setup_failed",
  }));
  process.exitCode = 2;
}
