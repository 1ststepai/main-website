import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { getRequestHeader } from "../http/cors.js";

export const ADMIN_COOKIE_NAME = "fsai_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 2 * 60 * 60;

const PASSWORD_HASH_PREFIX = "scrypt_v1";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

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

function booleanSetting(name, productionDefault) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return process.env.NODE_ENV === "production" ? productionDefault : false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const error = new Error(`${name} must be true or false`);
  error.code = "admin_not_configured";
  error.statusCode = 503;
  throw error;
}

function normalizedPassword(password) {
  const value = String(password || "");
  if (value.length < 12 || value.length > 256) return "";
  return value;
}

export function hashAdminPassword(password, salt = randomBytes(16)) {
  const normalized = normalizedPassword(password);
  if (!normalized) {
    throw new Error("Admin password must contain 12 to 256 characters");
  }
  const saltBuffer = Buffer.from(salt);
  if (saltBuffer.length !== 16) throw new Error("Admin password salt must contain 16 bytes");
  const derived = scryptSync(normalized, saltBuffer, 32, SCRYPT_OPTIONS);
  return [
    PASSWORD_HASH_PREFIX,
    saltBuffer.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

function verifyPasswordHash(password, encodedHash) {
  const [prefix, encodedSalt, encodedDerived, extra] = String(encodedHash || "").split("$");
  if (prefix !== PASSWORD_HASH_PREFIX || !encodedSalt || !encodedDerived || extra) {
    const error = new Error("FIRSTSTEP_ADMIN_PASSWORD_HASH is invalid");
    error.code = "admin_not_configured";
    error.statusCode = 503;
    throw error;
  }
  const salt = Buffer.from(encodedSalt, "base64url");
  const expected = Buffer.from(encodedDerived, "base64url");
  if (salt.length !== 16 || expected.length !== 32) {
    const error = new Error("FIRSTSTEP_ADMIN_PASSWORD_HASH is invalid");
    error.code = "admin_not_configured";
    error.statusCode = 503;
    throw error;
  }
  const candidate = scryptSync(normalizedPassword(password), salt, 32, SCRYPT_OPTIONS);
  return constantTimeEqual(candidate, expected);
}

export function verifyAdminPassword(password) {
  const encodedHash = String(process.env.FIRSTSTEP_ADMIN_PASSWORD_HASH || "").trim();
  if (encodedHash) return verifyPasswordHash(password, encodedHash);
  if (booleanSetting("FIRSTSTEP_ADMIN_REQUIRE_PASSWORD_HASH", true)) {
    requiredSecret("FIRSTSTEP_ADMIN_PASSWORD_HASH", 20);
  }
  const expected = requiredSecret("FIRSTSTEP_ADMIN_PASSWORD", 12);
  return constantTimeEqual(normalizedPassword(password), expected);
}

function decodeBase32(value) {
  const normalized = String(value || "").toUpperCase().replace(/[\s=-]/g, "");
  if (normalized.length < 32 || [...normalized].some((character) => !BASE32_ALPHABET.includes(character))) {
    const error = new Error("FIRSTSTEP_ADMIN_TOTP_SECRET is invalid");
    error.code = "admin_not_configured";
    error.statusCode = 503;
    throw error;
  }
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

export function isAdminMfaRequired() {
  const configured = Boolean(String(process.env.FIRSTSTEP_ADMIN_TOTP_SECRET || "").trim());
  const required = configured || booleanSetting("FIRSTSTEP_ADMIN_REQUIRE_MFA", true);
  if (required) decodeBase32(requiredSecret("FIRSTSTEP_ADMIN_TOTP_SECRET", 32));
  return required;
}

function totpAt(secret, counter) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, "0");
}

export function verifyAdminTotp(code, now = Date.now()) {
  if (!isAdminMfaRequired()) return true;
  const candidate = String(code || "").trim();
  if (!/^\d{6}$/.test(candidate)) return false;
  const secret = decodeBase32(process.env.FIRSTSTEP_ADMIN_TOTP_SECRET);
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  return [-1, 0, 1].some((offset) => constantTimeEqual(candidate, totpAt(secret, counter + offset)));
}

export function isMobileAdminTotpLoginAllowed(req) {
  if (!booleanSetting("FIRSTSTEP_ADMIN_MOBILE_TOTP_LOGIN", true)) return false;
  if (!isAdminMfaRequired()) return false;
  const userAgent = String(getRequestHeader(req, "user-agent") || "");
  return /\b(Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini)\b/i.test(userAgent);
}

export function createAdminSessionToken(now = Date.now()) {
  const secret = requiredSecret("FIRSTSTEP_ADMIN_SESSION_SECRET", 32);
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    audience: "firststep-admin",
    nonce: randomBytes(16).toString("base64url"),
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
      && parsed.audience === "firststep-admin"
      && typeof parsed.nonce === "string"
      && /^[a-zA-Z0-9_-]{22}$/.test(parsed.nonce)
      && Number.isInteger(parsed.issued_at)
      && Number.isInteger(parsed.expires_at)
      && parsed.issued_at <= currentTime + 60
      && parsed.expires_at - parsed.issued_at === ADMIN_SESSION_TTL_SECONDS
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
    "Priority=High",
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
