// Connector + pin editor for a board. Renders one card per connector (HDMI
// port or memory chip) with a table of value inputs (one row per pin / ball). Edits mutate `board.connectors` in
// place as the user types, so the single "Save board" button always sees the
// latest state. Unmeasured pins are omitted on save (the site treats a missing
// pin as non-fatal), never stored as an empty string.

import { el, clear } from '../../../js/ui.mjs';
import { HDMI_PIN_COUNT } from '../../../js/signals.mjs';
import { kindOf, rawPinKey } from '../../../js/kinds.mjs';
import { validatePinValue } from '../validate.mjs';

// "ol" (any case) → canonical "OL"; null/undefined → '' ; else verbatim.
function normalizeValue(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  return /^ol$/i.test(s) ? 'OL' : s;
}

// Drop unmeasured pins and sort the rest in the connector's own order (pin
// number, or ball map order on a chip), reusing existing pin objects so any
// extra fields (note, signalClass) survive. Mutates `board` in place.
export function finalizeConnectors(board) {
  for (const conn of board.connectors || []) {
    const m = conn.measurement || (conn.measurement = {});
    const kind = kindOf(conn);
    const byKey = new Map();
    for (const p of Array.isArray(m.pins) ? m.pins : []) {
      const key = rawPinKey(kind, p);
      if (key != null && !byKey.has(key)) byKey.set(key, p);
    }
    const next = [];
    for (const key of kind.keys()) {
      const p = byKey.get(key);
      if (!p) continue;
      const v = normalizeValue(p.value);
      if (v === '') continue; // omit unmeasured pins
      p.value = v;
      next.push(p);
    }
    m.pins = next;
  }
}

export function renderConnectors(hostEl, ctx, board) {
  if (!Array.isArray(board.connectors)) board.connectors = [];

  const listHost = el('div');
  const addBtn = el('button', { class: 'btn small' }, '+ Add HDMI port');
  const addChipBtn = el('button', { class: 'btn small' }, '+ Add GDDR6 chip');
  hostEl.append(listHost, el('div', { class: 'action-bar' }, [addBtn, addChipBtn]));

  function draw() {
    clear(listHost);
    if (!board.connectors.length) {
      listHost.append(el('p', { style: 'color:var(--text-muted)' }, 'No connectors yet.'));
      return;
    }
    board.connectors.forEach((conn, i) => listHost.append(connCard(conn, i)));
  }

  function connCard(conn, index) {
    const m = conn.measurement || (conn.measurement = {});
    if (!Array.isArray(m.pins)) m.pins = [];
    const kind = kindOf(conn);
    const keys = kind.keys();

    // Header: editable id + type/pin count + remove.
    const idInput = el('input', { type: 'text', class: 'conn-id', value: conn.id });
    idInput.addEventListener('input', () => { conn.id = idInput.value.trim(); });
    const head = el('div', { class: 'conn-head' }, [
      idInput,
      el('span', { class: 'conn-meta' }, `${kind.isBga ? kind.package.name : conn.type || ''} · ${keys.length} ${kind.pinWord.toLowerCase()}s`),
      el('button', { class: 'btn small danger', onclick: () => removeConnector(index) }, 'Remove'),
    ]);

    // Pin table.
    const tbody = el('tbody');
    for (const key of keys) {
      const p = pinFor(conn, kind, key);
      const sig = kind.pinInfo(key).short;
      const input = el('input', { type: 'text', class: 'val-input', value: p.value ?? '', placeholder: '—' });
      const tr = el('tr', {}, [
        el('td', { class: 'num' }, String(key)),
        el('td', { class: 'sig' }, sig),
        el('td', {}, input),
      ]);
      input.addEventListener('input', () => {
        p.value = input.value; // live, untrimmed — trimmed/normalized at save
        const bad = !!validatePinValue(input.value);
        input.classList.toggle('bad', bad);
        tr.classList.toggle('invalid', bad);
      });
      tbody.append(tr);
    }

    return el('div', { class: 'conn-block' }, [
      head,
      el('table', { class: 'pin-table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { class: 'num' }, kind.pinWord),
          el('th', {}, 'Signal'),
          el('th', {}, 'Value (V drop / OL)'),
        ])]),
        tbody,
      ]),
    ]);
  }

  // Find the pin object for a key (pin number or ball id), creating it if absent.
  function pinFor(conn, kind, key) {
    const m = conn.measurement || (conn.measurement = {});
    if (!Array.isArray(m.pins)) m.pins = [];
    let p = m.pins.find(x => rawPinKey(kind, x) === key);
    if (!p) { p = { [kind.keyField]: key }; m.pins.push(p); }
    return p;
  }

  function freeId(base) {
    let id, k = 1;
    do { id = k === 1 ? base : `${base}-${k}`; k++; } while (board.connectors.some(c => c.id === id));
    return id;
  }

  function addConnector() {
    const id = freeId('hdmi');
    board.connectors.push({
      id,
      type: 'HDMI',
      label: '',
      svgTemplate: 'assets/connectors/hdmi.svg',
      pinCount: HDMI_PIN_COUNT,
      measurement: { mode: 'diode', probes: { red: 'GND', black: 'signal pin' }, unit: 'V (drop)', pins: [] },
    });
    draw();
  }

  function removeConnector(index) {
    if (!ctx.confirm('Remove this connector and its readings? (Nothing is saved until you press Save board.)')) return;
    board.connectors.splice(index, 1);
    draw();
  }

  function addChip() {
    board.connectors.push({
      id: freeId('gddr6'),
      type: 'GDDR6',
      package: 'gddr6',
      label: 'GDDR6 RAM',
      measurement: { mode: 'diode', probes: { red: 'GND', black: 'ball' }, unit: 'V (drop)', pins: [] },
    });
    draw();
  }

  addBtn.addEventListener('click', addConnector);
  addChipBtn.addEventListener('click', addChip);
  draw();
}
