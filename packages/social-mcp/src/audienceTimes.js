import { partsInZone } from "./desk/public/schedulePlan.js";

/**
 * Audience metrics checked against official docs on 2026-10-28.
 * This module never adds an OAuth scope. A missing scope is reported and the call is skipped.
 *
 * YouTube Analytics reports.query dimensions are day and month. There is no hour dimension.
 * Dates in that report are Pacific. Metric used: views.
 * https://developers.google.com/youtube/analytics/dimensions
 * https://developers.google.com/youtube/analytics/reference/reports/query
 * That report needs yt-analytics.readonly, which this app does not request.
 * Upload times use search.list (forMine, type=video), already covered by youtube.readonly:
 * https://developers.google.com/youtube/v3/docs/search/list
 * View counts use videos.list statistics.viewCount, same scope:
 * https://developers.google.com/youtube/v3/docs/videos/list
 *
 * Instagram account insights, updated 2026-06-16, still name online_followers in the limits
 * (last 30 days, accounts with at least 100 followers) but do not list it in the metrics table
 * and do not state its period. period=lifetime is the last documented period that returns the
 * hour map "0".."23". That period is unverified against the current table.
 * https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights
 * impressions is deprecated for v22.0 and for every version on 2025-04-21. The replacement on media is views.
 * https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/
 * https://developers.facebook.com/docs/instagram-platform/changelog/
 * Both insight calls need instagram_manage_insights, which this app does not request.
 * Host stays graph.facebook.com/v22.0, the same host the publisher already uses.
 *
 * Facebook page_fans_online and page_fans_online_per_day were deprecated on 2024-09-16.
 * The Pages changelog (updated 2026-01-30) lists no hourly replacement.
 * page_media_view and post_media_view replace impression counts. They are view counts, not a time of day.
 * https://developers.facebook.com/documentation/pages-api/changelog
 * https://developers.facebook.com/docs/graph-api/reference/insights/
 * post_media_view needs read_insights, which this app does not request. page_fans_online is never requested.
 */

export const MIN_SAMPLE = 10;
export const PERMISSION_NOTE = "Needs permission to read audience data";
export const NOT_ENOUGH = "Not enough data yet";
const GRAPH = "https://graph.facebook.com/v22.0";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const AUDIENCE_SCOPE = {
  youtube: "https://www.googleapis.com/auth/yt-analytics.readonly",
  instagram: "instagram_manage_insights",
  facebook: "read_insights",
};

const UPLOAD_SCOPE = {
  youtube: "https://www.googleapis.com/auth/youtube.readonly",
};

