import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAdminSessionToken } from "../lib/admin/auth.js";
import { SOCIAL_BRANDS } from "../lib/social/brands.js";
import { decryptSocialJson, encryptSocialJson } from "../lib/social/tokenCrypto.js";
import { generateApiToken, hashApiToken, tokenHashesEqual } from "../lib/social/apiTokens.js";
import { nextChunkRange } from "../lib/social/publishers/youtube.js";
import { publishers } from "../lib/social/publishers/index.js";
import { YOUTUBE_CHUNK_BYTES } from "../lib/social/constants.js";
import { createMemorySocialKv, resetSocialStore, useSocialStore } from "../lib/social/store.js";
import { resetSocialRateLimit } from "../lib/social/rateLimit.js";
import {
  approvePost,
  authenticateAgentToken,
  completeYouTubeOAuth,
  createApiToken,
  createPostForToken,
  issueUploadForToken,
  listPostsForToken,
  publishDueSlice,
  updatePostForToken,
} from "../lib/social/service.js";
import { saveConnectionEnvelope } from "../lib/social/store.js";
import postsHandler from "../api/social/posts.js";
import adminHandler from "../api/social/admin.js";

const KEY = "ab".repeat(32);

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function withStore(fn) {
  const kv = createMemorySocialKv();
  useSocialStore(kv);
  resetSocialRateLimit();
  try {
    await fn(kv);
  } finally {
    resetSocialStore();
    resetSocialRateLimit();
  }
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(payload) { this.body = payload == null ? "" : String(payload); },
    json() { return JSON.parse(this.body || "{}"); },
  };
}

function response({ status = 200, payload = {}, headers = {} }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    async text() { return typeof payload === "string" ? payload : JSON.stringify(payload); },
  };
}

