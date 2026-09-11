import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin-job-agent-operations.js";
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from "../lib/admin/auth.js";
import { loadJobAgentOperations, normalizeJobAgentOperations } from "../lib/admin/jobAgentOperations.js";

const safePayload = {
  contentFree: true,
  containsCandidateValues: false,
  monetarySpend: {
    contentFree: true,
    containsCandidateValues: false,
    days: [{
      date: "2026-09-08",
      global: { settledCents: 85, reservedCents: 15, releasedCents: 5 },
      categories: { ai: { settledCents: 60, reservedCents: 5, releasedCents: 0 } },
    }],
  },
  costControls: {
    monetaryReservationControl: {
      enabled: true,
      approved: true,
      globalDailyCapCents: 500,
      categories: { ai: { dailyCapCents: 250, maximumRequestCents: 5 } },
    },
  },
  queueHealth: {
    contentFree: true,
    containsCandidateValues: false,
    containsAccountIdentifiers: false,
    submission: { status: "idle", pending: 0, overdue: 0 },
  },
  backgroundWorker: { status: "healthy", outcome: "succeeded" },
  launchManifest: {
    capabilities: {
      signedBeta: { eligible: true },
      packageReady: { eligible: true },
      assistedApplication: { eligible: false },
      finalSubmission: { eligible: false },
    },
    discordOperatorAlerts: { ready: true },
    operatorAlerting: { ready: true },
  },
};

test("normalizes only aggregate content-free Job Agent evidence", () => {
  const result = normalizeJobAgentOperations(safePayload);
  assert.equal(result.contentFree, true);
  assert.equal(result.spend.settledCents, 85);
  assert.equal(result.spend.remainingCents, 400);
  assert.equal(result.safeguards.finalSubmission, "disabled");
  assert.equal(result.safeguards.employerBrowser, "disabled");
  assert.equal(result.queues.find((queue) => queue.key === "receipt").pending, null);
  assert.equal("launchManifest" in result, false);
});

test("rejects candidate or account data instead of proxying it", () => {
  assert.throws(() => normalizeJobAgentOperations({ ...safePayload, containsCandidateValues: true }), /outside the aggregate/i);
  assert.throws(() => normalizeJobAgentOperations({
    ...safePayload,
    queueHealth: { ...safePayload.queueHealth, containsAccountIdentifiers: true },
  }), /outside the aggregate/i);
});

test("uses the dedicated secret only in the server-to-server request", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  let captured;
  const result = await loadJobAgentOperations({
    secret,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => safePayload };
    },
  });
  assert.equal(result.contentFree, true);
  assert.equal(captured.url, "https://app.1ststep.ai/api/job-agent-operations?days=2");
  assert.equal(captured.options.headers["x-1ststep-operator-bridge-secret"], secret);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("fails closed when the bridge secret or origin is invalid", async () => {
  await assert.rejects(() => loadJobAgentOperations({ secret: "short", fetchImpl: async () => null }), /not configured/i);
  await assert.rejects(() => loadJobAgentOperations({
    secret: "0123456789abcdef0123456789abcdef",
    origin: "https://example.com",
    fetchImpl: async () => null,
  }), /origin is not allowed/i);
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

test("admin operations API requires the existing signed owner session", async () => {
  const response = responseRecorder();
  await handler({ method: "GET", headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).code, "unauthorized");
});

test("admin operations API returns only minimized aggregate evidence", async () => {
  const previousSessionSecret = process.env.FIRSTSTEP_ADMIN_SESSION_SECRET;
  const previousBridgeSecret = process.env.JOB_AGENT_OPERATOR_BRIDGE_SECRET;
  const previousFetch = globalThis.fetch;
  const sessionSecret = "abcdef0123456789abcdef0123456789";
  const bridgeSecret = "0123456789abcdef0123456789abcdef";
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = sessionSecret;
  process.env.JOB_AGENT_OPERATOR_BRIDGE_SECRET = bridgeSecret;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers["x-1ststep-operator-bridge-secret"], bridgeSecret);
    return { ok: true, json: async () => safePayload };
  };
  try {
    const token = createAdminSessionToken();
    const response = responseRecorder();
    await handler({ method: "GET", headers: { cookie: `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}` } }, response);
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.operations.contentFree, true);
    assert.equal(response.body.includes(bridgeSecret), false);
    assert.equal(response.body.includes("launchManifest"), false);
  } finally {
    if (previousSessionSecret === undefined) delete process.env.FIRSTSTEP_ADMIN_SESSION_SECRET;
    else process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = previousSessionSecret;
    if (previousBridgeSecret === undefined) delete process.env.JOB_AGENT_OPERATOR_BRIDGE_SECRET;
    else process.env.JOB_AGENT_OPERATOR_BRIDGE_SECRET = previousBridgeSecret;
    globalThis.fetch = previousFetch;
  }
});
