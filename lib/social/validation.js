import { AGENT_STATUSES, PRIVACY_STATUSES } from "./constants.js";
import { socialError } from "./errors.js";

const BLOCKED_AGENT_FIELDS = new Set([
  "approved_by",
  "approved_at",
  "published_url",
  "override_reason",
  "override_by",
  "created_by_token_id",
  "error",
  "id",
  "thumbnail_asset",
  "video_asset",
  "publish_lock_until",
]);

export function cleanString(value, max, label) {
  const text = String(value ?? "");
  if (text.length > max) {
    throw socialError(400, "invalid_field", `${label} is longer than ${max} characters.`);
  }
  return text;
}

export function cleanStringArray(value, { maxItems, maxItem, label }) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw socialError(400, "invalid_field", `${label} must be a list.`);
  if (value.length > maxItems) throw socialError(400, "invalid_field", `${label} has too many entries.`);
  return value.map((item) => {
    if (typeof item !== "string") throw socialError(400, "invalid_field", `${label} must be text.`);
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > maxItem || /[<>]/.test(trimmed)) {
      throw socialError(400, "invalid_field", `${label} contains an invalid entry.`);
    }
    return trimmed;
  });
}

export function cleanScore(value, label) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw socialError(400, "invalid_field", `${label} must be a number from 0 to 100.`);
  }
  return Math.round(number * 10) / 10;
}

export function cleanTimestamp(value, label) {
  if (value == null || value === "") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw socialError(400, "invalid_field", `${label} must be a date.`);
  return new Date(time).toISOString();
}

export function cleanPrivacy(value) {
  const privacy = String(value || "");
  if (!PRIVACY_STATUSES.includes(privacy)) {
    throw socialError(400, "invalid_field", "Privacy must be private, unlisted, or public.");
  }
  return privacy;
}

export function assertAgentMayEdit(input, tokenBrandId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw socialError(400, "invalid_request", "JSON object required.");
  }
  for (const key of Object.keys(input)) {
    if (BLOCKED_AGENT_FIELDS.has(key)) {
      throw socialError(403, "agent_forbidden", "This token cannot set review, publish, or asset fields.");
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "brand_id") && input.brand_id !== tokenBrandId) {
    throw socialError(403, "brand_scope", "This token cannot write another brand.");
  }
  if (Object.prototype.hasOwnProperty.call(input, "status") && !AGENT_STATUSES.includes(input.status)) {
    throw socialError(403, "agent_forbidden", "This token cannot approve, schedule, or publish.");
  }
  if (Object.prototype.hasOwnProperty.call(input, "scheduled_at") && input.scheduled_at) {
    throw socialError(403, "agent_forbidden", "This token cannot schedule a post. Set proposed_scheduled_at instead.");
  }
}

export function applyAgentEdits(post, input) {
  const next = { ...post };
  if (Object.prototype.hasOwnProperty.call(input, "title")) next.title = cleanString(input.title, 100, "Title");
  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    next.description = cleanString(input.description, 5000, "Description");
  }
  if (Object.prototype.hasOwnProperty.call(input, "caption")) next.caption = cleanString(input.caption, 2200, "Caption");
  if (Object.prototype.hasOwnProperty.call(input, "tags")) {
    next.tags = cleanStringArray(input.tags, { maxItems: 30, maxItem: 100, label: "Tags" });
  }
  if (Object.prototype.hasOwnProperty.call(input, "keywords")) {
    next.keywords = cleanStringArray(input.keywords, { maxItems: 20, maxItem: 80, label: "Keywords" });
  }
  if (Object.prototype.hasOwnProperty.call(input, "title_score")) next.title_score = cleanScore(input.title_score, "Title score");
  if (Object.prototype.hasOwnProperty.call(input, "thumbnail_score")) {
    next.thumbnail_score = cleanScore(input.thumbnail_score, "Thumbnail score");
  }
  if (Object.prototype.hasOwnProperty.call(input, "checked_at")) next.checked_at = cleanTimestamp(input.checked_at, "Checked at");
  if (Object.prototype.hasOwnProperty.call(input, "privacy_status")) next.privacy_status = cleanPrivacy(input.privacy_status);
  if (Object.prototype.hasOwnProperty.call(input, "status")) next.status = input.status;
  if (Object.prototype.hasOwnProperty.call(input, "proposed_scheduled_at")) {
    next.proposed_scheduled_at = cleanTimestamp(input.proposed_scheduled_at, "Proposed schedule");
  }
  if (!next.privacy_status) next.privacy_status = "private";
  return next;
}
