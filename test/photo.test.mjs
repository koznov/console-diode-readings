import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as photo from '../js/photo.mjs';

const { padPositions } = photo;

// Pad centre for a pin, from a padPositions() result.
const at = (overlay, pin) => overlay.pads.find(p => p.pin === pin);
const near = (actual, expected, what, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${what}: expected ${expected}, got ${actual}`);

test('padPositions spaces the 19 pads evenly from a pin-19 anchor (left) to a pin-1 anchor (right)', () => {
  const o = padPositions({ '19': [100, 50], '1': [460, 50] });
  assert.equal(o.pads.length, 19);
  near(o.pitch, 20, 'pitch');
  for (const [pin, x] of [[19, 100], [18, 120], [10, 280], [2, 440], [1, 460]]) {
    near(at(o, pin).x, x, `pin ${pin} x`);
    near(at(o, pin).y, 50, `pin ${pin} y`);
  }
});

test('padPositions follows the anchors, so a photo with pin 1 on the left works too', () => {
  const o = padPositions({ '1': [100, 50], '19': [460, 50] });
  near(at(o, 1).x, 100, 'pin 1 x');
  near(at(o, 10).x, 280, 'pin 10 x');
  near(at(o, 19).x, 460, 'pin 19 x');
});

test('padPositions follows a tilted pad row and measures the pitch along it', () => {
  const o = padPositions({ '19': [0, 0], '1': [360, 36] });
  near(at(o, 10).x, 180, 'pin 10 x');
  near(at(o, 10).y, 18, 'pin 10 y');
  near(o.pitch, 20.0998, 'pitch', 1e-3);
});

test('padPositions extrapolates past anchors that are not the end pins', () => {
  const o = padPositions({ '19': [100, 50], '10': [280, 50] });
  near(at(o, 1).x, 460, 'pin 1 x');
  near(o.pitch, 20, 'pitch');
});

test('padPositions rejects anchors it cannot turn into a pad row', () => {
  const cases = [
    ['no anchors', undefined, /exactly two/],
    ['one anchor', { '19': [100, 50] }, /exactly two/],
    ['three anchors', { '19': [100, 50], '10': [280, 50], '1': [460, 50] }, /exactly two/],
    ['pin 0', { '0': [100, 50], '19': [460, 50] }, /from 1 to 19/],
    ['pin 20', { '20': [100, 50], '1': [460, 50] }, /from 1 to 19/],
    ['non-numeric pin', { 'x': [100, 50], '1': [460, 50] }, /from 1 to 19/],
    ['half a point', { '19': [100], '1': [460, 50] }, /\[x, y\]/],
    ['text coordinates', { '19': ['100', '50'], '1': [460, 50] }, /\[x, y\]/],
    ['same pin twice', { '1': [100, 50], '01': [460, 50] }, /different pins/],
    ['anchors on top of each other', { '19': [100, 50], '1': [100, 50] }, /apart/],
  ];
  for (const [name, anchors, pattern] of cases) {
    assert.throws(() => padPositions(anchors), pattern, name);
  }
});

// ---- Layout: the photo is placed in the schematic's coordinate system ------------
// photoLayout() returns an SVG matrix that carries the photo into the same units as
// assets/connectors/hdmi.svg, so the pad row is horizontal, one template pitch per
// pad, and every size in css/style.css (36-unit pitch) keeps working on a photo.

const TEMPLATE = await readFile(new URL('../assets/connectors/hdmi.svg', import.meta.url), 'utf8');

function padBlocks(svg) {
  return [...svg.matchAll(/<g class="pad-group" data-pin="(\d+)">([\s\S]*?)<\/g>/g)]
    .map(m => ({ pin: Number(m[1]), body: m[2] }));
}
function padCentreX(body) {
  const m = body.match(/<rect class="pad" x="([\d.]+)"\s+y="[\d.]+"\s+width="([\d.]+)"/);
  assert.ok(m, `pad rect with x/y/width not found in: ${body.slice(0, 80)}`);
  return Number(m[1]) + Number(m[2]) / 2;
}
const templateX = new Map(padBlocks(TEMPLATE).map(g => [g.pin, padCentreX(g.body)]));
const TEMPLATE_PITCH = templateX.get(18) - templateX.get(19);

// matrix(a b c d e f) applied to a point
const apply = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];

const STRAIGHT = { '19': [100, 200], '1': [460, 200] };
const TILTED = { '19': [0, 0], '1': [360, 36] };
const MIRRORED = { '1': [100, 200], '19': [460, 200] };
const VERTICAL = { '19': [200, 100], '1': [200, 460] };   // portrait shot: the pad row runs down the picture

test('photoLayout puts the pad columns exactly where the schematic template has its pads', () => {
  const { columns } = photo.photoLayout(STRAIGHT);
  assert.equal(columns.length, 19);
  for (const col of columns) {
    near(col.x, templateX.get(col.pin), `pin ${col.pin} column x`, 1e-6);
  }
});

test('photoLayout maps each anchor onto its own column, whatever the tilt of the shot', () => {
  for (const anchors of [STRAIGHT, TILTED, MIRRORED, VERTICAL]) {
    const { matrix, columns } = photo.photoLayout(anchors);
    for (const [pin, point] of Object.entries(anchors)) {
      const col = columns.find(c => c.pin === Number(pin));
      const [x, y] = apply(matrix, point);
      near(x, col.x, `pin ${pin} anchor x (${JSON.stringify(anchors)})`, 1e-6);
      near(y, col.y, `pin ${pin} anchor y (${JSON.stringify(anchors)})`, 1e-6);
    }
  }
});

test('photoLayout levels a tilted row: every column on one line, one template pitch apart', () => {
  const { matrix, columns } = photo.photoLayout(TILTED);
  for (const col of columns) near(col.y, columns[0].y, `pin ${col.pin} y`, 1e-6);
  for (let i = 1; i < columns.length; i++) {
    near(columns[i].x - columns[i - 1].x, TEMPLATE_PITCH, `gap before column ${i}`, 1e-6);
  }
  // the picture itself is levelled: 18 pitches between the two anchors, no height difference
  const [x19, y19] = apply(matrix, TILTED['19']);
  const [x1, y1] = apply(matrix, TILTED['1']);
  near(Math.hypot(x1 - x19, y1 - y19), 18 * TEMPLATE_PITCH, 'anchor distance', 1e-6);
  near(y1, y19, 'anchors share a y after levelling', 1e-6);
});

test('photoLayout lists columns left to right, so pin order follows the photo', () => {
  assert.deepEqual(photo.photoLayout(STRAIGHT).columns.map(c => c.pin),
    [19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(photo.photoLayout(MIRRORED).columns.map(c => c.pin),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});

test('photoLayout turns the picture by at most a quarter turn and never mirrors it', () => {
  for (const anchors of [STRAIGHT, MIRRORED, TILTED, VERTICAL]) {
    const [a, b, c, d] = photo.photoLayout(anchors).matrix;
    assert.ok(a >= -1e-9 && d >= -1e-9, `photo must not be turned past a quarter turn for ${JSON.stringify(anchors)}`);
    assert.ok(a * d - b * c > 0, `photo must not be mirrored for ${JSON.stringify(anchors)}`);
  }
});

test('photoLayout lays a portrait shot down on its side so the pads still run left to right', () => {
  const { matrix, columns } = photo.photoLayout(VERTICAL);
  assert.deepEqual(columns.map(c => c.pin), [19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  // pin 10 sits halfway down the row in the picture and halfway along the strip after laying it down
  const [x, y] = apply(matrix, [200, 280]);
  near(x, templateX.get(10), 'pin 10 x', 1e-6);
  near(y, columns[0].y, 'pin 10 y', 1e-6);
});

// ---- Markup: same pad contract as the template, so pinmap.mjs needs no special case ----

const PHOTO = {
  src: 'assets/photos/test-board/port.png',
  caption: 'HDMI port, top view',
  size: [600, 400],
  anchors: STRAIGHT,
};

test('photoSvgMarkup gives pinmap.mjs the same pad contract as the schematic template', () => {
  const groups = padBlocks(photo.photoSvgMarkup(PHOTO));
  assert.deepEqual(groups.map(g => g.pin).sort((a, b) => a - b), Array.from({ length: 19 }, (_, i) => i + 1));
  for (const g of groups) {
    assert.match(g.body, /<rect class="pad" /, `pin ${g.pin}: missing .pad`);
    assert.match(g.body, new RegExp(`<text class="pad-label"[^>]*>${g.pin}<\\/text>`), `pin ${g.pin}: label mismatch`);
    assert.match(g.body, /<text class="pad-value"[^>]*><\/text>/, `pin ${g.pin}: missing empty .pad-value slot`);
    assert.match(g.body, /<text class="pad-value-adj"[^>]*><\/text>/, `pin ${g.pin}: missing empty .pad-value-adj slot`);
  }
});

test('photoSvgMarkup centres every hotspot on its schematic pad position', () => {
  for (const g of padBlocks(photo.photoSvgMarkup(PHOTO))) {
    near(padCentreX(g.body), templateX.get(g.pin), `pin ${g.pin} hotspot x`, 0.01);
  }
});

test('photoSvgMarkup lays each pad group out like the schematic template: same sizes, label, value and caret rows', () => {
  // Hand-checked against assets/hdmi.svg: css/style.css sizes fonts and rings for this layout, so a
  // photo must not drift from it (rows, pad height, caret) — only the pad's own x may differ.
  const skeleton = (body) => body.replace(/\s+/g, ' ').replace(/-?\d+(\.\d+)?/g, '#').trim();
  const numbers = (body) => (body.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const fromTemplate = new Map(padBlocks(TEMPLATE).map(g => [g.pin, g.body]));
  const groups = padBlocks(photo.photoSvgMarkup(PHOTO));
  assert.equal(groups.length, 19);
  for (const g of groups) {
    const want = fromTemplate.get(g.pin);
    assert.equal(skeleton(g.body), skeleton(want), `pin ${g.pin}: element structure differs from the template`);
    const got = numbers(g.body);
    const exp = numbers(want);
    assert.equal(got.length, exp.length, `pin ${g.pin}: number of coordinates differs`);
    got.forEach((v, i) => near(v, exp[i], `pin ${g.pin} coordinate #${i}`, 0.01));
  }
});

