import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import handler from "../api/admin-handoffs.js";
import connectionHandler from "../api/admin-handoff-connections.js";
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from "../lib/admin/auth.js";
import {
  containsConfiguredSecret,
  createEmptyHandoffBoard,
  normalizeHandoffBoard,
  renderHandoffMarkdown,
} from "../lib/admin/agentHandoff.js";
import { loadBridgeSnapshot } from "../lib/admin/agentHandoffBridge.js";
import { loadAgentHandoffBoard, saveAgentHandoffBoard } from "../lib/admin/agentHandoffStore.js";
import { connectPlatform, describeServerConnections } from "../lib/admin/handoffConnections.js";
import { BRIDGE_READ_EXAMPLE, evaluateToolChoice } from "../lib/admin/toolChoice.js";

const READ_TOKEN = "r".repeat(32);
const CODEX_TOKEN = "c".repeat(32);

let envLock = Promise.resolve();
async function acquireEnv() {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const previous = envLock;
  envLock = gate;
  await previous;
  return release;
}

function project(overrides = {}) {
  return {
    id: "proj_alpha",
    name: "North ledger",
    business: "North Ledger Co",
    brand_notes: "Quiet navy, no slogans.",
    repository_url: "https://example.com/north",
    decision_log: "Keep the books manual until the import is tested.",
    budget_limit_cents: 5000,
    budget_spent_cents: 0,
    tools: [{ id: "tool_sheet", name: "Spreadsheet", kind: "owned" }],
    tasks: [{
      id: "task_import",
      title: "Import last month",
      status: "open",
      goal: "Bring last month into the ledger.",
      current_state: "The export is on disk.",
      decisions: "Use the owned spreadsheet.",
      blockers: "",
      next_action: "Map the export columns.",
      links: [{ label: "Export", url: "https://example.com/export.csv" }],
      source_sha: "abc1234",
      tested_sha: "",
      proof: { level: "none", evidence: [], verification_notes: "" },
      ...overrides,
    }],
  };
}

function board(projects = [project()]) {
  return { revision: 0, updated_at: null, projects };
}

test("projects keep separate brand, budget, and decisions", () => {
  const normalized = normalizeHandoffBoard(board([
    project(),
    {
      ...project(),
      id: "proj_beta",
      name: "South studio",
      business: "South Studio",
      brand_notes: "Warm paper stock only.",
      budget_limit_cents: 0,
      tasks: [{
        ...project().tasks[0],
        id: "task_south",
        title: "Retouch the portrait",
        goal: "Prepare one portrait for the South site.",
        decisions: "No stock photos.",
        next_action: "Crop the supplied portrait.",
      }],
    },
  ]), evaluateToolChoice);
  const north = renderHandoffMarkdown(normalized.projects[0], normalized.projects[0].tasks[0]);
  const south = renderHandoffMarkdown(normalized.projects[1], normalized.projects[1].tasks[0]);
  assert.match(north, /Quiet navy/);
  assert.equal(north.includes("Warm paper"), false);
  assert.match(south, /Warm paper stock only/);
  assert.equal(south.includes("Quiet navy"), false);
  assert.match(north, /Source SHA: abc1234/);
  assert.match(north, /Tested SHA: not recorded/);
  assert.match(north, /Recorded status only/);
  assert.equal(normalized.projects[0].tasks[0].proof.independently_verified, false);
});

test("proof levels stay recorded claims and reject empty higher states", () => {
  assert.throws(() => normalizeHandoffBoard(board([project({
    proof: { level: "tested", evidence: [], verification_notes: "" },
  })]), evaluateToolChoice), /tested commit SHA or verification notes/i);
  assert.throws(() => normalizeHandoffBoard(board([project({
    proof: { level: "deployed", evidence: [], verification_notes: "shipped" },
  })]), evaluateToolChoice), /evidence link/i);
  assert.throws(() => normalizeHandoffBoard(board([project({
    proof: { level: "production_verified", evidence: [{ label: "Live", url: "http://example.com" }], verification_notes: "checked" },
  })]), evaluateToolChoice), /https evidence/i);

  const tested = normalizeHandoffBoard(board([project({
    tested_sha: "abc1234",
    proof: { level: "tested", evidence: [], verification_notes: "Ran the ledger import on abc1234.", independently_verified: true },
  })]), evaluateToolChoice);
  assert.equal(tested.projects[0].tasks[0].proof.level, "tested");
  assert.equal(tested.projects[0].tasks[0].proof.independently_verified, false);
  assert.match(renderHandoffMarkdown(tested.projects[0], tested.projects[0].tasks[0]), /did not re-run these checks/i);
});

