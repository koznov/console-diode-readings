// Entry/bootstrap: wires sidebar nav, canvas, controls, theme, views, export.

import { loadCatalog, loadBoard } from './loader.mjs';
import { Store } from './store.mjs';
import { createPinmap } from './pinmap.mjs';
import { SIGNAL_CLASSES, LEGEND_GROUPS, pinInfo, pinsForClass } from './signals.mjs';
import { formatValue, calibrationFactor, scaleReading, formatOffset } from './values.mjs';
import { el, clear } from './ui.mjs';

const store = new Store();
let currentPinmap = null;
let currentBoard = null;
let currentConnector = null;
let labelsVisible = store.get('labels', 'true') !== 'false';
let calibration = null; // { factor, refPin, yours } — in-memory only, per loaded board

// ---- Theme -------------------------------------------------------------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  store.set('theme', theme);
}

(function initTheme() {
  const saved = store.get('theme', '');
  if (saved) document.documentElement.dataset.theme = saved;
})();

// ---- Helpers -----------------------------------------------------------
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(board, connector) {
  const scope = `${board.id}:${connector.id}`;
  const marked = new Set(store.markedPins(scope));
  const rows = [['pin', 'name', 'signal', 'class', 'value', 'marked']];
  for (const p of connector.measurement.pins) {
    const info = pinInfo(p.num, p.signalClass);
    rows.push([
      p.num,
      info.short,
      info.name,
      info.classDisplayName,
      p.raw,
      marked.has(p.num) ? 'yes' : 'no',
    ]);
  }
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `${board.id}-${connector.id}-readings.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Rendering ---------------------------------------------------------
function renderNav(cat, onSelect) {
  const nav = document.getElementById('nav');
  clear(nav);
  nav.appendChild(el('strong', { class: 'site-title' }, '🎮 Console Diode Readings'));

  for (const cons of cat.consoles) {
    nav.appendChild(el('div', { class: 'nav-console' }, [
      el('div', { class: 'nav-brand' }, `${cons.brand} · ${cons.family}`),
      el('div', {}, cons.name),
    ]));
    for (const entry of cons.boards) {
      const btn = el('button', {
        class: 'board-btn',
        onclick: () => onSelect(cons, entry, btn),
      }, `${cons.name} — ${entry.revision}`);
      btn.dataset.boardId = entry.id;
      nav.appendChild(btn);
    }
  }
}

// Legend is a list of signals — swatch, name, pins and description all
// visible at once — and doubles as the signal filter: hover a row → its
// pins light up, click → pin that signal. Rows follow LEGEND_GROUPS order;
// the group captions are not shown.
function renderLegend(host) {
  clear(host);
  host.className = 'legend';
  host.appendChild(el('div', { class: 'legend-head' }, [
    el('span', { class: 'legend-title' }, 'Signals'),
  ]));
  const list = el('div', { class: 'legend-list', role: 'group', 'aria-label': 'Signal classes' });
  for (const grp of LEGEND_GROUPS) {
    for (const cls of grp.classes) {
      const meta = SIGNAL_CLASSES[cls];
      const sw = el('span', { class: 'swatch' });
      sw.style.background = `var(${meta.cssVar})`;
      const pins = pinsForClass(cls);
      const row = el('button', {
        class: 'legend-chip',
        type: 'button',
        'aria-pressed': 'false',
        onmouseenter: () => setLegendHover(cls),
        onmouseleave: () => setLegendHover(null),
        onfocus: () => setLegendHover(cls),
        onblur: () => setLegendHover(null),
        onclick: () => toggleSignalFilter(cls),
      }, [
        sw,
        el('span', { class: 'chip-body' }, [
          el('span', { class: 'chip-head' }, [
            el('span', { class: 'chip-name' }, meta.displayName),
            el('span', { class: 'chip-pins' }, `pin${pins.length === 1 ? '' : 's'} ${pins.join(', ')}`),
          ]),
          el('span', { class: 'chip-desc' }, meta.description),
        ]),
      ]);
      row.dataset.class = cls;
      list.appendChild(row);
    }
  }
  host.appendChild(list);
  syncLegend();
}

// Transient highlight from legend hover (or pad hover mirrored back).
function setLegendHover(cls) {
  currentPinmap?.setHighlight(cls);
  document.querySelectorAll('.legend-chip').forEach(c => c.classList.toggle('hot', c.dataset.class === cls));
  const legend = document.querySelector('.legend');
  if (legend) legend.classList.toggle('focused', cls != null || (currentPinmap?.filter ?? 'all') !== 'all');
}

// Click on a chip pins its class as the filter; clicking the same chip unpins.
function toggleSignalFilter(cls) {
  if (!currentPinmap) return;
  const next = currentPinmap.filter === cls ? 'all' : cls;
  currentPinmap.setFilter(next);
  if (next !== 'all') {
    currentPinmap.select(null); // signal view replaces pin view
    scrollPadsIntoView(pinsForClass(next));
  }
  syncLegend();
  renderPinDetail(currentPinmap.selectedPin);
}

// On narrow screens the 19-pad row scrolls inside .svg-wrap; bring the
// first highlighted pad into view so a pinned signal is never off-screen.
function scrollPadsIntoView(pins) {
  const wrap = document.querySelector('.svg-wrap');
  const first = pins.length ? document.querySelector(`.pad-group[data-pin="${pins[0]}"]`) : null;
  if (!wrap || !first || wrap.scrollWidth <= wrap.clientWidth) return;
  const w = wrap.getBoundingClientRect();
  const r = first.getBoundingClientRect();
  wrap.scrollTo({ left: wrap.scrollLeft + (r.left - w.left) - (w.width - r.width) / 2, behavior: 'smooth' });
}

function syncLegend() {
  const active = currentPinmap?.filter ?? 'all';
  document.querySelectorAll('.legend-chip').forEach(c => {
    const on = c.dataset.class === active;
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const legend = document.querySelector('.legend');
  if (legend) legend.classList.toggle('focused', active !== 'all');
}

function renderControls(host, { onToggleLabels, onToggleTheme, onViewMode }) {
  clear(host);

  const labelsCb = el('input', { type: 'checkbox', id: 'lbl-toggle', onchange: (e) => onToggleLabels(e.target.checked) });
  labelsCb.checked = labelsVisible;
  host.appendChild(el('div', { class: 'control-group' }, [labelsCb, el('label', { for: 'lbl-toggle' }, 'Labels')]));

  const viewSel = el('select', { id: 'view-sel', onchange: (e) => onViewMode(e.target.value) }, [
    el('option', { value: 'connector' }, 'Connector view'),
    el('option', { value: 'board' }, 'Board / photo view'),
  ]);
  host.appendChild(el('div', { class: 'control-group' }, [el('label', { for: 'view-sel' }, 'View:'), viewSel]));

  const themeBtn = el('button', { class: 'btn', onclick: onToggleTheme }, '🌗 Toggle theme');
  host.appendChild(themeBtn);
}

function renderUtil(host, board, connector) {
  clear(host);
  host.appendChild(el('button', { class: 'btn', onclick: () => window.print() }, '🖨 Print'));
  host.appendChild(el('button', { class: 'btn', onclick: () => exportCsv(board, connector) }, '⬇ Export CSV'));
  host.appendChild(el('button', { class: 'btn', onclick: () => {
    store.clearMarks(`${board.id}:${connector.id}`);
    currentPinmap?.refresh();
    updateMarkerCounter(board, connector);
    renderPinDetail(currentPinmap?.selectedPin ?? null);
  } }, '✕ Clear marks'));
  host.appendChild(el('span', { id: 'mark-counter', class: 'control-group' }, 'No pins marked'));
}

function updateMarkerCounter(board, connector) {
  const span = document.getElementById('mark-counter');
  if (!span) return;
  const n = store.markedPins(`${board.id}:${connector.id}`).length;
  span.textContent = n === 0 ? 'No pins marked' : `${n} pin${n === 1 ? '' : 's'} marked`;
}

// Meter-variance banner with the calibration calculator. The user types
// their own reading for one numeric reference pin; every other numeric
// reading is rescaled by that ratio and shown as a second row under the pads.
function renderMeterNote(canvas, connector) {
  const numericPins = connector.measurement.pins.filter(p => p.parsed.kind === 'numeric');
  const defaultRef = numericPins.find(p => p.signalClass === 'tmds-data-pos') ?? numericPins[0] ?? null;

  const note = el('div', { class: 'meter-note', role: 'note' });
  note.appendChild(el('p', { class: 'mn-text' }, [
    el('b', {}, '⚠ Readings vary by meter — compare patterns, not digits. '),
    'Different multimeters read roughly 5–10 % apart, so expect every value here to be offset on yours. ',
    'Measure one known-good pin on your board, enter it below, and we rescale the rest. ',
    'What matters: pins of the same signal read alike, and nothing is OL or 0 where it shouldn\u2019t be.',
  ]));

  if (!defaultRef) return canvas.appendChild(note);

  const refSel = el('select', { id: 'cal-ref', 'aria-label': 'Reference pin' });
  for (const p of numericPins) {
    const info = pinInfo(p.num, p.signalClass);
    refSel.appendChild(el('option', { value: String(p.num) }, `pin ${p.num} ${info.short}`));
  }
  refSel.value = String(calibration?.refPin ?? defaultRef.num);

  const ours = el('span', { class: 'mn-ours' });
  const input = el('input', {
    id: 'cal-yours', type: 'text', inputmode: 'decimal', placeholder: '0.00',
    'aria-label': 'Your reading for the reference pin, volts',
    autocomplete: 'off',
  });
  if (calibration) input.value = calibration.yours;
  const result = el('span', { class: 'mn-result off' }, 'offset —');
  const clearBtn = el('button', { class: 'mn-clear', type: 'button' }, 'clear');

  const refPinOf = () => connector.measurement.pins.find(p => p.num === Number(refSel.value));
  const syncOurs = () => { ours.textContent = `ours ${formatValue(refPinOf().parsed)} → yours`; };

  function apply() {
    const raw = input.value.trim();
    input.classList.remove('bad');
    if (raw === '') { setCalibration(null); result.textContent = 'offset —'; result.className = 'mn-result off'; return; }
    try {
      const factor = calibrationFactor(refPinOf().parsed, raw);
      setCalibration({ factor, refPin: Number(refSel.value), yours: raw });
      result.textContent = `offset ${formatOffset(factor)}`;
      result.className = 'mn-result';
    } catch (_) {
      input.classList.add('bad');
      setCalibration(null);
      result.textContent = 'enter a number like 0.83';
      result.className = 'mn-result off';
    }
  }

  refSel.addEventListener('change', () => { syncOurs(); apply(); });
  input.addEventListener('input', apply);
  clearBtn.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });

  note.appendChild(el('div', { class: 'mn-calc' }, [
    el('label', { for: 'cal-ref' }, 'Calibrate:'),
    refSel, ours, input, el('span', { class: 'mn-ours' }, 'V'), result, clearBtn,
  ]));
  canvas.appendChild(note);
  syncOurs();
  if (calibration) apply();
}

function setCalibration(cal) {
  calibration = cal;
  currentPinmap?.setCalibration(cal?.factor ?? null);
  renderPinDetail(currentPinmap?.selectedPin ?? null);
}

// Detail panel under the connector: what the selected pin is, its reading,
// and the explicit "mark damaged" action. Rebuilt on every selection change.
function renderPinDetail(pin) {
  const host = document.getElementById('pin-detail');
  if (!host || !currentConnector) return;
  clear(host);

  if (pin == null) {
    const cls = currentPinmap?.filter ?? 'all';
    if (cls !== 'all') { renderSignalDetail(host, cls); return; }
    host.className = 'pin-detail empty';
    host.appendChild(el('div', {}, 'Click or tap a pad to see that pin\u2019s reading and notes. In the Signals list below, hover a row to light up its pins, click to pin it.'));
    return;
  }

  const ep = currentConnector.measurement.pins.find(p => p.num === pin);
  const info = pinInfo(pin, ep?.signalClass);
  const marked = currentPinmap?.isMarked(pin) ?? false;
  host.className = 'pin-detail';

  const sw = el('span', { class: 'swatch' });
  sw.style.background = `var(${SIGNAL_CLASSES[info.className].cssVar})`;

  // Class chip behaves like its legend twin: hover lights up every pin of
  // that signal, click pins the signal.
  const classChip = el('button', {
    class: 'pd-class pd-class-btn',
    type: 'button',
    title: `Highlight all ${info.classDisplayName} pins`,
    onmouseenter: () => setLegendHover(info.className),
    onmouseleave: () => setLegendHover(null),
    onfocus: () => setLegendHover(info.className),
    onblur: () => setLegendHover(null),
    onclick: () => toggleSignalFilter(info.className),
  }, [sw, info.classDisplayName, el('span', { class: 'chip-pins' }, pinsForClass(info.className).join(','))]);

  host.appendChild(el('div', { class: 'pd-head' }, [
    el('span', { class: 'pd-pin' }, `Pin ${pin}`),
    el('span', { class: 'pd-name pd-short' }, info.short),
    // long name only when it adds to the short one
    info.name !== info.short ? el('span', { class: 'pd-class' }, info.name) : null,
    classChip,
  ]));

  const valueBox = el('div', { class: 'pd-value' }, ep ? formatValue(ep.parsed) : '—');
  if (ep?.parsed.kind === 'ol') valueBox.appendChild(el('small', {}, 'open line'));
  else if (ep?.parsed.kind === 'zero') valueBox.appendChild(el('small', {}, 'connected to ground'));
  else {
    valueBox.appendChild(el('small', {}, currentConnector.measurement.unit || 'V (drop)'));
    const scaled = calibration && ep ? scaleReading(ep.parsed, calibration.factor) : null;
    if (scaled) valueBox.appendChild(el('span', { class: 'pd-adj' }, `≈ ${formatValue(scaled)} on your meter`));
  }
  host.appendChild(valueBox);

  host.appendChild(el('p', { class: 'pd-desc' }, info.description));
  if (ep?.parsed.kind === 'numeric') {
    host.appendChild(el('p', { class: 'pd-tol' }, 'Expect ±5–10 % between multimeters; compare against the other pins of the same signal on your board.'));
  }
  if (ep?.note) host.appendChild(el('p', { class: 'pd-note' }, `Note: ${ep.note}`));

  const actions = el('div', { class: 'pd-actions' });
  actions.appendChild(el('button', {
    class: marked ? 'btn' : 'btn danger',
    onclick: () => { currentPinmap?.toggleMark(pin); renderPinDetail(pin); },
  }, marked ? '↺ Unmark' : '⚠ Mark damaged'));
  if (marked) actions.appendChild(el('span', { class: 'pd-marked-flag' }, 'Marked as damaged'));
  actions.appendChild(el('button', {
    class: 'btn',
    onclick: () => currentPinmap?.select(null),
  }, 'Deselect'));
  host.appendChild(actions);
}

// Signal view: shown when a legend row is pinned and no pin is selected.
// The description is already visible in the legend list, so this only
// lists the signal's pins with their readings.
function renderSignalDetail(host, cls) {
  const meta = SIGNAL_CLASSES[cls];
  host.className = 'pin-detail signal';
  const sw = el('span', { class: 'swatch' });
  sw.style.background = `var(${meta.cssVar})`;
  host.appendChild(el('div', { class: 'pd-head' }, [
    el('span', { class: 'pd-pin' }, [sw, ` ${meta.displayName}`]),
    el('span', { class: 'pd-class' }, 'pins on this board'),
  ]));

  const list = el('div', { class: 'pd-pinlist' });
  for (const p of currentConnector.measurement.pins.filter(p => p.signalClass === cls)) {
    const info = pinInfo(p.num, p.signalClass);
    list.appendChild(el('button', {
      type: 'button',
      onclick: () => currentPinmap?.select(p.num),
    }, [`${p.num} ${info.short}`, el('span', { class: 'v' }, formatValue(p.parsed))]));
  }
  host.appendChild(list);

  host.appendChild(el('div', { class: 'pd-actions' }, [
    el('button', { class: 'btn', onclick: () => toggleSignalFilter(cls) }, 'Show all pins'),
  ]));
}

function renderInfoPanel(canvas, board) {
  const panel = el('div', { class: 'notes-panel' });
  const bits = [`Revision: ${board.revision}`];
  if (board.confirmedOn > 1) bits.push(`Confirmed on ${board.confirmedOn} consoles`);
  panel.appendChild(el('div', {}, bits.join(' · ')));
  if (board.notes.length) {
    panel.appendChild(el('div', {}, 'Notes:'));
    panel.appendChild(el('ul', {}, board.notes.map(n => el('li', {}, n))));
  }
  canvas.appendChild(panel);
}

function renderWarnings(canvas, board) {
  if (!board.warnings.length) return;
  canvas.appendChild(el('div', { class: 'warning-banner' }, [
    el('strong', {}, '⚠ Data warnings: '),
    board.warnings.join('; '),
  ]));
}

function renderPhotos(canvas, board) {
  if (!board.photos.length) {
    canvas.appendChild(el('div', { class: 'empty-photos' },
      'No photos yet for this revision. Photos can be contributed via the repository (see CONTRIBUTING.md).'));
    return;
  }
  const grid = el('div', { class: 'photo-grid' });
  for (const src of board.photos) {
    grid.appendChild(el('img', { src, alt: `${board.revision} photo`, loading: 'lazy' }));
  }
  canvas.appendChild(grid);
}

// ---- Main interaction --------------------------------------------------
async function selectBoard(cons, entry, btn) {
  const canvas = document.getElementById('canvas');
  clear(canvas);
  document.querySelectorAll('.board-btn.active').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');

  let board;
  try {
    board = await loadBoard(entry);
  } catch (e) {
    canvas.appendChild(el('div', { class: 'warning-banner' }, `Could not load board "${entry.revision}": ${e.message}`));
    return;
  }
  currentBoard = board;
  currentConnector = board.connectors[0]; // HDMI is the first/only connector today
  calibration = null; // a calibration belongs to one board's readings

  // Title + meta
  canvas.appendChild(el('h2', { class: 'connector-title' }, `${cons.name} — ${currentConnector.label}`));
  canvas.appendChild(el('div', { class: 'connector-meta' },
    `${currentConnector.type} · ${board.revision} · diode mode (red probe on GND)`));
  renderMeterNote(canvas, currentConnector);

  // Connector SVG mount + legend
  const svgWrap = el('div', { class: 'svg-wrap' }, el('div', { id: 'pinmap-mount' }));
  canvas.appendChild(svgWrap);
  canvas.appendChild(el('p', { class: 'svg-hint' }, '← scroll the connector sideways →'));
  const detailHost = el('div', { id: 'pin-detail', class: 'pin-detail empty' });
  canvas.appendChild(detailHost);
  const legendHost = el('div', {});
  renderLegend(legendHost);
  canvas.appendChild(legendHost);

  // Info / warnings
  renderWarnings(canvas, board);
  renderInfoPanel(canvas, board);

  // Controls + util
  renderControls(document.getElementById('controls'), {
    onToggleLabels: (on) => { labelsVisible = on; store.set('labels', String(on)); currentPinmap?.setLabels(on); },
    onToggleTheme: () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    },
    onViewMode: (mode) => {
      const mount = document.getElementById('pinmap-mount');
      if (mode === 'board') {
        currentPinmap?.destroy();
        currentPinmap = null;
        mount.parentElement.hidden = true;
        legendHost.hidden = true;
        detailHost.hidden = true;
        renderPhotos(canvas, board);
      } else {
        // remove any photo grid, restore connector
        const pg = canvas.querySelector('.photo-grid, .empty-photos');
        if (pg) pg.remove();
        mount.parentElement.hidden = false;
        legendHost.hidden = false;
        detailHost.hidden = false;
        bootPinmap(board, currentConnector);
      }
    },
  });
  renderUtil(document.getElementById('util'), board, currentConnector);

  await bootPinmap(board, currentConnector);
}

async function bootPinmap(board, connector) {
  const mount = document.getElementById('pinmap-mount');
  if (!mount) return;
  currentPinmap = await createPinmap({
    container: mount,
    connector,
    board,
    store,
    onChange: (_scope, count) => {
      const span = document.getElementById('mark-counter');
      if (span) span.textContent = count === 0 ? 'No pins marked' : `${count} pin${count === 1 ? '' : 's'} marked`;
    },
    onSelect: (pin) => renderPinDetail(pin),
    onHover: (pin) => {
      // mirror pad hover into the legend chip of that pin's class
      const ep = pin != null ? connector.measurement.pins.find(p => p.num === pin) : null;
      const cls = ep ? ep.signalClass : null;
      document.querySelectorAll('.legend-chip').forEach(c => c.classList.toggle('hot', c.dataset.class === cls));
    },
  });
  currentPinmap.setLabels(labelsVisible);
  currentPinmap.setCalibration(calibration?.factor ?? null);
  currentPinmap.refresh();
  updateMarkerCounter(board, connector);
  syncLegend();
  renderPinDetail(null);
}

// Esc: first clears the selected pin, then the pinned signal filter.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !currentPinmap) return;
  if (currentPinmap.selectedPin != null) { currentPinmap.select(null); return; }
  if (currentPinmap.filter !== 'all') toggleSignalFilter(currentPinmap.filter);
});

// ---- Boot --------------------------------------------------------------
(async function boot() {
  const errRegion = document.getElementById('error-region');
  try {
    const cat = await loadCatalog();
    renderNav(cat, selectBoard);
  } catch (e) {
    errRegion.appendChild(el('p', {}, `Couldn't load the readings catalogue: ${e.message}. If you're running from the file system, serve the site over HTTP (e.g. \`python3 -m http.server\`).`));
  }
})();
