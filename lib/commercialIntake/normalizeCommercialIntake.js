import { randomUUID } from "node:crypto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const COMMERCIAL_INTENTS = new Set([
  "build_new",
  "finish_build",
  "automate_business",
]);

export const BUILD_CATEGORIES = new Set([
  "website",
  "website-rebuild",
  "web-app-saas",
  "dashboard-portal",
  "ai-system-agent",
  "mobile-app",
  "internal-tool",
  "automation-integration",
  "other",
]);

const STAGES = new Set(["idea", "started", "live", "manual-workflow"]);
const DEADLINES = new Set(["asap", "1-2-months", "3-6-months", "flexible"]);
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

function clean(value, maximum) {
  return String(value || "").trim().slice(0, maximum);
}

function normalizeProjectUrl(value) {
  const candidate = clean(value, 500);
  if (!candidate) return "";
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error("project_url must be a valid public website address");
  }
  url.username = "";
  url.password = "";
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

export function validateCommercialIntakePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["request body must be a JSON object"];
  }

  const allowedFields = new Set([
    "intent",
    "build_category",
    "desired_result",
    "current_stage",
    "what_exists",
    "project_url",
    "current_tools",
    "biggest_blocker",
    "deadline",
    "budget_range",
    "email",
    "consent",
    "attribution",
  ]);
  const unexpected = Object.keys(payload).filter((key) => !allowedFields.has(key));
  if (unexpected.length) errors.push(`unexpected fields: ${unexpected.join(", ")}`);

  const intent = clean(payload.intent, 40);
  if (!COMMERCIAL_INTENTS.has(intent)) errors.push("intent must be one of the available options");

  const buildCategory = clean(payload.build_category, 40);
  if (intent === "build_new" && !BUILD_CATEGORIES.has(buildCategory)) {
    errors.push("build_category must be one of the available options");
  } else if (intent !== "build_new" && buildCategory) {
    errors.push("build_category is only available for new builds");
  }

  const requiredText = [
    ["desired_result", 1000],
    ["biggest_blocker", 800],
  ];
  for (const [field, maximum] of requiredText) {
    const value = clean(payload[field], maximum);
    if (!value) errors.push(`${field} is required`);
    else if (String(payload[field]).trim().length > maximum) errors.push(`${field} is too long`);
  }

  for (const [field, maximum] of [["what_exists", 800], ["current_tools", 500]]) {
    if (String(payload[field] || "").trim().length > maximum) errors.push(`${field} is too long`);
  }

  if (!STAGES.has(clean(payload.current_stage, 40))) {
    errors.push("current_stage must be one of the available options");
  }
  if (!DEADLINES.has(clean(payload.deadline, 40))) {
    errors.push("deadline must be one of the available options");
  }
  if (!BUDGETS.has(clean(payload.budget_range, 40))) {
    errors.push("budget_range must be one of the available options");
  }

  const email = clean(payload.email, 254).toLowerCase();
  if (!email) errors.push("email is required");
  else if (!EMAIL_PATTERN.test(email)) errors.push("email must be a valid email address");

  if (payload.consent !== true) errors.push("consent is required");

  if (clean(payload.project_url, 500)) {
    try {
      normalizeProjectUrl(payload.project_url);
    } catch {
      errors.push("project_url must be a valid public website address");
    }
  }

  if (payload.attribution !== undefined && (
    !payload.attribution
    || typeof payload.attribution !== "object"
    || Array.isArray(payload.attribution)
  )) {
    errors.push("attribution must be an object");
  }

  return errors;
}

export function normalizeCommercialIntake(payload) {
  const errors = validateCommercialIntakePayload(payload);
  if (errors.length) {
    const error = new Error("Please check the highlighted information and try again.");
    error.statusCode = 400;
    error.code = "invalid_commercial_intake";
    error.errors = errors;
    throw error;
  }

  const intent = clean(payload.intent, 40);
  return {
    request_id: `commercial_${randomUUID()}`,
    intent,
    build_category: intent === "build_new" ? clean(payload.build_category, 40) : "",
    desired_result: clean(payload.desired_result, 1000),
    current_stage: clean(payload.current_stage, 40),
    what_exists: clean(payload.what_exists, 800),
    project_url: normalizeProjectUrl(payload.project_url),
    current_tools: clean(payload.current_tools, 500),
    biggest_blocker: clean(payload.biggest_blocker, 800),
    deadline: clean(payload.deadline, 40),
    budget_range: clean(payload.budget_range, 40),
    email: clean(payload.email, 254).toLowerCase(),
    consent: true,
    attribution: normalizeAttribution(payload.attribution),
    created_at: new Date().toISOString(),
  };
}
