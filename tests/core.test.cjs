const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const corePath = path.join(__dirname, '..', 'dist', 'core.js');
const core = fs.existsSync(corePath) ? require(corePath) : {};

function invoke(name, ...args) {
  assert.equal(typeof core[name], 'function', `${name} must be implemented`);
  return core[name](...args);
}

test('ordinary browser scripts expose the same API on window.CaseCore', () => {
  assert.equal(fs.existsSync(corePath), true, 'browser core script must exist');
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(corePath, 'utf8'), context);
  for (const name of ['validateVolume', 'score', 'moveItem', 'addUnique']) {
    assert.equal(typeof context.window.CaseCore[name], 'function');
  }
});

test('wrong-category documents do not earn content or order credit', () => {
  const result = invoke('validateVolume', ['a', 'wrong', 'c'], ['a', 'b', 'c'], 3);
  assert.equal(result.contentCorrect, 2);
  assert.equal(result.orderCorrect, 2);
  assert.equal(result.contentRate, 2 / 3);
  assert.equal(result.orderRate, 2 / 3);
  assert.equal(result.rate, 2 / 3);
  assert.deepEqual(result.misplacedIds, ['wrong']);
  assert.deepEqual(result.missingIds, ['b']);
});

test('reversed ordering earns only the longest valid relative sequence', () => {
  const result = invoke('validateVolume', ['d', 'c', 'b', 'a'], ['a', 'b', 'c', 'd'], 4);
  assert.equal(result.contentCorrect, 4);
  assert.equal(result.orderCorrect, 1);
  assert.equal(result.rate, 0.25);
  assert.equal(result.passed, false);
});

test('missing documents do not shift the relative order of remaining documents', () => {
  const result = invoke('validateVolume', ['b', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'], 5);
  assert.equal(result.orderCorrect, 3);
  assert.equal(result.rate, 0.6);
  assert.equal(result.passed, true);
});

test('60 percent is inclusive and a score immediately below it fails', () => {
  const expected = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(invoke('validateVolume', expected.slice(0, 3), expected, 5).passed, true);
  assert.equal(invoke('validateVolume', expected.slice(0, 2), expected, 5).passed, false);
});

test('empty directories return zero percent rather than an unavailable-answer error', () => {
  const result = invoke('validateVolume', [], ['a'], 1);
  assert.equal(result.contentCorrect, 0);
  assert.equal(result.orderCorrect, 0);
  assert.equal(result.rate, 0);
  assert.equal(result.passed, false);
  assert.deepEqual(result.missingIds, ['a']);
});

test('missing answers or invalid directories cannot produce a validation record', () => {
  assert.equal(invoke('validateVolume', ['a'], [], 1), null);
  assert.equal(invoke('validateVolume', [], [], 1), null);
  assert.equal(invoke('validateVolume', null, ['a'], 1), null);
});

test('duplicate documents cannot increase credit or exceed 100 percent', () => {
  const result = invoke('validateVolume', ['a', 'a', 'b', 'b', 'c'], ['a', 'b', 'c'], 2);
  assert.equal(result.contentCorrect, 3);
  assert.equal(result.orderCorrect, 3);
  assert.equal(result.contentRate, 1);
  assert.equal(result.orderRate, 1);
  assert.equal(result.rate, 1);
  const repeated = invoke('validateVolume', ['a', 'a', 'a'], ['a', 'b', 'c'], 3);
  assert.equal(repeated.contentCorrect, 1);
  assert.equal(repeated.orderCorrect, 1);
});

test('invalid scoring bases are rejected', () => {
  for (const base of [0, -1, NaN, Infinity, undefined]) {
    assert.equal(invoke('validateVolume', ['a'], ['a'], base), null);
  }
});

test('three passing volumes use their independent 30, 50 and 20 point weights', () => {
  const expected = ['a', 'b', 'c', 'd', 'e'];
  const result = invoke('score', {
    litigation: invoke('validateVolume', expected.slice(0, 3), expected, 5),
    evidence: invoke('validateVolume', expected.slice(0, 4), expected, 5),
    work: invoke('validateVolume', expected, expected, 5),
  });
  assert.deepEqual(result, { litigation: 18, evidence: 40, work: 20, total: 78 });
});

test('full scores sum to 100 once without applying the weights twice', () => {
  const full = invoke('validateVolume', ['a'], ['a'], 1);
  assert.deepEqual(invoke('score', { litigation: full, evidence: full, work: full }), {
    litigation: 30, evidence: 50, work: 20, total: 100,
  });
});

test('scoring requires all three calculated results', () => {
  const full = { rate: 1, passed: true };
  assert.equal(invoke('score', { litigation: full, evidence: full }), null);
  assert.equal(invoke('score', null), null);
});

test('scores are available before every volume reaches the preview threshold', () => {
  const expected = ['a', 'b', 'c', 'd', 'e'];
  const partial = invoke('validateVolume', ['a'], expected, 5);
  const full = invoke('validateVolume', expected, expected, 5);
  assert.equal(partial.passed, false);
  assert.deepEqual(invoke('score', { litigation: partial, evidence: full, work: full }), {
    litigation: 6, evidence: 50, work: 20, total: 76,
  });
});

test('empty training shows zero scores without a validation click', () => {
  const empty = invoke('validateVolume', [], ['a'], 1);
  assert.deepEqual(invoke('score', { litigation: empty, evidence: empty, work: empty }), {
    litigation: 0, evidence: 0, work: 0, total: 0,
  });
});

test('scoring rejects out-of-range or non-finite rates', () => {
  const full = { rate: 1, passed: true };
  for (const rate of [-0.01, 1.2, NaN, Infinity]) {
    assert.equal(invoke('score', { litigation: full, evidence: full, work: { rate, passed: true } }), null);
  }
});

test('moveItem changes order without mutating the original array', () => {
  const original = ['a', 'b', 'c', 'd'];
  assert.deepEqual(invoke('moveItem', original, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(invoke('moveItem', original, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(original, ['a', 'b', 'c', 'd']);
});

test('moveItem safely ignores out-of-range or non-integer indexes', () => {
  const original = ['a', 'b'];
  for (const [from, to] of [[-1, 1], [0, 2], [0.5, 1], [0, undefined]]) {
    const result = invoke('moveItem', original, from, to);
    assert.deepEqual(result, original);
    assert.notEqual(result, original);
  }
});

test('addUnique preserves insertion order and leaves both input arrays untouched', () => {
  const items = ['a', 'b'];
  const ids = ['b', 'c', 'c', 'd'];
  assert.deepEqual(invoke('addUnique', items, ids), ['a', 'b', 'c', 'd']);
  assert.deepEqual(items, ['a', 'b']);
  assert.deepEqual(ids, ['b', 'c', 'c', 'd']);
});
