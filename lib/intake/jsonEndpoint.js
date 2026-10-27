import { createHash } from "node:crypto";
import { applyCors, getRequestHeader } from "../http/cors.js";
import { checkRateLimit, setRateLimitHeaders } from "../http/rateLimit.js";
import { runIdempotent, validateIdempotencyKey } from "../http/idempotency.js";

const GENERIC_FAILURE = "Something went wrong. Please try again.";

export function sendPublicJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export function parsePublicJson(req, maxBodyBytes) {
  if (req.body && typeof req.body === "object") {
    if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > maxBodyBytes) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      error.code = "payload_too_large";
      throw error;
    }
    return req.body;
  }
  if (typeof req.body !== "string") return {};
  if (Buffer.byteLength(req.body, "utf8") > maxBodyBytes) {
    const error = new Error("Request body is too large");
    error.statusCode = 413;
    error.code = "payload_too_large";
    throw error;
  }
  return JSON.parse(req.body);
}

export function hashSubmission(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function deliverIntakeEmail({
  send,
  submission,
  failedEvent,
  failedMessage,
  deliveredEvent,
  logFields,
}) {
  const email = await send();
  if (!email.delivered) {
    console.error(JSON.stringify({
      event: failedEvent,
      request_id: submission.request_id,
      reason: email.reason || "unknown",
    }));
    return {
      statusCode: 503,
      payload: {
        ok: false,
        code: "delivery_unavailable",
        message: failedMessage,
      },
    };
  }

  console.log(JSON.stringify({
    event: deliveredEvent,
    request_id: submission.request_id,
    provider: email.provider,
    ...(logFields || {}),
  }));
  return {
    statusCode: 201,
    payload: { ok: true, request_id: submission.request_id },
  };
}

export function createJsonIntakeHandler({
  corsMethods = ["POST", "OPTIONS"],
  allowHeader = "POST, OPTIONS",
  maxBodyBytes,
  rateLimitScope,
  rateLimitedPayload = { ok: false, code: "rate_limited" },
  readOnly,
  guardPost,
  normalize,
  fingerprint,
  deliver,
  errorEvent,
}) {
  return async function handler(req, res) {
    const originAllowed = applyCors(req, res, { methods: corsMethods });
    if (!originAllowed) {
      return sendPublicJson(res, 403, { ok: false, code: "origin_not_allowed" });
    }
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    if (readOnly && readOnly(req, res, sendPublicJson)) return;
    if (req.method !== "POST") {
      res.setHeader("Allow", allowHeader);
      return sendPublicJson(res, 405, { ok: false, code: "method_not_allowed" });
    }
    if (guardPost && guardPost(req, res, sendPublicJson)) return;
    if (!String(getRequestHeader(req, "content-type")).toLowerCase().includes("application/json")) {
      return sendPublicJson(res, 415, { ok: false, code: "json_required" });
    }

    const limit = checkRateLimit(req, rateLimitScope);
    setRateLimitHeaders(res, limit);
    if (!limit.allowed) return sendPublicJson(res, 429, rateLimitedPayload);

    try {
      const submission = normalize(parsePublicJson(req, maxBodyBytes));
      const idempotencyKey = validateIdempotencyKey(getRequestHeader(req, "idempotency-key"));
      const result = await runIdempotent(
        idempotencyKey,
        fingerprint(submission),
        () => deliver(submission)
      );
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      return sendPublicJson(res, result.result.statusCode, result.result.payload);
    } catch (error) {
      const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
      const code = error.code || (statusCode === 400 ? "invalid_request" : "internal_error");
      if (statusCode >= 500) console.error(JSON.stringify({ event: errorEvent, code }));
      return sendPublicJson(res, statusCode, {
        ok: false,
        code,
        message: statusCode === 500 ? GENERIC_FAILURE : error.message,
        ...(error.errors ? { errors: error.errors } : {}),
      });
    }
  };
}
