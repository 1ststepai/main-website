import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEngine } from "../src/engine.js";
import { createSocialMcpServer } from "../src/mcp/server.js";
import { createDeskServer } from "../src/desk/server.js";
import { initOwnerPin } from "../src/pilot/ownerAuth.js";
import { createPat } from "../src/mcp/auth.js";
import { listDecisions } from "../src/approvalHistory.js";
import { brandGuide, deriveStats, derivedBullets, proposeStyleNote } from "../src/learning.js";
import { POSTPATH_INSTRUCTIONS } from "../src/mcp/instructions.js";
import { DESK_ROUTES, discardBody, learningDeleteBody, learningResetBody, learningSuggestionBody } from "../src/desk/public/deskApi.js";
import { freePorts } from "./helpers/ports.js";

const DRAFT = ["posts:read", "drafts:write", "accounts:read"];

async function setup({ pin = "246810" } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-learning-"));
  const [port, oauthPort] = await freePorts(2);
  const env = { ANTHROPIC_API_KEY: "", SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_OAUTH_PORT: String(oauthPort) };
  const engine = createEngine({ home, env, publishers: { facebook: async ({ post }) => ({ platform_post_id: `m_${post.id}`, published_url: "https://example.test/x", result_source: "mock" }) } });
  if (pin) initOwnerPin(engine.store.homePaths, pin);
  engine.store.upsertProfile({ id: "acme", name: "Acme" });
  engine.store.saveConnection({ profile_id: "acme", platform: "facebook", account_label: "acme-fb", page_id: "p1" }, { access_token: "tok-secret-value" });
  const media = path.join(engine.store.homePaths.mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(2048, 1));
  let desk;
  return {
    engine, env, media,
    async deskUrl() {
      desk = createDeskServer({ engine, env, port });
      return (await desk.start({ open: false })).url;
    },
    async cleanup() {
      await desk?.stop();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

async function mcpFor(engine, env, auth) {
  const { server } = createSocialMcpServer({ engine, env, auth });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    client,
    async call(name, args = {}) {
      const res = await client.callTool({ name, arguments: args });
      let body = res.structuredContent;
      if (!body) {
        try { body = JSON.parse(res.content?.[0]?.text || "{}"); } catch { body = { text: res.content?.[0]?.text }; }
      }
      return { error: res.isError === true, body, text: res.content?.map((c) => c.text).join("\n") || "" };
    },
    close: () => client.close(),
  };
}

async function post(url, route, body, pin) {
  const headers = { "content-type": "application/json" };
  if (pin) headers["x-postpath-owner-pin"] = pin;
  const res = await fetch(new URL(route, url), { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const rec = (decision, original, final, extra = {}) => ({
  decision,
  platform: "facebook",
  original_text: { title: "", caption: original, description: "" },
  final_text: decision === "rejected" ? null : { title: "", caption: final ?? original, description: "" },
  reason: "",
  decided_at: new Date().toISOString(),
  ...extra,
});

test("derived stats: real counts from history, nothing invented", () => {
  const records = [
    rec("approved_unedited", "Short tip #shop 🙂"), // 17 chars, 1 tag, 1 emoji
    rec("approved_unedited", "Another tidy tip"), // 16
    rec("approved_edited", "A very long caption with #a #b #c tags", "Tidy shelf #a"), // 13
    rec("rejected", "Buy now!!!", null, { reason: "Too salesy" }),
    rec("rejected", "BUY BUY", null, { reason: "too salesy" }),
  ];
  const s = deriveStats(records);
  assert.equal(s.decided, 5);
  assert.equal(s.approved, 3);
  assert.equal(s.rejected, 2);
  assert.deepEqual(s.length, { median: 16, min: 13, max: "Short tip #shop 🙂".length });
  assert.equal(s.posts_with_hashtags, 2);
  assert.equal(s.hashtags_avg, Math.round((2 / 3) * 10) / 10);
  assert.equal(s.posts_with_emoji, 1);
  assert.equal(s.edits.shorter, 1);
  assert.equal(s.edits.hashtags_removed, 1);
  assert.deepEqual(s.rejection_reasons, [{ reason: "Too salesy", count: 2 }]);
  const bullets = derivedBullets(s).map((b) => b.text);
  assert.ok(bullets.some((t) => t.includes("about 16 characters") && t.includes("3 approved posts")));
  assert.ok(bullets.some((t) => t.includes('Rejected 2 times because: "Too salesy"')));
  assert.ok(bullets.some((t) => t.includes("removed hashtags in 1 of 1")));
  assert.deepEqual(derivedBullets(deriveStats(records.slice(0, 2))), [], "too few decisions gives no derived bullets");
  assert.deepEqual(deriveStats([]).length, null);
});

test("pending suggestions: assistant can only propose; owner accepts or dismisses on the desk", async () => {
  const ctx = await setup();
  try {
    const pat = createPat(ctx.engine.store, { name: "Helper", scopes: DRAFT });
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: pat.pat.id });
    const tools = (await mcp.client.listTools()).tools.map((t) => t.name);
    assert.ok(tools.includes("propose_style_note"));
    assert.ok(!tools.some((t) => /accept|write_style|set_style|reset_learning/.test(t)), "no tool writes the guide directly");
    const out = await mcp.call("propose_style_note", { profile_id: "acme", text: "Keep captions under 150 characters.", why: "Owner said shorter" });
    assert.equal(out.error, false, out.text);
    assert.equal(out.body.status, "pending");
    let guide = brandGuide(ctx.engine.store, "acme");
    assert.equal(guide.pending.length, 1);
    assert.equal(guide.bullets.length, 0, "not in the guide until accepted");
    let ctxOut = await mcp.call("get_brand_context", { profile_id: "acme" });
    assert.deepEqual(ctxOut.body.brands[0].learned.style_guide, []);
    assert.equal(ctxOut.body.brands[0].learned.pending_suggestions, 1);
    const dup = await mcp.call("propose_style_note", { profile_id: "acme", text: "keep captions under 150 characters." });
    assert.equal(dup.body.status, "already_pending");
    const other = await mcp.call("propose_style_note", { profile_id: "acme", text: "No emoji on LinkedIn.", network: "linkedin" });

    const url = await ctx.deskUrl();
    const sugId = guide.pending[0].id;
    const accepted = await post(url, "/api/learning/accept", { profile_id: "acme", suggestion_id: sugId });
    assert.equal(accepted.status, 200);
    const acme = accepted.body.learning.brands.find((b) => b.profile_id === "acme");
    assert.deepEqual(acme.bullets.map((b) => b.text), ["Keep captions under 150 characters."]);
    const dismissed = await post(url, "/api/learning/dismiss", { profile_id: "acme", suggestion_id: other.body.id });
    assert.equal(dismissed.status, 200);
    guide = brandGuide(ctx.engine.store, "acme");
    assert.equal(guide.pending.length, 0);
    assert.deepEqual(guide.network_notes, {});
    const del = await post(url, "/api/learning/delete", { profile_id: "acme", bullet_id: guide.bullets[0].id });
    assert.equal(del.status, 200);
    assert.equal(brandGuide(ctx.engine.store, "acme").bullets.length, 0);
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

test("get_brand_context: learned block from real history, reasons and feedback, no secrets", async () => {
  const ctx = await setup();
  try {
    const pat = createPat(ctx.engine.store, { name: "Helper", scopes: DRAFT });
    const mcp = await mcpFor(ctx.engine, ctx.env, { scopes: DRAFT, connectionId: pat.pat.id });
    const url = await ctx.deskUrl();
    const ids = [];
    for (const caption of ["Tidy shelf tip #home", "Two-minute desk reset #home", "Label your bins #home", "Buy our bins today!!!"]) {
      const d = await mcp.call("create_draft", { profile_id: "acme", platform: "facebook", title: "Tip", caption, media_path: ctx.media });
      assert.equal(d.error, false, d.text);
      ids.push(d.body.post.id);
    }
    const upd = await mcp.call("update_draft", { post_id: ids[1], caption: "Desk reset #home", owner_feedback: "Shorter please" });
    assert.equal(upd.error, false, upd.text);
    for (const id of ids.slice(0, 3)) assert.equal((await post(url, "/api/approve", { post_id: id }, "246810")).status, 200);
    const rej = await post(url, "/api/discard", { post_id: ids[3], reason: "Too salesy" });
    assert.equal(rej.status, 200);
    assert.equal(listDecisions(ctx.engine.store, { profile_id: "acme" }).length, 4);
    const out = await mcp.call("get_brand_context", { profile_id: "acme" });
    const learned = out.body.brands[0].learned;
    assert.deepEqual(learned.based_on, { decided_drafts: 4, approved_unedited: 2, approved_edited: 1, rejected: 1 });
    assert.ok(learned.style_guide.some((t) => t.includes("3 approved posts")), JSON.stringify(learned.style_guide));
    assert.ok(learned.network_notes.facebook.length > 0);
    assert.equal(learned.recent_rejection_reasons[0].reason, "Too salesy");
    assert.equal(learned.recent_owner_feedback[0].text, "Shorter please");
    assert.ok(learned.how_to_use.some((t) => t.includes("propose_style_note")));
    assert.ok(!JSON.stringify(out.body).includes("tok-secret-value"));
    assert.match(POSTPATH_INSTRUCTIONS, /Before drafting for a brand, call get_brand_context and follow its style guide/);
    const prompts = (await mcp.client.listPrompts()).prompts.map((p) => p.name);
    assert.ok(prompts.includes("onboard_brand_style"));
    const prompt = await mcp.client.getPrompt({ name: "onboard_brand_style", arguments: { profile_id: "acme" } });
    assert.match(prompt.messages[0].content.text, /propose_style_note/);
    await mcp.close();
  } finally {
    await ctx.cleanup();
  }
});

test("reset: PIN gate when set, confirm when not", async () => {
  const ctx = await setup();
  try {
    proposeStyleNote(ctx.engine.store, { profile_id: "acme", text: "Friendly tone." });
    const url = await ctx.deskUrl();
    assert.equal((await post(url, "/api/learning/reset", { profile_id: "acme" })).status, 401);
    assert.equal((await post(url, "/api/learning/reset", { profile_id: "acme", confirm: true }, "000000")).status, 401);
    assert.equal(brandGuide(ctx.engine.store, "acme").pending.length, 1, "still there after refused resets");
    const ok = await post(url, "/api/learning/reset", { profile_id: "acme" }, "246810");
    assert.equal(ok.status, 200);
    assert.equal(brandGuide(ctx.engine.store, "acme").pending.length, 0);
  } finally {
    await ctx.cleanup();
  }
  const noPin = await setup({ pin: null });
  try {
    const url = await noPin.deskUrl();
    assert.equal((await post(url, "/api/learning/reset", { profile_id: "acme" })).status, 400);
    assert.equal((await post(url, "/api/learning/reset", { profile_id: "acme", confirm: true })).status, 200);
  } finally {
    await noPin.cleanup();
  }
});

test("routes: allowlisted and validated bodies; bad input refused", async () => {
  for (const k of ["learning", "learningAccept", "learningDismiss", "learningDelete", "learningReset", "discard"]) assert.ok(DESK_ROUTES[k]?.startsWith("/api/"));
  assert.throws(() => learningSuggestionBody({ profileId: "../x", suggestionId: "sug_abcd1234" }));
  assert.throws(() => learningSuggestionBody({ profileId: "acme", suggestionId: "note_abcd" }));
  assert.deepEqual(learningSuggestionBody({ profileId: "acme", suggestionId: "sug_abcd1234" }), { profile_id: "acme", suggestion_id: "sug_abcd1234" });
  assert.throws(() => learningDeleteBody({ profileId: "acme", bulletId: "<script>" }));
  assert.deepEqual(learningDeleteBody({ profileId: "acme", bulletId: "derived:brand:length" }), { profile_id: "acme", bullet_id: "derived:brand:length" });
  assert.deepEqual(learningResetBody({ profileId: "acme" }), { profile_id: "acme" });
  assert.deepEqual(discardBody({ kind: "post", id: "post_abcdef123", reason: " too\nlong " }), { post_id: "post_abcdef123", reason: "too long" });
  assert.deepEqual(discardBody({ kind: "bundle", id: "bundle_abcdef12" }), { bundle_id: "bundle_abcdef12" });
  assert.throws(() => discardBody({ kind: "post", id: "x" }));
  assert.equal(discardBody({ id: "post_abcdef123", reason: "x".repeat(500) }).reason.length, 200);

  const ctx = await setup();
  try {
    const url = await ctx.deskUrl();
    assert.equal((await post(url, "/api/learning/accept", { profile_id: "acme", suggestion_id: "bad" })).status, 400);
    assert.equal((await post(url, "/api/learning/accept", { profile_id: "nobody", suggestion_id: "sug_abcd1234" })).status, 404);
    assert.equal((await post(url, "/api/learning/accept", { profile_id: "acme", suggestion_id: "sug_abcd1234" })).status, 404);
    assert.equal((await post(url, "/api/learning/delete", { profile_id: "acme", bullet_id: "x" })).status, 400);
    const simple = await fetch(new URL("/api/learning/delete", url), { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ profile_id: "acme", bullet_id: "derived:brand:length" }) });
    assert.equal(simple.status, 403, "CSRF guard blocks simple cross-site POSTs");
    const view = await (await fetch(new URL("/api/learning", url))).json();
    assert.equal(view.ok, true);
    assert.equal(view.learning.brands[0].profile_id, "acme");
  } finally {
    await ctx.cleanup();
  }
});
