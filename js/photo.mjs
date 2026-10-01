// Geometry and markup for a board photo with live pins. Pure (no DOM) so it
// can be tested without a browser. A photo names two anchors — the pixel
// centre of two pads — and every other pad sits on the evenly spaced straight
// row through them. photoLayout() carries the photo into the coordinate
// system of assets/connectors/hdmi.svg and photoSvgMarkup() draws it with the
// same .pad-group / .pad-value contract the schematic has, so js/pinmap.mjs
// and css/style.css treat a photo like any other connector surface.

import { HDMI_PIN_COUNT } from './signals.mjs';
import { escapeHtml } from './ui.mjs';

// Where the schematic template puts things. A photo is carried into these
// units, so pad size, label offsets and every font size in css/style.css keep
// working on a photo unchanged.
const TEMPLATE = { width: 740, height: 162, firstX: 42, rowY: 70, pitch: 36, padW: 20, padH: 36 };

function anchorPin(key) {
  const pin = /^\d+$/.test(key) ? Number(key) : NaN;
  if (!(pin >= 1 && pin <= HDMI_PIN_COUNT)) {
    throw new Error(`anchor pin "${key}" must be a whole number from 1 to ${HDMI_PIN_COUNT}`);
  }
  return pin;
}

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/**
 * @param {Object<string,[number,number]>} anchors  exactly two entries: pin number → [x, y] in photo pixels
 * @returns {{ pads: {pin:number,x:number,y:number}[], pitch: number }}  pads in pin order 1..19; pitch in photo pixels
 */
export function padPositions(anchors) {
  const entries = Object.entries(anchors ?? {});
  if (entries.length !== 2) {
    throw new Error(`anchors must name exactly two pins, got ${entries.length}`);
  }
  const [[ka, pa], [kb, pb]] = entries;
  const a = anchorPin(ka);
  const b = anchorPin(kb);
  for (const [k, pt] of entries) {
    if (!isPoint(pt)) throw new Error(`anchor for pin ${k} must be [x, y] numbers`);
  }
  if (a === b) throw new Error('anchors must be on different pins');

  const stepX = (pb[0] - pa[0]) / (b - a);
  const stepY = (pb[1] - pa[1]) / (b - a);
  const pitch = Math.hypot(stepX, stepY);
  if (pitch === 0) throw new Error('anchors must be apart from each other');

  const pads = [];
  for (let pin = 1; pin <= HDMI_PIN_COUNT; pin++) {
    pads.push({ pin, x: pa[0] + (pin - a) * stepX, y: pa[1] + (pin - a) * stepY });
  }
  return { pads, pitch };
}

/**
 * Carries a photo into schematic units: levels the pad row, scales its pitch to
 * the template's and puts the first pad on the template's first slot. The photo
 * is only rotated by at most a quarter turn and never mirrored, so it stays
 * upright; slots run left to right in whatever pin order the photo shows.
 * @returns {{ matrix: number[], columns: {pin:number,x:number,y:number}[] }}
 *   matrix is an SVG matrix(a b c d e f); columns are the pad centres, left to right
 */
export function photoLayout(anchors) {
  const { pads, pitch } = padPositions(anchors);
  const dx = pads[HDMI_PIN_COUNT - 1].x - pads[0].x;
  const dy = pads[HDMI_PIN_COUNT - 1].y - pads[0].y;
  const order = (dx > 0 || (dx === 0 && dy > 0)) ? pads : [...pads].reverse();
  const first = order[0];
  const last = order[order.length - 1];

  const run = Math.hypot(last.x - first.x, last.y - first.y);
  const cos = (last.x - first.x) / run;
  const sin = (last.y - first.y) / run;
  const s = TEMPLATE.pitch / pitch;
  const a = s * cos;
  const b = -s * sin;
  const c = s * sin;
  const d = s * cos;
  const e = TEMPLATE.firstX - (a * first.x + c * first.y);
  const f = TEMPLATE.rowY - (b * first.x + d * first.y);

  const columns = order.map((p, i) => ({ pin: p.pin, x: TEMPLATE.firstX + i * TEMPLATE.pitch, y: TEMPLATE.rowY }));
  return { matrix: [a, b, c, d, e, f], columns };
}

// Float noise would otherwise leak into attributes and exact comparisons.
const tidy = (v) => Math.round(v * 1e6) / 1e6;
const num = (v) => String(Math.round(v * 1e4) / 1e4);
const down = (v) => Math.floor(tidy(v) * 100) / 100 + 0;
const up = (v) => Math.ceil(tidy(v) * 100) / 100 + 0;

/**
 * SVG viewBox for a photo surface.
 *   'focus' — the schematic's window: the pad strip at schematic scale, so every
 *             reading is as legible as on the schematic (default)
 *   'full'  — the whole picture, however it sits after levelling
 * @param {{size:[number,number], anchors:Object}} photo
 * @returns {number[]} [x, y, width, height]
 */
export function photoViewBox(photo, mode = 'focus') {
  if (mode === 'focus') return [0, 0, TEMPLATE.width, TEMPLATE.height];
  if (mode !== 'full') throw new Error(`view mode must be "focus" or "full", got "${mode}"`);

  const [w, h] = photo.size;
  const [a, b, c, d, e, f] = photoLayout(photo.anchors).matrix;
  const xs = [];
  const ys = [];
  for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  const x0 = down(Math.min(...xs));
  const y0 = down(Math.min(...ys));
  const x1 = up(Math.max(...xs));
  const y1 = up(Math.max(...ys));
  return [x0, y0, Math.round((x1 - x0) * 100) / 100, Math.round((y1 - y0) * 100) / 100];
}

/**
 * Markup for a photo surface: the picture, levelled into schematic units, with
 * the same 19 .pad-group hotspots as assets/connectors/hdmi.svg, left to right.
 * @param {{src:string, caption?:string, size:[number,number], anchors:Object}} photo
 * @returns {string} an <svg> element
 */
export function photoSvgMarkup(photo) {
  const { matrix, columns } = photoLayout(photo.anchors);
  const [w, h] = photo.size;
  const label = `${photo.caption ? `${photo.caption} — ` : ''}HDMI connector photo, ${HDMI_PIN_COUNT} pads`;

  const pads = columns.map(({ pin, x, y }) => `
  <g class="pad-group" data-pin="${pin}">
    <rect class="pad" x="${num(x - TEMPLATE.padW / 2)}" y="${num(y - TEMPLATE.padH / 2)}" width="${TEMPLATE.padW}" height="${TEMPLATE.padH}" rx="3"/>
    <text class="pad-label" x="${num(x)}" y="44">${pin}</text>
    <text class="pad-value" x="${num(x)}" y="106"></text>
    <text class="pad-value-adj" x="${num(x)}" y="120"></text>
    <polygon class="pad-caret" points="${num(x - 5)},134 ${num(x + 5)},134 ${num(x)},128"/>
  </g>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${photoViewBox(photo, 'focus').join(' ')}" role="group" aria-label="${escapeHtml(label)}">
  <image href="${escapeHtml(photo.src)}" x="0" y="0" width="${num(w)}" height="${num(h)}" preserveAspectRatio="none" transform="matrix(${matrix.map(num).join(' ')})"/>${pads}
</svg>`;
}
