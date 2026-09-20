import { randomUUID } from "node:crypto";
import { cleanText, normalizeAttribution } from "../leads/attribution.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FEEDBACK = 4000;

function cleanFeedback(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, MAX_FEEDBACK);
}

function isTruthyOptIn(value) {
  return value === true || value === "true" || value === "yes" || value === "on";
}

export function validateAutoModelRouterFeedbackPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["request body must be a JSON object"];
  }

  const allowedFields = new Set(["email", "feedback", "opt_in", "attribution"]);
  const unexpected = Object.keys(payload).filter((key) => !allowedFields.has(key));
  if (unexpected.length) errors.push(`unexpected fields: ${unexpected.join(", ")}`);

  const email = cleanText(payload.email).toLowerCase();
  const feedback = cleanFeedback(payload.feedback);

  if (!email && !feedback) {
    errors.push("feedback or email is required");
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.push("email must be a valid email address");
  }
  if (payload.opt_in !== undefined && payload.opt_in !== null && typeof payload.opt_in !== "boolean" && typeof payload.opt_in !== "string") {
    errors.push("opt_in must be a boolean");
  }
  if (email && !isTruthyOptIn(payload.opt_in)) {
    errors.push("opt-in is required when an email is provided");
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

export function normalizeAutoModelRouterFeedback(payload) {
  const errors = validateAutoModelRouterFeedbackPayload(payload);
  if (errors.length) {
    const error = new Error("Invalid Auto Model Router feedback");
    error.statusCode = 400;
    error.code = "invalid_auto_model_router_feedback";
    error.errors = errors;
    throw error;
  }

  const email = cleanText(payload.email).toLowerCase();
  return {
    request_id: `amr_${randomUUID()}`,
    email,
    feedback: cleanFeedback(payload.feedback),
    opt_in: email ? true : isTruthyOptIn(payload.opt_in),
    attribution: normalizeAttribution(payload.attribution),
    created_at: new Date().toISOString(),
  };
}
