import { overlapNotes, WINDOW_MS } from "./score.js";
import { effectiveKeywords } from "./keywords.js";
import { normalizeTerm } from "./terms.js";
import { savedSearchTerms } from "./searchData.js";

function inWindow(iso, now, windowMs) {
  const when = Date.parse(iso || "");
  return Number.isFinite(when) && when >= now - windowMs && when <= now;
}

function postedRows(store, profileId, now, windowMs) {
  const rows = [];
  for (const post of store.listPosts()) {
    if (post.profile_id !== profileId) continue;
    if (!["published", "handed_off"].includes(post.status)) continue;
    if (!inWindow(post.updated_at, now, windowMs)) continue;
    rows.push({
      id: post.id,
      title: post.title || "",
      platform: post.platform,
      at: post.updated_at,
      tags: Array.isArray(post.tags) ? post.tags : [],
      caption: post.caption || post.description || "",
    });
  }
  return rows;
}

function keywordsUsed(posts, brand) {
  const counts = new Map();
  const known = [...(brand.primary || []), ...(brand.secondary || [])];
  for (const post of posts) {
    const blob = `${post.title}\n${post.caption}\n${(post.tags || []).join(" ")}`;
    const hay = normalizeTerm(blob);
    for (const term of known) {
      const key = normalizeTerm(term);
      if (key && hay.includes(key)) counts.set(term, (counts.get(term) || 0) + 1);
    }
    for (const tag of post.tags || []) {
      const label = String(tag);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([term, count]) => ({ term, count }));
}

export function weeklyReport(ctx, input = {}) {
  const days = Math.max(1, Math.min(30, Number(input.days) || 7));
  const windowMs = days * 24 * 60 * 60 * 1000;
  const now = ctx.now();
  const brands = effectiveKeywords(ctx.store, new Date(now).toISOString());
  const peers = brands.map((brand) => ({
    profile_id: brand.profile_id,
    name: brand.name,
    primary: brand.primary,
    titles: postedRows(ctx.store, brand.profile_id, now, windowMs).map((row) => row.title),
  }));
  const selected = input.profile_id ? brands.filter((brand) => brand.profile_id === input.profile_id) : brands;
  return {
    window: {
      days,
      start: new Date(now - windowMs).toISOString(),
      end: new Date(now).toISOString(),
    },
    brands: selected.map((brand) => {
      const posted = postedRows(ctx.store, brand.profile_id, now, windowMs);
      const queries = savedSearchTerms(ctx.store, brand.profile_id);
      const recentQueries = Array.isArray(queries) ? queries.filter((row) => !row.checked_at || inWindow(row.checked_at, now, WINDOW_MS * 4)) : [];
      return {
        profile_id: brand.profile_id,
        name: brand.name,
        posted,
        keywords_used: keywordsUsed(posted, brand),
        search_terms: recentQueries,
        overlaps: overlapNotes({ brand, title: posted[0]?.title || "", peers }),
        suggestions: recentQueries.map((row) => row.term).filter(Boolean).slice(0, 10),
      };
    }),
    note: "Checklist scores and this report are not search rankings. Search volumes are only the numbers that were attached or returned by a connected account.",
  };
}
