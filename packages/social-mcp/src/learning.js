// Learning layer v1: a small per-brand style guide every connected assistant reads.
// Assistants do not remember across sessions or apps, so the desk keeps it.
// - Derived bullets are computed from the approval history (real counts, never invented).
// - Assistants can only PROPOSE notes; they land as pending until the owner accepts them on the desk.
// - The owner can delete any bullet or reset the brand's learning.
import { listDecisions } from "./approvalHistory.js";
import { randomBytes } from "node:crypto";
import { mcpError } from "./errors.js";

export const MIN_FOR_STATS = 3; // derived bullets need at least this many decided drafts
export const PENDING_CAP = 20;
export const NOTES_CAP = 40;
export const FEEDBACK_CAP = 50;
export const NOTE_MAX = 200;

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const EMOJI = /\p{Extended_Pictographic}/gu;
const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const NETWORK = /^[a-z][a-z_]{0,31}$/;

export function cleanText(value, max = NOTE_MAX) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanProfile(value) {
  const id = String(value ?? "").trim().toLowerCase();
  if (!PROFILE.test(id)) throw mcpError("invalid_profile", "Invalid brand id.", 400);
  return id;
}

function cleanNetwork(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = String(value);
  if (!NETWORK.test(n)) throw mcpError("invalid_platform", "Invalid network.", 400);
  return n;
}

function brandSection(data, profileId) {
  data.brands = data.brands && typeof data.brands === "object" ? data.brands : {};
  const b = (data.brands[profileId] = data.brands[profileId] || {});
  b.notes = Array.isArray(b.notes) ? b.notes : [];
  b.pending = Array.isArray(b.pending) ? b.pending : [];
  b.hidden = Array.isArray(b.hidden) ? b.hidden : [];
  b.feedback = Array.isArray(b.feedback) ? b.feedback : [];
  b.reset_at = b.reset_at || null;
  return b;
}

function readBrand(store, profileId) {
  const data = structuredClone(store.readSection("brandLearning") || {});
  return brandSection(data, profileId);
}

function newId(prefix) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

/** Main text of a record: caption, else description, else title. */
function mainText(text) {
  if (!text) return "";
  return String(text.caption || text.description || text.title || "");
}

const count = (text, re) => (String(text).match(re) || []).length;
const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;

/** Pure stats over decided records. Every number comes from the records passed in. */
export function deriveStats(records) {
  const approved = records.filter((r) => r.decision !== "rejected" && r.final_text);
  const edited = records.filter((r) => r.decision === "approved_edited" && r.final_text);
  const rejected = records.filter((r) => r.decision === "rejected");
  const lengths = approved.map((r) => mainText(r.final_text).length);
  const tags = approved.map((r) => count(mainText(r.final_text), HASHTAG));
  const emojis = approved.map((r) => count(mainText(r.final_text), EMOJI));
  const deltas = edited.map((r) => mainText(r.final_text).length - mainText(r.original_text).length);
  const tagDeltas = edited.map((r) => count(mainText(r.final_text), HASHTAG) - count(mainText(r.original_text), HASHTAG));
  const emojiDeltas = edited.map((r) => count(mainText(r.final_text), EMOJI) - count(mainText(r.original_text), EMOJI));
  const reasons = new Map();
  for (const r of rejected) {
    const reason = cleanText(r.reason, 200);
    if (!reason) continue;
    const k = reason.toLowerCase();
    const row = reasons.get(k) || { reason, count: 0 };
    row.count += 1;
    reasons.set(k, row);
  }
  return {
    decided: records.length,
    approved: approved.length,
    approved_unedited: records.filter((r) => r.decision === "approved_unedited").length,
    approved_edited: edited.length,
    rejected: rejected.length,
    length: approved.length ? { median: median(lengths), min: Math.min(...lengths), max: Math.max(...lengths) } : null,
    hashtags_avg: approved.length ? round1(avg(tags)) : null,
    posts_with_hashtags: tags.filter((n) => n > 0).length,
    emoji_avg: approved.length ? round1(avg(emojis)) : null,
    posts_with_emoji: emojis.filter((n) => n > 0).length,
    edits: edited.length
      ? {
          shorter: deltas.filter((d) => d < 0).length,
          longer: deltas.filter((d) => d > 0).length,
          median_change: median(deltas),
          hashtags_removed: tagDeltas.filter((d) => d < 0).length,
          hashtags_added: tagDeltas.filter((d) => d > 0).length,
          emoji_removed: emojiDeltas.filter((d) => d < 0).length,
          emoji_added: emojiDeltas.filter((d) => d > 0).length,
        }
      : null,
    rejection_reasons: [...reasons.values()].sort((a, b) => b.count - a.count),
  };
}

