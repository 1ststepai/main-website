import { mcpError } from "../errors.js";
import { vidiqRecord } from "../multiPost.js";

const SOURCES = new Set([
  "vidiq",
  "youtube_autocomplete",
  "google_autocomplete",
  "youtube_analytics",
  "search_console",
  "manual",
]);

function finiteOrNull(value) {
  if (value === 0) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function cleanCompetition(value) {
  if (value === 0 || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 40);
  return null;
}

export function cleanResearchKeyword(raw, { source, checkedAt }) {
  if (typeof raw === "string") {
    const term = raw.trim().slice(0, 80);
    if (!term) throw mcpError("invalid_keyword", "A keyword needs a term.");
    return { term, volume: null, competition: null, overall: null, source, checked_at: checkedAt };
  }
  if (!raw || typeof raw !== "object") throw mcpError("invalid_keyword", "A keyword needs a term.");
  if (raw.volume !== undefined && raw.volume !== null && raw.volume !== "" && finiteOrNull(raw.volume) === null) {
    throw mcpError("invalid_keyword", "Search volume must be a number when it is sent. Leave it out when you do not have one.");
  }
  if (raw.overall !== undefined && raw.overall !== null && raw.overall !== "" && finiteOrNull(raw.overall) === null) {
    throw mcpError("invalid_keyword", "Overall score must be a number when it is sent.");
  }
  const keywordSource = SOURCES.has(raw.source) ? raw.source : source;
  const term = String(raw.term || "").trim().slice(0, 80);
  const overall = finiteOrNull(raw.overall);
  if (!term && !(keywordSource === "vidiq" && overall !== null)) {
    throw mcpError("invalid_keyword", "A keyword needs a term.");
  }
  return {
    term,
    volume: finiteOrNull(raw.volume),
    competition: cleanCompetition(raw.competition),
    overall,
    source: keywordSource,
    checked_at: String(raw.checked_at || checkedAt).slice(0, 40),
  };
}

export function researchRecord(input, stamp) {
  const source = SOURCES.has(input.source) ? input.source : "manual";
  const checkedAt = String(input.checked_at || stamp).slice(0, 40);
  const keywords = (Array.isArray(input.keywords) ? input.keywords : []).slice(0, 40).map((row) =>
    cleanResearchKeyword(row, { source, checkedAt }),
  );
  if (!keywords.length && (input.checked_at || input.notes || input.score === 0 || Number.isFinite(Number(input.score)))) {
    keywords.push({
      term: "",
      volume: null,
      competition: null,
      overall: finiteOrNull(input.score),
      source: input.source === "vidiq" ? "vidiq" : source,
      checked_at: checkedAt,
    });
  }
  if (!keywords.length) {
    throw mcpError("invalid_keyword", "Attach at least one keyword, or a vidIQ score and notes.");
  }
  const recordSource = keywords.some((row) => row.source === "vidiq") && source === "manual" ? "vidiq" : source;
  return {
    source: keywords.length && keywords.every((row) => row.source === "vidiq") ? "vidiq" : recordSource,
    checked_at: checkedAt,
    notes: String(input.notes || "").slice(0, 2000),
    keywords,
  };
}

function legacyVidiq(input, record) {
  const fromVidiq = input.source === "vidiq" || record.keywords.some((row) => row.source === "vidiq");
  if (!fromVidiq) return null;
  const overall = record.keywords.find((row) => row.source === "vidiq" && row.overall !== null)?.overall;
  return vidiqRecord(
    {
      score: overall !== undefined ? overall : input.score,
      notes: record.notes,
      checked_at: record.checked_at,
    },
    record.checked_at,
  );
}

function writeTarget(store, target, record, vidiq) {
  target.keyword_research = record;
  if (vidiq) target.vidiq = vidiq;
  target.updated_at = record.checked_at;
  return target;
}

export function attachKeywordResearch(ctx, input = {}) {
  const stamp = new Date(ctx.now()).toISOString();
  const record = researchRecord({ ...input, source: input.source || "manual" }, stamp);
  const vidiq = legacyVidiq(input, record);
  const bundle = input.bundle_id
    ? ctx.store.getBundle(input.bundle_id)
    : input.post_id
      ? ctx.store.getBundle(ctx.store.getPost(input.post_id)?.bundle_id)
      : null;
  if (bundle) {
    writeTarget(ctx.store, bundle, record, vidiq);
    ctx.store.saveBundle(bundle);
    const youtubeId = bundle.child_ids?.youtube;
    const youtube = youtubeId ? ctx.store.getPost(youtubeId) : null;
    if (youtube && ["draft", "scheduled", "failed"].includes(youtube.status)) {
      writeTarget(ctx.store, youtube, record, vidiq);
      ctx.store.savePost(youtube);
    }
    return { bundle, keyword_research: record, vidiq: vidiq || bundle.vidiq || null };
  }
  const post = ctx.store.getPost(input.post_id);
  if (!post) throw mcpError("not_found", "Post not found.", 404);
  writeTarget(ctx.store, post, record, vidiq);
  ctx.store.savePost(post);
  return { post, keyword_research: record, vidiq: vidiq || null };
}
