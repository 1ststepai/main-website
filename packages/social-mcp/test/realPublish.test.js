import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { assessOAuthValues } from "../src/oauth/credentials.js";
import { mergeOAuthInput } from "../src/envFile.js";
import { mapPlatformError } from "../src/publish/outcome.js";
import { publishYouTubeFromFile } from "../src/publish/youtube.js";
import { publishMetaReel } from "../src/publish/meta.js";

const NOW = () => Date.parse("2026-06-01T12:00:00.000Z");

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name || "").toLowerCase()] || "" },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? {})),
  };
}

async function engineWith(fetchImpl, env = {}) {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-real-"));
  const mediaDir = join(home, "media");
  mkdirSync(mediaDir, { recursive: true });
  const media = join(mediaDir, "clip.mp4");
  writeFileSync(media, Buffer.alloc(64, 7));
  const engine = createEngine({ home, env, fetchImpl, now: NOW });
  await engine.upsertProfile({ id: "acme", name: "Acme" });
  return { home, engine, media };
}

test("credential check accepts a Desktop client id and rejects placeholders", () => {
  const good = assessOAuthValues({
    GOOGLE_OAUTH_CLIENT_ID: "123456789012-abcDEF1234.apps.googleusercontent.com",
    GOOGLE_OAUTH_CLIENT_SECRET: "GOCSPX-real-secret-value",
    META_APP_ID: "123456789012345",
    META_APP_SECRET: "abc123def456ghi789",
  });
  assert.equal(good.google.configured, true);
  assert.equal(good.meta.configured, true);
  const bad = assessOAuthValues({
    GOOGLE_OAUTH_CLIENT_ID: "not-a-google-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "changeme",
  });
  assert.equal(bad.google.ok, false);
  assert.match(bad.google.errors.join(" "), /apps\.googleusercontent\.com/);
  const kept = mergeOAuthInput(
    { GOOGLE_OAUTH_CLIENT_SECRET: "GOCSPX-real-secret-value", GOOGLE_OAUTH_CLIENT_ID: "123456789012-abcDEF1234.apps.googleusercontent.com" },
    { GOOGLE_OAUTH_CLIENT_ID: "123456789012-abcDEF1234.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "" },
  );
  assert.equal(kept.GOOGLE_OAUTH_CLIENT_SECRET, "GOCSPX-real-secret-value");
});

test("mapPlatformError distinguishes rate limit, unverified public upload, and unknown 5xx", () => {
  const quota = mapPlatformError(
    { status: 403 },
    { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } },
    { code: "youtube_upload_failed" },
  );
  assert.equal(quota.code, "rate_limited");
  const locked = mapPlatformError(
    { status: 403 },
    { error: { message: "The video is not private and the app is unverified." } },
    { code: "youtube_upload_failed" },
  );
  assert.equal(locked.code, "youtube_unverified_scope");
  const metaLimited = mapPlatformError(
    { status: 400 },
    { error: { code: 32, message: "Application request limit reached" } },
    { code: "instagram_publish_failed" },
  );
  assert.equal(metaLimited.code, "rate_limited");
  const unknown = mapPlatformError({ status: 503 }, { error: { message: "backend" } }, { code: "youtube_upload_failed" });
  assert.equal(unknown.ambiguous, true);
});

