import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin-newsletter-pipeline.js";
import { createAdminCookie, createAdminSessionToken } from "../lib/admin/auth.js";
import { decryptProtectedJson } from "../lib/security/dataProtection.js";
import { applyPipelineChange, attentionReason, emptyPipeline, normalizePipeline, normalizeProspect } from "../lib/admin/newsletterPipeline.js";
import { changeNewsletterPipeline, loadNewsletterPipeline } from "../lib/admin/newsletterPipelineStore.js";

const prospect = (overrides = {}) => ({ id: "sample", business: "Sample Farm", email: "owner@example.com", stage: "awaiting_reply", next_action: "Review response", next_date: "2026-10-07", contact_source: "https://example.com/contact", proposal_url: "https://example.com/proposal", ...overrides });

test("validation rejects unsafe links, invalid calendar dates, duplicate contacts and unproven sends", () => {
  assert.throws(() => normalizeProspect(prospect({ proposal_url: "javascript:alert(1)" })), /HTTPS/);
  assert.throws(() => normalizeProspect(prospect({ next_date: "2026-02-30" })), /valid date/);
  assert.throws(() => normalizeProspect(prospect({ stage: "invented" })), /valid stage/);
  assert.throws(() => normalizeProspect(prospect({ sent_verified: true })), /Gmail/);
  assert.throws(() => normalizePipeline({ prospects: [prospect(), prospect({ id: "different" })] }), /Duplicate/);
  assert.throws(() => normalizePipeline({ prospects: [], sender_health: { spf: "pass", dkim: "pass", dmarc: "pass" } }), /dated evidence/);
});

test("attention queue respects January timing, missing actions, incoming replies and suppression", () => {
  assert.equal(attentionReason(normalizeProspect(prospect()), "2026-09-30"), "");
  assert.equal(attentionReason(normalizeProspect(prospect({ next_date: "2027-01-05" })), "2026-09-30"), "");
  assert.equal(attentionReason(normalizeProspect(prospect({ next_date: "2026-09-29" })), "2026-09-30"), "Overdue review");
  assert.equal(attentionReason(normalizeProspect(prospect({ next_date: "" })), "2026-09-30"), "Set next action and date");
  assert.equal(attentionReason(normalizeProspect(prospect({ stage: "reply_received" })), "2026-09-30"), "Reply needs review");
  assert.equal(attentionReason(normalizeProspect(prospect({ stage: "declined", suppression_reason: "No thanks" })), "2026-09-30"), "");
});

test("imports preserve owner edits and apply suppression; edits cannot erase verified sends", () => {
  const saved = normalizePipeline({ prospects: [prospect({ notes: "Owner note" })] });
  const merged = applyPipelineChange(saved, { operation: "import", pipeline: { prospects: [prospect({ notes: "Stale note", next_date: "" })] } });
  assert.equal(merged.prospects[0].notes, "Owner note");
  assert.equal(merged.prospects[0].next_date, "2026-10-07");
  const suppressed = applyPipelineChange(merged, { operation: "import", pipeline: { prospects: [prospect({ stage: "declined", suppression_reason: "Declined outside help" })] } });
  assert.equal(suppressed.prospects[0].next_date, "");
  assert.throws(() => applyPipelineChange(suppressed, { operation: "upsert", prospect: prospect() }), /reactivated/);
  const evidence = normalizePipeline({ prospects: [prospect({ sent_verified: true, message_id: "1a0f51e235acdac0", thread_id: "1a0f51e235acdac0" })] });
  assert.throws(() => applyPipelineChange(evidence, { operation: "upsert", prospect: prospect() }), /cannot be replaced/);
});

test("API denies unauthenticated, cross-origin and malformed writes without storage access", async () => {
  const savedSecret = process.env.FIRSTSTEP_ADMIN_SESSION_SECRET;
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = "test-only-newsletter-session-secret-123456789";
  function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } }; }
  try {
    const res = response(); await handler({ method: "GET", headers: {} }, res);
    assert.equal(res.statusCode, 401); assert.match(res.headers["Cache-Control"], /no-store/);
    const cookie = createAdminCookie(createAdminSessionToken()).split(";")[0];
    const denied = response(); await handler({ method: "POST", headers: { cookie, origin: "https://attacker.example", host: "1ststep.ai" } }, denied); assert.equal(denied.statusCode, 403);
    const bad = response(); await handler({ method: "POST", headers: { cookie, origin: "https://1ststep.ai", host: "1ststep.ai", "content-type": "application/json" }, body: "{" }, bad); assert.equal(bad.statusCode, 400);
  } finally { if (savedSecret === undefined) delete process.env.FIRSTSTEP_ADMIN_SESSION_SECRET; else process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = savedSecret; }
});

test("encrypted persistence and atomic race keep one writer and preserve recoverable conflicts", async () => {
  const names = ["KV_REST_API_URL", "KV_REST_API_TOKEN", "FIRSTSTEP_DATA_ENCRYPTION_KEY"];
  const previous = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  const oldFetch = globalThis.fetch; let stored = null;
  process.env.KV_REST_API_URL = "https://storage.example"; process.env.KV_REST_API_TOKEN = "test-only"; process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = "11".repeat(32);
  globalThis.fetch = async (_url, options) => {
    const args = JSON.parse(options.body); let result;
    if (args[0] === "GET") result = args[1].includes("ugc_pipeline") ? null : stored;
    else if (args[0] === "EVAL") {
      const matches = args[5] === "absent" ? stored === null : stored === args[6];
      if (matches) stored = args[7]; result = matches ? 1 : 0;
    } else throw new Error("Unexpected storage command");
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    assert.deepEqual(await loadNewsletterPipeline(), emptyPipeline());
    const results = await Promise.allSettled([changeNewsletterPipeline({ operation: "upsert", prospect: prospect() }, 0), changeNewsletterPipeline({ operation: "upsert", prospect: prospect({ id: "other", email: "other@example.com" }) }, 0)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.code, "revision_conflict");
    assert.equal(stored.includes("owner@example.com"), false);
    assert.equal(decryptProtectedJson(stored, "newsletter-pipeline").revision, 1);
    assert.throws(() => decryptProtectedJson(stored, "admin-workspace"));
    assert.equal((await loadNewsletterPipeline()).prospects.length, 1);
  } finally { globalThis.fetch = oldFetch; for (const k of names) { if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k]; } }
});
