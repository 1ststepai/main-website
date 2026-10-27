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

test("PostPath marketing page carries product identity and conversion hooks", async () => {
  const html = await source("postpath/index.html");
  assert.match(html, /rel="canonical" href="https:\/\/postpath\.1ststep\.ai\/"/);
  assert.match(html, /PostPath/);
  assert.match(html, /1stStep\.ai/);
  assert.match(html, /Any AI can post/);
  assert.match(html, /Get PostPath/);
  assert.match(html, /id="demo"/);
  assert.match(html, /simulation|Illustrative only/i);
  assert.match(html, /mailto:evan@1ststep\.ai/);
  assert.match(html, /assets\/postpath\/postpath-mark-3d\.png|assets\/postpath\/postpath-mark\.svg/);
  assert.match(html, /postpath-hero-banner\.png/);
  assert.match(html, /Download for Mac/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /FAQPage/);
  assert.doesNotMatch(html, /epancis12@gmail\.com/);
  assert.doesNotMatch(html, /guaranteed revenue|fake review|#1 social tool/i);
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
  const sources = vercel.rewrites.map((row) => JSON.stringify(row));
  assert.ok(sources.some((row) => row.includes("postpath.1ststep.ai") && row.includes("/postpath")));
  assert.ok(sources.some((row) => row.includes('"/postpath/"')));
});
