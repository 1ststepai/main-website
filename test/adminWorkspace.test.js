import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONTRACT_TEMPLATES,
  createEmptyWorkspace,
  normalizeWorkspace,
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
      notes: "",
      contract_template_id: "website-build",
      contract_sections: structuredClone(DEFAULT_CONTRACT_TEMPLATES[0].sections),
    }],
  };
}

test("empty admin workspace includes reusable website and iOS structures", () => {
  const workspace = createEmptyWorkspace();
  assert.equal(workspace.clients.length, 0);
  assert.equal(workspace.quotes.length, 0);
  assert.deepEqual(workspace.templates.map((template) => template.id), ["website-build", "ios-app-build"]);
});

test("workspace normalization bounds records and preserves quote relationships", () => {
  const workspace = normalizeWorkspace(validWorkspace());
  assert.equal(workspace.clients[0].email, "owner@example.com");
  assert.equal(workspace.quotes[0].line_items[0].rate, 5000);
  assert.equal(workspace.quotes[0].deposit_percent, 50);
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
