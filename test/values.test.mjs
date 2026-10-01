import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValue, formatValue, emphasisKind } from '../js/values.mjs';

test('parseValue recognizes OL (case-insensitive, trimmed)', () => {
  for (const r of ['OL', ' ol ', 'Ol']) {
    const p = parseValue(r);
    assert.equal(p.kind, 'ol');
    assert.equal(p.volts, null);
    assert.equal(emphasisKind(p), 'ol');
  }
});

test('parseValue recognizes zero / near-zero', () => {
  for (const r of ['0', '0.0', '0.00', '0.001']) {
    const p = parseValue(r);
    assert.equal(p.kind, 'zero');
    assert.equal(emphasisKind(p), 'low');
  }
});

test('parseValue parses numeric volt drops', () => {
  const p = parseValue('0.79');
  assert.equal(p.kind, 'numeric');
  assert.equal(p.volts, 0.79);
  assert.equal(formatValue(p), '0.79 V');
  assert.equal(emphasisKind(p), 'normal');
});

test('parseValue preserves trailing precision in raw', () => {
  assert.equal(parseValue('2.80').volts, 2.80);
  assert.equal(parseValue('2.81').raw, '2.81');
});

test('garbage values throw (loud, not silent)', () => {
  for (const bad of ['', 'o', 'abc', 'NaN']) {
    assert.throws(() => parseValue(bad), /invalid reading/i, `expected throw for ${JSON.stringify(bad)}`);
  }
});

test('negative or absurd numerics throw', () => {
  assert.throws(() => parseValue('-0.5'), /invalid reading/i);
  assert.throws(() => parseValue('999'), /out of plausible range/i);
});
