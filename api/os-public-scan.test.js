import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './os-public-scan.js';

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