export function scopeList(secrets) {
  return String(secrets?.scope || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasScope(secrets, scope) {
  if (!scope) return false;
  return scopeList(secrets).includes(scope);
}

export function hoursFromOnlineFollowers(payload) {
  if (payload?.error) return null;
  const metric = (payload?.data || []).find((row) => row.name === "online_followers");
  if (!metric) return null;
  const totals = Array(24).fill(0);
  let days = 0;
  let start = "";
  let end = "";
  for (const value of metric.values || []) {
    const map = value?.value;
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    days += 1;
    end = value.end_time || end;
    if (!start) start = value.end_time || "";
    for (let hour = 0; hour < 24; hour += 1) totals[hour] += Number(map[String(hour)] || 0);
  }
  if (!days || totals.every((count) => count <= 0)) return null;
  return { totals, days, start, end };
}

export function weekdaysFromYoutubeDays(payload) {
  if (payload?.error) return null;
  const rows = payload?.rows || [];
  const totals = Array(7).fill(0);
  let start = "";
  let end = "";
  for (const row of rows) {
    const day = String(row?.[0] || "");
    const views = Number(row?.[1] || 0);
    const parsed = Date.parse(`${day}T12:00:00Z`);
    if (!day || !Number.isFinite(parsed)) continue;
    totals[new Date(parsed).getUTCDay()] += views;
    if (!start || day < start) start = day;
    if (!end || day > end) end = day;
  }
  if (!rows.length || totals.every((count) => count <= 0)) return null;
  return { totals, days: rows.length, start, end };
}

export function isDeprecatedInsight(payload) {
  const message = String(payload?.error?.message || payload?.error?.error_user_msg || "").toLowerCase();
  const code = Number(payload?.error?.code || 0);
  return code === 100 || message.includes("invalid metric") || message.includes("deprecated");
}

function topIndex(totals) {
  let best = 0;
  for (let i = 1; i < totals.length; i += 1) if (totals[i] > totals[best]) best = i;
  return best;
}

function clock(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function localParts(iso, timeZone) {
  try {
    return partsInZone(timeZone || "UTC", Date.parse(iso));
  } catch {
    return null;
  }
}

export function fromPastPosts(posts, timeZone, min = MIN_SAMPLE) {
  const rows = (posts || []).filter((post) => ["published", "handed_off"].includes(post.status));
  const stamped = rows
    .map((post) => ({ post, iso: post.published_at || post.updated_at, weight: Number(post.weight) > 0 ? Number(post.weight) : 1 }))
    .filter((row) => row.iso && Number.isFinite(Date.parse(row.iso)));
  if (stamped.length < min) return { ok: false, sample_size: stamped.length };
  const buckets = new Map();
  let start = stamped[0].iso;
  let end = stamped[0].iso;
  for (const row of stamped) {
    if (row.iso < start) start = row.iso;
    if (row.iso > end) end = row.iso;
    const local = localParts(row.iso, timeZone);
    if (!local) continue;
    const key = `${local.weekday}-${local.hour}`;
    const current = buckets.get(key) || { weekday: local.weekday, hour: local.hour, count: 0 };
    current.count += row.weight;
    buckets.set(key, current);
  }
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!best) return { ok: false, sample_size: stamped.length };
  return {
    ok: true,
    sample_size: stamped.length,
    start,
    end,
    suggestions: [
      {
        weekday: best.weekday,
        time: clock(best.hour),
        label: `${WEEKDAYS[best.weekday]} ${clock(best.hour)}`,
      },
    ],
  };
}

function permissionFor(platform, secrets) {
  const needed = AUDIENCE_SCOPE[platform];
  if (!needed) return { state: "not_available", note: "" };
  if (hasScope(secrets, needed)) return { state: "granted", note: "" };
  return { state: "needs_permission", note: PERMISSION_NOTE };
}

function result({ platform, permission, source, sample_size, start, end, suggestions, message, detail }) {
  return {
    platform,
    permission: permission.state,
    permission_note: permission.note,
    source,
    sample_size: sample_size || 0,
    confidence: !sample_size ? "none" : sample_size >= 30 ? "larger sample" : "small sample",
    range: start || end ? { start: start || "", end: end || "" } : null,
    suggestions: suggestions || [],
    message: message || "",
    detail: detail || "",
  };
}

async function readJson(fetchImpl, url, token) {
  try {
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
    return await response.json();
  } catch {
    return { error: { message: "request failed" } };
  }
}

function tokenFor(secrets) {
  return secrets?.access_token || secrets?.page_access_token || secrets?.user_access_token || "";
}

async function instagramMediaTimes(fetchImpl, instagramId, token, timeZone) {
  const listed = await readJson(
    fetchImpl,
    `${GRAPH}/${encodeURIComponent(instagramId)}/media?fields=id,timestamp&limit=25`,
    token,
  );
  if (listed?.error) return null;
  const media = (listed?.data || []).filter((row) => row?.id && row?.timestamp).slice(0, 25);
  if (media.length < MIN_SAMPLE) return { ok: false, sample_size: media.length };
  const posts = [];
  let viewsSeen = false;
  for (const row of media) {
    const insight = await readJson(
      fetchImpl,
      `${GRAPH}/${encodeURIComponent(row.id)}/insights?metric=views&period=lifetime`,
      token,
    );
    let weight = 1;
    if (!isDeprecatedInsight(insight)) {
      const metric = (insight?.data || []).find((item) => item.name === "views");
      const value = Number(metric?.values?.[0]?.value ?? metric?.total_value?.value);
      if (Number.isFinite(value) && value > 0) {
        weight = value;
        viewsSeen = true;
      }
    }
    posts.push({ status: "published", platform: "instagram", published_at: row.timestamp, weight });
  }
  const past = fromPastPosts(posts, timeZone);
  return { ...past, viewsSeen };
}

async function facebookPostTimes(fetchImpl, pageId, token, timeZone) {
  const listed = await readJson(
    fetchImpl,
    `${GRAPH}/${encodeURIComponent(pageId)}/posts?fields=id,created_time&limit=25`,
    token,
  );
  if (listed?.error) return null;
  const pagePosts = (listed?.data || []).filter((row) => row?.id && row?.created_time).slice(0, 25);
  if (pagePosts.length < MIN_SAMPLE) return { ok: false, sample_size: pagePosts.length };
  const posts = [];
  let viewsSeen = false;
  for (const row of pagePosts) {
    const insight = await readJson(
      fetchImpl,
      `${GRAPH}/${encodeURIComponent(row.id)}/insights?metric=post_media_view`,
      token,
    );
    let weight = 1;
    if (!isDeprecatedInsight(insight)) {
      const metric = (insight?.data || []).find((item) => item.name === "post_media_view");
      const value = Number(metric?.values?.[0]?.value ?? metric?.total_value?.value);
      if (Number.isFinite(value) && value > 0) {
        weight = value;
        viewsSeen = true;
      }
    }
    posts.push({ status: "published", platform: "facebook", published_at: row.created_time, weight });
  }
  const past = fromPastPosts(posts, timeZone);
  return { ...past, viewsSeen };
}

async function youtubeUploadTimes(fetchImpl, token, timeZone) {
  const payload = await readJson(
    fetchImpl,
    "https://www.googleapis.com/youtube/v3/search?forMine=true&type=video&part=snippet&maxResults=50&order=date",
    token,
  );
  const items = (payload?.items || []).filter((item) => item?.snippet?.publishedAt);
  if (items.length < MIN_SAMPLE) return { ok: false, sample_size: items.length };
  const ids = items.map((item) => item?.id?.videoId).filter(Boolean).slice(0, 50);
  let views = new Map();
  if (ids.length) {
    const stats = await readJson(
      fetchImpl,
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(ids.join(","))}`,
      token,
    );
    views = new Map(
      (stats?.items || []).map((item) => [item.id, Number(item?.statistics?.viewCount || 0)]),
    );
  }
  const posts = items.map((item) => ({
    status: "published",
    platform: "youtube",
    published_at: item.snippet.publishedAt,
    weight: views.get(item?.id?.videoId) || 1,
  }));
  return fromPastPosts(posts, timeZone);
}

export async function collectBestTimes({ platform, secrets, connection, posts, timeZone = "UTC", fetchImpl, now = Date.now() } = {}) {
  const permission = permissionFor(platform, secrets);
  const token = tokenFor(secrets);
  const canRead = permission.state === "granted" && token && fetchImpl;

  if (canRead && platform === "instagram" && connection?.instagram_id) {
    const until = Math.floor(now / 1000);
    const since = until - 30 * 24 * 60 * 60;
    const url = `${GRAPH}/${encodeURIComponent(connection.instagram_id)}/insights?metric=online_followers&period=lifetime&since=${since}&until=${until}`;
    const payload = await readJson(fetchImpl, url, token);
    if (!isDeprecatedInsight(payload)) {
      const hours = hoursFromOnlineFollowers(payload);
      if (hours) {
        const hour = topIndex(hours.totals);
        return result({
          platform,
          permission,
          source: "instagram_online_followers",
          sample_size: hours.days,
          start: hours.start || new Date(since * 1000).toISOString(),
          end: hours.end || new Date(until * 1000).toISOString(),
          suggestions: [{ weekday: "daily", time: clock(hour), label: `Daily ${clock(hour)}` }],
          detail: "Instagram online_followers. The hour is the key from that report. The June 16, 2026 account insights page names this metric in its limits and does not list its time zone.",
        });
      }
    }
    const media = await instagramMediaTimes(fetchImpl, connection.instagram_id, token, timeZone);
    if (media?.ok) {
      return result({
        platform,
        permission,
        source: media.viewsSeen ? "instagram_media_views" : "instagram_media_times",
        sample_size: media.sample_size,
        start: media.start,
        end: media.end,
        suggestions: media.suggestions,
        detail: media.viewsSeen
          ? "Instagram media insights metric views. impressions is deprecated."
          : "Instagram media timestamps. The views insight was not returned.",
      });
    }
  }

  if (canRead && platform === "youtube") {
    const endDay = new Date(now).toISOString().slice(0, 10);
    const startDay = new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&metrics=views&dimensions=day&startDate=${startDay}&endDate=${endDay}`;
    const payload = await readJson(fetchImpl, url, token);
    const days = weekdaysFromYoutubeDays(payload);
    if (days) {
      const weekday = topIndex(days.totals);
      return result({
        platform,
        permission,
        source: "youtube_views_by_day",
        sample_size: days.days,
        start: days.start,
        end: days.end,
        suggestions: [{ weekday, time: "", label: WEEKDAYS[weekday] }],
        detail: "YouTube Analytics views by day. That report has no hour.",
      });
    }
  }

  if (platform === "youtube" && hasScope(secrets, UPLOAD_SCOPE.youtube) && token && connection?.channel_id && fetchImpl) {
    const uploads = await youtubeUploadTimes(fetchImpl, token, timeZone);
    if (uploads?.ok) {
      return result({
        platform,
        permission,
        source: "youtube_uploads",
        sample_size: uploads.sample_size,
        start: uploads.start,
        end: uploads.end,
        suggestions: uploads.suggestions,
        detail: "This channel's own upload times, weighted by view count when the videos list returned one.",
      });
    }
  }

  if (canRead && platform === "facebook" && connection?.page_id) {
    const pagePosts = await facebookPostTimes(fetchImpl, connection.page_id, token, timeZone);
    if (pagePosts?.ok) {
      return result({
        platform,
        permission,
        source: pagePosts.viewsSeen ? "facebook_post_media_view" : "facebook_post_times",
        sample_size: pagePosts.sample_size,
        start: pagePosts.start,
        end: pagePosts.end,
        suggestions: pagePosts.suggestions,
        detail: pagePosts.viewsSeen
          ? "Facebook post_media_view. page_fans_online is deprecated and was not requested."
          : "Facebook post times. post_media_view was not returned. page_fans_online is deprecated and was not requested.",
      });
    }
    const past = pastOrEmpty(posts, timeZone, permission, platform);
    if (past.source === "none") {
      past.detail = "page_fans_online is deprecated and has no documented hourly replacement.";
    }
    return past;
  }

  return pastOrEmpty(posts, timeZone, permission, platform);
}

function pastOrEmpty(posts, timeZone, permission, platform) {
  const past = fromPastPosts(
    (posts || []).filter((post) => post.platform === platform),
    timeZone,
  );
  if (past.ok) {
    return result({
      platform,
      permission,
      source: "past_posts",
      sample_size: past.sample_size,
      start: past.start,
      end: past.end,
      suggestions: past.suggestions,
      detail: "This brand's posts saved in PostPath.",
    });
  }
  const unavailable = permission.state === "not_available" ? "No audience-online metric is documented for this network." : "";
  return result({
    platform,
    permission,
    source: "none",
    sample_size: past.sample_size,
    message: NOT_ENOUGH,
    detail: permission.note ? "" : unavailable,
  });
}
