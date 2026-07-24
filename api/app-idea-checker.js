import { createHash, randomUUID } from "node:crypto";
import { generateMarkdownPack } from "../lib/appIdeaChecker/generateMarkdownPack.js";
import { forwardLead, REPO_CREATION_STATUS } from "../lib/appIdeaChecker/forwardLead.js";
import { normalizeLead } from "../lib/appIdeaChecker/normalizeLead.js";
import { sendAdminReportEmail } from "../lib/appIdeaChecker/sendReportEmail.js";
import { saveReportIntake } from "../lib/appIdeaChecker/storageAdapter.js";
import { applyCors, getRequestHeader } from "../lib/http/cors.js";
import { runIdempotent, validateIdempotencyKey } from "../lib/http/idempotency.js";
import { checkRateLimit, setRateLimitHeaders } from "../lib/http/rateLimit.js";

const MAX_PAYLOAD_BYTES = 100 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Cache-Control", "no-store");
  if (statusCode === 204) {
    return res.end();
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      const parseError = new Error("Request body must be valid JSON");
      parseError.statusCode = 400;
      parseError.code = "invalid_json";
      throw parseError;
    }
  }
  return req.body;
}

function payloadTooLarge(req, payload) {
  const contentLength = Number(getRequestHeader(req, "content-length") || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return true;
  }

  try {
    return Buffer.byteLength(JSON.stringify(payload || {}), "utf8") > MAX_PAYLOAD_BYTES;
  } catch (error) {
    return true;
  }
}

function generatedFileList(files, projectSlug) {
  const prefix = `generated-projects/${projectSlug}/`;
  return files.map((file) => file.path.replace(prefix, ""));
}

function contentTypeIsJson(req) {
  const contentType = getRequestHeader(req, "content-type").toLowerCase();
  return contentType === "application/json" || contentType.startsWith("application/json;");
}

function forwardingDelivered(forwarding) {
  return Object.values(forwarding || {}).some((result) => result && typeof result === "object" && result.status === "sent");
}

function logFailure(requestId, statusCode, code) {
  const message = JSON.stringify({
    event: "app_idea_checker_request_failed",
    request_id: requestId,
    status_code: statusCode,
    error_code: code
  });
  if (statusCode >= 500) {
    console.error(message);
  } else {
    console.warn(message);
  }
}

async function processSubmission(payload, requestId) {
  const lead = normalizeLead(payload);
  const files = generateMarkdownPack(lead);
  const generatedFiles = generatedFileList(files, lead.project_slug);
  const storage = await saveReportIntake({ lead, files });
  const contextPackStatus = "generated";
  const [forwarding, adminEmail] = await Promise.all([
    forwardLead({
      lead,
      contextPackStatus,
      generatedFiles
    }),
    sendAdminReportEmail({ lead, contextPackStatus, generatedFiles })
  ]);

  const delivery = {
    persisted: storage.persisted === true,
    admin_notified: adminEmail.status === "sent",
    forwarded: forwardingDelivered(forwarding)
  };

  if (!delivery.persisted && !delivery.admin_notified && !delivery.forwarded) {
    return {
      statusCode: 503,
      payload: {
        ok: false,
        code: "intake_unavailable",
        error: "We could not safely save your report right now. Please try again or use the booking link.",
        request_id: requestId,
        repo_creation_status: REPO_CREATION_STATUS
      }
    };
  }

  return {
    statusCode: 200,
    payload: {
      ok: true,
      request_id: requestId,
      lead_id: lead.lead_id,
      project_slug: lead.project_slug,
      score: lead.score,
      category: lead.category,
      lead_quality: lead.lead_quality,
      recommended_path: lead.recommended_path,
      tags: lead.tags,
      context_pack_status: contextPackStatus,
      generated_files: generatedFiles,
      generated_file_manifest: storage.generated_files,
      storage: {
        mode: storage.mode,
        persisted: storage.persisted,
        retention_seconds: storage.retention_seconds
      },
      delivery,
      forwarding,
      notifications: {
        admin_email: adminEmail
      },
      repo_creation_status: REPO_CREATION_STATUS
    }
  };
}

export default async function handler(req, res) {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);

  if (!applyCors(req, res, { methods: ["POST", "OPTIONS"] })) {
    logFailure(requestId, 403, "origin_not_allowed");
    return sendJson(res, 403, {
      ok: false,
      code: "origin_not_allowed",
      error: "Origin not allowed",
      request_id: requestId
    });
  }

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      code: "method_not_allowed",
      error: "Method not allowed",
      request_id: requestId
    });
  }

  try {
    if (!contentTypeIsJson(req)) {
      const error = new Error("Content-Type must be application/json");
      error.statusCode = 415;
      error.code = "unsupported_media_type";
      throw error;
    }

    const rateLimit = checkRateLimit(req, "app-idea-checker");
    setRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      const error = new Error("Too many requests. Please wait before trying again.");
      error.statusCode = 429;
      error.code = "rate_limited";
      throw error;
    }

    const payload = parseBody(req);
    if (payloadTooLarge(req, payload)) {
      const error = new Error("Payload too large");
      error.statusCode = 413;
      error.code = "payload_too_large";
      throw error;
    }

    const idempotencyKey = validateIdempotencyKey(getRequestHeader(req, "idempotency-key"));
    const payloadFingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const { replayed, result } = await runIdempotent(
      idempotencyKey,
      payloadFingerprint,
      () => processSubmission(payload, requestId)
    );
    if (replayed) {
      res.setHeader("Idempotency-Replayed", "true");
    }
    if (result.statusCode >= 500) {
      logFailure(requestId, result.statusCode, result.payload.code || "intake_failed");
    }
    return sendJson(res, result.statusCode, result.payload);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const code = error.code || (statusCode === 500 ? "internal_error" : "invalid_request");
    logFailure(requestId, statusCode, code);
    return sendJson(res, statusCode, {
      ok: false,
      code,
      error: statusCode === 500 ? "Internal server error" : error.message,
      issues: error.errors || undefined,
      request_id: requestId
    });
  }
}
