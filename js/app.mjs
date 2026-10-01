// Entry/bootstrap: wires sidebar nav, canvas, controls, theme, views, export.

import { loadCatalog, loadBoard } from './loader.mjs';
import { Store } from './store.mjs';
import { createPinmap } from './pinmap.mjs';
import { SIGNAL_CLASSES, LEGEND_GROUPS, canonicalSignal } from './signals.mjs';
import { el, clear } from './ui.mjs';

const store = new Store();
let currentPinmap = null;
let currentBoard = null;
let currentConnector = null;
let labelsVisible = store.get('labels', 'true') !== 'false';

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
  const rows = [['pin', 'signal', 'value', 'marked']];
  for (const p of connector.measurement.pins) {
    const disp = SIGNAL_CLASSES[p.signalClass]?.displayName ?? p.signalClass;
    rows.push([
      p.num,
      disp,
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

function renderLegend(host) {
  clear(host);
  host.className = 'legend';
  for (const grp of LEGEND_GROUPS) {
    const g = el('div', { class: 'legend-group' }, [
      el('span', { class: 'legend-group-title' }, grp.group),
    ]);
    for (const cls of grp.classes) {
      const meta = SIGNAL_CLASSES[cls];
      const sw = el('span', { class: `swatch ${cls === 'utility' ? '' : ''}` });
      sw.style.background = `var(${meta.cssVar})`;
      g.appendChild(el('span', { class: 'swatch-item' }, [sw, el('span', {}, meta.displayName)]));
    }
    host.appendChild(g);
  }
}

function renderControls(host, { onFilter, onToggleLabels, onToggleTheme, onViewMode }) {
  clear(host);

  const filterSel = el('select', { id: 'filter-sel', onchange: (e) => onFilter(e.target.value) }, [
    el('option', { value: 'all' }, 'All pads'),
    el('optgroup', { label: 'By signal group' }),
  ]);
  // rebuild optgroups properly (optgroup can't take option kids easily here)
  clear(filterSel);
  filterSel.appendChild(el('option', { value: 'all' }, 'All pads'));
  for (const grp of LEGEND_GROUPS) {
    const og = el('optgroup', { label: grp.group });
    for (const cls of grp.classes) {
      og.appendChild(el('option', { value: cls }, SIGNAL_CLASSES[cls].displayName));
    }
    filterSel.appendChild(og);
  }
  filterSel.value = 'all';

  host.appendChild(el('div', { class: 'control-group' }, [
    el('label', { for: 'filter-sel' }, 'Filter:'),
    filterSel,
  ]));

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
  } }, '✕ Clear marks'));
  host.appendChild(el('span', { id: 'mark-counter', class: 'control-group' }, 'No pins marked'));
}

function updateMarkerCounter(board, connector) {
  const span = document.getElementById('mark-counter');
  if (!span) return;
  const n = store.markedPins(`${board.id}:${connector.id}`).length;
  span.textContent = n === 0 ? 'No pins marked' : `${n} pin${n === 1 ? '' : 's'} marked`;
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

  // Title + meta
  canvas.appendChild(el('h2', { class: 'connector-title' }, `${cons.name} — ${currentConnector.label}`));
  canvas.appendChild(el('div', { class: 'connector-meta' },
    `${currentConnector.type} · ${board.revision} · diode mode (red probe on GND)`));

  // Connector SVG mount + legend
  const svgWrap = el('div', { class: 'svg-wrap' }, el('div', { id: 'pinmap-mount' }));
  canvas.appendChild(svgWrap);
  const legendHost = el('div', {});
  renderLegend(legendHost);
  canvas.appendChild(legendHost);

  // Info / warnings
  renderWarnings(canvas, board);
  renderInfoPanel(canvas, board);

  // Controls + util
  renderControls(document.getElementById('controls'), {
    onFilter: (c) => currentPinmap?.setFilter(c),
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
        renderPhotos(canvas, board);
      } else {
        // remove any photo grid, restore connector
        const pg = canvas.querySelector('.photo-grid, .empty-photos');
        if (pg) pg.remove();
        mount.parentElement.hidden = false;
        legendHost.hidden = false;
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
  });
  currentPinmap.setLabels(labelsVisible);
  currentPinmap.refresh();
  updateMarkerCounter(board, connector);
}

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
