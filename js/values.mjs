// Interpret a diode-mode reading string. Stored data keeps strings verbatim;
// this module is the only place that decides what a string MEANS.

const PLAUSIBLE_MAX = 5; // diode drops realistically < ~3V; 5 is a loose guard

export function parseValue(raw) {
  const s = String(raw).trim();
  if (s === '') throw new Error(`invalid reading: ${JSON.stringify(raw)}`);
  if (s.toLowerCase() === 'ol') return { kind: 'ol', volts: null, raw: s };

  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error(`invalid reading: ${JSON.stringify(raw)}`);
  }
  if (n < 0) throw new Error(`invalid reading (negative): ${JSON.stringify(raw)}`);
  if (n > PLAUSIBLE_MAX) throw new Error(`out of plausible range: ${JSON.stringify(raw)}`);

  if (Math.abs(n) < 0.05) return { kind: 'zero', volts: n, raw: s };
  return { kind: 'numeric', volts: n, raw: s };
}

export function formatValue(parsed) {
  if (parsed.kind === 'ol') return 'OL';
  return `${parsed.raw} V`;
}

export function emphasisKind(parsed) {
  if (parsed.kind === 'ol') return 'ol';
  if (parsed.kind === 'zero') return 'low';
  return 'normal';
}

// ---- Meter calibration ------------------------------------------------------
// Different multimeters read a few percent apart. The user measures ONE
// known-good numeric pin on their board; the ratio to our reading rescales
// every other numeric reading. OL and ground (~0) carry no scale information
// and are never rescaled.

export function calibrationFactor(ourParsed, yourRaw) {
  if (ourParsed.kind !== 'numeric') {
    throw new Error('reference pin must have a numeric reading');
  }
  const yours = parseValue(yourRaw); // throws on garbage
  if (yours.kind !== 'numeric') {
    throw new Error('your reading must be numeric (not OL or 0)');
  }
  return yours.volts / ourParsed.volts;
}

export function scaleReading(parsed, factor) {
  if (parsed.kind !== 'numeric') return null;
  const v = Math.round(parsed.volts * factor * 100) / 100;
  return { kind: 'numeric', volts: v, raw: v.toFixed(2) };
}

export function formatOffset(factor) {
  const pct = (factor - 1) * 100;
  if (Math.abs(pct) < 0.05) return '±0 %';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)} %`;
}
