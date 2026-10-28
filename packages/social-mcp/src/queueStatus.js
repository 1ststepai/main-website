import { checkNetwork } from "./desk/public/optimize.js";
import { openSlotSummary } from "./desk/public/schedulePlan.js";

export const QUEUE_URI = "postpath://queue";

function ageSeconds(iso, now) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((now - ms) / 1000));
}

export function ageLabel(seconds) {
  if (seconds == null) return "";
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function queueNote(waiting, fixes, openSlots = []) {
  let note = `Queue: ${waiting} waiting for approval, ${fixes} need fixes`;
  for (const row of openSlots) {
    const noun = row.count === 1 ? "open slot" : "open slots";
    note += `. ${row.count} ${noun} this week for ${row.name}`;
  }
  return note;
}

function rulesFor(post) {
  return checkNetwork({ platform: post?.platform, post })
    .filter((item) => item.kind === "rule")
    .map((item) => item.message);
}

function itemFor({ id, profileId, names, title, status, createdAt, rules, now }) {
  const age = ageSeconds(createdAt, now);
  let category = "awaiting_approval";
  let suggested = "ask owner to approve";
  if (status === "scheduled") {
    category = "scheduled";
    suggested = "reschedule";
  } else if (status === "failed") {
    category = "failed";
    suggested = "retry after reconnect";
  } else if (status === "needs_review") {
    category = "needs_review";
    suggested = "ask owner to approve";
  } else if (rules.length) {
    category = "failing_checks";
    suggested = `fix: ${rules[0]}`;
  }
  return {
    id,
    profile_id: profileId,
    profile_name: names.get(profileId) || profileId,
    title: title || "Draft",
    status,
    category,
    failing_rules: rules,
    suggested_action: suggested,
    age_seconds: age,
    created_at: createdAt || "",
  };
}

export function buildQueueStatus({ bundles = [], posts = [], profiles = [], profileId = "", now = Date.now() } = {}) {
  const names = new Map(profiles.map((profile) => [profile.id, profile.name || profile.id]));
  const wanted = String(profileId || "");
  const byId = new Map(posts.map((post) => [post.id, post]));
  const childIds = new Set();
  for (const bundle of bundles) {
    for (const id of Object.values(bundle.child_ids || {})) childIds.add(id);
  }
  const items = [];
  for (const bundle of bundles) {
    if (!["draft", "scheduled"].includes(bundle.status)) continue;
    if (wanted && bundle.profile_id !== wanted) continue;
    const children = (bundle.platforms || []).map((platform) => byId.get(bundle.child_ids?.[platform])).filter(Boolean);
    const rules = children.flatMap((post) => rulesFor(post).map((message) => `${post.platform}: ${message}`));
    items.push(
      itemFor({
        id: bundle.id,
        profileId: bundle.profile_id,
        names,
        title: bundle.title || bundle.caption,
        status: bundle.status,
        createdAt: bundle.created_at,
        rules: bundle.status === "draft" ? rules : [],
        now,
      }),
    );
  }
  for (const post of posts) {
    const bundled = post.bundle_id || childIds.has(post.id);
    const keep = post.status === "failed" || post.status === "needs_review" || (!bundled && ["draft", "scheduled"].includes(post.status));
    if (!keep) continue;
    if (wanted && post.profile_id !== wanted) continue;
    const rules = post.status === "draft" ? rulesFor(post) : [];
    items.push(
      itemFor({
        id: post.id,
        profileId: post.profile_id,
        names,
        title: post.title || post.caption,
        status: post.status,
        createdAt: post.created_at,
        rules,
        now,
      }),
    );
  }
  const waiting = items.filter((item) => item.category === "awaiting_approval");
  const fixes = items.filter((item) => item.category === "failing_checks");
  const ages = [...waiting, ...fixes].map((item) => item.age_seconds).filter((value) => value != null);
  const oldest = ages.length ? Math.max(...ages) : null;
  const openSlots = openSlotSummary(
    wanted ? profiles.filter((profile) => profile.id === wanted) : profiles,
    posts.filter((post) => post.status === "scheduled" && !post.schedule_missed),
    now,
  );
  return {
    profile_id: wanted || null,
    waiting_for_approval: waiting.length,
    need_fixes: fixes.length,
    scheduled: items.filter((item) => item.category === "scheduled").length,
    failed: items.filter((item) => item.category === "failed").length,
    needs_review: items.filter((item) => item.category === "needs_review").length,
    oldest_waiting_seconds: oldest,
    oldest_waiting_label: ageLabel(oldest),
    open_slots: openSlots,
    note: queueNote(waiting.length, fixes.length, openSlots),
    items,
  };
}
