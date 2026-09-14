import test from "node:test";
import assert from "node:assert/strict";
import readHandler from "../api/admin-command-center.js";
import ingestHandler from "../api/admin-command-center-ingest.js";
import { ADMIN_COOKIE_NAME, createAdminSessionToken } from "../lib/admin/auth.js";
import { normalizeCommandCenterSource, summarizeCommandCenter } from "../lib/admin/commandCenter.js";
import { auditorSourceSnapshot } from "../scripts/command-center-auditor-source.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const now = Date.parse("2026-09-13T12:00:00.000Z");
function snapshot(source, overrides = {}) {
  return {
    schemaVersion: 1,
    contentFree: true,
    source,
    observedAt: new Date(now).toISOString(),
    registryComplete: true,
    agents: [{ id: `${source}-lead`, name: "Lead", project: "1stStep", updatedAt: new Date(now).toISOString(), status: "working", task: "Audit release candidate", owner: "Engineering" }],
    projects: [], events: [], audits: [], handoffs: [], decisions: [], releases: [], builds: [],
    ...overrides,
  };
}

function responseRecorder() {
  return { statusCode: 200, headers: {}, body: "", setHeader(name, value) { this.headers[name] = value; }, end(value = "") { this.body = value; } };
}

test("agent counts require both fresh and complete authority registries", () => {
  const publicSource = normalizeCommandCenterSource(snapshot("public-ecosystem"), now);
  const appSource = normalizeCommandCenterSource(snapshot("app-family"), now);
  const complete = summarizeCommandCenter([publicSource, appSource], now);
  assert.equal(complete.counts.registered, 2);
  assert.equal(complete.counts.working, 2);
  assert.equal(summarizeCommandCenter([publicSource, null], now).counts.registered, null);
  assert.equal(summarizeCommandCenter([publicSource, appSource], now + 6 * 60_000).counts.working, null);
  const partial = normalizeCommandCenterSource(snapshot("app-family", { registryComplete: false }), now);
  assert.equal(summarizeCommandCenter([publicSource, partial], now).counts.registered, null);
});

test("previously working agents become stale when their own record ages out", () => {
  const staleAgent = normalizeCommandCenterSource(snapshot("public-ecosystem", {
    agents: [{ ...snapshot("public-ecosystem").agents[0], updatedAt: new Date(now - 10 * 60_000).toISOString() }],
  }), now);
  const result = summarizeCommandCenter([staleAgent, normalizeCommandCenterSource(snapshot("app-family"), now)], now);
  assert.equal(result.counts.working, 1);
  assert.equal(result.counts.stale, 1);
});

test("session identity remains separate from durable agent identity and unknown without telemetry", () => {
  const base = snapshot("public-ecosystem").agents[0];
  const session = {
    health: "healthy", runtime: "codex", sessionId: "runtime-session-2",
    lastCheckpoint: { id: "checkpoint-7", createdAt: new Date(now - 2000).toISOString() },
    rotation: { id: "rotation-1", state: "AWAITING_ACKNOWLEDGEMENT", updatedAt: new Date(now).toISOString() },
    history: [{ sessionId: "runtime-session-1", runtime: "claude", startedAt: new Date(now - 60_000).toISOString(), endedAt: new Date(now - 5000).toISOString(), state: "retired" }],
  };
  const source = normalizeCommandCenterSource(snapshot("public-ecosystem", { agents: [{ ...base, session }] }), now);
  assert.equal(source.agents[0].id, base.id);
  assert.equal(source.agents[0].session.sessionId, "runtime-session-2");
  assert.equal(source.agents[0].session.history[0].sessionId, "runtime-session-1");
  assert.equal(normalizeCommandCenterSource(snapshot("app-family"), now).agents[0].session, null);
  const stale = normalizeCommandCenterSource(snapshot("public-ecosystem", { agents: [{ ...base, updatedAt: new Date(now - 10 * 60_000).toISOString(), session }] }), now);
  assert.equal(summarizeCommandCenter([stale, normalizeCommandCenterSource(snapshot("app-family"), now)], now).agents[0].session.health, "unknown");
});

test("unsupported rotation is explicit and malformed session history is rejected", () => {
  const base = snapshot("public-ecosystem").agents[0];
  const session = { health: "unknown", rotation: { id: "rotation-2", state: "ROTATION_REQUIRES_RUNTIME_SUPPORT", updatedAt: new Date(now).toISOString() } };
  const normalized = normalizeCommandCenterSource(snapshot("public-ecosystem", { agents: [{ ...base, session }] }), now);
  assert.equal(normalized.agents[0].session.rotation.state, "ROTATION_REQUIRES_RUNTIME_SUPPORT");
  assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { agents: [{ ...base, session: { ...session, sessionId: "C:\\private\\session.json" } }] }), now), /invalid_telemetry/);
  assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { agents: [{ ...base, session: { ...session, history: [{ sessionId: "bad", runtime: "codex", startedAt: new Date(now).toISOString(), endedAt: new Date(now - 1000).toISOString(), state: "retired" }] } }] }), now), /invalid_session_history/);
});

