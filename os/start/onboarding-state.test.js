import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCapabilities, deriveGenome, getRecommendations, suggestMode } from './onboarding-state.js';

test('unsure routing is deterministic and keeps the choice with the user', () => {
  assert.equal(suggestMode('My company wastes hours on manual follow-up'), 'business');
  assert.equal(suggestMode('I built an app but need customers to discover it'), 'growth');
  assert.equal(suggestMode('I have code and need an audit before launch'), 'existing');
});

test('answers resolve only their signals and activate relevant capabilities', () => {
  const state = { mode: 'idea', goal: 'A family activity app', goalConfirmed: true, answers: { audience: 'Consumers', data: 'Yes', ai: 'Yes, it is central' } };
  const genome = deriveGenome(state);
  const capabilities = deriveCapabilities(state);
  assert.deepEqual(genome.Audience, { value: 'Consumers', state: 'CONFIRMED' });
  assert.deepEqual(genome.Platforms, { value: 'Not known yet', state: 'UNKNOWN' });
  assert.equal(genome.Risk.state, 'RECOMMENDED');
  assert.equal(capabilities.has('Security'), true);
  assert.equal(capabilities.has('AI'), true);
  assert.equal(capabilities.has('Pricing'), false);
});

test('existing-project preview recommends evidence gathering without invented findings', () => {
  const state = { mode: 'existing', goal: 'Check my prototype', goalConfirmed: true, answers: { concern: 'Security' } };
  const recommendations = getRecommendations(state);
  assert.equal(recommendations.length, 3);
  assert.match(recommendations[0].title, /baseline/i);
  assert.match(recommendations[2].reason, /actual review/i);
  assert.equal(recommendations[2].confidence, 'NEEDS MORE INFORMATION');
});
