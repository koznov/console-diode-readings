import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePinValue, validateConnector, validatePhoto, validateBoard, validateConsole } from '../admin/js/validate.mjs';

// ---- pin values -----------------------------------------------------------------

test('validatePinValue accepts blanks and every reading the site parses', () => {
  for (const ok of [null, undefined, '', '   ', '0.809', '0', 'OL', 'ol']) {
    assert.equal(validatePinValue(ok), null, `expected OK for ${JSON.stringify(ok)}`);
  }
});

test('validatePinValue reports the parser message on bad readings', () => {
  assert.match(validatePinValue('-1'), /negative/);
  assert.match(validatePinValue('999'), /plausible range/);
  assert.match(validatePinValue('abc'), /invalid reading/);
});

// ---- connectors -------------------------------------------------------------------

const goodConnector = (over = {}) => ({
  id: 'hdmi',
  type: 'HDMI',
  pinCount: 19,
  measurement: { mode: 'diode', probes: { red: 'GND', black: 'signal pin' }, unit: 'V (drop)', pins: [] },
  ...over,
});

test('validateConnector passes a well-formed connector', () => {
  const conn = goodConnector();
  conn.measurement.pins = [
    { num: 1, value: '0.809' },
    { num: 5, value: 'OL' },
    { num: 19, value: '' }, // unmeasured pin is fine pre-finalize
  ];
  assert.deepEqual(validateConnector(conn), []);
});

test('validateConnector flags a missing id', () => {
  const conn = goodConnector(); delete conn.id;
  assert.match(validateConnector(conn)[0], /id is required/);
});

test('validateConnector rejects out-of-range and duplicate pins', () => {
  const oob = goodConnector({ pinCount: 4 });
  oob.measurement.pins = [{ num: 5, value: '0.8' }];
  assert.match(validateConnector(oob)[0], /out of range 1\.\.4/);

  const dup = goodConnector();
  dup.measurement.pins = [{ num: 2, value: '0.8' }, { num: 2, value: 'OL' }];
  assert.match(validateConnector(dup)[0], /duplicate pin 2/);
});

test('validateConnector reports unparseable pin values', () => {
  const conn = goodConnector();
  conn.measurement.pins = [{ num: 3, value: 'abc' }];
  assert.match(validateConnector(conn)[0], /pin 3.*invalid reading/);
});

// ---- photos ------------------------------------------------------------------------

test('validatePhoto requires an object with a src', () => {
  assert.deepEqual(validatePhoto(null), ['photo #1: not an object']);
  assert.match(validatePhoto({ caption: 'x' })[0], /src is required/);
});

test('validatePhoto passes a plain entry without anchors', () => {
  assert.deepEqual(validatePhoto({ src: 'assets/photos/ps5-edm-010/a.png' }), []);
});

test('validatePhoto requires a positive size when anchors are present', () => {
  const p = { src: 'x.png', anchors: { '1': [1, 2], '19': [3, 4] } };
  assert.match(validatePhoto(p)[0], /positive size/);
});

test('validatePhoto runs the anchor geometry check (exactly two distinct pins)', () => {
  const one = { src: 'x.png', size: [100, 50], anchors: { '1': [10, 20] } };
  assert.match(validatePhoto(one)[0], /exactly two pins/);

  const samePin = { src: 'x.png', size: [100, 50], anchors: { '1': [10, 20], '19': [10, 20] } };
  assert.match(validatePhoto(samePin)[0], /apart from each other/);

  const good = { src: 'x.png', size: [1120, 842], anchors: { '19': [338.1, 589.7], '1': [805.6, 589.2] } };
  assert.deepEqual(validatePhoto(good), []);
});

// ---- board + console ------------------------------------------------------------------

test('validateBoard requires non-empty id and consoleId; an empty revision is allowed', () => {
  const errors = validateBoard({ revision: '', connectors: [], photos: [] });
  assert.deepEqual(errors, ['id is required', 'consoleId is required']);

  assert.match(validateBoard({ id: 'x', consoleId: 'c', revision: 5 })[0], /revision must be a string/);
});

test('validateBoard passes a minimal valid board and aggregates child errors', () => {
  const ok = { id: 'edm-010', consoleId: 'ps5', revision: '', connectors: [], photos: [] };
  assert.deepEqual(validateBoard(ok), []);

  const bad = { ...ok, connectors: [goodConnector()], photos: [{ caption: 'no src' }] };
  bad.connectors[0].id = ''; // force a connector error too
  const errors = validateBoard(bad);
  assert.ok(errors.some(e => /connector/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some(e => /src is required/.test(e)), JSON.stringify(errors));
});

test('validateConsole requires id, brand, family and name', () => {
  const errors = validateConsole({ id: 'ps5' });
  for (const f of ['brand is required', 'family is required', 'name is required']) {
    assert.ok(errors.includes(f), `missing "${f}" in ${JSON.stringify(errors)}`);
  }
  assert.deepEqual(validateConsole({ id: 'ps5', brand: 'Sony', family: 'PS5', name: 'PlayStation 5' }), []);
});
