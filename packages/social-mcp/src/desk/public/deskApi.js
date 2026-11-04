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
  autoPost: "/api/auto-post",
  autoPostNetwork: "/api/auto-post/network",
  autoPostSnooze: "/api/auto-post/snooze",
  learning: "/api/learning",
  learningAccept: "/api/learning/accept",
  learningDismiss: "/api/learning/dismiss",
  learningDelete: "/api/learning/delete",
  learningReset: "/api/learning/reset",
  discard: "/api/discard",
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

// Returns the id only when it is a well-formed brand id, otherwise "".
export function cleanBrandId(value) {
  const text = String(value ?? "").trim();
  return PROFILE_ID.test(text) ? text : "";
}

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

const NETWORK = /^[a-z][a-z_]{0,31}$/;

// Body for "autoPostNetwork": one brand, one network, on or off. Only turning it on
// carries the owner PIN (sent as a header) or, with no PIN set, an explicit confirm.
export function autoPostNetworkBody({ profileId, platform, enabled, confirm = false } = {}) {
  const brandId = cleanBrandId(profileId);
  if (!brandId) throw new Error("Invalid brand id.");
  const network = String(platform ?? "");
  if (!NETWORK.test(network)) throw new Error("Invalid network.");
  const body = { profile_id: brandId, platform: network, enabled: enabled === true };
  if (body.enabled && confirm === true) body.confirm = true;
  return body;
}

// Body for "autoPostSnooze": hide the suggestion for one brand + network for now.
export function autoPostSnoozeBody({ profileId, platform } = {}) {
  const brandId = cleanBrandId(profileId);
  if (!brandId) throw new Error("Invalid brand id.");
  const network = String(platform ?? "");
  if (!NETWORK.test(network)) throw new Error("Invalid network.");
  return { profile_id: brandId, platform: network };
}

const SUGGESTION_ID = /^sug_[a-z0-9]{4,40}$/;
const BULLET_ID = /^(derived:[a-z_]+:[a-z0-9-]{1,60}|note_[a-z0-9]{4,40})$/;

// Body for "learningAccept" / "learningDismiss": one brand and one pending suggestion.
export function learningSuggestionBody({ profileId, suggestionId } = {}) {
  const brandId = cleanBrandId(profileId);
  if (!brandId) throw new Error("Invalid brand id.");
  const id = String(suggestionId ?? "");
  if (!SUGGESTION_ID.test(id)) throw new Error("Invalid suggestion.");
  return { profile_id: brandId, suggestion_id: id };
}

// Body for "learningDelete": one brand and one guide bullet.
export function learningDeleteBody({ profileId, bulletId } = {}) {
  const brandId = cleanBrandId(profileId);
  if (!brandId) throw new Error("Invalid brand id.");
  const id = String(bulletId ?? "");
  if (!BULLET_ID.test(id)) throw new Error("Invalid bullet.");
  return { profile_id: brandId, bullet_id: id };
}

// Body for "learningReset": the PIN travels as a header; with no PIN set, an explicit confirm.
export function learningResetBody({ profileId, confirm = false } = {}) {
  const brandId = cleanBrandId(profileId);
  if (!brandId) throw new Error("Invalid brand id.");
  const body = { profile_id: brandId };
  if (confirm === true) body.confirm = true;
  return body;
}

const DRAFT_ID = /^[A-Za-z0-9_-]{8,80}$/;

// Body for "discard": one draft or bundle, plus an optional short reason the owner typed.
export function discardBody({ kind, id, reason = "" } = {}) {
  const draftId = String(id ?? "");
  if (!DRAFT_ID.test(draftId)) throw new Error("Invalid draft id.");
  const body = kind === "bundle" ? { bundle_id: draftId } : { post_id: draftId };
  const text = String(reason ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
  if (text) body.reason = text;
  return body;
}
