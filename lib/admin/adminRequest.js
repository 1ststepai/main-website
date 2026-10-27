import { isAdminAuthenticated, isSameOriginRequest } from "./auth.js";

export function sendAdminJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(payload));
}

export function parseAdminJson(req, maxBytes, tooLargeMessage = "Request body is too large") {
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    const error = new Error(tooLargeMessage);
    error.code = "payload_too_large";
    error.statusCode = 413;
    throw error;
  }
  return typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(raw);
}

export function requireAdminIdentifier(value, name, maximum = 180) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maximum || !/^[a-zA-Z0-9_/:.-]+$/.test(normalized)) {
    const error = new Error(`Invalid ${name}`);
    error.code = `invalid_${name}`;
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

export function guardAdminJsonPost(req, res, { method = "POST", allow = "POST" } = {}) {
  if (!isAdminAuthenticated(req)) {
    sendAdminJson(res, 401, { ok: false, code: "unauthorized" });
    return false;
  }
  if (req.method !== method) {
    res.setHeader("Allow", allow);
    sendAdminJson(res, 405, { ok: false, code: "method_not_allowed" });
    return false;
  }
  if (!isSameOriginRequest(req)) {
    sendAdminJson(res, 403, { ok: false, code: "origin_not_allowed" });
    return false;
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    sendAdminJson(res, 415, { ok: false, code: "json_required" });
    return false;
  }
  return true;
}

export function sendAdminFailure(res, error, unavailableMessage, event = "") {
  const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
  if (event && statusCode >= 500) {
    console.error(JSON.stringify({
      event,
      code: error.code || "internal_error",
    }));
  }
  return sendAdminJson(res, statusCode, {
    ok: false,
    code: error.code || (statusCode === 400 ? "invalid_request" : "internal_error"),
    message: statusCode >= 500 ? unavailableMessage : error.message,
  });
}
