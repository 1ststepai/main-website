import test from "node:test";
import assert from "node:assert/strict";
import {
  STRIPE_API_VERSION,
  createQuotePaymentLink,
  deactivateQuotePaymentLinks,
} from "../lib/admin/stripePayments.js";

function fixture() {
  return {
    client: {
      email: "owner@example.com",
    },
    quote: {
      id: "quote_1",
      quote_number: "FS-0001",
      project_title: "Website build",
      payment_plan: "three_payments",
      line_items: [{ quantity: 1, rate: 5000 }],
    },
  };
}

test("Stripe payment links use the server-calculated installment and dynamic methods", async () => {
  let request;
  const stripe = {
    paymentLinks: {
      create: async (payload, options) => {
        request = { payload, options };
        return {
          id: "plink_123",
          url: "https://buy.stripe.com/test_123",
        };
      },
    },
  };
  const result = await createQuotePaymentLink({
    ...fixture(),
    installmentNumber: 1,
    idempotencyKey: "payment-link/quote_1/1/request_1",
    stripe,
  });

  assert.equal(STRIPE_API_VERSION, "2026-02-25.clover");
  assert.equal(request.payload.line_items[0].price_data.unit_amount, 200000);
  assert.equal(request.payload.restrictions.completed_sessions.limit, 1);
  assert.equal("payment_method_types" in request.payload, false);
  assert.equal(request.options.idempotencyKey, "payment-link/quote_1/1/request_1");
  assert.equal(result.amount, 2000);
  assert.equal(result.url, "https://buy.stripe.com/test_123");
});

test("Stripe payment links require a valid client email and installment", async () => {
  const data = fixture();
  data.client.email = "not-an-email";
  await assert.rejects(
    createQuotePaymentLink({
      ...data,
      installmentNumber: 1,
      idempotencyKey: "payment-link/quote_1/1/request_2",
      stripe: { paymentLinks: { create: async () => ({}) } },
    }),
    /valid client email/
  );
  await assert.rejects(
    createQuotePaymentLink({
      ...fixture(),
      installmentNumber: 4,
      idempotencyKey: "payment-link/quote_1/4/request_3",
      stripe: { paymentLinks: { create: async () => ({}) } },
    }),
    /not available/
  );
});

test("saved Stripe payment links can all be deactivated before repricing", async () => {
  const updated = [];
  const stripe = {
    paymentLinks: {
      update: async (id, patch) => {
        updated.push({ id, patch });
        return { id, active: false };
      },
    },
  };
  const count = await deactivateQuotePaymentLinks([
    { stripe_payment_link_id: "plink_1" },
    { stripe_payment_link_id: "plink_2" },
  ], stripe);
  assert.equal(count, 2);
  assert.deepEqual(updated, [
    { id: "plink_1", patch: { active: false } },
    { id: "plink_2", patch: { active: false } },
  ]);
});