/** Plain-English bullets from stats. Returns [] below MIN_FOR_STATS decisions. */
export function derivedBullets(stats, scope = "brand") {
  if (!stats || stats.decided < MIN_FOR_STATS) return [];
  const out = [];
  const p = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const id = (k) => `derived:${scope}:${k}`;
  if (stats.length && stats.approved >= MIN_FOR_STATS) {
    out.push({ id: id("length"), text: `Approved posts run about ${stats.length.median} characters (shortest ${stats.length.min}, longest ${stats.length.max}, from ${p(stats.approved, "approved post")}).` });
    out.push({
      id: id("hashtags"),
      text: stats.posts_with_hashtags === 0
        ? `None of the ${p(stats.approved, "approved post")} used hashtags.`
        : `About ${stats.hashtags_avg} hashtags per approved post (${stats.posts_with_hashtags} of ${stats.approved} used any).`,
    });
    out.push({
      id: id("emoji"),
      text: stats.posts_with_emoji === 0
        ? `None of the ${p(stats.approved, "approved post")} used emoji.`
        : `${stats.posts_with_emoji} of ${stats.approved} approved posts used emoji (about ${stats.emoji_avg} each).`,
    });
  }
  const e = stats.edits;
  if (e) {
    if (e.shorter > e.longer) out.push({ id: id("edits-shorter"), text: `When the owner edited a draft, they made it shorter ${e.shorter} of ${stats.approved_edited} times (median change ${e.median_change} characters).` });
    else if (e.longer > e.shorter) out.push({ id: id("edits-longer"), text: `When the owner edited a draft, they made it longer ${e.longer} of ${stats.approved_edited} times (median change +${e.median_change} characters).` });
    if (e.hashtags_removed > e.hashtags_added) out.push({ id: id("edits-hashtags"), text: `The owner removed hashtags in ${e.hashtags_removed} of ${stats.approved_edited} edited drafts.` });
    if (e.emoji_removed > e.emoji_added) out.push({ id: id("edits-emoji"), text: `The owner removed emoji in ${e.emoji_removed} of ${stats.approved_edited} edited drafts.` });
  }
  stats.rejection_reasons.filter((r) => r.count >= 2).slice(0, 3).forEach((r, i) => {
    out.push({ id: id(`reject-${i}-${r.reason.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`), text: `Rejected ${r.count} times because: "${r.reason}"` });
  });
  return out;
}

function recordsSince(store, profileId, resetAt, platform) {
  const rows = listDecisions(store, { profile_id: profileId, platform });
  return resetAt ? rows.filter((r) => String(r.decided_at) > resetAt) : rows;
}

/** The brand's guide as the desk and assistants see it. Read-only. */
export function brandGuide(store, profileId) {
  const id = cleanProfile(profileId);
  const b = readBrand(store, id);
  const records = recordsSince(store, id, b.reset_at);
  const stats = deriveStats(records);
  const hidden = new Set(b.hidden);
  const bullets = [
    ...derivedBullets(stats).map((row) => ({ ...row, source: "history", network: null })),
    ...b.notes.filter((n) => !n.network).map((n) => ({ id: n.id, text: n.text, source: n.source, network: null })),
  ].filter((row) => !hidden.has(row.id));
  const networks = {};
  for (const platform of [...new Set(records.map((r) => r.platform))].sort()) {
    const rows = derivedBullets(deriveStats(records.filter((r) => r.platform === platform)), platform).map((row) => ({ ...row, source: "history", network: platform }));
    if (rows.length) networks[platform] = rows;
  }
  for (const n of b.notes.filter((row) => row.network)) (networks[n.network] = networks[n.network] || []).push({ id: n.id, text: n.text, source: n.source, network: n.network });
  for (const k of Object.keys(networks)) {
    networks[k] = networks[k].filter((row) => !hidden.has(row.id));
    if (!networks[k].length) delete networks[k];
  }
  const rejections = records
    .filter((r) => r.decision === "rejected" && cleanText(r.reason))
    .slice(-5)
    .reverse()
    .map((r) => ({ platform: r.platform, reason: cleanText(r.reason), at: r.decided_at }));
  return {
    profile_id: id,
    stats,
    bullets,
    network_notes: networks,
    pending: b.pending.map((s) => ({ id: s.id, text: s.text, network: s.network, why: s.why || "", proposed_by: s.proposed_by || "assistant", at: s.at })),
    recent_rejections: rejections,
    recent_feedback: b.feedback.slice(-5).reverse().map((f) => ({ platform: f.platform || null, text: f.text, at: f.at })),
    reset_at: b.reset_at,
  };
}

