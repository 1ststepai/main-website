import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { decryptProtectedJson } from "../lib/security/dataProtection.js";
import { createAdminSessionToken, ADMIN_COOKIE_NAME } from "../lib/admin/auth.js";
import { normalizeJourneyRequest, saveJourneyRequest } from "../lib/journey/intakeStore.js";
import publicHandler from "../api/journey-intake.js";
import adminHandler from "../api/admin-journey-requests.js";

const original = {
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
  key: process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY,
  session: process.env.FIRSTSTEP_ADMIN_SESSION_SECRET,
  fetch: globalThis.fetch,
};
test.after(() => {
  for (const [name, value] of Object.entries({
    KV_REST_API_URL: original.url,
    KV_REST_API_TOKEN: original.token,
    FIRSTSTEP_DATA_ENCRYPTION_KEY: original.key,
    FIRSTSTEP_ADMIN_SESSION_SECRET: original.session,
  })) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  globalThis.fetch = original.fetch;
});

function payload(overrides = {}) {
  return {
    request_id: randomUUID(),
    email: "Founder@Example.com",
    consent: true,
    intent: "ai-operations-audit",
    answers: {
      business: "A local moving company",
      demand: "existing",
      goal: "Respond to leads promptly",
      stack: "Website, email, spreadsheet",
      bottleneck: "routing",
      bottleneck_detail: "No clear owner",
      outcome: "Every inquiry assigned",
      team: "small",
      timing: "quarter",
    },
    attribution: { utm_source: "newsletter" },
    ...overrides,
  };
}

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(value) { this.body = JSON.parse(value); },
  };
}

function installKv() {
  process.env.KV_REST_API_URL = "https://kv.example.com";
  process.env.KV_REST_API_TOKEN = "test-token";
  process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = "a".repeat(64);
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = "test-admin-session-secret-with-sufficient-length";
  const records = new Map();
  const counts = new Map();
  globalThis.fetch = async (_url, options) => {
    const [command, ...parts] = JSON.parse(options.body);
    if (command === "SET") {
      const [key, value] = parts;
      const target = key.startsWith("journey:rate:") ? counts : records;
      if (parts.includes("NX") && target.has(key)) return Response.json({ result: null });
      target.set(key, value);
      return Response.json({ result: "OK" });
    }
    if (command === "INCR") {
      const count = Number(counts.get(parts[0]) || 0) + 1;
      counts.set(parts[0], String(count));
      return Response.json({ result: count });
    }
    if (command === "GET") return Response.json({ result: records.get(parts[0]) || null });
    if (command === "SCAN") return Response.json({ result: ["0", [...records.keys()].filter((key) => key.startsWith("journey:lead:"))] });
    if (command === "MGET") return Response.json({ result: parts.map((key) => records.get(key) || null) });
    return Response.json({ error: "unknown command" });
  };
  return records;
}

test("Journey intake rejects missing consent and invalid facts before persistence", () => {
  assert.throws(() => normalizeJourneyRequest(payload({ consent: false })), { code: "consent_required" });
  assert.throws(() => normalizeJourneyRequest(payload({ answers: { ...payload().answers, demand: "invented" } })), { code: "invalid_request" });
  assert.throws(() => normalizeJourneyRequest(payload({ email: "not-email" })), { code: "invalid_email" });
  assert.throws(() => normalizeJourneyRequest(payload({ intent: "unknown-offer" })), { code: "invalid_request" });
});

test("encrypted lead receipt is idempotent, conflicts safely, and requires an admin session to read", async () => {
  const records = installKv();
  const input = payload();
  const publicReq = { method: "POST", headers: { origin: "https://1ststep.ai", host: "1ststep.ai", "content-type": "application/json", "x-forwarded-for": "203.0.113.38" }, body: input };
  const first = response();
  await publicHandler(publicReq, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.persisted, true);
  assert.equal(records.size, 1);
  const stored = [...records.values()][0];
  assert.equal(stored.includes("Founder@Example.com"), false);
  assert.equal(decryptProtectedJson(stored, "journey-intake").email, "founder@example.com");
  assert.equal(decryptProtectedJson(stored, "journey-intake").intent, "ai-operations-audit");

  const repeat = response();
  await publicHandler(publicReq, repeat);
  assert.equal(repeat.body.replayed, true);
  assert.equal(records.size, 1);

  const changed = response();
  await publicHandler({ ...publicReq, body: { ...input, email: "other@example.com" } }, changed);
  assert.equal(changed.statusCode, 409);

  const denied = response();
  await adminHandler({ method: "GET", headers: {} }, denied);
  assert.equal(denied.statusCode, 401);
  const allowed = response();
  await adminHandler({ method: "GET", headers: { cookie: `${ADMIN_COOKIE_NAME}=${createAdminSessionToken()}` }, query: {} }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.requests.length, 1);
  assert.equal(allowed.body.requests[0].email, "founder@example.com");
  assert.equal(allowed.body.requests[0].intent, "ai-operations-audit");
});

test("missing durable storage fails closed without a false receipt", async () => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const res = response();
  await publicHandler({ method: "POST", headers: { origin: "https://1ststep.ai", host: "1ststep.ai", "content-type": "application/json", "x-forwarded-for": "203.0.113.39" }, body: payload() }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, "intake_unavailable");
});

test("durable rate limit stops a burst across requests", async () => {
  const records = installKv();
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const res = response();
    await publicHandler({ method: "POST", headers: { origin: "https://1ststep.ai", host: "1ststep.ai", "content-type": "application/json", "x-forwarded-for": "203.0.113.92" }, body: payload() }, res);
    assert.equal(res.statusCode, attempt < 12 ? 200 : 429);
  }
  assert.equal(records.size, 12);
});