test("handoff acknowledgement needs explicit delivery and acknowledgement evidence", () => {
  const base = { id: "handoff-1", project: "1stStep", updatedAt: new Date(now).toISOString(), from: "Auditor", to: "Lead", status: "acknowledged" };
  assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { handoffs: [{ ...base }] }), now), /invalid_handoff_state/);
  assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { handoffs: [{ ...base, deliveredAt: new Date(now).toISOString(), acknowledgedAt: new Date(now - 1000).toISOString() }] }), now), /invalid_handoff_state/);
  const valid = normalizeCommandCenterSource(snapshot("public-ecosystem", { handoffs: [{ ...base, deliveredAt: new Date(now).toISOString(), acknowledgedAt: new Date(now).toISOString() }] }), now);
  assert.equal(valid.handoffs[0].status, "acknowledged");
  assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { handoffs: [{ ...base, status: "in_progress", deliveredAt: new Date(now).toISOString() }] }), now), /invalid_handoff_state/);
  const queued = normalizeCommandCenterSource(snapshot("public-ecosystem", { handoffs: [{ ...base, status: "recipient_offline", recipientRole: "APP_LOOP", recipientAgentId: "app-loop-agent" }] }), now);
  assert.equal(queued.handoffs[0].acknowledgedAt, null);
  assert.equal(queued.handoffs[0].recipientAgentId, "app-loop-agent");
});

test("event truth state never upgrades a model report to observed proof", () => {
  const event = { id: "build-1", at: new Date(now).toISOString(), kind: "BUILD_PASSED", summary: "Build passed", project: "1stStep", agentId: "app-loop-agent", truthState: "AGENT_REPORTED", evidenceRefs: [] };
  const result = normalizeCommandCenterSource(snapshot("app-family", { events: [event, { ...event, id: "build-2", truthState: undefined }] }), now);
  assert.equal(result.events[0].truthState, "AGENT_REPORTED");
  assert.equal(result.events[1].truthState, "UNKNOWN");
  assert.equal(summarizeCommandCenter([result], now).events[0].truthState, "AGENT_REPORTED");
});

test("independent finding PASS needs auditor and evidence in the read model", () => {
  const finding = { id: "AUD-024", project: "1stStep", updatedAt: new Date(now).toISOString(), status: "pass", severity: "high", truthState: "AGENT_REPORTED" };
  assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { findings: [finding] }), now), /invalid_finding_verdict/);
  const verified = normalizeCommandCenterSource(snapshot("public-ecosystem", { findings: [{ ...finding, truthState: "AUDITOR_VERIFIED", auditorId: "eco-auditor", evidenceRef: "evidence-024" }] }), now);
  assert.equal(verified.findings[0].status, "pass");
  assert.equal(summarizeCommandCenter([verified], now).findings[0].truthState, "AUDITOR_VERIFIED");
});

test("telemetry rejects missing content-free attestation and secret-shaped labels", () => {
  assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { contentFree: false }), now), /invalid_telemetry/);
  assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { agents: [{ ...snapshot("public-ecosystem").agents[0], task: "contact foo@example.com" }] }), now), /invalid_telemetry/);
});

