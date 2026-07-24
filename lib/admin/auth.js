import { createHmac, timingSafeEqual } from "node:crypto";
import { getRequestHeader } from "../http/cors.js";

export const ADMIN_COOKIE_NAME = "fsai_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

function requiredSecret(name, minimumLength) {
  const value = String(process.env[name] || "");
  if (value.length < minimumLength) {
    const error = new Error(`${name} is not configured`);
    error.code = "admin_not_configured";
    error.statusCode = 503;
    throw error;
  }
  return value;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function verifyAdminPassword(password) {
  const expected = requiredSecret("FIRSTSTEP_ADMIN_PASSWORD", 12);
  return constantTimeEqual(password, expected);
}

export function createAdminSessionToken(now = Date.now()) {
  const secret = requiredSecret("FIRSTSTEP_ADMIN_SESSION_SECRET", 32);
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    issued_at: issuedAt,
    expires_at: issuedAt + ADMIN_SESSION_TTL_SECONDS,
  })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminSessionToken(token, now = Date.now()) {
  try {
    const secret = requiredSecret("FIRSTSTEP_ADMIN_SESSION_SECRET", 32);
    const [payload, signature, extra] = String(token || "").split(".");
    if (!payload || !signature || extra) return false;
    if (!constantTimeEqual(signature, sign(payload, secret))) return false;

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const currentTime = Math.floor(now / 1000);
    return parsed.version === 1
      && Number.isInteger(parsed.issued_at)
      && Number.isInteger(parsed.expires_at)
      && parsed.issued_at <= currentTime + 60
      && parsed.expires_at > currentTime;
  } catch {
    return false;
  }
}

export function parseCookies(req) {
  return String(getRequestHeader(req, "cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return cookies;
      cookies[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
      return cookies;
    }, {});
}

export function isAdminAuthenticated(req) {
  return verifyAdminSessionToken(parseCookies(req)[ADMIN_COOKIE_NAME]);
}

export function createAdminCookie(token, production = process.env.NODE_ENV === "production") {
  return [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict",
    production ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function clearAdminCookie(production = process.env.NODE_ENV === "production") {
  return [
    `${ADMIN_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Strict",
    production ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function isSameOriginRequest(req) {
  const origin = String(getRequestHeader(req, "origin") || "");
  const host = String(getRequestHeader(req, "x-forwarded-host") || getRequestHeader(req, "host") || "");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
