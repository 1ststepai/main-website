import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalCourseAdapter, MOCK_STORAGE_KEY } from '../src/course/local-adapter.js';

function fixture(storageOverride) {
  const records = new Map();
  const storage = storageOverride ?? {
    setItem(key, value) { records.set(key, value); },
    getItem(key) { return records.get(key) ?? null; },
  };
  return { records, adapter: createLocalCourseAdapter({ storage, hostname: '127.0.0.1' }) };
}

test('library delivery simulation does not imply course consent or store email', async () => {
  const { adapter, records } = fixture();
  assert.deepEqual(await adapter.submit({ kind: 'library', email: 'fictional@example.com' }), {
    ok: true, code: 'local-simulation', courseUpdates: false,
  });
  const stored = records.get(MOCK_STORAGE_KEY);
  assert.equal(stored.includes('fictional@example.com'), false);
  assert.deepEqual(JSON.parse(stored), { simulation: true, kind: 'library', courseUpdates: false });
});

test('separate explicit opt-in is required for waitlist consent', async () => {
  const { adapter } = fixture();
  assert.equal((await adapter.submit({ kind: 'library', email: 'test@example.com', courseUpdates: true })).courseUpdates, true);
  assert.equal((await adapter.submit({ kind: 'waitlist', email: 'test@example.com' })).code, 'consent-required');
  assert.equal((await adapter.submit({ kind: 'waitlist', email: 'test@example.com', courseUpdates: true })).courseUpdates, true);
});

test('invalid email and nonboolean consent do not persist anything', async () => {
  const { adapter, records } = fixture();
  for (const email of ['', 'not-an-email', 'a@b', 'a b@example.com', null]) {
    assert.equal((await adapter.submit({ kind: 'library', email })).code, 'invalid-email');
  }
  assert.equal((await adapter.submit({ kind: 'library', email: 'test@example.com', courseUpdates: 'true' })).code, 'invalid-request');
  assert.equal(records.size, 0);
});

test('throwing or silently failed persistence never reports acceptance', async () => {
  for (const storage of [
    { setItem() { throw new Error('quota'); }, getItem() { return null; } },
    { setItem() {}, getItem() { return null; } },
  ]) {
    assert.deepEqual(await fixture(storage).adapter.submit({ kind: 'library', email: 'test@example.com', courseUpdates: true }), {
      ok: false, code: 'persistence-failed',
    });
  }
});

test('public hosts cannot submit to the local simulator', async () => {
  let writes = 0;
  const adapter = createLocalCourseAdapter({ hostname: '1ststep.ai', storage: { setItem() { writes++; } } });
  assert.deepEqual(await adapter.submit({ kind: 'waitlist', email: 'test@example.com', courseUpdates: true }), { ok: false, code: 'unavailable' });
  assert.equal(writes, 0);
});


test('unchecked waitlist consent does not write simulation state', async () => {
  const { adapter, records } = fixture();
  assert.deepEqual(await adapter.submit({kind: 'waitlist', email: 'fictional@example.com', courseUpdates: false}), {
    ok: false, code: 'consent-required',
  });
  assert.equal(records.size, 0);
});
