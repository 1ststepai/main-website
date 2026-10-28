import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { YOUTUBE_SCOPES, authorizationUrl, exchangeCode } from "../src/oauth/providers.js";
import { SEARCH_DATA_SCOPES } from "../src/seo/searchData.js";
import { helpCopy, stepComparison } from "../src/seo/steps.js";

const NOW = () => Date.parse("2026-06-01T12:00:00.000Z");
const SECRET = "super-secret-token";

function googleConfig() {
  return {
    google: {
      clientId: "123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
      clientSecret: "local-test-secret",
      redirectUri: "http://127.0.0.1:47831",
    },
  };
}

async function rig(fetchImpl = async () => {
  throw new Error("network");
}) {
  const home = mkdtempSync(join(tmpdir(), "social-seo-"));
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
    fetchImpl,
    now: NOW,
  });
  return {
    home,
    engine,
    async stop() {
      await engine.oauth.stop();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

test("step counts in the owner doc match the desk actions", () => {
  const comparison = stepComparison();
  const help = helpCopy();
  const doc = readFileSync(new URL("../../../docs/seo-step.md", import.meta.url), "utf8");
  assert.equal(comparison.oneBrandWithVidiq.manual, 26);
  assert.equal(comparison.oneBrandWithVidiq.seo, 7);
  assert.equal(comparison.oneBrandWithoutVidiq.manual, 25);
  assert.equal(comparison.oneBrandWithoutVidiq.seo, 5);
  assert.equal(comparison.fourBrandsWithVidiq.manual, 95);
  assert.equal(comparison.fourBrandsWithVidiq.seo, 10);
  assert.equal(comparison.copyOnlyExtraManualSteps, 15);
  assert.match(doc, /26 actions/);
  assert.match(doc, /7 actions/);
  assert.match(doc, /25 actions/);
  assert.match(doc, /5 actions/);
  assert.match(doc, /95 actions/);
  assert.match(doc, /10 actions/);
  assert.match(doc, /\*\*15\*\* more actions/);
  assert.match(help.disclaimer, /not a promise about minutes/);
  assert.doesNotMatch(help.summary, /MCP|OAuth/);
  for (const step of comparison.manualOneBrand) assert.match(doc, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const step of comparison.seoOneBrand) assert.match(doc, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const tools = readFileSync(new URL("../src/seo/tools.js", import.meta.url), "utf8");
  assert.doesNotMatch(tools, /prefer this tool/i);
  assert.doesNotMatch(tools, /you should use this/i);
});

test("seed keyword lists are editable and do not invent volume", async () => {
  const rigged = await rig();
  try {
    const listed = rigged.engine.seo.listKeywordProfiles();
    const ids = listed.profiles.map((row) => row.profile_id).sort();
    assert.deepEqual(ids, ["1ststep-ai", "daysetgo", "skillsprout", "swing-trade-pros"]);
    assert.equal(listed.profiles.every((row) => row.volume === undefined), true);
    const saved = rigged.engine.seo.saveKeywordProfile({
      profile_id: "skillsprout",
      primary: ["k-6 worksheets", "k-6 worksheets", "printable worksheets"],
      secondary: ["teacher worksheets"],
      negative: ["homework answers"],
    });
    assert.deepEqual(saved.profile.primary, ["k-6 worksheets", "printable worksheets"]);
    assert.equal(rigged.engine.store.getProfile("skillsprout").name, "SkillSprout");
    const weak = rigged.engine.seo.saveKeywordProfile({ profile_id: "daysetgo", primary: ["a", "family day planner"] });
    assert.match(weak.notes.join(" "), /Weak primary keyword/);
  } finally {
    await rigged.stop();
  }
});

test("autocomplete is cached and a failed source does not wipe the other", async () => {
  let calls = 0;
  const rigged = await rig(async (url) => {
    calls += 1;
    const href = String(url);
    if (href.includes("ds=yt")) throw new Error("youtube down");
    return { ok: true, json: async () => ["topic", ["google one", "google two"]] };
  });
  try {
    const first = await rigged.engine.seo.suggestKeywords({ topic: "family day plan", profile_id: "daysetgo" });
    assert.equal(first.partial, true);
    assert.equal(first.failures.length, 1);
    assert.ok(first.suggestions.some((row) => row.term === "google one" && row.volume === null && row.source === "google_autocomplete"));
    assert.equal(first.suggestions.some((row) => row.term === "family day planner" && row.source === "saved_keywords"), true);
    const afterFirst = calls;
    const second = await rigged.engine.seo.suggestKeywords({ topic: "family day plan", profile_id: "daysetgo" });
    assert.equal(second.cached.google, true);
    assert.equal(calls, afterFirst + 1);
    assert.equal(JSON.stringify(second).includes(SECRET), false);
  } finally {
    await rigged.stop();
  }
});

test("keyword research keeps volume only when it is sent, and only vidIQ opens the YouTube gate", async () => {
  const rigged = await rig();
  try {
    await rigged.engine.upsertProfile({ id: "1ststep-ai", name: "1stStep.ai" });
    const created = await rigged.engine.createDraft({
      profile_id: "1ststep-ai",
      platforms: ["youtube"],
      title: "Systems for founders",
      caption: "Systems for founders start with the bottleneck.",
      media_path: undefined,
    });
    const manual = rigged.engine.seo.attachKeywordResearch({
      bundle_id: created.bundle.id,
      source: "manual",
      keywords: [{ term: "systems for founders", source: "manual" }],
    });
    assert.equal(manual.keyword_research.keywords[0].volume, null);
    assert.equal(manual.vidiq, null);
    assert.equal(rigged.engine.listQueue().queue[0].vidiq_needed, true);
    await assert.rejects(() => rigged.engine.approveBundle({ bundle_id: created.bundle.id }), /vidIQ/);
    const attached = rigged.engine.seo.attachKeywordResearch({
      bundle_id: created.bundle.id,
      source: "vidiq",
      checked_at: "2026-06-01T12:00:00.000Z",
      keywords: [
        {
          term: "systems for founders",
          volume: 1200,
          competition: "low",
          overall: 71,
          source: "vidiq",
          checked_at: "2026-06-01T12:00:00.000Z",
        },
      ],
    });
    assert.equal(attached.keyword_research.keywords[0].volume, 1200);
    assert.equal(attached.keyword_research.keywords[0].source, "vidiq");
    assert.equal(attached.vidiq.score, 71);
    assert.equal(attached.vidiq.checked_at, "2026-06-01T12:00:00.000Z");
    assert.equal(rigged.engine.listQueue().queue[0].vidiq_needed, false);
    assert.throws(
      () =>
        rigged.engine.seo.attachKeywordResearch({
          bundle_id: created.bundle.id,
          source: "vidiq",
          keywords: [{ term: "systems for founders", volume: "high", source: "vidiq" }],
        }),
      /volume must be a number/i,
    );
  } finally {
    await rigged.stop();
  }
});

test("seo draft stays inside channel limits and a caption provider can fill the brief", async () => {
  let providerCalls = 0;
  const home = mkdtempSync(join(tmpdir(), "social-seo-provider-"));
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0", POSTPATH_CAPTION_PROVIDER: "brief" },
    fetchImpl: async () => {
      throw new Error("network");
    },
    now: NOW,
    captionProvider: async (brief) => {
      providerCalls += 1;
      assert.match(brief.instruction, /Do not invent search volumes/);
      return {
        brands: brief.brands.map((brand) => ({
          profile_id: brand.profile_id,
          channels: brand.channels.map((channel) => ({
            platform: channel.platform,
            title: brand.keywords.primary[0],
            description: brand.keywords.primary[0],
            caption: brand.keywords.primary[0],
            hashtags: ["#notakeyword"],
            on_screen_text: brand.keywords.primary[0],
            volume: 99999,
          })),
        })),
      };
    },
  });
  try {
    const briefOnly = createEngine({
      home: mkdtempSync(join(tmpdir(), "social-seo-brief-")),
      env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0", POSTPATH_CAPTION_PROVIDER: "brief" },
      fetchImpl: async () => {
        throw new Error("network");
      },
      now: NOW,
    });
    const empty = await briefOnly.seo.draft({ topic: "lead follow-up", profile_id: "1ststep-ai" });
    assert.equal(empty.mode, "brief");
    assert.equal(empty.drafts.length, 0);
    assert.match(empty.brief.instruction, /Do not invent search volumes/);
    await briefOnly.oauth.stop();

    const drafted = await engine.seo.draft({ topic: "lead follow-up", profile_id: "1ststep-ai" });
    assert.equal(providerCalls, 1);
    assert.equal(drafted.mode, "provider");
    assert.equal(drafted.drafts[0].channels.length, 7);
    for (const channel of drafted.drafts[0].channels) {
      assert.equal(channel.volume, null);
      assert.ok(channel.title.length <= 100);
      assert.ok(channel.caption.length <= (channel.platform === "x" || channel.platform === "bluesky" ? 300 : 5000));
    }
    const x = drafted.drafts[0].channels.find((row) => row.platform === "x");
    assert.equal(x.copy_only, true);
    assert.ok(x.caption.length <= 280);
    const templateEngine = createEngine({
      home: mkdtempSync(join(tmpdir(), "social-seo-template-")),
      env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
      fetchImpl: async () => {
        throw new Error("network");
      },
      now: NOW,
    });
    const template = await templateEngine.seo.draft({ topic: "family day planner", profile_ids: ["daysetgo", "skillsprout"] });
    assert.equal(template.mode, "template");
    assert.equal(template.drafts.length, 2);
    assert.equal(JSON.stringify(template).includes("99999"), false);
    for (const brand of template.drafts) {
      for (const channel of brand.channels) {
        assert.equal(channel.volume, null);
        assert.ok(channel.seo.auto_approve === false);
        assert.ok(channel.seo.advisory === true);
      }
    }
    await templateEngine.oauth.stop();
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("queue notes flag overlap and do not auto-approve", async () => {
  const rigged = await rig();
  try {
    rigged.engine.seo.saveKeywordProfile({
      profile_id: "skillsprout",
      primary: ["family day planner"],
      secondary: ["teacher worksheets"],
      negative: ["homework answers"],
    });
    rigged.engine.seo.saveKeywordProfile({
      profile_id: "daysetgo",
      primary: ["family day planner"],
      secondary: ["kids routine"],
      negative: [],
    });
    const drafted = await rigged.engine.seo.draft({ topic: "family day planner", profile_ids: ["skillsprout", "daysetgo"] });
    const queued = await rigged.engine.seo.queueDrafts({ topic: drafted.topic, brands: drafted.drafts, source: "desk" });
    assert.equal(queued.auto_approve, false);
    assert.equal(queued.created.filter((row) => row.queued).length, 2);
    const queue = rigged.engine.listQueue().queue;
    assert.equal(queue.length, 2);
    const notes = queue.flatMap((item) => item.seo.notes).join(" ");
    assert.match(notes, /Same primary keyword/);
    assert.equal(queue.every((item) => item.seo.auto_approve === false && item.seo.advisory === true), true);
    const long = rigged.engine.seo.score({
      profile_id: "daysetgo",
      platform: "bluesky",
      title: "Hello",
      description: "x".repeat(400),
      caption: "Hello #aa #aa #homeworkanswers",
      hashtags: ["#aa", "#aa", "#homeworkanswers"],
    });
    assert.match(long.notes.join(" "), /Primary keyword is not in the title/);
    assert.match(long.notes.join(" "), /limit 300/);
    assert.match(long.notes.join(" "), /Repeated hashtag/);
    assert.equal(long.blocking, false);
    assert.equal(long.auto_approve, false);
  } finally {
    await rigged.stop();
  }
});

test("search data is a separate consent and sync uses mocked analytics plus search console", async () => {
  const youtubeUrl = authorizationUrl("youtube", { state: "st", config: googleConfig(), pkce: { challenge: "abc" } });
  const searchUrl = authorizationUrl("google_search", { state: "st", config: googleConfig(), pkce: { challenge: "abc" } });
  assert.equal(YOUTUBE_SCOPES.some((scope) => scope.includes("yt-analytics") || scope.includes("webmasters")), false);
  assert.equal(youtubeUrl.includes("yt-analytics"), false);
  assert.equal(searchUrl.includes("yt-analytics.readonly"), true);
  assert.equal(searchUrl.includes("webmasters.readonly"), true);
  assert.deepEqual(SEARCH_DATA_SCOPES, [
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
  ]);
  let sawChannels = false;
  const exchanged = await exchangeCode("google_search", {
    code: "code",
    config: googleConfig(),
    codeVerifier: "verifier-value-with-enough-entropy-1234567890",
    fetchImpl: async (url) => {
      if (String(url).includes("youtube/v3/channels")) sawChannels = true;
      return { ok: true, text: async () => JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: SEARCH_DATA_SCOPES.join(" ") }) };
    },
  });
  assert.equal(sawChannels, false);
  assert.equal(exchanged.platforms.search_data.record.platform, "search_data");

  const urls = [];
  const rigged = await rig(async (url, options = {}) => {
    urls.push(String(url));
    const href = String(url);
    if (href.includes("youtubeanalytics")) {
      assert.equal(options.headers.authorization, `Bearer ${SECRET}`);
      assert.match(href, /insightTrafficSourceDetail/);
      assert.match(href, /YT_SEARCH/);
      return { ok: true, json: async () => ({ columnHeaders: [{ name: "insightTrafficSourceDetail" }, { name: "views" }], rows: [["family planner", 12]] }) };
    }
    if (href.includes("searchAnalytics")) {
      return { ok: true, json: async () => ({ rows: [{ keys: ["family day planner"], clicks: 3, impressions: 40 }] }) };
    }
    return { ok: false, status: 500, json: async () => ({ error: SECRET }) };
  });
  try {
    const missing = await rigged.engine.seo.syncSearchTerms({ profile_id: "daysetgo" });
    assert.equal(missing.connected, false);
    assert.equal(urls.length, 0);
    rigged.engine.seo.saveKeywordProfile({ profile_id: "daysetgo", site: "https://daysetgo.ai/" });
    rigged.engine.store.saveConnection(
      { profile_id: "daysetgo", platform: "search_data", account_label: "Search data", status: "connected" },
      { access_token: SECRET, refresh_token: "refresh-secret-value", expires_at: "2099-01-01T00:00:00.000Z" },
    );
    const synced = await rigged.engine.seo.syncSearchTerms({ profile_id: "daysetgo" });
    assert.equal(synced.connected, true);
    assert.equal(synced.queries.some((row) => row.term === "family planner" && row.views === 12 && row.source === "youtube_analytics"), true);
    assert.equal(synced.queries.some((row) => row.term === "family day planner" && row.clicks === 3 && row.source === "search_console"), true);
    assert.equal(JSON.stringify(synced).includes(SECRET), false);
    const suggested = await rigged.engine.seo.suggestKeywords({ topic: "family day", profile_id: "daysetgo" });
    assert.equal(suggested.suggestions.some((row) => row.source === "youtube_analytics" && row.term === "family planner"), true);
  } finally {
    await rigged.stop();
  }

  const failing = await rig(async () => ({ ok: false, status: 401, text: async () => SECRET }));
  try {
    failing.engine.seo.saveKeywordProfile({ profile_id: "1ststep-ai" });
    failing.engine.store.saveConnection(
      { profile_id: "1ststep-ai", platform: "search_data", account_label: "Search data", status: "connected" },
      { access_token: SECRET, refresh_token: "refresh-secret-value", expires_at: "2000-01-01T00:00:00.000Z" },
    );
    await assert.rejects(() => failing.engine.seo.syncSearchTerms({ profile_id: "1ststep-ai" }), (error) => {
      assert.equal(String(error.message).includes(SECRET), false);
      assert.equal(String(error.message).includes("refresh-secret-value"), false);
      return true;
    });
  } finally {
    await failing.stop();
  }
});

test("keyword planner and trends stay off and do not call the network", async () => {
  let calls = 0;
  const rigged = await rig(async () => {
    calls += 1;
    return { ok: true, json: async () => ({}) };
  });
  try {
    const planner = rigged.engine.seo.keywordPlanner();
    const trends = rigged.engine.seo.trends();
    assert.equal(planner.enabled, false);
    assert.equal(planner.called_network, false);
    assert.match(planner.returns, /ranges/);
    assert.equal(trends.enabled, false);
    assert.equal(trends.called_network, false);
    assert.equal(calls, 0);
  } finally {
    await rigged.stop();
  }
  const flagged = createEngine({
    home: mkdtempSync(join(tmpdir(), "social-seo-flag-")),
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0", POSTPATH_SEO_ADS: "1", POSTPATH_SEO_TRENDS: "1" },
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({}) };
    },
    now: NOW,
  });
  try {
    assert.equal(flagged.seo.keywordPlanner().enabled, true);
    assert.equal(flagged.seo.keywordPlanner().available, false);
    assert.equal(flagged.seo.trends().called_network, false);
    assert.equal(calls, 0);
  } finally {
    await flagged.oauth.stop();
  }
});

