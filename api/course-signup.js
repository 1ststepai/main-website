import { createHash } from "node:crypto";
import { applyCors, getRequestHeader } from "../lib/http/cors.js";
import { checkRateLimit, setRateLimitHeaders } from "../lib/http/rateLimit.js";
import { runIdempotent, validateIdempotencyKey } from "../lib/http/idempotency.js";
import { normalizeCourseSignup } from "../lib/course/normalizeCourseSignup.js";
import { deliverCourseSignup } from "../lib/course/goHighLevel.js";
const MAX_BODY_BYTES = 4096;
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") {
    if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      error.code = "payload_too_large";
      throw error;
    }
    return req.body;
  }
  if (typeof req.body !== "string") return {};
  if (Buffer.byteLength(req.body, "utf8") > MAX_BODY_BYTES) {
    const error = new Error("Request body is too large");
    error.statusCode = 413;
    error.code = "payload_too_large";
    throw error;
  }
  return JSON.parse(req.body);
}

export function createCourseSignupHandler(options = {}) {
return async function handler(req, res) {
  const originAllowed = applyCors(req, res, { methods: ["POST", "OPTIONS"] });
  if (!originAllowed) {
    return sendJson(res, 403, { ok: false, code: "origin_not_allowed" });
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed" });
  }
  if (!String(getRequestHeader(req, "content-type")).toLowerCase().includes("application/json")) {
    return sendJson(res, 415, { ok: false, code: "json_required" });
  }

  const limit = checkRateLimit(req, "course-signup");
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) {
    return sendJson(res, 429, { ok: false, code: "rate_limited" });
  }

  try {
    const submission = normalizeCourseSignup(parseBody(req));
    const idempotencyKey = validateIdempotencyKey(getRequestHeader(req, "idempotency-key"));
    const result = await runIdempotent(
      idempotencyKey,
      createHash("sha256").update("course-signup:" + JSON.stringify(submission)).digest("hex"),
      () => deliverCourseSignup(submission, options)
    );
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    return sendJson(res, result.result.statusCode, result.result.payload);
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    const code = error.code || (statusCode === 400 ? "invalid_request" : "internal_error");
    return sendJson(res, statusCode, {ok: false, code, message: "Your request could not be saved. Please try again."});
  }
};
}
export default createCourseSignupHandler();
