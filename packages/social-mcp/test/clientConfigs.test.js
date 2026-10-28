import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  clientConfigPath,
  installClient,
  listClientStatus,
} from "../src/clientConfigs.js";

const ENTRY = { command: "node", args: ["bin.js"], env: {} };

const WRITE_IDS = [
  "cursor",
  "claude-desktop",
  "claude-code",
  "vscode",
  "codex",
  "windsurf",
  "gemini-cli",
  "grok-cli",
  "cline",
  "zed",
  "lmstudio",
  "copilot-cli",
];

function backupsIn(dir) {
  return readdirSync(dir).filter((name) => name.includes(".postpath-backup-"));
}

test("macOS config paths match the documented locations", () => {
  const home = "/Users/evan";
  const env = {};
  const platform = "darwin";
  const path = (id, extra = {}) => clientConfigPath(id, { home, platform, env, ...extra });
  assert.equal(path("cursor"), "/Users/evan/.cursor/mcp.json");
  assert.equal(
    path("claude-desktop"),
    "/Users/evan/Library/Application Support/Claude/claude_desktop_config.json",
  );
  assert.equal(path("claude-code"), "/Users/evan/.claude.json");
  assert.equal(path("vscode"), "/Users/evan/Library/Application Support/Code/User/mcp.json");
  assert.equal(path("codex"), "/Users/evan/.codex/config.toml");
  assert.equal(path("windsurf"), "/Users/evan/.config/devin/mcp_config.json");
  assert.equal(path("gemini-cli"), "/Users/evan/.gemini/settings.json");
  assert.equal(path("grok-cli"), "/Users/evan/.grok/config.toml");
  assert.equal(path("cline"), "/Users/evan/.cline/data/settings/cline_mcp_settings.json");
  assert.equal(path("zed"), "/Users/evan/.config/zed/settings.json");
  assert.equal(path("lmstudio"), "/Users/evan/.lmstudio/mcp.json");
  assert.equal(path("copilot-cli"), "/Users/evan/.copilot/mcp-config.json");
  assert.equal(path("zed", { env: { XDG_CONFIG_HOME: "/Users/evan/xdg" } }), "/Users/evan/.config/zed/settings.json");
  assert.equal(
    path("windsurf", { env: { XDG_CONFIG_HOME: "/Users/evan/xdg" } }),
    "/Users/evan/xdg/devin/mcp_config.json",
  );
});

test("Windows config paths match the documented locations", () => {
  const home = "C:\\Users\\Evan";
  const env = { APPDATA: "C:\\Users\\Evan\\AppData\\Roaming", USERPROFILE: home };
  const platform = "win32";
  const path = (id) => clientConfigPath(id, { home, platform, env });
  assert.equal(path("cursor"), "C:\\Users\\Evan\\.cursor\\mcp.json");
  assert.equal(
    path("claude-desktop"),
    "C:\\Users\\Evan\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
  );
  assert.equal(path("claude-code"), "C:\\Users\\Evan\\.claude.json");
  assert.equal(path("vscode"), "C:\\Users\\Evan\\AppData\\Roaming\\Code\\User\\mcp.json");
  assert.equal(path("codex"), "C:\\Users\\Evan\\.codex\\config.toml");
  assert.equal(path("windsurf"), "C:\\Users\\Evan\\AppData\\Roaming\\devin\\mcp_config.json");
  assert.equal(path("gemini-cli"), "C:\\Users\\Evan\\.gemini\\settings.json");
  assert.equal(path("grok-cli"), "C:\\Users\\Evan\\.grok\\config.toml");
  assert.equal(path("cline"), "C:\\Users\\Evan\\.cline\\data\\settings\\cline_mcp_settings.json");
  assert.equal(path("zed"), "C:\\Users\\Evan\\AppData\\Roaming\\Zed\\settings.json");
  assert.equal(path("lmstudio"), "C:\\Users\\Evan\\.lmstudio\\mcp.json");
  assert.equal(path("copilot-cli"), "C:\\Users\\Evan\\.copilot\\mcp-config.json");
});

