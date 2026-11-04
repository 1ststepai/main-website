import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { createPat, listPats } from "../src/mcp/auth.js";
import { connectionGrid, connectionHealth, normalizeBrands, registerHealthProbe, youtubeNudge } from "../src/personal/connectionHealth.js";
import { freePorts } from "./helpers/ports.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-04T17:00:00Z");

test("health states: not connected, needs app, connected, expiring, expired", () => {
  assert.equal(connectionHealth(null, { platform: "x", appReady: false }).state, "needs_app");
  assert.equal(connectionHealth(null, { platform: "facebook", appReady: true }).state, "not_connected");
  assert.equal(connectionHealth({ account_label: "Page" }, { platform: "facebook", now: NOW }).state, "connected");
  const yt = (daysAgo) => connectionHealth({ updated_at: new Date(NOW - daysAgo * DAY).toISOString() }, { platform: "youtube", now: NOW });
  assert.equal(yt(1).state, "connected");
  assert.equal(yt(6).state, "expiring");
  assert.equal(yt(8).state, "expired");
  assert.equal(connectionHealth({ updated_at: new Date(NOW - 8 * DAY).toISOString() }, { platform: "youtube", now: NOW, googleTesting: false }).state, "connected");
  assert.equal(connectionHealth({ status: "needs_reconnect" }, { platform: "tiktok", now: NOW }).state, "expired");
  assert.equal(connectionHealth({ refresh_expires_at: new Date(NOW + DAY).toISOString() }, { platform: "x", now: NOW }).state, "expiring");
});

test("platforms lane can register a health probe", () => {
  const off = registerHealthProbe("pinterest", () => ({ state: "expiring", note: "probe" }));
  try {
    assert.equal(connectionHealth({}, { platform: "pinterest", now: NOW }).note, "probe");
  } finally {
    off();
  }
  assert.equal(connectionHealth({}, { platform: "pinterest", now: NOW }).state, "connected");
});

test("grid is 3 brands × 6 networks with a YouTube nudge", () => {
  const conns = { "1ststep-ai": [{ platform: "youtube", updated_at: new Date(NOW - 6.5 * DAY).toISOString() }, { platform: "facebook", account_label: "1stStep" }] };
  const grid = connectionGrid({ listConnections: (id) => conns[id] || [], appReady: { google: true, meta: true }, now: NOW });
  assert.equal(grid.rows.length, 3);
  assert.deepEqual(grid.rows.map((r) => r.cells.length), [6, 6, 6]);
  assert.deepEqual(grid.networks.map((n) => n.id), ["youtube", "facebook", "instagram", "x", "tiktok", "pinterest"]);
  const first = Object.fromEntries(grid.rows[0].cells.map((c) => [c.platform, c.state]));
  assert.deepEqual(first, { youtube: "expiring", facebook: "connected", instagram: "not_connected", x: "needs_app", tiktok: "needs_app", pinterest: "needs_app" });
  assert.match(grid.youtube_nudge.message, /7 days.*1stStep\.ai/);
  assert.equal(youtubeNudge([], NOW), null);
});

test("brands field: ids, all, unknown rejected", () => {
  assert.deepEqual(normalizeBrands(["*"]), ["*"]);
  assert.deepEqual(normalizeBrands(["skillsprout", "skillsprout"]), ["skillsprout"]);
  assert.deepEqual(normalizeBrands(["skillsprout", "*"]), ["*"]);
  assert.throws(() => normalizeBrands([]), /at least one/);
  assert.throws(() => normalizeBrands(["acme"]), /Unknown brand/);
});

test("PAT records carry brands and default to all", async () => {
  const home = mkdtempSync(join(tmpdir(), "pp-personal-"));
  try {
    const engine = createEngine({ home, env: {} });
    // #77: a brand-scoped token needs the brand to exist first.
    assert.throws(() => createPat(engine.store, { name: "early", brands: ["swing-trade-pros"] }), /Unknown brand/);
    await engine.upsertProfile({ id: "swing-trade-pros", name: "Swing Trade Pros" });
    const a = createPat(engine.store, { name: "a", brands: ["swing-trade-pros"] });
    assert.deepEqual(a.pat.brands, ["swing-trade-pros"]);
    const b = createPat(engine.store, { name: "b" });
    assert.deepEqual(b.pat.brands, ["*"]);
    assert.equal(listPats(engine.store).length, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("personal desk API: page, grid, per-brand queue, draft-only token", async () => {
  const [deskPort, oauthPort] = await freePorts(2);
  const home = mkdtempSync(join(tmpdir(), "pp-personal-desk-"));
  const env = { SOCIAL_MCP_DESK_PORT: String(deskPort), SOCIAL_MCP_OAUTH_PORT: String(oauthPort), SOCIAL_MCP_PUBLISH_MODE: "mock" };
  const engine = createEngine({ home, env });
  const desk = createDeskServer({ engine, env, port: deskPort });
  try {
    const { url } = await desk.start({ open: false });
    const html = await fetch(`${url}personal.html`).then((r) => r.text());
    assert.match(html, /Connect your assistant/);
    assert.doesNotMatch(html, /waitlist|billing|installer/i);
    for (const id of ["1ststep-ai", "skillsprout"]) await engine.upsertProfile({ id, name: id });
    await engine.createDraft({ profile_id: "1ststep-ai", platforms: ["facebook"], caption: "one" });
    await engine.createDraft({ profile_id: "skillsprout", platforms: ["facebook"], caption: "two" });
    const all = await fetch(`${url}api/personal`).then((r) => r.json());
    assert.equal(all.ok, true);
    assert.equal(all.grid.rows.length, 3);
    assert.equal(all.mcp_url, `http://127.0.0.1:${deskPort}/mcp`);
    const one = await fetch(`${url}api/personal?brand=skillsprout`).then((r) => r.json());
    assert.ok(one.queue.every((item) => item.profile_id === "skillsprout"));
    assert.equal(one.queue.length, 1);
    assert.equal(all.queue.length, 2);

    const post = (body) => fetch(`${url}api/personal/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const res = await post({ name: "Marketing Desk", brands: ["1ststep-ai", "skillsprout"], scopes: ["owner"] });
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.match(created.token, /^pp_pat_/);
    assert.deepEqual(created.pat.brands, ["1ststep-ai", "skillsprout"]);
    assert.deepEqual([...created.pat.scopes].sort(), ["accounts:read", "drafts:write", "posts:read"]);
    assert.equal((await post({ brands: [] })).status, 400);
    const listed = await fetch(`${url}api/personal`).then((r) => r.json());
    assert.equal(JSON.stringify(listed).includes(created.token), false);
  } finally {
    await desk.stop?.();
    rmSync(home, { recursive: true, force: true });
  }
});
