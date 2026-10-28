export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(timeZone || "") });
    return true;
  } catch {
    return false;
  }
}

export function partsInZone(timeZone, utcMs) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) parts[part.type] = part.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday,
  };
}

function offsetMinutes(timeZone, utcMs) {
  const local = partsInZone(timeZone, utcMs);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return Math.round((asUtc - utcMs) / 60000);
}

export function zonedToUtc(timeZone, year, month, day, hour, minute) {
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 4; i += 1) {
    const next = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes(timeZone, utc) * 60000;
    if (next === utc) return utc;
    utc = next;
  }
  return utc;
}

function addDays(year, month, day, count) {
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + count);
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function normalizePlan(input = {}, platforms = []) {
  const timezone = String(input.timezone || "").trim();
  if (!isValidTimeZone(timezone)) {
    const error = new Error("Use an IANA time zone such as America/New_York.");
    error.code = "invalid_timezone";
    throw error;
  }
  const slots = [];
  for (const raw of Array.isArray(input.slots) ? input.slots : []) {
    const platform = String(raw?.platform || "").trim();
    if (platforms.length && !platforms.includes(platform)) continue;
    const time = String(raw?.time || "").trim();
    if (!TIME_RE.test(time)) continue;
    const daily = raw?.weekday === "daily" || raw?.daily === true;
    const weekday = daily ? "daily" : Number(raw?.weekday);
    if (!daily && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) continue;
    const id = String(raw?.id || `${platform}-${weekday}-${time}`).slice(0, 40);
    if (slots.some((slot) => slot.id === id)) continue;
    slots.push({ id, platform, weekday, time });
    if (slots.length >= 40) break;
  }
  return { timezone, slots };
}

function matches(slot, weekday) {
  return slot.weekday === "daily" || slot.weekday === weekday;
}

export function occurrences({ plan, from, days = 7, posts = [] } = {}) {
  if (!plan?.timezone || !isValidTimeZone(plan.timezone)) return [];
  const start = partsInZone(plan.timezone, from);
  const out = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(start.year, start.month, start.day, offset);
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    for (const slot of plan.slots || []) {
      if (!matches(slot, weekday)) continue;
      const [hour, minute] = slot.time.split(":").map(Number);
      const utc = zonedToUtc(plan.timezone, date.year, date.month, date.day, hour, minute);
      if (utc < from) continue;
      const iso = new Date(utc).toISOString();
      const post = posts.find((row) => row.platform === slot.platform && row.scheduled_at && Date.parse(row.scheduled_at) === utc);
      let state = "empty";
      if (post?.schedule_missed) state = "missed";
      else if (post) state = "filled";
      out.push({
        slot_id: slot.id,
        platform: slot.platform,
        weekday,
        time: slot.time,
        starts_at: iso,
        local_label: `${WEEKDAY_NAMES[weekday]} ${slot.time}`,
        state,
        post_id: post?.id || "",
        title: post?.title || post?.caption || "",
      });
    }
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.platform.localeCompare(b.platform));
}

export function nextZonedStart(timeZone, weekday, time, from = Date.now()) {
  if (!isValidTimeZone(timeZone) || !TIME_RE.test(String(time || ""))) return null;
  const [hour, minute] = String(time).split(":").map(Number);
  const start = partsInZone(timeZone, from);
  for (let offset = 0; offset < 8; offset += 1) {
    const date = addDays(start.year, start.month, start.day, offset);
    const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    if (weekday !== "daily" && day !== Number(weekday)) continue;
    const utc = zonedToUtc(timeZone, date.year, date.month, date.day, hour, minute);
    if (utc > from) return new Date(utc).toISOString();
  }
  return null;
}

export function nextOpenSlot({ plan, platform, from, posts = [], horizonDays = 60 } = {}) {
  const rows = occurrences({ plan, from: from + 1, days: horizonDays, posts }).filter(
    (row) => row.platform === platform && row.state === "empty",
  );
  return rows[0] || null;
}

export function openSlotSummary(profiles, posts, from) {
  const lines = [];
  for (const profile of profiles || []) {
    const plan = profile.posting_plan;
    if (!plan?.slots?.length) continue;
    const count = occurrences({
      plan,
      from,
      days: 7,
      posts: (posts || []).filter((post) => post.profile_id === profile.id),
    }).filter((row) => row.state === "empty").length;
    if (count) lines.push({ profile_id: profile.id, name: profile.name || profile.id, count });
  }
  return lines;
}
