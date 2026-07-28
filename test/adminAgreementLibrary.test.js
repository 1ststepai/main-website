import test from "node:test";
import assert from "node:assert/strict";
import {
  AGREEMENT_DEPTHS,
  AGREEMENT_SECTION_LIBRARY,
  DEFAULT_CONTRACT_TEMPLATES,
  agreementCoverage,
  sectionsForDepth,
} from "../lib/admin/agreementLibrary.js";

test("agreement library offers basic, standard, and detailed document depths", () => {
  assert.deepEqual(
    AGREEMENT_DEPTHS.map((depth) => depth.id),
    ["essential", "standard", "comprehensive"],
  );

  const basic = sectionsForDepth("essential", "website");
  const standard = sectionsForDepth("standard", "website");
  const detailed = sectionsForDepth("comprehensive", "website");

  assert.ok(basic.length >= 7);
  assert.ok(standard.length > basic.length);
  assert.ok(detailed.length > standard.length);
  assert.ok(detailed.length <= 32);
});

test("service-specific structures include the right operational clauses", () => {
  const website = sectionsForDepth("comprehensive", "website");
  const app = sectionsForDepth("comprehensive", "app");
  const retainer = sectionsForDepth("comprehensive", "retainer");

  assert.ok(website.some((section) => section.id === "website-platform-hosting"));
  assert.ok(!website.some((section) => section.id === "app-store-review"));
  assert.ok(app.some((section) => section.id === "app-store-review"));
  assert.ok(!app.some((section) => section.id === "website-platform-hosting"));
  assert.ok(retainer.some((section) => section.id === "retainer-capacity"));
});

test("coverage reports missing commercial protections without treating disabled clauses as covered", () => {
  const sections = sectionsForDepth("standard", "website")
    .map((section) => section.id === "payment" ? { ...section, enabled: false } : section);
  const coverage = agreementCoverage(sections);

  assert.ok(coverage.completed < coverage.total);
  assert.ok(coverage.missing.some((item) => item.id === "payment"));
});

test("default template library spans quick approvals through detailed agreements", () => {
  const ids = new Set(DEFAULT_CONTRACT_TEMPLATES.map((template) => template.id));
  assert.ok(ids.has("quick-estimate"));
  assert.ok(ids.has("website-build"));
  assert.ok(ids.has("website-build-detailed"));
  assert.ok(ids.has("website-rescue"));
  assert.ok(ids.has("website-care"));
  assert.ok(ids.has("ios-prototype"));
  assert.ok(ids.has("ios-app-build"));
  assert.ok(ids.has("ios-app-build-detailed"));
  assert.ok(ids.has("product-retainer"));
  assert.ok(ids.has("change-order"));
});

test("every reusable clause carries client language and internal guidance", () => {
  for (const section of AGREEMENT_SECTION_LIBRARY) {
    assert.ok(section.title.length > 0, section.id);
    assert.ok(section.body.length > 40, section.id);
    assert.ok(section.guidance.length > 20, section.id);
    assert.ok(section.category.length > 0, section.id);
  }
});
