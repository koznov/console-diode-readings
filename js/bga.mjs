// BGA memory packages: ball maps, signal classes and the grid markup the viewer
// draws them with. Pure (no DOM) so it can be tested without a browser.
//
// A ball map is written row by row as it reads on the datasheet (top view):
// one string per row label, ball names separated by whitespace, '.' for a
// column with no ball. Names follow JEDEC (JESD250 for GDDR6); the class of a
// ball is derived from its name, so one table drives colours, legend and tooltips.

import { escapeHtml } from './ui.mjs';

// ---- GDDR6, 180 balls (x16 two-channel, 0.75 mm pitch) -----------------------
// As JESD250 Figure 117 "GDDR6 SGRAM 180 ball BGA Ball-out" draws it: top view,
// as seen through the package, which is also how the pads lie on the board once
// the chip is off. Columns 1-5 and 10-14; 6-9 are the depopulated middle. Channel A sits in rows
// A-J, channel B mirrors it in rows K-V.
const GDDR6_COLUMNS = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14];
const GDDR6_ROWS = {
  A: 'VDD      VSS      DQ1_A    VSS      VPP       VPP      VSS      DQ9_A    VSS      VDD',
  B: 'VSS      DQ3_A    DQ2_A    DQ0_A    VDDQ      VDDQ     DQ8_A    DQ10_A   DQ11_A   VSS',
  C: 'VDDQ     EDC0_A   VSS      VDDQ     VSS       VSS      VDDQ     VSS      EDC1_A   VDDQ',
  D: 'VSS      DBI0_n_A VSS      WCK0_t_A WCK0_c_A  WCK1_c_A WCK1_t_A VSS      DBI1_n_A VSS',
  E: 'VDDQ     DQ5_A    DQ4_A    VSS      VDD       VDD      VSS      DQ12_A   DQ13_A   VDDQ',
  F: 'VSS      DQ6_A    VSS      VDDQ     TMS       TDI      VDDQ     VSS      DQ14_A   VSS',
  G: 'VSS      DQ7_A    VSS      CA2_A    RFU_A     CKE_n_A  CA1_A    VSS      DQ15_A   VSS',
  H: 'VDDQ     VDD      CA0_A    VSS      CA4_A     CA5_A    VSS      CA3_A    VDD      VDDQ',
  J: 'RESET_n  VDDQ     CA9_A    CA8_A    CABI_n_A  CK_t     CA7_A    CA6_A    VDDQ     ZQ_A',
  K: 'VREFC    VDDQ     CA9_B    CA8_B    CABI_n_B  CK_c     CA7_B    CA6_B    VDDQ     ZQ_B',
  L: 'VDDQ     VDD      CA0_B    VSS      CA4_B     CA5_B    VSS      CA3_B    VDD      VDDQ',
  M: 'VSS      DQ7_B    VSS      CA2_B    RFU_B     CKE_n_B  CA1_B    VSS      DQ15_B   VSS',
  N: 'VSS      DQ6_B    VSS      VDDQ     TCK       TDO      VDDQ     VSS      DQ14_B   VSS',
  P: 'VDDQ     DQ5_B    DQ4_B    VSS      VDD       VDD      VSS      DQ12_B   DQ13_B   VDDQ',
  R: 'VSS      DBI0_n_B VSS      WCK0_t_B WCK0_c_B  WCK1_c_B WCK1_t_B VSS      DBI1_n_B VSS',
  T: 'VDDQ     EDC0_B   VSS      VDDQ     VSS       VSS      VDDQ     VSS      EDC1_B   VDDQ',
  U: 'VSS      DQ3_B    DQ2_B    DQ0_B    VDDQ      VDDQ     DQ8_B    DQ10_B   DQ11_B   VSS',
  V: 'VDD      VSS      DQ1_B    VSS      VPP       VPP      VSS      DQ9_B    VSS      VDD',
};

// Balls the JEDEC figure itself annotates ", NC": the second WCK pair of each
// channel (unused when a channel runs on one pair) and the RFU balls.
const GDDR6_NC = ['D10', 'D11', 'G5', 'M5', 'R4', 'R5'];

