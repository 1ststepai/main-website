import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/auto-model-router-feedback.js";
import {
  normalizeAutoModelRouterFeedback,
  validateAutoModelRouterFeedbackPayload,
} from "../lib/autoModelRouter/normalizeFeedback.js";
import {
  expectClosedDelivery,
  expectDelivered,
  expectOriginRejected,
  intakeRequest,
  intakeResponse,
} from "./intakeEndpointHarness.js";

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
  await expectDelivered(t, {
    handler,
    body: payload(),
    idempotencyKey: "amr:test:delivery:001",
    requestIdPattern: /^amr_/,
    omittedFields: ["email", "feedback"],
    providerMessageId: "email_amr_123",
    inspect(email) {
      assert.match(email.subject, /builder@example\.com/);
      assert.match(email.html, /builder@example\.com/);
      assert.match(email.html, /suggest-then-confirm/);
      assert.doesNotMatch(email.html, /malicious_field/);
      assert.equal(email.reply_to, "builder@example.com");
    },
  });
});

test("fails closed when feedback delivery is not configured", async (t) => {
  await expectClosedDelivery(t, handler, payload(), "amr:test:closed:001");
});

test("rejects hostile cross-origin feedback requests", async () => {
  await expectOriginRejected(handler, payload());
});

test("returns a clear validation error for email without opt-in", async () => {
  const response = intakeResponse();
  await handler(intakeRequest(payload({ opt_in: false }), { "idempotency-key": "amr:test:optin:001" }), response);
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 400);
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_auto_model_router_feedback");
  assert.ok(body.errors.some((error) => error.includes("opt-in is required")));
});
