import { createHash } from 'node:crypto';
import { questions } from '../os/start/onboarding-state.js';
import { parseTarget } from './osPublicScan.js';
import { protectedIntakeCommand } from './journey/intakeStore.js';
import { decryptProtectedJson, encryptProtectedJson } from './security/dataProtection.js';

const PREFIX = 'os:setup-request:';
const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(code, statusCode, message) {
  return Object.assign(new Error(message), { code, statusCode });
}

export function normalizeOsSetupRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('invalid_request', 400, 'Check your request.');
  if (input.consent !== true) throw failure('consent_required', 400, 'Please agree before sending your OS setup request.');
  if (typeof input.request_id !== 'string' || !UUID.test(input.request_id)) throw failure('invalid_request_id', 400, 'Please reload and try again.');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure('invalid_email', 400, 'Enter a valid email address.');
  const goal = typeof input.goal === 'string' ? input.goal.trim() : '';
  if (goal.length < 8 || goal.length > 800) throw failure('invalid_goal', 400, 'Describe your goal in 8–800 characters.');
  if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) throw failure('invalid_answers', 400, 'Check your project answers.');
  const answers = {};
  for (const question of questions.existing) {
    const answer = input.answers[question.key];
    if (typeof answer !== 'string' || !question.options.includes(answer)) throw failure('invalid_answers', 400, 'Check your project answers.');
    answers[question.key] = answer;
  }
  let target = null;
  if (input.target != null && input.target !== '') {
    try {
      const parsed = parseTarget(input.target);
      target = parsed.kind === 'website' ? `${new URL(parsed.url).origin}/` : parsed.url;
    } catch { throw failure('invalid_target', 400, 'Check the public link.'); }
  }
  if (input.first_look_request_id != null && input.first_look_request_id !== '' && (typeof input.first_look_request_id !== 'string' || !UUID.test(input.first_look_request_id))) throw failure('invalid_first_look_reference', 400, 'Check the first-look reference.');
  const firstLookRequestId = input.first_look_request_id ? input.first_look_request_id.toLowerCase() : null;
  return { request_id: input.request_id.toLowerCase(), email, goal, answers, target, first_look_request_id: firstLookRequestId, consent: true };
}

export async function saveOsSetupRequest(input) {
  const normalized = normalizeOsSetupRequest(input);
  const key = `${PREFIX}${normalized.request_id}`;
  const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const record = { ...normalized, fingerprint, created_at: new Date().toISOString() };
  const saved = await protectedIntakeCommand(['SET', key, encryptProtectedJson(record, 'os-setup-intake'), 'EX', RETENTION_SECONDS, 'NX']);
  if (saved === 'OK') return { request_id: normalized.request_id, persisted: true, replayed: false };
  const existing = await protectedIntakeCommand(['GET', key]);
  if (!existing) throw failure('intake_unavailable', 503, 'We could not save your request. Please try again.');
  const prior = decryptProtectedJson(String(existing), 'os-setup-intake');
  if (prior.fingerprint !== fingerprint) throw failure('request_conflict', 409, 'This request changed. Please reload and try again.');
  return { request_id: normalized.request_id, persisted: true, replayed: true };
}

export async function listOsSetupRequests(cursor = '0') {
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
    const { request_id, email, goal, answers, target, first_look_request_id, created_at } = decryptProtectedJson(value, 'os-setup-intake');
    return { request_id, email, goal, answers, target, first_look_request_id, created_at };
  }) };
}