test("Linux paths and documented env overrides", () => {
  const home = "/home/evan";
  const platform = "linux";
  assert.equal(
    clientConfigPath("claude-desktop", { home, platform, env: { XDG_CONFIG_HOME: "/home/evan/xdg" } }),
    "/home/evan/xdg/Claude/claude_desktop_config.json",
  );
  assert.equal(
    clientConfigPath("vscode", { home, platform, env: {} }),
    "/home/evan/.config/Code/User/mcp.json",
  );
  assert.equal(
    clientConfigPath("zed", { home, platform, env: { XDG_CONFIG_HOME: "/home/evan/xdg" } }),
    "/home/evan/xdg/zed/settings.json",
  );
  assert.equal(
    clientConfigPath("claude-code", { home, platform, env: { CLAUDE_CONFIG_DIR: "/tmp/claude" } }),
    "/tmp/claude/.claude.json",
  );
  assert.equal(
    clientConfigPath("codex", { home, platform, env: { CODEX_HOME: "/tmp/codex" } }),
    "/tmp/codex/config.toml",
  );
  assert.equal(
    clientConfigPath("grok-cli", { home, platform, env: { GROK_HOME: "/tmp/grok" } }),
    "/tmp/grok/config.toml",
  );
  assert.equal(
    clientConfigPath("copilot-cli", { home, platform, env: { COPILOT_HOME: "/tmp/copilot" } }),
    "/tmp/copilot/mcp-config.json",
  );
  assert.equal(
    clientConfigPath("cline", { home, platform, env: { CLINE_MCP_SETTINGS_PATH: "/tmp/cline.json" } }),
    "/tmp/cline.json",
  );
  assert.equal(
    clientConfigPath("cursor", { home, platform, env: { CURSOR_MCP_CONFIG: "/tmp/mcp.json" } }),
    "/tmp/mcp.json",
  );
});

