import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/fit-check.js";
import { normalizeFitCheck, validateFitCheckPayload } from "../lib/fitCheck/normalizeFitCheck.js";
import { expectClosedDelivery, expectDelivered, expectOriginRejected } from "./intakeEndpointHarness.js";

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
  await expectDelivered(t, {
    handler,
    body: payload(),
    idempotencyKey: "fit:test:delivery:001",
    requestIdPattern: /^fit_/,
    omittedFields: ["email", "website_url"],
    providerMessageId: "email_test_123",
    inspect(email) {
      assert.match(email.subject, /example\.com/);
      assert.match(email.html, /owner@example\.com/);
      assert.doesNotMatch(email.html, /malicious_field/);
    },
  });
});

test("fails closed when fit-check delivery is not configured", async (t) => {
  await expectClosedDelivery(t, handler, payload(), "fit:test:closed:001");
});

test("rejects hostile cross-origin fit-check requests", async () => {
  await expectOriginRejected(handler, payload());
});