// Classes are shared by every memory package so the CSS (--sig-mem-*) and the
// legend stay the same from one chip to the next.
export const MEM_SIGNAL_CLASSES = {
  'mem-vss':  { displayName: 'VSS (ground)',        legendGroup: 'Power & Ground', cssVar: '--sig-mem-vss',
                description: 'Ground balls. Connected straight to the ground plane, so ~0 in diode mode is normal.' },
  'mem-vdd':  { displayName: 'VDD (core power)',    legendGroup: 'Power & Ground', cssVar: '--sig-mem-vdd',
                description: 'Core supply. A big low-impedance rail, so it reads close to 0 in diode mode; compare against the other VDD balls, not against signals.' },
  'mem-vddq': { displayName: 'VDDQ (I/O power)',    legendGroup: 'Power & Ground', cssVar: '--sig-mem-vddq',
                description: 'I/O supply for the data and command drivers. Reads close to 0 like VDD; every VDDQ ball should match.' },
  'mem-vpp':  { displayName: 'VPP (pump power)',    legendGroup: 'Power & Ground', cssVar: '--sig-mem-vpp',
                description: 'Word-line pump supply. Sits clearly above VDD/VDDQ; all VPP balls are the same net and read alike.' },
  'mem-dq':   { displayName: 'DQ (data)',           legendGroup: 'Data',           cssVar: '--sig-mem-dq',
                description: 'Data lines to the APU memory controller. All DQ balls of a chip read within a few mV of each other; an outlier points at a cracked ball or a damaged controller pin.' },
  'mem-dbi':  { displayName: 'DBI / EDC',           legendGroup: 'Data',           cssVar: '--sig-mem-dbi',
                description: 'Data bus inversion and error-detection lines. Travel with the DQ byte they belong to and read like DQ.' },
  'mem-wck':  { displayName: 'WCK (write clock)',   legendGroup: 'Clock',          cssVar: '--sig-mem-wck',
                description: 'Differential data clock, one pair per byte or per channel. _t and _c read alike; boards that run one WCK pair per channel leave the other pair unused.' },
  'mem-ck':   { displayName: 'CK (command clock)',  legendGroup: 'Clock',          cssVar: '--sig-mem-ck',
                description: 'Differential command clock shared by both channels. CK_t and CK_c read alike.' },
  'mem-ca':   { displayName: 'CA / CABI / CKE',     legendGroup: 'Command',        cssVar: '--sig-mem-ca',
                description: 'Command / address bus, its inversion line and clock enable, one set per channel. Read like the data lines.' },
  'mem-misc': { displayName: 'RESET / ZQ / VREFC',  legendGroup: 'Misc',           cssVar: '--sig-mem-misc',
                description: 'RESET_n is shared by both channels and reads like a signal; ZQ goes to ground through a 120/240 Ω calibration resistor, so it reads low but not zero; VREFC is the CA reference voltage.' },
  'mem-jtag': { displayName: 'JTAG / RFU',          legendGroup: 'Misc',           cssVar: '--sig-mem-jtag',
                description: 'Boundary-scan (TMS, TDI, TDO, TCK) and reserved balls. Usually not connected on console boards, so OL is the normal reading.' },
};

// What each ball name means, beyond its class. Matched on the name without
// its channel suffix and bit number (DQ12_A → DQ).
const FUNCTION_NAMES = {
  VSS: 'Ground', VDD: 'Core supply', VDDQ: 'I/O supply', VPP: 'Pump supply',
  DQ: 'Data', DBI: 'Data bus inversion', EDC: 'Error detection code',
  WCK: 'Write clock', CK: 'Command clock', CA: 'Command / address',
  CABI: 'Command / address bus inversion', CKE: 'Clock enable',
  RESET: 'Reset', ZQ: 'Impedance calibration', VREFC: 'CA reference voltage',
  TMS: 'JTAG test mode select', TDI: 'JTAG test data in', TDO: 'JTAG test data out', TCK: 'JTAG test clock',
  RFU: 'Reserved',
};

