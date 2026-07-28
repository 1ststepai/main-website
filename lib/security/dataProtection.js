import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENVELOPE_PREFIX = "fsai_enc_v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function protectionError(message, code = "protected_data_unavailable") {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  return error;
}

function validatedPurpose(purpose) {
  const normalized = String(purpose || "");
  if (!/^[a-z0-9:_-]{3,80}$/.test(normalized)) {
    throw protectionError("Protected data purpose is invalid", "protected_data_invalid");
  }
  return normalized;
}

function parseKey(value, name) {
  const normalized = String(value || "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
    throw protectionError(`${name} must be a 64-character hexadecimal key`);
  }
  const key = Buffer.from(normalized, "hex");
  if (key.length !== KEY_BYTES) {
    throw protectionError(`${name} must decode to exactly 32 bytes`);
  }
  return key;
}

function activeKey() {
  return parseKey(
    process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY,
    "FIRSTSTEP_DATA_ENCRYPTION_KEY",
  );
}

function decryptionKeys() {
  const keys = [activeKey()];
  if (String(process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS || "").trim()) {
    keys.push(parseKey(
      process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS,
      "FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS",
    ));
  }
  return keys;
}

function associatedData(purpose) {
  return Buffer.from(`1ststep.ai:${validatedPurpose(purpose)}:${ENVELOPE_PREFIX}`, "utf8");
}

export function isProtectedEnvelope(value) {
  return typeof value === "string" && value.startsWith(`${ENVELOPE_PREFIX}.`);
}

export function encryptProtectedJson(value, purpose) {
  let plaintext;
  try {
    plaintext = Buffer.from(JSON.stringify(value), "utf8");
  } catch {
    throw protectionError("Protected data is not JSON serializable", "protected_data_invalid");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", activeKey(), iv);
  cipher.setAAD(associatedData(purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptProtectedJson(envelope, purpose) {
  const [prefix, encodedIv, encodedTag, encodedCiphertext, extra] = String(envelope || "").split(".");
  if (prefix !== ENVELOPE_PREFIX || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw protectionError("Protected data envelope is invalid", "protected_data_invalid");
  }

  let iv;
  let tag;
  let ciphertext;
  try {
    iv = Buffer.from(encodedIv, "base64url");
    tag = Buffer.from(encodedTag, "base64url");
    ciphertext = Buffer.from(encodedCiphertext, "base64url");
  } catch {
    throw protectionError("Protected data envelope is invalid", "protected_data_invalid");
  }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length < 1) {
    throw protectionError("Protected data envelope is invalid", "protected_data_invalid");
  }

  for (const key of decryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(associatedData(purpose));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plaintext.toString("utf8"));
    } catch {
      // Try the previous rotation key before failing closed.
    }
  }
  throw protectionError("Protected data could not be decrypted", "protected_data_invalid");
}
