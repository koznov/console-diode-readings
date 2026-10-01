// Interactive SVG connector renderer. Thin DOM layer over the pure
// signals.mjs + values.mjs modules. Keeps no business logic of its own.
//
// Model: every pad shows its reading at all times (written into the
// template's .pad-value slot). Hover = tooltip with the pin's function.
// Click / Enter / Space = SELECT the pin (the host renders a detail panel via
// onSelect). Marking a pin as damaged is a separate, explicit action
// (toggleMark) so an accidental tap never flips a mark.
// setFilter(cls) pins a class filter; setHighlight(cls) is its transient
// hover twin (legend hover). onHover(pin|null) lets the host mirror pad
// hover back into the legend. setCalibration(factor|null) writes each
// numeric reading rescaled to the user's meter into the .pad-value-adj slot.

import { pinInfo } from './signals.mjs';
import { formatValue, emphasisKind, scaleReading } from './values.mjs';
import { photoSvgMarkup, photoViewBox } from './photo.mjs';
import { clear } from './ui.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgCache = new Map();

function parseSvg(txt) {
  const holder = document.createElementNS(SVG_NS, 'svg');
  holder.innerHTML = txt.trim();
  return holder.querySelector('svg') || holder;
}

async function loadSvg(path) {
  if (svgCache.has(path)) return svgCache.get(path);
  const res = await fetch(path);
  const node = parseSvg(await res.text());
  svgCache.set(path, node);
  return node;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.container  where the SVG mounts
 * @param {Object} opts.connector       normalized connector (from loader)
 * @param {Object} opts.board            normalized board (from loader)
 * @param {import('./store.mjs').Store} opts.store
 * @param {Object} [opts.photo]  a board photo that carries pin anchors (from the loader): the pads are
 *                               drawn over this picture instead of the schematic template
 * @param {(scope:string,count:number)=>void} [opts.onChange] called after a mark toggles
 * @param {(pin:number|null)=>void}          [opts.onSelect] called when the selected pin changes
 * @param {(pin:number|null)=>void}          [opts.onHover]  called on pad mouseenter / mouseleave
 */
export async function createPinmap({ container, connector, board, store, photo = null, onChange, onSelect, onHover }) {
  const scope = `${board.id}:${connector.id}`;
  let activeFilter = 'all';   // pinned by click (legend chip)
  let highlight = null;       // transient, legend hover; wins over activeFilter while set
  let selectedPin = null;
  let calibration = null;     // numeric factor (yours / ours) or null
  let tipEl = null;

  const svgRoot = photo ? parseSvg(photoSvgMarkup(photo)) : await loadSvg(connector.svgTemplate);
  clear(container);
  container.appendChild(document.importNode(svgRoot, true));
  container.classList.toggle('photo-surface', photo != null);
  container.classList.remove('photo-full');

  const groups = [...container.querySelectorAll('.pad-group')];
  const groupByPin = new Map(groups.map(g => [Number(g.dataset.pin), g]));
  const pinsById = new Map(connector.measurement.pins.map(p => [p.num, p]));

  // ---- Tooltip (hover / focus only) --------------------------------------
  function tooltipHTML(info, parsed) {
    // "Pin 15 · SCL · SCL (DDC)" — long name only when it adds to the short one.
    const long = info.name !== info.short ? ` &middot; <span class="tt-class">${escapeHtml(info.name)}</span>` : '';
    return `<b>Pin ${info.pin}</b> &middot; <b>${escapeHtml(info.short)}</b>${long}`
      + `<br><span class="tt-val">${escapeHtml(formatValue(parsed))}</span>`;
  }
  function showTip(html, clientX, clientY) {
    hideTip();
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.innerHTML = html;
    document.body.appendChild(tipEl);
    placeTip(clientX, clientY);
  }
  function placeTip(clientX, clientY) {
    if (!tipEl) return;
    const rect = tipEl.getBoundingClientRect();
    let x = clientX + 14;
    let y = clientY + 14;
    if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - 14;
    if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - 14;
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${y}px`;
  }
  function hideTip() {
    if (tipEl) { tipEl.remove(); tipEl = null; }
  }

  // ---- Selection / marks -------------------------------------------------
  function select(pin) {
    const next = (pin == null || pin === selectedPin || !pinsById.has(pin)) ? null : pin;
    if (next === selectedPin) return;
    selectedPin = next;
    refresh();
    onSelect?.(selectedPin);
  }
  function toggleMark(pin) {
    if (!pinsById.has(pin)) return;
    store.toggleMark(scope, pin);
    refresh();
    onChange?.(scope, store.markedPins(scope).length);
  }

  // ---- Per-pad setup -----------------------------------------------------
  function bindPad(g, pin) {
    const ep = pinsById.get(pin);
    const info = pinInfo(pin, ep?.signalClass);
    g.dataset.class = info.className;
    const valueEl = g.querySelector('.pad-value');
    if (!ep) {
      g.classList.add('dimmed'); // no reading for this pin
      if (valueEl) valueEl.textContent = '—';
      return;
    }
    const ek = emphasisKind(ep.parsed);
    if (ek === 'ol') g.classList.add('ol');
    if (ek === 'low') g.classList.add('low');
    if (valueEl) {
      valueEl.textContent = ep.parsed.kind === 'ol' ? 'OL' : ep.parsed.raw;
      // 36px pitch fits "0.79"; longer strings (0.809) must shrink or they collide
      g.classList.toggle('long-value', valueEl.textContent.length > 4);
    }

    g.tabIndex = 0;
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `Pin ${pin}, ${info.short}, ${info.name}, ${formatValue(ep.parsed)}`);

    const tip = tooltipHTML(info, ep.parsed);
    g.addEventListener('mouseenter', (e) => { showTip(tip, e.clientX, e.clientY); onHover?.(pin); });
    g.addEventListener('mousemove', (e) => placeTip(e.clientX, e.clientY));
    g.addEventListener('mouseleave', () => { hideTip(); onHover?.(null); });
    g.addEventListener('focus', () => {
      const r = g.getBoundingClientRect();
      showTip(tip, r.left, r.bottom);
    });
    g.addEventListener('blur', hideTip);
    g.addEventListener('click', () => select(pin));
    g.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        select(pin);
      } else if (e.key === 'Escape') {
        select(null);
      }
    });
  }

  groups.forEach(g => bindPad(g, Number(g.dataset.pin)));

  function refresh() {
    const marked = new Set(store.markedPins(scope));
    const focusCls = highlight ?? (activeFilter !== 'all' ? activeFilter : null);
    for (const g of groups) {
      const pin = Number(g.dataset.pin);
      g.classList.toggle('marked', marked.has(pin));
      g.classList.toggle('selected', pin === selectedPin);
      g.setAttribute('aria-pressed', pin === selectedPin ? 'true' : 'false');
      const cls = g.dataset.class;
      const inFocus = focusCls != null && cls === focusCls;
      g.classList.toggle('highlight', inFocus && pinsById.has(pin));
      g.classList.toggle('dimmed', focusCls != null && !inFocus && pinsById.has(pin));
    }
  }

  function applyCalibration() {
    for (const g of groups) {
      const slot = g.querySelector('.pad-value-adj');
      if (!slot) continue;
      const ep = pinsById.get(Number(g.dataset.pin));
      const scaled = (calibration != null && ep) ? scaleReading(ep.parsed, calibration) : null;
      slot.textContent = scaled ? scaled.raw : '';
    }
    container.classList.toggle('calibrated', calibration != null);
  }

  return {
    refresh,
    select,
    toggleMark,
    setCalibration(f) { calibration = (typeof f === 'number' && Number.isFinite(f) && f > 0) ? f : null; applyCalibration(); },
    get selectedPin() { return selectedPin; },
    get filter() { return activeFilter; },
    isMarked(pin) { return store.isMarked(scope, pin); },
    setFilter(c) { activeFilter = c ?? 'all'; refresh(); },
    setHighlight(c) { highlight = c ?? null; refresh(); },
    setLabels(on) { container.classList.toggle('hide-labels', !on); },
    // photo surfaces only: 'focus' = the pad strip at schematic scale, 'full' = the whole picture
    setView(mode) {
      if (!photo) return;
      container.querySelector('svg').setAttribute('viewBox', photoViewBox(photo, mode).join(' '));
      container.classList.toggle('photo-full', mode === 'full');
    },
    focusPin(pin) { groupByPin.get(pin)?.focus(); },
    destroy() {
      hideTip();
      clear(container);
      container.classList.remove('photo-surface', 'photo-full');
    },
  };
}
