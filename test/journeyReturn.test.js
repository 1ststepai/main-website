import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../journey/journey.js', import.meta.url), 'utf8');
const names = ['business', 'demand', 'goal', 'stack', 'bottleneck', 'bottleneck_detail', 'outcome', 'team', 'timing'];
const required = new Set(['business', 'demand', 'goal', 'stack', 'bottleneck', 'outcome', 'team']);

function element() {
  return { hidden: false, disabled: false, value: '', textContent: '', dataset: {}, style: {},
    listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector() { return { focus() {}, setAttribute() {} }; }, querySelectorAll() { return []; },
    focus() {}, replaceChildren(...children) { this.children = children; }, append() {}, reset() {},
    reportValidity() { return true; } };
}

function openJourney(storage) {
  const dom = new Map();
  const get = id => { if (!dom.has(id)) dom.set(id, element()); return dom.get(id); };
  const fields = Object.fromEntries(names.map(name => [name, element()]));
  for (const [name, field] of Object.entries(fields)) {
    if (['demand', 'bottleneck', 'team', 'timing'].includes(name))
      Object.defineProperty(field, 'selectedOptions', { get: () => [{ textContent: field.value }] });
  }
  const steps = Array.from({ length: 6 }, () => element());
  get('#journey-form').elements = fields;
  get('#journey-form').querySelectorAll = selector => selector === '.step' ? steps : selector === '[required]' ? Object.entries(fields).filter(([name]) => required.has(name)).map(([, field]) => field) : [];
  for (const step of steps) step.querySelectorAll = () => [];
  const context = {
    document: { querySelector: get, createElement: () => element() },
    FormData: class { constructor(form) { this.data = Object.entries(form.elements).filter(([, field]) => field.value).map(([name, field]) => [name, field.value]); } entries() { return this.data[Symbol.iterator](); } get(name) { return this.data.find(([key]) => key === name)?.[1] || null; } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    crypto, window: {}, navigator: { clipboard: { writeText: async () => {} } }, fetch: async () => { throw Error('unexpected network'); }
  };
  vm.runInNewContext(source, context, { filename: 'journey/journey.js' });
  return { get, fields };
}

test('a completed local diagnosis returns after reload and clearing it removes the result', () => {
  const storage = new Map();
  const first = openJourney(storage);
  Object.assign(first.fields.business, { value: 'Commercial services' });
  Object.assign(first.fields.demand, { value: 'existing' });
  Object.assign(first.fields.goal, { value: 'Faster response' });
  Object.assign(first.fields.stack, { value: 'Website and CRM' });
  Object.assign(first.fields.bottleneck, { value: 'routing' });
  Object.assign(first.fields.outcome, { value: 'Every inquiry assigned' });
  Object.assign(first.fields.team, { value: 'small' });
  for (let step = 0; step < 6; step++) first.get('#next-button').listeners.click();
  assert.equal(first.get('#result').hidden, false);
  assert.equal(storage.size, 1);
  const returned = openJourney(storage);
  assert.equal(returned.get('#result').hidden, false);
  assert.equal(returned.get('#recommendation-title').textContent, 'Make ownership explicit');
  assert.equal(returned.get('#request-status').textContent, '');
  returned.get('#clear-action').listeners.click();
  assert.equal(storage.size, 0);
  const empty = openJourney(storage);
  assert.equal(empty.get('#result').hidden, true);
  assert.equal(empty.get('#journey-form').hidden, false);
});
