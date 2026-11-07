import test from "node:test";
import assert from "node:assert/strict";
import { emptyPipeline, normalizePipeline, applyPipelineChange } from "../lib/admin/newsletterPipeline.js";
import { pipelineStorage, loadNewsletterPipeline, changeNewsletterPipeline } from "../lib/admin/newsletterPipelineStore.js";
import { ugcQuoteOverrides, ugcQuoteTemplate } from "../lib/admin/ugcQuote.js";
import { createEmptyWorkspace, normalizeWorkspace } from "../lib/admin/workspaceModel.js";
import { assertDesktopWorkspaceUpdate, desktopWorkspaceView, mergeDesktopWorkspace } from "../lib/admin/desktopWorkspace.js";
import { decryptProtectedJson } from "../lib/security/dataProtection.js";
import handler from "../api/admin-ugc-pipeline.js";

const prospect = { id: "ugc_example", service_type: "ugc", business: "Example shop", email: "owner@example.com", stage: "researched", ugc_brief: { product: "Example product", deliverables: "Two approved 20-second videos", usage_rights: "Pending written creator permission" } };
test("UGC briefs, exports and suppressions stay in their own service", () => {
  const saved = applyPipelineChange(emptyPipeline("ugc"), { operation: "upsert", prospect });
  assert.equal(saved.prospects[0].ugc_brief.deliverables, prospect.ugc_brief.deliverables);
  assert.throws(() => applyPipelineChange(emptyPipeline(), { operation: "upsert", prospect }), /matching service/);
  assert.throws(() => applyPipelineChange(saved, { operation: "import", pipeline: emptyPipeline() }), /matching service/);
  assert.throws(() => normalizePipeline({ ...saved, prospects: [{ ...prospect, ugc_brief: [] }] }), /Invalid UGC brief/);
  const blocked = applyPipelineChange(saved, { operation: "upsert", prospect: { ...prospect, stage: "no_contact", suppression_reason: "Opted out" } });
  assert.throws(() => applyPipelineChange(blocked, { operation: "upsert", prospect }), /reactivated/);
  assert.notEqual(pipelineStorage().key, pipelineStorage("ugc").key);
  assert.notEqual(pipelineStorage().purpose, pipelineStorage("ugc").purpose);
  assert.throws(() => pipelineStorage("unrelated"), /Invalid/);
});
test("desktop permits UGC draft quotes while preserving hidden quotes and blocking reclassification", () => {
  const base = createEmptyWorkspace();
  base.clients = [{ id: "client", company: "Example shop" }];
  const ugc = { ...ugcQuoteOverrides("item_ugc", prospect), id: "ugc_quote", quote_number: "FS-0020", client_id: "client", status: "draft", valid_until: "2026-11-01" };
  base.quotes = [ugc, { ...ugc, id: "hidden", quote_number: "FS-0030", contract_template_id: "website-build" }];
  base.templates.push(ugcQuoteTemplate());
  const current = normalizeWorkspace(base), view = desktopWorkspaceView(current);
  assert.equal(view.templates.find(t => t.id === "ugc-pilot").service_type, "project");
  assert.equal(view.quotes.length, 1);
  assert.equal(view.next_quote_sequence, 31);
  assert.equal(view.quotes[0].line_items[0].rate, 0);
  assert.match(view.quotes[0].notes, /placeholder/);
  const edited = structuredClone(view); edited.quotes[0].line_items[0].rate = 900;
  const merged = mergeDesktopWorkspace(current, edited);
  assert.doesNotThrow(() => assertDesktopWorkspaceUpdate(current, merged));
  assert.deepEqual(merged.quotes.find(q => q.id === "hidden"), current.quotes.find(q => q.id === "hidden"));
  for (const change of [q => { q.contract_template_id = "newsletter-pilot"; }, q => { q.status = "sent"; }, q => { q.delivery_id = "fake"; }, q => { q.payment_links = [{ id: "fake" }]; }]) {
    const forged = structuredClone(merged); change(forged.quotes.find(q => q.id === "ugc_quote"));
    assert.throws(() => assertDesktopWorkspaceUpdate(current, forged), e => e.statusCode === 403);
  }
  const blank = normalizeWorkspace(createEmptyWorkspace());
  const withTemplate = normalizeWorkspace({ ...blank, templates: [...blank.templates, ugcQuoteTemplate()] });
  assert.doesNotThrow(() => assertDesktopWorkspaceUpdate(blank, withTemplate));
});
test("UGC API requires authentication and encrypted saves cannot overwrite newsletter storage", async () => {
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await handler({ method: "GET", headers: {} }, res); assert.equal(res.statusCode, 401);
  const keys = ["KV_REST_API_URL", "KV_REST_API_TOKEN", "FIRSTSTEP_DATA_ENCRYPTION_KEY"];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]])); const oldFetch = globalThis.fetch;
  process.env.KV_REST_API_URL = "https://storage.example"; process.env.KV_REST_API_TOKEN = "test-only"; process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = "22".repeat(32);
  const storage = new Map(); let raceOther = false;
  globalThis.fetch = async (_url, options) => {
    const args = JSON.parse(options.body); let result;
    if (args[0] === "GET") result = storage.get(args[1]) ?? null;
    else if (args[0] === "EVAL") {
      const key = args[3], old = storage.get(key) ?? null;
      if (raceOther) storage.set(args[4], (storage.get(args[4]) || "") + "concurrent-write");
      const other = storage.get(args[4]) ?? null;
      const matches = (args[5] === "absent" ? old === null : old === args[6]) && (args[8] === "absent" ? other === null : other === args[9]);
      if (matches) storage.set(key, args[7]); result = matches ? 1 : 0;
    } else throw new Error("Unexpected storage command");
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    const newsletter = { ...prospect, id: "newsletter_example", service_type: "newsletter" };
    await changeNewsletterPipeline({ operation: "upsert", prospect: newsletter }, 0);
    const before = storage.get(pipelineStorage().key);
    await changeNewsletterPipeline({ operation: "upsert", prospect }, 0, "ugc");
    assert.equal(storage.get(pipelineStorage().key), before);
    assert.equal((await loadNewsletterPipeline("ugc")).prospects[0].ugc_brief.product, prospect.ugc_brief.product);
    const raw = storage.get(pipelineStorage("ugc").key);
    assert.equal(raw.includes(prospect.email), false);
    assert.equal(decryptProtectedJson(raw, "ugc-pipeline").revision, 1);
    assert.throws(() => decryptProtectedJson(raw, "newsletter-pipeline"));
    await assert.rejects(changeNewsletterPipeline({ operation: "upsert", prospect }, 0, "ugc"), /another tab/);
    await changeNewsletterPipeline({ operation: "upsert", prospect: { ...newsletter, stage: "no_contact", suppression_reason: "No outreach" } }, 1);
    await assert.rejects(changeNewsletterPipeline({ operation: "upsert", prospect: { ...prospect, id: "other", email: "another@example.com" } }, 1, "ugc"), /suppressed in the newsletter/);
    await changeNewsletterPipeline({ operation: "upsert", prospect: { ...prospect, stage: "no_contact", suppression_reason: "No contact across services" } }, 1, "ugc");
    await assert.rejects(changeNewsletterPipeline({ operation: "upsert", prospect: { ...newsletter, id: "new_newsletter", email: "new@example.com" } }, 2), /suppressed in the ugc/);
    const beforeRace = storage.get(pipelineStorage().key); raceOther = true;
    await assert.rejects(changeNewsletterPipeline({ operation: "upsert", prospect: { ...newsletter, id: "new_domain", email: "owner@different.org" } }, 2), /another tab/);
    assert.equal(storage.get(pipelineStorage().key), beforeRace);
  } finally { globalThis.fetch = oldFetch; for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});
