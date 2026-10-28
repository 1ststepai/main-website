import test from "node:test";
import assert from "node:assert/strict";
import { pickMetaPage } from "../src/oauth/providers.js";

const pages = [
  { id: "472124739310907", name: "1ststep.ai" },
  { id: "111", name: "Swing Trade Pros" },
  { id: "222", name: "Crypto Hacks" },
];

test("no preference keeps the first Page", () => {
  assert.equal(pickMetaPage(pages, "").id, "472124739310907");
});

test("picks by Page id", () => {
  assert.equal(pickMetaPage(pages, "222").name, "Crypto Hacks");
});

test("picks by exact name, case-insensitive", () => {
  assert.equal(pickMetaPage(pages, "swing trade pros").id, "111");
});

test("a chosen Page missing from the login is an error, never a silent fallback", () => {
  assert.throws(() => pickMetaPage(pages, "Mr.Node It All"), /not in this Meta login/);
});
