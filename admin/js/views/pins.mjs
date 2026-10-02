// Connector + pin editor for a board. Renders one card per connector with a
// table of value inputs (one row per pin). Edits mutate `board.connectors` in
// place as the user types, so the single "Save board" button always sees the
// latest state. Unmeasured pins are omitted on save (the site treats a missing
// pin as non-fatal), never stored as an empty string.

import { el, clear } from '../../../js/ui.mjs';
import { HDMI_PIN_COUNT, pinInfo } from '../../../js/signals.mjs';
import { validatePinValue } from '../validate.mjs';

// "ol" (any case) → canonical "OL"; null/undefined → '' ; else verbatim.
function normalizeValue(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  return /^ol$/i.test(s) ? 'OL' : s;
}

// Drop unmeasured pins and sort the rest by number, reusing existing pin objects
// so any extra fields (note, signalClass) survive. Mutates `board` in place.
export function finalizeConnectors(board) {
  for (const conn of board.connectors || []) {
    const m = conn.measurement || (conn.measurement = {});
    const pinCount = Number(conn.pinCount) || HDMI_PIN_COUNT;
    const byNum = new Map();
    for (const p of Array.isArray(m.pins) ? m.pins : []) byNum.set(Number(p.num), p);
    const next = [];
    for (let num = 1; num <= pinCount; num++) {
      const p = byNum.get(num);
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
  const addBtn = el('button', { class: 'btn small' }, '+ Add connector');
  hostEl.append(listHost, el('div', { class: 'action-bar' }, [addBtn]));

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
    const pinCount = Number(conn.pinCount) || HDMI_PIN_COUNT;

    // Header: editable id + type/pin count + remove.
    const idInput = el('input', { type: 'text', class: 'conn-id', value: conn.id });
    idInput.addEventListener('input', () => { conn.id = idInput.value.trim(); });
    const head = el('div', { class: 'conn-head' }, [
      idInput,
      el('span', { class: 'conn-meta' }, `${conn.type || ''} · ${pinCount} pins`),
      el('button', { class: 'btn small danger', onclick: () => removeConnector(index) }, 'Remove'),
    ]);

    // Pin table.
    const tbody = el('tbody');
    for (let num = 1; num <= pinCount; num++) {
      const p = pinFor(conn, num);
      let sig = '';
      try { sig = pinInfo(num).short; } catch (e) { /* non-HDMI pin count */ }
      const input = el('input', { type: 'text', class: 'val-input', value: p.value ?? '', placeholder: '—' });
      const tr = el('tr', {}, [
        el('td', { class: 'num' }, String(num)),
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
          el('th', { class: 'num' }, 'Pin'),
          el('th', {}, 'Signal'),
          el('th', {}, 'Value (V drop / OL)'),
        ])]),
        tbody,
      ]),
    ]);
  }

  // Find the pin object for a number, creating it if absent.
  function pinFor(conn, num) {
    const m = conn.measurement || (conn.measurement = {});
    if (!Array.isArray(m.pins)) m.pins = [];
    let p = m.pins.find(x => Number(x.num) === num);
    if (!p) { p = { num }; m.pins.push(p); }
    return p;
  }

  function addConnector() {
    const n = board.connectors.length + 1;
    let id, k = 1;
    do { id = k === 1 ? 'hdmi' : `hdmi-${k}`; k++; } while (board.connectors.some(c => c.id === id));
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

  addBtn.addEventListener('click', addConnector);
  draw();
}
