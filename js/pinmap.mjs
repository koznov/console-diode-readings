// Interactive SVG connector renderer. Thin DOM layer over the pure
// signals.mjs + values.mjs modules. Keeps no business logic of its own.

import { canonicalSignal, SIGNAL_CLASSES } from './signals.mjs';
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

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.container  where the SVG mounts
 * @param {Object} opts.connector       normalized connector (from loader)
 * @param {Object} opts.board            normalized board (from loader)
 * @param {import('./store.mjs').Store} opts.store
 * @param {(scope:string,count:number)=>void} [opts.onChange] called after a mark toggles
 */
export async function createPinmap({ container, connector, board, store, onChange }) {
  const scope = `${board.id}:${connector.id}`;
  let activeFilter = 'all';
  let tipEl = null;

  const svgRoot = await loadSvg(connector.svgTemplate);
  clear(container);
  container.appendChild(document.importNode(svgRoot, true));

  const groups = [...container.querySelectorAll('.pad-group')];
  const pinsById = new Map(
    connector.measurement.pins.map(p => [p.num, p]),
  );

  function tooltipHTML(pin, sigCls, parsed) {
    const disp = SIGNAL_CLASSES[sigCls]?.displayName ?? sigCls;
    return `<b>Pin ${pin}</b> &middot; ${escapeAttr(disp)}<br><span class="tt-val">${escapeAttr(formatValue(parsed))}</span>`;
  }
  function escapeAttr(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function showTip(html, clientX, clientY) {
    hideTip();
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.innerHTML = html;
    document.body.appendChild(tipEl);
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

  function bindPad(g, pin) {
    const ep = pinsById.get(pin);
    const cls = ep ? ep.signalClass : canonicalSignal(pin).className;
    g.dataset.class = cls;
    if (!ep) {
      g.classList.add('dimmed'); // no reading for this pin
      return;
    }
    const ek = emphasisKind(ep.parsed);
    if (ek === 'ol') g.classList.add('ol');
    if (ek === 'low') g.classList.add('low');

    g.tabIndex = 0;
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `Pin ${pin}, ${SIGNAL_CLASSES[cls]?.displayName ?? cls}, ${formatValue(ep.parsed)}`);

    g.addEventListener('mouseenter', (e) => showTip(tooltipHTML(pin, cls, ep.parsed), e.clientX, e.clientY));
    g.addEventListener('mousemove', (e) => { if (tipEl) { tipEl.style.left = `${e.clientX + 14}px`; tipEl.style.top = `${e.clientY + 14}px`; } });
    g.addEventListener('mouseleave', hideTip);
    g.addEventListener('focus', (e) => {
      const r = g.getBoundingClientRect();
      showTip(tooltipHTML(pin, cls, ep.parsed), r.left, r.bottom);
    });
    g.addEventListener('blur', hideTip);
    g.addEventListener('click', () => {
      store.toggleMark(scope, pin);
      refresh();
      onChange?.(scope, store.markedPins(scope).length);
    });
    g.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        store.toggleMark(scope, pin);
        refresh();
        onChange?.(scope, store.markedPins(scope).length);
      }
    });
  }

  groups.forEach(g => bindPad(g, Number(g.dataset.pin)));

  function refresh() {
    const marked = new Set(store.markedPins(scope));
    for (const g of groups) {
      const pin = Number(g.dataset.pin);
      g.classList.toggle('marked', marked.has(pin));
      const cls = g.dataset.class;
      g.classList.toggle('dimmed', activeFilter !== 'all' && cls !== activeFilter && pinsById.has(pin));
    }
  }

  return {
    refresh,
    setFilter(c) { activeFilter = c; refresh(); },
    setLabels(on) { container.classList.toggle('hide-labels', !on); },
    destroy() { hideTip(); clear(container); },
  };
}