function stem(name) {
  return name.replace(/_[AB]$/, '').replace(/_(n|t|c)$/, '').replace(/\d+$/, '');
}

export function memClassForName(name) {
  const s = stem(name);
  switch (s) {
    case 'VSS': return 'mem-vss';
    case 'VDD': return 'mem-vdd';
    case 'VDDQ': return 'mem-vddq';
    case 'VPP': return 'mem-vpp';
    case 'DQ': return 'mem-dq';
    case 'DBI': case 'EDC': return 'mem-dbi';
    case 'WCK': return 'mem-wck';
    case 'CK': return 'mem-ck';
    case 'CA': case 'CABI': case 'CKE': return 'mem-ca';
    case 'RESET': case 'ZQ': case 'VREFC': return 'mem-misc';
    case 'TMS': case 'TDI': case 'TDO': case 'TCK': case 'RFU': return 'mem-jtag';
    default: throw new Error(`no signal class for ball name "${name}"`);
  }
}

function longName(name) {
  const fn = FUNCTION_NAMES[stem(name)] ?? '';
  const ch = /_([AB])$/.exec(name);
  const pol = /_(t|c)(?:_[AB])?$/.exec(name);
  const bits = [fn];
  if (pol) bits.push(pol[1] === 't' ? 'true' : 'complement');
  if (/_n(?:_[AB])?$/.test(name)) bits.push('active low');
  if (ch) bits.push(`channel ${ch[1]}`);
  return bits.filter(Boolean).join(', ');
}

function buildPackage({ id, name, columns, rows, gapAfter, nc = [] }) {
  const balls = new Map(); // "A1" → name
  const rowLabels = Object.keys(rows);
  for (const r of rowLabels) {
    const names = rows[r].trim().split(/\s+/);
    if (names.length !== columns.length) {
      throw new Error(`${id} row ${r}: ${names.length} balls for ${columns.length} columns`);
    }
    names.forEach((n, i) => { if (n !== '.') balls.set(`${r}${columns[i]}`, n); });
  }
  for (const n of balls.values()) memClassForName(n); // every name must classify
  for (const b of nc) if (!balls.has(b)) throw new Error(`${id}: NC ball ${b} is not on the map`);
  return Object.freeze({ id, name, columns, rowLabels, gapAfter, balls, nc: new Set(nc) });
}

export const PACKAGES = {
  gddr6: buildPackage({ id: 'gddr6', name: 'GDDR6 (180-ball)', columns: GDDR6_COLUMNS, rows: GDDR6_ROWS, gapAfter: 5, nc: GDDR6_NC }),
};

export function getPackage(id) {
  const pkg = Object.prototype.hasOwnProperty.call(PACKAGES, id) ? PACKAGES[id] : null;
  if (!pkg) throw new Error(`unknown BGA package "${id}"`);
  return pkg;
}

// Balls in datasheet reading order: row by row, left to right.
export function ballIds(pkg) {
  return [...pkg.balls.keys()];
}

export function memPinInfo(pkg, ball, override) {
  const name = pkg.balls.get(ball);
  if (name == null) throw new RangeError(`${pkg.name}: no ball ${ball}`);
  const canon = memClassForName(name);
  const className = override != null && Object.prototype.hasOwnProperty.call(MEM_SIGNAL_CLASSES, override) ? override : canon;
  const meta = MEM_SIGNAL_CLASSES[className];
  return {
    pin: ball,
    short: name,
    name: pkg.nc.has(ball) ? `${longName(name)}; NC in some configurations` : longName(name),
    className,
    classDisplayName: meta.displayName,
    description: meta.description,
  };
}

export function memPinsForClass(pkg, className) {
  return ballIds(pkg).filter(b => memClassForName(pkg.balls.get(b)) === className);
}

