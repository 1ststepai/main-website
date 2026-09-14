import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicRoast } from './osPublicRoast.js';

test('roast calls out only observed gaps and keeps the first useful action', () => {
  const roast = buildPublicRoast({ kind: 'website', checks: [
    { label: 'Page title', status: 'FOUND', evidence: 'Acme', suggestion: null },
    { label: 'Meta description', status: 'NOT FOUND IN HTML', evidence: 'Not present in fetched HTML', suggestion: 'Add a description' },
  ], note: 'Only one HTML response was checked.' });
  assert.equal(roast.improvements.length, 1);
  assert.equal(roast.strengths[0].evidence, 'Acme');
  assert.equal(roast.nextStep, 'Add a description');
  assert.match(roast.limit, /one HTML response/);
});

test('healthy public metadata receives no manufactured weakness', () => {
  const roast = buildPublicRoast({ kind: 'github', checks: [
    { label: 'Description', status: 'FOUND', evidence: 'A public project', suggestion: null },
    { label: 'Repository state', status: 'ACTIVE', evidence: 'Not archived', suggestion: null },
  ] });
  assert.match(roast.headline, /No cheap shots/);
  assert.deepEqual(roast.improvements, []);
});
