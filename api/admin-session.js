import {
  clearAdminCookie,
  createAdminCookie,
  createAdminSessionToken,
  isAdminAuthenticated,
  isSameOriginRequest,
  verifyAdminPassword,
} from "../lib/admin/auth.js";
import { checkRateLimit, setRateLimitHeaders } from "../lib/http/rateLimit.js";

const MAX_BODY_BYTES = 2048;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    const error = new Error("Request body is too large");
    error.statusCode = 413;
    error.code = "payload_too_large";
    throw error;
  }
  return typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(raw);
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, authenticated: isAdminAuthenticated(req) });
  }

  if (!["POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed" });
  }
  if (!isSameOriginRequest(req)) {
    return sendJson(res, 403, { ok: false, code: "origin_not_allowed" });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearAdminCookie());
    return sendJson(res, 200, { ok: true });
  }

  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    return sendJson(res, 415, { ok: false, code: "json_required" });
  }
  const limit = checkRateLimit(req, "admin-login");
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) return sendJson(res, 429, { ok: false, code: "rate_limited" });

  try {
    const { password } = parseBody(req);
    if (!verifyAdminPassword(String(password || ""))) {
      return sendJson(res, 401, { ok: false, code: "invalid_credentials" });
    }
    res.setHeader("Set-Cookie", createAdminCookie(createAdminSessionToken()));
    return sendJson(res, 200, { ok: true, authenticated: true });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || "internal_error",
      message: statusCode >= 500 ? "Admin access is not configured." : error.message,
    });
  }
}
