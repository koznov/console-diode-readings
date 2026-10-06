// Entry/bootstrap: wires sidebar nav, canvas, controls, theme, views, export.
// Everything that depends on what a connector is (HDMI port or BGA chip) goes
// through its kind (js/kinds.mjs), never through signals.mjs directly.

import { loadCatalog, loadBoard } from './loader.mjs';
import { Store } from './store.mjs';
import { createPinmap } from './pinmap.mjs';
import { kindOf } from './kinds.mjs';
import { assessDamage, ballRoleText } from './damage.mjs';
import { formatValue, calibrationFactor, scaleReading, formatOffset } from './values.mjs';
import { el, clear } from './ui.mjs';

const store = new Store();
let currentPinmap = null;
let currentBoard = null;
let currentConnector = null;
let currentKind = kindOf(null);
let labelsVisible = store.get('labels', 'true') !== 'false';
let calibration = null; // { factor, refPin, yours } — in-memory only, per shown connector

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
  const kind = kindOf(connector);
  const rows = [[kind.pinWord.toLowerCase(), 'name', 'signal', 'class', 'value', 'marked']];
  for (const p of connector.measurement.pins) {
    const info = kind.pinInfo(p.num, p.signalClass);
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
// pins light up, click → pin that signal. Rows follow the kind's legend group order;
// the group captions are not shown.
// Pins of a class as a short label: every pin on HDMI, a count on a chip
// (a chip has dozens of VSS balls).
function classPinsLabel(pins) {
  const word = currentKind.pinWord.toLowerCase();
  if (pins.length > 8) return `${pins.length} ${word}s`;
  return `${word}${pins.length === 1 ? '' : 's'} ${pins.join(', ')}`;
}

function renderLegend(host) {
  clear(host);
  host.className = 'legend';
  host.appendChild(el('div', { class: 'legend-head' }, [
    el('span', { class: 'legend-title' }, 'Signals'),
  ]));
  const list = el('div', { class: 'legend-list', role: 'group', 'aria-label': 'Signal classes' });
  for (const grp of currentKind.legendGroups) {
    for (const cls of grp.classes) {
      const meta = currentKind.signalClasses[cls];
      const sw = el('span', { class: 'swatch' });
      sw.style.background = `var(${meta.cssVar})`;
      const pins = currentKind.pinsForClass(cls);
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
            el('span', { class: 'chip-pins' }, classPinsLabel(pins)),
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
    scrollPadsIntoView(currentKind.pinsForClass(next));
  }
  syncLegend();
  renderPinDetail(currentPinmap.selectedPin);
}

// On narrow screens the pad row (or chip grid) scrolls inside .svg-wrap; bring the
// first highlighted pad into view so a pinned signal is never off-screen.
function scrollPadsIntoView(pins) {
  const wrap = document.querySelector('.svg-wrap');
  const first = pins.length ? document.querySelector(`.pad-group[data-pin="${pins[0]}"]`) : null;
  if (!wrap || !first) return;
  if (wrap.scrollWidth > wrap.clientWidth) {
    const w = wrap.getBoundingClientRect();
    const r = first.getBoundingClientRect();
    wrap.scrollTo({ left: wrap.scrollLeft + (r.left - w.left) - (w.width - r.width) / 2, behavior: 'smooth' });
  }
  if (currentKind.isBga) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

function markCountText(n) {
  const word = currentKind.pinWord.toLowerCase();
  return n === 0 ? `No ${word}s marked` : `${n} ${word}${n === 1 ? '' : 's'} marked`;
}

// "Will it still work?" panel for a memory chip: re-judged from the marked
// (damaged) balls every time a mark changes. HDMI has no such panel.
const VERDICT_TEXT = {
  none: ['Mark damaged balls to check whether the chip will still work.', ''],
  ok: ['✓ Will work', 'Only redundant power/ground or unused balls are damaged.'],
  warn: ['⚠ Should work, with caveats', ''],
  fail: ['✕ Will NOT work', ''],
};

function renderDamage(board, connector) {
  const host = document.getElementById('damage-check');
  if (!host) return;
  clear(host);
  const kind = kindOf(connector);
  if (!kind.isBga) { host.hidden = true; return; }
  const marked = store.markedPins(`${board.id}:${connector.id}`);
  const r = assessDamage(kind.package, marked);
  host.hidden = false;
  host.className = `damage-check v-${r.verdict}`;

  const [head, sub] = VERDICT_TEXT[r.verdict];
  host.appendChild(el('div', { class: 'dc-head' }, [
    el('span', { class: 'dc-title' }, 'Will it work?'),
    el('span', { class: 'dc-verdict' }, head),
  ]));
  if (sub) host.appendChild(el('p', { class: 'dc-sub' }, sub));

  const ballList = (label, balls, cls) => {
    if (!balls.length) return;
    host.appendChild(el('div', { class: `dc-row ${cls}` }, [
      el('span', { class: 'dc-label' }, label),
      ...balls.map(b => el('button', {
        type: 'button', class: 'dc-ball',
        onclick: () => { if (currentPinmap?.selectedPin !== b) currentPinmap?.select(b); currentPinmap?.focusPin(b); },
      }, `${b} ${kind.pinInfo(b).short}`)),
    ]));
  };
  ballList('Critical, damaged:', r.critical, 'dc-critical');
  if (r.lostRails.length) {
    host.appendChild(el('p', { class: 'dc-line' }, `Every ${r.lostRails.join(' and every ')} ball is damaged: the rail is cut off.`));
  }
  for (const w of r.warnings) host.appendChild(el('p', { class: 'dc-line' }, w));
  ballList('Not needed, damaged:', r.optional, 'dc-optional');
}

function updateMarkerCounter(board, connector) {
  const span = document.getElementById('mark-counter');
  if (!span) return;
  span.textContent = markCountText(store.markedPins(`${board.id}:${connector.id}`).length);
  renderDamage(board, connector);
}

// Meter-variance banner with the calibration calculator. The user types
// their own reading for one numeric reference pin; every other numeric
// reading is rescaled by that ratio and shown as a second row under the pads.
function renderMeterNote(canvas, connector) {
  const numericPins = connector.measurement.pins.filter(p => p.parsed.kind === 'numeric');
  const kind = kindOf(connector);
  const defaultRef = numericPins.find(p => p.signalClass === kind.defaultRefClass) ?? numericPins[0] ?? null;

  const note = el('div', { class: 'meter-note', role: 'note' });
  note.appendChild(el('p', { class: 'mn-text' }, [
    el('b', {}, '⚠ Readings vary by meter — compare patterns, not digits. '),
    'Different multimeters read roughly 5–10 % apart, so expect every value here to be offset on yours. ',
    `Measure one known-good ${kind.pinWord.toLowerCase()} on your board, enter it below, and we rescale the rest. `,
    `What matters: ${kind.pinWord.toLowerCase()}s of the same signal read alike, and nothing is OL or 0 where it shouldn\u2019t be.`,
  ]));

  if (!defaultRef) return canvas.appendChild(note);

  const refSel = el('select', { id: 'cal-ref', 'aria-label': 'Reference pin' });
  for (const p of numericPins) {
    const info = kind.pinInfo(p.num, p.signalClass);
    refSel.appendChild(el('option', { value: String(p.num) }, `${kind.pinWord.toLowerCase()} ${p.num} ${info.short}`));
  }
  refSel.value = String(calibration?.refPin ?? defaultRef.num);

  const ours = el('span', { class: 'mn-ours' });
  const input = el('input', {
    id: 'cal-yours', type: 'text', inputmode: 'decimal', placeholder: '0.00',
    'aria-label': `Your reading for the reference ${kind.pinWord.toLowerCase()}, volts`,
    autocomplete: 'off',
  });
  if (calibration) input.value = calibration.yours;
  const result = el('span', { class: 'mn-result off' }, 'offset —');
  const clearBtn = el('button', { class: 'mn-clear', type: 'button' }, 'clear');

  const refPinOf = () => connector.measurement.pins.find(p => String(p.num) === refSel.value);
  const syncOurs = () => { ours.textContent = `ours ${formatValue(refPinOf().parsed)} → yours`; };

  function apply() {
    const raw = input.value.trim();
    input.classList.remove('bad');
    if (raw === '') { setCalibration(null); result.textContent = 'offset —'; result.className = 'mn-result off'; return; }
    try {
      const factor = calibrationFactor(refPinOf().parsed, raw);
      setCalibration({ factor, refPin: refPinOf().num, yours: raw });
      result.textContent = `offset ${formatOffset(factor)}`;
      result.className = 'mn-result';
    } catch (_) {
      input.classList.add('bad');
      setCalibration(null);
      result.textContent = `enter a number like ${defaultRef.parsed.raw}`;
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
    const word = currentKind.pinWord.toLowerCase();
    host.appendChild(el('div', {}, `Click or tap a pad to see that ${word}\u2019s reading and notes. In the Signals list below, hover a row to light up its ${word}s, click to pin it.`));
    return;
  }

  const ep = currentConnector.measurement.pins.find(p => p.num === pin);
  const info = currentKind.pinInfo(pin, ep?.signalClass);
  const marked = currentPinmap?.isMarked(pin) ?? false;
  host.className = 'pin-detail';

  const sw = el('span', { class: 'swatch' });
  sw.style.background = `var(${currentKind.signalClasses[info.className].cssVar})`;

  // Class chip behaves like its legend twin: hover lights up every pin of
  // that signal, click pins the signal.
  const classChip = el('button', {
    class: 'pd-class pd-class-btn',
    type: 'button',
    title: `Highlight all ${info.classDisplayName} ${currentKind.pinWord.toLowerCase()}s`,
    onmouseenter: () => setLegendHover(info.className),
    onmouseleave: () => setLegendHover(null),
    onfocus: () => setLegendHover(info.className),
    onblur: () => setLegendHover(null),
    onclick: () => toggleSignalFilter(info.className),
  }, [sw, info.classDisplayName, el('span', { class: 'chip-pins' }, classPinsLabel(currentKind.pinsForClass(info.className)))]);

  host.appendChild(el('div', { class: 'pd-head' }, [
    el('span', { class: 'pd-pin' }, `${currentKind.pinWord} ${pin}`),
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
    const scaled = calibration && ep ? scaleReading(ep.parsed, calibration.factor, currentKind.calDecimals(ep.parsed)) : null;
    if (scaled) valueBox.appendChild(el('span', { class: 'pd-adj' }, `≈ ${formatValue(scaled)} on your meter`));
  }
  host.appendChild(valueBox);

  host.appendChild(el('p', { class: 'pd-desc' }, info.description));
  if (currentKind.isBga) host.appendChild(el('p', { class: 'pd-role' }, ballRoleText(currentKind.package, pin)));
  if (ep?.parsed.kind === 'numeric') {
    host.appendChild(el('p', { class: 'pd-tol' }, `Expect ±5–10 % between multimeters; compare against the other ${currentKind.pinWord.toLowerCase()}s of the same signal on your board.`));
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
  const meta = currentKind.signalClasses[cls];
  host.className = 'pin-detail signal';
  const sw = el('span', { class: 'swatch' });
  sw.style.background = `var(${meta.cssVar})`;
  host.appendChild(el('div', { class: 'pd-head' }, [
    el('span', { class: 'pd-pin' }, [sw, ` ${meta.displayName}`]),
    el('span', { class: 'pd-class' }, `${currentKind.pinWord.toLowerCase()}s on this board`),
  ]));

  const list = el('div', { class: 'pd-pinlist' });
  for (const p of currentConnector.measurement.pins.filter(p => p.signalClass === cls)) {
    const info = currentKind.pinInfo(p.num, p.signalClass);
    list.appendChild(el('button', {
      type: 'button',
      onclick: () => currentPinmap?.select(p.num),
    }, [`${p.num} ${info.short}`, el('span', { class: 'v' }, formatValue(p.parsed))]));
  }
  host.appendChild(list);

  host.appendChild(el('div', { class: 'pd-actions' }, [
    el('button', { class: 'btn', onclick: () => toggleSignalFilter(cls) }, `Show all ${currentKind.pinWord.toLowerCase()}s`),
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

// Plain pictures (no pins): the whole gallery when a board has no live photo,
// otherwise just the photos besides the one serving as the pinmap surface.
function renderPhotos(canvas, board, photos = board.photos) {
  if (!photos.length) {
    canvas.appendChild(el('div', { class: 'empty-photos' },
      'No photos yet for this revision. Photos can be contributed via the repository (see CONTRIBUTING.md).'));
    return;
  }
  const grid = el('div', { class: 'photo-grid' });
  for (const p of photos) {
    grid.appendChild(el('img', { src: p.src, alt: p.caption || `${board.revision} photo`, loading: 'lazy' }));
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
  if (!board.connectors.length) {
    renderWarnings(canvas, board);
    canvas.appendChild(el('div', { class: 'warning-banner' }, `No readings yet for ${cons.name} — ${board.revision}.`));
    return;
  }
  await showConnector(cons, board, 0);
}

// One connector of the loaded board: an HDMI port or a memory chip. Boards with
// more than one get a tab row above the title; switching tabs re-renders the
// canvas from the already loaded board.
async function showConnector(cons, board, index) {
  const canvas = document.getElementById('canvas');
  clear(canvas);
  currentPinmap?.destroy();
  currentPinmap = null;
  currentConnector = board.connectors[index];
  currentKind = kindOf(currentConnector);
  calibration = null; // a calibration belongs to one connector's readings

  if (board.connectors.length > 1) {
    canvas.appendChild(el('div', { class: 'conn-tabs', role: 'tablist', 'aria-label': 'Measured parts' },
      board.connectors.map((c, i) => el('button', {
        type: 'button',
        role: 'tab',
        class: 'conn-tab',
        'aria-selected': String(i === index),
        onclick: () => { if (i !== index) showConnector(cons, board, i); },
      }, c.label || c.type || c.id))));
  }

  // Title + meta
  const pkgName = currentKind.isBga ? currentKind.package.name : currentConnector.type;
  canvas.appendChild(el('h2', { class: 'connector-title' }, `${cons.name} — ${currentConnector.label}`));
  canvas.appendChild(el('div', { class: 'connector-meta' },
    `${pkgName} · ${board.revision} · diode mode (red probe on GND)${currentKind.isBga ? ' · top view' : ''}`));
  renderMeterNote(canvas, currentConnector);

  // Connector SVG mount + legend
  const photoBar = el('div', { class: 'photo-bar', hidden: '' });
  canvas.appendChild(photoBar);
  const svgWrap = el('div', { class: 'svg-wrap' }, el('div', { id: 'pinmap-mount' }));
  canvas.appendChild(svgWrap);
  const svgHint = el('p', { class: 'svg-hint' }, currentKind.isBga ? '← scroll the ball map sideways →' : '← scroll the connector sideways →');
  canvas.appendChild(svgHint);
  const detailHost = el('div', { id: 'pin-detail', class: 'pin-detail empty' });
  canvas.appendChild(detailHost);
  const damageHost = el('div', { id: 'damage-check', class: 'damage-check', hidden: '' });
  canvas.appendChild(damageHost);
  const legendHost = el('div', {});
  renderLegend(legendHost);
  canvas.appendChild(legendHost);

  // Info / warnings
  renderWarnings(canvas, board);
  renderInfoPanel(canvas, board);

  // Board / photo view. A photo that carries pin anchors replaces the schematic as
  // the pinmap surface — same legend, pin panel, marks and calibration — and the
  // other photos stay plain thumbnails below. A board with no such photo keeps
  // the plain gallery (or the "no photos yet" note).
  let photoFraming = 'focus'; // 'focus' = the pad strip, 'full' = the whole picture

  function renderPhotoBar(live) {
    clear(photoBar);
    photoBar.hidden = !live;
    if (!live) return;
    const frame = (mode, label) => el('button', {
      type: 'button',
      class: 'btn',
      'aria-pressed': String(photoFraming === mode),
      onclick: () => { photoFraming = mode; currentPinmap?.setView(mode); renderPhotoBar(live); },
    }, label);
    photoBar.appendChild(el('span', { class: 'pb-caption' }, live.caption || `${board.revision} photo`));
    photoBar.appendChild(el('div', { class: 'pb-frame', role: 'group', 'aria-label': 'Photo framing' }, [
      frame('focus', 'Pads'), frame('full', 'Whole photo'),
    ]));
  }

  async function showView(mode) {
    canvas.querySelectorAll('.photo-grid, .empty-photos').forEach(n => n.remove());
    currentPinmap?.destroy();
    currentPinmap = null;

    // pin anchors on a photo place HDMI pads; a chip has no live photo yet
    const live = mode === 'board' && !currentKind.isBga ? (board.photos.find(p => p.anchors) ?? null) : null;
    const galleryOnly = mode === 'board' && !live;
    for (const n of [svgWrap, svgHint, legendHost, detailHost]) n.hidden = galleryOnly;
    damageHost.hidden = galleryOnly || !currentKind.isBga;
    renderPhotoBar(live);

    if (galleryOnly) { renderPhotos(canvas, board); return; }
    await bootPinmap(board, currentConnector, live);
    if (live) {
      currentPinmap.setView(photoFraming);
      const others = board.photos.filter(p => p !== live);
      if (others.length) renderPhotos(canvas, board, others);
    }
  }

  // Controls + util
  renderControls(document.getElementById('controls'), {
    onToggleLabels: (on) => { labelsVisible = on; store.set('labels', String(on)); currentPinmap?.setLabels(on); },
    onToggleTheme: () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    },
    onViewMode: showView,
  });
  renderUtil(document.getElementById('util'), board, currentConnector);

  await bootPinmap(board, currentConnector);
}

async function bootPinmap(board, connector, photo = null) {
  const mount = document.getElementById('pinmap-mount');
  if (!mount) return;
  currentPinmap = await createPinmap({
    container: mount,
    connector,
    board,
    store,
    photo,
    onChange: () => updateMarkerCounter(board, connector),
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
