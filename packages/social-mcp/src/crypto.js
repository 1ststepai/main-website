import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mcpError } from "./errors.js";
import { paths } from "./home.js";

const ENVELOPE_PREFIX = "smcp_enc_v1";

export function loadOrCreateKey(homePaths = paths(), env = process.env) {
  const fromEnv = String(env.SOCIAL_MCP_ENC_KEY || "").trim();
  if (/^[a-fA-F0-9]{64}$/.test(fromEnv)) {
    return Buffer.from(fromEnv, "hex");
  }
  if (existsSync(homePaths.keyFile)) {
    const raw = readFileSync(homePaths.keyFile, "utf8").trim();
    if (!/^[a-fA-F0-9]{64}$/.test(raw)) {
      throw mcpError("vault_key_invalid", "master.key must be 64 hex characters.", 503);
    }
    return Buffer.from(raw, "hex");
  }
  const key = randomBytes(32);
  writeFileSync(homePaths.keyFile, `${key.toString("hex")}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(homePaths.keyFile, 0o600);
  } catch {
    // ignore
  }
  return key;
}

function aad(purpose) {
  if (!/^[a-z0-9:_-]{3,80}$/.test(purpose)) {
    throw mcpError("vault_purpose_invalid", "Encryption purpose is invalid.", 500);
  }
  return Buffer.from(`social-mcp:${purpose}:${ENVELOPE_PREFIX}`, "utf8");
}

export function encryptJson(value, purpose, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(purpose));
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

export function decryptJson(envelope, purpose, key) {
  const [prefix, encodedIv, encodedTag, encodedCiphertext, extra] = String(envelope || "").split(".");
  if (prefix !== ENVELOPE_PREFIX || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw mcpError("vault_decrypt_failed", "Stored credentials could not be decrypted.", 503);
  }
  let iv;
  let tag;
  let ciphertext;
  try {
    iv = Buffer.from(encodedIv, "base64url");
    tag = Buffer.from(encodedTag, "base64url");
    ciphertext = Buffer.from(encodedCiphertext, "base64url");
  } catch {
    throw mcpError("vault_decrypt_failed", "Stored credentials could not be decrypted.", 503);
  }
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) {
    throw mcpError("vault_decrypt_failed", "Stored credentials could not be decrypted.", 503);
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(purpose));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch (error) {
    if (error.code) throw error;
    throw mcpError("vault_decrypt_failed", "Stored credentials could not be decrypted.", 503);
  }
}

export function signState(payload, key) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyState(token, key) {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra) {
    throw mcpError("invalid_state", "The connection attempt is not valid.");
  }
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw mcpError("invalid_state", "The connection attempt is not valid.");
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw mcpError("invalid_state", "The connection attempt is not valid.");
  }
}
