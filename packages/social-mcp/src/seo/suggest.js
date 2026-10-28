import { mcpError } from "../errors.js";
import { normalizeTerm } from "./terms.js";
import { brandsForDraft, keywordsFor } from "./keywords.js";

const TTL_MS = 24 * 60 * 60 * 1000;
const YOUTUBE_URL = "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=";
const GOOGLE_URL = "https://suggestqueries.google.com/complete/search?client=firefox&q=";

function cacheKey(source, query) {
  return `${source}:${normalizeTerm(query)}`;
}

export function parseSuggestPayload(payload) {
  const list = Array.isArray(payload) ? payload[1] : payload?.suggestions;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const term = typeof item === "string" ? item : item?.suggestion || item?.term;
    const clean = String(term || "").trim();
    if (clean) out.push(clean.slice(0, 80));
  }
  return out;
}

async function fetchSource(ctx, source, query) {
  const key = cacheKey(source, query);
  const cached = ctx.store.readSeo().cache?.[key];
  const at = cached?.at ? Date.parse(cached.at) : 0;
  if (cached && Number.isFinite(at) && ctx.now() - at < TTL_MS) {
    return { ok: true, cached: true, suggestions: cached.suggestions || [], source };
  }
  const url = `${source === "youtube" ? YOUTUBE_URL : GOOGLE_URL}${encodeURIComponent(query)}`;
  try {
    const response = await ctx.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!response?.ok) {
      return {
        ok: false,
        cached: false,
        suggestions: [],
        source,
        error: `${source === "youtube" ? "YouTube" : "Google"} suggestions are unavailable.`,
      };
    }
    const payload = typeof response.json === "function" ? await response.json() : JSON.parse(await response.text());
    const suggestions = parseSuggestPayload(payload);
    const stored = { at: new Date(ctx.now()).toISOString(), suggestions, source };
    ctx.store.updateSeo((seo) => {
      seo.cache = seo.cache || {};
      seo.cache[key] = stored;
      return stored;
    });
    return { ok: true, cached: false, suggestions, source };
  } catch {
    return {
      ok: false,
      cached: false,
      suggestions: [],
      source,
      error: `${source === "youtube" ? "YouTube" : "Google"} suggestions are unavailable.`,
    };
  }
}

function savedQueries(store, profileId) {
  const all = store.readSeo().queries || {};
  if (profileId) return Array.isArray(all[profileId]) ? all[profileId] : [];
  return Object.values(all).flatMap((rows) => (Array.isArray(rows) ? rows : []));
}

function researchTerms(store, profileId) {
  const rows = [];
  const consider = (ownerId, research) => {
    if (profileId && ownerId !== profileId) return;
    for (const keyword of research?.keywords || []) {
      if (!keyword?.term) continue;
      rows.push(keyword);
    }
  };
  for (const bundle of store.listBundles()) consider(bundle.profile_id, bundle.keyword_research);
  for (const post of store.listPosts()) {
    if (post.bundle_id) continue;
    consider(post.profile_id, post.keyword_research);
  }
  return rows;
}

export async function suggestKeywords(ctx, input = {}) {
  const topic = String(input.topic || input.query || "").trim().slice(0, 120);
  if (topic.length < 2) throw mcpError("invalid_topic", "Enter a topic of at least 2 characters.");
  const [youtube, google] = await Promise.all([
    fetchSource(ctx, "youtube", topic),
    fetchSource(ctx, "google", topic),
  ]);
  const profileId = input.profile_id ? String(input.profile_id) : "";
  const suggestions = [];
  const seen = new Set();
  function push(term, source, extra = {}) {
    const key = `${source}:${normalizeTerm(term)}`;
    if (!term || seen.has(key)) return;
    seen.add(key);
    const row = { term: String(term).slice(0, 80), source, volume: null, competition: null, overall: null };
    if (extra.volume === 0 || Number.isFinite(extra.volume)) row.volume = extra.volume;
    if (extra.competition === 0 || Number.isFinite(extra.competition) || typeof extra.competition === "string") {
      row.competition = extra.competition;
    }
    if (extra.overall === 0 || Number.isFinite(extra.overall)) row.overall = extra.overall;
    if (extra.checked_at) row.checked_at = extra.checked_at;
    if (extra.views === 0 || Number.isFinite(extra.views)) row.views = extra.views;
    if (extra.clicks === 0 || Number.isFinite(extra.clicks)) row.clicks = extra.clicks;
    suggestions.push(row);
  }
  for (const row of youtube.suggestions) push(row, "youtube_autocomplete");
  for (const row of google.suggestions) push(row, "google_autocomplete");
  for (const row of savedQueries(ctx.store, profileId)) {
    push(row.term, row.source || "search_data", row);
  }
  for (const row of researchTerms(ctx.store, profileId)) {
    push(row.term, row.source || "attached", row);
  }
  const brand = profileId ? keywordsFor(ctx.store, profileId, new Date(ctx.now()).toISOString()) : null;
  if (brand) {
    for (const term of [...brand.primary, ...brand.secondary]) push(term, "saved_keywords");
  } else if (!profileId) {
    for (const row of brandsForDraft(ctx, {})) {
      for (const term of row.primary || []) push(term, `saved_keywords:${row.profile_id}`);
    }
  }
  const failures = [youtube, google].filter((row) => !row.ok).map((row) => row.error);
  return {
    topic,
    suggestions,
    failures,
    partial: failures.length > 0,
    cached: { youtube: youtube.cached, google: google.cached },
    note: "Autocomplete and saved keywords do not include a search volume unless a volume was attached with its source and date.",
  };
}
