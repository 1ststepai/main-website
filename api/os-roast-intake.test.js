import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './os-roast-intake.js';
import adminHandler from './admin-os-roast-requests.js';
import { listRoastRequests, MARKETING_CONSENT_VERSION, normalizeRoastRequest } from '../lib/osRoastIntake.js';
import { createAdminSessionToken } from '../lib/admin/auth.js';

const requestId = 'f67d4186-7c5e-4ea0-9aa8-f55b51b4a719';

function response() {
  const headers = new Map();
  return { statusCode: 200, setHeader: (name, value) => headers.set(name.toLowerCase(), value), getHeader: (name) => headers.get(name.toLowerCase()), end(value = '') { this.body = value; } };
}

test('roast intake requires consent and accepts only bounded public links', () => {
  const input = { request_id: requestId, email: 'Person@Example.com', consent: true, target: 'https://github.com/openai/codex?token=secret' };
  assert.deepEqual(normalizeRoastRequest(input), { request_id: requestId, email: 'person@example.com', target: 'https://github.com/openai/codex', kind: 'github', consent: true, marketing_opt_in: false, marketing_consent_version: null });
  assert.deepEqual(normalizeRoastRequest({ ...input, marketing_opt_in: true }).marketing_consent_version, MARKETING_CONSENT_VERSION);
  assert.throws(() => normalizeRoastRequest({ ...input, marketing_opt_in: 'yes' }), { code: 'invalid_marketing_choice' });
  assert.throws(() => normalizeRoastRequest({ ...input, consent: false }), { code: 'consent_required' });
  assert.throws(() => normalizeRoastRequest({ ...input, target: 'http://127.0.0.1/admin' }), { code: 'invalid_target' });
});

test('intake stores a minimized encrypted 90-day record and only confirms durable writes', async (t) => {
  const prior = { fetch: globalThis.fetch, url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, key: process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY, admin: process.env.FIRSTSTEP_ADMIN_SESSION_SECRET };
  t.after(() => {
    globalThis.fetch = prior.fetch;
    for (const [name, value] of [['KV_REST_API_URL', prior.url], ['KV_REST_API_TOKEN', prior.token], ['FIRSTSTEP_DATA_ENCRYPTION_KEY', prior.key], ['FIRSTSTEP_ADMIN_SESSION_SECRET', prior.admin]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  process.env.KV_REST_API_URL = 'https://kv.example.test';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = '11'.repeat(32);
  process.env.FIRSTSTEP_ADMIN_SESSION_SECRET = 'test-session-secret-longer-than-32-characters';
  const records = new Map();
  globalThis.fetch = async (_url, options) => {
    const [operation, key, value, , ttl] = JSON.parse(options.body);
    let result;
    if (operation === 'SET') { result = records.has(key) ? null : 'OK'; if (result) records.set(key, { value, ttl }); }
    else if (operation === 'GET') result = records.get(key)?.value ?? null;
    else if (operation === 'INCR') { const next = Number(records.get(key)?.value || 0) + 1; records.set(key, { value: String(next), ttl: 600 }); result = next; }
    else if (operation === 'SCAN') result = ['0', [...records.keys()].filter((item) => item.startsWith('os:roast-request:'))];
    else if (operation === 'MGET') result = JSON.parse(options.body).slice(1).map((item) => records.get(item)?.value ?? null);
    return new Response(JSON.stringify({ result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const req = { method: 'POST', headers: { host: '1ststep.ai', origin: 'https://1ststep.ai', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8' }, body: { request_id: requestId, email: 'person@example.com', consent: true, target: 'example.com/private-path?private=removed' } };
  const first = response();
  await handler(req, first);
  assert.equal(first.statusCode, 200);
  assert.equal(JSON.parse(first.body).persisted, true);
  const stored = records.get(`os:roast-request:${requestId}`);
  assert.equal(stored.ttl, 90 * 24 * 60 * 60);
  assert.ok(!stored.value.includes('person@example.com'));
  assert.ok(!stored.value.includes('private=removed'));
  assert.ok(!stored.value.includes('private-path'));
  const listed = await listRoastRequests();
  assert.deepEqual(listed.requests.map(({ email, target }) => ({ email, target })), [{ email: 'person@example.com', target: 'https://example.com/' }]);
  assert.equal(listed.requests[0].marketing_opt_in, false);
  assert.equal(listed.requests[0].marketing_consent_version, null);
  const authorized = response();
  await adminHandler({ method: 'GET', headers: { cookie: `fsai_admin_session=${createAdminSessionToken()}` }, query: {} }, authorized);
  assert.equal(authorized.statusCode, 200);
  assert.equal(JSON.parse(authorized.body).requests[0].email, 'person@example.com');
  const optedIn = response();
  const optedInId = 'e64f74df-daa2-467b-814e-59a8d1688123';
  await handler({ ...req, body: { ...req.body, request_id: optedInId, email: 'updates@example.com', marketing_opt_in: true } }, optedIn);
  assert.equal(optedIn.statusCode, 200);
  assert.equal(records.get(`os:roast-request:${optedInId}`).ttl, 90 * 24 * 60 * 60);
  assert.ok(!records.get(`os:roast-request:${optedInId}`).value.includes('updates@example.com'));
  const optedInReadback = response();
  await adminHandler({ method: 'GET', headers: { cookie: `fsai_admin_session=${createAdminSessionToken()}` }, query: {} }, optedInReadback);
  assert.deepEqual(JSON.parse(optedInReadback.body).requests.map(({ email, marketing_opt_in }) => ({ email, marketing_opt_in })), [{ email: 'person@example.com', marketing_opt_in: false }, { email: 'updates@example.com', marketing_opt_in: true }]);
  assert.equal(JSON.parse(optedInReadback.body).requests[1].marketing_consent_version, MARKETING_CONSENT_VERSION);
  const replay = response();
  await handler(req, replay);
  assert.equal(JSON.parse(replay.body).replayed, true);
  const conflict = response();
  await handler({ ...req, body: { ...req.body, email: 'different@example.com' } }, conflict);
  assert.equal(conflict.statusCode, 409);
});

test('cross-origin intake and unauthenticated admin read are denied', async () => {
  const denied = response();
  await handler({ method: 'POST', headers: { host: '1ststep.ai', origin: 'https://evil.example', 'content-type': 'application/json' }, body: {} }, denied);
  assert.equal(denied.statusCode, 403);
  const admin = response();
  await adminHandler({ method: 'GET', headers: {} }, admin);
  assert.equal(admin.statusCode, 401);
});