test("auditor collector emits only verified report and inbox metadata", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "firststep-command-center-test-"));
  try {
    const auditId = "11111111-1111-4111-8111-111111111111";
    const report = { auditId, taskId: "INFRA-001", repository: "C:\\Private\\1ststep.ai", candidateSha: "a".repeat(40), disposition: "FAIL", timestamp: new Date(now).toISOString(), findings: [{ severity: "high", evidence: "private material must not cross the bridge" }] };
    fs.mkdirSync(path.join(temp, "audits"));
    fs.mkdirSync(path.join(temp, "inbox", "lead-engineering-manager"), { recursive: true });
    fs.writeFileSync(path.join(temp, "audits", `${auditId}.json`), JSON.stringify(report));
    fs.writeFileSync(path.join(temp, "inbox", "lead-engineering-manager", `${auditId}.json`), JSON.stringify({ auditId, candidateSha: report.candidateSha, disposition: report.disposition, timestamp: report.timestamp }));
    const result = auditorSourceSnapshot(temp, new Date(now));
    assert.equal(result.registryComplete, false);
    assert.equal(result.agents.length, 0);
    assert.equal(result.audits[0].severity, "high");
    assert.equal(result.handoffs[0].status, "delivered");
    assert.equal(result.handoffs[0].osDelivery, "UNKNOWN");
    assert.equal(result.handoffs[0].acknowledgedAt, null);
    assert.equal(result.handoffs.length, 1);
    assert.equal(JSON.stringify(result).includes("private material"), false);
  } finally {
    if (!path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unexpected test cleanup path");
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("audit capacity projects durable job and provider state without candidate content", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-audit-capacity-"));
  try {
    const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const nowIso = new Date(now).toISOString();
    fs.mkdirSync(path.join(temp, "jobs"), { recursive: true });
    fs.mkdirSync(path.join(temp, "job-events", jobId), { recursive: true });
    fs.writeFileSync(path.join(temp, "jobs", `${jobId}.json`), JSON.stringify({ schemaVersion: 1, jobId, project: "app-family", findingOrTask: "AUD-024", createdAt: nowIso, status: "QUEUED", externalAiAllowed: true, dataClassification: "PUBLIC", privateDiff: "must not publish" }));
    fs.writeFileSync(path.join(temp, "job-events", jobId, "0000000001.json"), JSON.stringify({ jobId, status: "TIER_1_COMPLETE", provider: "openrouter-free-primary", model: "free-model", at: nowIso, sequence: 1 }));
    fs.writeFileSync(path.join(temp, "job-events", jobId, "0000000002.json"), JSON.stringify({ jobId, status: "AWAITING_CLAUDE", at: nowIso, sequence: 2 }));
    const result = auditorSourceSnapshot(temp, new Date(now));
    assert.equal(result.auditCapacity.auditQueue, 1);
    assert.equal(result.auditCapacity.claudeEscalation, 1);
    assert.equal(result.auditCapacity.jobs[0].findingId, "AUD-024");
    assert.equal(result.auditCapacity.activeJobs, 0);
    assert.equal(result.auditCapacity.providers.find((provider) => provider.id === "openrouter-free-primary").status, "AVAILABLE");
    assert.equal(result.auditCapacity.providers.find((provider) => provider.id === "openrouter-free-primary").model, "free-model");
    assert.equal(result.auditCapacity.providers.find((provider) => provider.id === "deepseek-paid").status, "DISABLED_BUDGET_0");
    assert.equal(JSON.stringify(result).includes("must not publish"), false);
    assert.throws(() => normalizeCommandCenterSource(snapshot("public-ecosystem", { auditCapacity: { ...result.auditCapacity, providers: [{ id: "openrouter", label: "contact foo@example.com", status: "AVAILABLE" }] } }), now), /invalid_telemetry/);
  } finally {
    if (!path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unexpected test cleanup path");
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("app-family auditor handoff distinguishes persisted OS delivery from runtime acknowledgement", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-mailbox-"));
  try {
    const auditId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const agentId = "app-loop-agent";
    const messageId = `${auditId}-${agentId}`;
    const stamp = new Date(now - 3000).toISOString();
    const queuedAt = new Date(now - 2000).toISOString();
    const report = { auditId, taskId: "AUD-024", project: "app-family", candidateSha: "a".repeat(40), disposition: "FAIL", timestamp: stamp, repository: "app-family", findings: [{ id: "AUD-024", severity: "high", evidence: "private material" }] };
    const message = { messageId, auditId, recipientAgentId: agentId, candidateSha: report.candidateSha, disposition: report.disposition, cycle: 2, findingIds: ["AUD-024"] };
    fs.mkdirSync(path.join(temp, "audits"), { recursive: true });
    fs.mkdirSync(path.join(temp, "mailbox", "messages"), { recursive: true });
    fs.mkdirSync(path.join(temp, "mailbox", "inbox", agentId), { recursive: true });
    fs.mkdirSync(path.join(temp, "mailbox", "runtime-failures"), { recursive: true });
    fs.writeFileSync(path.join(temp, "audits", `${auditId}.json`), JSON.stringify(report));
    fs.writeFileSync(path.join(temp, "mailbox", "messages", `${messageId}.json`), JSON.stringify(message));
    fs.writeFileSync(path.join(temp, "mailbox", "inbox", agentId, `${messageId}.json`), JSON.stringify({ messageId, recipientAgentId: agentId, queuedAt }));
    fs.writeFileSync(path.join(temp, "mailbox", "runtime-failures", `${messageId}.json`), JSON.stringify({ messageId, agentId, reason: "RUNTIME_MODEL_INCOMPATIBLE" }));
    let [handoff] = auditorSourceSnapshot(temp, new Date(now)).handoffs;
    assert.equal(handoff.cycle, 2);
    assert.equal(handoff.osDelivery, "AVAILABLE_TO_RECIPIENT");
    assert.equal(handoff.runtimeDelivery, "RUNTIME_INCOMPATIBLE");
    assert.equal(handoff.runtimeConsumption, "UNREAD");
    assert.equal(handoff.retained, true);
    assert.equal(JSON.stringify(handoff).includes("private material"), false);
    const receiptDir = path.join(temp, "mailbox", "receipts", agentId, messageId);
    fs.mkdirSync(receiptDir, { recursive: true });
    const sessionId = "codex-cycle-015";
    fs.writeFileSync(path.join(receiptDir, `${sessionId}.INGESTED.json`), JSON.stringify({ messageId, agentId, sessionId, state: "INGESTED", at: new Date(now - 1000).toISOString() }));
    fs.writeFileSync(path.join(receiptDir, `${sessionId}.ACKNOWLEDGED.json`), JSON.stringify({ messageId, agentId, sessionId, state: "ACKNOWLEDGED", at: new Date(now).toISOString() }));
    [handoff] = auditorSourceSnapshot(temp, new Date(now)).handoffs;
    assert.equal(handoff.runtimeConsumption, "ACKNOWLEDGED");
    assert.equal(handoff.runtimeDelivery, "ACKNOWLEDGED");
    assert.equal(handoff.status, "acknowledged");
  } finally {
    if (!path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unexpected test cleanup path");
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("read API is session-protected and ingest API is publisher-protected", async () => {
  const old = {
    session: process.env.FIRSTSTEP_ADMIN_SESSION_SECRET,
    publicKey: process.env.FIRSTSTEP_COMMAND_CENTER_PUBLIC_INGEST_SECRET,
    appKey: process.env.FIRSTSTEP_COMMAND_CENTER_APP_INGEST_SECRET,
    kvUrl: process.env.KV_REST_API_URL,
    kvToken: process.env.KV_REST_API_TOKEN,
    encryptionKey: process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY,
    fetch: globalThis.fetch,
  };
  const publicKey = "public0123456789abcdef0123456789abcdef";
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = "admin0123456789abcdef0123456789abcdef";
  process.env.FIRSTSTEP_COMMAND_CENTER_PUBLIC_INGEST_SECRET = publicKey;
  process.env.FIRSTSTEP_COMMAND_CENTER_APP_INGEST_SECRET = "app__0123456789abcdef0123456789abcdef";
  process.env.KV_REST_API_URL = "https://kv.example.test";
  process.env.KV_REST_API_TOKEN = "test-kv-token";
  process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = "11".repeat(32);
  const stored = new Map();
  globalThis.fetch = async (_url, options) => {
    const [operation, key, value] = JSON.parse(options.body);
    if (operation === "SET") { stored.set(key, value); return { ok: true, json: async () => ({ result: "OK" }) }; }
    return { ok: true, json: async () => ({ result: stored.get(key) ?? null }) };
  };
  try {
    const anonymous = responseRecorder();
    await readHandler({ method: "GET", headers: {} }, anonymous);
    assert.equal(anonymous.statusCode, 401);

    const noKey = responseRecorder();
    await ingestHandler({ method: "POST", headers: { "content-type": "application/json" }, body: snapshot("public-ecosystem") }, noKey);
    assert.equal(noKey.statusCode, 401);
    assert.equal(stored.size, 0);

    const published = responseRecorder();
    await ingestHandler({ method: "POST", headers: { "content-type": "application/json", "x-1ststep-command-center-key": publicKey }, body: snapshot("public-ecosystem", { observedAt: new Date().toISOString(), agents: [] }) }, published);
    assert.equal(published.statusCode, 200);
    assert.equal(stored.size, 1);
    assert.equal([...stored.values()][0].includes("Audit release candidate"), false);

    const token = createAdminSessionToken();
    const read = responseRecorder();
    await readHandler({ method: "GET", headers: { cookie: `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}` } }, read);
    assert.equal(read.statusCode, 200);
    const result = JSON.parse(read.body).commandCenter;
    assert.equal(result.coverage[0].state, "live");
    assert.equal(result.coverage[1].state, "unconnected");
    assert.equal(result.counts.registered, null);
    assert.equal(read.body.includes(publicKey), false);
    assert.equal(read.headers["Cache-Control"], "no-store, private");

    const forbiddenWrite = responseRecorder();
    await readHandler({ method: "POST", headers: { cookie: `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}` } }, forbiddenWrite);
    assert.equal(forbiddenWrite.statusCode, 405);
  } finally {
    for (const [key, name] of Object.entries({ session: "FIRSTSTEP_ADMIN_SESSION_SECRET", publicKey: "FIRSTSTEP_COMMAND_CENTER_PUBLIC_INGEST_SECRET", appKey: "FIRSTSTEP_COMMAND_CENTER_APP_INGEST_SECRET", kvUrl: "KV_REST_API_URL", kvToken: "KV_REST_API_TOKEN", encryptionKey: "FIRSTSTEP_DATA_ENCRYPTION_KEY" })) {
      if (old[key] === undefined) delete process.env[name]; else process.env[name] = old[key];
    }
    globalThis.fetch = old.fetch;
  }
});