test('photoSvgMarkup emits pads left to right so Tab walks the photo in reading order', () => {
  const xs = padBlocks(photo.photoSvgMarkup(PHOTO)).map(g => padCentreX(g.body));
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], `pad ${i} is not right of pad ${i - 1}`);
});

test('photoSvgMarkup draws the photo at its declared size, tilted into place by the layout matrix', () => {
  const svg = photo.photoSvgMarkup(PHOTO);
  const img = svg.match(/<image [^>]*>/)?.[0];
  assert.ok(img, 'no <image> element');
  assert.match(img, /href="assets\/photos\/test-board\/port\.png"/);
  assert.match(img, /width="600"/);
  assert.match(img, /height="400"/);
  const m = img.match(/transform="matrix\(([^)]+)\)"/);
  assert.ok(m, 'image has no matrix transform');
  const got = m[1].trim().split(/[\s,]+/).map(Number);
  const want = photo.photoLayout(STRAIGHT).matrix;
  assert.equal(got.length, 6);
  got.forEach((v, i) => near(v, want[i], `matrix[${i}]`, 0.01));
});

test('photoSvgMarkup escapes the photo path and caption instead of injecting them', () => {
  const svg = photo.photoSvgMarkup({ ...PHOTO, src: 'a"b<c&d.png', caption: '"><script>alert(1)</script>' });
  assert.doesNotMatch(svg, /<script/i);
  assert.match(svg, /href="a&quot;b&lt;c&amp;d\.png"/);
});

