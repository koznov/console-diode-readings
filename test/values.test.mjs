import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValue, formatValue, emphasisKind, calibrationFactor, scaleReading, formatOffset } from '../js/values.mjs';

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

// ---- Meter calibration: rescale our readings to the user's multimeter -----
test('calibrationFactor is yours / ours for two numeric readings', () => {
  assert.equal(calibrationFactor(parseValue('0.79'), '0.83'), 0.83 / 0.79);
  assert.equal(calibrationFactor(parseValue('0.50'), ' 0.5 '), 1);
});

test('calibrationFactor refuses OL / zero / garbage on either side', () => {
  assert.throws(() => calibrationFactor(parseValue('OL'), '0.8'), /numeric/i);
  assert.throws(() => calibrationFactor(parseValue('0.79'), 'OL'), /numeric/i);
  assert.throws(() => calibrationFactor(parseValue('0.79'), '0'), /numeric/i);
  assert.throws(() => calibrationFactor(parseValue('0.79'), 'abc'), /invalid|numeric/i);
});

test('scaleReading rescales numeric readings to 2 decimals', () => {
  const s = scaleReading(parseValue('0.79'), 1.05);
  assert.equal(s.kind, 'numeric');
  assert.equal(s.raw, '0.83');
  assert.equal(s.volts, 0.83);
  assert.equal(formatValue(s), '0.83 V');
});

test('scaleReading leaves OL and ground readings alone (returns null)', () => {
  assert.equal(scaleReading(parseValue('OL'), 1.05), null);
  assert.equal(scaleReading(parseValue('0'), 1.05), null);
});

test('formatOffset renders a signed percentage', () => {
  assert.equal(formatOffset(1.051), '+5.1 %');
  assert.equal(formatOffset(0.968), '−3.2 %');
  assert.equal(formatOffset(1), '±0 %');
  assert.equal(formatOffset(1.0003), '±0 %');
});
