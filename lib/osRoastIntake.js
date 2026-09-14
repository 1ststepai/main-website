import { createHash } from 'node:crypto';
import { parseTarget } from './osPublicScan.js';
import { protectedIntakeCommand } from './journey/intakeStore.js';
import { decryptProtectedJson, encryptProtectedJson } from './security/dataProtection.js';

const PREFIX = 'os:roast-request:';
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

function failure(code, statusCode, message) {
  return Object.assign(new Error(message), { code, statusCode });
}

export function normalizeRoastRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('invalid_request', 400, 'Check your email and link.');
  if (input.consent !== true) throw failure('consent_required', 400, 'Please agree before sharing your email.');
  if (typeof input.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id)) throw failure('invalid_request_id', 400, 'Please reload and try again.');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure('invalid_email', 400, 'Enter a valid email address.');
  let target;
  try { target = parseTarget(input.target); } catch { throw failure('invalid_target', 400, 'Enter a public website or GitHub repository.'); }
  const publicLink = target.kind === 'website' ? `${new URL(target.url).origin}/` : target.url;
  return { request_id: input.request_id.toLowerCase(), email, target: publicLink, kind: target.kind, consent: true };
}

export async function saveRoastRequest(input) {
  const normalized = normalizeRoastRequest(input);
  const key = `${PREFIX}${normalized.request_id}`;
  const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const record = { ...normalized, fingerprint, created_at: new Date().toISOString() };
  const saved = await protectedIntakeCommand(['SET', key, encryptProtectedJson(record, 'os-roast-intake'), 'EX', RETENTION_SECONDS, 'NX']);
  if (saved === 'OK') return { request_id: normalized.request_id, persisted: true, replayed: false };
  const existing = await protectedIntakeCommand(['GET', key]);
  if (!existing) throw failure('intake_unavailable', 503, 'We could not save your request. Please try again.');
  const prior = decryptProtectedJson(String(existing), 'os-roast-intake');
  if (prior.fingerprint !== fingerprint) throw failure('request_conflict', 409, 'This request changed. Please reload and try again.');
  return { request_id: normalized.request_id, persisted: true, replayed: true };
}

export async function listRoastRequests(cursor = '0') {
  if (!/^\d{1,20}$/.test(cursor)) throw failure('invalid_cursor', 400, 'Invalid cursor.');
  const result = await protectedIntakeCommand(['SCAN', cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 50]);
  if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[1])) throw failure('intake_unavailable', 503, 'Requests unavailable.');
  const keys = result[1].filter((key) => typeof key === 'string' && key.startsWith(PREFIX));
  const values = [];
  for (let index = 0; index < keys.length; index += 50) {
    const batch = await protectedIntakeCommand(['MGET', ...keys.slice(index, index + 50)]);
    if (!Array.isArray(batch)) throw failure('intake_unavailable', 503, 'Requests unavailable.');
    values.push(...batch);
  }
  return { cursor: String(result[0]), requests: values.filter((value) => typeof value === 'string').map((value) => {
    const { request_id, email, target, kind, created_at } = decryptProtectedJson(value, 'os-roast-intake');
    return { request_id, email, target, kind, created_at };
  }) };
}
