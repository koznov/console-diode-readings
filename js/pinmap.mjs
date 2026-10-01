// Interactive SVG connector renderer. Thin DOM layer over the pure
// signals.mjs + values.mjs modules. Keeps no business logic of its own.
//
// Model: every pad shows its reading at all times (written into the
// template's .pad-value slot). Hover = tooltip with the pin's function.
// Click / Enter / Space = SELECT the pin (the host renders a detail panel via
// onSelect). Marking a pin as damaged is a separate, explicit action
// (toggleMark) so an accidental tap never flips a mark.

import { pinInfo } from './signals.mjs';
import { formatValue, emphasisKind } from './values.mjs';
import { clear } from './ui.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgCache = new Map();

async function loadSvg(path) {
  if (svgCache.has(path)) return svgCache.get(path);
  const res = await fetch(path);
  const txt = await res.text();
  const holder = document.createElementNS(SVG_NS, 'svg');
  holder.innerHTML = txt.trim();
  const node = holder.querySelector('svg') || holder;
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
 * @param {(scope:string,count:number)=>void} [opts.onChange] called after a mark toggles
 * @param {(pin:number|null)=>void}          [opts.onSelect] called when the selected pin changes
 */
export async function createPinmap({ container, connector, board, store, onChange, onSelect }) {
  const scope = `${board.id}:${connector.id}`;
  let activeFilter = 'all';
  let selectedPin = null;
  let tipEl = null;

  const svgRoot = await loadSvg(connector.svgTemplate);
  clear(container);
  container.appendChild(document.importNode(svgRoot, true));

  const groups = [...container.querySelectorAll('.pad-group')];
  const groupByPin = new Map(groups.map(g => [Number(g.dataset.pin), g]));
  const pinsById = new Map(connector.measurement.pins.map(p => [p.num, p]));

  // ---- Tooltip (hover / focus only) --------------------------------------
  function tooltipHTML(info, parsed) {
    // Class line only when it adds information (pin 18 is just "+5V Power").
    const cls = info.classDisplayName !== info.name
      ? `<span class="tt-class">${escapeHtml(info.classDisplayName)}</span> &middot; `
      : '';
    return `<b>Pin ${info.pin}</b> &middot; ${escapeHtml(info.name)}`
      + `<br>${cls}<span class="tt-val">${escapeHtml(formatValue(parsed))}</span>`;
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
    if (valueEl) valueEl.textContent = ep.parsed.kind === 'ol' ? 'OL' : ep.parsed.raw;

    g.tabIndex = 0;
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `Pin ${pin}, ${info.name}, ${formatValue(ep.parsed)}`);

    const tip = tooltipHTML(info, ep.parsed);
    g.addEventListener('mouseenter', (e) => showTip(tip, e.clientX, e.clientY));
    g.addEventListener('mousemove', (e) => placeTip(e.clientX, e.clientY));
    g.addEventListener('mouseleave', hideTip);
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
    for (const g of groups) {
      const pin = Number(g.dataset.pin);
      g.classList.toggle('marked', marked.has(pin));
      g.classList.toggle('selected', pin === selectedPin);
      g.setAttribute('aria-pressed', pin === selectedPin ? 'true' : 'false');
      const cls = g.dataset.class;
      g.classList.toggle('dimmed', activeFilter !== 'all' && cls !== activeFilter && pinsById.has(pin));
    }
  }

  return {
    refresh,
    select,
    toggleMark,
    get selectedPin() { return selectedPin; },
    isMarked(pin) { return store.isMarked(scope, pin); },
    setFilter(c) { activeFilter = c; refresh(); },
    setLabels(on) { container.classList.toggle('hide-labels', !on); },
    focusPin(pin) { groupByPin.get(pin)?.focus(); },
    destroy() { hideTip(); clear(container); },
  };
}
