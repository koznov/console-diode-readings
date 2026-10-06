// Connector kinds. A board's connectors are HDMI ports or BGA chips; each kind
// answers the same questions (which pins exist, what each one is, how they are
// keyed and drawn) so the loader, viewer and admin panel stay kind-agnostic.
//
// A pin's key is what the pad's data-pin carries and marks are stored under:
// the pin number (1..19) on HDMI, the ball id ("A1") on a BGA chip. In board
// files HDMI pins are { num, value }, BGA balls are { ball, value }.

import {
  HDMI_PIN_COUNT, SIGNAL_CLASSES, LEGEND_GROUPS, pinInfo, pinsForClass, resolveSignalClass,
} from './signals.mjs';
import {
  getPackage, ballIds, memPinInfo, memPinsForClass, MEM_SIGNAL_CLASSES, MEM_LEGEND_GROUPS, bgaSvgMarkup,
} from './bga.mjs';
import { keepDecimals } from './values.mjs';

const HDMI_PINS = Array.from({ length: HDMI_PIN_COUNT }, (_, i) => i + 1);

const hdmiKind = Object.freeze({
  id: 'hdmi',
  isBga: false,
  pinWord: 'Pin',
  keyField: 'num',
  signalClasses: SIGNAL_CLASSES,
  legendGroups: LEGEND_GROUPS,
  defaultRefClass: 'tmds-data-pos',
  keys: () => HDMI_PINS,
  parseKey: (s) => Number(s),
  hasKey: (k) => Number.isInteger(k) && k >= 1 && k <= HDMI_PIN_COUNT,
  pinInfo: (k, override) => pinInfo(k, override),
  resolveSignalClass: (k, override) => resolveSignalClass(k, override),
  pinsForClass: (cls) => pinsForClass(cls),
  svgMarkup: null, // drawn from conn.svgTemplate
  calDecimals: () => 2,
  // pads are 36 px apart: "0.79" fits, "0.809" must shrink
  longValue: (text) => text.length > 4,
});

const bgaKinds = new Map();
function bgaKind(pkgId) {
  if (bgaKinds.has(pkgId)) return bgaKinds.get(pkgId);
  const pkg = getPackage(pkgId); // throws on an unknown package
  const keys = ballIds(pkg);
  const kind = Object.freeze({
    id: pkg.id,
    isBga: true,
    pinWord: 'Ball',
    keyField: 'ball',
    package: pkg,
    signalClasses: MEM_SIGNAL_CLASSES,
    legendGroups: MEM_LEGEND_GROUPS,
    defaultRefClass: 'mem-dq',
    keys: () => keys,
    parseKey: (s) => String(s).trim().toUpperCase(),
    hasKey: (k) => pkg.balls.has(k),
    pinInfo: (k, override) => memPinInfo(pkg, k, override),
    resolveSignalClass: (k, override) => memPinInfo(pkg, k, override).className,
    pinsForClass: (cls) => memPinsForClass(pkg, cls),
    svgMarkup: () => bgaSvgMarkup(pkg),
    calDecimals: (parsed) => keepDecimals(parsed),
    longValue: (text) => text.length > 6,
  });
  bgaKinds.set(pkgId, kind);
  return kind;
}

// Kind of a (raw or normalized) connector. A connector with a "package" is a
// BGA chip; anything else is an HDMI port, as every board was before chips.
export function kindOf(conn) {
  return conn?.package != null ? bgaKind(conn.package) : hdmiKind;
}

// The key a raw pin entry from a board file names, or null if it names none.
export function rawPinKey(kind, pin) {
  const v = pin?.[kind.keyField];
  if (v == null || v === '') return null;
  return kind.parseKey(v);
}
