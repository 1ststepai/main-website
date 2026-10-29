// Builds desk API URLs from a fixed allowlist of routes. Callers never pass a raw
// path: query values are validated and encoded, and the URL is pinned to this origin.
export const DESK_ROUTES = Object.freeze({
  status: "/api/status",
  manage: "/api/manage",
  connect: "/api/connect",
  profile: "/api/profile",
  manageApprove: "/api/manage/approve",
  manageDiscard: "/api/manage/discard",
  manageQueue: "/api/manage/queue",
  recordings: "/api/recordings",
  recordingsEvent: "/api/recordings/event",
  recordingsVideo: "/api/recordings/video",
  recordingsStart: "/api/recordings/start",
  recordingsStop: "/api/recordings/stop",
  recordingsRename: "/api/recordings/rename",
  recordingsDelete: "/api/recordings/delete",
  settingsVidiq: "/api/settings/vidiq",
});

const QUERY_RULES = Object.freeze({
  manage: { profile_id: /^[a-z0-9][a-z0-9_-]{0,63}$/i },
  recordingsVideo: { id: /^rec_\w{1,80}$/ },
});

export function deskUrl(route, query = {}, origin = globalThis.location?.origin || "http://127.0.0.1") {
  if (!Object.hasOwn(DESK_ROUTES, route)) throw new Error("Unknown desk route.");
  const rules = QUERY_RULES[route] || {};
  const parts = [];
  for (const [key, value] of Object.entries(query || {})) {
    const rule = rules[key];
    if (!rule) throw new Error("Unknown query parameter.");
    const text = String(value ?? "");
    if (text === "") continue;
    if (!rule.test(text)) throw new Error("Invalid query value.");
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
  }
  const url = new URL(DESK_ROUTES[route], origin);
  if (parts.length) url.search = parts.join("&");
  return url.href;
}

const PROFILE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

// Body for the "profile" route: only a brand id, a display name and the chosen
// Facebook Page are allowed through, each checked before it leaves the page.
export function profileBody({ id, name, metaPage = "" } = {}) {
  const brandId = String(id ?? "").trim();
  if (!PROFILE_ID.test(brandId)) throw new Error("Invalid brand id.");
  const brandName = String(name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  if (!brandName) throw new Error("Give the brand a name.");
  const page = String(metaPage ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (page.length > 200) throw new Error("Facebook Page name is too long.");
  return { id: brandId, name: brandName, presets: { meta_page: page } };
}
