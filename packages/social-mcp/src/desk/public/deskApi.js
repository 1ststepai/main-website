// Builds desk API URLs from a fixed allowlist of routes. Callers never pass a raw
// path: query values are validated and encoded, and the URL is pinned to this origin.
export const DESK_ROUTES = Object.freeze({
  status: "/api/status",
  manage: "/api/manage",
  connect: "/api/connect",
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
