import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProtectedLead,
  deleteExpiredProtectedLeads,
  enforceProtectedLeadRateLimit,
  getProtectedLead,
  listProtectedLeads
} from './protectedLeadStore.js';

function privateBlobClient() {
  const records = new Map();
  return {
    records,
    async put(pathname, body, options) {
      assert.equal(options.access, 'private');
      assert.equal(options.allowOverwrite, false);
      if (records.has(pathname)) throw new Error('Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.');
      records.set(pathname, { body, uploadedAt: new Date('2026-09-14T12:00:00Z') });
      return { pathname };
    },
    async get(pathname, options) {
      assert.equal(options.access, 'private');
      const record = records.get(pathname);
      if (!record) return null;
      return { statusCode: 200, stream: new Response(record.body).body };
    },
    async list({ prefix }) {
      const blobs = [...records.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, record]) => ({ pathname, url: `https://private.example/${pathname}`, uploadedAt: record.uploadedAt }));
      return { blobs, hasMore: false };
    },
    async del(urls) {
      for (const url of urls) records.delete(new URL(url).pathname.slice(1));
    }
  };
}

test('private Blob lead storage is encrypted-value agnostic, idempotent, listable, and retained for 90 days', async (t) => {
  const prior = process.env.BLOB_READ_WRITE_TOKEN;
  t.after(() => { if (prior === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = prior; });
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_test';
  const client = privateBlobClient();
  const key = 'os:roast-request:11111111-1111-4111-8111-111111111111';

  assert.equal(await createProtectedLead(key, 'encrypted-record', client), 'OK');
  assert.equal(await createProtectedLead(key, 'different-record', client), null);
  assert.equal(await getProtectedLead(key, client), 'encrypted-record');
  assert.deepEqual(await listProtectedLeads('os:roast-request:', '0', client), { cursor: '0', values: ['encrypted-record'] });

  assert.deepEqual(await deleteExpiredProtectedLeads(new Date('2026-12-14T12:00:01Z').getTime(), client), { deleted: 1, storage: 'vercel_blob' });
  assert.equal(await getProtectedLead(key, client), null);
});

test('private Blob rate limiting retains only a connection hash and rejects the thirteenth request', async (t) => {
  const prior = process.env.BLOB_READ_WRITE_TOKEN;
  t.after(() => { if (prior === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = prior; });
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_test';
  const client = privateBlobClient();
  const req = { headers: { 'x-forwarded-for': '203.0.113.88' } };
  for (let index = 0; index < 12; index += 1) await enforceProtectedLeadRateLimit(req, 'os-roast', client);
  await assert.rejects(() => enforceProtectedLeadRateLimit(req, 'os-roast', client), { code: 'rate_limited', statusCode: 429 });
  assert.equal([...client.records.keys()].some((pathname) => pathname.includes('203.0.113.88')), false);
});
