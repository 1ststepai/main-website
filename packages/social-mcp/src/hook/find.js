import { keywordsFor } from "../seo/keywords.js";

const SEARCH = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const CHANNELS = "https://www.googleapis.com/youtube/v3/channels";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// TODO: vidIQ outlier scores are not wired. PostPath does not store a vidIQ login.

function redact(text, secrets) {
  let out = String(text || "");
  for (const secret of secrets) {
    if (secret && String(secret).length > 4) out = out.split(String(secret)).join("••••");
  }
  return out;
}

function durationSeconds(value) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(value || ""));
  if (!match) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

async function readJson(response) {
  try {
    if (typeof response.json === "function") return await response.json();
    const text = typeof response.text === "function" ? await response.text() : "";
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function accessToken(ctx, profileId) {
  const secrets = ctx.store.readSecrets(profileId, "youtube");
  if (!secrets?.access_token && !secrets?.refresh_token) return "";
  const expires = Date.parse(secrets.expires_at || "");
  if (secrets.access_token && Number.isFinite(expires) && expires > ctx.now() + 60_000) return secrets.access_token;
  if (!secrets.refresh_token) return secrets.access_token || "";
  const clientId = String(ctx.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(ctx.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId) return "";
  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: secrets.refresh_token,
  });
  if (clientSecret) params.set("client_secret", clientSecret);
  const response = await ctx.fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    throw new Error(redact("YouTube did not refresh access for search.", [secrets.refresh_token, secrets.access_token, clientSecret]));
  }
  const next = {
    ...secrets,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || secrets.refresh_token,
    expires_at: new Date(ctx.now() + (Number(payload.expires_in) || 3600) * 1000).toISOString(),
  };
  ctx.store.updateSecrets(profileId, "youtube", next);
  return next.access_token;
}

function outlier(views, subscribers, median) {
  if (subscribers > 0) {
    const score = views / subscribers;
    return {
      score,
      basis: "subscribers",
      math: `${views} views / ${subscribers} subscribers = ${score.toFixed(2)}`,
    };
  }
  if (median > 0) {
    const score = views / median;
    return {
      score,
      basis: "median_views",
      math: `${views} views / ${median} median views in this set = ${score.toFixed(2)}`,
    };
  }
  return { score: 0, basis: "none", math: `${views} views, and this set has no subscriber count or median to divide by.` };
}

