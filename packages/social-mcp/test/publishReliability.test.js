import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createSocialMcpServer } from "../src/index.js";
import { createStore } from "../src/store.js";

const NOW = Date.parse("2026-01-15T00:00:00.000Z");

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name || "").toLowerCase()] || "" },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? {})),
  };
}

async function xEngine(fetchImpl, now = () => NOW) {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-rel-"));
  const engine = createEngine({
    home,
    env: { X_CLIENT_ID: "xid", X_CLIENT_SECRET: "xsecret" },
    fetchImpl,
    now,
  });
  await engine.upsertProfile({ id: "acme", name: "Acme" });
  engine.store.saveConnection(
    { profile_id: "acme", platform: "x", account_label: "@acme", user_id: "1" },
    { access_token: "token-a", refresh_token: "refresh-a", expires_at: "2099-01-01T00:00:00.000Z" },
  );
  return { home, engine };
}

async function xDraft(engine, caption = "hello from postpath") {
  return engine.createDraft({ profile_id: "acme", platform: "x", caption });
}

test("list_posts schema includes needs_review", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-rel-"));
  try {
    const engine = createEngine({ home, now: () => NOW });
    createSocialMcpServer({ engine });
    assert.ok(engine.statuses.includes("needs_review"));
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("cancel before dispatch does not call fetch", async () => {
  let fetches = 0;
  const { home, engine } = await xEngine(async () => {
    fetches += 1;
    return jsonResponse(201, { data: { id: "should-not" } });
  });
  try {
    const { post } = await xDraft(engine, "queued");
    await engine.schedulePost({ post_id: post.id, scheduled_at: "2026-02-01T15:00:00.000Z" });
    const original = engine.store.getPost.bind(engine.store);
    let arm = true;
    engine.store.getPost = (id) => {
      const row = original(id);
      if (arm && row?.id === post.id && row.status === "scheduled") {
        arm = false;
        queueMicrotask(() => engine.cancelScheduledPost({ post_id: post.id }));
      }
      return row;
    };
    await assert.rejects(
      () => engine.publishPost({ post_id: post.id, force: true }),
      (error) => error.code === "cancelled_before_dispatch",
    );
    assert.equal(fetches, 0);
    assert.equal(engine.store.getPost(post.id).status, "draft");
    assert.equal(engine.store.getPost(post.id).scheduled_at, null);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("publish_due does not fetch when cancel wins after the due snapshot", async () => {
  let fetches = 0;
  let clock = Date.parse("2026-02-01T12:00:00.000Z");
  const { home, engine } = await xEngine(async () => {
    fetches += 1;
    return jsonResponse(201, { data: { id: "should-not" } });
  }, () => clock);
  try {
    const { post } = await xDraft(engine, "due soon");
    await engine.schedulePost({ post_id: post.id, scheduled_at: "2026-02-01T15:00:00.000Z" });
    clock = Date.parse("2026-02-01T16:00:00.000Z");
    const original = engine.store.listPosts.bind(engine.store);
    engine.store.listPosts = (query) => {
      const rows = original(query);
      if (query?.status === "scheduled" && rows.length) {
        queueMicrotask(() => engine.cancelScheduledPost({ post_id: rows[0].id }));
      }
      return rows;
    };
    const due = await engine.publishDue({ profile_id: "acme" });
    assert.equal(fetches, 0);
    assert.equal(due.count, 0);
    assert.equal(engine.store.getPost(post.id).status, "draft");
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("overlapping publishPost calls dispatch once", async () => {
  let calls = 0;
  let release;
  let markStarted;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const { home, engine } = await xEngine(async (url) => {
    if (!String(url).includes("/tweets")) return jsonResponse(500, {});
    calls += 1;
    markStarted();
    await gate;
    return jsonResponse(201, { data: { id: "once" } });
  });
  try {
    const { post } = await xDraft(engine);
    const first = engine.publishPost({ post_id: post.id });
    const second = engine.publishPost({ post_id: post.id });
    await started;
    assert.equal(calls, 1);
    await assert.rejects(second, (error) => error.code === "dispatch_started");
    release();
    const published = await first;
    assert.equal(published.post.status, "published");
    assert.equal(calls, 1);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("cancel during publishing returns dispatch_started and does not revert the row", async () => {
  let release;
  let markStarted;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const { home, engine } = await xEngine(async (url) => {
    if (!String(url).includes("/tweets")) return jsonResponse(500, {});
    markStarted();
    await gate;
    return jsonResponse(201, { data: { id: "live" } });
  });
  try {
    const { post } = await xDraft(engine);
    const pending = engine.publishPost({ post_id: post.id });
    await started;
    await assert.rejects(engine.cancelScheduledPost({ post_id: post.id }), (error) => {
      assert.equal(error.code, "dispatch_started");
      assert.match(error.message, /cannot guarantee the platform did not accept/);
      assert.doesNotMatch(error.message, /returned to draft successfully|has been undone/i);
      return true;
    });
    assert.equal(engine.store.getPost(post.id).status, "publishing");
    release();
    const published = await pending;
    assert.equal(published.post.status, "published");
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("startup publishing rows become needs_review and are not sent", async () => {
  let fetches = 0;
  const home = mkdtempSync(join(tmpdir(), "social-mcp-rel-"));
  let clock = Date.parse("2026-02-02T10:00:00.000Z");
  try {
    const first = createEngine({
      home,
      env: { X_CLIENT_ID: "xid", X_CLIENT_SECRET: "xsecret" },
      fetchImpl: async () => {
        fetches += 1;
        return jsonResponse(201, { data: { id: "due-ok" } });
      },
      now: () => clock,
    });
    await first.upsertProfile({ id: "acme", name: "Acme" });
    first.store.saveConnection(
      { profile_id: "acme", platform: "x", account_label: "@acme", user_id: "1" },
      { access_token: "token-a", refresh_token: "refresh-a", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const stuck = await first.createDraft({ profile_id: "acme", platform: "x", caption: "stuck" });
    const live = first.store.getPost(stuck.post.id);
    live.status = "publishing";
    first.store.savePost(live);
    const dueDraft = await first.createDraft({ profile_id: "acme", platform: "x", caption: "due" });
    await first.schedulePost({ post_id: dueDraft.post.id, scheduled_at: "2026-02-02T11:00:00.000Z" });
    clock = Date.parse("2026-02-02T12:00:00.000Z");
    await first.oauth.stop();

    const restarted = createEngine({
      home,
      env: { X_CLIENT_ID: "xid", X_CLIENT_SECRET: "xsecret" },
      fetchImpl: async () => {
        fetches += 1;
        return jsonResponse(201, { data: { id: "due-ok" } });
      },
      now: () => clock,
    });
    const due = await restarted.publishDue({ profile_id: "acme" });
    assert.equal(restarted.store.getPost(stuck.post.id).status, "needs_review");
    assert.equal(due.count, 1);
    assert.equal(due.results[0].post.id, dueDraft.post.id);
    assert.equal(fetches, 1);
    const again = await restarted.publishDue({ profile_id: "acme" });
    assert.equal(again.count, 0);
    assert.equal(fetches, 1);
    const listed = await restarted.listPosts({ status: "needs_review" });
    assert.equal(listed.posts.length, 1);
    await restarted.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("network error after the publish request is needs_review and is not auto-retried", async () => {
  let tweets = 0;
  let fail = true;
  const { home, engine } = await xEngine(async (url) => {
    if (!String(url).includes("/tweets")) return jsonResponse(500, {});
    tweets += 1;
    if (fail) throw new TypeError("socket hang up");
    return jsonResponse(201, { data: { id: "after-ack" } });
  });
  try {
    const { post } = await xDraft(engine);
    await assert.rejects(engine.publishPost({ post_id: post.id }), (error) => error.code === "dispatch_ambiguous");
    assert.equal(tweets, 1);
    assert.equal(engine.store.getPost(post.id).status, "needs_review");
    const due = await engine.publishDue({ profile_id: "acme" });
    assert.equal(due.count, 0);
    assert.equal(tweets, 1);
    await assert.rejects(engine.publishPost({ post_id: post.id }), (error) => error.code === "needs_review");
    await assert.rejects(engine.publishPost({ post_id: post.id, force: true }), (error) => error.code === "needs_review");
    assert.equal(tweets, 1);
    fail = false;
    const acknowledged = await engine.publishPost({ post_id: post.id, acknowledge: true });
    assert.equal(acknowledged.post.status, "published");
    assert.equal(tweets, 2);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("token refresh network error before publish is failed and explicit publish_post can retry", async () => {
  let tweets = 0;
  let refreshDown = true;
  const { home, engine } = await xEngine(async (url) => {
    if (String(url).includes("/oauth2/token")) {
      if (refreshDown) throw new TypeError("dns");
      return jsonResponse(200, { access_token: "fresh", expires_in: 7200, refresh_token: "refresh-a" });
    }
    if (String(url).includes("/tweets")) {
      tweets += 1;
      return jsonResponse(201, { data: { id: "retried" } });
    }
    return jsonResponse(500, {});
  });
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "x", account_label: "@acme", user_id: "1" },
      { access_token: "stale", refresh_token: "refresh-a", expires_at: "2020-01-01T00:00:00.000Z" },
    );
    const { post } = await xDraft(engine);
    await assert.rejects(engine.publishPost({ post_id: post.id }));
    assert.equal(tweets, 0);
    const failed = engine.store.getPost(post.id);
    assert.equal(failed.status, "failed");
    assert.notEqual(failed.error.code, "dispatch_ambiguous");
    refreshDown = false;
    const published = await engine.publishPost({ post_id: post.id });
    assert.equal(published.post.status, "published");
    assert.equal(tweets, 1);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("HTTP 429 fails rate_limited without another attempt", async () => {
  let tweets = 0;
  const { home, engine } = await xEngine(async (url) => {
    if (!String(url).includes("/tweets")) return jsonResponse(500, {});
    tweets += 1;
    return jsonResponse(429, { title: "Too Many Requests" });
  });
  try {
    const { post } = await xDraft(engine);
    await assert.rejects(engine.publishPost({ post_id: post.id }), (error) => error.code === "rate_limited");
    assert.equal(tweets, 1);
    assert.equal(engine.store.getPost(post.id).status, "failed");
    assert.equal(engine.store.getPost(post.id).error.code, "rate_limited");
    const due = await engine.publishDue({ profile_id: "acme" });
    assert.equal(due.count, 0);
    assert.equal(tweets, 1);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("401 refreshes once and a second 401 or invalid_grant stops", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-rel-"));
  try {
    let mode = "refresh-once";
    let tweets = 0;
    let refreshes = 0;
    const auths = [];
    const engine = createEngine({
      home,
      env: { X_CLIENT_ID: "xid", X_CLIENT_SECRET: "xsecret" },
      now: () => NOW,
      fetchImpl: async (url, init) => {
        if (String(url).includes("/oauth2/token")) {
          refreshes += 1;
          if (mode === "invalid-grant") {
            return jsonResponse(400, { error: "invalid_grant", error_description: "revoked" });
          }
          return jsonResponse(200, { access_token: "token-refreshed", refresh_token: "refresh-next", expires_in: 7200 });
        }
        if (String(url).includes("/tweets")) {
          tweets += 1;
          auths.push(init.headers.authorization);
          if (mode === "always-401") return jsonResponse(401, { title: "Unauthorized" });
          if (String(init.headers.authorization).includes("token-stale")) {
            return jsonResponse(401, { title: "Unauthorized" });
          }
          return jsonResponse(201, { data: { id: "tw-refresh" } });
        }
        return jsonResponse(500, {});
      },
    });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    const connect = (refresh) =>
      engine.store.saveConnection(
        { profile_id: "acme", platform: "x", account_label: "@acme", user_id: "1" },
        { access_token: "token-stale", refresh_token: refresh, expires_at: "2099-01-01T00:00:00.000Z" },
      );

    connect("refresh-ok");
    const once = await engine.createDraft({ profile_id: "acme", platform: "x", caption: "refresh me" });
    const published = await engine.publishPost({ post_id: once.post.id });
    assert.equal(published.post.status, "published");
    assert.equal(tweets, 2);
    assert.equal(refreshes, 1);
    assert.deepEqual(auths, ["Bearer token-stale", "Bearer token-refreshed"]);

    mode = "always-401";
    tweets = 0;
    refreshes = 0;
    connect("refresh-ok");
    const twice = await engine.createDraft({ profile_id: "acme", platform: "x", caption: "still unauthorized" });
    await assert.rejects(engine.publishPost({ post_id: twice.post.id }), (error) => error.code === "needs_reconnect");
    assert.equal(tweets, 2);
    assert.equal(refreshes, 1);
    assert.equal(engine.store.getConnection("acme", "x").status, "needs_reconnect");
    assert.equal(engine.store.getPost(twice.post.id).status, "failed");
    assert.notEqual(engine.store.getPost(twice.post.id).status, "needs_review");

    mode = "invalid-grant";
    tweets = 0;
    refreshes = 0;
    connect("refresh-revoked");
    const revoked = await engine.createDraft({ profile_id: "acme", platform: "x", caption: "revoked" });
    await assert.rejects(engine.publishPost({ post_id: revoked.post.id }), (error) => error.code === "invalid_grant");
    assert.equal(tweets, 1);
    assert.equal(refreshes, 1);
    assert.equal(engine.store.getConnection("acme", "x").status, "needs_reconnect");
    assert.equal(engine.store.getPost(revoked.post.id).status, "failed");
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("profile tokens are not shared across profiles", async () => {
  const seen = [];
  const { home, engine } = await xEngine(async (url, init) => {
    seen.push({
      url: String(url),
      authorization: init?.headers?.authorization || "",
      body: String(init?.body || ""),
    });
    if (String(url).includes("/tweets")) return jsonResponse(201, { data: { id: "iso-a" } });
    return jsonResponse(500, {});
  });
  try {
    await engine.upsertProfile({ id: "beta", name: "Beta" });
    engine.store.saveConnection(
      { profile_id: "beta", platform: "x", account_label: "@beta", user_id: "2" },
      { access_token: "token-profile-b-only", refresh_token: "refresh-b-only", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    engine.store.saveConnection(
      { profile_id: "acme", platform: "x", account_label: "@acme", user_id: "1" },
      { access_token: "token-profile-a-only", refresh_token: "refresh-a-only", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const { post } = await engine.createDraft({ profile_id: "acme", platform: "x", caption: "from a" });
    await engine.publishPost({ post_id: post.id });
    const blob = JSON.stringify(seen);
    assert.match(blob, /token-profile-a-only/);
    assert.doesNotMatch(blob, /token-profile-b-only/);
    assert.doesNotMatch(blob, /refresh-b-only/);
    assert.equal(engine.store.readSecrets("acme", "x").access_token, "token-profile-a-only");
    assert.equal(engine.store.readSecrets("beta", "x").access_token, "token-profile-b-only");
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("scheduled_at requires an offset and stores distinct DST instants", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-rel-"));
  try {
    const engine = createEngine({ home, now: () => NOW });
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    const make = async () =>
      engine.createDraft({ profile_id: "acme", platform: "x", caption: "when" });

    const bare = await make();
    await assert.rejects(
      () => engine.schedulePost({ post_id: bare.post.id, scheduled_at: "2026-03-08T02:30:00" }),
      (error) => error.code === "invalid_schedule",
    );
    assert.equal(engine.store.getPost(bare.post.id).status, "draft");

    const springBefore = await make();
    const springAfter = await make();
    const springSame = await make();
    const before = await engine.schedulePost({
      post_id: springBefore.post.id,
      scheduled_at: "2026-03-08T01:59:00-05:00",
    });
    assert.equal(before.post.scheduled_at, "2026-03-08T06:59:00.000Z");
    const after = await engine.schedulePost({
      post_id: springAfter.post.id,
      scheduled_at: "2026-03-08T03:00:00-04:00",
    });
    assert.equal(after.post.scheduled_at, "2026-03-08T07:00:00.000Z");
    await assert.rejects(
      () => engine.schedulePost({ post_id: springSame.post.id, scheduled_at: "2026-03-08T07:00:00Z" }),
      (error) => error.code === "duplicate_schedule",
    );
    const rescheduled = await engine.schedulePost({
      post_id: springAfter.post.id,
      scheduled_at: "2026-03-08T07:00:00Z",
    });
    assert.equal(rescheduled.post.id, springAfter.post.id);
    assert.equal(rescheduled.post.scheduled_at, "2026-03-08T07:00:00.000Z");

    const fallEdt = await make();
    const fallEst = await make();
    const fallDup = await make();
    const edt = await engine.schedulePost({
      post_id: fallEdt.post.id,
      scheduled_at: "2026-11-01T01:30:00-04:00",
    });
    const est = await engine.schedulePost({
      post_id: fallEst.post.id,
      scheduled_at: "2026-11-01T01:30:00-05:00",
    });
    assert.equal(edt.post.scheduled_at, "2026-11-01T05:30:00.000Z");
    assert.equal(est.post.scheduled_at, "2026-11-01T06:30:00.000Z");
    assert.notEqual(edt.post.scheduled_at, est.post.scheduled_at);
    await assert.rejects(
      () => engine.schedulePost({ post_id: fallDup.post.id, scheduled_at: "2026-11-01T05:30:00.000Z" }),
      (error) => error.code === "duplicate_schedule",
    );
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a second vault process cannot claim a post the first process already claimed", () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-rel-"));
  try {
    const first = createStore({ home, now: () => NOW });
    const postId = "postcross01";
    first.savePost(
      {
        id: postId,
        profile_id: "acme",
        platform: "x",
        status: "scheduled",
        scheduled_at: "2026-02-01T15:00:00.000Z",
        updated_at: "2026-01-15T00:00:00.000Z",
      },
      { create: true },
    );
    const second = createStore({ home, now: () => NOW });
    const claimed = first.claimPost(postId, ["scheduled"]);
    const raced = second.claimPost(postId, ["scheduled"]);
    assert.equal(claimed.ok, true);
    assert.equal(claimed.post.status, "publishing");
    assert.equal(raced.ok, false);
    assert.equal(raced.status, "publishing");
    assert.equal(second.getPost(postId).status, "publishing");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
