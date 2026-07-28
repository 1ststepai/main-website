import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONTRACT_TEMPLATES,
  DEFAULT_PRICING_STRUCTURES,
  assignClientToQuote,
  createEmptyWorkspace,
  normalizeWorkspace,
  recordQuoteDelivery,
} from "../lib/admin/workspaceModel.js";

function validWorkspace() {
  return {
    revision: 0,
    updated_at: null,
    clients: [{
      id: "client_1",
      company: "Example Studio",
      contact_name: "Owner",
      email: "OWNER@EXAMPLE.COM",
      phone: "",
      website: "",
      billing_address: "",
    }],
    templates: structuredClone(DEFAULT_CONTRACT_TEMPLATES),
    pricing_structures: structuredClone(DEFAULT_PRICING_STRUCTURES),
    pricing_settings: {
      target_hourly_rate: 110,
      contingency_percent: 15,
      max_discount_percent: 10,
      default_deposit_percent: 50,
    },
    quotes: [{
      id: "quote_1",
      quote_number: "FS-0001",
      status: "draft",
      created_at: "2026-07-24T12:00:00.000Z",
      updated_at: "2026-07-24T12:00:00.000Z",
      valid_until: "2026-08-24",
      client_id: "client_1",
      project_title: "Website build",
      summary: "",
      currency: "USD",
      line_items: [{
        id: "item_1",
        name: "Design and build",
        description: "",
        quantity: 1,
        rate: 5000,
      }],
      deposit_percent: 50,
      payment_plan: "three_payments",
      card_payments_enabled: true,
      payment_links: [{
        installment_number: 1,
        label: "Project deposit",
        amount: 2000,
        url: "https://buy.stripe.com/test_123",
        stripe_payment_link_id: "plink_123",
        created_at: "2026-07-24T12:00:00.000Z",
      }],
      notes: "",
      contract_template_id: "website-build",
      document_depth: "standard",
      contract_sections: structuredClone(
        DEFAULT_CONTRACT_TEMPLATES.find((template) => template.id === "website-build").sections,
      ),
    }],
  };
}

test("empty admin workspace includes reusable quote-to-agreement structures", () => {
  const workspace = createEmptyWorkspace();
  assert.equal(workspace.clients.length, 0);
  assert.equal(workspace.quotes.length, 0);
  assert.ok(workspace.templates.some((template) => template.id === "quick-estimate"));
  assert.ok(workspace.templates.some((template) => template.id === "website-build-detailed"));
  assert.ok(workspace.templates.some((template) => template.id === "ios-app-build-detailed"));
  assert.ok(workspace.templates.some((template) => template.id === "change-order"));
  assert.equal(workspace.pricing_structures.length, 8);
  assert.equal(workspace.pricing_settings.target_hourly_rate, 75);
});

test("workspace normalization bounds records and preserves quote relationships", () => {
  const workspace = normalizeWorkspace(validWorkspace());
  assert.equal(workspace.clients[0].email, "owner@example.com");
  assert.equal(workspace.quotes[0].line_items[0].rate, 5000);
  assert.equal(workspace.quotes[0].deposit_percent, 50);
  assert.equal(workspace.quotes[0].payment_plan, "three_payments");
  assert.equal(workspace.quotes[0].document_depth, "standard");
  assert.equal(workspace.quotes[0].payment_links[0].stripe_payment_link_id, "plink_123");
  assert.equal(workspace.quotes[0].contract_sections[0].category, "scope");
  assert.ok(workspace.quotes[0].contract_sections[0].guidance.length > 20);
  assert.equal(workspace.pricing_structures[0].name, "Website Rescue Sprint");
  assert.equal(workspace.pricing_settings.max_discount_percent, 10);
});

