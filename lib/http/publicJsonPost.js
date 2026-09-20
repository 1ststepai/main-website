import { createHash } from "node:crypto";
import { applyCors, getRequestHeader } from "./cors.js";
import { checkRateLimit, setRateLimitHeaders } from "./rateLimit.js";
import { runIdempotent, validateIdempotencyKey } from "./idempotency.js";
import { parseJsonBody, sendJson } from "./json.js";

export async function handlePublicJsonPost(req, res, {
  scope,
  normalize,
  fingerprintFields,
  deliver,
  errorEvent,
  maxBodyBytes = 16 * 1024,
}) {
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

  const limit = checkRateLimit(req, scope);
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) {
    return sendJson(res, 429, { ok: false, code: "rate_limited" });
  }

  try {
    const submission = normalize(parseJsonBody(req, maxBodyBytes));
    const idempotencyKey = validateIdempotencyKey(getRequestHeader(req, "idempotency-key"));
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(fingerprintFields(submission)))
      .digest("hex");
    const result = await runIdempotent(idempotencyKey, fingerprint, () => deliver(submission));
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    return sendJson(res, result.result.statusCode, result.result.payload);
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    const code = error.code || (statusCode === 400 ? "invalid_request" : "internal_error");
    if (statusCode >= 500) {
      console.error(JSON.stringify({ event: errorEvent, code }));
    }
    return sendJson(res, statusCode, {
      ok: false,
      code,
      message: statusCode === 500 ? "Something went wrong. Please try again." : error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }
}
