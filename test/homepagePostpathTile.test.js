import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("homepage Work section has the PostPath tile and the quiet custom-tool line", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const proof = html.slice(html.indexOf('id="proof"'), html.indexOf('id="founder"'));
  const li = proof.split("<li>").find((part) => part.includes("<span>PostPath</span>"));
  const tile = li && li.match(/^<a href="([^"]+)"/);
  if (tile) tile[0] = li;
  assert.ok(tile, "PostPath tile is in the Work/proof thumbs");
  assert.equal(tile[1], "https://postpath.1ststep.ai");
  assert.match(tile[0], /One desk for all your social posts\. Your assistant drafts, you approve\./);
  assert.match(tile[0], /loading="lazy"/);
  assert.doesNotMatch(tile[0], /\bAI\b|\u2014/);
  const hero = html.slice(html.indexOf('class="hero-actions"'), html.indexOf('class="fine"'));
  assert.match(hero, /<p class="hero-more">Need a tool built just for your business\? <a href="\/book\/"[^>]*>We make those too<\/a>\.<\/p>/);
  assert.match(hero, /class="btn" href="\/book\/"/);
  assert.doesNotMatch(html, /firststep\.ai/i);
});
