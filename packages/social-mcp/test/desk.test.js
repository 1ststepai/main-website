import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { parseEnvFile, saveOAuthEnvFile, loadOAuthEnvFile, publicOAuthConfig } from "../src/envFile.js";
import { buildSocialMcpServerEntry, mergeCursorMcpConfig, installCursorMcp } from "../src/cursorConfig.js";
import { paths } from "../src/home.js";

test("oauth env file round trip masks secrets in public view", () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  try {
    const homePaths = paths(home);
    saveOAuthEnvFile(
      {
        GOOGLE_OAUTH_CLIENT_ID: "gid.apps.googleusercontent.com",
        GOOGLE_OAUTH_CLIENT_SECRET: "super-secret-value",
      },
      homePaths,
    );
    const loaded = loadOAuthEnvFile(homePaths, {});
    assert.equal(loaded.values.GOOGLE_OAUTH_CLIENT_ID, "gid.apps.googleusercontent.com");
    const pub = publicOAuthConfig(loaded.values);
    assert.equal(pub.has_google, true);
    assert.match(pub.GOOGLE_OAUTH_CLIENT_SECRET, /••••/);
    assert.ok(!String(pub.GOOGLE_OAUTH_CLIENT_SECRET).includes("super-secret-value"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("cursor mcp config merges without wiping other servers", () => {
  const merged = mergeCursorMcpConfig(
    { mcpServers: { other: { command: "node", args: ["x"] } } },
    buildSocialMcpServerEntry({ command: "node", args: ["/tmp/social-mcp.js"] }),
  );
  assert.equal(merged.mcpServers.other.command, "node");
  assert.equal(merged.mcpServers["social-mcp"].args[0], "/tmp/social-mcp.js");
});

test("installCursorMcp writes file", () => {
  const dir = mkdtempSync(join(tmpdir(), "cursor-mcp-"));
  const configPath = join(dir, "mcp.json");
  try {
    const result = installCursorMcp({
      configPath,
      entry: buildSocialMcpServerEntry({ command: "node", args: ["bin.js"] }),
    });
    assert.equal(result.configPath, configPath);
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(parsed.mcpServers["social-mcp"].args[0], "bin.js");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desk status and profile APIs stay on localhost", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  const engine = createEngine({ home });
  const desk = createDeskServer({ engine, port: 47991 });
  try {
    const { url } = await desk.start({ open: false });
    assert.equal(url, "http://127.0.0.1:47991/");
    const status = await fetch(`${url}api/status`).then((res) => res.json());
    assert.equal(status.ok, true);
    assert.equal(status.product, "Social Connector");
    const created = await fetch(`${url}api/profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "acme", name: "Acme Co" }),
    }).then((res) => res.json());
    assert.equal(created.ok, true);
    assert.equal(created.profile.id, "acme");
    const html = await fetch(url).then((res) => res.text());
    assert.match(html, /Social Connector/);
    assert.match(html, /Connect accounts/);
  } finally {
    await desk.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("parseEnvFile ignores comments", () => {
  const values = parseEnvFile("# hi\nMETA_APP_ID=123\n\nMETA_APP_SECRET='abc'\n");
  assert.equal(values.META_APP_ID, "123");
  assert.equal(values.META_APP_SECRET, "abc");
});