export const MEM_LEGEND_GROUPS = (() => {
  const order = ['Power & Ground', 'Data', 'Clock', 'Command', 'Misc'];
  const map = {};
  for (const [cls, meta] of Object.entries(MEM_SIGNAL_CLASSES)) (map[meta.legendGroup] ??= []).push(cls);
  return order.map(group => ({ group, classes: map[group] }));
})();

// ---- Grid markup ----------------------------------------------------------------
// Same contract as assets/connectors/hdmi.svg: one .pad-group[data-pin] per ball
// holding .pad, .pad-label, .pad-value, .pad-value-adj and .pad-caret, so
// js/pinmap.mjs and css/style.css treat a chip like any other connector. The
// ball name is printed on the pad and the reading under it, like the sheets
// technicians keep. Row letters and column numbers frame the grid.
export const GRID = { cellW: 84, cellH: 56, padH: 22, gap: 36, margin: 28 };

export function ballXY(pkg, ball) {
  const m = /^([A-Z]+)(\d+)$/.exec(ball);
  const ri = m ? pkg.rowLabels.indexOf(m[1]) : -1;
  const ci = m ? pkg.columns.indexOf(Number(m[2])) : -1;
  if (ri < 0 || ci < 0) throw new RangeError(`${pkg.name}: no ball ${ball}`);
  const afterGap = pkg.gapAfter != null && pkg.columns[ci] > pkg.gapAfter;
  const x = GRID.margin + ci * GRID.cellW + (afterGap ? GRID.gap : 0);
  const y = GRID.margin + ri * GRID.cellH;
  return { x, y }; // top-left of the cell
}

export function bgaViewBox(pkg) {
  const w = GRID.margin * 2 + pkg.columns.length * GRID.cellW + (pkg.gapAfter != null ? GRID.gap : 0);
  const h = GRID.margin + pkg.rowLabels.length * GRID.cellH + 8;
  return [0, 0, w, h];
}

export function bgaSvgMarkup(pkg) {
  const [, , w, h] = bgaViewBox(pkg);
  const n = (v) => String(Math.round(v * 100) / 100);
  const padW = GRID.cellW - 6;
  const parts = [];

  for (const c of pkg.columns) {
    const { x } = ballXY(pkg, `${pkg.rowLabels[0]}${c}`);
    parts.push(`<text class="grid-label" x="${n(x + GRID.cellW / 2)}" y="${GRID.margin - 10}">${c}</text>`);
  }
  for (const r of pkg.rowLabels) {
    const { y } = ballXY(pkg, `${r}${pkg.columns[0]}`);
    parts.push(`<text class="grid-label" x="${GRID.margin / 2}" y="${n(y + GRID.padH / 2 + 4)}">${r}</text>`);
  }
  for (const [ball, name] of pkg.balls) {
    const { x, y } = ballXY(pkg, ball);
    const cx = x + GRID.cellW / 2;
    // .pad-hit spans the whole cell so a tap on the reading under the ball selects it too
    parts.push(`<g class="pad-group" data-pin="${ball}">
    <rect class="pad-hit" x="${n(x)}" y="${n(y - 2)}" width="${GRID.cellW}" height="${GRID.cellH}"/>
    <rect class="pad" x="${n(x + 3)}" y="${n(y)}" width="${padW}" height="${GRID.padH}" rx="3"/>
    <text class="pad-label ball-name" x="${n(cx)}" y="${n(y + GRID.padH / 2 + 4)}">${escapeHtml(name)}</text>
    <text class="pad-value" x="${n(cx)}" y="${n(y + GRID.padH + 13)}"></text>
    <text class="pad-value-adj" x="${n(cx)}" y="${n(y + GRID.padH + 25)}"></text>
    <polygon class="pad-caret" points="${n(x + 3)},${n(y)} ${n(x + 13)},${n(y)} ${n(x + 3)},${n(y + 10)}"/>
  </g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="bga" viewBox="0 0 ${n(w)} ${n(h)}" role="group" aria-label="${escapeHtml(pkg.name)} ball map, top view, ${pkg.balls.size} balls">
  ${parts.join('\n  ')}
</svg>`;
}
