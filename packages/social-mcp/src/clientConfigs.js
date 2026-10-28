import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_SERVER_KEY } from "./brand.js";
import { mcpError } from "./errors.js";

const SERVER_KEY = MCP_SERVER_KEY;

function joinFor(platform, ...parts) {
  const sep = platform === "win32" ? "\\" : "/";
  let result = "";
  for (const part of parts) {
    if (part == null || part === "") continue;
    const text = String(part).replace(/[\\/]+$/, "");
    if (!result) {
      result = text;
      continue;
    }
    const rest = text.replace(/^[\\/]+/, "");
    if (!rest) continue;
    result = `${result}${sep}${rest.split(/[\\/]+/).join(sep)}`;
  }
  return result;
}

function runtimeContext(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home =
    options.home ||
    (platform === "win32" ? env.USERPROFILE || env.HOME || homedir() : env.HOME || homedir());
  return { platform, env, home };
}

function roamingAppData(ctx) {
  if (ctx.env.APPDATA) return ctx.env.APPDATA;
  return joinFor(ctx.platform, ctx.home, "AppData", "Roaming");
}

function xdgConfig(ctx) {
  return ctx.env.XDG_CONFIG_HOME || joinFor(ctx.platform, ctx.home, ".config");
}

export function socialMcpBinPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "bin", "social-mcp.js");
}

export function buildSocialMcpServerEntry({ command = process.execPath, args, env = {} } = {}) {
  return {
    command,
    args: args || [socialMcpBinPath()],
    env: { ...env },
  };
}

function entryEnv(entry) {
  if (!entry?.env || typeof entry.env !== "object") return null;
  const names = Object.keys(entry.env).filter((name) => entry.env[name] != null && entry.env[name] !== "");
  if (!names.length) return null;
  const env = {};
  for (const name of names) env[name] = String(entry.env[name]);
  return env;
}

