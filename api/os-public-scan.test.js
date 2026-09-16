import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import handler from './os-public-scan.js';
import { getSavedRoastScanTarget, saveRoastRequest } from '../lib/osRoastIntake.js';

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    getHeader: (name) => headers.get(name.toLowerCase()),
    end(value = '') { this.body = value; },
  };
}

test('public scan rejects hostile origins and oversized bodies before network access', async () => {
  const hostile = response();
  await handler({ method: 'POST', headers: { host: '1ststep.ai', origin: 'https://unrelated.example', 'content-type': 'application/json' }, body: { url: 'example.com' } }, hostile);
  assert.equal(hostile.statusCode, 403);

  const oversized = response();
  await handler({ method: 'POST', headers: { host: '1ststep.ai', origin: 'https://1ststep.ai', 'content-type': 'application/json' }, body: { url: 'a'.repeat(600) } }, oversized);
  assert.equal(oversized.statusCode, 400);
});

test('scan requires a persisted consent receipt for the matching public source', async (t) => {
  const prior = { fetch: globalThis.fetch, lookup: dns.lookup, request: https.request, url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, encryption: process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY };
  t.after(() => {
    globalThis.fetch = prior.fetch;
    dns.lookup = prior.lookup;
    https.request = prior.request;
    for (const [name, value] of [['KV_REST_API_URL', prior.url], ['KV_REST_API_TOKEN', prior.token], ['FIRSTSTEP_DATA_ENCRYPTION_KEY', prior.encryption]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  process.env.KV_REST_API_URL = 'https://kv.example.test';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = '22'.repeat(32);
  const records = new Map();
  globalThis.fetch = async (_url, options) => {
    const [operation, key, value] = JSON.parse(options.body);
    if (operation === 'SET') { if (!records.has(key)) records.set(key, value); return Response.json({ result: 'OK' }); }
    if (operation === 'GET') return Response.json({ result: records.get(key) || null });
    throw new Error('Unexpected store command');
  };
  let networkCalls = 0;
  dns.lookup = async () => { networkCalls += 1; return [{ address: '1.1.1.1', family: 4 }]; };
  https.request = (_url, _options, callback) => {
    const outgoing = new EventEmitter();
    outgoing.end = () => {
      const incoming = new EventEmitter();
      incoming.statusCode = 200;
      incoming.headers = { 'content-type': 'text/html' };
      callback(incoming);
      queueMicrotask(() => {
        incoming.emit('data', Buffer.from('<html lang="en"><head><title>Example</title></head><body><h1>Welcome</h1></body></html>'));
        incoming.emit('end');
        outgoing.emit('close');
      });
    };
    outgoing.destroy = (error) => outgoing.emit('error', error);
    return outgoing;
  };
  const req = { method: 'POST', headers: { host: '1ststep.ai', origin: 'https://1ststep.ai', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.44' }, body: { url: 'https://example.com/a-page', source_type: 'website' } };
  const missing = response();
  await handler(req, missing);
  assert.equal(missing.statusCode, 403);
  assert.equal(JSON.parse(missing.body).error, 'SAVED_REQUEST_REQUIRED');
  assert.equal(networkCalls, 0);

  const request_id = 'a639628d-9478-4189-9fe8-2676f1c71e88';
  await saveRoastRequest({ request_id, email: 'person@example.com', consent: true, target: 'https://example.com/a-page', source_type: 'website' });
  assert.equal(await getSavedRoastScanTarget(request_id, req.body.url, 'website'), 'https://example.com/');
  assert.equal(await getSavedRoastScanTarget(request_id, 'https://other.example/', 'website'), null);
  assert.equal(await getSavedRoastScanTarget(request_id, req.body.url, 'web_app'), null);
  const mismatched = response();
  await handler({ ...req, body: { ...req.body, request_id, url: 'https://other.example/' } }, mismatched);
  assert.equal(mismatched.statusCode, 403);
  assert.equal(networkCalls, 0);
  const allowed = response();
  await handler({ ...req, body: { ...req.body, request_id } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(JSON.parse(allowed.body).result.inspectedUrl, 'https://example.com/');
  assert.equal(networkCalls, 1);
  const changedPath = response();
  await handler({ ...req, body: { ...req.body, request_id, url: 'https://example.com/other-page' } }, changedPath);
  assert.equal(changedPath.statusCode, 200);
  assert.equal(JSON.parse(changedPath.body).result.inspectedUrl, 'https://example.com/');
});
