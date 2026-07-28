import Stripe from "stripe";
import {
  paymentScheduleForQuote,
  safeStripePaymentUrl,
} from "./paymentPlans.js";

export const STRIPE_API_VERSION = "2026-02-25.clover";

function paymentError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function createStripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "");
  if (!secretKey.startsWith("sk_") || secretKey.length < 20) {
    throw paymentError("Stripe card payments are not configured.", "stripe_not_configured", 503);
  }
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
  });
}

export async function createQuotePaymentLink({
  quote,
  client,
  installmentNumber,
  idempotencyKey,
  stripe = createStripeClient(),
}) {
  const installment = paymentScheduleForQuote(quote)
    .find((item) => item.installment_number === installmentNumber);
  if (!installment || installment.amount_cents < 50) {
    throw paymentError("That payment installment is not available.", "invalid_installment", 400);
  }
  const customerEmail = String(client.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw paymentError("Add a valid client email before creating a card link.", "client_email_required", 400);
  }

  const metadata = {
    quote_id: quote.id,
    quote_number: quote.quote_number,
    installment_number: String(installment.installment_number),
    payment_plan: quote.payment_plan,
  };
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{
      price_data: {
        currency: "usd",
        unit_amount: installment.amount_cents,
        product_data: {
          name: `${quote.project_title || "1stStep.ai project"} — ${installment.label}`.slice(0, 200),
          description: `Quote ${quote.quote_number}. ${installment.due}.`.slice(0, 500),
          metadata,
        },
      },
      quantity: 1,
    }],
    after_completion: {
      type: "hosted_confirmation",
      hosted_confirmation: {
        custom_message: "Payment received. Evan at 1stStep.ai will confirm the next step by email.",
      },
    },
    billing_address_collection: "auto",
    customer_creation: "always",
    metadata,
    restrictions: {
      completed_sessions: {
        limit: 1,
      },
    },
    submit_type: "pay",
  }, {
    idempotencyKey,
  });

  const url = safeStripePaymentUrl(paymentLink.url);
  if (!paymentLink.id || !url) {
    throw paymentError("Stripe did not return a valid payment link.", "payment_link_failed", 503);
  }
  return {
    installment_number: installment.installment_number,
    label: installment.label,
    amount: installment.amount,
    url,
    stripe_payment_link_id: paymentLink.id,
    created_at: new Date().toISOString(),
  };
}

export async function deactivateQuotePaymentLink(paymentLinkId, stripe = createStripeClient()) {
  if (!paymentLinkId) return;
  await stripe.paymentLinks.update(paymentLinkId, { active: false });
}

export async function deactivateQuotePaymentLinks(paymentLinks, stripe = createStripeClient()) {
  const identifiers = [...new Set((paymentLinks || [])
    .map((link) => String(link?.stripe_payment_link_id || "").trim())
    .filter(Boolean))];
  await Promise.all(identifiers.map((paymentLinkId) => (
    deactivateQuotePaymentLink(paymentLinkId, stripe)
  )));
  return identifiers.length;
}
