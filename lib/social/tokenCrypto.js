import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { socialError } from "./errors.js";

// Dedicated social credential key. This module must not read the studio
// workspace key, Stripe keys, or any payment environment variable.
const ENVELOPE_PREFIX = "social_enc_v1";
const KEY_ENV = "SOCIAL_TOKEN_ENC_KEY";

function encryptionKey() {
  const normalized = String(process.env[KEY_ENV] || "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
    throw socialError(503, "social_not_configured", `${KEY_ENV} must be a 64-character hexadecimal key`);
  }
  return Buffer.from(normalized, "hex");
}

function associatedData(purpose) {
  if (!/^[a-z0-9:_-]{3,80}$/.test(purpose)) {
    throw socialError(500, "protected_data_invalid", "Social encryption purpose is invalid.");
  }
  return Buffer.from(`1ststep.ai:social:${purpose}:${ENVELOPE_PREFIX}`, "utf8");
}

export function encryptSocialJson(value, purpose) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(associatedData(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSocialJson(envelope, purpose) {
  const [prefix, encodedIv, encodedTag, encodedCiphertext, extra] = String(envelope || "").split(".");
  if (prefix !== ENVELOPE_PREFIX || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw socialError(503, "protected_data_invalid", "Stored social credentials could not be decrypted.");
  }
  let iv;
  let tag;
  let ciphertext;
  try {
    iv = Buffer.from(encodedIv, "base64url");
    tag = Buffer.from(encodedTag, "base64url");
    ciphertext = Buffer.from(encodedCiphertext, "base64url");
  } catch {
    throw socialError(503, "protected_data_invalid", "Stored social credentials could not be decrypted.");
  }
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) {
    throw socialError(503, "protected_data_invalid", "Stored social credentials could not be decrypted.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(associatedData(purpose));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch (error) {
    if (error.statusCode) throw error;
    throw socialError(503, "protected_data_invalid", "Stored social credentials could not be decrypted.");
  }
}

export function signSocialState(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", encryptionKey()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySocialState(token) {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra) {
    throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  }
  const expected = createHmac("sha256", encryptionKey()).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw socialError(400, "invalid_state", "The connection attempt is not valid.");
  }
}
