import { createHash } from "node:crypto";
import { applyCors, getRequestHeader } from "./cors.js";
import { checkRateLimit, setRateLimitHeaders } from "./rateLimit.js";
import { runIdempotent, validateIdempotencyKey } from "./idempotency.js";
import { parseJsonBody, sendJson } from "./json.js";

function acceptsJson(req) {
  return String(getRequestHeader(req, "content-type") || "").toLowerCase().includes("application/json");
}

function rejectUnlessPublicPost(req, res) {
  if (!applyCors(req, res, { methods: ["POST", "OPTIONS"] })) {
    sendJson(res, 403, { ok: false, code: "origin_not_allowed" });
    return false;
  }

  switch (req.method) {
    case "OPTIONS":
      res.statusCode = 204;
      res.end();
      return false;
    case "POST":
      break;
    default:
      res.setHeader("Allow", "POST, OPTIONS");
      sendJson(res, 405, { ok: false, code: "method_not_allowed" });
      return false;
  }

  if (!acceptsJson(req)) {
    sendJson(res, 415, { ok: false, code: "json_required" });
    return false;
  }
  return true;
}

function failClosed(res, error, errorEvent) {
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

export async function handlePublicJsonPost(req, res, {
  scope,
  normalize,
  fingerprintFields,
  deliver,
  errorEvent,
  maxBodyBytes = 16 * 1024,
}) {
  if (!rejectUnlessPublicPost(req, res)) return;

  const limit = checkRateLimit(req, scope);
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) {
    return sendJson(res, 429, { ok: false, code: "rate_limited" });
  }

  try {
    const submission = normalize(parseJsonBody(req, maxBodyBytes));
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(fingerprintFields(submission)))
      .digest("hex");
    const result = await runIdempotent(
      validateIdempotencyKey(getRequestHeader(req, "idempotency-key")),
      fingerprint,
      () => deliver(submission)
    );
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    return sendJson(res, result.result.statusCode, result.result.payload);
  } catch (error) {
    return failClosed(res, error, errorEvent);
  }
}
