import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { command } from "./workspaceStore.js";

const PREFIX = "firststep_admin:desktop:";
const INDEX = `${PREFIX}devices`;
const SCOPES = ["pipeline", "workspace"];
const ID = /^[a-f0-9]{32}$/;
const HASH = /^[a-f0-9]{64}$/;
export const PAIR_SECONDS = 600;
function invalid(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
export function secretHash(secret) { return createHash("sha256").update(secret).digest("hex"); }
export function parseDesktopCredential(req) {
  const match = /^StudioDevice ([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(String(req.headers?.authorization || ""));
  return match ? { id: match[1], hash: secretHash(match[2]) } : null;
}
function equalHash(a, b) { return HASH.test(a || "") && HASH.test(b || "") && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); }
async function read(id) {
  if (!ID.test(id || "")) throw invalid("Invalid pairing ID.");
  const { result } = await command(["GET", PREFIX + id]);
  if (!result) return null;
  const record = JSON.parse(result);
  if (record.id !== id || !HASH.test(record.secret_hash || "")) throw invalid("Device record is invalid.", 503);
  return { raw: result, record };
}
export async function startDesktopPair(hash, now = Date.now()) {
  if (!HASH.test(hash || "")) throw invalid("Invalid device proof.");
  const id = randomBytes(16).toString("hex");
  const record = { id, name: "Newsletter Studio on Windows", state: "pending", secret_hash: hash, verification_code: String(randomInt(100000, 1000000)), created_at: new Date(now).toISOString(), expires_at: now + PAIR_SECONDS * 1000 };
  const result = await command(["SET", PREFIX + id, JSON.stringify(record), "EX", String(PAIR_SECONDS), "NX"]);
  if (result.result !== "OK") throw invalid("Could not start pairing. Try again.", 503);
  return { id, code: record.verification_code, expires_at: record.expires_at };
}
export async function desktopPairReview(id, now = Date.now()) {
  const value = await read(id);
  if (!value || value.record.state !== "pending" || value.record.expires_at <= now) throw invalid("Pairing expired. Start again in the desktop app.", 410);
  return { id, name: value.record.name, expires_at: value.record.expires_at, scopes: SCOPES };
}
export async function approveDesktopPair(id, code, now = Date.now()) {
  const value = await read(id);
  if (!value || value.record.state !== "pending" || value.record.expires_at <= now) throw invalid("Pairing expired. Start again in the desktop app.", 410);
  if (!/^\d{6}$/.test(String(code)) || value.record.verification_code !== String(code)) throw invalid("Enter the six-digit code shown in your desktop app.");
  const record = { id, name: value.record.name, secret_hash: value.record.secret_hash, state: "active", scopes: SCOPES, created_at: value.record.created_at, paired_at: new Date(now).toISOString() };
  const result = await command(["EVAL", "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); redis.call('SADD',KEYS[2],ARGV[3]); return 1", "2", PREFIX + id, INDEX, value.raw, JSON.stringify(record), id]);
  if (result.result !== 1) throw invalid("Pairing changed or expired. Start again.", 409);
  return { id, name: record.name, paired_at: record.paired_at };
}
export async function desktopPairStatus(req, now = Date.now()) {
  const proof = parseDesktopCredential(req);
  if (!proof) throw invalid("Device proof required.", 401);
  const value = await read(proof.id);
  if (!value || !equalHash(value.record.secret_hash, proof.hash)) throw invalid("Device is disconnected. Pair this PC again.", 401);
  if (value.record.state === "pending" && value.record.expires_at <= now) throw invalid("Pairing expired. Start again.", 410);
  if (!["pending", "active"].includes(value.record.state)) throw invalid("Device is disconnected.", 401);
  return { paired: value.record.state === "active", id: proof.id, name: value.record.name };
}
export async function isDesktopAuthenticated(req, scope) {
  if (!SCOPES.includes(scope) || !parseDesktopCredential(req)) return false;
  try {
    const proof = parseDesktopCredential(req);
    const value = await read(proof.id);
    return value?.record.state === "active" && value.record.scopes?.includes(scope) && equalHash(value.record.secret_hash, proof.hash);
  } catch { return false; }
}
export async function listDesktopDevices() {
  const result = await command(["SMEMBERS", INDEX]);
  if (!Array.isArray(result.result)) throw invalid("Device list is unavailable.", 503);
  const devices = [];
  for (const id of result.result.slice(0, 50)) {
    const value = await read(id);
    if (value?.record.state === "active") devices.push({ id, name: value.record.name, paired_at: value.record.paired_at });
  }
  return devices;
}
export async function revokeDesktopDevice(id) {
  if (!ID.test(id || "")) throw invalid("Invalid device ID.");
  const result = await command(["EVAL", "redis.call('DEL',KEYS[1]); redis.call('SREM',KEYS[2],ARGV[1]); return 1", "2", PREFIX + id, INDEX, id]);
  if (result.result !== 1) throw invalid("Disconnect was not confirmed. Retry.", 503);
}
