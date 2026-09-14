import { createHash } from "node:crypto";
import { fetchWithTimeout } from "../http/fetchWithTimeout.js";
import { getRequestHeader } from "../http/cors.js";
import { decryptProtectedJson, encryptProtectedJson } from "../security/dataProtection.js";

const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const PREFIX = "journey:lead:";
const FIELDS = ["business", "demand", "goal", "stack", "bottleneck", "bottleneck_detail", "outcome", "team", "timing"];
const OPTIONS = {
  demand: ["existing", "early", "none"],
  bottleneck: ["capture", "qualification", "routing", "followup", "reporting", "manual", "other"],
  team: ["solo", "small", "multi", "unknown"],
  timing: ["", "now", "quarter", "exploring"],
};

function failure(code, statusCode, message) {
  return Object.assign(new Error(message), { code, statusCode });
}

function boundedText(value, limit, required = true) {
  if (typeof value !== "string") throw failure("invalid_request", 400, "Please check your answers.");
  const text = value.trim();
  if ((required && !text) || text.length > limit) throw failure("invalid_request", 400, "Please check your answers.");
  return text;
}

export function normalizeJourneyRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw failure("invalid_request", 400, "Please check your request.");
  if (input.consent !== true) throw failure("consent_required", 400, "Please agree before sending your request.");
  const requestId = boundedText(input.request_id, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw failure("invalid_request_id", 400, "Please reload and try again.");
  }
  const email = boundedText(input.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure("invalid_email", 400, "Enter a valid email address.");
  if (!input.answers || typeof input.answers !== "object" || Array.isArray(input.answers)) throw failure("invalid_request", 400, "Please check your answers.");
  const answers = {};
  for (const field of FIELDS) answers[field] = boundedText(input.answers[field] ?? "", 300, field !== "bottleneck_detail" && field !== "timing");
  for (const [field, allowed] of Object.entries(OPTIONS)) {
    if (!allowed.includes(answers[field])) throw failure("invalid_request", 400, "Please check your answers.");
  }
  const attribution = {};
  const source = input.attribution && typeof input.attribution === "object" ? input.attribution : {};
  for (const field of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "first_touch_source", "first_touch_campaign"]) {
    const value = source[field];
    attribution[field] = typeof value === "string" ? value.trim().slice(0, 120) : "";
  }
  attribution.landing_path = typeof source.landing_path === "string" && source.landing_path.startsWith("/")
    ? source.landing_path.split("?")[0].slice(0, 180)
    : "";
  return { request_id: requestId.toLowerCase(), email, answers, attribution, consent: true };
}

function config() {
  const url = String(process.env.KV_REST_API_URL || "");
  const token = String(process.env.KV_REST_API_TOKEN || "");
  if (!url || !token) throw failure("intake_unavailable", 503, "The request service is unavailable. Your answers remain here; please try later.");
  const parsed = new URL(url);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local) throw failure("intake_unavailable", 503, "The request service is unavailable. Your answers remain here; please try later.");
  return { url: parsed.toString().replace(/\/$/, ""), token };
}

async function command(parts) {
  const { url, token } = config();
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(parts),
  }, 5000);
  if (!response.ok) throw failure("intake_unavailable", 503, "The request service is unavailable. Your answers remain here; please try later.");
  const body = await response.json();
  if (body.error) throw failure("intake_unavailable", 503, "The request service is unavailable. Your answers remain here; please try later.");
  return body.result;
}

export async function enforceJourneyRateLimit(req) {
  const forwarded = getRequestHeader(req, "x-vercel-forwarded-for") || getRequestHeader(req, "x-forwarded-for") || getRequestHeader(req, "x-real-ip") || "unknown";
  const source = forwarded.split(",")[0].trim();
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 24);
  const key = `journey:rate:${Math.floor(Date.now() / 600_000)}:${digest}`;
  const first = await command(["SET", key, "1", "EX", 600, "NX"]);
  const count = first === "OK" ? 1 : Number(await command(["INCR", key]));
  if (!Number.isInteger(count) || count > 12) throw failure("rate_limited", 429, "Please wait before sending another request.");
}

export async function saveJourneyRequest(input) {
  const normalized = normalizeJourneyRequest(input);
  const key = `${PREFIX}${normalized.request_id}`;
  const fingerprint = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  const record = { ...normalized, fingerprint, created_at: new Date().toISOString(), retention_seconds: RETENTION_SECONDS };
  const saved = await command(["SET", key, encryptProtectedJson(record, "journey-intake"), "EX", RETENTION_SECONDS, "NX"]);
  if (saved === "OK") return { request_id: normalized.request_id, persisted: true, replayed: false };
  const existing = await command(["GET", key]);
  if (!existing) throw failure("intake_unavailable", 503, "The request service is unavailable. Your answers remain here; please try later.");
  const prior = decryptProtectedJson(String(existing), "journey-intake");
  if (prior.fingerprint !== fingerprint) throw failure("request_conflict", 409, "This request changed. Please reload and try again.");
  return { request_id: normalized.request_id, persisted: true, replayed: true };
}

export async function listJourneyRequests(cursor = "0") {
  if (!/^\d{1,20}$/.test(cursor)) throw failure("invalid_cursor", 400, "Invalid cursor.");
  const result = await command(["SCAN", cursor, "MATCH", `${PREFIX}*`, "COUNT", 50]);
  if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[1])) throw failure("intake_unavailable", 503, "The request list is unavailable.");
  const keys = result[1].filter((key) => typeof key === "string" && key.startsWith(PREFIX));
  const values = [];
  for (let index = 0; index < keys.length; index += 50) {
    const batch = await command(["MGET", ...keys.slice(index, index + 50)]);
    if (!Array.isArray(batch)) throw failure("intake_unavailable", 503, "The request list is unavailable.");
    values.push(...batch);
  }
  const requests = values.filter((value) => typeof value === "string").map((value) => {
    const { request_id, email, answers, attribution, created_at } = decryptProtectedJson(value, "journey-intake");
    return { request_id, email, answers, attribution, created_at };
  });
  return { cursor: String(result[0]), requests };
}
