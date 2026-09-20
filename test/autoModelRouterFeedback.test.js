import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/auto-model-router-feedback.js";
import {
  normalizeAutoModelRouterFeedback,
  validateAutoModelRouterFeedbackPayload,
} from "../lib/autoModelRouter/normalizeFeedback.js";
import { mockJsonRequest, mockResponse } from "./helpers/publicApi.js";

function payload(overrides = {}) {
  return {
    email: "builder@example.com",
    feedback: "The suggest-then-confirm step is clear. A shorter INSTALL snippet would help.",
    opt_in: true,
    attribution: {
      utm_source: "github",
      utm_campaign: "auto-model-router",
      malicious_field: "<script>alert(1)</script>",
    },
    ...overrides,
  };
}

test("accepts feedback without an email and does not invent opt-in", () => {
  const result = normalizeAutoModelRouterFeedback(payload({
    email: "",
    opt_in: false,
  }));
  assert.equal(result.email, "");
  assert.equal(result.opt_in, false);
  assert.match(result.feedback, /suggest-then-confirm/);
  assert.equal(result.attribution.utm_source, "github");
  assert.equal(result.attribution.malicious_field, undefined);
  assert.match(result.request_id, /^amr_/);
});

test("accepts an opted-in email without written feedback", () => {
  const result = normalizeAutoModelRouterFeedback(payload({
    feedback: "   ",
    opt_in: true,
  }));
  assert.equal(result.email, "builder@example.com");
  assert.equal(result.feedback, "");
  assert.equal(result.opt_in, true);
});

test("rejects empty submissions, email without opt-in, and unexpected fields", () => {
  assert.ok(
    validateAutoModelRouterFeedbackPayload({ email: "", feedback: "", opt_in: false })
      .some((error) => error.includes("feedback or email is required"))
  );
  assert.ok(
    validateAutoModelRouterFeedbackPayload(payload({ opt_in: false }))
      .some((error) => error.includes("opt-in is required"))
  );
  assert.ok(
    validateAutoModelRouterFeedbackPayload(payload({ newsletter: true }))
      .some((error) => error.includes("unexpected fields"))
  );
});

test("delivers a notification without echoing personal data", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const email = JSON.parse(options.body);
    assert.match(email.subject, /builder@example\.com/);
    assert.match(email.html, /builder@example\.com/);
    assert.match(email.html, /suggest-then-confirm/);
    assert.doesNotMatch(email.html, /malicious_field/);
    assert.equal(email.reply_to, "builder@example.com");
    return new Response(JSON.stringify({ id: "email_amr_123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  t.mock.method(console, "log", () => {});
  process.env.RESEND_API_KEY = "re_test";
  process.env.APP_IDEA_NOTIFY_TO = "owner@1ststep.ai";
  process.env.APP_IDEA_NOTIFY_FROM = "Website <website@1ststep.ai>";

  const req = mockJsonRequest(payload(), { "idempotency-key": "amr:test:delivery:001" });
  const res = mockResponse();
  await handler(req, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 201);
  assert.equal(body.ok, true);
  assert.match(body.request_id, /^amr_/);
  assert.equal(body.email, undefined);
  assert.equal(body.feedback, undefined);
});

test("fails closed when feedback delivery is not configured", async (t) => {
  t.mock.method(console, "error", () => {});
  delete process.env.RESEND_API_KEY;
  delete process.env.APP_IDEA_NOTIFY_TO;
  delete process.env.APP_IDEA_NOTIFY_FROM;

  const req = mockJsonRequest(payload(), { "idempotency-key": "amr:test:closed:001" });
  const res = mockResponse();
  await handler(req, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 503);
  assert.equal(body.ok, false);
  assert.equal(body.code, "delivery_unavailable");
});

test("rejects hostile cross-origin feedback requests", async () => {
  const req = mockJsonRequest(payload(), { origin: "https://attacker.example" });
  const res = mockResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).code, "origin_not_allowed");
});

test("returns a clear validation error for email without opt-in", async () => {
  const req = mockJsonRequest(payload({ opt_in: false }), { "idempotency-key": "amr:test:optin:001" });
  const res = mockResponse();
  await handler(req, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 400);
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_auto_model_router_feedback");
  assert.ok(body.errors.some((error) => error.includes("opt-in is required")));
});
