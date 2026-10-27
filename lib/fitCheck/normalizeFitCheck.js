import { randomUUID } from "node:crypto";
import {
  EMAIL_PATTERN,
  attributionMustBeObject,
  normalizeAttribution,
  normalizeWebsiteUrl,
  rejectUnexpectedFields,
  requireJsonObject,
  trimField,
} from "../intake/submissionFields.js";

const clean = trimField;
const TIMELINES = new Set(["asap", "1-2-months", "3-6-months", "flexible"]);
const BUDGETS = new Set(["under-5k", "5k-10k", "10k-25k", "25k-plus", "not-sure"]);

export function validateFitCheckPayload(payload) {
  const objectError = requireJsonObject(payload);
  if (objectError) return [objectError];

  const errors = [];
  const allowedFields = new Set(["website_url", "email", "timeline", "budget_range", "attribution"]);
  const unexpected = rejectUnexpectedFields(payload, allowedFields);
  if (unexpected) errors.push(unexpected);

  const email = clean(payload.email).toLowerCase();
  if (!email) errors.push("email is required");
  else if (!EMAIL_PATTERN.test(email)) errors.push("email must be a valid email address");

  if (!clean(payload.website_url, 500)) {
    errors.push("website_url is required");
  } else {
    try {
      normalizeWebsiteUrl(payload.website_url, clean);
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
  if (attributionMustBeObject(payload)) errors.push("attribution must be an object");

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
    website_url: normalizeWebsiteUrl(payload.website_url, clean),
    email: clean(payload.email).toLowerCase(),
    timeline: clean(payload.timeline, 40),
    budget_range: clean(payload.budget_range, 40),
    attribution: normalizeAttribution(payload.attribution, clean),
    created_at: new Date().toISOString(),
  };
}
