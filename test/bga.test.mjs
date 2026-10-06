import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PACKAGES, getPackage, ballIds, memClassForName, memPinInfo, memPinsForClass,
  MEM_SIGNAL_CLASSES, MEM_LEGEND_GROUPS, bgaSvgMarkup, bgaViewBox,
} from '../js/bga.mjs';
import { kindOf, rawPinKey } from '../js/kinds.mjs';
import { loadBoard } from '../js/loader.mjs';
import { scaleReading, keepDecimals, parseValue } from '../js/values.mjs';
import { validateConnector } from '../admin/js/validate.mjs';
import { finalizeConnectors } from '../admin/js/views/pins.mjs';

const gddr6 = PACKAGES.gddr6;

// ---- ball map ---------------------------------------------------------------------

test('GDDR6 has 180 balls: rows A..V without I/O/Q/S, columns 1-5 and 10-14', () => {
  assert.equal(gddr6.balls.size, 180);
  assert.deepEqual(gddr6.rowLabels, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'T', 'U', 'V']);
  assert.deepEqual(gddr6.columns, [1, 2, 3, 4, 5, 10, 11, 12, 13, 14]);
  assert.equal(ballIds(gddr6)[0], 'A1');
  assert.equal(ballIds(gddr6)[179], 'V14');
});

test('GDDR6 ball names sit where the datasheet puts them', () => {
  const at = (b) => gddr6.balls.get(b);
  assert.equal(at('A1'), 'VDD');
  assert.equal(at('A3'), 'DQ1_A');
  assert.equal(at('D4'), 'WCK0_t_A');
  assert.equal(at('J1'), 'RESET_n');
  assert.equal(at('J10'), 'CK_t');
  assert.equal(at('K10'), 'CK_c');
  assert.equal(at('K1'), 'VREFC');
  assert.equal(at('V3'), 'DQ1_B');
  // measured as I/O supply on CFI-1216A (reads like every other VDDQ, not like VSS)
  assert.equal(at('H14'), 'VDDQ');
  assert.equal(at('L14'), 'VDDQ');
});

test('channel B mirrors channel A: every _A signal has a _B twin', () => {
  const names = new Set(gddr6.balls.values());
  for (const n of names) {
    if (n.endsWith('_A')) assert.ok(names.has(n.replace(/_A$/, '_B')), `${n} has no channel-B twin`);
  }
  const count = (re) => [...gddr6.balls.values()].filter(n => re.test(n)).length;
  assert.equal(count(/^DQ\d+_A$/), 16);
  assert.equal(count(/^DQ\d+_B$/), 16);
  assert.equal(count(/^CA\d_[AB]$/), 20);
});

test('every ball name maps to a known class; names drive the class', () => {
  for (const n of gddr6.balls.values()) assert.ok(MEM_SIGNAL_CLASSES[memClassForName(n)], n);
  assert.equal(memClassForName('VDDQ'), 'mem-vddq');
  assert.equal(memClassForName('DQ12_B'), 'mem-dq');
  assert.equal(memClassForName('DBI0_n_A'), 'mem-dbi');
  assert.equal(memClassForName('EDC1_B'), 'mem-dbi');
  assert.equal(memClassForName('WCK1_c_A'), 'mem-wck');
  assert.equal(memClassForName('CABI_n_A'), 'mem-ca');
  assert.equal(memClassForName('CKE_n_B'), 'mem-ca');
  assert.equal(memClassForName('ZQ_A'), 'mem-misc');
  assert.equal(memClassForName('RFU_B'), 'mem-jtag');
  assert.throws(() => memClassForName('BOGUS'), /no signal class/);
});

test('memPinInfo describes a ball the way the tooltip shows it', () => {
  assert.deepEqual(memPinInfo(gddr6, 'B3'), {
    pin: 'B3', short: 'DQ2_A', name: 'Data, channel A', className: 'mem-dq',
    classDisplayName: 'DQ (data)', description: MEM_SIGNAL_CLASSES['mem-dq'].description,
  });
  assert.equal(memPinInfo(gddr6, 'D4').name, 'Write clock, true, channel A');
  assert.equal(memPinInfo(gddr6, 'G10').name, 'Clock enable, active low, channel A');
  assert.equal(memPinInfo(gddr6, 'A2').name, 'Ground');
  assert.throws(() => memPinInfo(gddr6, 'A7'), RangeError);
  // a valid override wins, an unknown one falls back
  assert.equal(memPinInfo(gddr6, 'B3', 'mem-misc').className, 'mem-misc');
  assert.equal(memPinInfo(gddr6, 'B3', 'nope').className, 'mem-dq');
});

test('memPinsForClass lists balls in map order', () => {
  assert.deepEqual(memPinsForClass(gddr6, 'mem-vpp'), ['A5', 'A10', 'V5', 'V10']);
  assert.deepEqual(memPinsForClass(gddr6, 'mem-ck'), ['J10', 'K10']);
  assert.deepEqual(memPinsForClass(gddr6, 'nope'), []);
});