test("youtube upload sends a private resumable short and records the platform id", async () => {
  let metadata = null;
  let uploads = 0;
  const { home, engine, media } = await engineWith(async (url, init = {}) => {
    const href = String(url);
    if (href.includes("oauth2.googleapis.com/token")) {
      return jsonResponse(200, { access_token: "ya-new", expires_in: 3600 });
    }
    if (href.includes("uploadType=resumable")) {
      metadata = JSON.parse(init.body);
      return jsonResponse(200, "", { location: "https://www.googleapis.com/upload/youtube/v3/resumable" });
    }
    if (href.includes("/upload/youtube/v3/resumable")) {
      uploads += 1;
      assert.equal(init.headers.authorization, "Bearer ya-new");
      assert.match(init.headers["content-range"], /^bytes 0-63\/64$/);
      return jsonResponse(200, { id: "short1", status: { privacyStatus: "private" } });
    }
    return jsonResponse(500, {});
  });
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "youtube", account_label: "Swing Trade Pros", channel_id: "UC1" },
      { access_token: "ya-old", refresh_token: "ya-rt", expires_at: "2000-01-01T00:00:00.000Z" },
    );
    const draft = await engine.createDraft({
      profile_id: "acme",
      platform: "youtube",
      title: "Vertical check",
      description: "Private short",
      tags: ["shorts", "postpath"],
      media_path: media,
      privacy_status: "private",
    });
    const published = await engine.publishPost({ post_id: draft.post.id });
    assert.equal(metadata.status.privacyStatus, "private");
    assert.equal(metadata.status.selfDeclaredMadeForKids, false);
    assert.equal(metadata.status.notifySubscribers, false);
    assert.deepEqual(metadata.snippet.tags, ["shorts", "postpath"]);
    assert.equal(uploads, 1);
    assert.equal(published.post.status, "published");
    assert.equal(published.post.outcome, "posted");
    assert.equal(published.post.result_source, "platform");
    assert.equal(published.post.platform_post_id, "short1");
    assert.equal(published.post.privacy_status, "private");
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("youtube quota and transport failures become rate_limited and needs_review", async () => {
  const quota = await engineWith(async (url) => {
    if (String(url).includes("uploadType=resumable")) {
      return jsonResponse(403, { error: { message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } });
    }
    return jsonResponse(500, {});
  });
  try {
    quota.engine.store.saveConnection(
      { profile_id: "acme", platform: "youtube", account_label: "Channel", channel_id: "UC1" },
      { access_token: "ya", refresh_token: "rt", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const draft = await quota.engine.createDraft({
      profile_id: "acme",
      platform: "youtube",
      title: "Quota",
      media_path: quota.media,
    });
    await assert.rejects(quota.engine.publishPost({ post_id: draft.post.id }), (error) => error.code === "rate_limited");
    const row = quota.engine.store.getPost(draft.post.id);
    assert.equal(row.status, "failed");
    assert.equal(row.outcome, "rate_limited");
    assert.equal(row.error.code, "rate_limited");
    assert.equal(row.result_source, "platform");
    await quota.engine.oauth.stop();
  } finally {
    rmSync(quota.home, { recursive: true, force: true });
  }

  let calls = 0;
  const down = await engineWith(async () => {
    calls += 1;
    return jsonResponse(503, { error: { message: "backend" } });
  });
  try {
    down.engine.store.saveConnection(
      { profile_id: "acme", platform: "youtube", account_label: "Channel", channel_id: "UC1" },
      { access_token: "ya", refresh_token: "rt", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const draft = await down.engine.createDraft({
      profile_id: "acme",
      platform: "youtube",
      title: "Down",
      media_path: down.media,
    });
    await assert.rejects(down.engine.publishPost({ post_id: draft.post.id }), (error) => error.code === "dispatch_ambiguous");
    const row = down.engine.store.getPost(draft.post.id);
    assert.equal(row.status, "needs_review");
    assert.equal(row.outcome, "needs_review");
    assert.equal(row.result_source, "platform");
    assert.equal(calls, 1);
    await down.engine.oauth.stop();
  } finally {
    rmSync(down.home, { recursive: true, force: true });
  }
});

test("youtube adapter rejects an unverified public upload while the access token is still valid", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-yt-"));
  const file = join(home, "clip.mp4");
  writeFileSync(file, Buffer.alloc(8, 1));
  let refreshes = 0;
  try {
    await assert.rejects(
      publishYouTubeFromFile({
        post: { media_path: file, title: "Public", privacy_status: "public", media_content_type: "video/mp4" },
        mediaRoot: home,
        secrets: { access_token: "old", refresh_token: "rt", expires_at: "2099-01-01T00:00:00.000Z" },
        oauth: { clientId: "123.apps.googleusercontent.com", clientSecret: "secret" },
        fetchImpl: async (url) => {
          if (String(url).includes("uploadType=resumable")) {
            return jsonResponse(403, {
              error: { message: "The video is not private and the app is unverified." },
            });
          }
          refreshes += 1;
          return jsonResponse(200, { access_token: "new", expires_in: 3600 });
        },
      }),
      (error) => error.code === "youtube_unverified_scope",
    );
    assert.equal(refreshes, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("instagram resumable upload publishes only when public, from the local file", async () => {
  const calls = [];
  const { home, engine, media } = await engineWith(async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, method: init.method || "GET", body: String(init.body || "") });
    if (href.includes("upload_type") || (href.endsWith("/media") && String(init.body || "").includes("resumable"))) {
      return jsonResponse(200, { id: "igc", uri: "https://rupload.facebook.com/ig-api-upload/v22.0/igc" });
    }
    if (href.includes("rupload.facebook.com")) {
      assert.equal(init.headers.authorization, "OAuth page-token");
      assert.equal(init.headers.file_size, "64");
      return jsonResponse(200, { success: true });
    }
    if (href.includes("status_code")) return jsonResponse(200, { status_code: "FINISHED" });
    if (href.includes("/media_publish")) return jsonResponse(200, { id: "ig-live" });
    return jsonResponse(500, { unexpected: href });
  });
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "instagram", account_label: "@acme", instagram_id: "ig1", page_id: "pg" },
      { page_access_token: "page-token" },
    );
    const blocked = await engine.createDraft({
      profile_id: "acme",
      platform: "instagram",
      caption: "keep private",
      media_path: media,
      privacy_status: "private",
    });
    await assert.rejects(engine.publishPost({ post_id: blocked.post.id }), (error) => error.code === "validation_failed");
    assert.equal(engine.store.getPost(blocked.post.id).status, "draft");
    assert.equal(calls.length, 0);

    const draft = await engine.createDraft({
      profile_id: "acme",
      platform: "instagram",
      caption: "reel",
      media_path: media,
      privacy_status: "public",
    });
    const published = await engine.publishPost({ post_id: draft.post.id });
    assert.equal(published.post.platform_post_id, "ig-live");
    assert.equal(published.post.outcome, "posted");
    assert.equal(published.post.result_source, "platform");
    assert.match(published.post.publish_note, /public/);
    assert.ok(calls.some((call) => call.body.includes("upload_type=resumable")));
    assert.ok(calls.some((call) => call.href.includes("rupload.facebook.com")));
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("facebook local reel upload stays a draft unless privacy is public", async () => {
  const bodies = [];
  const { home, engine, media } = await engineWith(async (url, init = {}) => {
    const href = String(url);
    bodies.push(String(init.body || ""));
    if (href.includes("rupload.facebook.com")) return jsonResponse(200, { success: true });
    if (href.includes("/video_reels") && String(init.body || "").includes("upload_phase=start")) {
      return jsonResponse(200, { video_id: "reel1", upload_url: "https://rupload.facebook.com/video-upload/v22.0/reel1" });
    }
    if (href.includes("/video_reels")) return jsonResponse(200, { success: true });
    return jsonResponse(500, { unexpected: href });
  });
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "facebook", account_label: "Page", page_id: "pg" },
      { page_access_token: "page-token" },
    );
    const draft = await engine.createDraft({
      profile_id: "acme",
      platform: "facebook",
      caption: "desk reel",
      title: "Desk reel",
      media_path: media,
      privacy_status: "private",
    });
    const saved = await engine.publishPost({ post_id: draft.post.id });
    assert.equal(saved.post.status, "handed_off");
    assert.equal(saved.post.outcome, "handed_off");
    assert.equal(saved.post.result_source, "platform");
    assert.equal(saved.post.published_url, null);
    assert.equal(saved.post.platform_post_id, "reel1");
    assert.ok(bodies.some((body) => body.includes("video_state=DRAFT")));
    assert.equal(bodies.some((body) => body.includes("video_state=PUBLISHED")), false);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("facebook rate limit is stored as rate_limited and is not retried", async () => {
  let calls = 0;
  const { home, engine, media } = await engineWith(async () => {
    calls += 1;
    return jsonResponse(429, { error: { message: "Too many calls", code: 4 } });
  });
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "facebook", account_label: "Page", page_id: "pg" },
      { page_access_token: "page-token" },
    );
    const draft = await engine.createDraft({
      profile_id: "acme",
      platform: "facebook",
      caption: "later",
      media_path: media,
    });
    await assert.rejects(engine.publishPost({ post_id: draft.post.id }), (error) => error.code === "rate_limited");
    const row = engine.store.getPost(draft.post.id);
    assert.equal(row.outcome, "rate_limited");
    assert.equal(row.result_source, "platform");
    assert.equal(calls, 1);
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("mock mode records a labeled result and does not call the network", async () => {
  let calls = 0;
  const { home, engine, media } = await engineWith(async () => {
    calls += 1;
    return jsonResponse(500, {});
  }, { SOCIAL_MCP_PUBLISH_MODE: "mock" });
  try {
    engine.store.saveConnection(
      { profile_id: "acme", platform: "youtube", account_label: "Channel", channel_id: "UC1" },
      { access_token: "ya", refresh_token: "rt", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const draft = await engine.createDraft({
      profile_id: "acme",
      platform: "youtube",
      title: "Practice",
      media_path: media,
    });
    const published = await engine.publishPost({ post_id: draft.post.id });
    assert.equal(calls, 0);
    assert.equal(published.post.result_source, "mock");
    assert.equal(published.post.outcome, "posted");
    assert.match(published.post.publish_note, /Nothing was sent/);
    assert.equal(engine.publicStatus().publish_mode, "mock");
    await engine.oauth.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("mock mode can show failed, rate_limited, and needs_review without a platform call", async () => {
  for (const outcome of ["failed", "rate_limited", "needs_review"]) {
    let calls = 0;
    const { home, engine, media } = await engineWith(async () => {
      calls += 1;
      return jsonResponse(200, {});
    }, { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_MOCK_OUTCOME: outcome });
    try {
      engine.store.saveConnection(
        { profile_id: "acme", platform: "youtube", account_label: "Channel", channel_id: "UC1" },
        { access_token: "ya", refresh_token: "rt", expires_at: "2099-01-01T00:00:00.000Z" },
      );
      const draft = await engine.createDraft({
        profile_id: "acme",
        platform: "youtube",
        title: outcome,
        media_path: media,
      });
      await assert.rejects(engine.publishPost({ post_id: draft.post.id }));
      const row = engine.store.getPost(draft.post.id);
      assert.equal(row.outcome, outcome);
      assert.equal(row.result_source, "mock");
      assert.equal(calls, 0);
      await engine.oauth.stop();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test("meta adapter reports instagram processing without publishing", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-ig-"));
  const file = join(home, "clip.mp4");
  writeFileSync(file, Buffer.alloc(4, 2));
  let publishes = 0;
  try {
    await assert.rejects(
      publishMetaReel({
        post: { media_path: file, caption: "reel", privacy_status: "public", platform: "instagram" },
        platform: "instagram",
        connection: { instagram_id: "ig1" },
        secrets: { page_access_token: "page-token" },
        mediaRoot: home,
        sleep: async () => {},
        fetchImpl: async (url) => {
          const href = String(url);
          if (href.includes("/media_publish")) {
            publishes += 1;
            return jsonResponse(200, { id: "should-not" });
          }
          if (href.endsWith("/media")) return jsonResponse(200, { id: "igc", uri: "https://rupload.facebook.com/ig-api-upload/v22.0/igc" });
          if (href.includes("rupload.facebook.com")) return jsonResponse(200, { success: true });
          if (href.includes("status_code")) return jsonResponse(200, { status_code: "IN_PROGRESS" });
          return jsonResponse(500, {});
        },
      }),
      (error) => error.code === "instagram_processing",
    );
    assert.equal(publishes, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
