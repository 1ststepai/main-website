import { createHash } from "node:crypto";
import { applyCors, getRequestHeader } from "../lib/http/cors.js";
import { checkRateLimit, setRateLimitHeaders } from "../lib/http/rateLimit.js";
import { runIdempotent, validateIdempotencyKey } from "../lib/http/idempotency.js";
import { normalizeFitCheck } from "../lib/fitCheck/normalizeFitCheck.js";
import { sendFitCheckEmail } from "../lib/fitCheck/sendFitCheckEmail.js";

const MAX_BODY_BYTES = 16 * 1024;

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

function fingerprint(submission) {
  return createHash("sha256")
    .update(JSON.stringify({
      website_url: submission.website_url,
      email: submission.email,
      timeline: submission.timeline,
      budget_range: submission.budget_range,
    }))
    .digest("hex");
}

async function deliver(submission) {
  const email = await sendFitCheckEmail({ submission });
  if (!email.delivered) {
    console.error(JSON.stringify({
      event: "fit_check_delivery_failed",
      request_id: submission.request_id,
      reason: email.reason || "unknown",
    }));
    return {
      statusCode: 503,
      payload: {
        ok: false,
        code: "delivery_unavailable",
        message: "Your request could not be delivered. Please book a Website Strategy Call instead.",
      },
    };
  }

  console.log(JSON.stringify({
    event: "fit_check_delivered",
    request_id: submission.request_id,
    provider: email.provider,
  }));
  return {
    statusCode: 201,
    payload: { ok: true, request_id: submission.request_id },
  };
}

export default async function handler(req, res) {
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

  const limit = checkRateLimit(req, "fit-check");
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) {
    return sendJson(res, 429, { ok: false, code: "rate_limited" });
  }

  try {
    const submission = normalizeFitCheck(parseBody(req));
    const idempotencyKey = validateIdempotencyKey(getRequestHeader(req, "idempotency-key"));
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint(submission),
      () => deliver(submission)
    );
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    return sendJson(res, result.result.statusCode, result.result.payload);
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    const code = error.code || (statusCode === 400 ? "invalid_request" : "internal_error");
    if (statusCode >= 500) {
      console.error(JSON.stringify({ event: "fit_check_error", code }));
    }
    return sendJson(res, statusCode, {
      ok: false,
      code,
      message: statusCode === 500 ? "Something went wrong. Please try again." : error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }
}
