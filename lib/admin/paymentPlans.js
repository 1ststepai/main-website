export const PAYMENT_PLANS = [
  { id: "full", label: "Pay in full", installments: 1 },
  { id: "two_payments", label: "2 payments", installments: 2 },
  { id: "three_payments", label: "3 payments", installments: 3 },
  { id: "four_monthly", label: "4 monthly payments", installments: 4 },
];

const PLAN_IDS = new Set(PAYMENT_PLANS.map((plan) => plan.id));

export function normalizePaymentPlan(value) {
  return PLAN_IDS.has(value) ? value : "three_payments";
}

export function quoteTotal(quote) {
  return (quote.line_items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
    0
  );
}

function splitCents(totalCents, weights) {
  const amounts = weights.map((weight) => Math.floor(totalCents * weight));
  amounts[amounts.length - 1] += totalCents - amounts.reduce((sum, amount) => sum + amount, 0);
  return amounts;
}

export function paymentSchedule(total, paymentPlan) {
  const totalCents = Math.max(0, Math.round(Number(total || 0) * 100));
  const plan = normalizePaymentPlan(paymentPlan);
  const definitions = {
    full: {
      weights: [1],
      labels: ["Pay in full"],
      due: ["On approval"],
    },
    two_payments: {
      weights: [0.5, 0.5],
      labels: ["Project deposit", "Final payment"],
      due: ["On approval", "Before launch or final handoff"],
    },
    three_payments: {
      weights: [0.4, 0.3, 0.3],
      labels: ["Project deposit", "Design milestone", "Final payment"],
      due: ["On approval", "After design approval", "Before launch or final handoff"],
    },
    four_monthly: {
      weights: [0.25, 0.25, 0.25, 0.25],
      labels: ["First payment", "Second payment", "Third payment", "Final payment"],
      due: ["On approval", "30 days after approval", "60 days after approval", "90 days after approval"],
    },
  };
  const definition = definitions[plan];
  const amounts = splitCents(totalCents, definition.weights);
  return amounts.map((amountCents, index) => ({
    installment_number: index + 1,
    label: definition.labels[index],
    due: definition.due[index],
    amount_cents: amountCents,
    amount: amountCents / 100,
  }));
}

export function paymentScheduleForQuote(quote) {
  return paymentSchedule(quoteTotal(quote), quote.payment_plan);
}

export function paymentPlanLabel(value) {
  return PAYMENT_PLANS.find((plan) => plan.id === normalizePaymentPlan(value))?.label || "3 payments";
}

export function safeStripePaymentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === "buy.stripe.com" ? url.toString() : null;
  } catch {
    return null;
  }
}
