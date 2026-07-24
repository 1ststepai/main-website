import { randomUUID } from "node:crypto";
import { classifyLeadQuality } from "./leadQuality.js";

const REQUIRED_FIELDS = ["name", "email", "score", "category", "idea_type", "budget"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_FIELDS = new Set([
  "source",
  "name",
  "email",
  "phone",
  "score",
  "category",
  "idea_type",
  "audience",
  "budget",
  "launch_timeline",
  "recommended_path",
  "tags",
  "idea_text",
  "problem_clarity_score",
  "market_demand_score",
  "revenue_potential_score",
  "build_complexity_score",
  "distribution_score",
  "risk_level",
  "biggest_risk",
  "answers",
  "created_at"
]);
const STRING_LIMITS = {
  source: 64,
  name: 120,
  email: 254,
  phone: 40,
  category: 120,
  idea_type: 120,
  audience: 240,
  budget: 80,
  launch_timeline: 80,
  recommended_path: 1200,
  idea_text: 4000,
  risk_level: 80,
  biggest_risk: 800,
  created_at: 64
};
const OPTIONAL_SCORES = [
  "problem_clarity_score",
  "market_demand_score",
  "revenue_potential_score",
  "build_complexity_score",
  "distribution_score"
];
const MAX_ANSWER_KEYS = 30;
const MAX_ANSWER_CHARS = 4000;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function cleanText(value) {
  return String(cleanString(value) || "");
}

export function sanitizeProjectSlug(value) {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "mvp-project";
}

function cleanAnswerValue(value) {
  if (typeof value === "string") {
    return value.trim().slice(0, MAX_ANSWER_CHARS);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object") {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_ANSWER_CHARS) {
      return serialized;
    }
  }
  return "";
}

function cleanAnswers(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return {};
  }

  return Object.keys(answers).slice(0, MAX_ANSWER_KEYS).reduce((cleaned, key) => {
    const safeKey = sanitizeProjectSlug(key).replace(/-/g, "_");
    cleaned[safeKey] = cleanAnswerValue(answers[key]);
    return cleaned;
  }, Object.create(null));
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => sanitizeProjectSlug(tag).replace(/-/g, "_"))
    .filter(Boolean)
    .slice(0, 20);
}

export function validateLeadPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["request body must be a JSON object"];
  }

  const unexpected = Object.keys(payload).filter((field) => !ALLOWED_FIELDS.has(field));
  if (unexpected.length) {
    errors.push(`unexpected fields: ${unexpected.slice(0, 10).join(", ")}`);
  }

  for (const field of REQUIRED_FIELDS) {
    if (payload[field] === undefined || payload[field] === null || cleanText(payload[field]) === "") {
      errors.push(`${field} is required`);
    }
  }

  const email = cleanText(payload.email).toLowerCase();
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.push("email must be a valid email address");
  }

  const score = Number(payload.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    errors.push("score must be a number from 0 to 100");
  }

  for (const [field, maximum] of Object.entries(STRING_LIMITS)) {
    if (payload[field] === undefined || payload[field] === null) {
      continue;
    }
    if (typeof payload[field] !== "string") {
      errors.push(`${field} must be a string`);
      continue;
    }
    if (payload[field].trim().length > maximum) {
      errors.push(`${field} must be ${maximum} characters or fewer`);
    }
  }

  for (const field of OPTIONAL_SCORES) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      continue;
    }
    const value = Number(payload[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.push(`${field} must be a number from 0 to 100`);
    }
  }

  if (payload.tags !== undefined && !Array.isArray(payload.tags)) {
    errors.push("tags must be an array");
  }
  if (Array.isArray(payload.tags) && payload.tags.length > 20) {
    errors.push("tags must contain 20 items or fewer");
  }
  if (Array.isArray(payload.tags) && payload.tags.some((tag) => typeof tag !== "string" || tag.length > 80)) {
    errors.push("each tag must be a string of 80 characters or fewer");
  }

  if (payload.answers !== undefined) {
    if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
      errors.push("answers must be an object");
    } else if (Object.keys(payload.answers).length > MAX_ANSWER_KEYS) {
      errors.push(`answers must contain ${MAX_ANSWER_KEYS} fields or fewer`);
    } else {
      for (const [key, value] of Object.entries(payload.answers)) {
        if (key.length > 80) {
          errors.push("answer keys must be 80 characters or fewer");
          break;
        }
        if (!["string", "number", "boolean", "object"].includes(typeof value) || value === null) {
          errors.push(`answer ${key} has an unsupported value type`);
          break;
        }
        try {
          if (JSON.stringify(value).length > MAX_ANSWER_CHARS) {
            errors.push(`answer ${key} must be ${MAX_ANSWER_CHARS} characters or fewer`);
            break;
          }
        } catch (error) {
          errors.push(`answer ${key} must be JSON serializable`);
          break;
        }
      }
    }
  }

  if (payload.created_at) {
    const timestamp = Date.parse(payload.created_at);
    if (!Number.isFinite(timestamp)) {
      errors.push("created_at must be a valid date-time");
    }
  }

  return errors;
}

export function normalizeLead(payload) {
  const errors = validateLeadPayload(payload);
  if (errors.length) {
    const error = new Error("Invalid app idea checker payload");
    error.statusCode = 400;
    error.errors = errors;
    throw error;
  }

  const leadId = `lead_${randomUUID()}`;
  const score = Math.round(Number(payload.score));
  const name = cleanText(payload.name);
  const ideaType = cleanText(payload.idea_type);
  const slugBase = sanitizeProjectSlug(ideaType);
  const projectSlug = `${slugBase}-${leadId.slice(5, 13)}`;

  const lead = {
    source: cleanText(payload.source || "app_idea_checker"),
    lead_id: leadId,
    project_slug: projectSlug,
    name,
    email: cleanText(payload.email).toLowerCase(),
    phone: cleanText(payload.phone),
    score,
    category: cleanText(payload.category),
    idea_type: ideaType,
    audience: cleanText(payload.audience),
    budget: cleanText(payload.budget),
    launch_timeline: cleanText(payload.launch_timeline),
    recommended_path: cleanText(payload.recommended_path),
    tags: cleanTags(payload.tags),
    answers: cleanAnswers(payload.answers),
    client_created_at: cleanText(payload.created_at),
    server_created_at: new Date().toISOString()
  };

  lead.lead_quality = classifyLeadQuality(lead.score, lead.budget);
  return lead;
}
