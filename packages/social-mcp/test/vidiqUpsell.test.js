import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vidiqUpsell, VIDIQ_HOME, DISCLOSURE } from "../src/score/vidiq.js";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { freePort, freePorts } from "./helpers/ports.js";

test("empty config: plain vidiq.com link, no affiliate claim, no promo", () => {
  const u = vidiqUpsell({ env: {} });
  assert.equal(u.url, VIDIQ_HOME);
  assert.equal(u.affiliate, false);
  assert.equal(u.disclosure, null);
  assert.equal(u.promo, null);
  assert.equal(u.optional, true);
  assert.match(u.text, /^Want a deeper score\? Connect vidIQ for search volume and competition data\.$/);
});

test("affiliate link set: uses it and shows the disclosure; promo still hidden", () => {
  const u = vidiqUpsell({ env: { VIDIQ_AFFILIATE_URL: "https://vidiq.com/?ref=evan-test" } });
  assert.equal(u.url, "https://vidiq.com/?ref=evan-test");
  assert.equal(u.disclosure, DISCLOSURE);
  assert.equal(u.promo, null);
  assert.equal(vidiqUpsell({ env: { VIDIQ_AFFILIATE_URL: "javascript:alert(1)" } }).url, VIDIQ_HOME);
  assert.equal(vidiqUpsell({ env: { VIDIQ_AFFILIATE_URL: "http://x.test" } }).url, VIDIQ_HOME);
});

test("promo set: shows the 35% line only with a code; env overrides settings", () => {
  const u = vidiqUpsell({ env: { VIDIQ_PROMO_CODE: "EVAN35" } });
  assert.equal(u.promo, "35% off Pro/Boost with code EVAN35");
  assert.equal(vidiqUpsell({ env: {}, settings: { promo_code: "SET1" } }).promo, "35% off Pro/Boost with code SET1");
  assert.equal(vidiqUpsell({ env: { VIDIQ_PROMO_CODE: "ENV1" }, settings: { promo_code: "SET1" } }).promo, "35% off Pro/Boost with code ENV1");
  assert.equal(vidiqUpsell({ env: { VIDIQ_PROMO_CODE: "bad code!" } }).promo, null);
  const src = readFileSync(new URL("../src/score/vidiq.js", import.meta.url), "utf8") + readFileSync(new URL("../src/desk/public/manage.js", import.meta.url), "utf8");
  assert.equal((src.match(/35% off/g) || []).length, 1, "the discount text exists only in the promo branch");
});

test("desk: score returns the upsell, settings save needs the owner route, score is never blocked", async () => {
  const home = mkdtempSync(join(tmpdir(), "pp-vidiq-"));
  const [port, oauthPort] = await freePorts(2);
  const engine = createEngine({ home, env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: String(oauthPort) } });
  const desk = createDeskServer({ engine, env: { SOCIAL_MCP_DESK_PORT: String(port) }, port });
  await desk.start({ open: false });
  const post = (p, b) => fetch(`http://127.0.0.1:${port}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  try {
    const empty = await post("/api/score", { title: "Resume tips" });
    assert.equal(empty.ok, true);
    assert.equal(empty.upsell.url, VIDIQ_HOME);
    assert.equal(empty.upsell.promo, null);
    const bad = await post("/api/settings/vidiq", { affiliate_url: "ftp://nope" });
    assert.equal(bad.status, 400);
    const saved = await post("/api/settings/vidiq", { affiliate_url: "https://vidiq.com/?ref=t", promo_code: "CODE35" });
    assert.equal(saved.upsell.affiliate, true);
    const after = await post("/api/score", { title: "Resume tips" });
    assert.equal(after.upsell.url, "https://vidiq.com/?ref=t");
    assert.equal(after.upsell.promo, "35% off Pro/Boost with code CODE35");
    assert.equal(after.upsell.disclosure, DISCLOSURE);
    const cleared = await post("/api/settings/vidiq", {});
    assert.equal(cleared.upsell.url, VIDIQ_HOME);
  } finally {
    await desk.stop();
  }
});