export async function findHookExamples(ctx, input = {}) {
  const topic = String(input.topic || "").trim().slice(0, 120);
  const profileId = String(input.profile_id || "").trim();
  const brand = profileId ? keywordsFor(ctx.store, profileId, new Date(ctx.now()).toISOString()) : null;
  const terms = [...(brand?.primary || []).slice(0, 3), topic].filter(Boolean);
  const query = [...new Set(terms)].join(" ").trim();
  if (query.length < 2) {
    return { available: false, examples: [], message: "Enter a topic or save a primary keyword first." };
  }
  const apiKey = String(ctx.env.YOUTUBE_API_KEY || ctx.env.GOOGLE_API_KEY || "").trim();
  let token = "";
  if (!apiKey && profileId) token = await accessToken(ctx, profileId);
  if (!apiKey && !token) {
    return {
      available: false,
      examples: [],
      vidiq: "not_used",
      message: "YouTube search needs the connected YouTube account or a YouTube API key on this computer. Nothing was requested.",
    };
  }
  const days = Math.max(1, Math.min(365, Number(input.days) || 90));
  const publishedAfter = new Date(ctx.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const format = input.format === "shorts" || input.format === "long" ? input.format : "any";
  const url = new URL(SEARCH);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", query);
  url.searchParams.set("publishedAfter", publishedAfter);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("order", "viewCount");
  if (format === "shorts") url.searchParams.set("videoDuration", "short");
  if (apiKey) url.searchParams.set("key", apiKey);
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  let searchPayload;
  try {
    const response = await ctx.fetchImpl(url, { headers });
    searchPayload = await readJson(response);
    if (!response.ok) {
      return { available: false, examples: [], message: redact(`YouTube search failed (${response.status}).`, [apiKey, token]) };
    }
  } catch (error) {
    return { available: false, examples: [], message: redact(error?.message || "YouTube search is unavailable.", [apiKey, token]) };
  }
  const ids = (searchPayload.items || []).map((item) => item?.id?.videoId).filter(Boolean).slice(0, 10);
  if (!ids.length) return { available: true, examples: [], query, published_after: publishedAfter, vidiq: "not_used" };
  const videoUrl = new URL(VIDEOS);
  videoUrl.searchParams.set("part", "snippet,statistics,contentDetails");
  videoUrl.searchParams.set("id", ids.join(","));
  if (apiKey) videoUrl.searchParams.set("key", apiKey);
  const videoResponse = await ctx.fetchImpl(videoUrl, { headers });
  const videoPayload = await readJson(videoResponse);
  if (!videoResponse.ok) {
    return { available: false, examples: [], message: redact(`YouTube video details failed (${videoResponse.status}).`, [apiKey, token]) };
  }
  const channelIds = [...new Set((videoPayload.items || []).map((item) => item?.snippet?.channelId).filter(Boolean))];
  const channelUrl = new URL(CHANNELS);
  channelUrl.searchParams.set("part", "statistics");
  channelUrl.searchParams.set("id", channelIds.join(","));
  if (apiKey) channelUrl.searchParams.set("key", apiKey);
  const channelResponse = channelIds.length ? await ctx.fetchImpl(channelUrl, { headers }) : { ok: true, json: async () => ({ items: [] }) };
  const channelPayload = await readJson(channelResponse);
  const subscribers = new Map((channelPayload.items || []).map((item) => [item.id, Number(item.statistics?.subscriberCount || 0)]));
  const rows = [];
  for (const item of videoPayload.items || []) {
    const seconds = durationSeconds(item.contentDetails?.duration);
    const isShort = seconds !== null && seconds <= 60;
    if (format === "shorts" && !isShort) continue;
    if (format === "long" && isShort) continue;
    const views = Number(item.statistics?.viewCount || 0);
    rows.push({
      video_id: item.id,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      title: String(item.snippet?.title || "").slice(0, 140),
      description: String(item.snippet?.description || "").slice(0, 500),
      channel_title: String(item.snippet?.channelTitle || "").slice(0, 120),
      published_at: item.snippet?.publishedAt || "",
      format: isShort ? "shorts" : "long",
      duration_seconds: seconds,
      views,
      subscribers: subscribers.get(item.snippet?.channelId) || 0,
      channel_id: item.snippet?.channelId || "",
    });
  }
  const byChannel = new Map();
  for (const row of rows) {
    const list = byChannel.get(row.channel_id) || [];
    list.push(row.views);
    byChannel.set(row.channel_id, list);
  }
  const examples = rows.map((row) => {
    const views = byChannel.get(row.channel_id) || [];
    const sorted = [...views].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
    const score = outlier(row.views, row.subscribers, median);
    return {
      video_id: row.video_id,
      url: row.url,
      title: row.title,
      description: row.description,
      channel_title: row.channel_title,
      published_at: row.published_at,
      format: row.format,
      duration_seconds: row.duration_seconds,
      metrics: {
        views: row.views,
        subscribers: row.subscribers,
        outlier: Number(score.score.toFixed(4)),
        basis: score.basis,
        math: score.math,
      },
    };
  });
  examples.sort((a, b) => b.metrics.outlier - a.metrics.outlier);
  return {
    available: true,
    query,
    published_after: publishedAfter,
    format,
    vidiq: "not_used",
    examples,
    note: "Descriptions are public metadata for the copy check. They are not saved. vidIQ was not used.",
  };
}
