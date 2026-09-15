import { createHash } from 'node:crypto';
import { normalizeSourceType, parseTarget } from './osPublicScan.js';
import { normalizeLeadAttribution } from './leadAttribution.js';
import { createProtectedLead, getProtectedLead, listProtectedLeads } from './protectedLeadStore.js';
import { decryptProtectedJson, encryptProtectedJson } from './security/dataProtection.js';

const PREFIX = 'os:roast-request:';
export const MARKETING_CONSENT_VERSION = 'os-first-look-marketing-2026-09-14-v1';

function failure(code, statusCode, message) {
  return Object.assign(new Error(message), { code, statusCode });
}

export function normalizeRoastRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('invalid_request', 400, 'Check your email and link.');
  if (input.consent !== true) throw failure('consent_required', 400, 'Please agree before sharing your email.');
  if (typeof input.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id)) throw failure('invalid_request_id', 400, 'Please reload and try again.');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure('invalid_email', 400, 'Enter a valid email address.');
  if (input.marketing_opt_in !== undefined && typeof input.marketing_opt_in !== 'boolean') throw failure('invalid_marketing_choice', 400, 'Check the optional email choice and try again.');
  let target;
  try { target = parseTarget(input.target); } catch { throw failure('invalid_target', 400, 'Enter a public website, web app, GitHub repository, or official app-store listing.'); }
  let sourceType;
  try { sourceType = normalizeSourceType(input.source_type, target); } catch { throw failure('invalid_source_type', 400, 'Choose the type of public source you want audited.'); }
  const publicLink = sourceType === 'mobile_app' || target.kind === 'github' ? target.url : `${new URL(target.url).origin}/`;
  return { request_id: input.request_id.toLowerCase(), email, target: publicLink, kind: target.kind, source_type: sourceType, attribution: normalizeLeadAttribution(input.attribution), consent: true, marketing_opt_in: input.marketing_opt_in === true, marketing_consent_version: input.marketing_opt_in === true ? MARKETING_CONSENT_VERSION : null };
}

export async function saveRoastRequest(input) {
  const normalized = normalizeRoastRequest(input);
  const key = `${PREFIX}${normalized.request_id}`;
  const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const record = { ...normalized, fingerprint, created_at: new Date().toISOString() };
  const saved = await createProtectedLead(key, encryptProtectedJson(record, 'os-roast-intake'));
  if (saved === 'OK') return { request_id: normalized.request_id, persisted: true, replayed: false };
  const existing = await getProtectedLead(key);
  if (!existing) throw failure('intake_unavailable', 503, 'We could not save your request. Please try again.');
  const prior = decryptProtectedJson(String(existing), 'os-roast-intake');
  if (prior.fingerprint !== fingerprint) throw failure('request_conflict', 409, 'This request changed. Please reload and try again.');
  return { request_id: normalized.request_id, persisted: true, replayed: true };
}

export async function listRoastRequests(cursor = '0') {
  let result;
  try { result = await listProtectedLeads(PREFIX, cursor); }
  catch (error) { throw failure(error?.code === 'invalid_cursor' ? 'invalid_cursor' : 'intake_unavailable', error?.code === 'invalid_cursor' ? 400 : 503, error?.code === 'invalid_cursor' ? 'Invalid cursor.' : 'Requests unavailable.'); }
  return { cursor: result.cursor, requests: result.values.map((value) => {
    const { request_id, email, target, kind, source_type, attribution, created_at, marketing_opt_in, marketing_consent_version } = decryptProtectedJson(value, 'os-roast-intake');
    return { request_id, email, target, kind, source_type: source_type || kind, attribution: normalizeLeadAttribution(attribution), created_at, marketing_opt_in: marketing_opt_in === true, marketing_consent_version: marketing_opt_in === true ? marketing_consent_version || null : null };
  }) };
}