// ---- View windows: zoomed strip (default) and the whole picture ---------------------

const TEMPLATE_VIEWBOX = TEMPLATE.match(/<svg[^>]*viewBox="([\d.\s-]+)"/)[1].trim().split(/\s+/).map(Number);

test('photoViewBox("focus") is the schematic window, so readings are legible at the template scale', () => {
  assert.deepEqual(photo.photoViewBox(PHOTO, 'focus'), TEMPLATE_VIEWBOX);
});

test('photoViewBox("full") frames the whole picture', () => {
  // hand-derived: a 20 px pitch becomes 36 units (x1.8) and (100,200) lands on (42,70),
  // so corner (0,0) -> (-138,-290) and corner (600,400) -> (942,430)
  assert.deepEqual(photo.photoViewBox(PHOTO, 'full'), [-138, -290, 1080, 720]);
});

test('photoViewBox("full") still contains every corner of a tilted picture', () => {
  const tilted = { ...PHOTO, anchors: TILTED };
  const { matrix } = photo.photoLayout(tilted.anchors);
  const [x, y, w, h] = photo.photoViewBox(tilted, 'full');
  for (const corner of [[0, 0], [600, 0], [600, 400], [0, 400]]) {
    const [cx, cy] = apply(matrix, corner);
    // outward rounding must never clip a corner; 1e-6 is the layout's own float-noise floor
    assert.ok(cx >= x - 1e-6 && cx <= x + w + 1e-6 && cy >= y - 1e-6 && cy <= y + h + 1e-6,
      `corner ${corner} falls outside ${[x, y, w, h]}`);
  }
});

test('photoViewBox rejects an unknown mode instead of guessing', () => {
  assert.throws(() => photo.photoViewBox(PHOTO, 'zoom'), /focus.*full/);
});

test('photoSvgMarkup opens on the focus window', () => {
  const vb = photo.photoSvgMarkup(PHOTO).match(/<svg[^>]*viewBox="([^"]+)"/)?.[1];
  assert.deepEqual(vb?.split(/\s+/).map(Number), TEMPLATE_VIEWBOX);
});
