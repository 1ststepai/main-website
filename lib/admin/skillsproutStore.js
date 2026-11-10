import { createHmac, randomUUID } from "node:crypto";
import { command } from "./workspaceStore.js";
import { encryptProtectedJson, decryptProtectedJson } from "../security/dataProtection.js";

export const SKILLSPROUT_KEY = "firststep_admin:skillsprout_contacts:v1";
const PURPOSE = "skillsprout-contacts";
export function invalid(code, statusCode = 400) { return Object.assign(new Error(code), { code, statusCode }); }
export function validateSubmission(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("invalid_request");
  if (body.consent !== true) throw invalid("consent_required");
  if (body.tag !== "SkillSprout" || !["starter-pack", "feature-request"].includes(body.source)) throw invalid("invalid_source");
  if (typeof body.email !== "string") throw invalid("invalid_email");
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw invalid("invalid_email");
  return { email, consent: true, tag: "SkillSprout", source: body.source };
}
export async function enforceIntakeLimit(identifier) {
  // Keyed digest avoids retaining IP addresses or reversible low-entropy hashes.
  const secret = process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(secret || "")) throw invalid("storage_unavailable", 503);
  const digest = createHmac("sha256", secret).update(identifier).digest("hex");
  const result = await command(["EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],600) end; return n", "1", `firststep_admin:skillsprout_rate:v1:${digest}`]);
  if (!Number.isSafeInteger(result.result) || result.result < 1) throw invalid("storage_unavailable", 503);
  if (result.result > 12) throw invalid("rate_limited", 429);
}
export async function listSkillSproutContacts(offset = 0) {
  const result = await command(["LRANGE", SKILLSPROUT_KEY, String(offset), String(offset + 49)]);
  if (!Array.isArray(result.result)) throw invalid("storage_unavailable", 503);
  return result.result.map(raw => decryptProtectedJson(raw, PURPOSE));
}
export async function saveSkillSproutContact(input) {
  const contact = { ...validateSubmission(input), id: randomUUID(), timestamp: new Date().toISOString(), consent_version: "skillsprout-intake-v1" };
  // LPUSH is atomic: simultaneous submissions never overwrite one another.
  const result = await command(["LPUSH", SKILLSPROUT_KEY, encryptProtectedJson(contact, PURPOSE)]);
  if (!Number.isSafeInteger(result.result) || result.result < 1) throw invalid("storage_unavailable", 503);
  return contact;
}
