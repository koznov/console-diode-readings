import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSignal, resolveSignalClass, SIGNAL_CLASSES, LEGEND_GROUPS, HDMI_PIN_COUNT, PIN_NAMES, PIN_SHORT, pinInfo, pinsForClass } from '../js/signals.mjs';

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

// ---- Per-pin identity (used by the detail panel + tooltip) ----------------

test('PIN_NAMES names every HDMI pin with its specific line', () => {
  assert.equal(Object.keys(PIN_NAMES).length, HDMI_PIN_COUNT);
  assert.equal(PIN_NAMES[1], 'TMDS Data2+');
  assert.equal(PIN_NAMES[2], 'TMDS Data2 Shield');
  assert.equal(PIN_NAMES[10], 'TMDS Clock+');
  assert.equal(PIN_NAMES[13], 'CEC');
  assert.equal(PIN_NAMES[14], 'Utility / HEAC');
  assert.equal(PIN_NAMES[15], 'SCL (DDC)');
  assert.equal(PIN_NAMES[16], 'SDA (DDC)');
  assert.equal(PIN_NAMES[17], 'DDC/CEC Ground');
  assert.equal(PIN_NAMES[18], '+5V Power');
  assert.equal(PIN_NAMES[19], 'Hot Plug Detect');
});

test('pinInfo bundles name, class, class display name and description', () => {
  const i = pinInfo(15);
  assert.equal(i.pin, 15);
  assert.equal(i.name, 'SCL (DDC)');
  assert.equal(i.className, 'ddc');
  assert.equal(i.classDisplayName, 'DDC (SCL/SDA)');
  assert.match(i.description, /EDID|I²C|I2C/);
});

test('pinInfo honours a class override but keeps the canonical pin name', () => {
  const i = pinInfo(2, 'power-5v');
  assert.equal(i.name, 'TMDS Data2 Shield');
  assert.equal(i.className, 'power-5v');
  assert.equal(i.classDisplayName, '+5V Power');
});

test('pinInfo throws outside 1..19', () => {
  assert.throws(() => pinInfo(0), RangeError);
  assert.throws(() => pinInfo(20), RangeError);
});

test('every signal class carries a non-empty description', () => {
  for (const [cls, meta] of Object.entries(SIGNAL_CLASSES)) {
    assert.ok(typeof meta.description === 'string' && meta.description.length > 10, `${cls} lacks description`);
  }
});

// ---- Schematic short names (as printed on the HDMI_A symbol) --------------
test('PIN_SHORT gives the schematic label for every pin', () => {
  assert.deepEqual(
    Array.from({ length: HDMI_PIN_COUNT }, (_, i) => PIN_SHORT[i + 1]),
    ['D2+', 'GND', 'D2−', 'D1+', 'GND', 'D1−', 'D0+', 'GND', 'D0−',
     'CK+', 'GND', 'CK−', 'CEC', 'UTILITY', 'SCL', 'SDA', 'GND', '+5V', 'HPD'],
  );
});

test('pinInfo carries the short schematic name too', () => {
  assert.equal(pinInfo(15).short, 'SCL');
  assert.equal(pinInfo(19).short, 'HPD');
  assert.equal(pinInfo(2).short, 'GND');
});

test('pinsForClass lists the canonical pins of a class in ascending order', () => {
  assert.deepEqual(pinsForClass('gnd'), [2, 5, 8, 11, 17]);
  assert.deepEqual(pinsForClass('tmds-data-pos'), [1, 4, 7]);
  assert.deepEqual(pinsForClass('ddc'), [15, 16]);
  assert.deepEqual(pinsForClass('hpd'), [19]);
  assert.deepEqual(pinsForClass('nope'), []);
});

test('ground description never calls a ground pin a "short" (reads as a fault to a technician)', () => {
  assert.doesNotMatch(SIGNAL_CLASSES.gnd.description, /short/i);
  assert.match(SIGNAL_CLASSES.gnd.description, /connected .*ground/i);
});
