import { mcpError } from "../errors.js";
import { normalizeProfileId } from "../store.js";
import { SEED_BRANDS, SEED_PRESETS, seedById } from "./seeds.js";
import { isWeakTerm, normalizeTerm, uniqueStrings } from "./terms.js";

function nowIso(ctx) {
  return new Date(ctx.now()).toISOString();
}

export function keywordRecord({ id, name, audience, primary, secondary, negative, site, source }, stamp) {
  return {
    profile_id: id,
    name: String(name || id).slice(0, 120),
    audience: String(audience || "").slice(0, 400),
    primary: uniqueStrings(primary, 40),
    secondary: uniqueStrings(secondary, 40),
    negative: uniqueStrings(negative, 40),
    site: site ? String(site).slice(0, 200) : "",
    source: source || "saved",
    updated_at: stamp,
  };
}

export function fromSeed(seed, stamp) {
  return keywordRecord({ ...seed, source: "seed" }, stamp);
}

export function effectiveKeywords(store, stamp = new Date().toISOString()) {
  const saved = store.readSeo().keywords || {};
  const map = new Map();
  for (const seed of SEED_BRANDS) {
    map.set(seed.id, saved[seed.id] ? { ...saved[seed.id], source: saved[seed.id].source || "saved" } : fromSeed(seed, stamp));
  }
  for (const [id, row] of Object.entries(saved)) {
    if (!map.has(id)) map.set(id, row);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function keywordsFor(store, profileId, stamp) {
  const id = normalizeProfileId(profileId);
  const saved = store.readSeo().keywords?.[id];
  if (saved) return saved;
  const seed = seedById(id);
  if (seed) return fromSeed(seed, stamp || new Date().toISOString());
  return null;
}

export function listKeywordProfiles(ctx) {
  return {
    profiles: effectiveKeywords(ctx.store, nowIso(ctx)),
    note: "Search volumes are not included. A volume appears only after you attach one.",
  };
}

export function keywordListNotes(record) {
  const notes = [];
  const primary = record.primary || [];
  const seen = new Set();
  for (const term of primary) {
    const key = normalizeTerm(term);
    if (seen.has(key)) notes.push(`Duplicate primary keyword: ${term}.`);
    seen.add(key);
    if (isWeakTerm(term)) notes.push(`Weak primary keyword: ${term}.`);
  }
  for (const term of record.secondary || []) {
    if (seen.has(normalizeTerm(term))) notes.push(`Secondary keyword repeats a primary keyword: ${term}.`);
    if (isWeakTerm(term)) notes.push(`Weak secondary keyword: ${term}.`);
  }
  const blocked = new Set((record.negative || []).map(normalizeTerm));
  for (const term of [...primary, ...(record.secondary || [])]) {
    if (blocked.has(normalizeTerm(term))) notes.push(`Keyword is also on the avoid list: ${term}.`);
  }
  return notes;
}

export function saveKeywordProfile(ctx, input = {}) {
  const id = normalizeProfileId(input.profile_id || input.id);
  if (id.length < 2) throw mcpError("invalid_profile", "Profile id must be at least 2 characters.");
  const seed = seedById(id);
  const existing = keywordsFor(ctx.store, id, nowIso(ctx));
  const name = String(input.name || existing?.name || seed?.name || id).slice(0, 120);
  const stamp = nowIso(ctx);
  const record = keywordRecord(
    {
      id,
      name,
      audience: input.audience !== undefined ? input.audience : existing?.audience || seed?.audience || "",
      primary: input.primary !== undefined ? input.primary : existing?.primary || [],
      secondary: input.secondary !== undefined ? input.secondary : existing?.secondary || [],
      negative: input.negative !== undefined ? input.negative : existing?.negative || [],
      site: input.site !== undefined ? input.site : existing?.site || seed?.site || "",
      source: "saved",
    },
    stamp,
  );
  if (!ctx.store.getProfile(id)) {
    ctx.store.upsertProfile({ id, name, presets: seed ? SEED_PRESETS : undefined });
  } else if (input.name) {
    ctx.store.upsertProfile({ id, name });
  }
  ctx.store.updateSeo((seo) => {
    seo.keywords = seo.keywords || {};
    seo.keywords[id] = record;
    if (record.site) {
      seo.sites = seo.sites || {};
      const current = Array.isArray(seo.sites[id]) ? seo.sites[id] : [];
      if (!current.includes(record.site)) seo.sites[id] = [record.site, ...current].slice(0, 5);
    }
    return record;
  });
  return { profile: record, notes: keywordListNotes(record) };
}

export function brandsForDraft(ctx, input = {}) {
  const stamp = nowIso(ctx);
  const all = effectiveKeywords(ctx.store, stamp);
  const requested = Array.isArray(input.profile_ids)
    ? input.profile_ids
    : input.profile_id
      ? [input.profile_id]
      : [];
  if (!requested.length) return all;
  const ids = requested.map((id) => normalizeProfileId(id)).filter(Boolean);
  const picked = [];
  for (const id of ids) {
    const row = all.find((item) => item.profile_id === id) || keywordsFor(ctx.store, id, stamp);
    if (!row) throw mcpError("unknown_profile", `No keyword list for ${id}. Save one first.`);
    picked.push(row);
  }
  return picked;
}
