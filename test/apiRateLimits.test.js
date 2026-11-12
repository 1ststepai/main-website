import test from "node:test";
import assert from "node:assert/strict";
import reviewsHandler from "../api/google-reviews.js";
import webhookHandler from "../api/leadconnector-booking-confirmed.js";
import { checkRateLimit, resetRateLimit } from "../lib/http/rateLimit.js";

function mockRes() {
  const headers = new Map();
  return {
    statusCode: 200,
    headers,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    end(value = "") {
      this.rawBody = value;
      this.body = value ? JSON.parse(value) : null;
    },
  };
}

test("google reviews and the booking webhook return 429 with Retry-After after the per-IP limit", async () => {
  resetRateLimit();
  const reviewsIp = "203.0.113.110";
  const webhookIp = "203.0.113.111";
  for (let index = 0; index < 60; index += 1) {
    assert.equal(checkRateLimit({ headers: { "x-real-ip": reviewsIp } }, "google-reviews").allowed, true);
    assert.equal(checkRateLimit({ headers: { "x-real-ip": webhookIp } }, "booking-webhook").allowed, true);
  }

  const reviewsRes = mockRes();
  await reviewsHandler({
    method: "GET",
    headers: {
      origin: "https://www.1ststep.ai",
      host: "www.1ststep.ai",
      "x-real-ip": reviewsIp,
    },
  }, reviewsRes);
  assert.equal(reviewsRes.statusCode, 429);
  assert.equal(reviewsRes.body.code, "rate_limited");
  assert.ok(Number(reviewsRes.headers.get("retry-after")) >= 1);

  const previousSecret = process.env.LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET;
  process.env.LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET = "rate-limit-test-secret";
  try {
    const webhookRes = mockRes();
    await webhookHandler({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": webhookIp,
        authorization: "Bearer rate-limit-test-secret",
      },
      body: { appointmentId: "appt_test" },
    }, webhookRes);
    assert.equal(webhookRes.statusCode, 429);
    assert.equal(webhookRes.body.code, "rate_limited");
    assert.ok(Number(webhookRes.headers.get("retry-after")) >= 1);
  } finally {
    if (previousSecret === undefined) delete process.env.LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET;
    else process.env.LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET = previousSecret;
  }
});
