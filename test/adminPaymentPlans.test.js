import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePaymentPlan,
  paymentSchedule,
  paymentScheduleForQuote,
  safeStripePaymentUrl,
} from "../lib/admin/paymentPlans.js";

test("payment plans split the quote exactly without losing cents", () => {
  for (const plan of ["full", "two_payments", "three_payments", "four_monthly"]) {
    const schedule = paymentSchedule(1000.01, plan);
    assert.equal(
      schedule.reduce((sum, installment) => sum + installment.amount_cents, 0),
      100001
    );
  }
  assert.deepEqual(
    paymentSchedule(1000, "three_payments").map((installment) => installment.amount),
    [400, 300, 300]
  );
});

test("legacy quotes default to a three-payment schedule", () => {
  const quote = {
    line_items: [{ quantity: 1, rate: 750 }],
  };
  assert.equal(normalizePaymentPlan(), "three_payments");
  assert.deepEqual(
    paymentScheduleForQuote(quote).map((installment) => installment.amount),
    [300, 225, 225]
  );
});

test("only Stripe-hosted HTTPS payment links are accepted", () => {
  assert.equal(
    safeStripePaymentUrl("https://buy.stripe.com/test_123"),
    "https://buy.stripe.com/test_123"
  );
  assert.equal(safeStripePaymentUrl("http://buy.stripe.com/test_123"), null);
  assert.equal(safeStripePaymentUrl("https://example.com/pay"), null);
});
