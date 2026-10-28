import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mcpError } from "../errors.js";

function authPath(homePaths) {
  return homePaths.ownerAuth || path.join(homePaths.root, "owner-auth.json");
}

function pinPath(homePaths) {
  return homePathFile(homePaths);
}

function pinPathFile(homePaths) {
  return homePaths.ownerPinFile || path.join(homePaths.root, "owner-pin.txt");
}

function writePrivate(file, text) {
  writeFileSync(file, text, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Best effort where the platform ignores Unix modes.
  }
}

export function hashOwnerPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, 32);
  return { v: 1, salt: salt.toString("base64"), hash: hash.toString("base64") };
}

export function verifyOwnerPin(record, pin) {
  if (!record?.salt || !record?.hash || pin === undefined || pin === null || String(pin) === "") return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(record.salt, "base64");
    expected = Buffer.from(record.hash, "base64");
  } catch {
    return false;
  }
  if (salt.length < 8 || expected.length !== 32) return false;
  const actual = scryptSync(String(pin), salt, 32);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function readOwnerAuth(homePaths) {
  const file = authPath(homePaths);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw mcpError("owner_auth", "Owner PIN record could not be read.", 500);
  }
}

export function ownerPinConfigured(homePaths) {
  return Boolean(readOwnerAuth(homePaths)?.hash);
}

export function assertOwnerPin(homePaths, presented) {
  const record = readOwnerAuth(homePaths);
  if (!record) return;
  if (!verifyOwnerPin(record, presented)) {
    throw mcpError("owner_auth", "Owner PIN required.", 401);
  }
}

export function pinFromRequest(req, body = {}) {
  const header = req?.headers?.["x-postpath-owner-pin"];
  if (header) return String(header);
  if (body?.owner_pin) return String(body.owner_pin);
  return "";
}

/**
 * Store a PIN hash. When pin is omitted, generate one and write owner-pin.txt.
 * The PIN is never returned for logging. pinWritten is the file path when generated.
 */
export function initOwnerPin(homePaths, pin) {
  const file = authPath(homePaths);
  if (existsSync(file) && (pin === undefined || pin === null || pin === "")) {
    return { created: false, file, pinFile: null };
  }
  let secret = pin === undefined || pin === null ? "" : String(pin);
  let pinFile = null;
  if (!secret) {
    secret = randomBytes(9).toString("base64url");
    pinFile = pinPath(homePaths);
    writePrivate(pinFile, `${secret}\n`);
  }
  if (secret.length < 4 || secret.length > 80) {
    throw mcpError("owner_auth", "Owner PIN must be 4 to 80 characters.", 400);
  }
  writePrivate(file, `${JSON.stringify(hashOwnerPin(secret), null, 2)}\n`);
  return { created: true, file, pinFile };
}

export { pinPathFile as ownerPinFilePath };
