// Approval history: one record per assistant draft the owner decided on the desk.
// This is the single store other features read from (earned auto-post today, a
// learning layer later). Read it only through the functions exported here.

/** Readiness thresholds for suggesting auto-post on one brand + network. */
export const READINESS_WINDOW = 12; // look at the last N decided drafts
export const READINESS_MIN_UNEDITED = 10; // at least this many approved with no edits in that window
export const READINESS_REJECT_WINDOW = 5; // and zero rejections in the last N decided drafts
export const SNOOZE_DECISIONS = 10; // "Not now" hides the prompt until this many more decisions
export const HISTORY_CAP = 500; // records kept per brand + network

export const DECISIONS = Object.freeze(["approved_unedited", "approved_edited", "rejected"]);

const TEXT_FIELDS = ["title", "caption", "description"];

function clip(value, max) {
  return String(value ?? "").slice(0, max);
}

/** The text an assistant drafted, captured once when the draft is created. */
export function draftText(post) {
  return { title: clip(post?.title, 100), caption: clip(post?.caption, 2200), description: clip(post?.description, 5000) };
}

export function textChanged(original, final) {
  if (!original) return false;
  return TEXT_FIELDS.some((key) => String(original[key] ?? "") !== String(final?.[key] ?? ""));
}

function section(store) {
  const data = store.readSection("approvalHistory");
  return { records: data.records && typeof data.records === "object" ? data.records : {}, snoozes: data.snoozes && typeof data.snoozes === "object" ? data.snoozes : {} };
}

function key(profileId, platform) {
  return `${profileId}::${platform}`;
}

/**
 * Record the owner's decision on one assistant draft. Drafts without an assistant
 * origin (made on the desk) and auto-posted drafts are not recorded.
 * decision: "approved" (edited or not is computed) or "rejected".
 */
export function recordDecision(store, post, { decision, reason = "", now = Date.now() } = {}) {
  if (!post?.draft_original || !post?.drafted_by) return null;
  if (!["approved", "rejected"].includes(decision)) throw new Error("decision must be approved or rejected");
  const final = draftText(post);
  const outcome = decision === "rejected" ? "rejected" : textChanged(post.draft_original, final) ? "approved_edited" : "approved_unedited";
  const record = {
    post_id: post.id,
    bundle_id: post.bundle_id || null,
    profile_id: post.profile_id,
    platform: post.platform,
    decision: outcome,
    original_text: { ...post.draft_original },
    final_text: outcome === "rejected" ? null : final,
    reason: outcome === "rejected" ? clip(reason, 500).replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "",
    drafted_by: { ...post.drafted_by },
    drafted_at: post.created_at || null,
    decided_at: new Date(now).toISOString(),
  };
  return store.updateSection("approvalHistory", (data) => {
    data.records = data.records && typeof data.records === "object" ? data.records : {};
    const k = key(post.profile_id, post.platform);
    const list = (data.records[k] || []).filter((row) => row.post_id !== post.id);
    list.push(record);
    data.records[k] = list.slice(-HISTORY_CAP);
    return record;
  });
}

/** Read API: decided drafts, oldest first. Filter by brand and/or network; limit keeps the newest. */
export function listDecisions(store, { profile_id, platform, limit } = {}) {
  const { records } = section(store);
  let rows = [];
  for (const [k, list] of Object.entries(records)) {
    const [p, n] = k.split("::");
    if (profile_id && p !== profile_id) continue;
    if (platform && n !== platform) continue;
    rows.push(...list);
  }
  rows.sort((a, b) => String(a.decided_at).localeCompare(String(b.decided_at)));
  if (limit) rows = rows.slice(-Math.max(1, Number(limit)));
  return structuredClone(rows);
}

/** Pure readiness math over decided records (oldest first). */
export function computeReadiness(records, { snoozedAt = null } = {}) {
  const total = records.length;
  const window = records.slice(-READINESS_WINDOW);
  const recent = records.slice(-READINESS_REJECT_WINDOW);
  const unedited = window.filter((row) => row.decision === "approved_unedited").length;
  const edited = window.filter((row) => row.decision === "approved_edited").length;
  const rejected = window.filter((row) => row.decision === "rejected").length;
  const recentRejections = recent.filter((row) => row.decision === "rejected").length;
  const meets = unedited >= READINESS_MIN_UNEDITED && recentRejections === 0;
  const snoozed = snoozedAt !== null && total < snoozedAt + SNOOZE_DECISIONS;
  return {
    decided_total: total,
    window_size: window.length,
    approved_unedited: unedited,
    approved_edited: edited,
    rejected,
    recent_rejections: recentRejections,
    meets_threshold: meets,
    snoozed,
    snoozed_until_decisions: snoozed ? snoozedAt + SNOOZE_DECISIONS : null,
    suggest: meets && !snoozed,
  };
}

export function readinessFor(store, profileId, platform) {
  const { snoozes } = section(store);
  const snoozedAt = snoozes[key(profileId, platform)]?.decided_total ?? null;
  return computeReadiness(listDecisions(store, { profile_id: profileId, platform }), { snoozedAt });
}

/** "Not now": hide the suggestion until SNOOZE_DECISIONS more drafts are decided. */
export function snoozeReadiness(store, profileId, platform, { now = Date.now() } = {}) {
  const total = listDecisions(store, { profile_id: profileId, platform }).length;
  return store.updateSection("approvalHistory", (data) => {
    data.snoozes = data.snoozes && typeof data.snoozes === "object" ? data.snoozes : {};
    data.snoozes[key(profileId, platform)] = { decided_total: total, at: new Date(now).toISOString() };
    return data.snoozes[key(profileId, platform)];
  });
}

export const READINESS_THRESHOLDS = Object.freeze({
  window: READINESS_WINDOW,
  min_unedited: READINESS_MIN_UNEDITED,
  reject_window: READINESS_REJECT_WINDOW,
  snooze_decisions: SNOOZE_DECISIONS,
});
