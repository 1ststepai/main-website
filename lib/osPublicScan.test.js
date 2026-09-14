import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPageEvidence, isPublicIpv4, parseTarget } from './osPublicScan.js';

test('public scan accepts only bounded HTTPS public targets', () => {
  assert.deepEqual(parseTarget('example.com').kind, 'website');
  assert.deepEqual(parseTarget('github.com/owner/project.git').url, 'https://github.com/owner/project');
  for (const input of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://example.com:8443', 'https://user:pass@example.com', 'https://github.com/owner', 'https://github.com/owner/.git', 'https://example.com\\@localhost']) {
    assert.throws(() => parseTarget(input), { message: 'INVALID_TARGET' }, input);
  }
});

test('DNS pinning rejects private and reserved IPv4 addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.100.100.100', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '::1']) assert.equal(isPublicIpv4(address), false, address);
  assert.equal(isPublicIpv4('1.1.1.1'), true);
});

test('HTML evidence reports only source-visible fields', () => {
  const html = '<html lang="en"><head><title>Example &amp; Co</title><meta name="description" content="A useful page"><meta name="viewport" content="width=device-width"></head><body><script><h1>Fake</h1></script><h1>Actual heading</h1></body></html>';
  assert.deepEqual(extractPageEvidence(html), { title: 'Example & Co', description: 'A useful page', viewport: true, lang: 'en', h1: 'Actual heading' });
  assert.equal(extractPageEvidence('<html lang=en><head><meta name=viewport content=width=device-width></head></html>').lang, 'en');
  assert.equal(extractPageEvidence('<html><body>Nothing</body></html>').title, '');
});
