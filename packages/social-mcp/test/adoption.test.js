import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import { initPilot } from "../src/cli.js";
import { initOwnerPin } from "../src/pilot/ownerAuth.js";
import { getBrandContext } from "../src/brand/context.js";
import { STARTER_PACK_IDS, starterPack } from "../src/brand/starterPacks.js";

const PIN = "246810";
let nextPort = 47980;

function mockPublishers() {
  const ok = (platform) => async ({ post }) => ({ platform_post_id: `mock_${post.id}`, published_url: `https://example.test/${platform}/${post.id}`, result_source: "mock" });
  return { youtube: ok("youtube"), facebook: ok("facebook"), instagram: ok("instagram"), linkedin: ok("linkedin") };
}

async function setup({ pilot = false } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-adopt-"));
  const port = nextPort;
  nextPort += 2;
  const env = { ANTHROPIC_API_KEY: "", SOCIAL_MCP_DESK_PORT: String(port), SOCIAL_MCP_OAUTH_PORT: String(port + 1) };
  if (pilot) {
    env.SOCIAL_MCP_PILOT_MODE = "1";
    initPilot({ home, pin: PIN, env });
  }
  const engine = createEngine({ home, env, publishers: mockPublishers() });
  if (!pilot) initOwnerPin(engine.store.homePaths, PIN);
  const media = path.join(engine.store.homePaths.mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(2048, 1));
  const desk = createDeskServer({ engine, env, port });
  const started = await desk.start({ open: false });
  const url = started.url.replace(/\/$/, "");
  return {
    engine,
    url,
    media,
    async post(route, body, pin = PIN) {
      const headers = { "content-type": "application/json" };
      if (pin) headers["x-postpath-owner-pin"] = pin;
      const res = await fetch(`${url}${route}`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    },
    async get(route) {
      const res = await fetch(`${url}${route}`);
      return { status: res.status, text: await res.text(), headers: res.headers };
    },
    async cleanup() {
      await desk.stop();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

function connect(engine, profileId, platform = "facebook") {
  engine.store.saveConnection({ profile_id: profileId, platform, account_label: `${profileId}-${platform}`, page_id: "p1" }, { access_token: "TOKEN_SECRET_A", refresh_token: "TOKEN_SECRET_R" });
}

async function timedSteps(ctx, steps, pin = PIN) {
  const timings = [];
  let last;
  for (const [label, body, before] of steps) {
    if (before) before();
    const start = performance.now();
    last = await ctx.post("/api/onboarding/step", body, pin);
    timings.push({ step: label, ms: Math.round((performance.now() - start) * 10) / 10 });
    assert.equal(last.status, 200, `${label}: ${JSON.stringify(last.body)}`);
  }
  return { timings, last: last.body.onboarding };
}

test("onboarding completes one screen at a time and ends scheduled, never posted", async (t) => {
  const ctx = await setup();
  try {
    const first = JSON.parse((await ctx.get("/api/onboarding")).text).onboarding;
    assert.equal(first.step, "name");
    assert.deepEqual(first.steps, ["name", "pack", "connect", "draft", "approve", "done"]);
    const noPin = await ctx.post("/api/onboarding/step", { step: "name", name: "Harbor Realty" }, null);
    assert.equal(noPin.status, 401);
    const outOfOrder = await ctx.post("/api/onboarding/step", { step: "draft", caption: "x" });
    assert.equal(outOfOrder.status, 409);
    const blocked = [];
    const started = performance.now();
    const { timings, last } = await timedSteps(ctx, [
      ["name", { step: "name", name: "Harbor Realty" }],
      ["pack", { step: "pack", pack: "realtor" }],
      ["connect", { step: "connect" }, () => connect(ctx.engine, "harbor-realty")],
      ["draft", { step: "draft", title: "Open house Saturday", caption: "Open house this Saturday, 1 to 3. Come see the kitchen.", media_path: ctx.media }],
      ["approve", { step: "approve", scheduled_at: new Date(Date.now() + 86_400_000).toISOString() }],
    ]);
    const total = Math.round(performance.now() - started);
    assert.equal(last.step, "done");
    assert.equal(last.outcome, "scheduled");
    assert.equal(ctx.engine.publisherCalls?.() || 0, 0);
    const posts = ctx.engine.store.listPosts({ profileId: "harbor-realty" });
    assert.ok(posts.length >= 1);
    assert.ok(posts.every((p) => p.status === "scheduled"));
    t.diagnostic(`onboarding timing (desk API, mock publishers): ${JSON.stringify(timings)} total ${total}ms`);
    console.log(`ONBOARDING_TIMING ${JSON.stringify({ mode: "standard", timings, total_ms: total })}`);
    assert.deepEqual(blocked, []);
  } finally {
    await ctx.cleanup();
  }
});

test("onboarding in pilot ends at approved, waiting to post", async (t) => {
  const ctx = await setup({ pilot: true });
  try {
    const started = performance.now();
    const { timings, last } = await timedSteps(ctx, [
      ["name", { step: "name", name: "Shore Insurance" }],
      ["pack", { step: "pack", pack: "insurance_agent" }],
      ["connect", { step: "connect", later: true }],
      ["draft", { step: "draft", title: "What a deductible is", caption: "A deductible is the part you pay before coverage starts. Here's how it works." }],
      ["approve", { step: "approve" }],
    ]);
    const total = Math.round(performance.now() - started);
    assert.equal(last.step, "done");
    assert.equal(last.outcome, "approved, waiting to post");
    assert.deepEqual(last.skipped, ["connect"]);
    assert.equal(ctx.engine.publisherCalls?.() || 0, 0);
    const bundle = ctx.engine.store.getBundle(last.bundle_id);
    assert.equal(bundle.status, "approved");
    assert.equal(bundle.queue_label, "approved, waiting to post");
    console.log(`ONBOARDING_TIMING ${JSON.stringify({ mode: "pilot", timings, total_ms: total })}`);
    t.diagnostic(`pilot onboarding total ${total}ms`);
  } finally {
    await ctx.cleanup();
  }
});

test("Set up later exits from every step after the name", async () => {
  const ctx = await setup();
  try {
    const { last } = await timedSteps(ctx, [
      ["name", { step: "name", name: "Later Co" }],
      ["pack", { step: "pack", later: true }],
      ["connect", { step: "connect", later: true }],
      ["draft", { step: "draft", later: true }],
    ]);
    assert.equal(last.step, "done");
    assert.equal(last.outcome, "no_draft");
    assert.deepEqual(last.skipped, ["pack", "connect", "draft"]);
    const noConn = await ctx.post("/api/onboarding/step", { step: "restart" });
    assert.equal(noConn.body.onboarding.step, "name");
  } finally {
    await ctx.cleanup();
  }
});

test("every starter pack fills every brand field; Start blank fills none", async () => {
  const ctx = await setup();
  try {
    for (const pack of STARTER_PACK_IDS) {
      await ctx.post("/api/onboarding/step", { step: "restart" });
      await ctx.post("/api/onboarding/step", { step: "name", name: `Pack ${pack}` });
      const res = await ctx.post("/api/onboarding/step", { step: "pack", pack });
      assert.equal(res.status, 200);
      const id = res.body.onboarding.profile_id;
      const brand = getBrandContext(ctx.engine, { profile_id: id }).brands[0];
      assert.deepEqual(brand.missing, ["connected_accounts"], `${pack} left ${brand.missing.join(", ")}`);
      assert.ok(brand.topics.keywords.secondary.length && brand.topics.keywords.negative.length, pack);
    }
    await ctx.post("/api/onboarding/step", { step: "restart" });
    await ctx.post("/api/onboarding/step", { step: "name", name: "Blank Slate" });
    await ctx.post("/api/onboarding/step", { step: "pack", pack: "blank" });
    const blank = getBrandContext(ctx.engine, { profile_id: "blank-slate" }).brands[0];
    assert.deepEqual(blank.missing, ["audience", "tone", "avoid", "on_camera_style", "energy", "appears_on_camera", "hashtags", "caption_footer", "keywords.primary", "connected_accounts"]);
    assert.deepEqual(blank.topics.keywords.secondary, []);
    assert.deepEqual(blank.topics.keywords.negative, []);
  } finally {
    await ctx.cleanup();
  }
});

test("packs stay editable and use the required avoid lists", async () => {
  const insurance = starterPack("insurance_agent").voice.avoid.join(" ");
  for (const word of ["rates", "savings", "subsidies"]) assert.match(insurance, new RegExp(word));
  const realtor = starterPack("realtor").voice.avoid.join(" ");
  for (const word of ["family-friendly", "safe neighborhood", "exclusive neighborhood", "adults only"]) assert.ok(realtor.includes(word), word);
  for (const id of STARTER_PACK_IDS) {
    const pack = starterPack(id);
    // Avoid lists and negative terms name the risky words on purpose; everything else must stay neutral.
    const text = JSON.stringify({ ...pack, voice: { ...pack.voice, avoid: [] }, search_terms: { ...pack.search_terms, negative: [] } });
    assert.doesNotMatch(text, /\bbest\b|guarantee|#1|cheapest|lowest|save \$|\$\d/i, id);
  }
  const ctx = await setup();
  try {
    await ctx.post("/api/onboarding/step", { step: "name", name: "Edit Me" });
    await ctx.post("/api/onboarding/step", { step: "pack", pack: "coach" });
    const { saveBrandContext } = await import("../src/brand/context.js");
    saveBrandContext(ctx.engine, { profile_id: "edit-me", audience: "First-time runners", voice: { tone: "Dry humor" } });
    const brand = getBrandContext(ctx.engine, { profile_id: "edit-me" }).brands[0];
    assert.equal(brand.identity.audience, "First-time runners");
    assert.equal(brand.voice.tone, "Dry humor");
    assert.equal(brand.voice.energy, "upbeat");
  } finally {
    await ctx.cleanup();
  }
});

function seedPosts(engine) {
  for (const id of ["shop", "other"]) engine.store.upsertProfile({ id, name: id === "shop" ? "Corner Shop" : "Other Brand" });
  const base = { title: "", description: "", tags: [], media_path: "/secret/path/clip.mp4", error: "token abc", caption_provenance: { model: "x" }, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" };
  const rows = [
    { profile_id: "shop", platform: "facebook", status: "published", title: "Posted FB", caption: "POSTED_FB", published_url: "https://facebook.com/p/1" },
    { profile_id: "shop", platform: "linkedin", status: "scheduled", title: "Sched LI", caption: "SCHEDULED_LI", scheduled_at: "2026-11-05T14:00:00Z" },
    { profile_id: "shop", platform: "instagram", status: "approved", title: "Approved IG", caption: "APPROVED_IG", privacy_status: "public" },
    { profile_id: "shop", platform: "youtube", status: "published", privacy_status: "public", title: "Public YT", caption: "PUBLIC_YT", published_url: "https://youtube.com/watch?v=pub" },
    { profile_id: "shop", platform: "youtube", status: "published", privacy_status: "private", title: "Private YT", caption: "PRIVATE_YT", published_url: "https://youtube.com/watch?v=priv" },
    { profile_id: "shop", platform: "youtube", status: "scheduled", privacy_status: "unlisted", title: "Unlisted YT", caption: "UNLISTED_YT" },
    { profile_id: "shop", platform: "facebook", status: "draft", title: "FB draft", caption: "FB_DRAFT" },
    { profile_id: "shop", platform: "linkedin", status: "draft", title: "LI draft", caption: "LI_DRAFT" },
    { profile_id: "shop", platform: "x", status: "failed", title: "Failed", caption: "FAILED_X" },
    { profile_id: "other", platform: "facebook", status: "published", title: "Other", caption: "OTHER_BRAND", published_url: "https://facebook.com/p/9" },
  ];
  for (const row of rows) engine.store.savePost({ id: engine.store.newId("post"), privacy_status: "private", scheduled_at: null, published_url: null, platform_post_id: "plat_123", ...base, ...row }, { create: true });
}

test("brand page is off by default, owner opt-in with PIN, and 404 once turned off", async () => {
  const ctx = await setup();
  try {
    seedPosts(ctx.engine);
    const view = JSON.parse((await ctx.get("/api/brand-page")).text).brand_page;
    assert.ok(view.brands.every((b) => b.enabled === false && b.path === null));
    assert.equal((await ctx.get("/api/brand-page/export.html?profile_id=shop")).status, 404);
    const noPin = await ctx.post("/api/brand-page/enable", { profile_id: "shop" }, null);
    assert.equal(noPin.status, 401);
    const on = await ctx.post("/api/brand-page/enable", { profile_id: "shop" });
    const pagePath = on.body.brand_page.brands.find((b) => b.profile_id === "shop").path;
    assert.match(pagePath, /^\/b\/[A-Za-z0-9_-]{32}$/);
    assert.equal((await ctx.get(pagePath)).status, 200);
    assert.equal((await ctx.get("/b/shop")).status, 404);
    assert.equal((await ctx.get(`${pagePath.slice(0, -1)}x`)).status, 404);
    const off = await ctx.post("/api/brand-page/disable", { profile_id: "shop" }, null);
    assert.equal(off.status, 200);
    assert.equal((await ctx.get(pagePath)).status, 404);
    assert.equal((await ctx.get("/api/brand-page/export.html?profile_id=shop")).status, 404);
    const again = await ctx.post("/api/brand-page/enable", { profile_id: "shop" });
    assert.notEqual(again.body.brand_page.brands.find((b) => b.profile_id === "shop").path, pagePath);
  } finally {
    await ctx.cleanup();
  }
});

test("brand page and export show only approved, scheduled and posted items with no private fields", async () => {
  const ctx = await setup();
  try {
    seedPosts(ctx.engine);
    await saveSecrets(ctx);
    const on = await ctx.post("/api/brand-page/enable", { profile_id: "shop" });
    const pagePath = on.body.brand_page.brands.find((b) => b.profile_id === "shop").path;
    const page = await ctx.get(pagePath);
    const exported = await ctx.get("/api/brand-page/export.html?profile_id=shop");
    assert.match(exported.headers.get("content-disposition"), /attachment/);
    assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
    for (const html of [page.text, exported.text]) {
      for (const shown of ["Corner Shop", "POSTED_FB", "SCHEDULED_LI", "APPROVED_IG", "PUBLIC_YT", "https://facebook.com/p/1", "https://youtube.com/watch?v=pub"]) assert.ok(html.includes(shown), shown);
      for (const hidden of [
        "PRIVATE_YT", "watch?v=priv", "UNLISTED_YT", "FB_DRAFT", "LI_DRAFT", "FAILED_X", "OTHER_BRAND", "Other Brand", "facebook.com/p/9",
        "/secret/path", "token abc", "plat_123", "post_", "caption_provenance", "access_token", "refresh_token", "TOKEN_SECRET",
        "shop-facebook", "Shop owners nearby", "SECRET_KEYWORD", "SECRET_TONE", "owner_pin", PIN, "auto_post", "pat_", "profile_id",
      ]) assert.ok(!html.includes(hidden), `leaked ${hidden}`);
      assert.doesNotMatch(html, /<script/i);
    }
  } finally {
    await ctx.cleanup();
  }
});

function saveSecrets(ctx) {
  connect(ctx.engine, "shop");
  return import("../src/brand/context.js").then(({ saveBrandContext }) =>
    saveBrandContext(ctx.engine, { profile_id: "shop", audience: "Shop owners nearby", search_terms: { primary: ["SECRET_KEYWORD"] }, voice: { tone: "SECRET_TONE" } }),
  );
}
