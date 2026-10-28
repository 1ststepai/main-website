import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { initPilot, runPilotCommands } from "../src/cli.js";
import { PILOT_CURSOR_ENV, installCursorMcp } from "../src/cursorConfig.js";
import { buildSocialMcpServerEntry } from "../src/cursorConfig.js";
import { containsBannedPromise } from "../src/pilot/captions.js";
import { describeHomeLayout } from "../src/pilot/config.js";
import { insuranceOpenEnrollmentPilot } from "../src/pilot/example.js";
import { generateFromTopic } from "../src/pilot/loop.js";
import { FFMPEG_MISSING_MESSAGE, probeMedia } from "../src/media/audio.js";
import { zipStore } from "../src/pilot/zipStore.js";

function homeDir() {
  return mkdtempSync(path.join(tmpdir(), "postpath-pilot-"));
}

function nextPort() {
  return 20000 + Math.floor(Math.random() * 20000);
}

function spyEngine(home, extraEnv = {}) {
  const calls = [];
  const publishers = {};
  for (const platform of ["youtube", "facebook", "instagram", "linkedin", "x", "tiktok"]) {
    publishers[platform] = () => {
      calls.push(platform);
      throw new Error(`publisher ${platform} was called`);
    };
  }
  const env = {
    SOCIAL_MCP_PILOT_MODE: "1",
    SOCIAL_MCP_PUBLISH_MODE: "live",
    SOCIAL_MCP_DRAFT_ONLY: "1",
    ANTHROPIC_API_KEY: "",
    ...extraEnv,
  };
  const engine = createEngine({ home, env, publishers, fetchImpl: async () => {
    calls.push("fetch");
    throw new Error("network");
  } });
  return { engine, calls, env };
}

test("windows-style home layout keeps separators and spaces", () => {
  const layout = describeHomeLayout("C:\\Users\\Broker\\PostPath Home", path.win32);
  assert.equal(layout.pilot, "C:\\Users\\Broker\\PostPath Home\\pilot.json");
  assert.equal(layout.db, "C:\\Users\\Broker\\PostPath Home\\db.json");
  assert.equal(layout.key, "C:\\Users\\Broker\\PostPath Home\\master.key");
  assert.equal(layout.lock, "C:\\Users\\Broker\\PostPath Home\\db.json.lock");
});

test("insurance example has the open-enrollment window and no promise language", () => {
  const config = insuranceOpenEnrollmentPilot();
  assert.equal(config.campaign.start, "2026-11-01");
  assert.equal(config.campaign.end, "2026-11-15");
  assert.deepEqual(config.goals.map((goal) => goal.id), ["quote_requests", "policy_reviews", "referrals"]);
  const blob = JSON.stringify(config);
  assert.equal(containsBannedPromise(blob), false);
  assert.match(config.compliance_banner, /Verify every claim/);
});

