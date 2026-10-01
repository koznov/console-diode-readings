import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The HDMI template is consumed by js/pinmap.mjs via these contracts:
//   .pad-group[data-pin]  one per pin, 1..19
//   .pad                  the coloured rect
//   .pad-label            pin number
//   .pad-value            reading slot, filled at runtime
const SVG = await readFile(new URL('../assets/connectors/hdmi.svg', import.meta.url), 'utf8');

function padGroups() {
  // Each group is a <g class="pad-group" data-pin="N"> ... </g> block.
  const re = /<g class="pad-group" data-pin="(\d+)">([\s\S]*?)<\/g>/g;
  const out = [];
  for (const m of SVG.matchAll(re)) out.push({ pin: Number(m[1]), body: m[2] });
  return out;
}

test('template exposes exactly pins 1..19, each once', () => {
  const pins = padGroups().map(g => g.pin).sort((a, b) => a - b);
  assert.deepEqual(pins, Array.from({ length: 19 }, (_, i) => i + 1));
});

test('every pad group has a pad, a number label and an empty value slot', () => {
  for (const g of padGroups()) {
    assert.match(g.body, /<rect class="pad"/, `pin ${g.pin}: missing .pad`);
    assert.match(g.body, new RegExp(`<text class="pad-label"[^>]*>${g.pin}<\\/text>`), `pin ${g.pin}: label mismatch`);
    assert.match(g.body, /<text class="pad-value"[^>]*><\/text>/, `pin ${g.pin}: missing empty .pad-value slot`);
  }
});

test('pads sit in a single row, ordered 19 → 1 left to right like the board footprint', () => {
  const xs = new Map();
  const ys = new Set();
  for (const g of padGroups()) {
    const m = g.body.match(/<rect class="pad" x="([\d.]+)"\s+y="([\d.]+)"/);
    assert.ok(m, `pin ${g.pin}: pad rect lacks x/y`);
    xs.set(g.pin, Number(m[1]));
    ys.add(Number(m[2]));
  }
  assert.equal(ys.size, 1, 'all pads share one y (single row)');
  for (let p = 19; p > 1; p--) {
    assert.ok(xs.get(p) < xs.get(p - 1), `pin ${p} should be left of pin ${p - 1}`);
  }
});

test('pads are evenly spaced', () => {
  const xs = padGroups()
    .map(g => Number(g.body.match(/<rect class="pad" x="([\d.]+)"/)[1]))
    .sort((a, b) => a - b);
  const pitch = xs[1] - xs[0];
  for (let i = 1; i < xs.length; i++) {
    assert.ok(Math.abs((xs[i] - xs[i - 1]) - pitch) < 0.01, `uneven pitch between pad ${i - 1} and ${i}`);
  }
});

test('template has no <title> (it would surface as a native browser tooltip over our own)', () => {
  assert.doesNotMatch(SVG, /<title>/);
  assert.match(SVG, /aria-label="/);
  assert.match(SVG, /role="group"/);
});
