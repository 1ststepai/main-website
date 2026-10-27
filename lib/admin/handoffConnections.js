import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { bridgeOrigin, callBridgeTool, loadBridgeSnapshot } from "./agentHandoffBridge.js";
import { CONNECTIONS, connectionById } from "./handoffConnectionCatalog.js";

function result(entry, status, fields) {
  return {
    id: entry.id,
    label: entry.label,
    product: entry.product,
    status,
    verified: status === "connected_verified",
    credential_configured: false,
    credential_accepted: false,
    product_configured: false,
    message: "",
    next_step: "",
    ...fields,
  };
}

function tokenFrom(entry, env, context) {
  const names = context === "server"
    ? [entry.tokenEnv]
    : [entry.localTokenEnv, entry.tokenEnv];
  for (const name of names) {
    if (!name) continue;
    const value = String(env[name] || "");
    if (value.length >= 32) return value;
  }
  return "";
}

export function commandOnPath(name, env = process.env) {
  const paths = String(env.PATH || "").split(":");
  return paths.some((directory) => {
    try {
      accessSync(`${directory}/${name}`, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function runProcess(bin, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Object.assign(new Error("Command timed out"), { code: "command_timeout" }));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 100_000) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 20_000) child.kill();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function probeCredential(origin, token, fetchImpl) {
  await callBridgeTool({
    origin,
    token,
    name: "list_tasks",
    args: { limit: 1 },
    fetchImpl,
  });
}

async function configureCli(entry, { origin, tokenEnv, runCommand, commandExists }) {
  if (!commandExists(entry.cli)) {
    return { configured: false, reason: `${entry.cli} is not installed here, so the app connection was not changed.` };
  }
  const help = await runCommand(entry.cli, ["mcp", "--help"]);
  const helpText = `${help.stdout}\n${help.stderr}`.toLowerCase();
  const mcpUrl = new URL("/mcp", origin).toString();
  if (entry.cli === "codex") {
    if (!helpText.includes("bearer-token-env-var") && !helpText.includes("bearer_token_env_var")) {
      return { configured: false, reason: "The Codex CLI does not advertise bearer-token environment setup, so no Codex config command was run." };
    }
    const added = await runCommand(entry.cli, [
      "mcp", "add", entry.serverName, "--url", mcpUrl, "--bearer-token-env-var", tokenEnv,
    ]);
    if (added.code !== 0) return { configured: false, reason: "Codex did not accept the MCP configuration command." };
    const shown = await runCommand(entry.cli, ["mcp", "get", entry.serverName]);
    const shownText = `${shown.stdout}\n${shown.stderr}`;
    if (shown.code !== 0 || !shownText.includes(entry.serverName)) {
      return { configured: false, reason: "Codex did not show the saved MCP server after setup." };
    }
    return { configured: true, reason: "Codex reports the MCP server, and the token stayed in the environment variable." };
  }
  if (entry.cli === "grok") {
    if (!helpText.includes("--header") || !helpText.includes("doctor")) {
      return { configured: false, reason: "The Grok CLI does not advertise header setup and doctor, so no Grok config command was run." };
    }
    const added = await runCommand(entry.cli, [
      "mcp", "add", "--transport", "http", entry.serverName, mcpUrl,
      "--header", `Authorization: Bearer \${${tokenEnv}}`,
    ]);
    if (added.code !== 0) return { configured: false, reason: "Grok did not accept the MCP configuration command." };
    const doctor = await runCommand(entry.cli, ["mcp", "doctor", entry.serverName, "--json"]);
    if (doctor.code !== 0) return { configured: false, reason: "Grok doctor did not confirm the connector." };
    return { configured: true, reason: "Grok doctor succeeded. The header uses an environment variable, not a pasted token." };
  }
  return { configured: false, reason: "No supported local command exists for this product." };
}

export async function connectPlatform({
  platformId,
  env = process.env,
  fetchImpl = fetch,
  context = "local",
  commandExists = (name) => commandOnPath(name, env),
  runCommand = (bin, args) => runProcess(bin, args, env),
} = {}) {
  const entry = connectionById(platformId);
  if (!entry) {
    return {
      id: platformId || "",
      label: "Unknown",
      product: "Unknown",
      status: "blocked",
      verified: false,
      credential_configured: false,
      credential_accepted: false,
      product_configured: false,
      message: "That product is not a supported bridge connection.",
      next_step: "Choose Studio read, Codex, OpenAI Dot, Cursor, or a Grok role.",
    };
  }
  if (entry.mode === "blocked") {
    return result(entry, "blocked", {
      message: entry.reason,
      next_step: entry.nextStep,
    });
  }

  let origin = null;
  try {
    origin = bridgeOrigin(env.AGENT_HANDOFF_BRIDGE_URL, {
      allowLocalDefault: context === "local",
      port: env.BRIDGE_PORT || "8787",
    });
  } catch {
    return result(entry, "setup_needed", {
      message: "The bridge URL is not usable.",
      next_step: "Set AGENT_HANDOFF_BRIDGE_URL to an https origin, or http://127.0.0.1 for a local bridge.",
    });
  }
  if (!origin) {
    return result(entry, "setup_needed", {
      message: "No bridge URL is configured.",
      next_step: "Set AGENT_HANDOFF_BRIDGE_URL on the Studio server. Do not put a token in the URL.",
    });
  }

  const token = tokenFrom(entry, env, context);
  if (!token) {
    const variable = context === "server" ? entry.tokenEnv : entry.localTokenEnv;
    return result(entry, "setup_needed", {
      message: "The bridge URL is set. The credential for this connection is not.",
      next_step: `Set ${variable} in the server or agent environment, then verify again. Do not paste it into chat or Studio.`,
    });
  }

  try {
    await probeCredential(origin, token, fetchImpl);
  } catch (error) {
    const rejected = error?.code === "bridge_unauthorized";
    return result(entry, "disconnected", {
      credential_configured: true,
      message: rejected
        ? "The bridge rejected this credential during this check."
        : "The bridge did not answer a read-only task list during this check.",
      next_step: rejected
        ? "Rotate the credential on the bridge host and verify again. Do not paste the new value into chat."
        : "Start the bridge and verify again. A saved variable is not a working connection.",
    });
  }

  if (entry.mode === "server" || context === "server") {
    return result(entry, entry.mode === "server" ? "connected_verified" : "setup_needed", {
      credential_configured: true,
      credential_accepted: true,
      product_configured: entry.mode === "server",
      message: entry.mode === "server"
        ? "Studio completed a read-only bridge call with this credential during this check."
        : "The bridge accepted this credential from Studio. The product app was not configured from this server.",
      next_step: entry.mode === "server"
        ? "Use the handoff view. This check does not deploy or approve work."
        : `On the bridge host, run node scripts/connect-handoff-agent.mjs ${entry.id}`,
    });
  }

  let configured;
  try {
    configured = await configureCli(entry, {
      origin,
      tokenEnv: entry.localTokenEnv,
      runCommand,
      commandExists,
    });
  } catch {
    configured = { configured: false, reason: "The local setup command failed before it could confirm the product." };
  }
  if (!configured.configured) {
    return result(entry, "setup_needed", {
      credential_configured: true,
      credential_accepted: true,
      message: `The bridge accepted the credential. ${configured.reason}`,
      next_step: configured.reason,
    });
  }
  return result(entry, "connected_verified", {
    credential_configured: true,
    credential_accepted: true,
    product_configured: true,
    message: configured.reason,
    next_step: "Ask the agent to read the latest handoff before continuing. This check does not approve a deploy.",
  });
}

export function describeServerConnections({ snapshot, env = process.env } = {}) {
  return CONNECTIONS.map((entry) => {
    if (entry.mode === "blocked") {
      return result(entry, "blocked", {
        message: entry.reason,
        next_step: entry.nextStep,
      });
    }
    if (entry.id === "studio-read") {
      if (snapshot?.state === "connected") {
        return result(entry, "connected_verified", {
          credential_configured: true,
          credential_accepted: true,
          product_configured: true,
          message: "Studio completed a read-only bridge call during this request.",
          next_step: "Use the handoff view. This check does not deploy or approve work.",
        });
      }
      if (snapshot?.state === "health_only") {
        return result(entry, "setup_needed", {
          message: "The bridge answered /health. Tasks were not read.",
          next_step: "Set AGENT_HANDOFF_BRIDGE_READ_TOKEN on the server, then run Verify. Health alone is not a verified read.",
        });
      }
      if (snapshot?.state === "not_configured") {
        return result(entry, "setup_needed", {
          message: "No bridge URL is configured.",
          next_step: "Set AGENT_HANDOFF_BRIDGE_URL on the Studio server. Do not put a token in the URL.",
        });
      }
      return result(entry, "disconnected", {
        credential_configured: String(env.AGENT_HANDOFF_BRIDGE_READ_TOKEN || "").length >= 32,
        message: snapshot?.message || "The bridge did not respond. No tasks were assumed.",
        next_step: "Start the bridge, or correct AGENT_HANDOFF_BRIDGE_URL, then run Verify.",
      });
    }
    const configured = String(env[entry.tokenEnv] || "").length >= 32;
    return result(entry, "setup_needed", {
      credential_configured: configured,
      message: configured
        ? "A credential is stored for this product. Run Verify before treating it as connected."
        : "This product is not connected from Studio.",
      next_step: `On the bridge host, run node scripts/connect-handoff-agent.mjs ${entry.id}`,
    });
  });
}

export async function studioBridgeView({ env = process.env, fetchImpl = fetch } = {}) {
  const snapshot = await loadBridgeSnapshot({
    url: env.AGENT_HANDOFF_BRIDGE_URL,
    token: env.AGENT_HANDOFF_BRIDGE_READ_TOKEN,
    fetchImpl,
  });
  return snapshot;
}
