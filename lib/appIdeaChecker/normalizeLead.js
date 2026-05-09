import { randomUUID } from "node:crypto";
import { classifyLeadQuality } from "./leadQuality.js";

const REQUIRED_FIELDS = ["name", "email", "score", "category", "idea_type", "budget"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function cleanAnswers(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return {};
  }

  return Object.keys(answers).reduce((cleaned, key) => {
    const safeKey = sanitizeProjectSlug(key).replace(/-/g, "_");
    cleaned[safeKey] = cleanString(answers[key]);
    return cleaned;
  }, {});
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
  const slugBase = sanitizeProjectSlug(`${name}-${ideaType}`);
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