test("a quote can create and link a complete client record without duplicating personal information", () => {
  const workspace = validWorkspace();
  const client = {
    id: "client_2",
    company: "Northstar Home Services",
    contact_name: "Jordan Lee",
    email: "JORDAN@NORTHSTAR.EXAMPLE",
    phone: "(555) 014-0198",
    website: "https://northstar.example",
    billing_address: "24 Market Street\nMorristown, NJ 07960",
  };

  const linked = assignClientToQuote(workspace, "quote_1", client);
  const normalized = normalizeWorkspace(linked);
  const savedClient = normalized.clients.find((item) => item.id === client.id);
  const savedQuote = normalized.quotes.find((item) => item.id === "quote_1");

  assert.deepEqual(savedClient, { ...client, email: "jordan@northstar.example" });
  assert.equal(savedQuote.client_id, client.id);
  assert.equal(Object.hasOwn(savedQuote, "email"), false);
  assert.equal(Object.hasOwn(savedQuote, "billing_address"), false);
});

test("assigning an existing client to a quote does not duplicate the client record", () => {
  const workspace = validWorkspace();
  const linked = assignClientToQuote(workspace, "quote_1", workspace.clients[0]);

  assert.equal(linked.clients.length, 1);
  assert.equal(linked.quotes[0].client_id, "client_1");
});

test("legacy workspaces receive the default price book", () => {
  const workspace = validWorkspace();
  delete workspace.pricing_structures;
  delete workspace.pricing_settings;
  const normalized = normalizeWorkspace(workspace);
  assert.equal(normalized.pricing_structures.length, 8);
  assert.equal(normalized.pricing_settings.default_deposit_percent, 40);
});

test("legacy app and retainer template ids retain the correct service type", () => {
  const workspace = validWorkspace();
  workspace.templates = [
    { id: "ios-app-build", name: "Legacy app", sections: workspace.templates[0].sections },
    { id: "website-care", name: "Legacy care", sections: workspace.templates[0].sections },
  ];
  workspace.quotes[0].contract_template_id = "ios-app-build";
  const normalized = normalizeWorkspace(workspace);
  assert.equal(normalized.templates[0].service_type, "app");
  assert.equal(normalized.templates[1].service_type, "retainer");
});

test("pricing settings reject unsafe discount bounds", () => {
  const workspace = validWorkspace();
  workspace.pricing_settings.max_discount_percent = 101;
  assert.throws(() => normalizeWorkspace(workspace), /between 0 and 50/);
});

test("default pricing keeps the advertised discount above the internal floor", () => {
  const settings = createEmptyWorkspace().pricing_settings;
  for (const structure of DEFAULT_PRICING_STRUCTURES) {
    const floor = structure.estimated_hours
      * settings.target_hourly_rate
      * (1 + settings.contingency_percent / 100);
    const discounted = structure.starting_price
      * (1 - settings.max_discount_percent / 100);
    assert.ok(discounted >= floor, `${structure.name} falls below its internal floor`);
  }
});

test("workspace rejects quote references to an unknown client", () => {
  const workspace = validWorkspace();
  workspace.quotes[0].client_id = "client_missing";
  assert.throws(() => normalizeWorkspace(workspace), /unknown client/);
});

test("workspace rejects negative rates and oversized collections", () => {
  const negative = validWorkspace();
  negative.quotes[0].line_items[0].rate = -1;
  assert.throws(() => normalizeWorkspace(negative), /between 0 and/);

  const oversized = validWorkspace();
  oversized.quotes[0].line_items = Array.from({ length: 41 }, (_, index) => ({
    id: `item_${index}`,
    name: "Item",
    description: "",
    quantity: 1,
    rate: 1,
  }));
  assert.throws(() => normalizeWorkspace(oversized), /line items/);
});

