import test from "node:test";
import assert from "node:assert/strict";
import { pickMetaPage } from "../src/oauth/providers.js";

const pages = [
  { id: "472124739310907", name: "1ststep.ai" },
  { id: "111", name: "Swing Trade Pros" },
  { id: "222", name: "Crypto Hacks" },
];

test("no preference with several Pages asks for a choice, names and ids only", () => {
  try {
    pickMetaPage(pages.map((p) => ({ ...p, access_token: "page-token-should-not-leak" })), "");
    assert.fail("expected page_choice_required");
  } catch (error) {
    assert.equal(error.code, "page_choice_required");
    assert.deepEqual(error.details.pages, pages.map(({ id, name }) => ({ id, name })));
    assert.doesNotMatch(error.message + JSON.stringify(error.details), /page-token-should-not-leak/);
  }
});

test("a single Page is used without a preference", () => {
  assert.equal(pickMetaPage([pages[1]], "").id, "111");
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
