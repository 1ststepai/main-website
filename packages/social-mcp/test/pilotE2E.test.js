import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { freePort, freePorts } from "./helpers/ports.js";

const exec = promisify(execFile);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function run(command, args, options = {}) {
  return exec(command, args, { ...options, maxBuffer: 20 * 1024 * 1024 });
}

test("unpacked download walks the pilot loop and keeps stdio draft-only", { timeout: 180000 }, async () => {
  const work = mkdtempSync(path.join(tmpdir(), "postpath-e2e-"));
  const out = path.join(work, "downloads");
  const unpack = path.join(work, "unpack");
  const app = path.join(work, "app");
  const home = path.join(work, "home");
  let desk;
  try {
    await run("bash", ["packages/social-mcp/scripts/build-downloads.sh"], {
      cwd: repoRoot,
      env: { ...process.env, POSTPATH_DOWNLOADS_OUT: out },
    });
    const zips = readFileSync(path.join(out, "SHA256SUMS.txt"), "utf8")
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[1])
      .filter((name) => name && name.endsWith(".zip"));
    assert.equal(zips.length, 2);
    for (const name of zips) await run("unzip", ["-q", path.join(out, name), "-d", unpack]);
    const macDir = path.join(unpack, "PostPath-macOS");
    const pilotLauncher = readFileSync(path.join(macDir, "Open PostPath Pilot.command"), "utf8");
    assert.match(pilotLauncher, /SOCIAL_MCP_PILOT_MODE=1/);
    assert.match(pilotLauncher, /SOCIAL_MCP_DRAFT_ONLY=1/);
    assert.match(pilotLauncher, /SOCIAL_MCP_PUBLISH_MODE=mock/);
    const winBat = readFileSync(path.join(unpack, "PostPath-Windows", "Open-PostPath-Pilot.bat"), "utf8");
    assert.match(winBat, /SOCIAL_MCP_PILOT_MODE=1/);
    const winPs1 = readFileSync(path.join(unpack, "PostPath-Windows", "Open-PostPath.ps1"), "utf8");
    assert.match(winPs1, /pilot\.json/);
    assert.match(winPs1, /SOCIAL_MCP_DRAFT_ONLY/);
    const mainCommand = readFileSync(path.join(macDir, "Open PostPath.command"), "utf8");
    assert.match(mainCommand, /pilot\.json/);
    await run("tar", ["-xzf", path.join(macDir, "postpath-app.tgz"), "-C", work]);
    await run("mv", [path.join(work, "postpath-app"), app]);
    await run("npm", ["ci", "--ignore-scripts", "--omit=dev"], { cwd: app });
    const [port, oauthPort] = await freePorts(2);
    await run(process.execPath, ["bin/social-mcp.js", "pilot", "init", "--home", home, "--pin", "246810"], {
      cwd: app,
      env: { ...process.env, ANTHROPIC_API_KEY: "" },
    });
    desk = spawn(process.execPath, ["bin/social-mcp.js", "app", "--no-open"], {
      cwd: app,
      env: {
        ...process.env,
        SOCIAL_MCP_HOME: home,
        SOCIAL_MCP_DESK_PORT: String(port),
        SOCIAL_MCP_OAUTH_PORT: String(oauthPort),
        ANTHROPIC_API_KEY: "",
        POSTPATH_NO_OPEN: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    desk.stdout.on("data", (chunk) => {
      logs += chunk;
    });
    desk.stderr.on("data", (chunk) => {
      logs += chunk;
    });
    const base = `http://127.0.0.1:${port}/`;
    let status;
    for (let i = 0; i < 40; i += 1) {
      try {
        status = await fetch(`${base}api/status`).then((res) => res.json());
        if (status?.ok) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    assert.equal(status?.pilot_mode, true, logs);
    const draft = await fetch(`${base}api/pilot/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal_id: "quote_requests", topic_id: "gather-documents" }),
    }).then((res) => res.json());
    assert.equal(draft.ok, true, JSON.stringify(draft));
    assert.equal(draft.publishers_called, 0);
    const approved = await fetch(`${base}api/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle_id: draft.bundle.id }),
    }).then((res) => res.json());
    assert.equal(approved.queue_label, "approved, waiting to post");
    assert.equal(approved.publishers_called, 0);
    const publish = await fetch(`${base}api/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-postpath-owner-pin": "246810" },
      body: JSON.stringify({ post_id: approved.posts[0].id }),
    });
    assert.equal(publish.status, 403);
    const after = await fetch(`${base}api/status`).then((res) => res.json());
    assert.equal(after.publisher_calls, 0);
    assert.equal(after.pilot.queue[0].status, "approved");

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(app, "bin", "social-mcp.js")],
      cwd: app,
      env: {
        ...process.env,
        SOCIAL_MCP_HOME: home,
        SOCIAL_MCP_PILOT_MODE: "1",
        SOCIAL_MCP_DRAFT_ONLY: "1",
        SOCIAL_MCP_PUBLISH_MODE: "mock",
        ANTHROPIC_API_KEY: "",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "cursor-pilot", version: "0.0.0" });
    await client.connect(transport);
    try {
      const created = await client.callTool({
        name: "create_draft",
        arguments: { profile_id: "broker", platform: "facebook", caption: "Bring the plan summary to the conversation." },
      });
      assert.notEqual(created.isError, true);
      assert.match(created.content[0].text, /"ok": true/);
      const refused = await client.callTool({ name: "publish_post", arguments: { post_id: "post_missing1" } });
      assert.equal(refused.isError, true);
      assert.match(JSON.stringify(refused), /queue:approve/);
      const approval = await client.callTool({ name: "request_approval", arguments: { bundle_id: draft.bundle.id } });
      assert.equal(approval.isError, true);
      assert.match(JSON.stringify(approval), /queue:approve/);
    } finally {
      await client.close();
    }
  } finally {
    if (desk) desk.kill("SIGTERM");
    rmSync(work, { recursive: true, force: true });
  }
});
