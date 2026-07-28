import { createHash } from "node:crypto";
import { applyCors, getRequestHeader } from "../lib/http/cors.js";
import { runIdempotent, validateIdempotencyKey } from "../lib/http/idempotency.js";
import { checkRateLimit, setRateLimitHeaders } from "../lib/http/rateLimit.js";
import { normalizeMorrisCountyOffer } from "../lib/morrisOffer/normalizeMorrisCountyOffer.js";
import { sendMorrisCountyOfferEmail } from "../lib/morrisOffer/sendMorrisCountyOfferEmail.js";

const MAX_BODY_BYTES = 20 * 1024;
const OFFER_CAPACITY = 10;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function offerIsOpen() {
  return !["false", "0", "closed"].includes(
    String(process.env.MORRIS_COUNTY_OFFER_OPEN || "true").trim().toLowerCase()
  );
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
      contact_name: submission.contact_name,
      business_name: submission.business_name,
      email: submission.email,
      town: submission.town,
      website_url: submission.website_url,
      project_goal: submission.project_goal,
      marketing_opt_in: submission.marketing_opt_in,
    }))
    .digest("hex");
}

async function deliver(submission) {
  const email = await sendMorrisCountyOfferEmail({ submission });
  if (!email.delivered) {
    console.error(JSON.stringify({
      event: "morris_county_offer_delivery_failed",
      request_id: submission.request_id,
      reason: email.reason || "unknown",
    }));
    return {
      statusCode: 503,
      payload: {
        ok: false,
        code: "delivery_unavailable",
        message: "Your application could not be delivered. Please try again shortly.",
      },
    };
  }

  console.log(JSON.stringify({
    event: "morris_county_offer_delivered",
    request_id: submission.request_id,
    provider: email.provider,
  }));
  return {
    statusCode: 201,
    payload: { ok: true, request_id: submission.request_id },
  };
}

export default async function handler(req, res) {
  const originAllowed = applyCors(req, res, { methods: ["GET", "POST", "OPTIONS"] });
  if (!originAllowed) {
    return sendJson(res, 403, { ok: false, code: "origin_not_allowed" });
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      open: offerIsOpen(),
      capacity: OFFER_CAPACITY,
    });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed" });
  }
  if (!offerIsOpen()) {
    return sendJson(res, 410, {
      ok: false,
      code: "offer_closed",
      message: "Applications for this offer are currently closed.",
    });
  }
  if (!String(getRequestHeader(req, "content-type")).toLowerCase().includes("application/json")) {
    return sendJson(res, 415, { ok: false, code: "json_required" });
  }

  const limit = checkRateLimit(req, "morris-county-offer");
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) {
    return sendJson(res, 429, { ok: false, code: "rate_limited" });
  }

  try {
    const submission = normalizeMorrisCountyOffer(parseBody(req));
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
      console.error(JSON.stringify({ event: "morris_county_offer_error", code }));
    }
    return sendJson(res, statusCode, {
      ok: false,
      code,
      message: statusCode === 500 ? "Something went wrong. Please try again." : error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }
}
