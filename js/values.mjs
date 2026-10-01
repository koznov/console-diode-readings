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
