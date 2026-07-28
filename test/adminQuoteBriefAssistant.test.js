import test from "node:test";
import assert from "node:assert/strict";
import { draftQuoteFromBrief } from "../lib/admin/quoteBriefAssistant.js";
import { DEFAULT_PRICING_STRUCTURES } from "../lib/admin/workspaceModel.js";

function total(draft) {
  const amount = draft.line_items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  return Math.round(amount * 100) / 100;
}

test("an animation-led website brief becomes a detailed premium motion quote", () => {
  const draft = draftQuoteFromBrief(
    "Build a premium six-page website with custom animations, 3D product storytelling, a CMS, analytics, and a booking form.",
    DEFAULT_PRICING_STRUCTURES,
  );

  assert.equal(draft.structure_id, "premium-motion-website");
  assert.equal(draft.document_depth, "comprehensive");
  assert.equal(draft.template_id, "website-build-detailed");
  assert.equal(total(draft), 6500);
  assert.ok(draft.detected_features.includes("Custom animation"));
  assert.ok(draft.line_items.length >= 4);
});

test("a current WordPress repair request uses the website rescue structure", () => {
  const draft = draftQuoteFromBrief(
    "The client has a current WordPress website. Fix the broken contact form, clean up mobile spacing, and improve the homepage.",
    DEFAULT_PRICING_STRUCTURES,
  );

  assert.equal(draft.structure_id, "website-rescue");
  assert.equal(draft.document_depth, "essential");
  assert.equal(draft.template_id, "website-rescue");
  assert.equal(total(draft), 750);
  assert.ok(draft.detected_features.includes("WordPress"));
});

test("an iOS MVP with accounts and payments receives the detailed app agreement", () => {
  const draft = draftQuoteFromBrief(
    "Create an iOS MVP with user accounts, Stripe payments, push notifications, an API backend, and App Store submission.",
    DEFAULT_PRICING_STRUCTURES,
  );

  assert.equal(draft.structure_id, "ios-mvp");
  assert.equal(draft.service_type, "app");
  assert.equal(draft.document_depth, "comprehensive");
  assert.equal(draft.template_id, "ios-app-build-detailed");
  assert.equal(total(draft), 10500);
  assert.ok(draft.detected_features.includes("User accounts"));
  assert.ok(draft.detected_features.includes("Payments"));
});

test("a focused landing page gets a basic single-page quote", () => {
  const draft = draftQuoteFromBrief(
    "I need one landing page for a local campaign with a lead form and analytics.",
    DEFAULT_PRICING_STRUCTURES,
  );

  assert.equal(draft.structure_id, "single-page-launch");
  assert.equal(draft.document_depth, "essential");
  assert.equal(draft.template_id, "quick-estimate");
  assert.equal(total(draft), 1250);
});

test("monthly website maintenance stays a retainer with one monthly line item", () => {
  const draft = draftQuoteFromBrief(
    "Ongoing monthly website maintenance, plugin updates, uptime checks, and small content changes.",
    DEFAULT_PRICING_STRUCTURES,
  );

  assert.equal(draft.structure_id, "website-care");
  assert.equal(draft.service_type, "retainer");
  assert.equal(draft.template_id, "website-care");
  assert.equal(draft.payment_plan, "full");
  assert.equal(draft.line_items.length, 1);
  assert.equal(total(draft), 149);
});

test("brief assistant rejects empty input and never invents a price outside the price book", () => {
  assert.throws(
    () => draftQuoteFromBrief("   ", DEFAULT_PRICING_STRUCTURES),
    /Describe the project/,
  );

  const adjustedPriceBook = DEFAULT_PRICING_STRUCTURES.map((structure) => (
    structure.id === "growth-website" ? { ...structure, starting_price: 4321 } : structure
  ));
  const draft = draftQuoteFromBrief("Build a new five-page business website.", adjustedPriceBook);
  assert.equal(total(draft), 4321);
  assert.match(draft.pricing_source, /Custom Growth Website/);
});
