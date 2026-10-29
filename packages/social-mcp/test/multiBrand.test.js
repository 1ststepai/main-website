import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { META_SCOPES } from "../src/oauth/providers.js";

function setup() {
  const home = mkdtempSync(join(tmpdir(), "pp-brands-"));
  const engine = createEngine({ home, env: { SOCIAL_MCP_PUBLISH_MODE: "mock" }, now: () => Date.now() });
  return { engine, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function seedMeta(engine, profileId, pageId, pageName, scopes = META_SCOPES) {
  const secrets = { access_token: "t", page_access_token: "SECRET-PAGE-TOKEN", expires_at: "2099-01-01T00:00:00.000Z" };
  engine.store.saveConnection({ profile_id: profileId, platform: "facebook", account_label: pageName, page_id: pageId, granted_scopes: scopes }, secrets);
  engine.store.saveConnection({ profile_id: profileId, platform: "instagram", account_label: `@${profileId}`, instagram_id: `ig-${profileId}`, page_id: pageId, granted_scopes: scopes }, secrets);
}

test("manage view is per brand: own Page name, Full or Limited, saved Page choice, known Pages", () => {
  const { engine, cleanup } = setup();
  try {
    engine.upsertProfile({ id: "1ststep-ai", name: "1stStep.ai" });
    engine.upsertProfile({ id: "swing-trade-pros", name: "Swing Trade Pros", presets: { meta_page: "Swing Trade Pros" } });
    seedMeta(engine, "1ststep-ai", "p1", "1stStep.ai");
    seedMeta(engine, "swing-trade-pros", "p2", "Swing Trade Pros", ["pages_show_list"]);
    const a = engine.manage.view("1ststep-ai");
    const b = engine.manage.view("swing-trade-pros");
    assert.equal(a.brand.name, "1stStep.ai");
    assert.equal(b.brand.meta_page, "Swing Trade Pros");
    const fbA = a.access.find((row) => row.platform === "facebook");
    const igB = b.access.find((row) => row.platform === "instagram");
    assert.equal(fbA.page_name, "1stStep.ai");
    assert.equal(fbA.full_access, true);
    assert.equal(igB.page_name, "Swing Trade Pros");
    assert.equal(igB.full_access, false);
    assert.deepEqual(a.known_pages.map((page) => page.id).sort(), ["p1", "p2"]);
    assert.ok(!JSON.stringify(a).includes("SECRET-PAGE-TOKEN"), "no tokens in the view");
  } finally {
    cleanup();
  }
});

test("X stays out of the per-brand accounts view without the desk's own X app", () => {
  const { engine, cleanup } = setup();
  try {
    engine.upsertProfile({ id: "acme", name: "Acme" });
    const view = engine.manage.view("acme");
    assert.equal(view.x_available, false);
    assert.ok(!view.access.some((row) => row.platform === "x"));
  } finally {
    cleanup();
  }
});

test("desk has a brand switcher, Add brand with Page choice, and a Reconnect Page chooser", () => {
  const html = readFileSync(new URL("../src/desk/public/index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../src/desk/public/manage.js", import.meta.url), "utf8");
  for (const id of ["brand-switcher", "add-brand", "add-brand-page", "manage-accounts", "known-pages"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(js, /meta_page/);
  assert.match(js, /page-choice/);
});
