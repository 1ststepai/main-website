import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/commercial-intake.js";
import {
  normalizeCommercialIntake,
  validateCommercialIntakePayload,
} from "../lib/commercialIntake/normalizeCommercialIntake.js";

const original = {
  fetch: globalThis.fetch,
  resend: process.env.RESEND_API_KEY,
  from: process.env.COMMERCIAL_INTAKE_NOTIFY_FROM,
  productionTo: process.env.COMMERCIAL_INTAKE_NOTIFY_TO,
  previewTo: process.env.COMMERCIAL_INTAKE_PREVIEW_TO,
  previewEnabled: process.env.COMMERCIAL_INTAKE_PREVIEW_ENABLED,
  vercelEnv: process.env.VERCEL_ENV,
};

test.afterEach(() => {
  globalThis.fetch = original.fetch;
  for (const [name, value] of Object.entries({
    RESEND_API_KEY: original.resend,
    COMMERCIAL_INTAKE_NOTIFY_FROM: original.from,
    COMMERCIAL_INTAKE_NOTIFY_TO: original.productionTo,
    COMMERCIAL_INTAKE_PREVIEW_TO: original.previewTo,
    COMMERCIAL_INTAKE_PREVIEW_ENABLED: original.previewEnabled,
    VERCEL_ENV: original.vercelEnv,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function payload(overrides = {}) {
  return {
    intent: "build_new",
    build_category: "web-app-saas",
    desired_result: "Launch a focused customer portal.",
    current_stage: "idea",
    what_exists: "A validated workflow and rough wireframes.",
    project_url: "example.com/product",
    current_tools: "Email and spreadsheets",
    biggest_blocker: "Turning the workflow into a reliable first version.",
    deadline: "1-2-months",
    budget_range: "10k-25k",
    email: "Owner@Example.com",
    consent: true,
    attribution: { utm_source: "linkedin", landing_path: "/", malicious_field: "drop-me" },
    ...overrides,
  };
}

function req(body = payload(), overrides = {}) {
  return {
    method: "POST",
    headers: {
      origin: "https://www.1ststep.ai",
      host: "www.1ststep.ai",
      "content-type": "application/json",
      "idempotency-key": `commercial:${Math.random().toString(36).slice(2)}`,
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 150) + 1}`,
    },
    body,
    ...overrides,
  };
}

function res() {
  const headers = new Map();
  return {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(value = "") { this.rawBody = value; this.body = value ? JSON.parse(value) : null; },
  };
}

function configureProductionDelivery() {
  process.env.VERCEL_ENV = "production";
  process.env.RESEND_API_KEY = "re_test";
  process.env.COMMERCIAL_INTAKE_NOTIFY_FROM = "1stStep Test <test@example.com>";
  process.env.COMMERCIAL_INTAKE_NOTIFY_TO = "owner@example.com";
}

test("normalizes all three commercial intents and allowlists attribution", () => {
  const build = normalizeCommercialIntake(payload());
  assert.equal(build.email, "owner@example.com");
  assert.equal(build.project_url, "https://example.com/product");
  assert.equal(build.attribution.utm_source, "linkedin");
  assert.equal(build.attribution.malicious_field, undefined);

  const finish = normalizeCommercialIntake(payload({
    intent: "finish_build",
    build_category: "",
    current_stage: "started",
  }));
  assert.equal(finish.intent, "finish_build");
  assert.equal(finish.build_category, "");

  const automate = normalizeCommercialIntake(payload({
    intent: "automate_business",
    build_category: "",
    current_stage: "manual-workflow",
  }));
  assert.equal(automate.intent, "automate_business");
});

test("rejects unsafe URLs, unexpected fields, missing consent, and incompatible categories", () => {
  assert.match(validateCommercialIntakePayload(payload({ project_url: "javascript:alert(1)" })).join(" "), /valid public website/i);
  assert.match(validateCommercialIntakePayload(payload({ admin: true })).join(" "), /unexpected fields: admin/);
  assert.match(validateCommercialIntakePayload(payload({ consent: false })).join(" "), /consent is required/);
  assert.match(validateCommercialIntakePayload(payload({ intent: "finish_build" })).join(" "), /only available for new builds/);
});

test("returns provider-accepted success without claiming inbox delivery", async () => {
  configureProductionDelivery();
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ id: "email_test_1" }, { status: 200 });
  };
  const response = res();
  await handler(req(), response);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.accepted, true);
  assert.equal(response.body.message, "Your request was sent successfully.");
  assert.doesNotMatch(response.body.message, /inbox|read|received by Evan|CRM/i);
  assert.match(sent.subject, /1stStep commercial request/);
  assert.doesNotMatch(sent.subject, /PREVIEW TEST/);
});

test("Preview delivery fails closed unless its dedicated configuration is enabled", async () => {
  process.env.VERCEL_ENV = "preview";
  process.env.RESEND_API_KEY = "re_test";
  process.env.COMMERCIAL_INTAKE_NOTIFY_FROM = "1stStep Test <test@example.com>";
  process.env.COMMERCIAL_INTAKE_NOTIFY_TO = "production@example.com";
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return Response.json({ id: "unexpected" }); };
  const response = res();
  await handler(req(), response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "delivery_unavailable");
  assert.equal(fetchCalled, false);
});

test("Preview delivery uses only the dedicated recipient and a test prefix", async () => {
  process.env.VERCEL_ENV = "preview";
  process.env.RESEND_API_KEY = "re_test";
  process.env.COMMERCIAL_INTAKE_NOTIFY_FROM = "1stStep Test <test@example.com>";
  process.env.COMMERCIAL_INTAKE_NOTIFY_TO = "production@example.com";
  process.env.COMMERCIAL_INTAKE_PREVIEW_TO = "preview@example.com";
  process.env.COMMERCIAL_INTAKE_PREVIEW_ENABLED = "true";
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ id: "email_preview_1" });
  };
  const response = res();
  await handler(req(), response);
  assert.equal(response.statusCode, 201);
  assert.deepEqual(sent.to, ["preview@example.com"]);
  assert.match(sent.subject, /^\[PREVIEW TEST\]/);
});

test("rejects hostile origins and oversized request bodies", async () => {
  const hostile = res();
  await handler(req(payload(), { headers: { origin: "https://attacker.example", host: "www.1ststep.ai", "content-type": "application/json" } }), hostile);
  assert.equal(hostile.statusCode, 403);

  const oversized = res();
  await handler(req(JSON.stringify({ ...payload(), desired_result: "x".repeat(25 * 1024) })), oversized);
  assert.equal(oversized.statusCode, 413);
});

test("replays identical idempotent submissions and rejects conflicting reuse", async () => {
  configureProductionDelivery();
  let sends = 0;
  globalThis.fetch = async () => { sends += 1; return Response.json({ id: `email_${sends}` }); };
  const sharedKey = "commercial:stable-test-key";
  const firstRequest = req();
  firstRequest.headers["idempotency-key"] = sharedKey;
  const first = res();
  await handler(firstRequest, first);

  const replayRequest = req(payload());
  replayRequest.headers["idempotency-key"] = sharedKey;
  const replay = res();
  await handler(replayRequest, replay);
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.getHeader("Idempotency-Replayed"), "true");
  assert.equal(sends, 1);

  const conflictRequest = req(payload({ desired_result: "A different result" }));
  conflictRequest.headers["idempotency-key"] = sharedKey;
  const conflict = res();
  await handler(conflictRequest, conflict);
  assert.equal(conflict.statusCode, 409);
});

test("rate limiting stops the thirteenth request from one source", async () => {
  const source = `198.51.100.${Math.floor(Math.random() * 100) + 1}`;
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const response = res();
    const request = req(payload());
    request.headers["x-forwarded-for"] = source;
    await handler(request, response);
    if (attempt === 12) {
      assert.equal(response.statusCode, 429);
      assert.equal(response.body.code, "rate_limited");
    }
  }
});
