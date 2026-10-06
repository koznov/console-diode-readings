import { parseValue } from './values.mjs';
import { kindOf, rawPinKey } from './kinds.mjs';
import { padPositions } from './photo.mjs';

const DEFAULT_FETCH =
  typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null;

// photos[] entries are a bare path (a plain picture) or an object that can also
// carry live pins: { src, caption, size: [w, h], anchors: { "<pin>": [x, y], ... } }.
// Bad pin data never hides the picture: it is shown without pins, with a warning.
function normalizePhoto(raw, index, warnings) {
  const entry = typeof raw === 'string' ? { src: raw } : raw;
  if (!entry || typeof entry !== 'object' || typeof entry.src !== 'string' || !entry.src) {
    warnings.push(`photo #${index + 1}: no src, skipped`);
    return null;
  }
  const plain = { src: entry.src, caption: typeof entry.caption === 'string' ? entry.caption : '', size: null, anchors: null };
  if (entry.anchors == null) return plain;

  const { size, anchors } = entry;
  if (!(Array.isArray(size) && size.length === 2 && size.every(v => Number.isFinite(v) && v > 0))) {
    warnings.push(`photo ${entry.src}: anchors need a size [width, height] in pixels; shown without pins`);
    return plain;
  }
  try {
    padPositions(anchors);
  } catch (e) {
    warnings.push(`photo ${entry.src}: ${e.message}; shown without pins`);
    return plain;
  }
  return { ...plain, size, anchors };
}

export async function loadCatalog(fetchFn = DEFAULT_FETCH) {
  const res = await fetchFn('data/catalog.json');
  if (!res || !res.ok) {
    throw new Error(`could not load catalog (${res ? res.status : 'no fetch'})`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.consoles)) {
    throw new Error('catalog.consoles is not an array');
  }
  return data;
}

export async function loadBoard(entry, fetchFn = DEFAULT_FETCH) {
  const f = fetchFn ?? DEFAULT_FETCH;
  const res = await f(entry.file);
  if (!res || !res.ok) {
    throw new Error(`could not load board "${entry.id}" (${res ? res.status : 'no fetch'})`);
  }
  const b = await res.json();

  const warnings = [];
  const connectors = [];
  for (const conn of b.connectors || []) {
    let kind;
    try {
      kind = kindOf(conn);
    } catch (e) {
      warnings.push(`${entry.revision}/${conn.id}: ${e.message}; connector skipped`);
      continue;
    }
    const where = `${entry.revision}/${conn.id}`;
    const word = kind.pinWord.toLowerCase();
    const m = conn.measurement || {};
    const enriched = [];
    const seen = new Set();
    for (const pin of m.pins || []) {
      // `num` on a normalized pin is its key: the pin number on HDMI, the ball id on a chip
      const key = rawPinKey(kind, pin);
      if (key == null || !kind.hasKey(key)) {
        warnings.push(`${where}: ${word} ${pin?.[kind.keyField] ?? '(none)'} does not exist on ${kind.isBga ? kind.package.name : 'this connector'}; skipped`);
        continue;
      }
      if (seen.has(key)) {
        warnings.push(`${where}: ${word} ${key} listed twice; the first reading is used`);
        continue;
      }
      seen.add(key);
      const signalClass = kind.resolveSignalClass(key, pin.signalClass);
      if (pin.signalClass != null && signalClass !== pin.signalClass) {
        warnings.push(`${word} ${key}: unknown signalClass "${pin.signalClass}", fell back to "${signalClass}"`);
      }
      let parsed;
      try {
        parsed = parseValue(pin.value);
      } catch (e) {
        warnings.push(`${word} ${key}: ${e.message}; recorded raw="${pin.value}"`);
        parsed = { kind: 'ol', volts: null, raw: String(pin.value) };
      }
      enriched.push({ num: key, signalClass, parsed, raw: pin.value, note: pin.note });
    }

    // Missing-pin detection (non-fatal: render what we have, warn loudly)
    const missing = kind.keys().filter(k => !seen.has(k));
    if (missing.length) {
      warnings.push(`${where}: missing ${word}s ${missing.join(', ')}`);
    }

    connectors.push({
      id: conn.id,
      type: conn.type,
      label: conn.label,
      package: conn.package ?? null,
      svgTemplate: conn.svgTemplate,
      pinCount: kind.keys().length,
      measurement: { mode: m.mode, probes: m.probes, unit: m.unit, pins: enriched },
    });
  }

  return {
    id: b.id,
    consoleId: b.consoleId,
    revision: b.revision,
    confirmedOn: Number(b.confirmedOn) || 1,
    notes: Array.isArray(b.notes) ? b.notes : [],
    connectors,
    photos: (Array.isArray(b.photos) ? b.photos : [])
      .map((p, i) => normalizePhoto(p, i, warnings))
      .filter(Boolean),
    warnings,
  };
}
