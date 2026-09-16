import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './os-setup-intake.js';
import adminHandler from './admin-os-setup-requests.js';
import { normalizeOsSetupRequest } from '../lib/osSetupIntake.js';
import { createAdminSessionToken } from '../lib/admin/auth.js';

const requestId = '8c691bc1-2e29-44a5-85ae-323463c8743d';
const input = { request_id: requestId, email: 'Builder@Example.com', consent: true, goal: 'I need a safer release path for my web app.', answers: { stage: 'Working privately', concern: 'Quality and testing', access: 'Read-only access later', evidence: 'Automated tests' }, target: 'https://example.com/private-path?token=removed', attribution: { utm_source: 'google', utm_campaign: 'os-launch', landing_path: '/os/?secret=removed' } };

function response() {
  const headers = new Map();
  return { statusCode: 200, setHeader: (name, value) => headers.set(name.toLowerCase(), value), getHeader: (name) => headers.get(name.toLowerCase()), end(value = '') { this.body = value; } };
}

test('OS setup inquiry validates separate consent, bounded answers, and public link', () => {
  assert.deepEqual(normalizeOsSetupRequest(input).target, 'https://example.com/');
  assert.equal(normalizeOsSetupRequest(input).email, 'builder@example.com');
  assert.deepEqual(normalizeOsSetupRequest(input).attribution, { utm_source: 'google', utm_medium: '', utm_campaign: 'os-launch', utm_content: '', utm_term: '', first_touch_source: '', first_touch_campaign: '', landing_path: '/os/' });
  assert.equal(normalizeOsSetupRequest({ ...input, target: null }).target, null);
  assert.throws(() => normalizeOsSetupRequest({ ...input, consent: false }), { code: 'consent_required' });
  assert.throws(() => normalizeOsSetupRequest({ ...input, answers: { ...input.answers, access: 'Owner' } }), { code: 'invalid_answers' });
  assert.throws(() => normalizeOsSetupRequest({ ...input, target: 'http://127.0.0.1/admin' }), { code: 'invalid_target' });
  assert.throws(() => normalizeOsSetupRequest({ ...input, first_look_request_id: 'not-a-receipt' }), { code: 'invalid_first_look_reference' });
});

test('OS setup inquiry is encrypted, idempotent, admin-readable, and expires after 90 days', async (t) => {
  const prior = { fetch: globalThis.fetch, url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, key: process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY, admin: process.env.FIRSTSTEP_ADMIN_SESSION_SECRET };
  t.after(() => {
    globalThis.fetch = prior.fetch;
    for (const [name, value] of [['KV_REST_API_URL', prior.url], ['KV_REST_API_TOKEN', prior.token], ['FIRSTSTEP_DATA_ENCRYPTION_KEY', prior.key], ['FIRSTSTEP_ADMIN_SESSION_SECRET', prior.admin]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  process.env.KV_REST_API_URL = 'https://kv.example.test';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = '33'.repeat(32);
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = 'test-session-secret-longer-than-32-characters';
  const records = new Map();
  globalThis.fetch = async (_url, options) => {
    const [operation, key, value, , ttl] = JSON.parse(options.body);
    let result;
    if (operation === 'SET') { result = records.has(key) ? null : 'OK'; if (result) records.set(key, { value, ttl }); }
    else if (operation === 'GET') result = records.get(key)?.value ?? null;
    else if (operation === 'INCR') { const next = Number(records.get(key)?.value || 0) + 1; records.set(key, { value: String(next), ttl: 600 }); result = next; }
    else if (operation === 'SCAN') result = ['0', [...records.keys()].filter((item) => item.startsWith('os:setup-request:'))];
    else if (operation === 'MGET') result = JSON.parse(options.body).slice(1).map((item) => records.get(item)?.value ?? null);
    return new Response(JSON.stringify({ result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const req = { method: 'POST', headers: { host: '1ststep.ai', origin: 'https://1ststep.ai', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.18' }, body: input };
  const first = response();
  await handler(req, first);
  assert.equal(first.statusCode, 200);
  assert.equal(JSON.parse(first.body).persisted, true);
  const direct = response();
  const directId = '0c27d26a-c8fd-4218-931d-40cd265e8933';
  await handler({ ...req, body: { ...input, request_id: directId, target: null } }, direct);
  assert.equal(direct.statusCode, 200);
  const stored = records.get(`os:setup-request:${requestId}`);
  assert.equal(stored.ttl, 90 * 24 * 60 * 60);
  assert.ok(!stored.value.includes('builder@example.com'));
  assert.ok(!stored.value.includes('safer release'));
  assert.ok(!stored.value.includes('private-path'));
  const admin = response();
  await adminHandler({ method: 'GET', headers: { cookie: `fsai_admin_session=${createAdminSessionToken()}` }, query: {} }, admin);
  assert.equal(admin.statusCode, 200);
  assert.deepEqual(JSON.parse(admin.body).requests[0].answers, input.answers);
  assert.equal(JSON.parse(admin.body).requests[0].target, 'https://example.com/');
  assert.equal(JSON.parse(admin.body).requests[0].attribution.utm_campaign, 'os-launch');
  assert.equal(JSON.parse(admin.body).requests.find((item) => item.request_id === directId).target, null);
  const replay = response();
  await handler(req, replay);
  assert.equal(JSON.parse(replay.body).replayed, true);
  const conflict = response();
  await handler({ ...req, body: { ...input, email: 'other@example.com' } }, conflict);
  assert.equal(conflict.statusCode, 409);
});

test('OS setup inquiry rejects cross-origin requests and unauthenticated admin reads', async () => {
  const denied = response();
  await handler({ method: 'POST', headers: { host: '1ststep.ai', origin: 'https://evil.example', 'content-type': 'application/json' }, body: input }, denied);
  assert.equal(denied.statusCode, 403);
  const admin = response();
  await adminHandler({ method: 'GET', headers: {} }, admin);
  assert.equal(admin.statusCode, 401);
});