/** Assistants call this. It never touches the accepted guide. */
export function proposeStyleNote(store, { profile_id, text, network, why, proposed_by = "assistant" } = {}, { now = Date.now() } = {}) {
  const id = cleanProfile(profile_id);
  const note = cleanText(text);
  if (note.length < 3) throw mcpError("invalid_request", "Write the style note in a short sentence.", 400);
  const net = cleanNetwork(network);
  return store.updateSection("brandLearning", (data) => {
    const b = brandSection(data, id);
    const dup = [...b.pending, ...b.notes].find((row) => row.text.toLowerCase() === note.toLowerCase() && (row.network || null) === net);
    if (dup) return { status: b.notes.includes(dup) ? "already_in_guide" : "already_pending", id: dup.id };
    if (b.pending.length >= PENDING_CAP) throw mcpError("too_many_pending", "Too many suggestions are waiting. Ask the owner to review them on the desk first.", 409);
    const row = { id: newId("sug"), text: note, network: net, why: cleanText(why), proposed_by: cleanText(proposed_by, 80) || "assistant", at: new Date(now).toISOString() };
    b.pending.push(row);
    return { status: "pending", id: row.id };
  });
}

/** Owner-only (desk). */
export function decideSuggestion(store, profileId, suggestionId, accept, { now = Date.now() } = {}) {
  const id = cleanProfile(profileId);
  return store.updateSection("brandLearning", (data) => {
    const b = brandSection(data, id);
    const i = b.pending.findIndex((row) => row.id === suggestionId);
    if (i < 0) throw mcpError("not_found", "Suggestion not found.", 404);
    if (accept && b.notes.length >= NOTES_CAP) throw mcpError("guide_full", "The guide is full. Delete a bullet first.", 409);
    const [row] = b.pending.splice(i, 1);
    if (accept) {
      b.notes.push({ id: newId("note"), text: row.text, network: row.network, source: "assistant", accepted_at: new Date(now).toISOString() });
    }
    return { accepted: Boolean(accept) };
  });
}

/** Owner-only (desk). Derived bullets are hidden; notes are removed. */
export function deleteBullet(store, profileId, bulletId) {
  const id = cleanProfile(profileId);
  const bullet = String(bulletId || "");
  if (!/^(derived:[a-z_]+:[a-z0-9-]{1,60}|note_[a-z0-9]{4,40})$/.test(bullet)) throw mcpError("invalid_request", "Unknown bullet.", 400);
  return store.updateSection("brandLearning", (data) => {
    const b = brandSection(data, id);
    if (bullet.startsWith("note_")) {
      const before = b.notes.length;
      b.notes = b.notes.filter((n) => n.id !== bullet);
      if (b.notes.length === before) throw mcpError("not_found", "Bullet not found.", 404);
    } else if (!b.hidden.includes(bullet)) b.hidden.push(bullet);
    return { deleted: bullet };
  });
}

/** Owner-only (desk, PIN when set). History before now is ignored for derived bullets; notes and pending are cleared. */
export function resetLearning(store, profileId, { now = Date.now() } = {}) {
  const id = cleanProfile(profileId);
  return store.updateSection("brandLearning", (data) => {
    data.brands = data.brands && typeof data.brands === "object" ? data.brands : {};
    data.brands[id] = { notes: [], pending: [], hidden: [], feedback: [], reset_at: new Date(now).toISOString() };
    return { reset: true, reset_at: data.brands[id].reset_at };
  });
}

/** What the owner asked the assistant to change on a draft, passed along with update_draft. */
export function recordOwnerFeedback(store, post, text, { now = Date.now() } = {}) {
  const note = cleanText(text, 300);
  if (!note || !post?.profile_id) return null;
  return store.updateSection("brandLearning", (data) => {
    const b = brandSection(data, post.profile_id);
    b.feedback.push({ post_id: post.id, platform: post.platform || null, text: note, at: new Date(now).toISOString() });
    b.feedback = b.feedback.slice(-FEEDBACK_CAP);
    return { saved: true };
  });
}

export const ASSISTANT_GUIDANCE = [
  "Follow style_guide and network_notes when drafting. They are the owner's accepted preferences plus counts from real approvals.",
  "You lead; the owner steps in only when they want to. After a draft is rejected or edited, ask the user in one short question what they liked or disliked, then offer a style note with propose_style_note. It waits for the owner to accept it on the desk.",
  "When the user tells you what to change, revise the draft with update_draft and pass their words in owner_feedback.",
  "If asked, explain in plain words what PostPath has learned for this brand, using only what is listed here. Do not invent numbers.",
];

/** Text-only learned block for get_brand_context. */
export function learnedForContext(store, profileId) {
  const g = brandGuide(store, profileId);
  return {
    style_guide: g.bullets.map((b) => b.text),
    network_notes: Object.fromEntries(Object.entries(g.network_notes).map(([k, rows]) => [k, rows.map((r) => r.text)])),
    recent_rejection_reasons: g.recent_rejections,
    recent_owner_feedback: g.recent_feedback,
    based_on: { decided_drafts: g.stats.decided, approved_unedited: g.stats.approved_unedited, approved_edited: g.stats.approved_edited, rejected: g.stats.rejected },
    pending_suggestions: g.pending.length,
    how_to_use: ASSISTANT_GUIDANCE,
  };
}
