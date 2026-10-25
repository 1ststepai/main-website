import { createHash } from "node:crypto";
import { isAdminAuthenticated, isSameOriginRequest } from "../admin/auth.js";
import { getRequestHeader } from "../http/cors.js";
import { socialError } from "./errors.js";
import { checkSocialRateLimit, setSocialRateHeaders } from "./rateLimit.js";
import { authenticateAgentToken } from "./service.js";

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, noarchive");
  res.end(JSON.stringify(payload));
}

export async function runSocial(res, fn) {
  try {
    await fn();
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    const expose = error.expose === true || (error instanceof SyntaxError);
    sendJson(res, statusCode, {
      ok: false,
      code: error.code || (statusCode === 400 ? "invalid_request" : "internal_error"),
      message: expose ? error.message : "Social posting is unavailable.",
    });
  }
}

export function readJsonBody(req, maxBytes = 64 * 1024) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    const raw = JSON.stringify(req.body);
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      throw socialError(413, "payload_too_large", "Request body is too large.");
    }
    return req.body;
  }
  const raw = typeof req.body === "string" ? req.body : "";
  if (!raw) return {};
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw socialError(413, "payload_too_large", "Request body is too large.");
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw socialError(400, "invalid_request", "JSON object required.");
  }
  return parsed;
}

export function requestQuery(req) {
  const params = new URL(req.url || "/", "https://1ststep.ai").searchParams;
  const query = req.query || {};
  return {
    get(name) {
      if (query[name] != null && query[name] !== "") {
        return String(Array.isArray(query[name]) ? query[name][0] : query[name]);
      }
      return params.get(name);
    },
  };
}

function bucketKey(req, scope) {
  const authorization = getRequestHeader(req, "authorization") || "";
  const cookie = getRequestHeader(req, "cookie") || "";
  const ip = getRequestHeader(req, "x-forwarded-for") || getRequestHeader(req, "x-real-ip") || "unknown";
  return createHash("sha256").update(`${scope}|${authorization}|${cookie}|${ip}`).digest("hex");
}

export function enforceRateLimit(req, res, scope, max) {
  const result = checkSocialRateLimit(`${scope}:${bucketKey(req, scope)}`, max);
  setSocialRateHeaders(res, result);
  if (!result.allowed) throw socialError(429, "rate_limited", "Too many requests. Wait and try again.");
}

export function assertOwner(req, { write = false } = {}) {
  if (!isAdminAuthenticated(req)) throw socialError(401, "unauthorized", "Owner sign-in is required.");
  if (!write) return;
  if (!isSameOriginRequest(req)) throw socialError(403, "origin_not_allowed", "Open the studio on this site and try again.");
  const type = String(getRequestHeader(req, "content-type") || "").toLowerCase();
  if (!type.includes("application/json")) throw socialError(415, "json_required", "JSON is required.");
}

export async function assertAgent(req) {
  const header = getRequestHeader(req, "authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw socialError(401, "unauthorized", "A brand token is required.");
  return authenticateAgentToken(match[1]);
}

export function requireJson(req) {
  const type = String(getRequestHeader(req, "content-type") || "").toLowerCase();
  if (!type.includes("application/json")) throw socialError(415, "json_required", "JSON is required.");
}