test("handoffs reject credentials and embedded secret URLs", () => {
  assert.throws(() => normalizeHandoffBoard(board([project({
    current_state: "token: abcdefghijklmnopqr",
  })]), evaluateToolChoice), /credentials/i);
  assert.throws(() => normalizeHandoffBoard(board([project({
    links: [{ label: "Secret", url: "https://user:pass@example.com/private" }],
  })]), evaluateToolChoice), /credentials/i);
  const env = { AGENT_HANDOFF_BRIDGE_READ_TOKEN: READ_TOKEN };
  assert.equal(containsConfiguredSecret(`note ${READ_TOKEN}`, env), true);
  assert.throws(() => normalizeHandoffBoard(board([project({
    blockers: READ_TOKEN,
  })]), evaluateToolChoice, env), /credentials/i);
});

test("tool choice reuses an owned fit and does not build to avoid a subscription", () => {
  const example = evaluateToolChoice({
    ...BRIDGE_READ_EXAMPLE,
    inventory: [{ name: "Existing bridge MCP", kind: "owned" }],
    budgetLimitCents: 0,
    budgetSpentCents: 0,
  });
  assert.equal(example.choice, "reuse");
  assert.equal(example.option_name, "Existing bridge MCP");
  assert.equal(example.approval, "not_required");
  assert.equal(example.estimated_cost_label, "included");
  assert.equal(example.savings_label, "unknown");
  assert.equal(example.actual_usage.state, "unavailable");

  const paid = evaluateToolChoice({
    need: "Send the weekly summary",
    inventory: [],
    budgetLimitCents: 5000,
    budgetSpentCents: 0,
    candidates: [
      { id: "mail", name: "Hosted mail add-on", kind: "adopt", fits: true, setup: "minutes", recurring_cents: 2000, setup_cents: 0, maintenance: "low", evidence: "Vendor page lists $20 per month." },
      { id: "script", name: "Custom mailer", kind: "build", fits: true, setup: "days", recurring_cents: 0, setup_cents: 0, maintenance: "high", evidence: "No vendor fee." },
    ],
  });
  assert.equal(paid.choice, "adopt");
  assert.equal(paid.approval, "required");
  assert.equal(paid.estimated_cost_cents, 2000);
  assert.equal(paid.estimated_cost_label, "estimate");
  assert.equal(paid.within_budget, true);
  assert.match(paid.tradeoff, /not selected merely to avoid a subscription/i);

  const approved = evaluateToolChoice({
    need: "Send the weekly summary",
    budgetLimitCents: 5000,
    budgetSpentCents: 0,
    ownerApproved: true,
    candidates: paid ? [
      { id: "mail", name: "Hosted mail add-on", kind: "adopt", fits: true, setup: "minutes", recurring_cents: 2000, setup_cents: 0, maintenance: "low", evidence: "Vendor page lists $20 per month." },
    ] : [],
  });
  assert.equal(approved.approval, "approved");

  const over = evaluateToolChoice({
    need: "Send the weekly summary",
    budgetLimitCents: 1000,
    budgetSpentCents: 0,
    ownerApproved: true,
    candidates: [
      { id: "mail", name: "Hosted mail add-on", kind: "adopt", fits: true, setup: "minutes", recurring_cents: 2000, setup_cents: 0, maintenance: "low", evidence: "Vendor page lists $20 per month." },
    ],
  });
  assert.equal(over.approval, "required");
  assert.equal(over.within_budget, false);

  const cleared = evaluateToolChoice({
    need: "Send the weekly summary",
    budgetLimitCents: 1000,
    budgetSpentCents: 0,
    ownerApprovedOverBudget: true,
    candidates: [
      { id: "mail", name: "Hosted mail add-on", kind: "adopt", fits: true, setup: "minutes", recurring_cents: 2000, setup_cents: 0, maintenance: "low", evidence: "Vendor page lists $20 per month." },
    ],
  });
  assert.equal(cleared.approval, "approved");

  const custom = evaluateToolChoice({
    need: "Read a private file format nobody else supports",
    candidates: [
      { id: "parser", name: "Small parser", kind: "build", fits: true, setup: "hours", recurring_cents: 0, setup_cents: 0, maintenance: "low", evidence: "No packaged parser accepts this format." },
    ],
  });
  assert.equal(custom.choice, "build");
  assert.equal(custom.approval, "not_required");
  assert.match(custom.tradeoff, /only because no owned or existing tool fit/i);
});