test('legend groups cover every memory class exactly once', () => {
  const listed = MEM_LEGEND_GROUPS.flatMap(g => g.classes);
  assert.deepEqual([...listed].sort(), Object.keys(MEM_SIGNAL_CLASSES).sort());
});

test('getPackage rejects an unknown package', () => {
  assert.equal(getPackage('gddr6'), gddr6);
  assert.throws(() => getPackage('gddr9'), /unknown BGA package "gddr9"/);
  assert.throws(() => getPackage('toString'), /unknown BGA package/);
});

// ---- grid markup --------------------------------------------------------------------

test('bgaSvgMarkup draws one pad-group per ball with the value slots the viewer fills', () => {
  const svg = bgaSvgMarkup(gddr6);
  const pins = [...svg.matchAll(/class="pad-group" data-pin="([A-Z]\d+)"/g)].map(m => m[1]);
  assert.deepEqual(pins, ballIds(gddr6));
  for (const cls of ['pad', 'pad-value', 'pad-value-adj', 'pad-caret']) {
    assert.equal(svg.split(`class="${cls}"`).length - 1, 180, cls);
  }
  assert.match(svg, /<text class="pad-label ball-name"[^>]*>DQ1_A<\/text>/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.equal(svg.split('class="grid-label"').length - 1, 10 + 18);
});

test('the depopulated middle leaves a gap between columns 5 and 10', () => {
  const [, , w] = bgaViewBox(gddr6);
  const x = (b) => Number(new RegExp(`data-pin="${b}">[\\s\\S]*?<rect class="pad" x="([\\d.]+)"`).exec(bgaSvgMarkup(gddr6))[1]);
  const pitch = x('A2') - x('A1');
  assert.ok(x('A10') - x('A5') > pitch * 1.3, 'expected a visible gap');
  assert.ok(x('A14') < w);
});

// ---- kinds ---------------------------------------------------------------------------

test('kindOf: a connector with a package is a chip keyed by ball, anything else is HDMI', () => {
  const hdmi = kindOf({ id: 'hdmi' });
  assert.equal(hdmi.isBga, false);
  assert.equal(hdmi.keys().length, 19);
  assert.equal(rawPinKey(hdmi, { num: 3 }), 3);
  assert.equal(hdmi.parseKey('7'), 7);

  const chip = kindOf({ id: 'ram', package: 'gddr6' });
  assert.equal(chip.isBga, true);
  assert.equal(chip.pinWord, 'Ball');
  assert.equal(chip.keys().length, 180);
  assert.equal(rawPinKey(chip, { ball: ' b3 ' }), 'B3');
  assert.equal(rawPinKey(chip, { num: 3 }), null);
  assert.ok(chip.hasKey('V14'));
  assert.ok(!chip.hasKey('A6'));
  assert.equal(chip.pinInfo('J10').short, 'CK_t');
  assert.throws(() => kindOf({ package: 'lpddr5' }), /unknown BGA package/);
});

// ---- loader -----------------------------------------------------------------------------

const allBalls = (value = '0.25') => ballIds(gddr6).map(ball => ({ ball, value }));
function chipBoard(pins, extra = {}) {
  return {
    id: 'chip', consoleId: 'x', revision: 'R', notes: [], photos: [],
    connectors: [{ id: 'ram', type: 'GDDR6', package: 'gddr6', label: 'RAM', measurement: { mode: 'diode', pins }, ...extra }],
  };
}
const fetchOf = (board) => async () => ({ ok: true, json: async () => board });
const ENTRY = { id: 'chip', revision: 'R', file: 'x.json' };

test('loadBoard reads a chip: balls keyed by id, classed by name, no warnings', async () => {
  const board = await loadBoard(ENTRY, fetchOf(chipBoard(allBalls())));
  const conn = board.connectors[0];
  assert.equal(conn.package, 'gddr6');
  assert.equal(conn.pinCount, 180);
  assert.equal(conn.measurement.pins.length, 180);
  const b3 = conn.measurement.pins.find(p => p.num === 'B3');
  assert.equal(b3.signalClass, 'mem-dq');
  assert.equal(b3.parsed.kind, 'numeric');
  assert.deepEqual(board.warnings, []);
});

test('loadBoard warns about missing, unknown and repeated balls but keeps the rest', async () => {
  const pins = allBalls().filter(p => p.ball !== 'V14');
  pins.push({ ball: 'A7', value: '0.2' }, { ball: 'A1', value: '0.3' }, { num: 4, value: '0.2' });
  const board = await loadBoard(ENTRY, fetchOf(chipBoard(pins)));
  const conn = board.connectors[0];
  assert.equal(conn.measurement.pins.length, 179);
  assert.equal(conn.measurement.pins.find(p => p.num === 'A1').raw, '0.25', 'first reading wins');
  const w = board.warnings.join('\n');
  assert.match(w, /ball A7 does not exist on GDDR6/);
  assert.match(w, /ball \(none\) does not exist/);
  assert.match(w, /ball A1 listed twice/);
  assert.match(w, /missing balls V14/);
});

test('loadBoard skips a connector whose package is unknown, with a warning, and keeps the others', async () => {
  const raw = chipBoard(allBalls());
  raw.connectors.unshift({ id: 'weird', package: 'hbm9', measurement: { pins: [] } });
  const board = await loadBoard(ENTRY, fetchOf(raw));
  assert.deepEqual(board.connectors.map(c => c.id), ['ram']);
  assert.match(board.warnings[0], /weird: unknown BGA package "hbm9"; connector skipped/);
});

// ---- the CFI-1216A sheet ------------------------------------------------------------------

test('CFI-1216A GDDR6 readings: all 180 balls, and the patterns a good chip shows', async () => {
  const raw = JSON.parse(await readFile(new URL('../data/consoles/ps5-phat-cfi-1216a.json', import.meta.url)));
  const board = await loadBoard({ id: 'cfi-1216a', revision: 'CFI-1216A', file: 'x' }, fetchOf(raw));
  assert.deepEqual(board.warnings, []);
  assert.deepEqual(board.connectors.map(c => c.id), ['hdmi', 'gddr6']);
  const pins = board.connectors[1].measurement.pins;
  assert.equal(pins.length, 180);

  // A slip while copying the sheet shows up as a ball that breaks its class's pattern.
  const byClass = (cls) => pins.filter(p => p.signalClass === cls);
  for (const p of [...byClass('mem-vss'), ...byClass('mem-vdd'), ...byClass('mem-vddq')]) {
    assert.equal(p.parsed.kind, 'zero', `${p.num} ${p.raw}`);
  }
  for (const p of byClass('mem-vpp')) assert.ok(p.parsed.volts > 0.14 && p.parsed.volts < 0.16, `${p.num} ${p.raw}`);
  for (const cls of ['mem-dq', 'mem-dbi', 'mem-wck', 'mem-ck', 'mem-ca']) {
    for (const p of byClass(cls)) assert.ok(p.parsed.volts > 0.24 && p.parsed.volts < 0.28, `${p.num} ${p.raw}`);
  }
  const at = (b) => pins.find(p => p.num === b);
  for (const b of ['F5', 'F10', 'N5', 'N10', 'G5', 'M5']) assert.equal(at(b).parsed.kind, 'ol', b);
  assert.equal(at('J1').raw, '0.2568');   // RESET_n
  assert.equal(at('J14').raw, '0.0429');  // ZQ_A
  assert.equal(at('J12').raw, '0.2763');  // CA6_A, the highest reading on the sheet
  assert.match(at('D10').note, /NC/);
});

// ---- calibration keeps a chip's precision ------------------------------------------------------

test('scaleReading keeps 2 decimals by default and more on request', () => {
  assert.equal(scaleReading(parseValue('0.2579'), 1.05).raw, '0.27');
  assert.equal(scaleReading(parseValue('0.2579'), 1.05, 4).raw, '0.2708');
  assert.equal(keepDecimals(parseValue('0.2579')), 4);
  assert.equal(keepDecimals(parseValue('0.26')), 2);
  assert.equal(keepDecimals(parseValue('0.5')), 2);
  assert.equal(kindOf({ package: 'gddr6' }).calDecimals(parseValue('0.257')), 3);
  assert.equal(kindOf({}).calDecimals(parseValue('0.809')), 2);
});

// ---- admin ---------------------------------------------------------------------------------------

test('admin validateConnector checks balls against the package', () => {
  const conn = chipBoard([{ ball: 'A1', value: '0.006' }]).connectors[0];
  assert.deepEqual(validateConnector(conn), []);
  conn.measurement.pins.push({ ball: 'A7', value: '0.2' }, { ball: 'A1', value: 'OL' }, { ball: 'B3', value: 'abc' });
  const errs = validateConnector(conn);
  assert.match(errs[0], /ball A7 does not exist on GDDR6/);
  assert.match(errs[1], /duplicate ball A1/);
  assert.match(errs[2], /ball B3: invalid reading/);
  assert.match(validateConnector({ id: 'x', package: 'nope' })[0], /unknown BGA package/);
});

test('admin finalizeConnectors keeps chip balls in map order and drops unmeasured ones', () => {
  const board = chipBoard([
    { ball: 'B3', value: ' ol ' }, { ball: 'A1', value: '0.0061', note: 'n' }, { ball: 'C2', value: '' },
  ]);
  finalizeConnectors(board);
  assert.deepEqual(board.connectors[0].measurement.pins, [
    { ball: 'A1', value: '0.0061', note: 'n' },
    { ball: 'B3', value: 'OL' },
  ]);
});
