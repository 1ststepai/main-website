import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/fit-check.js";
import { normalizeFitCheck, validateFitCheckPayload } from "../lib/fitCheck/normalizeFitCheck.js";

function payload(overrides = {}) {
  return {
    website_url: "example.com",
    email: "owner@example.com",
    timeline: "1-2-months",
    budget_range: "10k-25k",
    attribution: {
      utm_source: "linkedin",
      utm_campaign: "website-rebuild",
      malicious_field: "<script>alert(1)</script>",
    },
    ...overrides,
  };
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: "",
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), String(value));
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

function mockRequest(body, headers = {}) {
  return {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      host: "www.1ststep.ai",
      origin: "https://www.1ststep.ai",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 180) + 1}`,
      ...headers,
    },
  };
}

test("normalizes the four fit-check fields and allowlists attribution", () => {
  const result = normalizeFitCheck(payload());
  assert.equal(result.website_url, "https://example.com/");
  assert.equal(result.email, "owner@example.com");
  assert.equal(result.timeline, "1-2-months");
  assert.equal(result.budget_range, "10k-25k");
  assert.equal(result.attribution.utm_source, "linkedin");
  assert.equal(result.attribution.malicious_field, undefined);
});

test("rejects unsupported options and unexpected top-level fields", () => {
  const errors = validateFitCheckPayload(payload({
    timeline: "tomorrow-maybe",
    admin: true,
  }));
  assert.ok(errors.some((error) => error.includes("unexpected fields")));
  assert.ok(errors.some((error) => error.includes("timeline")));
});

test("delivers a fit-check notification without echoing personal data", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const email = JSON.parse(options.body);
    assert.match(email.subject, /example\.com/);
    assert.match(email.html, /owner@example\.com/);
    assert.doesNotMatch(email.html, /malicious_field/);
    return new Response(JSON.stringify({ id: "email_test_123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  t.mock.method(console, "log", () => {});
  process.env.RESEND_API_KEY = "re_test";
  process.env.APP_IDEA_NOTIFY_TO = "owner@1ststep.ai";
  process.env.APP_IDEA_NOTIFY_FROM = "Website <website@1ststep.ai>";

  const req = mockRequest(payload(), { "idempotency-key": "fit:test:delivery:001" });
  const res = mockResponse();
  await handler(req, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 201);
  assert.equal(body.ok, true);
  assert.match(body.request_id, /^fit_/);
  assert.equal(body.email, undefined);
  assert.equal(body.website_url, undefined);
});

test("fails closed when fit-check delivery is not configured", async (t) => {
  t.mock.method(console, "error", () => {});
  delete process.env.RESEND_API_KEY;
  delete process.env.APP_IDEA_NOTIFY_TO;
  delete process.env.APP_IDEA_NOTIFY_FROM;

  const req = mockRequest(payload(), { "idempotency-key": "fit:test:closed:001" });
  const res = mockResponse();
  await handler(req, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 503);
  assert.equal(body.ok, false);
  assert.equal(body.code, "delivery_unavailable");
});

test("rejects hostile cross-origin fit-check requests", async () => {
  const req = mockRequest(payload(), { origin: "https://attacker.example" });
  const res = mockResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).code, "origin_not_allowed");
});