test.describe("social posting", { concurrency: false }, () => {
  test("brand config is the only registry and swing trade pros is first", () => {
    assert.deepEqual(SOCIAL_BRANDS.map((brand) => brand.id), [
      "swingtradepros",
      "1ststep",
      "skillsprout",
      "daysetgo",
    ]);
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    assert.equal(JSON.stringify(vercel).includes("/api/social/cron"), false);
    assert.equal(vercel.crons, undefined);
    const cryptoSource = readFileSync(new URL("../lib/social/tokenCrypto.js", import.meta.url), "utf8");
    assert.equal(cryptoSource.includes("FIRSTSTEP_DATA_ENCRYPTION_KEY"), false);
    assert.equal(cryptoSource.includes("stripe"), false);
    assert.equal(cryptoSource.includes("SOCIAL_TOKEN_ENC_KEY"), true);
  });

  test("api tokens are hashed and the plaintext is not stored", async () => {
    await withStore(async (kv) => {
      const generated = generateApiToken();
      assert.equal(tokenHashesEqual(hashApiToken(generated.secret), generated.token_hash), true);
      assert.equal(tokenHashesEqual(hashApiToken("stp_wrong_token_value_000000"), generated.token_hash), false);
      const created = await createApiToken("swingtradepros", "Content agent");
      assert.equal(created.secret.startsWith("stp_"), true);
      const stored = JSON.stringify(kv.snapshot());
      assert.equal(stored.includes(created.secret), false);
      assert.equal(stored.includes(hashApiToken(created.secret)), true);
      const record = await authenticateAgentToken(created.secret);
      assert.equal(record.brand_id, "swingtradepros");
      await assert.rejects(() => authenticateAgentToken(`${created.secret}x`), /brand token/i);
    });
  });

  test("social credential encryption round-trips and ignores the studio key", () => {
    const previous = process.env.SOCIAL_TOKEN_ENC_KEY;
    const studio = process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY;
    process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = "11".repeat(32);
    process.env.SOCIAL_TOKEN_ENC_KEY = KEY;
    try {
      const secret = { refresh_token: "refresh-secret-value" };
      const envelope = encryptSocialJson(secret, "social-connection");
      assert.equal(envelope.includes("refresh-secret-value"), false);
      assert.deepEqual(decryptSocialJson(envelope, "social-connection"), secret);
      assert.throws(() => decryptSocialJson(envelope, "social-upload-session"), /could not be decrypted/i);
    } finally {
      restore("SOCIAL_TOKEN_ENC_KEY", previous);
      restore("FIRSTSTEP_DATA_ENCRYPTION_KEY", studio);
    }

    const previousMissing = process.env.SOCIAL_TOKEN_ENC_KEY;
    delete process.env.SOCIAL_TOKEN_ENC_KEY;
    process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = "22".repeat(32);
    try {
      assert.throws(() => encryptSocialJson({ refresh_token: "x" }, "social-connection"), /SOCIAL_TOKEN_ENC_KEY/);
    } finally {
      restore("SOCIAL_TOKEN_ENC_KEY", previousMissing);
    }
  });

  test("a brand token can only draft its own brand and cannot approve", async () => {
    await withStore(async () => {
      const swing = await createApiToken("swingtradepros", "Swing agent");
      const firststep = await createApiToken("1ststep", "Firststep agent");
      const swingToken = await authenticateAgentToken(swing.secret);
      const firststepToken = await authenticateAgentToken(firststep.secret);
      const post = await createPostForToken(swingToken, {
        platform: "youtube",
        title: "Opening range",
        privacy_status: "public",
      });
      assert.equal(post.brand_id, "swingtradepros");
      assert.equal(post.privacy_status, "public");
      assert.equal(post.status, "draft");
      const omitted = await createPostForToken(swingToken, { platform: "youtube", title: "Default private" });
      assert.equal(omitted.privacy_status, "private");

      await assert.rejects(() => createPostForToken(swingToken, {
        platform: "youtube",
        brand_id: "1ststep",
        title: "Wrong brand",
      }), (error) => error.code === "brand_scope");
      await assert.rejects(() => updatePostForToken(swingToken, post.id, { status: "approved" }), (error) => error.code === "agent_forbidden");
      await assert.rejects(() => updatePostForToken(swingToken, post.id, { approved_by: "owner" }), (error) => error.code === "agent_forbidden");
      await assert.rejects(() => updatePostForToken(swingToken, post.id, { scheduled_at: new Date().toISOString() }), (error) => error.code === "agent_forbidden");
      await assert.rejects(() => updatePostForToken(firststepToken, post.id, { title: "Hijack" }), (error) => error.code === "not_found");

      const visible = await listPostsForToken(firststepToken);
      assert.equal(visible.some((item) => item.id === post.id), false);
      const own = await listPostsForToken(swingToken);
      assert.equal(own.some((item) => item.id === post.id), true);

      const res = mockRes();
      await postsHandler({
        method: "PATCH",
        url: `/api/social/posts?id=${post.id}`,
        headers: {
          authorization: `Bearer ${swing.secret}`,
          "content-type": "application/json",
        },
        body: { status: "approved", title: "Still a draft" },
      }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().code, "agent_forbidden");
      const after = await listPostsForToken(swingToken);
      assert.equal(after.find((item) => item.id === post.id).status, "draft");
    });
  });

  test("agents cannot approve through the owner route", async () => {
    const previousSecret = process.env.FIRSTSTEP_ADMIN_SESSION_SECRET;
    process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    try {
      await withStore(async () => {
        const created = await createApiToken("swingtradepros", "Swing agent");
        const token = await authenticateAgentToken(created.secret);
        const post = await createPostForToken(token, {
          platform: "youtube",
          title: "Needs a person",
          title_score: 99,
          thumbnail_score: 99,
          keywords: ["swing trading"],
          status: "ready_for_review",
        });
        const res = mockRes();
        await adminHandler({
          method: "POST",
          url: "/api/social/admin",
          headers: {
            authorization: `Bearer ${created.secret}`,
            "content-type": "application/json",
            origin: "https://1ststep.ai",
            host: "1ststep.ai",
          },
          body: { action: "approve", post_id: post.id },
        }, res);
        assert.equal(res.statusCode, 401);
        const still = await listPostsForToken(token);
        assert.equal(still[0].status, "ready_for_review");

        const owner = mockRes();
        const session = createAdminSessionToken();
        await adminHandler({
          method: "POST",
          url: "/api/social/admin",
          headers: {
            cookie: `fsai_admin_session=${session}`,
            "content-type": "application/json",
            origin: "https://1ststep.ai",
            host: "1ststep.ai",
          },
          body: { action: "approve", post_id: post.id, brand_id: "swingtradepros" },
        }, owner);
        assert.equal(owner.statusCode, 200);
        assert.equal(owner.json().post.status, "approved");
      });
    } finally {
      restore("FIRSTSTEP_ADMIN_SESSION_SECRET", previousSecret);
    }
  });

  test("youtube approval stays blocked under 90 unless the owner types a reason", async () => {
    await withStore(async () => {
      const created = await createApiToken("swingtradepros", "Swing agent");
      const token = await authenticateAgentToken(created.secret);
      const low = await createPostForToken(token, {
        platform: "youtube",
        title: "Low score",
        status: "ready_for_review",
        title_score: 89,
        thumbnail_score: 95,
        keywords: ["swing trading"],
      });
      await assert.rejects(() => approvePost(low.id), (error) => error.code === "vidiq_gate");
      await assert.rejects(() => approvePost(low.id, "short"), (error) => error.code === "vidiq_gate");
      const overridden = await approvePost(low.id, "Owner accepts this title for the open.");
      assert.equal(overridden.status, "approved");
      assert.equal(overridden.override_by, "owner");
      assert.match(overridden.override_reason, /Owner accepts/);
      const { listAudit } = await import("../lib/social/store.js");
      const events = await listAudit();
      assert.equal(events.some((event) => event.action === "approve_override" && /Owner accepts/.test(event.detail?.reason)), true);

      const emptyKeywords = await createPostForToken(token, {
        platform: "youtube",
        title: "No keywords",
        status: "ready_for_review",
        title_score: 96,
        thumbnail_score: 96,
        keywords: [],
      });
      await assert.rejects(() => approvePost(emptyKeywords.id), (error) => error.code === "vidiq_gate");

      const ready = await createPostForToken(token, {
        platform: "youtube",
        title: "Ready video",
        description: "swing trading setup",
        status: "ready_for_review",
        title_score: 90,
        thumbnail_score: 90,
        keywords: ["swing trading"],
      });
      const approved = await approvePost(ready.id);
      assert.equal(approved.status, "approved");
      assert.equal(approved.override_reason, null);

      const untitled = await createPostForToken(token, {
        platform: "youtube",
        title: "",
        status: "ready_for_review",
        title_score: 20,
        thumbnail_score: 20,
        keywords: [],
      });
      await assert.rejects(() => approvePost(untitled.id, "Owner accepts a missing title anyway."), /title/i);
    });
  });

  test("youtube publish chunks from storage and keeps tokens encrypted", async () => {
    const previousKey = process.env.SOCIAL_TOKEN_ENC_KEY;
    const previousId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const previousSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const previousRedirect = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    process.env.SOCIAL_TOKEN_ENC_KEY = KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://www.1ststep.ai/api/social/oauth/callback";
    try {
      await withStore(async (kv) => {
        const calls = [];
        const total = YOUTUBE_CHUNK_BYTES + 12;
        const fetchImpl = async (url, init = {}) => {
          const href = String(url);
          const body = typeof init.body === "string" ? init.body : "";
          calls.push({ href, method: init.method, body, headers: init.headers || {} });
          if (href.includes("/videos") && init.method === "POST") {
            return response({
              headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test-session" },
            });
          }
          if (init.method === "PUT" && href.startsWith("https://www.googleapis.com/youtube/v3/videos?")) {
            return response({ payload: { id: "vid123" } });
          }
          if (init.method === "PUT") {
            const range = init.headers["content-range"];
            const match = /bytes (\d+)-(\d+)\/(\d+)/.exec(range);
            if (!match) return response({ status: 308, headers: { range: "bytes=0-0" } });
            const end = Number(match[2]);
            if (end + 1 >= total) return response({ status: 201, payload: { id: "vid123" } });
            return response({ status: 308, headers: { range: `bytes=0-${end}` } });
          }
          if (href.includes("thumbnails")) return response({ payload: {} });
          throw new Error(`unexpected ${href}`);
        };
        const created = await createApiToken("swingtradepros", "Swing agent");
        const token = await authenticateAgentToken(created.secret);
        const draft = await createPostForToken(token, {
          platform: "youtube",
          title: "Publish me",
          description: "swing trading",
          tags: ["swing trading"],
          status: "ready_for_review",
          title_score: 95,
          thumbnail_score: 95,
          keywords: ["swing trading"],
        });
        const video = await issueUploadForToken(token, {
          post_id: draft.id,
          kind: "video",
          content_type: "video/mp4",
          size: total,
        }, { issueToken: async () => "vercel_blob_client_test_token" });
        const thumb = await issueUploadForToken(token, {
          post_id: draft.id,
          kind: "thumbnail",
          content_type: "image/jpeg",
          size: 8,
        }, { issueToken: async () => "vercel_blob_client_test_thumb" });
        assert.equal(video.pathname.startsWith(`social/swingtradepros/${draft.id}/video-`), true);
        const statBlob = async (pathname) => ({
          pathname,
          size: pathname.includes("/video-") ? total : 8,
          contentType: pathname.includes("/video-") ? "video/mp4" : "image/jpeg",
          url: `https://example.private.blob.vercel-storage.com/${pathname}`,
        });
        await updatePostForToken(token, draft.id, { confirm_upload: { kind: "video", pathname: video.pathname } }, { statBlob });
        await updatePostForToken(token, draft.id, { confirm_upload: { kind: "thumbnail", pathname: thumb.pathname } }, { statBlob });
        await approvePost(draft.id);
        const { schedulePost } = await import("../lib/social/service.js");
        await schedulePost(draft.id, new Date().toISOString());
        await saveConnectionEnvelope("swingtradepros", "youtube", encryptSocialJson({
          brand_id: "swingtradepros",
          platform: "youtube",
          account_label: "@SwingTradePros",
          channel_id: "UC123",
          refresh_token: "refresh-secret-value",
          access_token: "ya29.TESTACCESS",
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, "social-connection"));

        const deleted = [];
        let progress = { continued: true };
        for (let step = 0; step < 5 && progress.continued; step += 1) {
          progress = await publishDueSlice({
            fetchImpl,
            readRange: async (_pathname, start, end) => Buffer.alloc(end - start + 1, 1),
            budgetMs: 60_000,
            deleteAsset: async (pathname) => { deleted.push(pathname); },
          });
        }
        assert.equal(progress.status, "published");
        assert.deepEqual(deleted.sort(), [thumb.pathname, video.pathname].sort());
        const update = calls.find((call) => call.method === "PUT" && call.href.startsWith("https://www.googleapis.com/youtube/v3/videos?"));
        assert.ok(update, "approved draft is finalized with videos.update");
        assert.match(update.body, /"privacyStatus":"private"/);
        assert.equal(progress.published_url, "https://www.youtube.com/watch?v=vid123");
        const init = calls.find((call) => call.method === "POST" && call.href.includes("/videos"));
        assert.match(init.body, /"privacyStatus":"private"/);
        const uploadCalls = calls.filter((call) => call.href.includes("upload_id=test-session") || call.href.includes("thumbnails"));
        assert.equal(uploadCalls.some((call) => JSON.stringify(call).includes("refresh-secret-value")), false);
        assert.equal(uploadCalls.some((call) => JSON.stringify(call.headers).includes("ya29.TESTACCESS")), true);
        const stored = JSON.stringify(kv.snapshot());
        assert.equal(stored.includes("refresh-secret-value"), false);
        assert.equal(stored.includes("ya29.TESTACCESS"), false);
        assert.equal(stored.includes("upload_id=test-session"), false);
        assert.equal(calls.filter((call) => call.method === "PUT").length >= 2, true);
      });
    } finally {
      restore("SOCIAL_TOKEN_ENC_KEY", previousKey);
      restore("GOOGLE_OAUTH_CLIENT_ID", previousId);
      restore("GOOGLE_OAUTH_CLIENT_SECRET", previousSecret);
      restore("GOOGLE_OAUTH_REDIRECT_URI", previousRedirect);
    }
  });

  test("oauth stores the refresh token encrypted and other platforms stay unimplemented", async () => {
    const previousKey = process.env.SOCIAL_TOKEN_ENC_KEY;
    const previousId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const previousSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const previousRedirect = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    process.env.SOCIAL_TOKEN_ENC_KEY = KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://www.1ststep.ai/api/social/oauth/callback";
    try {
      await withStore(async (kv) => {
        const { beginYouTubeConnect } = await import("../lib/social/service.js");
        const started = await beginYouTubeConnect("swingtradepros");
        const state = new URL(started.authorization_url).searchParams.get("state");
        assert.equal(started.authorization_url.includes("google-secret"), false);
        assert.match(started.authorization_url, /youtube\.upload/);
        const fetchImpl = async (url) => {
          if (String(url).includes("oauth2.googleapis.com/token")) {
            return response({
              payload: {
                access_token: "ya29.OAUTHACCESS",
                refresh_token: "refresh-secret-value",
                expires_in: 3600,
                scope: "upload",
              },
            });
          }
          return response({ payload: { items: [{ id: "UC86s7HqMAR-FSfxuv1N1Pwg", snippet: { customUrl: "@SwingTradePros" } }] } });
        };
        const brandId = await completeYouTubeOAuth({ code: "auth-code", state, fetchImpl });
        assert.equal(brandId, "swingtradepros");
        await assert.rejects(() => completeYouTubeOAuth({ code: "auth-code", state, fetchImpl }), (error) => error.code === "invalid_state");
        const stored = JSON.stringify(kv.snapshot());
        assert.equal(stored.includes("refresh-secret-value"), false);
        assert.equal(stored.includes("ya29.OAUTHACCESS"), false);
        assert.equal(stored.includes("auth-code"), false);
        await assert.rejects(() => publishers.x.publishSlice(), (error) => error.code === "publisher_not_implemented");
        assert.equal(publishers.instagram.implemented, true);
        assert.equal(publishers.instagram.privateDraft, false);
        assert.equal(publishers.facebook.implemented, true);
        assert.equal(publishers.facebook.mode, "page_reel");
        assert.equal(publishers.tiktok.implemented, true);
        assert.equal(publishers.tiktok.mode, "inbox_handoff");
        assert.equal(publishers.tiktok.directPost, false);
        assert.equal(publishers.x.implemented, false);
        assert.equal(publishers.youtube.implemented, true);
      });
    } finally {
      restore("SOCIAL_TOKEN_ENC_KEY", previousKey);
      restore("GOOGLE_OAUTH_CLIENT_ID", previousId);
      restore("GOOGLE_OAUTH_CLIENT_SECRET", previousSecret);
      restore("GOOGLE_OAUTH_REDIRECT_URI", previousRedirect);
    }
  });

  test("chunk ranges stay on the YouTube 256KB boundary except the final chunk", () => {
    assert.deepEqual(nextChunkRange(0, 10), { start: 0, end: 9, size: 10 });
    const first = nextChunkRange(0, YOUTUBE_CHUNK_BYTES + 10);
    assert.equal(first.size, YOUTUBE_CHUNK_BYTES);
    assert.equal(first.size % (256 * 1024), 0);
    const last = nextChunkRange(YOUTUBE_CHUNK_BYTES, YOUTUBE_CHUNK_BYTES + 10);
    assert.equal(last.size, 10);
    assert.equal(nextChunkRange(20, 20), null);
  });
  test("youtube video becomes a private platform draft before approval and temp blobs are deleted", async () => {
    const saved = ["SOCIAL_TOKEN_ENC_KEY", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"]
      .map((name) => [name, process.env[name]]);
    process.env.SOCIAL_TOKEN_ENC_KEY = KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://www.1ststep.ai/api/social/oauth/callback";
    try {
      await withStore(async () => {
        const svc = await import("../lib/social/service.js");
        const calls = [];
        const total = 20;
        const reply = ({ status = 200, payload = {}, headers = {} }) => ({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (name) => headers[name.toLowerCase()] || null },
          text: async () => JSON.stringify(payload),
        });
        const fetchImpl = async (url, init = {}) => {
          const href = String(url);
          calls.push({ href, method: init.method, body: typeof init.body === "string" ? init.body : "" });
          if (href.includes("/upload/youtube/v3/videos") && init.method === "POST") {
            return reply({ headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=s2" } });
          }
          if (href.startsWith("https://www.googleapis.com/youtube/v3/videos?")) return reply({ payload: { id: "vidDraft" } });
          if (href.includes("upload_id=s2")) return reply({ status: 201, payload: { id: "vidDraft" } });
          if (href.includes("thumbnails")) return reply({});
          throw new Error(`unexpected ${href}`);
        };
        const created = await svc.createApiToken("swingtradepros", "agent");
        const token = await svc.authenticateAgentToken(created.secret);
        const draft = await svc.createPostForToken(token, {
          platform: "youtube", title: "Draft me", status: "ready_for_review",
          title_score: 95, thumbnail_score: 95, keywords: ["swing"],
        });
        const issue = (kind, type, size) => svc.issueUploadForToken(token, { post_id: draft.id, kind, content_type: type, size }, { issueToken: async () => "vercel_blob_client_test" });
        const video = await issue("video", "video/mp4", total);
        const thumb = await issue("thumbnail", "image/jpeg", 8);
        const statBlob = async (pathname) => ({ pathname, size: pathname.includes("/video-") ? total : 8, contentType: pathname.includes("/video-") ? "video/mp4" : "image/jpeg" });
        await svc.updatePostForToken(token, draft.id, { confirm_upload: { kind: "video", pathname: video.pathname } }, { statBlob });
        await svc.updatePostForToken(token, draft.id, { confirm_upload: { kind: "thumbnail", pathname: thumb.pathname } }, { statBlob });
        await saveConnectionEnvelope("swingtradepros", "youtube", encryptSocialJson({
          refresh_token: "r", access_token: "ya29.X", expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }, "social-connection"));
        const deleted = [];
        const deps = { fetchImpl, readRange: async (_p, a, b) => Buffer.alloc(b - a + 1), budgetMs: 60_000, deleteAsset: async (p) => { deleted.push(p); } };
        const drafted = await svc.publishDueSlice(deps);
        assert.equal(drafted.draft_status, "ready");
        assert.equal(drafted.status, "ready_for_review", "draft upload never approves or publishes");
        assert.deepEqual(deleted.sort(), [thumb.pathname, video.pathname].sort());
        const init = calls.find((call) => call.method === "POST" && call.href.includes("/upload/youtube/v3/videos"));
        assert.match(init.body, /"privacyStatus":"private"/);
        assert.equal(calls.some((call) => call.href.startsWith("https://www.googleapis.com/youtube/v3/videos?")), false);

        await svc.setPostPrivacy(draft.id, "public");
        await svc.approvePost(draft.id);
        await svc.schedulePost(draft.id, new Date().toISOString());
        const before = calls.length;
        const published = await svc.publishDueSlice(deps);
        assert.equal(published.status, "published");
        const after = calls.slice(before);
        assert.equal(after.length, 1, "publishing only flips the existing draft");
        assert.match(after[0].body, /"privacyStatus":"public"/);
      });
    } finally {
      for (const [name, value] of saved) restore(name, value);
    }
  });

  test("rejecting a post deletes its temporary media", async () => {
    await withStore(async () => {
      const svc = await import("../lib/social/service.js");
      const created = await svc.createApiToken("swingtradepros", "agent");
      const token = await svc.authenticateAgentToken(created.secret);
      const draft = await svc.createPostForToken(token, { platform: "instagram", title: "IG", status: "ready_for_review" });
      const up = await svc.issueUploadForToken(token, { post_id: draft.id, kind: "video", content_type: "video/mp4", size: 10 }, { issueToken: async () => "vercel_blob_client_test" });
      await svc.updatePostForToken(token, draft.id, { confirm_upload: { kind: "video", pathname: up.pathname } }, {
        statBlob: async (pathname) => ({ pathname, size: 10, contentType: "video/mp4" }),
      });
      const deleted = [];
      const rejected = await svc.rejectPost(draft.id, "no", Date.now(), { deleteAsset: async (p) => { deleted.push(p); } });
      assert.deepEqual(deleted, [up.pathname]);
      assert.equal(rejected.video_asset.pathname, null);
    });
  });

  test("orphan sweeper deletes only unreferenced blobs older than 24h and is throttled", async () => {
    await withStore(async () => {
      const svc = await import("../lib/social/service.js");
      const now = Date.now();
      const old = new Date(now - 25 * 3600_000).toISOString();
      const fresh = new Date(now - 3600_000).toISOString();
      const deleted = [];
      const marks = new Map();
      const deps = {
        now,
        kvGet: async (k) => marks.get(k) || null,
        kvSet: async (k, v) => { marks.set(k, v); },
        listBlobs: async () => ({ blobs: [
          { pathname: "social/swingtradepros/p1/video-a.mp4", uploadedAt: old },
          { pathname: "social/swingtradepros/p2/video-b.mp4", uploadedAt: fresh },
        ], cursor: null }),
        deleteAsset: async (p) => { deleted.push(p); },
      };
      assert.deepEqual(await svc.sweepOrphanBlobs(deps), { swept: 1, skipped: false });
      assert.deepEqual(deleted, ["social/swingtradepros/p1/video-a.mp4"]);
      assert.equal((await svc.sweepOrphanBlobs(deps)).skipped, true);
    });
  });

  test("tiktok inbox and facebook unpublished request builders", async () => {
    const tiktok = await import("../lib/social/publishers/tiktok.js");
    const facebook = await import("../lib/social/publishers/facebook.js");
    assert.deepEqual(tiktok.tiktokChunkPlan(1000), { video_size: 1000, chunk_size: 1000, total_chunk_count: 1 });
    const big = 200 * 1024 * 1024;
    assert.equal(tiktok.tiktokChunkPlan(big, 10 * 1024 * 1024).total_chunk_count, 20);
    let sent;
    const out = await tiktok.initTikTokInboxUpload({
      accessToken: "act", videoSize: 1000,
      fetchImpl: async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ data: { publish_id: "p", upload_url: "https://open-upload.tiktokapis.com/x" }, error: { code: "ok" } }) }; },
    });
    assert.equal(sent.url, tiktok.TIKTOK_INIT_URL);
    assert.equal(sent.body.source_info.source, "FILE_UPLOAD");
    assert.equal(out.publish_id, "p");
    assert.equal(tiktok.tiktokChunkHeaders({ start: 0, end: 9, total: 10, contentType: "video/mp4" })["content-range"], "bytes 0-9/10");
    assert.throws(() => tiktok.tiktokChunkHeaders({ start: 0, end: 9, total: 10, contentType: "video/x-msvideo" }));
    const params = facebook.facebookUnpublishedVideoParams({ fileUrl: "https://example.com/v.mp4", title: "t" });
    assert.equal(params.get("published"), "false");
    assert.throws(() => facebook.facebookUnpublishedVideoParams({ fileUrl: "http://example.com/v.mp4" }));
  });

  test("the wrong YouTube channel is refused and nothing is stored", async () => {
    const saved = ["SOCIAL_TOKEN_ENC_KEY", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"]
      .map((name) => [name, process.env[name]]);
    process.env.SOCIAL_TOKEN_ENC_KEY = KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://www.1ststep.ai/api/social/oauth/callback";
    try {
      await withStore(async (kv) => {
        const svc = await import("../lib/social/service.js");
        const started = await svc.beginYouTubeConnect("swingtradepros");
        const state = new URL(started.authorization_url).searchParams.get("state");
        const fetchImpl = async (url) => {
          if (String(url).includes("oauth2.googleapis.com/token")) {
            return response({ payload: { access_token: "ya29.WRONG", refresh_token: "refresh-wrong", expires_in: 3600 } });
          }
          return response({ payload: { items: [{ id: "UC999", snippet: { customUrl: "@someone" } }] } });
        };
        await assert.rejects(
          () => svc.completeYouTubeOAuth({ code: "auth-code", state, fetchImpl }),
          (error) => error.code === "account_mismatch",
        );
        const stored = JSON.stringify(kv.snapshot());
        assert.equal(stored.includes("refresh-wrong"), false);
        assert.equal(stored.includes("ya29.WRONG"), false);
      });
    } finally {
      for (const [name, value] of saved) restore(name, value);
    }
  });

  test("Meta connect keeps only the Swing Trade Pros Instagram account", async () => {
    const saved = ["SOCIAL_TOKEN_ENC_KEY", "META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI"]
      .map((name) => [name, process.env[name]]);
    process.env.SOCIAL_TOKEN_ENC_KEY = KEY;
    process.env.META_APP_ID = "meta-app";
    process.env.META_APP_SECRET = "meta-secret";
    process.env.META_OAUTH_REDIRECT_URI = "https://www.1ststep.ai/api/social/oauth/callback";
    try {
      await withStore(async (kv) => {
        const svc = await import("../lib/social/service.js");
        const started = await svc.beginMetaConnect("swingtradepros");
        assert.equal(started.authorization_url.includes("meta-secret"), false);
        assert.match(started.authorization_url, /instagram_content_publish/);
        const state = new URL(started.authorization_url).searchParams.get("state");
        const pages = [{
          id: "111",
          name: "Other",
          access_token: "page-secret",
          instagram_business_account: { id: "999", username: "other" },
        }];
        const fetchImpl = async (url) => {
          const href = String(url);
          if (href.includes("/oauth/access_token")) return response({ payload: { access_token: "user-secret", expires_in: 3600 } });
          return response({ payload: { data: pages } });
        };
        await assert.rejects(
          () => svc.completeMetaOAuth({ code: "meta-code", state, fetchImpl }),
          (error) => error.code === "account_mismatch",
        );
        assert.equal(JSON.stringify(kv.snapshot()).includes("page-secret"), false);
      });
    } finally {
      for (const [name, value] of saved) restore(name, value);
    }
  });

  test("Instagram stays unpublished until privacy is public, and TikTok is only an inbox handoff", async () => {
    const names = ["SOCIAL_TOKEN_ENC_KEY", "META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_OAUTH_REDIRECT_URI"];
    const saved = names.map((name) => [name, process.env[name]]);
    process.env.SOCIAL_TOKEN_ENC_KEY = KEY;
    process.env.META_APP_ID = "meta-app";
    process.env.META_APP_SECRET = "meta-secret";
    process.env.META_OAUTH_REDIRECT_URI = "https://www.1ststep.ai/api/social/oauth/callback";
    process.env.TIKTOK_CLIENT_KEY = "tiktok-key";
    process.env.TIKTOK_CLIENT_SECRET = "tiktok-secret";
    process.env.TIKTOK_OAUTH_REDIRECT_URI = "https://www.1ststep.ai/api/social/oauth/callback";
    try {
      await withStore(async () => {
        const svc = await import("../lib/social/service.js");
        const { youtubeDescription } = await import("../lib/social/publishers/youtube.js");
        assert.match(youtubeDescription({ format: "short", description: "Hello" }), /#Shorts/);
        assert.equal(youtubeDescription({ format: "short", description: "Already #Shorts" }).split("#Shorts").length - 1, 1);
        const reply = (payload, status = 200) => ({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: () => null },
          text: async () => JSON.stringify(payload),
          json: async () => payload,
        });
        const created = await svc.createApiToken("swingtradepros", "agent");
        const token = await svc.authenticateAgentToken(created.secret);
        const draft = await svc.createPostForToken(token, {
          platform: "instagram", title: "Bitcoin in six months", description: "Closest prediction wins six months in the STP Discord.", status: "ready_for_review",
        });
        const video = await svc.issueUploadForToken(token, { post_id: draft.id, kind: "video", content_type: "video/mp4", size: 8 }, { issueToken: async () => "vercel_blob_client_test" });
        await svc.updatePostForToken(token, draft.id, { confirm_upload: { kind: "video", pathname: video.pathname } }, {
          statBlob: async (pathname) => ({ pathname, size: 8, contentType: "video/mp4" }),
        });
        await saveConnectionEnvelope("swingtradepros", "instagram", encryptSocialJson({
          instagram_id: "28230105726692205",
          access_token: "page-token",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }, "social-connection"));
        const calls = [];
        const fetchImpl = async (url, init = {}) => {
          const href = String(url);
          calls.push(href + " " + (init.method || "GET"));
          if (href.endsWith("/media") && init.method === "POST") {
            return reply({ id: "container1", uri: "https://rupload.facebook.com/ig-api-upload/v22.0/container1" });
          }
          if (href.includes("rupload.facebook.com")) return reply({ success: true });
          if (href.includes("status_code")) return reply({ status_code: "FINISHED" });
          if (href.includes("media_publish")) return reply({ id: "media1" });
          if (href.includes("permalink")) return reply({ permalink: "https://www.instagram.com/reel/media1/" });
          return reply({});
        };
        await svc.approvePost(draft.id);
        await svc.schedulePost(draft.id, new Date().toISOString());
        const held = await svc.publishDueSlice({
          fetchImpl,
          readRange: async (_p, a, b) => Buffer.alloc(b - a + 1),
          budgetMs: 60_000,
          deleteAsset: async () => {},
        });
        assert.equal(held.status, "failed");
        assert.match(held.message, /public/);
        assert.equal(calls.some((call) => call.includes("media_publish")), false);
        await svc.setPostPrivacy(draft.id, "public");
        await svc.retryPost(draft.id);
        const live = await svc.publishDueSlice({
          fetchImpl,
          readRange: async (_p, a, b) => Buffer.alloc(b - a + 1),
          budgetMs: 60_000,
          deleteAsset: async () => {},
        });
        assert.equal(live.status, "published");
        assert.equal(live.published_url, "https://www.instagram.com/reel/media1/");

        const tiktok = await svc.createPostForToken(token, { platform: "tiktok", title: "Bitcoin in six months", status: "ready_for_review" });
        const tiktokFile = await svc.issueUploadForToken(token, { post_id: tiktok.id, kind: "video", content_type: "video/mp4", size: 8 }, { issueToken: async () => "vercel_blob_client_test" });
        await svc.updatePostForToken(token, tiktok.id, { confirm_upload: { kind: "video", pathname: tiktokFile.pathname } }, {
          statBlob: async (pathname) => ({ pathname, size: 8, contentType: "video/mp4" }),
        });
        await saveConnectionEnvelope("swingtradepros", "tiktok", encryptSocialJson({
          access_token: "tiktok-token",
          refresh_token: "tiktok-refresh",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }, "social-connection"));
        await svc.approvePost(tiktok.id);
        await svc.schedulePost(tiktok.id, new Date().toISOString());
        const handed = await svc.publishDueSlice({
          fetchImpl: async (url, init = {}) => {
            const href = String(url);
            if (href.includes("/inbox/video/init")) {
              return reply({ data: { publish_id: "inbox1", upload_url: "https://open-upload.tiktokapis.com/upload/1" }, error: { code: "ok" } });
            }
            if (init.method === "PUT") return reply({});
            return reply({});
          },
          readRange: async (_p, a, b) => Buffer.alloc(b - a + 1),
          budgetMs: 60_000,
          deleteAsset: async () => {},
        });
        assert.equal(handed.status, "handed_off");
        assert.equal(handed.published_url, null);
        assert.match(handed.message, /TikTok app/);
      });
    } finally {
      for (const [name, value] of saved) restore(name, value);
    }
  });

  test("an owner short stays on its brand and Facebook private is an unpublished reel", async () => {
    const names = ["SOCIAL_TOKEN_ENC_KEY", "META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI"];
    const saved = names.map((name) => [name, process.env[name]]);
    process.env.SOCIAL_TOKEN_ENC_KEY = KEY;
    process.env.META_APP_ID = "meta-app";
    process.env.META_APP_SECRET = "meta-secret";
    process.env.META_OAUTH_REDIRECT_URI = "https://www.1ststep.ai/api/social/oauth/callback";
    try {
      await withStore(async () => {
        const svc = await import("../lib/social/service.js");
        const queued = await svc.queueOwnerShort({
          brandId: "swingtradepros",
          platforms: ["youtube", "facebook"],
          copies: {
            youtube: { title: "Where is Bitcoin in six months?", description: "Closest prediction wins six months in the Swing Trade Pros Discord.", tags: ["bitcoin"] },
            facebook: { title: "Where is Bitcoin in six months?", description: "Closest prediction wins six months in the Swing Trade Pros Discord." },
          },
        });
        assert.equal(queued.posts.length, 2);
        assert.equal(queued.posts.every((post) => post.brand_id === "swingtradepros" && post.privacy_status === "private"), true);
        const other = await svc.loadDesk("1ststep");
        assert.equal(other.posts.length, 0);
        const youtube = queued.posts.find((post) => post.platform === "youtube");
        const upload = await svc.issueOwnerUpload(youtube.id, { kind: "video", content_type: "video/mp4", size: 12 }, { issueToken: async () => "vercel_blob_client_test" });
        const copied = [];
        await svc.confirmOwnerUpload(youtube.id, { kind: "video", pathname: upload.pathname }, {
          statBlob: async (pathname) => ({ pathname, size: 12, contentType: "video/mp4", url: "https://example.private.blob.vercel-storage.com/v" }),
          copyBlob: async ({ pathname }) => { copied.push(pathname); return { pathname, url: "https://example.private.blob.vercel-storage.com/c" }; },
        });
        assert.equal(copied.length, 1);
        const facebook = queued.posts.find((post) => post.platform === "facebook");
        await svc.recordOwnerScores(youtube.id, { title_score: 91, thumbnail_score: 93, keywords: ["bitcoin"] });
        await svc.approvePost(youtube.id);
        await svc.approvePost(facebook.id);
        await saveConnectionEnvelope("swingtradepros", "facebook", encryptSocialJson({
          page_id: "12345",
          access_token: "page-token",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }, "social-connection"));
        await svc.schedulePost(facebook.id, new Date().toISOString());
        let finishBody = "";
        const result = await svc.publishDueSlice({
          fetchImpl: async (url, init = {}) => {
            const href = String(url);
            if (href.includes("/video_reels") && String(init.body || "").includes("upload_phase=start")) {
              return { ok: true, status: 200, text: async () => JSON.stringify({ video_id: "reel1", upload_url: "https://rupload.facebook.com/video-upload/v22.0/reel1" }) };
            }
            if (href.includes("rupload.facebook.com")) return { ok: true, status: 200, text: async () => "{}" };
            finishBody = String(init.body || "");
            return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
          },
          readRange: async (_p, a, b) => Buffer.alloc(b - a + 1),
          budgetMs: 60_000,
          deleteAsset: async () => {},
        });
        assert.equal(result.status, "handed_off");
        assert.match(finishBody, /video_state=DRAFT/);
        assert.equal(result.published_url, null);
      });
    } finally {
      for (const [name, value] of saved) restore(name, value);
    }
  });
});
