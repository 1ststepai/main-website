import { createHash } from "node:crypto";
import { applyCors, getRequestHeader } from "../lib/http/cors.js";
import { checkRateLimit, setRateLimitHeaders } from "../lib/http/rateLimit.js";
import { runIdempotent, validateIdempotencyKey } from "../lib/http/idempotency.js";
import { normalizeCommercialIntake } from "../lib/commercialIntake/normalizeCommercialIntake.js";
import { sendCommercialIntakeEmail } from "../lib/commercialIntake/sendCommercialIntakeEmail.js";

const MAX_BODY_BYTES = 24 * 1024;

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
  const { request_id: _requestId, created_at: _createdAt, ...stable } = submission;
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

async function deliver(submission) {
  const email = await sendCommercialIntakeEmail({ submission });
  if (!email.accepted) {
    console.error(JSON.stringify({
      event: "commercial_intake_delivery_failed",
      request_id: submission.request_id,
      reason: email.reason || "unknown",
      preview: process.env.VERCEL_ENV === "preview",
    }));
    return {
      statusCode: 503,
      payload: {
        ok: false,
        code: "delivery_unavailable",
        message: "Your request could not be sent. Your answers are still on this page; please try again or use the email option.",
      },
    };
  }

  console.log(JSON.stringify({
    event: "commercial_intake_accepted",
    request_id: submission.request_id,
    provider: email.provider,
    intent: submission.intent,
    preview: Boolean(email.preview),
  }));
  return {
    statusCode: 201,
    payload: {
      ok: true,
      accepted: true,
      request_id: submission.request_id,
      message: "Your request was sent successfully.",
    },
  };
}

export default async function handler(req, res) {
  const originAllowed = applyCors(req, res, { methods: ["POST", "OPTIONS"] });
  if (!originAllowed) return sendJson(res, 403, { ok: false, code: "origin_not_allowed" });
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

  const limit = checkRateLimit(req, "commercial-intake");
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) return sendJson(res, 429, { ok: false, code: "rate_limited", message: "Please wait before trying again." });

  try {
    const submission = normalizeCommercialIntake(parseBody(req));
    const idempotencyKey = validateIdempotencyKey(getRequestHeader(req, "idempotency-key"));
    const result = await runIdempotent(idempotencyKey, fingerprint(submission), () => deliver(submission));
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    return sendJson(res, result.result.statusCode, result.result.payload);
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    const code = error.code || (statusCode === 400 ? "invalid_request" : "internal_error");
    if (statusCode >= 500) console.error(JSON.stringify({ event: "commercial_intake_error", code }));
    return sendJson(res, statusCode, {
      ok: false,
      code,
      message: statusCode === 500 ? "Something went wrong. Please try again." : error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }
}
