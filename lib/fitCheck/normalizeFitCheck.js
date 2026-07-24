import { randomUUID } from "node:crypto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIMELINES = new Set(["asap", "1-2-months", "3-6-months", "flexible"]);
const BUDGETS = new Set(["under-5k", "5k-10k", "10k-25k", "25k-plus", "not-sure"]);
const ATTRIBUTION_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "first_touch_source",
  "first_touch_campaign",
  "landing_path",
]);

function clean(value, maximum = 254) {
  return String(value || "").trim().slice(0, maximum);
}

function normalizeWebsiteUrl(value) {
  const candidate = clean(value, 500);
  if (!candidate) return "";

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error("website_url must be a valid website address");
  }
  url.hash = "";
  return url.toString();
}

function normalizeAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((result, [key, rawValue]) => {
    if (!ATTRIBUTION_KEYS.has(key)) return result;
    const safeValue = clean(rawValue, 180);
    if (safeValue) result[key] = safeValue;
    return result;
  }, {});
}

export function validateFitCheckPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["request body must be a JSON object"];
  }

  const allowedFields = new Set(["website_url", "email", "timeline", "budget_range", "attribution"]);
  const unexpected = Object.keys(payload).filter((key) => !allowedFields.has(key));
  if (unexpected.length) errors.push(`unexpected fields: ${unexpected.join(", ")}`);

  const email = clean(payload.email).toLowerCase();
  if (!email) errors.push("email is required");
  else if (!EMAIL_PATTERN.test(email)) errors.push("email must be a valid email address");

  if (!clean(payload.website_url, 500)) {
    errors.push("website_url is required");
  } else {
    try {
      normalizeWebsiteUrl(payload.website_url);
    } catch {
      errors.push("website_url must be a valid website address");
    }
  }

  if (!TIMELINES.has(clean(payload.timeline, 40))) {
    errors.push("timeline must be one of the available options");
  }
  if (!BUDGETS.has(clean(payload.budget_range, 40))) {
    errors.push("budget_range must be one of the available options");
  }
  if (payload.attribution !== undefined && (
    !payload.attribution ||
    typeof payload.attribution !== "object" ||
    Array.isArray(payload.attribution)
  )) {
    errors.push("attribution must be an object");
  }

  return errors;
}

export function normalizeFitCheck(payload) {
  const errors = validateFitCheckPayload(payload);
  if (errors.length) {
    const error = new Error("Invalid fit check request");
    error.statusCode = 400;
    error.code = "invalid_fit_check";
    error.errors = errors;
    throw error;
  }

  return {
    request_id: `fit_${randomUUID()}`,
    website_url: normalizeWebsiteUrl(payload.website_url),
    email: clean(payload.email).toLowerCase(),
    timeline: clean(payload.timeline, 40),
    budget_range: clean(payload.budget_range, 40),
    attribution: normalizeAttribution(payload.attribution),
    created_at: new Date().toISOString(),
  };
}

