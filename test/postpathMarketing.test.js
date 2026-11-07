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
  assert.match(html, /PostPath is a private desk <span class="accent">on your computer\.<\/span>/);
  assert.match(html, /not a scheduler, and it is not another AI writer/i);
  assert.match(html, /not on our servers/);
  assert.match(html, /Request early access/);
  assert.match(html, /id="demo"/);
  assert.match(html, /id="access-form"/);
  assert.match(html, /Simulated only/);
  assert.match(html, /live publishing is not yet verified/i);
  assert.match(html, /Cursor has a tested setup path/);
  assert.match(html, /mailto:evan@1ststep\.ai/);
  assert.match(html, /assets\/postpath\/postpath-mark-3d\.png|assets\/postpath\/postpath-mark\.svg/);
  assert.match(html, /postpath-hero-banner\.png/);
  assert.match(html, /PostPath by 1stStep\.ai: your private desk for social posts\./);
  assert.doesNotMatch(html, /older line/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /FAQPage/);
  assert.doesNotMatch(html, /Any AI can post/);
  assert.doesNotMatch(html, /Download for Mac/);
  assert.doesNotMatch(html, /Get PostPath/);
  assert.doesNotMatch(html, /the only|one place|one window/i);
  assert.doesNotMatch(html, /\bsecure\b|security|password/i);
  assert.doesNotMatch(html, /\$29|\$149/);
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
  const rewrites = vercel.rewrites.map((row) => JSON.stringify(row));
  const redirects = (vercel.redirects || []).map((row) => JSON.stringify(row));
  assert.ok(
    redirects.some((row) => row.includes("postpath.1ststep.ai") && row.includes("/postpath/")),
    "host root should redirect to /postpath/ before filesystem index.html",
  );
  assert.ok(rewrites.some((row) => row.includes("postpath.1ststep.ai") && row.includes("/postpath")));
  assert.ok(rewrites.some((row) => row.includes('"/postpath/"')));
});