function listen(handlerFn) {
  const server = createServer(handlerFn);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function bridgeServer({ token = READ_TOKEN, failTool = false, unauthorized = false } = {}) {
  return listen(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, database: true, version: "0.5.0", service: "agent-handoff-bridge" }));
      return;
    }
    if (req.method !== "POST" || url.pathname !== "/mcp") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (unauthorized || req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rpc = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (failTool) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "down" } }));
      return;
    }
    let payload = [];
    if (rpc.params?.name === "list_tasks") {
      payload = [{
        id: "task_1",
        title: `Queue item token: ${"b".repeat(20)}`,
        status: "queued",
        assigned_to: "codex",
        claimed_by: null,
        updated_at: "2026-10-27T02:00:00.000Z",
        instructions: `BRIDGE_CODEX_TOKEN=${CODEX_TOKEN}`,
      }];
    } else if (rpc.params?.name === "get_role_context") {
      payload = {
        role: rpc.params.arguments.role,
        profile: "do not send this operating profile",
        checkpoints: [{
          id: 4,
          role: rpc.params.arguments.role,
          actor: "codex",
          summary: "Columns are mapped.",
          next_action: "Check the totals.",
          blockers: "",
          artifacts: `SHA abc1234 token: ${"c".repeat(20)}`,
          created_at: "2026-10-27T02:00:00.000Z",
        }],
      };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
    }));
  });
}

