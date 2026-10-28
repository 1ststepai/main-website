import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const exists = async (path) => {
  try {
    await access(new URL(path, root), constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

test("PostPath marketing page carries the landing story", async () => {
  const html = await source("postpath/index.html");
  assert.match(html, /rel="canonical" href="https:\/\/postpath\.1ststep\.ai\/"/);
  assert.match(html, /Stop juggling ten apps <span class="accent">to post once\.<\/span>/);
  assert.match(html, /Ask your assistant for posts\. PostPath puts them on one desk\. Nothing goes out until you approve it\./);
  for (const tag of ["One desk.", "Your assistant.", "You approve."]) assert.ok(html.includes(`<li>${tag}</li>`), tag);
  assert.match(html, /Download for Mac/);
  assert.match(html, /Watch Demo/);
  assert.match(html, /href="#pricing"/);
  assert.match(html, /You pick the tool\.<br \/><em>Your assistant does the rest\.<\/em>/);
  assert.match(html, /Your assistant drives\. You hold the keys\./);
  assert.match(html, /Coming soon/);
  assert.match(html, /Illustration/);
  assert.match(html, /One desk\. Any assistant\.<br \/><em>You approve\.<\/em>/);
  assert.match(html, /https:\/\/www\.youtube\.com\/@1ststepdotai/);
  assert.match(html, /mailto:evan@1ststep\.ai/);
  assert.match(html, /id="access-form"/);
  assert.match(html, /network you connect or post to/);
  assert.match(html, /Node 20 or newer/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /FAQPage/);
  assert.match(html, /postpath-hero-banner\.png/);
  assert.doesNotMatch(html, /\$29|\$149|testimonial/i);
  assert.doesNotMatch(html, /epancis12@gmail\.com/);
  assert.doesNotMatch(html, /Prompt to your AI/i);
});

test("PostPath pricing says Free, no card", async () => {
  const html = await source("postpath/index.html");
  const pricing = html.slice(html.indexOf('id="pricing"'), html.indexOf('id="download"'));
  assert.match(pricing, />Free</);
  assert.match(pricing, /Free during early access\. No card\./);
  assert.doesNotMatch(pricing, /\/mo|per month|\$\d/i);
});

test("PostPath marks Claude and Grok Bot as coming", async () => {
  const html = await source("postpath/index.html");
  assert.match(html, /<strong>Cursor<\/strong><span class="st ok">Tested<\/span>/);
  assert.match(html, /<strong>Claude<\/strong><span class="st soon">Coming<\/span>/);
  assert.match(html, /<strong>Grok Bot<\/strong><span class="st soon">Coming<\/span>/);
  assert.match(html, /<strong>Snapchat<\/strong><span class="st no">Not available<\/span>/);
  assert.match(html, /<strong>WhatsApp<\/strong><span class="st no">Not available<\/span>/);
  assert.match(html, /<strong>CRMs<\/strong><span class="st no">Not available<\/span>/);
});

test("PostPath copy never says the retired tagline or a standalone AI word", async () => {
  const files = ["postpath/index.html", "postpath/postpath.js", "docs/POSTPATH_BRAND.md", "packages/social-mcp/package.json", "public/llms.txt"];
  for (const file of files) {
    const text = await source(file);
    assert.doesNotMatch(text, /any ai can post/i, file);
    assert.doesNotMatch(text, /firststep\.ai/i, file);
  }
  const html = await source("postpath/index.html");
  // Covers visible text, alt text, meta, and JSON-LD. Brand names like 1stStep.ai are lowercase .ai and pass.
  assert.doesNotMatch(html, /\bAI\b/);
  assert.doesNotMatch(await source("postpath/postpath.js"), /\bAI\b/);
});

test("PostPath logo assets exist", async () => {
  assert.equal(await exists("public/assets/postpath/postpath-mark.svg"), true);
  assert.equal(await exists("public/assets/postpath/postpath-mark-on-dark.svg"), true);
  assert.equal(await exists("public/assets/postpath/postpath-lockup.svg"), true);
  assert.equal(await exists("public/assets/postpath/postpath-mark-3d.png"), true);
  assert.equal(await exists("public/assets/postpath/postpath-hero-banner.png"), true);
  assert.equal(await exists("public/assets/postpath/postpath-brand-board.png"), true);
  const mark = await source("public/assets/postpath/postpath-mark.svg");
  assert.match(mark, /#3b82f6|#8b5cf6/i);
  assert.match(mark, /PostPath/);
});

test("Vercel maps postpath host and www path", async () => {
  const vercel = JSON.parse(await source("vercel.json"));
  const rewrites = vercel.rewrites.map((row) => JSON.stringify(row));
  const redirects = (vercel.redirects || []).map((row) => JSON.stringify(row));
  assert.ok(
    redirects.some((row) => row.includes("postpath.1ststep.ai") && row.includes("/postpath/")),
    "host root should redirect to /postpath/ before filesystem index.html",
  );
  assert.ok(rewrites.some((row) => row.includes("postpath.1ststep.ai") && row.includes("/postpath")));
  assert.ok(rewrites.some((row) => row.includes('"/postpath/"')));
});
