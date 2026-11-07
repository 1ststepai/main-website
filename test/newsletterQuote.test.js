import test from "node:test";
import assert from "node:assert/strict";
import { newsletterQuoteClient, newsletterQuoteOverrides, newsletterQuoteTemplate } from "../lib/admin/newsletterQuote.js";
import { createEmptyWorkspace, normalizeWorkspace } from "../lib/admin/workspaceModel.js";
import { paymentScheduleForQuote } from "../lib/admin/paymentPlans.js";
import { generateQuotePdf } from "../lib/admin/quotePdf.js";

test("newsletter pilot normalizes, keeps pricing unchanged and renders an unpaid draft PDF", async () => {
  const workspace = createEmptyWorkspace();
  const originalPricing = structuredClone(workspace.pricing_structures);
  workspace.clients.push({ id: "client_test", company: "Example Business", email: "owner@example.com" });
  workspace.templates.push(newsletterQuoteTemplate());
  workspace.quotes.push({ id: "quote_test", quote_number: "FS-0001", status: "draft", created_at: "2026-09-30T12:00:00Z", updated_at: "2026-09-30T12:00:00Z", valid_until: "2026-10-30", client_id: "client_test", ...newsletterQuoteOverrides("item_test") });
  const normalized = normalizeWorkspace(workspace);
  const quote = normalized.quotes[0];
  assert.deepEqual(normalized.pricing_structures, originalPricing);
  assert.equal(quote.status, "draft");
  assert.equal(quote.card_payments_enabled, false);
  assert.deepEqual(quote.payment_links, []);
  assert.equal(paymentScheduleForQuote(quote).length, 1);
  assert.equal(paymentScheduleForQuote(quote)[0].amount, 600);
  assert.match(quote.notes, /no automatic renewal/);
  assert.match(quote.contract_sections.find((s) => s.id === "acceptance").body, /Silence is not permission/);
  assert.ok((await generateQuotePdf({ quote, client: normalized.clients[0] })).length > 1000);
});

test("newsletter recipients reuse existing clients and reject suppression or missing contact", () => {
  const client = { id: "existing", email: "owner@example.com", company: "Existing" };
  assert.equal(newsletterQuoteClient([client], { business: "Business", email: "OWNER@example.com", stage: "reply_received" }), client);
  assert.deepEqual(newsletterQuoteClient([], { business: "Business", email: "owner@example.com" }), { company: "Business", email: "owner@example.com" });
  assert.equal(newsletterQuoteClient([], null), null);
  for (const contact of [{ suppressed: true }, { stage: "declined" }, { stage: "no_contact" }]) assert.throws(() => newsletterQuoteClient([], contact), /suppressed/);
  assert.throws(() => newsletterQuoteClient([], { business: "Business", email: "" }), /valid email/);
});
