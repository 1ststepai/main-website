import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectBestTimes, isDeprecatedInsight, NOT_ENOUGH, PERMISSION_NOTE } from "../src/audienceTimes.js";
import { createEngine } from "../src/engine.js";
import { META_SCOPES, YOUTUBE_SCOPES } from "../src/oauth/providers.js";

function jsonResponse(body) {
  return { json: async () => body };
}

test("instagram online followers are used only when that permission is already granted", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.match(url, /metric=online_followers/);
    assert.doesNotMatch(url, /page_fans_online/);
    return jsonResponse({
      data: [
        {
          name: "online_followers",
          values: [{ value: { 9: 2, 18: 40 }, end_time: "2026-10-20T07:00:00+0000" }],
        },
      ],
    });
  };
  const granted = await collectBestTimes({
    platform: "instagram",
    secrets: { access_token: "token", scope: "instagram_manage_insights" },
    connection: { instagram_id: "1789" },
    posts: [],
    timeZone: "America/New_York",
    fetchImpl,
    now: Date.parse("2026-10-28T18:00:00.000Z"),
  });
  assert.equal(calls, 1);
  assert.equal(granted.source, "instagram_online_followers");
  assert.equal(granted.suggestions[0].time, "18:00");
  assert.equal(granted.suggestions[0].weekday, "daily");
  assert.equal(granted.permission_note, "");

  calls = 0;
  const missing = await collectBestTimes({
    platform: "instagram",
    secrets: { access_token: "token", scope: "instagram_basic,pages_read_engagement" },
    connection: { instagram_id: "1789" },
    posts: [],
    fetchImpl,
  });
  assert.equal(calls, 0);
  assert.equal(missing.permission_note, PERMISSION_NOTE);
  assert.equal(missing.message, NOT_ENOUGH);
  assert.equal(missing.suggestions.length, 0);
});

test("a short post history is not dressed up as audience data", async () => {
  const posts = Array.from({ length: 3 }, (_, index) => ({
    platform: "instagram",
    status: "published",
    updated_at: `2026-10-0${index + 1}T22:00:00.000Z`,
  }));
  const low = await collectBestTimes({
    platform: "instagram",
    secrets: null,
    posts,
    timeZone: "America/New_York",
    fetchImpl: async () => {
      throw new Error("network");
    },
  });
  assert.equal(low.sample_size, 3);
  assert.equal(low.message, NOT_ENOUGH);
  assert.equal(low.suggestions.length, 0);

  const enough = await collectBestTimes({
    platform: "instagram",
    secrets: null,
    posts: Array.from({ length: 12 }, (_, index) => ({
      platform: "instagram",
      status: "published",
      updated_at: new Date(Date.parse("2026-07-02T22:00:00.000Z") + index * 7 * 24 * 60 * 60 * 1000).toISOString(),
    })),
    timeZone: "America/New_York",
    fetchImpl: async () => {
      throw new Error("network");
    },
  });
  assert.equal(enough.source, "past_posts");
  assert.equal(enough.sample_size, 12);
  assert.equal(enough.suggestions[0].label, "Thursday 18:00");
  assert.equal(enough.permission_note, PERMISSION_NOTE);
});

test("a deprecated facebook hourly metric is not requested", async () => {
  assert.equal(isDeprecatedInsight({ error: { code: 100, message: "(#100) invalid metric page_fans_online" } }), true);
  const urls = [];
  const missing = await collectBestTimes({
    platform: "facebook",
    secrets: { page_access_token: "page", scope: "pages_read_engagement" },
    connection: { page_id: "1" },
    posts: [],
    fetchImpl: async (url) => {
      urls.push(url);
      return jsonResponse({ data: [] });
    },
  });
  assert.equal(urls.length, 0);
  assert.equal(missing.permission_note, PERMISSION_NOTE);
  assert.equal(missing.message, NOT_ENOUGH);

  const deprecated = await collectBestTimes({
    platform: "facebook",
    secrets: { page_access_token: "page", scope: "read_insights pages_read_engagement" },
    connection: { page_id: "1" },
    posts: [],
    fetchImpl: async (url) => {
      urls.push(url);
      assert.doesNotMatch(url, /page_fans_online|post_impressions/);
      return jsonResponse({ error: { code: 100, message: "invalid metric" } });
    },
  });
  assert.equal(urls.length, 1);
  assert.match(deprecated.detail, /page_fans_online is deprecated/);
  assert.equal(deprecated.suggestions.length, 0);
  assert.equal(deprecated.message, NOT_ENOUGH);

  const views = await collectBestTimes({
    platform: "facebook",
    secrets: { page_access_token: "page", scope: "read_insights" },
    connection: { page_id: "99" },
    posts: [],
    timeZone: "America/New_York",
    fetchImpl: async (url) => {
      urls.push(url);
      assert.doesNotMatch(url, /page_fans_online|post_impressions/);
      if (url.includes("/posts?")) {
        return jsonResponse({
          data: Array.from({ length: 12 }, (_, index) => ({
            id: `p${index}`,
            created_time: new Date(Date.parse("2026-07-02T22:00:00.000Z") + index * 7 * 24 * 60 * 60 * 1000).toISOString(),
          })),
        });
      }
      return jsonResponse({ data: [{ name: "post_media_view", values: [{ value: 8 }] }] });
    },
  });
  assert.equal(views.source, "facebook_post_media_view");
  assert.equal(views.sample_size, 12);
  assert.equal(views.suggestions[0].label, "Thursday 18:00");
});

