// "Will it still work?" for a memory chip with damaged pads. Pure (no DOM).
//
// Every ball plays one of three roles:
//   critical  — a single, unshared line (DQ, CA, CKE, CK, the used WCK pair,
//               RESET, ZQ, VREFC …): lose it and the chip cannot work;
//   redundant — one of many balls on the same rail (VSS, VDD, VDDQ, VPP): the
//               chip keeps working while at least one ball of the rail is left;
//   optional  — JTAG and the balls JEDEC marks ", NC" (the second WCK pair of
//               each channel, RFU): not needed for the chip to run.
// Vendor caveats (Samsung needs both VPP pairs) come back as warnings, so a
// verdict is 'ok', 'warn' or 'fail'.

import { memClassForName } from './bga.mjs';

const RAIL_CLASSES = {
  'mem-vss': 'VSS',
  'mem-vdd': 'VDD',
  'mem-vddq': 'VDDQ',
  'mem-vpp': 'VPP',
};

// Losing this share of a rail's balls or more is survivable on paper but worth a
// warning. Only for the wide rails; VPP's four balls have their own vendor rule.
const RAIL_WARN_SHARE = 0.5;
const RAIL_WARN_MIN_BALLS = 8;

// Per-package caveats on top of the role rules: [balls, note], raised when all of balls are damaged.
const VENDOR_CAVEATS = {
  gddr6: [
    [['A5', 'A10'], 'Both VPP balls of the top pair (A5, A10) are damaged: works on Micron / SK hynix, but Samsung chips need both VPP pairs and will NOT work.'],
    [['V5', 'V10'], 'Both VPP balls of the bottom pair (V5, V10) are damaged: works on Micron / SK hynix, but Samsung chips need both VPP pairs and will NOT work.'],
  ],
};

export function ballRole(pkg, ball) {
  const name = pkg.balls.get(ball);
  if (name == null) throw new RangeError(`${pkg.name}: no ball ${ball}`);
  const cls = memClassForName(name);
  if (RAIL_CLASSES[cls]) {
    const rail = [...pkg.balls].filter(([, n]) => memClassForName(n) === cls).map(([b]) => b);
    return { role: 'redundant', rail: RAIL_CLASSES[cls], railBalls: rail };
  }
  if (pkg.nc.has(ball) || cls === 'mem-jtag') return { role: 'optional' };
  return { role: 'critical' };
}

// One line for the pin panel: what losing this ball means.
export function ballRoleText(pkg, ball) {
  const r = ballRole(pkg, ball);
  if (r.role === 'critical') return 'Critical: the chip will not work if this ball is damaged.';
  if (r.role === 'optional') return 'Not needed: the chip works without this ball (JTAG / NC in JEDEC).';
  return `Redundant: one of ${r.railBalls.length} ${r.rail} balls; the chip keeps working while at least one is intact.`;
}

/**
 * @param {Object} pkg       a package from js/bga.mjs
 * @param {Iterable<string>} damaged  ball ids marked as damaged (unknown ids are ignored)
 * @returns {{ verdict: 'none'|'ok'|'warn'|'fail', critical: string[], lostRails: string[],
 *             optional: string[], warnings: string[] }}
 */
export function assessDamage(pkg, damaged) {
  const hit = new Set([...damaged].filter(b => pkg.balls.has(b)));
  const critical = [];
  const optional = [];
  const rails = new Map(); // rail → { balls, hit }
  for (const ball of pkg.balls.keys()) {
    const r = ballRole(pkg, ball);
    if (r.role === 'redundant') {
      const e = rails.get(r.rail) ?? { balls: r.railBalls, hit: 0 };
      if (hit.has(ball)) e.hit++;
      rails.set(r.rail, e);
    } else if (hit.has(ball)) {
      (r.role === 'critical' ? critical : optional).push(ball);
    }
  }

  const lostRails = [];
  const warnings = [];
  for (const [rail, e] of rails) {
    if (e.hit === e.balls.length) lostRails.push(rail);
    else if (e.hit > 0 && e.balls.length >= RAIL_WARN_MIN_BALLS && e.hit / e.balls.length >= RAIL_WARN_SHARE) {
      warnings.push(`${e.hit} of ${e.balls.length} ${rail} balls are damaged: still connected, but the rail is weak; expect instability under load.`);
    }
  }
  if (!lostRails.length) {
    for (const [balls, note] of VENDOR_CAVEATS[pkg.id] ?? []) {
      if (balls.every(b => hit.has(b))) warnings.push(note);
    }
  }

  let verdict = 'ok';
  if (!hit.size) verdict = 'none';
  else if (critical.length || lostRails.length) verdict = 'fail';
  else if (warnings.length) verdict = 'warn';
  return { verdict, critical, lostRails, optional, warnings };
}