function baseEntry(entry) {
  const env = entryEnv(entry);
  return {
    command: String(entry.command || ""),
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    ...(env ? { env } : {}),
  };
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tomlKey(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : tomlString(name);
}

function tomlBlock(entry) {
  const body = baseEntry(entry);
  const lines = [`[mcp_servers.${SERVER_KEY}]`, `command = ${tomlString(body.command)}`];
  if (body.args.length) lines.push(`args = [${body.args.map(tomlString).join(", ")}]`);
  if (body.env) {
    lines.push("", `[mcp_servers.${SERVER_KEY}.env]`);
    for (const name of Object.keys(body.env).sort()) {
      lines.push(`${tomlKey(name)} = ${tomlString(body.env[name])}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function stripTomlServer(text) {
  const lines = text.split("\n");
  const out = [];
  let skipping = false;
  const header = new RegExp(
    `^\\s*\\[mcp_servers\\.(?:"${SERVER_KEY}"|${SERVER_KEY})(?:\\.[^\\]]+)?\\]\\s*(?:#.*)?$`,
  );
  const inline = new RegExp(`^\\s*mcp_servers\\.(?:"${SERVER_KEY}"|${SERVER_KEY})\\.`);
  for (const line of lines) {
    if (header.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^\s*\[/.test(line)) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    if (inline.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "");
}

function mergeToml(existing, entry) {
  const stripped = existing ? stripTomlServer(existing) : "";
  const block = tomlBlock(entry).replace(/\s+$/, "");
  const next = stripped ? `${stripped}\n\n${block}\n` : `${block}\n`;
  return next;
}

function jsonEntry(client, entry) {
  const body = baseEntry(entry);
  if (client.jsonShape === "vscode" || client.jsonShape === "claude-code" || client.jsonShape === "cursor") {
    return { type: "stdio", ...body };
  }
  if (client.jsonShape === "cline") {
    return { ...body, disabled: false, autoApprove: [] };
  }
  return body;
}

function mergeJson(existing, client, entry) {
  if (existing == null || typeof existing !== "object" || Array.isArray(existing)) {
    throw mcpError("config_invalid", "The settings file is not a JSON object. PostPath left it unchanged.");
  }
  const key = client.jsonKey;
  const current = existing[key];
  if (current != null && (typeof current !== "object" || Array.isArray(current))) {
    throw mcpError(
      "config_unsafe",
      `The ${key} section is not a list of named servers. PostPath left the file unchanged.`,
    );
  }
  const servers = { ...(current || {}) };
  servers[SERVER_KEY] = jsonEntry(client, entry);
  return { ...existing, [key]: servers };
}

function jsonSnippet(client, entry) {
  const servers = { [SERVER_KEY]: jsonEntry(client, entry) };
  return `${JSON.stringify({ [client.jsonKey]: servers }, null, 2)}\n`;
}

function continueSnippet(entry) {
  const body = baseEntry(entry);
  const args = body.args.map((arg) => `      - ${tomlString(arg)}`).join("\n");
  return `mcpServers:\n  - name: ${SERVER_KEY}\n    command: ${tomlString(body.command)}\n    args:\n${args || "      []"}\n`;
}

function otherSnippet(entry) {
  return jsonSnippet({ jsonKey: "mcpServers", jsonShape: "mcp" }, entry);
}

const CLIENTS = [
  {
    id: "cursor",
    label: "Cursor",
    group: "local",
    mode: "write",
    jsonKey: "mcpServers",
    jsonShape: "cursor",
    restart: "Quit Cursor completely, then open it again.",
    statusReady: "Set up — restart Cursor",
    detail: "Adds PostPath to Cursor's MCP settings on this computer. Other servers in that file stay put.",
    path(ctx) {
      const override = String(ctx.env.CURSOR_MCP_CONFIG || "").trim();
      if (override) return override;
      return joinFor(ctx.platform, ctx.home, ".cursor", "mcp.json");
    },
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    group: "local",
    mode: "write",
    jsonKey: "mcpServers",
    jsonShape: "mcp",
    restart: "Quit Claude completely, then open it again.",
    statusReady: "Set up — restart Claude",
    detail: "Adds PostPath to Claude Desktop's local MCP file. Then quit Claude and open it again.",
    path(ctx) {
      if (ctx.platform === "win32") return joinFor(ctx.platform, roamingAppData(ctx), "Claude", "claude_desktop_config.json");
      if (ctx.platform === "darwin") {
        return joinFor(ctx.platform, ctx.home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
      }
      return joinFor(ctx.platform, xdgConfig(ctx), "Claude", "claude_desktop_config.json");
    },
  },
  {
    id: "claude-code",
    label: "Claude Code",
    group: "local",
    mode: "write",
    jsonKey: "mcpServers",
    jsonShape: "claude-code",
    restart: "Start a new Claude Code session. Run /mcp if it asks you to approve PostPath.",
    statusReady: "Set up — open a new session",
    detail:
      "Writes the user-wide server in ~/.claude.json, so every project can use it. A project .mcp.json is only for one folder, so this button does not write that file.",
    path(ctx) {
      const root = String(ctx.env.CLAUDE_CONFIG_DIR || "").trim() || ctx.home;
      return joinFor(ctx.platform, root, ".claude.json");
    },
  },
  {
    id: "vscode",
    label: "VS Code / Copilot",
    group: "local",
    mode: "write",
    jsonKey: "servers",
    jsonShape: "vscode",
    restart: "Reload VS Code. In Copilot Chat, start PostPath if you see a Start button.",
    statusReady: "Set up — reload VS Code",
    detail: "Writes the user mcp.json that VS Code and Copilot agent mode read. It uses the servers list, which is the VS Code shape.",
    path(ctx) {
      if (ctx.platform === "win32") return joinFor(ctx.platform, roamingAppData(ctx), "Code", "User", "mcp.json");
      if (ctx.platform === "darwin") {
        return joinFor(ctx.platform, ctx.home, "Library", "Application Support", "Code", "User", "mcp.json");
      }
      return joinFor(ctx.platform, xdgConfig(ctx), "Code", "User", "mcp.json");
    },
  },
  {
    id: "codex",
    label: "Codex",
    group: "local",
    mode: "write",
    format: "toml",
    restart: "Start a new Codex session.",
    statusReady: "Set up — open a new session",
    detail: "Adds a PostPath table to Codex's config.toml. The rest of that file is left as it was.",
    path(ctx) {
      const root = String(ctx.env.CODEX_HOME || "").trim() || joinFor(ctx.platform, ctx.home, ".codex");
      return joinFor(ctx.platform, root, "config.toml");
    },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    group: "local",
    mode: "write",
    jsonKey: "mcpServers",
    jsonShape: "mcp",
    restart: "In Windsurf, refresh MCP servers from the Cascade menu.",
    statusReady: "Set up — refresh Windsurf",
    detail:
      "Writes the Cascade file at ~/.config/devin/mcp_config.json (on Windows, %APPDATA%\\devin\\mcp_config.json). Older builds also mention ~/.codeium/windsurf/mcp_config.json. This button does not write that older file. If Windsurf opens a different file, paste the snippet there.",
    path(ctx) {
      if (ctx.platform === "win32") return joinFor(ctx.platform, roamingAppData(ctx), "devin", "mcp_config.json");
      return joinFor(ctx.platform, xdgConfig(ctx), "devin", "mcp_config.json");
    },
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    group: "local",
    mode: "write",
    jsonKey: "mcpServers",
    jsonShape: "mcp",
    restart: "Start a new Gemini CLI session.",
    statusReady: "Set up — open a new session",
    detail: "Adds PostPath to Gemini CLI's user settings. The Gemini website is separate and is not set up here.",
    path(ctx) {
      return joinFor(ctx.platform, ctx.home, ".gemini", "settings.json");
    },
  },
  {
    id: "grok-cli",
    label: "Grok terminal",
    group: "local",
    mode: "write",
    format: "toml",
    restart: "Start a new Grok session, or run grok mcp list.",
    statusReady: "Set up — open a new session",
    detail: "Writes the local Grok terminal config. Grok on the web and Grok Bot are listed further down. They cannot see this computer.",
    path(ctx) {
      const root = String(ctx.env.GROK_HOME || "").trim() || joinFor(ctx.platform, ctx.home, ".grok");
      return joinFor(ctx.platform, root, "config.toml");
    },
  },
  {
    id: "cline",
    label: "Cline",
    group: "local",
    mode: "write",
    jsonKey: "mcpServers",
    jsonShape: "cline",
    restart: "Open Cline's MCP Servers page and confirm PostPath is listed.",
    statusReady: "Set up — check Cline",
    detail: "Writes Cline's MCP settings file. Tools stay off auto-approve until you turn that on yourself.",
    path(ctx) {
      const override = String(ctx.env.CLINE_MCP_SETTINGS_PATH || "").trim();
      if (override) return override;
      return joinFor(ctx.platform, ctx.home, ".cline", "data", "settings", "cline_mcp_settings.json");
    },
  },
  {
    id: "zed",
    label: "Zed",
    group: "local",
    mode: "write",
    jsonKey: "context_servers",
    jsonShape: "mcp",
    restart: "Open Zed settings, then AI, then MCP Servers. Restart Zed if PostPath is missing.",
    statusReady: "Set up — restart Zed",
    detail:
      "Adds PostPath under context_servers in Zed's settings. If that file contains comments, PostPath leaves it alone and shows a snippet to paste.",
    path(ctx) {
      if (ctx.platform === "win32") return joinFor(ctx.platform, roamingAppData(ctx), "Zed", "settings.json");
      if (ctx.platform === "linux" || ctx.platform === "freebsd") {
        return joinFor(ctx.platform, xdgConfig(ctx), "zed", "settings.json");
      }
      return joinFor(ctx.platform, ctx.home, ".config", "zed", "settings.json");
    },
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    group: "local",
    mode: "write",
    jsonKey: "mcpServers",
    jsonShape: "mcp",
    restart: "In LM Studio, open Program, then Install, then Edit mcp.json.",
    statusReady: "Set up — check LM Studio",
    detail:
      "Writes the documented ~/.lmstudio/mcp.json file. If LM Studio opens a different file, paste the snippet into that one. Some Mac installs keep it in another folder.",
    path(ctx) {
      return joinFor(ctx.platform, ctx.home, ".lmstudio", "mcp.json");
    },
  },
  {
    id: "copilot-cli",
    label: "Copilot CLI",
    group: "local",
    mode: "write",
    jsonKey: "mcpServers",
    jsonShape: "mcp",
    restart: "Start a new Copilot CLI session.",
    statusReady: "Set up — open a new session",
    detail: "Writes the Copilot CLI user file. VS Code's Copilot chat uses the VS Code row above.",
    path(ctx) {
      const root = String(ctx.env.COPILOT_HOME || "").trim() || joinFor(ctx.platform, ctx.home, ".copilot");
      return joinFor(ctx.platform, root, "mcp-config.json");
    },
  },
  {
    id: "continue",
    label: "Continue",
    group: "paste",
    mode: "instructions",
    detail:
      "Continue reads YAML, or a JSON file inside one project's .continue/mcpServers folder. PostPath does not write those, so other tools and comments stay intact. Copy the snippet into the project you have open.",
    snippet(entry) {
      return continueSnippet(entry);
    },
  },
  {
    id: "other",
    label: "Another app on this computer",
    group: "paste",
    mode: "instructions",
    detail:
      "Many local apps accept this JSON. PostPath has not checked your app's file, so paste it into that app's MCP settings yourself.",
    snippet(entry) {
      return otherSnippet(entry);
    },
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    group: "cloud",
    mode: "instructions",
    detail:
      "ChatGPT custom connectors need a public https address. The MCP URL in this panel is on this computer (127.0.0.1 unless you set one yourself). PostPath does not open a tunnel. This desk has not confirmed that ChatGPT lists PostPath's tools.",
    snippet() {
      return [
        "ChatGPT is not connected from here.",
        "",
        "ChatGPT asks for a public https address.",
        "The MCP URL in Connect to your AI stays on 127.0.0.1 unless you set one yourself.",
        "PostPath will not open a tunnel or relay.",
        "This desk has not confirmed that ChatGPT lists PostPath's tools.",
        "",
        "Use an app from the On this computer list instead.",
      ].join("\n");
    },
  },
  {
    id: "grok-web",
    label: "Grok on the web / Grok Bot",
    group: "cloud",
    mode: "instructions",
    detail:
      "Grok on the web and Grok Bot need a public https address and reject 127.0.0.1. The MCP URL in this panel stays on this computer unless you set one yourself. PostPath does not open a tunnel. The Grok terminal row writes a local config. This desk has not confirmed that either Grok client lists PostPath's tools.",
    snippet() {
      return [
        "Grok on the web and Grok Bot are not connected from here.",
        "",
        "Those products require a public https address.",
        "They reject localhost and private addresses.",
        "The MCP URL in Connect to your AI stays on this computer unless you set one yourself.",
        "PostPath will not open a tunnel or relay.",
        "This desk has not confirmed that Grok on the web lists PostPath's tools.",
        "",
        "Use Grok terminal in the On this computer list if you use the Grok command line.",
      ].join("\n");
    },
  },
];

function getClient(id) {
  return CLIENTS.find((client) => client.id === id) || null;
}

export function clientConfigPath(id, options = {}) {
  const client = getClient(id);
  if (!client?.path) return "";
  return client.path(runtimeContext(options));
}

export function clientSnippet(id, entry = buildSocialMcpServerEntry()) {
  const client = getClient(id);
  if (!client) return "";
  if (client.mode === "instructions") return client.snippet(entry);
  if (client.format === "toml") return tomlBlock(entry);
  return jsonSnippet(client, entry);
}

function readText(configPath) {
  try {
    return readFileSync(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    const wrapped = mcpError("config_unreadable", `Could not read ${configPath}. PostPath left it unchanged.`);
    wrapped.configPath = configPath;
    throw wrapped;
  }
}

function tomlHasServer(text) {
  if (!text) return false;
  return new RegExp(`^\\s*\\[mcp_servers\\.(?:"${SERVER_KEY}"|${SERVER_KEY})(?:\\.[^\\]]+)?\\]\\s*(?:#.*)?$`, "m").test(
    text,
  );
}

function describeWrite(client, ctx, entry) {
  const configPath = client.path(ctx);
  const base = {
    id: client.id,
    label: client.label,
    group: client.group,
    mode: "write",
    installed: false,
    status: "missing",
    statusLabel: "Not set up yet",
    detail: client.detail,
    restart: client.restart,
    configPath,
    snippet: client.format === "toml" ? tomlBlock(entry) : jsonSnippet(client, entry),
    actionLabel: "Set up",
  };
  if (!existsSync(configPath)) return base;
  const text = readText(configPath);
  if (text == null) return base;
  if (client.format === "toml") {
    if (text.includes("\0")) {
      return { ...base, status: "invalid", statusLabel: "Settings file needs a look" };
    }
    return tomlHasServer(text)
      ? { ...base, installed: true, status: "ready", statusLabel: client.statusReady }
      : base;
  }
  try {
    const parsed = JSON.parse(text);
    const server = parsed?.[client.jsonKey]?.[SERVER_KEY];
    if (server && typeof server === "object") {
      return { ...base, installed: true, status: "ready", statusLabel: client.statusReady };
    }
    return base;
  } catch {
    return { ...base, status: "invalid", statusLabel: "Settings file needs a look" };
  }
}

function describeInstructions(client, entry) {
  return {
    id: client.id,
    label: client.label,
    group: client.group,
    mode: "instructions",
    installed: false,
    status: client.group === "cloud" ? "unavailable" : "instructions",
    statusLabel: client.group === "cloud" ? "Cannot connect from here" : "Instructions only",
    detail: client.detail,
    restart: "",
    configPath: "",
    snippet: client.snippet(entry),
    actionLabel: client.group === "cloud" ? "Why not" : "Copy steps",
  };
}

export function listClientStatus(options = {}) {
  const ctx = runtimeContext(options);
  const entry = options.entry || buildSocialMcpServerEntry();
  return CLIENTS.map((client) => {
    if (client.mode !== "write") return describeInstructions(client, entry);
    try {
      return describeWrite(client, ctx, entry);
    } catch {
      return {
        id: client.id,
        label: client.label,
        group: client.group,
        mode: "write",
        installed: false,
        status: "invalid",
        statusLabel: "Settings file needs a look",
        detail: client.detail,
        restart: client.restart,
        configPath: client.path(ctx),
        snippet: client.format === "toml" ? tomlBlock(entry) : jsonSnippet(client, entry),
        actionLabel: "Set up",
      };
    }
  });
}

export function readCursorMcpStatus(configPath, options = {}) {
  const ctx = runtimeContext(options);
  const path = configPath || CLIENTS[0].path(ctx);
  const row = describeWrite({ ...CLIENTS[0], path: () => path }, ctx, options.entry || buildSocialMcpServerEntry());
  let server = null;
  if (row.installed) {
    try {
      server = JSON.parse(readFileSync(path, "utf8"))?.mcpServers?.[SERVER_KEY] || null;
    } catch {
      server = null;
    }
  }
  return {
    configPath: path,
    installed: row.installed,
    server,
    ...(row.status === "invalid" ? { error: "invalid_json" } : {}),
  };
}

function backupFile(configPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let dest = `${configPath}.postpath-backup-${stamp}`;
  let n = 2;
  while (existsSync(dest)) {
    dest = `${configPath}.postpath-backup-${stamp}-${n}`;
    n += 1;
  }
  copyFileSync(configPath, dest);
  return dest;
}

function refuseUnsafe(configPath, message, entry, client) {
  const error = mcpError("config_unsafe", message, 409);
  error.configPath = configPath;
  error.snippet = client.format === "toml" ? tomlBlock(entry) : jsonSnippet(client, entry);
  throw error;
}

export function installClient(id, options = {}) {
  const client = getClient(id);
  const entry = options.entry || buildSocialMcpServerEntry();
  if (!client) {
    throw mcpError("unknown_client", "That assistant is not in the list.");
  }
  if (client.mode !== "write") {
    const error = mcpError("instructions_only", client.detail, 400);
    error.snippet = client.snippet(entry);
    throw error;
  }
  const ctx = runtimeContext(options);
  const configPath = options.configPath || client.path(ctx);
  const existingText = existsSync(configPath) ? readText(configPath) : null;
  let nextText = "";
  if (client.format === "toml") {
    if (existingText && existingText.includes("\0")) {
      refuseUnsafe(configPath, `Could not read ${configPath} as text. PostPath left it unchanged.`, entry, client);
    }
    const normalized = existingText ? existingText.replace(/\r\n/g, "\n") : "";
    const merged = mergeToml(normalized, entry);
    const newline = existingText && existingText.includes("\r\n") ? "\r\n" : "\n";
    nextText = merged.replace(/\n/g, newline);
  } else {
    let parsed = null;
    if (existingText != null) {
      try {
        parsed = JSON.parse(existingText);
      } catch {
        refuseUnsafe(
          configPath,
          `Could not parse ${configPath}. It may contain comments. PostPath left it unchanged. Paste the snippet instead.`,
          entry,
          client,
        );
      }
    }
    try {
      const next = mergeJson(parsed || {}, client, entry);
      const newline = existingText && existingText.includes("\r\n") ? "\r\n" : "\n";
      nextText = `${JSON.stringify(next, null, 2)}\n`.replace(/\n/g, newline);
    } catch (error) {
      if (error?.code === "config_unsafe" || error?.code === "config_invalid") {
        error.configPath = configPath;
        error.snippet = jsonSnippet(client, entry);
        error.statusCode = 409;
        throw error;
      }
      throw error;
    }
  }
  if (existingText != null && existingText === nextText) {
    return {
      id: client.id,
      configPath,
      serverKey: SERVER_KEY,
      entry: client.format === "toml" ? tomlBlock(entry) : jsonEntry(client, entry),
      changed: false,
      backupPath: null,
    };
  }
  let backupPath = null;
  if (existingText != null) backupPath = backupFile(configPath);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, nextText, { encoding: "utf8" });
  return {
    id: client.id,
    configPath,
    serverKey: SERVER_KEY,
    entry: client.format === "toml" ? tomlBlock(entry) : jsonEntry(client, entry),
    changed: true,
    backupPath,
  };
}

export function mergeCursorMcpConfig(existing, entry) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return mergeJson(base, CLIENTS[0], entry);
}

export function defaultCursorMcpPath(env = process.env) {
  return clientConfigPath("cursor", { env });
}

export function installCursorMcp(options = {}) {
  return installClient("cursor", options);
}

export function clientIds() {
  return CLIENTS.map((client) => client.id);
}