test("each writer merges, backs up once, and is idempotent", () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-clients-"));
  try {
    for (const id of WRITE_IDS) {
      const configPath = clientConfigPath(id, { home, platform: "linux", env: {} });
      const first = installClient(id, { home, platform: "linux", env: {}, entry: ENTRY });
      assert.equal(first.changed, true, id);
      assert.equal(first.backupPath, null, id);
      const second = installClient(id, { home, platform: "linux", env: {}, entry: ENTRY });
      assert.equal(second.changed, false, id);
      assert.equal(second.backupPath, null, id);
      assert.equal(backupsIn(dirname(configPath)).length, 0, id);
      const text = readFileSync(configPath, "utf8");
      if (configPath.endsWith(".toml")) {
        assert.match(text, /\[mcp_servers\.postpath\]/);
        assert.match(text, /command = "node"/);
        assert.match(text, /"bin\.js"/);
      } else {
        const parsed = JSON.parse(text);
        const bag = parsed.mcpServers || parsed.servers || parsed.context_servers;
        assert.equal(bag.postpath.command, "node", id);
        assert.deepEqual(bag.postpath.args, ["bin.js"], id);
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("json and toml merges keep other servers and back up a previous file", () => {
  const dir = mkdtempSync(join(tmpdir(), "postpath-merge-"));
  const jsonPath = join(dir, "mcp.json");
  const tomlPath = join(dir, "config.toml");
  try {
    writeFileSync(
      jsonPath,
      `${JSON.stringify({ theme: "dark", mcpServers: { other: { command: "keep", args: ["a"] } } }, null, 2)}\n`,
    );
    writeFileSync(
      tomlPath,
      "model = \"gpt\"\n# keep this comment\n\n[mcp_servers.other]\ncommand = \"npx\"\nargs = [\"-y\", \"other\"]\n",
    );
    const jsonResult = installClient("cursor", { configPath: jsonPath, entry: ENTRY });
    assert.equal(jsonResult.changed, true);
    assert.ok(jsonResult.backupPath);
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(parsed.theme, "dark");
    assert.equal(parsed.mcpServers.other.command, "keep");
    assert.equal(parsed.mcpServers.postpath.args[0], "bin.js");
    const again = installClient("cursor", { configPath: jsonPath, entry: ENTRY });
    assert.equal(again.changed, false);
    assert.equal(backupsIn(dir).filter((name) => name.startsWith("mcp.json")).length, 1);

    const tomlResult = installClient("codex", { configPath: tomlPath, entry: ENTRY });
    assert.equal(tomlResult.changed, true);
    const toml = readFileSync(tomlPath, "utf8");
    assert.match(toml, /model = "gpt"/);
    assert.match(toml, /# keep this comment/);
    assert.match(toml, /\[mcp_servers\.other\]/);
    assert.match(toml, /command = "npx"/);
    assert.match(toml, /\[mcp_servers\.postpath\]/);
    const tomlAgain = installClient("codex", { configPath: tomlPath, entry: ENTRY });
    assert.equal(tomlAgain.changed, false);
    assert.equal(readFileSync(tomlPath, "utf8"), toml);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid JSON and Zed comments are left unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "postpath-unsafe-"));
  const broken = join(dir, "broken.json");
  const commented = join(dir, "settings.json");
  try {
    writeFileSync(broken, "{ not json");
    writeFileSync(commented, '{\n  // keep me\n  "theme": "One Dark"\n}\n');
    assert.throws(() => installClient("claude-desktop", { configPath: broken, entry: ENTRY }), /left it unchanged/);
    assert.equal(readFileSync(broken, "utf8"), "{ not json");
    assert.throws(() => installClient("zed", { configPath: commented, entry: ENTRY }), /left it unchanged/);
    assert.match(readFileSync(commented, "utf8"), /keep me/);
    assert.equal(backupsIn(dir).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("VS Code uses servers and Claude Code marks stdio", () => {
  const dir = mkdtempSync(join(tmpdir(), "postpath-shape-"));
  try {
    const cursor = installClient("cursor", { configPath: join(dir, "cursor.json"), entry: ENTRY });
    const cursorJson = JSON.parse(readFileSync(cursor.configPath, "utf8"));
    assert.equal(cursorJson.mcpServers.postpath.type, "stdio");
    const vscode = installClient("vscode", { configPath: join(dir, "mcp.json"), entry: ENTRY });
    const copilot = JSON.parse(readFileSync(vscode.configPath, "utf8"));
    assert.equal(copilot.servers.postpath.type, "stdio");
    assert.equal(copilot.mcpServers, undefined);
    const claude = installClient("claude-code", { configPath: join(dir, ".claude.json"), entry: ENTRY });
    const code = JSON.parse(readFileSync(claude.configPath, "utf8"));
    assert.equal(code.mcpServers.postpath.type, "stdio");
    const cline = installClient("cline", { configPath: join(dir, "cline.json"), entry: ENTRY });
    const clineJson = JSON.parse(readFileSync(cline.configPath, "utf8"));
    assert.equal(clineJson.mcpServers.postpath.disabled, false);
    assert.deepEqual(clineJson.mcpServers.postpath.autoApprove, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cloud and paste clients are instructions and do not write a file", () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-cloud-"));
  try {
    const rows = listClientStatus({ home, platform: "linux", env: {}, entry: ENTRY });
    const chatgpt = rows.find((row) => row.id === "chatgpt");
    const grok = rows.find((row) => row.id === "grok-web");
    const cont = rows.find((row) => row.id === "continue");
    assert.equal(chatgpt.statusLabel, "Cannot connect from here");
    assert.match(chatgpt.detail, /127\.0\.0\.1/);
    assert.match(chatgpt.detail, /tunnel/);
    assert.equal(grok.statusLabel, "Cannot connect from here");
    assert.match(grok.snippet, /public https address/);
    assert.equal(cont.statusLabel, "Instructions only");
    assert.match(cont.snippet, /mcpServers:/);
    assert.throws(() => installClient("chatgpt", { home, platform: "linux", env: {}, entry: ENTRY }), /public https/);
    assert.equal(readdirSync(home).length, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a non-object server map is not replaced", () => {
  const dir = mkdtempSync(join(tmpdir(), "postpath-array-"));
  const configPath = join(dir, "mcp.json");
  try {
    writeFileSync(configPath, '{"mcpServers":["nope"]}\n');
    assert.throws(() => installClient("cursor", { configPath, entry: ENTRY }), /left the file unchanged/);
    assert.equal(readFileSync(configPath, "utf8"), '{"mcpServers":["nope"]}\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
