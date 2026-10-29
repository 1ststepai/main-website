// Mirrors postpath-content/scorer-proto/test_score.py, plus the brands-as-topic fix.
import test from "node:test";
import assert from "node:assert/strict";
import { scoreTitle } from "../src/score/title.js";

const fake = async (q) => [`${q} tutorial`, `${q} 2026`, "other"];

test("deterministic offline", async () => {
  const a = await scoreTitle("I Built My Own Social Posting Tool", { fetcher: fake });
  const b = await scoreTitle("I Built My Own Social Posting Tool", { fetcher: fake });
  assert.deepEqual(a, b);
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.deepEqual(Object.keys(a).sort(), ["feedback", "label", "score", "signals"]);
  assert.equal(a.label, "Checklist score with tips");
});

test("blocked suggest is neutral", async () => {
  const r = await scoreTitle("How to Write Better Prompts for AI", { fetcher: async () => null });
  assert.equal(r.signals.demand, null);
  assert.equal(r.signals.parts.search, 7.5);
  const off = await scoreTitle("How to Write Better Prompts for AI");
  assert.equal(off.signals.parts.search, 7.5, "no fetcher (default) is neutral too");
  assert.equal(off.signals.trends_rel, null, "Trends off by default");
});

test("brand list penalty", async () => {
  const r = await scoreTitle("My AI Stack: Claude, ChatGPT, Gemini, Perplexity", { fetcher: fake });
  assert.ok(r.signals.brand_penalty >= 10, String(r.signals.brand_penalty));
});

test("single brand in context is fine", async () => {
  assert.equal((await scoreTitle("How to Use ChatGPT to Write a Landing Page", { fetcher: fake })).signals.brand_penalty, 0);
});

test("hype and caps", async () => {
  assert.ok((await scoreTitle("INSANE Secret AI Trick", { fetcher: fake })).signals.parts.penalty >= 16);
});

test("fix: brands that are the topic are not penalized", async () => {
  const r = await scoreTitle("Amazon Seller Chrome Extension With Claude", { fetcher: fake });
  assert.equal(r.signals.brands.length, 3);
  assert.equal(r.signals.brands_listed, false);
  assert.equal(r.signals.brand_penalty, 0);
  assert.ok(!r.feedback.some((l) => /Lists \d tool/.test(l)));
  // A real list still is.
  assert.ok((await scoreTitle("Claude vs ChatGPT vs Gemini", { fetcher: fake })).signals.brand_penalty >= 6);
});

test("trends only when a trends function is passed", async () => {
  const r = await scoreTitle("How to Write Better Prompts", { fetcher: fake, trends: async () => 1.25 });
  assert.equal(r.signals.trends_rel, 1.25);
});

test("never claims to match vidIQ", async () => {
  const r = await scoreTitle("I Built My Own Social Posting Tool");
  assert.ok(!JSON.stringify(r).toLowerCase().includes("vidiq"));
});
