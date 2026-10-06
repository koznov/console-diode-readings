import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKAGES, memPinsForClass } from '../js/bga.mjs';
import { ballRole, ballRoleText, assessDamage } from '../js/damage.mjs';

const g = PACKAGES.gddr6;
const rail = (cls) => memPinsForClass(g, cls);

test('roles: unshared lines are critical, rails redundant, JTAG and JEDEC-NC balls optional', () => {
  for (const b of ['A3', 'G10', 'M10', 'J10', 'K10', 'D4', 'D5', 'R10', 'R11', 'J1', 'J14', 'K1', 'C2', 'D2', 'J5']) {
    assert.equal(ballRole(g, b).role, 'critical', b);
  }
  for (const b of ['D10', 'D11', 'R4', 'R5', 'G5', 'M5', 'F5', 'F10', 'N5', 'N10']) {
    assert.equal(ballRole(g, b).role, 'optional', b);
  }
  assert.deepEqual(ballRole(g, 'A2'), { role: 'redundant', rail: 'VSS', railBalls: rail('mem-vss') });
  assert.equal(ballRole(g, 'A5').rail, 'VPP');
  assert.throws(() => ballRole(g, 'A7'), RangeError);
});

test('role text for the pin panel', () => {
  assert.match(ballRoleText(g, 'G10'), /^Critical/);
  assert.match(ballRoleText(g, 'F5'), /^Not needed/);
  assert.equal(ballRoleText(g, 'H2'), 'Redundant: one of 12 VDD balls; the chip keeps working while at least one is intact.');
});

test('nothing marked → none; only rails or unused balls → ok', () => {
  assert.equal(assessDamage(g, []).verdict, 'none');
  const r = assessDamage(g, ['A2', 'B1', 'H2', 'D10', 'F5', 'nonsense']);
  assert.equal(r.verdict, 'ok');
  assert.deepEqual(r.critical, []);
  assert.deepEqual(r.optional, ['D10', 'F5']);
});

test('one damaged CKE_n is enough to fail, and it is named', () => {
  const r = assessDamage(g, ['G10', 'A2']);
  assert.equal(r.verdict, 'fail');
  assert.deepEqual(r.critical, ['G10']);
});

test('a rail fails only when every one of its balls is damaged', () => {
  const vdd = rail('mem-vdd');
  assert.notEqual(assessDamage(g, vdd.slice(1)).verdict, 'fail');
  const r = assessDamage(g, vdd);
  assert.equal(r.verdict, 'fail');
  assert.deepEqual(r.lostRails, ['VDD']);
});

test('half a rail or more damaged → warn, below half → ok', () => {
  const vddq = rail('mem-vddq');
  assert.equal(assessDamage(g, vddq.slice(0, 13)).verdict, 'ok');
  const r = assessDamage(g, vddq.slice(0, 14));
  assert.equal(r.verdict, 'warn');
  assert.match(r.warnings[0], /14 of 28 VDDQ/);
});

test('a whole VPP pair → warn that Samsung will not work; all four → fail', () => {
  const top = assessDamage(g, ['A5', 'A10']);
  assert.equal(top.verdict, 'warn');
  assert.ok(top.warnings.some(w => /A5, A10.*Samsung/.test(w)), JSON.stringify(top.warnings));
  assert.equal(assessDamage(g, ['A5', 'V10']).verdict, 'ok');
  const all = assessDamage(g, ['A5', 'A10', 'V5', 'V10']);
  assert.equal(all.verdict, 'fail');
  assert.deepEqual(all.lostRails, ['VPP']);
  assert.ok(!all.warnings.some(w => /Samsung/.test(w)), 'no caveat once the rail is gone');
});