test("weekly report summarizes posts, keywords, search terms, and overlaps", async () => {
  const rigged = await rig();
  try {
    rigged.engine.seo.saveKeywordProfile({ profile_id: "skillsprout", primary: ["printable worksheets"] });
    rigged.engine.seo.saveKeywordProfile({ profile_id: "daysetgo", primary: ["printable worksheets"] });
    const post = {
      id: "post_report1",
      profile_id: "skillsprout",
      platform: "bluesky",
      status: "published",
      title: "Printable worksheets for Saturday",
      caption: "Printable worksheets for the weekend.",
      tags: ["#printableworksheets"],
      updated_at: "2026-06-01T11:00:00.000Z",
      created_at: "2026-06-01T11:00:00.000Z",
    };
    rigged.engine.store.savePost(post);
    rigged.engine.store.updateSeo((seo) => {
      seo.queries = {
        skillsprout: [{ term: "k-6 worksheets", source: "search_console", clicks: 2, impressions: 9, views: null, checked_at: "2026-06-01T10:00:00.000Z" }],
      };
      return seo.queries;
    });
    const report = rigged.engine.seo.weeklyReport({ days: 7 });
    const skill = report.brands.find((row) => row.profile_id === "skillsprout");
    assert.equal(skill.posted.length, 1);
    assert.equal(skill.keywords_used.some((row) => row.term === "printable worksheets"), true);
    assert.equal(skill.search_terms[0].term, "k-6 worksheets");
    assert.match(skill.overlaps.join(" "), /Same primary keyword as DaySetGo/);
    assert.equal(skill.suggestions.includes("k-6 worksheets"), true);
    assert.equal(JSON.stringify(report).includes(SECRET), false);
  } finally {
    await rigged.stop();
  }
});