test("assigning an existing client removes only an unused blank placeholder", () => {
  const workspace = validWorkspace();
  workspace.clients.push({
    id: "client_blank",
    company: "",
    contact_name: "",
    email: "",
    phone: "",
    website: "",
    billing_address: "",
  });
  workspace.quotes[0].client_id = "client_blank";

  const assigned = assignClientToQuote(
    workspace,
    "quote_1",
    workspace.clients[0],
    "2026-07-25T12:00:00.000Z"
  );
  assert.equal(assigned.quotes[0].client_id, "client_1");
  assert.equal(assigned.clients.some((client) => client.id === "client_blank"), false);

  const populated = validWorkspace();
  populated.clients.push({
    id: "client_populated",
    company: "Keep Me",
    contact_name: "",
    email: "",
    phone: "",
    website: "",
    billing_address: "",
  });
  populated.quotes[0].client_id = "client_populated";
  assert.equal(
    assignClientToQuote(populated, "quote_1", populated.clients[0]).clients.some(
      (client) => client.id === "client_populated"
    ),
    true
  );
});

test("quote delivery records initial sends and follow-up dates without losing status", () => {
  const workspace = validWorkspace();
  workspace.quotes[0].payment_links = [];
  const sent = recordQuoteDelivery(workspace, "quote_1", {
    deliveryId: "email_initial",
    sentAt: "2026-07-25T12:00:00.000Z",
    deliveryKind: "initial",
  });
  assert.equal(sent.quotes[0].status, "sent");
  assert.equal(sent.quotes[0].last_contacted_at, "2026-07-25T12:00:00.000Z");
  assert.equal(sent.quotes[0].follow_up_due, "2026-07-28");
  assert.equal(sent.quotes[0].follow_up_count, 0);

  const followedUp = recordQuoteDelivery(sent, "quote_1", {
    deliveryId: "email_follow_up",
    sentAt: "2026-07-28T12:00:00.000Z",
    deliveryKind: "follow_up",
  });
  assert.equal(followedUp.quotes[0].status, "sent");
  assert.equal(followedUp.quotes[0].follow_up_count, 1);
  assert.equal(followedUp.quotes[0].follow_up_due, "2026-07-31");
  assert.equal(followedUp.quotes[0].delivery_id, "email_follow_up");
});

test("legacy quotes receive payment plans and unsafe checkout links fail closed", () => {
  const legacy = validWorkspace();
  delete legacy.quotes[0].payment_plan;
  delete legacy.quotes[0].card_payments_enabled;
  delete legacy.quotes[0].payment_links;
  delete legacy.quotes[0].document_depth;
  const normalized = normalizeWorkspace(legacy);
  assert.equal(normalized.quotes[0].payment_plan, "three_payments");
  assert.equal(normalized.quotes[0].document_depth, "standard");
  assert.equal(normalized.quotes[0].card_payments_enabled, true);
  assert.deepEqual(normalized.quotes[0].payment_links, []);

  const unsafe = validWorkspace();
  unsafe.quotes[0].payment_links[0].url = "https://example.com/pay";
  assert.throws(() => normalizeWorkspace(unsafe), /Stripe payment link/);

  const duplicate = validWorkspace();
  duplicate.quotes[0].payment_links.push({
    ...duplicate.quotes[0].payment_links[0],
    stripe_payment_link_id: "plink_456",
  });
  assert.throws(() => normalizeWorkspace(duplicate), /Duplicate payment installment/);

  const stale = validWorkspace();
  stale.quotes[0].line_items[0].rate = 6000;
  assert.throws(() => normalizeWorkspace(stale), /outdated payment link/i);
});

test("detailed agreements may contain up to 32 clauses but reject larger documents", () => {
  const valid = validWorkspace();
  valid.quotes[0].contract_sections = Array.from({ length: 32 }, (_, index) => ({
    id: `section_${index}`,
    title: `Section ${index + 1}`,
    body: "Detailed project term.",
    enabled: true,
  }));
  assert.equal(normalizeWorkspace(valid).quotes[0].contract_sections.length, 32);

  const oversized = validWorkspace();
  oversized.quotes[0].contract_sections = Array.from({ length: 33 }, (_, index) => ({
    id: `section_${index}`,
    title: `Section ${index + 1}`,
    body: "Detailed project term.",
    enabled: true,
  }));
  assert.throws(() => normalizeWorkspace(oversized), /contract sections/);
});
