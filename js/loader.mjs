import { resolveSignalClass, HDMI_PIN_COUNT } from './signals.mjs';
import { parseValue } from './values.mjs';

const DEFAULT_FETCH =
  typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null;

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
  const connectors = (b.connectors || []).map(conn => {
    const m = conn.measurement || {};
    const enriched = (m.pins || []).map(pin => {
      let signalClass;
      try {
        signalClass = resolveSignalClass(pin.num, pin.signalClass);
        if (pin.signalClass != null && signalClass !== pin.signalClass) {
          warnings.push(`pin ${pin.num}: unknown signalClass "${pin.signalClass}", fell back to "${signalClass}"`);
        }
      } catch (e) {
        warnings.push(`pin ${pin.num}: ${e.message}`);
        signalClass = 'gnd';
      }
      let parsed;
      try {
        parsed = parseValue(pin.value);
      } catch (e) {
        warnings.push(`pin ${pin.num}: ${e.message}; recorded raw="${pin.value}"`);
        parsed = { kind: 'ol', volts: null, raw: String(pin.value) };
      }
      return { num: pin.num, signalClass, parsed, raw: pin.value, note: pin.note };
    });

    // Missing-pin detection (non-fatal: render what we have, warn loudly)
    const have = new Set(enriched.map(p => p.num));
    const missing = [];
    for (let p = 1; p <= (conn.pinCount || HDMI_PIN_COUNT); p++) {
      if (!have.has(p)) missing.push(p);
    }
    if (missing.length) {
      warnings.push(`${entry.revision}/${conn.id}: missing pins ${missing.join(', ')}`);
    }

    return {
      id: conn.id,
      type: conn.type,
      label: conn.label,
      svgTemplate: conn.svgTemplate,
      pinCount: conn.pinCount,
      measurement: { mode: m.mode, probes: m.probes, unit: m.unit, pins: enriched },
    };
  });

  return {
    id: b.id,
    consoleId: b.consoleId,
    revision: b.revision,
    confirmedOn: Number(b.confirmedOn) || 1,
    notes: Array.isArray(b.notes) ? b.notes : [],
    connectors,
    photos: Array.isArray(b.photos) ? b.photos : [],
    warnings,
  };
}