test("bridge snapshot reports disconnected, health-only, and a redacted read", async () => {
  const unreachable = await loadBridgeSnapshot({
    url: "http://10.1.1.1:8787",
    token: READ_TOKEN,
    fetchImpl: async () => { throw new Error("should not fetch a private address"); },
  });
  assert.equal(unreachable.state, "disconnected");

  const missing = await loadBridgeSnapshot({ url: "", token: READ_TOKEN, fetchImpl: async () => { throw new Error("no"); } });
  assert.equal(missing.state, "not_configured");

  const { server, port } = await bridgeServer();
  try {
    const healthOnly = await loadBridgeSnapshot({ url: `http://127.0.0.1:${port}`, token: "" });
    assert.equal(healthOnly.state, "health_only");
    assert.equal(healthOnly.tasks.length, 0);

    const connected = await loadBridgeSnapshot({ url: `http://127.0.0.1:${port}`, token: READ_TOKEN });
    assert.equal(connected.state, "connected");
    assert.equal(connected.tasks[0].status, "queued");
    assert.equal(JSON.stringify(connected).includes(CODEX_TOKEN), false);
    assert.equal(JSON.stringify(connected).includes("b".repeat(20)), false);
    assert.equal(JSON.stringify(connected).includes("operating profile"), false);
    assert.match(connected.proof_note, /not a test run/i);
    assert.equal(connected.checkpoints.find((item) => item.role === "engineering").next_action, "Check the totals.");

    const rejected = await loadBridgeSnapshot({ url: `http://127.0.0.1:${port}`, token: "z".repeat(32) });
    assert.equal(rejected.state, "disconnected");
    assert.match(rejected.message, /rejected/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cursor and dot stay blocked, and a saved codex credential is not treated as connected", async () => {
  let fetched = false;
  const cursor = await connectPlatform({
    platformId: "cursor",
    env: { AGENT_HANDOFF_BRIDGE_URL: "http://127.0.0.1:9", BRIDGE_CURSOR_TOKEN: "d".repeat(40) },
    fetchImpl: async () => { fetched = true; throw new Error("fetched"); },
    context: "local",
  });
  assert.equal(cursor.status, "blocked");
  assert.equal(cursor.verified, false);
  assert.equal(fetched, false);
  assert.match(cursor.message, /no Cursor actor/i);

  const dot = await connectPlatform({
    platformId: "dot",
    env: { AGENT_HANDOFF_BRIDGE_URL: "https://bridge.example" },
    fetchImpl: async () => { throw new Error("fetched"); },
    context: "server",
  });
  assert.equal(dot.status, "blocked");
  assert.match(dot.next_step, /Do not paste the token/i);

  const described = describeServerConnections({
    snapshot: { state: "not_configured", message: "No bridge URL is configured." },
    env: { AGENT_HANDOFF_BRIDGE_CODEX_TOKEN: CODEX_TOKEN },
  });
  const codex = described.find((item) => item.id === "codex");
  assert.equal(codex.status, "setup_needed");
  assert.equal(codex.verified, false);
  assert.equal(codex.credential_configured, true);
  assert.equal(JSON.stringify(described).includes(CODEX_TOKEN), false);
});

test("local codex setup verifies only after the bridge accepts the credential and the CLI confirms it", async () => {
  const { server, port } = await bridgeServer({ token: CODEX_TOKEN });
  const calls = [];
  try {
    const missingCli = await connectPlatform({
      platformId: "codex",
      env: { AGENT_HANDOFF_BRIDGE_URL: `http://127.0.0.1:${port}`, BRIDGE_CODEX_TOKEN: CODEX_TOKEN, PATH: "" },
      context: "local",
      commandExists: () => false,
      runCommand: async () => { throw new Error("should not run"); },
    });
    assert.equal(missingCli.status, "setup_needed");
    assert.equal(missingCli.credential_accepted, true);
    assert.equal(missingCli.verified, false);
    assert.match(missingCli.message, /not installed/i);

    const verified = await connectPlatform({
      platformId: "codex",
      env: { AGENT_HANDOFF_BRIDGE_URL: `http://127.0.0.1:${port}`, BRIDGE_CODEX_TOKEN: CODEX_TOKEN },
      context: "local",
      commandExists: () => true,
      runCommand: async (bin, args) => {
        calls.push([bin, args]);
        if (args[0] === "mcp" && args[1] === "--help") return { code: 0, stdout: "bearer-token-env-var", stderr: "" };
        if (args.includes("get")) return { code: 0, stdout: "agent-handoff-bridge", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(verified.status, "connected_verified");
    assert.equal(verified.product_configured, true);
    assert.equal(JSON.stringify(calls).includes(CODEX_TOKEN), false);
    assert.equal(calls.some(([, args]) => args.includes("--bearer-token-env-var") && args.includes("BRIDGE_CODEX_TOKEN")), true);

    const unknownCli = await connectPlatform({
      platformId: "codex",
      env: { AGENT_HANDOFF_BRIDGE_URL: `http://127.0.0.1:${port}`, BRIDGE_CODEX_TOKEN: CODEX_TOKEN },
      context: "local",
      commandExists: () => true,
      runCommand: async () => ({ code: 0, stdout: "usage", stderr: "" }),
    });
    assert.equal(unknownCli.status, "setup_needed");
    assert.equal(unknownCli.verified, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("grok setup uses an environment placeholder and fails closed when doctor fails", async () => {
  const { server, port } = await bridgeServer({ token: "e".repeat(32) });
  try {
    const calls = [];
    const failed = await connectPlatform({
      platformId: "grok-engineering",
      env: {
        AGENT_HANDOFF_BRIDGE_URL: `http://127.0.0.1:${port}`,
        BRIDGE_ENGINEERING_TOKEN: "e".repeat(32),
      },
      context: "local",
      commandExists: () => true,
      runCommand: async (bin, args) => {
        calls.push(args);
        if (args[1] === "--help") return { code: 0, stdout: "--header doctor", stderr: "" };
        if (args[1] === "doctor") return { code: 1, stdout: "", stderr: "not connected" };
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(failed.status, "setup_needed");
    assert.equal(failed.verified, false);
    assert.equal(JSON.stringify(calls).includes("e".repeat(32)), false);
    assert.match(JSON.stringify(calls), /\$\{BRIDGE_ENGINEERING_TOKEN\}/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(value = "") { this.body = value; },
  };
}

function authHeaders(token, extra = {}) {
  return {
    cookie: `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    ...extra,
  };
}

test("handoff API requires the studio session and does not echo bridge credentials", async () => {
  const release = await acquireEnv();
  const denied = responseRecorder();
  await handler({ method: "GET", headers: {} }, denied);
  assert.equal(denied.statusCode, 401);

  const previous = {
    secret: process.env.FIRSTSTEP_ADMIN_SESSION_SECRET,
    url: process.env.AGENT_HANDOFF_BRIDGE_URL,
    token: process.env.AGENT_HANDOFF_BRIDGE_READ_TOKEN,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
  };
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = "abcdef0123456789abcdef0123456789";
  delete process.env.AGENT_HANDOFF_BRIDGE_URL;
  delete process.env.AGENT_HANDOFF_BRIDGE_READ_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  try {
    const token = createAdminSessionToken();
    const response = responseRecorder();
    await handler({ method: "GET", headers: authHeaders(token) }, response);
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.storage.state, "not_configured");
    assert.equal(body.board, null);
    assert.equal(body.bridge.state, "not_configured");
    assert.equal(body.connections.find((item) => item.id === "cursor").status, "blocked");
    assert.equal(body.connections.find((item) => item.id === "studio-read").status, "setup_needed");
    assert.equal(body.connections.some((item) => item.status === "connected_verified"), false);
  } finally {
    for (const [key, value] of Object.entries({
      FIRSTSTEP_ADMIN_SESSION_SECRET: previous.secret,
      AGENT_HANDOFF_BRIDGE_URL: previous.url,
      AGENT_HANDOFF_BRIDGE_READ_TOKEN: previous.token,
      KV_REST_API_URL: previous.kvUrl,
      KV_REST_API_TOKEN: previous.kvToken,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    release();
  }
});

test("encrypted handoff storage round-trips one project and refuses a stale revision", async () => {
  const release = await acquireEnv();
  const previous = {
    key: process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
    fetch: globalThis.fetch,
    nodeEnv: process.env.NODE_ENV,
  };
  const memory = new Map();
  process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.KV_REST_API_URL = "http://127.0.0.1:9";
  process.env.KV_REST_API_TOKEN = "kv-token-not-a-bridge-secret";
  delete process.env.NODE_ENV;
  globalThis.fetch = async (url, options) => {
    const [commandName, key, value] = JSON.parse(options.body);
    assert.equal(String(url), "http://127.0.0.1:9");
    assert.equal(options.headers.Authorization, "Bearer kv-token-not-a-bridge-secret");
    if (commandName === "GET") return { ok: true, json: async () => ({ result: memory.get(key) ?? null }) };
    if (commandName === "SET") {
      memory.set(key, value);
      return { ok: true, json: async () => ({ result: "OK" }) };
    }
    throw new Error(commandName);
  };
  try {
    assert.deepEqual(await loadAgentHandoffBoard(), createEmptyHandoffBoard());
    const saved = await saveAgentHandoffBoard(board(), 0);
    assert.equal(saved.revision, 1);
    assert.equal(saved.projects[0].brand_notes, "Quiet navy, no slogans.");
    const stored = [...memory.values()][0];
    assert.equal(stored.includes("Quiet navy"), false);
    assert.equal(stored.includes("North Ledger"), false);
    await assert.rejects(() => saveAgentHandoffBoard(board(), 0), /another tab/i);
    const loaded = await loadAgentHandoffBoard();
    assert.equal(loaded.revision, 1);
    assert.equal(loaded.projects[0].tasks[0].next_action, "Map the export columns.");
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({
      FIRSTSTEP_DATA_ENCRYPTION_KEY: previous.key,
      KV_REST_API_URL: previous.kvUrl,
      KV_REST_API_TOKEN: previous.kvToken,
      NODE_ENV: previous.nodeEnv,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    release();
  }
});

test("connection verify route probes one platform and never returns the credential", async () => {
  const release = await acquireEnv();
  const { server, port } = await bridgeServer();
  const previous = {
    secret: process.env.FIRSTSTEP_ADMIN_SESSION_SECRET,
    url: process.env.AGENT_HANDOFF_BRIDGE_URL,
    token: process.env.AGENT_HANDOFF_BRIDGE_READ_TOKEN,
    fetch: globalThis.fetch,
  };
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = "abcdef0123456789abcdef0123456789";
  process.env.AGENT_HANDOFF_BRIDGE_URL = `http://127.0.0.1:${port}`;
  process.env.AGENT_HANDOFF_BRIDGE_READ_TOKEN = READ_TOKEN;
  try {
    const token = createAdminSessionToken();
    const response = responseRecorder();
    await connectionHandler({
      method: "POST",
      headers: authHeaders(token, {
        origin: "https://studio.example",
        host: "studio.example",
        "content-type": "application/json",
      }),
      body: { platform: "studio-read" },
    }, response);
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.connection.status, "connected_verified");
    assert.equal(response.body.includes(READ_TOKEN), false);

    const blocked = responseRecorder();
    await connectionHandler({
      method: "POST",
      headers: authHeaders(token, {
        origin: "https://studio.example",
        host: "studio.example",
        "content-type": "application/json",
      }),
      body: { platform: "cursor" },
    }, blocked);
    assert.equal(JSON.parse(blocked.body).connection.status, "blocked");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous.fetch) globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({
      FIRSTSTEP_ADMIN_SESSION_SECRET: previous.secret,
      AGENT_HANDOFF_BRIDGE_URL: previous.url,
      AGENT_HANDOFF_BRIDGE_READ_TOKEN: previous.token,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    release();
  }
});

function runScript(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/connect-handoff-agent.mjs", ...args], {
      cwd: new URL("..", import.meta.url),
      env: { PATH: process.env.PATH || "", ...env },
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

test("the setup script reports real bridge results without printing a credential", async () => {
  const blocked = await runScript(["cursor"], {
    AGENT_HANDOFF_BRIDGE_URL: "http://127.0.0.1:1",
    BRIDGE_CURSOR_TOKEN: "q".repeat(40),
  });
  const blockedBody = JSON.parse(blocked.stdout);
  assert.equal(blocked.code, 2);
  assert.equal(blockedBody.status, "blocked");
  assert.equal(blocked.stdout.includes("q".repeat(40)), false);

  const { server, port } = await bridgeServer();
  const directory = mkdtempSync(join(tmpdir(), "handoff-env-"));
  const envFile = join(directory, "bridge.env");
  writeFileSync(envFile, `AGENT_HANDOFF_BRIDGE_READ_TOKEN=${READ_TOKEN}\n`);
  try {
    const verified = await runScript(["studio-read", "--env-file", envFile], {
      AGENT_HANDOFF_BRIDGE_URL: `http://127.0.0.1:${port}`,
      AGENT_HANDOFF_BRIDGE_READ_TOKEN: "",
    });
    const body = JSON.parse(verified.stdout);
    assert.equal(verified.code, 0);
    assert.equal(body.status, "connected_verified");
    assert.equal(verified.stdout.includes(READ_TOKEN), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
