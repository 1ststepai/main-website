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

        let progress = { continued: true };
        for (let step = 0; step < 5 && progress.continued; step += 1) {
          progress = await publishDueSlice({
            fetchImpl,
            readRange: async (_pathname, start, end) => Buffer.alloc(end - start + 1, 1),
            budgetMs: 60_000,
          });
        }
        assert.equal(progress.status, "published");
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
          return response({ payload: { items: [{ id: "UC999", snippet: { customUrl: "@SwingTradePros" } }] } });
        };
        const brandId = await completeYouTubeOAuth({ code: "auth-code", state, fetchImpl });
        assert.equal(brandId, "swingtradepros");
        await assert.rejects(() => completeYouTubeOAuth({ code: "auth-code", state, fetchImpl }), (error) => error.code === "invalid_state");
        const stored = JSON.stringify(kv.snapshot());
        assert.equal(stored.includes("refresh-secret-value"), false);
        assert.equal(stored.includes("ya29.OAUTHACCESS"), false);
        assert.equal(stored.includes("auth-code"), false);
        await assert.rejects(() => publishers.instagram.publishSlice(), (error) => error.code === "publisher_not_implemented");
        assert.equal(publishers.facebook.implemented, false);
        assert.equal(publishers.tiktok.implemented, false);
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
});
