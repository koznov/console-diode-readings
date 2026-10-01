import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSignal, resolveSignalClass, SIGNAL_CLASSES, LEGEND_GROUPS, HDMI_PIN_COUNT } from '../js/signals.mjs';

test('canonicalSignal maps all 19 HDMI pins', () => {
  const classes = [];
  for (let p = 1; p <= HDMI_PIN_COUNT; p++) classes.push(canonicalSignal(p).className);
  assert.equal(classes.length, 19);
  // spot-check the corrected mapping from the spec
  assert.equal(canonicalSignal(13).className, 'cec');
  assert.equal(canonicalSignal(14).className, 'utility');
  assert.equal(canonicalSignal(15).className, 'ddc');
  assert.equal(canonicalSignal(16).className, 'ddc');
  assert.equal(canonicalSignal(17).className, 'gnd');
  assert.equal(canonicalSignal(18).className, 'power-5v');
  assert.equal(canonicalSignal(19).className, 'hpd');
});

test('canonicalSignal throws outside 1..19', () => {
  assert.throws(() => canonicalSignal(0), RangeError);
  assert.throws(() => canonicalSignal(20), RangeError);
});

test('every referenced className exists in SIGNAL_CLASSES', () => {
  for (let p = 1; p <= HDMI_PIN_COUNT; p++) {
    const cls = canonicalSignal(p).className;
    assert.ok(SIGNAL_CLASSES[cls], `missing class metadata for "${cls}"`);
  }
});

test('unknown className falls back to canonical via resolveSignalClass', () => {
  // valid override
  assert.equal(resolveSignalClass(2, 'power-5v'), 'power-5v');
  // invalid override falls back to canonical for that pin
  assert.equal(resolveSignalClass(2, 'grnd'), 'gnd');
  // no override uses canonical
  assert.equal(resolveSignalClass(2, undefined), 'gnd');
});

test('LEGEND_GROUPS lists every class exactly once', () => {
  const all = LEGEND_GROUPS.flatMap(g => g.classes);
  assert.equal(all.length, Object.keys(SIGNAL_CLASSES).length);
  for (const cls of Object.keys(SIGNAL_CLASSES)) {
    assert.equal(all.filter(c => c === cls).length, 1, `${cls} appeared ${all.filter(c=>c===cls).length}x`);
  }
});