test("pilot init writes the home, hash, and does not print the pin", async () => {
  const home = homeDir();
  const lines = [];
  try {
    const code = await runPilotCommands(["pilot", "init", "--home", home, "--pin", "246810"], {
      stdout: (line) => lines.push(line),
    });
    assert.equal(code, 0);
    const joined = lines.join("\n");
    assert.equal(joined.includes("246810"), false);
    assert.equal(statSync(path.join(home, "pilot.json")).mode & 0o777, 0o600);
    assert.equal(statSync(path.join(home, "master.key")).mode & 0o777, 0o600);
    const pilot = JSON.parse(readFileSync(path.join(home, "pilot.json"), "utf8"));
    assert.equal(pilot.pilot_mode, true);
    assert.equal(pilot.mcp_access, "draft-only");
    const db = JSON.parse(readFileSync(path.join(home, "db.json"), "utf8"));
    assert.equal(db.profiles.broker.name, "Insurance broker");
    assert.equal(JSON.parse(readFileSync(path.join(home, "owner-auth.json"), "utf8")).hash.length > 10, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("pick topic, template draft, approve queues, publishers stay idle", async () => {
  const home = homeDir();
  try {
    initPilot({ home, pin: "246810" });
    const { engine, calls } = spyEngine(home);
    const created = await generateFromTopic(engine, { goal_id: "quote_requests", topic_id: "gather-documents" }, { env: { ANTHROPIC_API_KEY: "" } });
    assert.equal(created.bundle.status, "draft");
    assert.deepEqual(created.bundle.platforms, ["facebook", "instagram", "linkedin", "youtube"]);
    for (const post of created.posts) {
      assert.match(post.caption, /Verify every claim/);
      assert.match(post.caption, /does not quote a rate/);
      assert.equal(containsBannedPromise(post.caption), false);
    }
    const shorts = created.posts.find((post) => post.platform === "youtube");
    assert.match(shorts.caption, /YOUTUBE SHORTS SCRIPT/);
    const { queueApproved } = await import("../src/pilot/loop.js");
    const queued = queueApproved(engine, { bundle_id: created.bundle.id });
    assert.equal(queued.queue_label, "approved, waiting to post");
    assert.equal(queued.bundle.status, "approved");
    assert.equal(engine.store.getPost(shorts.id).status, "approved");
    assert.equal(engine.store.getPost(shorts.id).scheduled_at, null);
    await assert.rejects(() => engine.publishPost({ post_id: shorts.id, force: true }), (error) => error.code === "pilot_publish_disabled");
    await assert.rejects(() => engine.approveBundle({ bundle_id: created.bundle.id }), (error) => error.code === "pilot_publish_disabled");
    const due = await engine.publishDue();
    assert.equal(due.skipped, "pilot_publish_disabled");
    assert.deepEqual(calls, []);
    assert.equal(engine.publisherCalls(), 0);
    const edited = (await import("../src/pilot/loop.js")).editPilotCaption(engine, {
      bundle_id: created.bundle.id,
      platform: "linkedin",
      caption: "Edited LinkedIn caption for the document list.",
    });
    assert.match(edited.post.caption, /Edited LinkedIn caption/);
    assert.match(edited.post.caption, /Verify every claim/);
    const again = await (await import("../src/pilot/loop.js")).regeneratePilot(engine, { bundle_id: created.bundle.id }, { env: { ANTHROPIC_API_KEY: "" } });
    assert.match(again.bundle.caption, /gather|documents|conversation/i);
    assert.equal(engine.publisherCalls(), 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("claude captions are used when a key is set, and promises fall back to the template", async () => {
  const home = homeDir();
  try {
    initPilot({ home, pin: "246810" });
    const engine = createEngine({ home, env: { ANTHROPIC_API_KEY: "", SOCIAL_MCP_PILOT_MODE: "1" } });
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          content: [
            {
              text: JSON.stringify({
                title: "Questions to ask",
                caption: "Bring the plan summary to the conversation.",
                tags: ["openenrollment"],
                networks: {
                  facebook: { title: "Questions", caption: "Facebook page: bring the plan summary.", tags: [] },
                  instagram: { title: "Questions", caption: "Instagram: bring the plan summary.", tags: [] },
                  linkedin: { title: "Questions", caption: "LinkedIn: bring the plan summary.", tags: [] },
                  youtube: { title: "Questions", caption: "YOUTUBE SHORTS SCRIPT\nSay: bring the summary.", tags: [] },
                },
              }),
            },
          ],
        }),
    });
    const created = await generateFromTopic(
      engine,
      { goal_id: "policy_reviews", topic_id: "how-a-review-works" },
      { env: { ANTHROPIC_API_KEY: "test-key" }, fetchImpl, key: "test-key" },
    );
    assert.equal(created.bundle.caption_provenance.provider, "claude");
    assert.match(created.posts.find((post) => post.platform === "facebook").caption, /Facebook page/);
    assert.match(created.posts[0].caption, /Verify every claim/);

    const risky = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          content: [{ text: JSON.stringify({ title: "Deal", caption: "Guaranteed savings of $40 a month.", tags: [], networks: {} }) }],
        }),
    });
    const safe = await generateFromTopic(
      engine,
      { goal_id: "referrals", topic_id: "introduce-a-neighbor" },
      { env: { ANTHROPIC_API_KEY: "test-key" }, fetchImpl: risky, key: "test-key" },
    );
    assert.equal(safe.bundle.caption_provenance.provider, "template");
    assert.equal(containsBannedPromise(safe.bundle.caption), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("desk pilot loop approves without a pin and blocks publish, connect, and pat", async () => {
  const home = homeDir();
  const port = nextPort();
  const env = {
    SOCIAL_MCP_PILOT_MODE: "1",
    SOCIAL_MCP_PUBLISH_MODE: "live",
    ANTHROPIC_API_KEY: "",
    SOCIAL_MCP_DESK_PORT: String(port),
    SOCIAL_MCP_OAUTH_PORT: String(port + 1),
  };
  initPilot({ home, pin: "246810", env });
  const calls = [];
  const publishers = {
    facebook: () => {
      calls.push("facebook");
      throw new Error("publisher");
    },
  };
  const engine = createEngine({ home, env, publishers, fetchImpl: async () => {
    throw new Error("network");
  } });
  const desk = createDeskServer({ engine, env, port });
  try {
    const { url } = await desk.start({ open: false });
    const page = await fetch(`${url}`).then((res) => res.text());
    assert.match(page, /id="pilot-app"/);
    assert.doesNotMatch(readFileSync(new URL("../src/desk/public/pilotDesk.js", import.meta.url), "utf8"), /\/api\/publish|Approve and post now/);

    const draft = await fetch(`${url}api/pilot/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal_id: "quote_requests", topic_id: "questions-to-ask" }),
    }).then((res) => res.json());
    assert.equal(draft.ok, true);
    assert.equal(draft.bundle.platforms.includes("youtube"), true);
    const approved = await fetch(`${url}api/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundle_id: draft.bundle.id, scheduled_at: "2026-11-02T15:00:00.000Z", publish: true }),
    }).then((res) => res.json());
    assert.equal(approved.ok, true);
    assert.equal(approved.queue_label, "approved, waiting to post");
    assert.equal(approved.publishers_called, 0);
    assert.equal(engine.publisherCalls(), 0);
    assert.deepEqual(calls, []);
    const status = await fetch(`${url}api/status`).then((res) => res.json());
    assert.equal(status.pilot_mode, true);
    assert.equal(status.publish_mode, "disabled");
    assert.equal(status.oauth, undefined);
    assert.equal(status.pats, undefined);
    assert.equal(status.pilot.queue[0].status, "approved");
    assert.match(status.pilot.campaign_label, /November 1/);
    const publish = await fetch(`${url}api/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-postpath-owner-pin": "246810" },
      body: JSON.stringify({ post_id: approved.posts[0].id }),
    });
    assert.equal(publish.status, 403);
    const connect = await fetch(`${url}api/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile_id: "broker", name: "Insurance broker" }),
    });
    assert.equal(connect.status, 401);
    const connectOwner = await fetch(`${url}api/oauth-config`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-postpath-owner-pin": "246810" },
      body: JSON.stringify({}),
    });
    assert.notEqual(connectOwner.status, 401);
    const pat = await fetch(`${url}api/pat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "nope", scopes: ["drafts:write"] }),
    });
    assert.equal(pat.status, 401);
    const csv = await fetch(`${url}api/pilot/export.csv`).then((res) => res.text());
    assert.match(csv, /approved, waiting to post/);
    assert.match(csv, /Verify every claim/);
    const zip = Buffer.from(await fetch(`${url}api/pilot/export.zip`).then((res) => res.arrayBuffer()));
    assert.equal(zip.subarray(0, 2).toString(), "PK");
    assert.equal(engine.publisherCalls(), 0);
  } finally {
    await desk.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("a draft-only token cannot connect or change a profile", async () => {
  const home = homeDir();
  const port = nextPort();
  const env = { SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_OAUTH_PORT: String(port + 1), ANTHROPIC_API_KEY: "" };
  const engine = createEngine({ home, env, fetchImpl: async () => { throw new Error("network"); } });
  const desk = createDeskServer({ engine, env, port });
  try {
    const { url } = await desk.start({ open: false });
    const pat = await fetch(`${url}api/pat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "drafts", scopes: ["posts:read", "drafts:write", "accounts:read"] }),
    }).then((res) => res.json());
    const profile = await mcpCall(url, pat.token, "upsert_profile", { id: "acme", name: "Acme" });
    assert.equal(profile.result.isError, true);
    assert.match(JSON.stringify(profile.result), /accounts:write/);
    const connect = await mcpCall(url, pat.token, "connect_accounts", { profile_id: "acme" });
    assert.equal(connect.result.isError, true);
    assert.match(JSON.stringify(connect.result), /accounts:write/);
    const approve = await mcpCall(url, pat.token, "publish_post", { post_id: "post_missing1" });
    assert.equal(approve.result.isError, true);
    assert.match(JSON.stringify(approve.result), /queue:approve/);
  } finally {
    await desk.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("owner pin gates the consent decision and the broker approve does not need it", async () => {
  const home = homeDir();
  const port = nextPort();
  const env = {
    SOCIAL_MCP_PILOT_MODE: "1",
    ANTHROPIC_API_KEY: "",
    SOCIAL_MCP_DESK_PORT: String(port),
    SOCIAL_MCP_OAUTH_PORT: String(port + 1),
  };
  initPilot({ home, pin: "246810", env });
  const engine = createEngine({ home, env });
  const desk = createDeskServer({ engine, env, port });
  try {
    const { url } = await desk.start({ open: false });
    const created = await fetch(`${url}oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Pilot",
        redirect_uris: ["http://127.0.0.1/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    }).then((res) => res.json());
    const { pkceS256 } = await import("../src/mcp/auth.js");
    const { randomBytes } = await import("node:crypto");
    const verifier = randomBytes(32).toString("base64url");
    const authUrl = new URL(`${url}oauth/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", created.client_id);
    authUrl.searchParams.set("redirect_uri", "http://127.0.0.1/callback");
    authUrl.searchParams.set("code_challenge", pkceS256(verifier));
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("resource", `${url}mcp`);
    const page = await fetch(authUrl).then((res) => res.text());
    assert.match(page, /name="owner_pin"/);
    const consentId = /name="consent_id" value="([^"]+)"/.exec(page)?.[1];
    const denied = await fetch(`${url}oauth/authorize/decision`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ consent_id: consentId, decision: "approve", scope: "posts:read", owner_pin: "wrong" }),
    });
    assert.equal(denied.status, 401);
  } finally {
    await desk.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("pat create writes a 0600 file and never prints the token", async () => {
  const home = homeDir();
  const out = path.join(home, "draft.token");
  const lines = [];
  try {
    initPilot({ home, pin: "246810" });
    const code = await runPilotCommands(
      ["pat", "create", "--home", home, "--out", out, "--scopes", "posts:read,drafts:write,accounts:read"],
      { stdout: (line) => lines.push(line) },
    );
    assert.equal(code, 0);
    const token = readFileSync(out, "utf8").trim();
    assert.match(token, /^pp_pat_/);
    assert.equal(lines.join("\n").includes(token), false);
    assert.equal(statSync(out).mode & 0o777, 0o600);
    const id = /Wrote a token for (\S+)/.exec(lines.join("\n"))?.[1];
    const revoked = await runPilotCommands(["pat", "revoke", id, "--home", home], { stdout: () => {} });
    assert.equal(revoked, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("drafts CLI creates a draft and has no publish command", async () => {
  const home = homeDir();
  const lines = [];
  try {
    initPilot({ home, pin: "246810" });
    const code = await runPilotCommands(
      ["drafts", "create", "--home", home, "--goal", "referrals", "--topic", "share-the-office"],
      { stdout: (line) => lines.push(line), env: { ANTHROPIC_API_KEY: "" } },
    );
    assert.equal(code, 0);
    const created = JSON.parse(lines.at(-1));
    assert.equal(created.status, "draft");
    const listed = [];
    await runPilotCommands(["drafts", "list", "--home", home], { stdout: (line) => listed.push(line) });
    assert.match(listed.join("\n"), /share-the-office|Share the office contact|office contact/i);
    await assert.rejects(() => runPilotCommands(["drafts", "create", "--home", home, "publish"], { stdout: () => {} }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-cursor --pilot writes draft-only mock env", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cursor-pilot-"));
  const configPath = path.join(dir, "mcp.json");
  try {
    const entry = buildSocialMcpServerEntry({ pilot: true, args: ["bin/social-mcp.js"] });
    installCursorMcp({ configPath, entry });
    const saved = JSON.parse(readFileSync(configPath, "utf8"));
    assert.deepEqual(saved.mcpServers.postpath.env, PILOT_CURSOR_ENV);
    assert.equal(saved.mcpServers.postpath.env.SOCIAL_MCP_PUBLISH_MODE, "mock");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing ffmpeg blocks media only", async () => {
  const empty = mkdtempSync(path.join(tmpdir(), "no-ffmpeg-"));
  const home = homeDir();
  try {
    await assert.rejects(
      () => probeMedia(path.join(empty, "clip.mp4"), { env: { PATH: empty, Path: empty } }),
      (error) => error.code === "ffmpeg_missing" && error.message === FFMPEG_MISSING_MESSAGE,
    );
    initPilot({ home, pin: "246810" });
    const engine = createEngine({ home, env: { SOCIAL_MCP_PILOT_MODE: "1", ANTHROPIC_API_KEY: "" } });
    const created = await generateFromTopic(engine, { goal_id: "quote_requests", topic_id: "who-to-include" }, { env: { ANTHROPIC_API_KEY: "" } });
    assert.equal(created.bundle.status, "draft");
    assert.equal(engine.publisherCalls(), 0);
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("zip store round trip keeps the captions file", () => {
  const zip = zipStore([{ name: "captions.csv", data: "platform,caption\nfacebook,Hello\n" }]);
  assert.equal(zip.subarray(0, 4).readUInt32LE(0), 0x04034b50);
  const name = zip.subarray(30, 30 + "captions.csv".length).toString();
  assert.equal(name, "captions.csv");
});

async function mcpCall(base, token, name, args) {
  const init = await fetch(`${base}mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    }),
  });
  const session = init.headers.get("mcp-session-id");
  await init.text();
  await fetch(`${base}mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": session,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  const response = await fetch(`${base}mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": session,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await response.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(dataLine ? dataLine.slice(6) : text);
}

