import { enforceIntakeLimit, saveSkillSproutContact, validateSubmission } from "../lib/admin/skillsproutStore.js";

export function respond(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(data));
}
export default async function handler(req, res) {
  res.setHeader("Vary", "Origin");
  if (req.headers.origin !== "https://skillsprout.1ststep.ai") return respond(res, 403, { ok: false, code: "origin_not_allowed" });
  res.setHeader("Access-Control-Allow-Origin", "https://skillsprout.1ststep.ai");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return respond(res, 405, { ok: false, code: "method_not_allowed" }); }
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) return respond(res, 415, { ok: false, code: "json_required" });
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? null);
    if (Buffer.byteLength(raw) > 2048) return respond(res, 413, { ok: false, code: "body_too_large" });
    const body = validateSubmission(JSON.parse(raw));
    await enforceIntakeLimit(String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim());
    await saveSkillSproutContact(body);
    return respond(res, 201, { ok: true });
  } catch (error) {
    const status = error.statusCode || (error instanceof SyntaxError ? 400 : 503);
    if (status === 429) res.setHeader("Retry-After", "600");
    return respond(res, status, { ok: false, code: status >= 500 ? "storage_unavailable" : error.code || "invalid_request" });
  }
}