test("instagram falls back to media views when online_followers is rejected", async () => {
  const urls = [];
  const result = await collectBestTimes({
    platform: "instagram",
    secrets: { page_access_token: "token", scope: "instagram_manage_insights" },
    connection: { instagram_id: "1789" },
    posts: [],
    timeZone: "America/New_York",
    fetchImpl: async (url) => {
      urls.push(url);
      assert.doesNotMatch(url, /impressions|page_fans_online/);
      if (url.includes("metric=online_followers")) {
        return jsonResponse({ error: { code: 100, message: "invalid metric online_followers" } });
      }
      if (url.includes("/media?")) {
        return jsonResponse({
          data: Array.from({ length: 12 }, (_, index) => ({
            id: `m${index}`,
            timestamp: new Date(Date.parse("2026-07-02T22:00:00.000Z") + index * 7 * 24 * 60 * 60 * 1000).toISOString(),
          })),
        });
      }
      assert.match(url, /metric=views/);
      return jsonResponse({ data: [{ name: "views", values: [{ value: indexFrom(url) }] }] });
    },
    now: Date.parse("2026-10-28T18:00:00.000Z"),
  });
  assert.match(urls[0], /metric=online_followers/);
  assert.match(urls[0], /period=lifetime/);
  assert.equal(result.source, "instagram_media_views");
  assert.equal(result.sample_size, 12);
  assert.equal(result.suggestions[0].label, "Thursday 18:00");
  assert.equal(result.permission_note, "");
});

function indexFrom(url) {
  const match = /\/m(\d+)\//.exec(url);
  return match ? Number(match[1]) + 1 : 1;
}

test("youtube views by day do not invent an hour, and the analytics scope is not assumed", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.match(url, /dimensions=day/);
    assert.match(url, /metrics=views/);
    return jsonResponse({
      rows: [
        ["2026-10-06", 4],
        ["2026-10-07", 20],
      ],
    });
  };
  const analytics = await collectBestTimes({
    platform: "youtube",
    secrets: { access_token: "token", scope: "https://www.googleapis.com/auth/yt-analytics.readonly" },
    connection: { channel_id: "UC1" },
    posts: [],
    fetchImpl,
    now: Date.parse("2026-10-28T18:00:00.000Z"),
  });
  assert.equal(calls, 1);
  assert.equal(analytics.source, "youtube_views_by_day");
  assert.equal(analytics.suggestions[0].label, "Wednesday");
  assert.equal(analytics.suggestions[0].time, "");

  calls = 0;
  const missing = await collectBestTimes({
    platform: "youtube",
    secrets: { access_token: "token", scope: "https://www.googleapis.com/auth/youtube.readonly" },
    connection: { channel_id: "UC1" },
    posts: [],
    fetchImpl: async (url) => {
      calls += 1;
      assert.doesNotMatch(url, /youtubeanalytics/);
      return jsonResponse({ items: [] });
    },
  });
  assert.equal(calls, 1);
  assert.equal(missing.permission_note, PERMISSION_NOTE);
  assert.equal(missing.message, NOT_ENOUGH);

  calls = 0;
  const uploads = await collectBestTimes({
    platform: "youtube",
    secrets: { access_token: "token", scope: "https://www.googleapis.com/auth/youtube.readonly" },
    connection: { channel_id: "UC1" },
    posts: [],
    timeZone: "America/New_York",
    fetchImpl: async (url) => {
      calls += 1;
      assert.doesNotMatch(url, /youtubeanalytics|page_fans_online/);
      if (url.includes("/videos?")) {
        assert.match(url, /part=statistics/);
        return jsonResponse({
          items: Array.from({ length: 12 }, (_, index) => ({ id: `v${index}`, statistics: { viewCount: index === 0 ? "40" : "1" } })),
        });
      }
      return jsonResponse({
        items: Array.from({ length: 12 }, (_, index) => ({
          id: { videoId: `v${index}` },
          snippet: {
            publishedAt: new Date(Date.parse("2026-07-02T22:00:00.000Z") + index * 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        })),
      });
    },
  });
  assert.equal(calls, 2);
  assert.equal(uploads.source, "youtube_uploads");
  assert.equal(uploads.sample_size, 12);
  assert.equal(uploads.suggestions[0].label, "Thursday 18:00");
  assert.equal(uploads.permission_note, PERMISSION_NOTE);
});

test("audience scopes are not added to the connect request", () => {
  assert.equal(YOUTUBE_SCOPES.includes("https://www.googleapis.com/auth/yt-analytics.readonly"), false);
  assert.equal(META_SCOPES.includes("instagram_manage_insights"), false);
  assert.equal(META_SCOPES.includes("read_insights"), false);
});

test("get_best_times does not publish", async () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-times-"));
  let calls = 0;
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
  });
  try {
    await engine.upsertProfile({ id: "acme", name: "1stStep.ai" });
    const times = await engine.getBestTimes({ profile_id: "acme", platform: "instagram" });
    assert.equal(times.message, NOT_ENOUGH);
    assert.equal(calls, 0);
    assert.equal(engine.store.listPosts({ profileId: "acme" }).length, 0);
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
