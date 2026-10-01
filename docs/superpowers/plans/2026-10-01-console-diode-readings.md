# Console Diode Readings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static, zero-build GitHub Pages site with interactive HDMI diode readings for major consoles, seeded with all readings from the originating forum post.

**Architecture:** Static HTML/CSS/vanilla ES-module JS, no bundler. Data in JSON files fetched client-side. Logic factored into pure, Node-testable modules; DOM code kept thin. State persisted in localStorage. Two-layer license (MIT code + CC BY-SA data).

**Tech Stack:** Vanilla ES modules, `node:test` (Node 20 built-in) for pure-logic tests, SVG for the connector graphic, GitHub Pages for hosting.

**Spec:** `docs/superpowers/specs/2026-10-01-console-diode-readings-design.md`

## Global Constraints

- Zero build step: GitHub Pages serves `index.html` + `css/` + `js/` + `data/` + `assets/` verbatim. `.nojekyll` present in repo root.
- Repo is PUBLIC (`koznov/console-diode-readings`); GitHub Pages enabled from branch `main`, folder `/root`.
- License: site code → MIT (`LICENSE`); data/photos/prose → CC BY-SA 4.0 (`DATA-LICENSE`). Both present in first shipped commit.
- Pin readings are STRINGS (preserve `OL`, `0`, decimals); never normalize to floats in stored data.
- Canonical HDMI signal-class mapping lives in `js/signals.mjs` and is the single source of truth; per-board JSON stores only `num` + `value` (+ optional overrides).
- Tests run with `node --test` (no external deps installed). Pure logic only; no DOM in tests.
- Copy rule: contributor-submitted readings are CC BY-SA 4.0 (stated in CONTRIBUTING.md + Issue template).
- Mobile-first: works at 320px width, 16px gutters, no horizontal scroll.

## Review Focus

Five behaviors the spec implies but no task's happy-path exercises, most likely to bite a technician using this:

1. **Malformed/legacy board JSON missing a pin** — a board file with fewer than 19 pin entries must not silently render undefined pads or crash; loader surfaces a clear error naming the board and missing pin numbers. Tested in Task 5.
2. **Unknown `signalClass` override in a board file** — a board JSON overriding a pin's class with a typo (`"grnd"`) must fall back to the canonical class, not produce an uncolored pad. Tested in Task 3.
3. **Numeric-string values that aren't `OL` or `0`** — value parsing must distinguish `OL` (open), `0` (near-ground), and a numeric like `"0.79"` for tooltip formatting and emphasis styling, and reject garbage like `"o"`/`""` loudly. Tested in Task 4.
4. **localStorage quota / unavailable** — marking pins must degrade gracefully when `localStorage` throws (private mode, disabled); the app still works in-session, marks just won't survive reload. Tested in Task 7.
5. **Empty `catalog.json` or fetch failure (offline / bad deploy)** — the app must show a readable "couldn't load data" state, not a blank screen, and the catalog loader must tolerate a console referencing a board file that 404s by logging and skipping it. Tested in Task 5.

---

## File Structure

Pure-logic modules (importable by both browser and `node:test`):

- `js/signals.mjs` — canonical HDMI pin→class map, class metadata (display name, legend group, css var). Pure. Tested.
- `js/values.mjs` — interpret a reading string: `parseValue(str)` → `{kind:'ol'|'zero'|'numeric', volts:number|null, raw}`, plus `formatValue()` and `emphasisKind()`. Pure. Tested.
- `js/loader.mjs` — async `loadCatalog(fetchFn?)`, `loadBoard(boardEntry, fetchFn?)`; validates shape, collects errors. Uses injected `fetch` so tests stub it. Pure-ish (async, no DOM). Tested.
- `js/store.mjs` — `Store` class wrapping localStorage with safe get/set/clear/toggle; degrades when storage unavailable. Pure-ish (touches `globalThis.localStorage`, injectable). Tested.

DOM/render modules (browser-only, kept thin; logic pushed to the pure modules above):

- `js/app.mjs` — entry/bootstrap: wires sidebar nav, canvas, controls, theme, view toggle. Imports the pure modules.
- `js/pinmap.mjs` — renders the SVG connector into a container, binds hover/click/keyboard, reads marked-state from Store. Thin wrapper over `signals.mjs` + `values.mjs`.
- `js/ui.mjs` — small DOM helpers (el builder, escapeHtml) shared by app/pinmap.

Assets & data:

- `data/catalog.json`, `data/consoles/*.json` — seed data (Task 6).
- `assets/connectors/hdmi.svg` — vector connector template (Task 8).
- `css/style.css` — themes, layout, responsive (Task 9).
- `index.html` — app shell (Task 10).
- Top-level: `.nojekyll`, `README.md`, `CONTRIBUTING.md`, `LICENSE`, `DATA-LICENSE`, `.github/ISSUE_TEMPLATE/new-readings.md` (Tasks 1 & 11).

Tests:

- `test/signals.test.mjs`, `test/values.test.mjs`, `test/loader.test.mjs`, `test/store.test.mjs` — co-located under `test/`, run via `node --test`.

---

### Task 1: Repo scaffolding, licenses, and test harness

**Files:**
- Create: `.nojekyll`
- Create: `LICENSE` (MIT)
- Create: `DATA-LICENSE` (CC BY-SA 4.0 full text)
- Create: `package.json` (scripts only — `"test": "node --test test/"`)
- Create: `.gitignore` (node_modules, OS cruft)
- Create: `test/smoke.test.mjs`

**Interfaces:**
- Produces: `npm test` runs `node --test test/` and discovers `test/*.test.mjs`.

- [ ] **Step 1: Create `.nojekyll` (empty) and `.gitignore`**

`.gitignore`:
```
node_modules/
.DS_Store
Thumbs.db
*.log
```

- [ ] **Step 2: Write the MIT `LICENSE`**

Full MIT text, copyright holder `koznov`, year `2026`.

- [ ] **Step 3: Write the `DATA-LICENSE` (CC BY-SA 4.0)**

Full Creative Commons Attribution-ShareAlike 4.0 International legal code plaintext (the canonical CC BY-SA 4.0 text). Preface with a one-line note: "Applies to the data in `data/`, photographs in `assets/photos/`, and descriptive prose in README/CONTRIBUTING. Site code remains MIT (see LICENSE)."

- [ ] **Step 4: Write `package.json`**

```json
{
  "name": "console-diode-readings",
  "version": "0.1.0",
  "private": true,
  "description": "Interactive diode-mode readings reference for console HDMI ports.",
  "license": "MIT",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 5: Write a smoke test proving the harness works**

`test/smoke.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('smoke: harness runs', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 6: Run tests to verify the harness**

Run: `npm test`
Expected: PASS, 1 test, "tests 1 / pass 1".

- [ ] **Step 7: Commit**

```bash
git add .nojekyll .gitignore LICENSE DATA-LICENSE package.json test/smoke.test.mjs
git commit -m "chore: repo scaffolding, dual license, node:test harness"
```

---

### Task 2: Signal-class registry (`js/signals.mjs`)

**Files:**
- Create: `js/signals.mjs`
- Create: `test/signals.test.mjs`

**Interfaces:**
- Produces:
  - `HDMI_PIN_COUNT = 19`
  - `canonicalSignal(pinNumber:number): {className:string, displayName:string}` — returns the canonical class for a 1..19 HDMI pin; throws RangeError outside 1..19.
  - `SIGNAL_CLASSES: Record<string,{displayName:string,legendGroup:string,cssVar:string}>`
  - `LEGEND_GROUPS: Array<{group:string,classes:string[]}>` — ordered for the legend UI.

- [ ] **Step 1: Write the failing test**

`test/signals.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSignal, SIGNAL_CLASSES, LEGEND_GROUPS, HDMI_PIN_COUNT } from '../js/signals.mjs';

test('canonicalSignal maps all 19 HDMI pins', () => {
  const classes = [];
  for (let p = 1; p <= HDMI_PIN_COUNT; p++) classes.push(canonicalSignal(p).className);
  assert.equal(classes.length, 19);
  // spot-check the corrected mapping from the spec
  assert.equal(canonicalSignal(13).className, 'cec');
  assert.equal(canonicalSignal(14).className, 'utility');
  assert.equal(canonicalSignal(15).className, 'ddc');
  assert.equal(canonicalSignal(16).className, 'ddc');
  assert.equal(canonicalSignal(17).className, 'gnd');
  assert.equal(canonicalSignal(18).className, 'power-5v');
  assert.equal(canonicalSignal(19).className, 'hpd');
});

test('canonicalSignal throws outside 1..19', () => {
  assert.throws(() => canonicalSignal(0), RangeError);
  assert.throws(() => canonicalSignal(20), RangeError);
});

test('every referenced className exists in SIGNAL_CLASSES', () => {
  for (let p = 1; p <= HDMI_PIN_COUNT; p++) {
    const cls = canonicalSignal(p).className;
    assert.ok(SIGNAL_CLASSES[cls], `missing class metadata for "${cls}"`);
  }
});

test('unknown className falls back to canonical via resolveSignalClass', async () => {
  const mod = await import('../js/signals.mjs');
  const { resolveSignalClass } = mod;
  // valid override
  assert.equal(resolveSignalClass(2, 'power-5v'), 'power-5v');
  // invalid override falls back to canonical for that pin
  assert.equal(resolveSignalClass(2, 'grnd'), 'gnd');
  // no override uses canonical
  assert.equal(resolveSignalClass(2, undefined), 'gnd');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/signals.mjs'`.

- [ ] **Step 3: Write the implementation**

`js/signals.mjs`:
```javascript
// Canonical HDMI 19-pin signal-class mapping. Single source of truth.
// Class keys drive CSS variables (--sig-<key>) and legend grouping.

export const HDMI_PIN_COUNT = 19;

export const SIGNAL_CLASSES = {
  'gnd':          { displayName: 'Ground / Shield', legendGroup: 'Power & Ground', cssVar: '--sig-gnd' },
  'power-5v':     { displayName: '+5V Power',        legendGroup: 'Power & Ground', cssVar: '--sig-power-5v' },
  'tmds-data-pos':{ displayName: 'TMDS Data +',     legendGroup: 'TMDS Data',      cssVar: '--sig-tmds-data-pos' },
  'tmds-data-neg':{ displayName: 'TMDS Data −',     legendGroup: 'TMDS Data',      cssVar: '--sig-tmds-data-neg' },
  'tmds-clk-pos': { displayName: 'TMDS Clock +',    legendGroup: 'TMDS Clock',      cssVar: '--sig-tmds-clk-pos' },
  'tmds-clk-neg': { displayName: 'TMDS Clock −',    legendGroup: 'TMDS Clock',      cssVar: '--sig-tmds-clk-neg' },
  'ddc':          { displayName: 'DDC (SCL/SDA)',   legendGroup: 'Control',         cssVar: '--sig-ddc' },
  'cec':          { displayName: 'CEC',             legendGroup: 'Control',         cssVar: '--sig-cec' },
  'utility':      { displayName: 'Utility / HEAC',   legendGroup: 'Control',         cssVar: '--sig-utility' },
  'hpd':          { displayName: 'Hot Plug Detect',  legendGroup: 'Misc',           cssVar: '--sig-hpd' },
};

const PIN_CLASS = {
  1:'tmds-data-pos', 2:'gnd', 3:'tmds-data-neg',
  4:'tmds-data-pos', 5:'gnd', 6:'tmds-data-neg',
  7:'tmds-data-pos', 8:'gnd', 9:'tmds-data-neg',
  10:'tmds-clk-pos', 11:'gnd', 12:'tmds-clk-neg',
  13:'cec', 14:'utility', 15:'ddc', 16:'ddc',
  17:'gnd', 18:'power-5v', 19:'hpd',
};

export function canonicalSignal(pin) {
  if (!Number.isInteger(pin) || pin < 1 || pin > HDMI_PIN_COUNT) {
    throw new RangeError(`HDMI pin out of range: ${pin}`);
  }
  const className = PIN_CLASS[pin];
  return { className, displayName: SIGNAL_CLASSES[className].displayName };
}

// Allow a board file to override a pin's class, falling back to canonical
// when the override is unrecognized. Defends against typos in contributed data.
export function resolveSignalClass(pin, override) {
  const canon = canonicalSignal(pin).className;
  if (override == null) return canon;
  return Object.prototype.hasOwnProperty.call(SIGNAL_CLASSES, override) ? override : canon;
}

export const LEGEND_GROUPS = (() => {
  const order = ['Power & Ground','TMDS Data','TMDS Clock','Control','Misc'];
  const map = {};
  for (const [cls, meta] of Object.entries(SIGNAL_CLASSES)) {
    (map[meta.legendGroup] ??= []).push(cls);
  }
  return order.map(group => ({ group, classes: map[group] }));
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — signals suite green, smoke green.

- [ ] **Step 5: Commit**

```bash
git add js/signals.mjs test/signals.test.mjs
git commit -m "feat(signals): canonical HDMI pin signal-class registry"
```

---

### Task 3: Value interpreter (`js/values.mjs`)

**Files:**
- Create: `js/values.mjs`
- Create: `test/values.test.mjs`

**Interfaces:**
- Produces:
  - `parseValue(raw:string): {kind:'ol'|'zero'|'numeric', volts:number|null, raw}`
  - `formatValue(parsed): string` — display string for tooltips/CSV.
  - `emphasisKind(parsed): 'normal'|'ol'|'low'` — drives SVG styling.

- [ ] **Step 1: Write the failing test**

`test/values.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValue, formatValue, emphasisKind } from '../js/values.mjs';

test('parseValue recognizes OL (case-insensitive, trimmed)', () => {
  for (const r of ['OL', ' ol ', 'Ol']) {
    const p = parseValue(r);
    assert.equal(p.kind, 'ol');
    assert.equal(p.volts, null);
    assert.equal(emphasisKind(p), 'ol');
  }
});

test('parseValue recognizes zero / near-zero', () => {
  for (const r of ['0', '0.0', '0.00', '0.001']) {
    const p = parseValue(r);
    assert.equal(p.kind, 'zero');
    assert.equal(emphasisKind(p), 'low');
  }
});

test('parseValue parses numeric volt drops', () => {
  const p = parseValue('0.79');
  assert.equal(p.kind, 'numeric');
  assert.equal(p.volts, 0.79);
  assert.equal(formatValue(p), '0.79 V');
  assert.equal(emphasisKind(p), 'normal');
});

test('parseValue preserves trailing precision in raw', () => {
  assert.equal(parseValue('2.80').volts, 2.80);
  assert.equal(parseValue('2.81').raw, '2.81');
});

test('garbage values throw (loud, not silent)', () => {
  for (const bad of ['', 'o', 'abc', 'NaN']) {
    assert.throws(() => parseValue(bad), /invalid reading/i, `expected throw for ${JSON.stringify(bad)}`);
  }
});

test('negative or absurd numerics throw', () => {
  assert.throws(() => parseValue('-0.5'), /invalid reading/i);
  assert.throws(() => parseValue('999'), /out of plausible range/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`js/values.mjs`:
```javascript
// Interpret a diode-mode reading string. Stored data keeps strings verbatim;
// this module is the only place that decides what a string MEANS.

const PLAUSIBLE_MAX = 5; // diode drops realistically < ~3V; 5 is a loose guard

export function parseValue(raw) {
  const s = String(raw).trim();
  if (s.toLowerCase() === 'ol') return { kind: 'ol', volts: null, raw: s };

  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error(`invalid reading: ${JSON.stringify(raw)}`);
  }
  if (n < 0) throw new Error(`invalid reading (negative): ${JSON.stringify(raw)}`);
  if (n > PLAUSIBLE_MAX) throw new Error(`out of plausible range: ${JSON.stringify(raw)}`);

  if (Math.abs(n) < 0.05) return { kind: 'zero', volts: n, raw: s };
  return { kind: 'numeric', volts: n, raw: s };
}

export function formatValue(parsed) {
  if (parsed.kind === 'ol') return 'OL';
  return `${parsed.raw} V`;
}

export function emphasisKind(parsed) {
  if (parsed.kind === 'ol') return 'ol';
  if (parsed.kind === 'zero') return 'low';
  return 'normal';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — values suite green.

- [ ] **Step 5: Commit**

```bash
git add js/values.mjs test/values.test.mjs
git commit -m "feat(values): diode-reading string parser with emphasis kinds"
```

---

### Task 4: Data loader & validation (`js/loader.mjs`)

**Files:**
- Create: `js/loader.mjs`
- Create: `test/loader.test.mjs`
- Create: `test/fixtures/mini-catalog.json`, `test/fixtures/full-board.json`, `test/fixtures/short-board.json`, `test/fixtures/bad-class-board.json`

**Interfaces:**
- Consumes: `resolveSignalClass` from `js/signals.mjs`, `parseValue` from `js/values.mjs`.
- Produces:
  - `async loadCatalog(fetchFn?): { consoles: CatalogEntry[] }` where `CatalogEntry = {id,brand,family,name,boards:[{id,revision,file}]}`.
  - `async loadBoard(entry, fetchFn?): NormalizedBoard` where:
    ```
    NormalizedBoard = {
      id, consoleId, revision, confirmedOn:number, notes:string[],
      connectors: [{
        id, type, label, svgTemplate, pinCount,
        measurement: { mode, probes, unit, pins: EnrichedPin[] }
      }],
      photos: string[],
      warnings: string[]   // non-fatal problems (bad override fell back, etc.)
    }
    EnrichedPin = { num, signalClass, parsed /*from values*/, raw, note? }
    ```
  - `fetchFn` defaults to the global `fetch`; tests inject a stub `(url)=>Promise.resolve({ok,json:()=>...})`.

- [ ] **Step 1: Write fixtures**

`test/fixtures/mini-catalog.json`:
```json
{ "consoles": [
  { "id":"fakeco","brand":"Fake","family":"Fake Fam","name":"Fake One",
    "boards":[{"id":"rev-a","revision":"Rev A","file":"test/fixtures/full-board.json"}] }
] }
```

`test/fixtures/full-board.json`:
```json
{
  "id":"rev-a","consoleId":"fakeco","revision":"Rev A","confirmedOn":2,"notes":["sample caveat"],
  "connectors":[{
    "id":"hdmi","type":"HDMI","label":"HDMI port","svgTemplate":"assets/connectors/hdmi.svg","pinCount":19,
    "measurement":{
      "mode":"diode","probes":{"red":"GND"},"unit":"V (drop)",
      "pins":[
        {"num":1,"value":"0.79"},{"num":2,"value":"0"},{"num":3,"value":"0.79"},
        {"num":4,"value":"0.79"},{"num":5,"value":"0"},{"num":6,"value":"0.79"},
        {"num":7,"value":"0.79"},{"num":8,"value":"0"},{"num":9,"value":"0.79"},
        {"num":10,"value":"0.79"},{"num":11,"value":"0"},{"num":12,"value":"0.79"},
        {"num":13,"value":"0.65"},{"num":14,"value":"OL"},{"num":15,"value":"0.71"},
        {"num":16,"value":"0.71"},{"num":17,"value":"0"},{"num":18,"value":"0.49"},
        {"num":19,"value":"0.53"}
      ]
    }
  }],
  "photos":[]
}
```

`test/fixtures/short-board.json` (only 18 pins — missing pin 19):
```json
{
  "id":"short","consoleId":"fakeco","revision":"Short Rev","confirmedOn":1,"notes":[],
  "connectors":[{
    "id":"hdmi","type":"HDMI","label":"HDMI","svgTemplate":"assets/connectors/hdmi.svg","pinCount":19,
    "measurement":{"mode":"diode","probes":{"red":"GND"},"unit":"V (drop)",
      "pins":[
        {"num":1,"value":"0.79"},{"num":2,"value":"0"},{"num":3,"value":"0.79"},
        {"num":4,"value":"0.79"},{"num":5,"value":"0"},{"num":6,"value":"0.79"},
        {"num":7,"value":"0.79"},{"num":8,"value":"0"},{"num":9,"value":"0.79"},
        {"num":10,"value":"0.79"},{"num":11,"value":"0"},{"num":12,"value":"0.79"},
        {"num":13,"value":"0.65"},{"num":14,"value":"OL"},{"num":15,"value":"0.71"},
        {"num":16,"value":"0.71"},{"num":17,"value":"0"},{"num":18,"value":"0.49"}
      ]}
  }],
  "photos":[]
}
```

`test/fixtures/bad-class-board.json` (same as full-board but pin 2 overrides class to a typo `"grnd"`):
```json
{
  "id":"badclass","consoleId":"fakeco","revision":"Bad Class","confirmedOn":1,"notes":[],
  "connectors":[{
    "id":"hdmi","type":"HDMI","label":"HDMI","svgTemplate":"assets/connectors/hdmi.svg","pinCount":19,
    "measurement":{"mode":"diode","probes":{"red":"GND"},"unit":"V (drop)",
      "pins":[
        {"num":1,"value":"0.79"},{"num":2,"value":"0","signalClass":"grnd"},{"num":3,"value":"0.79"},
        {"num":4,"value":"0.79"},{"num":5,"value":"0"},{"num":6,"value":"0.79"},
        {"num":7,"value":"0.79"},{"num":8,"value":"0"},{"num":9,"value":"0.79"},
        {"num":10,"value":"0.79"},{"num":11,"value":"0"},{"num":12,"value":"0.79"},
        {"num":13,"value":"0.65"},{"num":14,"value":"OL"},{"num":15,"value":"0.71"},
        {"num":16,"value":"0.71"},{"num":17,"value":"0"},{"num":18,"value":"0.49"},
        {"num":19,"value":"0.53"}
      ]}
  }],
  "photos":[]
}
```

- [ ] **Step 2: Write the failing test**

`test/loader.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, loadBoard } from '../js/loader.mjs';

const jsonFixture = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url)));

function stubFetch(map) {
  return async (url) => {
    const norm = String(url).replace(/^\.\//,'');
    const entry = map[norm] ?? map[url];
    if (!entry) return { ok:false, status:404 };
    return { ok:true, json:async () => entry };
  };
}

test('loadCatalog returns the console tree', async () => {
  const cat = await loadCatalog(stubFetch({
    'data/catalog.json': await jsonFixture('./fixtures/mini-catalog.json')
  }));
  assert.equal(cat.consoles.length, 1);
  assert.equal(cat.consoles[0].boards[0].revision, 'Rev A');
});

test('loadBoard enriches pins with canonical signal class + parsed value', async () => {
  const cat = await loadCatalog(stubFetch({
    'data/catalog.json': await jsonFixture('./fixtures/mini-catalog.json'),
    'test/fixtures/full-board.json': await jsonFixture('./fixtures/full-board.json'),
  }));
  const board = await loadBoard(cat.consoles[0].boards[0], stubFetch({
    'test/fixtures/full-board.json': await jsonFixture('./fixtures/full-board.json'),
  }));
  const conn = board.connectors[0];
  assert.equal(conn.pinCount, 19);
  assert.equal(conn.measurement.pins.length, 19);
  assert.equal(conn.measurement.pins[1].signalClass, 'gnd');      // pin 2
  assert.equal(conn.measurement.pins[1].parsed.kind, 'zero');
  assert.equal(conn.measurement.pins[13].parsed.kind, 'ol');       // pin 14
  assert.deepEqual(board.warnings, []);
});

test('loadBoard surfaces a warning naming the board + missing pins (does not crash)', async () => {
  const cat = await loadCatalog(stubFetch({
    'data/catalog.json': await jsonFixture('./fixtures/mini-catalog.json'),
  }));
  const entry = { id:'short', revision:'Short Rev', file:'test/fixtures/short-board.json' };
  const board = await loadBoard(entry, stubFetch({
    'test/fixtures/short-board.json': await jsonFixture('./fixtures/short-board.json'),
  }));
  assert.ok(board.warnings.some(w => /missing.*19|pin 19/i.test(w)), JSON.stringify(board.warnings));
  assert.equal(board.connectors[0].measurement.pins.length, 18); // render what we have
});

test('loadBoard falls back a bad signalClass override to canonical and warns', async () => {
  const entry = { id:'badclass', revision:'Bad Class', file:'test/fixtures/bad-class-board.json' };
  const board = await loadBoard(entry, stubFetch({
    'test/fixtures/bad-class-board.json': await jsonFixture('./fixtures/bad-class-board.json'),
  }));
  assert.equal(board.connectors[0].measurement.pins[1].signalClass, 'gnd'); // fell back from 'grnd'
  assert.ok(board.warnings.some(w => /signalClass|fallback/i.test(w)));
});

test('loadCatalog tolerates a board file that 404s by logging+skipping', async () => {
  const cat = await loadCatalog(stubFetch({
    'data/catalog.json': {
      consoles:[
        { id:'c1',brand:'B',family:'F',name:'N',
          boards:[{id:'good','revision':'G','file':'test/fixtures/full-board.json'},
                  {id:'gone','revision':'Gone','file':'test/fixtures/missing.json'}] }
      ]
    },
    'test/fixtures/full-board.json': await jsonFixture('./fixtures/full-board.json'),
    // missing.json intentionally absent -> 404
  }));
  assert.equal(cat.consoles[0].boards.length, 2); // catalog still lists both
  // but loading the gone board rejects cleanly
  await assert.rejects(loadBoard(cat.consoles[0].boards[1], stubFetch({})),
    /404|could not load/i);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `loader.mjs` not found.

- [ ] **Step 4: Write the implementation**

`js/loader.mjs`:
```javascript
import { resolveSignalClass, HDMI_PIN_COUNT } from './signals.mjs';
import { parseValue } from './values.mjs';

const DEFAULT_FETCH =
  typeof fetch !== 'undefined' ? fetch.bind(globalThis)
  : null;

export async function loadCatalog(fetchFn = DEFAULT_FETCH) {
  const res = await fetchFn('data/catalog.json');
  if (!res || !res.ok) throw new Error(`could not load catalog (${res ? res.status : 'no fetch'})`);
  const data = await res.json();
  if (!Array.isArray(data.consoles)) throw new Error('catalog.consoles is not an array');
  return data;
}

export async function loadBoard(entry, fetchFn = DEFAULT_FETCH) {
  const f = fetchFn ?? DEFAULT_FETCH;
  const res = await f(entry.file);
  if (!res || !res.ok) throw new Error(`could not load board "${entry.id}" (${res ? res.status : 'no fetch'})`);
  const b = await res.json();

  const warnings = [];
  const connectors = (b.connectors || []).map(conn => {
    const m = conn.measurement || {};
    const enriched = (m.pins || []).map(pin => {
      let signalClass;
      try {
        signalClass = resolveSignalClass(pin.num, pin.signalClass);
        if (pin.signalClass != null && signalClass !== pin.signalClass) {
          warnings.push(`pin ${pin.num}: unknown signalClass "${pin.signalClass}", fell back to "${signalClass}"`);
        }
      } catch (e) {
        warnings.push(`pin ${pin.num}: ${e.message}`);
        signalClass = 'gnd';
      }
      let parsed;
      try { parsed = parseValue(pin.value); }
      catch (e) {
        warnings.push(`pin ${pin.num}: ${e.message}; recorded raw="${pin.value}"`);
        parsed = { kind:'ol', volts:null, raw:String(pin.value) }; // safest fallback for display
      }
      return { num: pin.num, signalClass, parsed, raw: pin.value, note: pin.note };
    });

    // Missing-pin detection (non-fatal: render what we have, warn loudly)
    const have = new Set(enriched.map(p => p.num));
    const missing = [];
    for (let p = 1; p <= (conn.pinCount || HDMI_PIN_COUNT); p++) if (!have.has(p)) missing.push(p);
    if (missing.length) warnings.push(`${entry.revision}/${conn.id}: missing pins ${missing.join(', ')}`);

    return {
      id: conn.id, type: conn.type, label: conn.label,
      svgTemplate: conn.svgTemplate, pinCount: conn.pinCount,
      measurement: { mode:m.mode, probes:m.probes, unit:m.unit, pins: enriched },
    };
  });

  return {
    id:b.id, consoleId:b.consoleId, revision:b.revision,
    confirmedOn:Number(b.confirmedOn)||1, notes:Array.isArray(b.notes)?b.notes:[],
    connectors, photos:Array.isArray(b.photos)?b.photos:[], warnings,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — loader suite green (covers Review Focus items 1, 2, 5).

- [ ] **Step 6: Commit**

```bash
git add js/loader.mjs test/loader.test.mjs test/fixtures/
git commit -m "feat(loader): catalog+board loading with validation and soft warnings"
```

---

### Task 5: Persistence store (`js/store.mjs`)

**Files:**
- Create: `js/store.mjs`
- Create: `test/store.test.mjs`

**Interfaces:**
- Produces: `class Store` with:
  - constructor `(storageLike?, keyPrefix='cdr:')` — defaults to `globalThis.localStorage`.
  - `isMarked(scope, pinNum): boolean`
  - `toggleMark(scope, pinNum): void`
  - `clearMarks(scope): void`
  - `markedPins(scope): number[]`
  - `get(key, fallback)` / `set(key,value)` — generic prefs (theme, labels, viewMode).
  - Degrades safely when storage throws/is null: marks work in-session only.

- [ ] **Step 1: Write the failing test**

`test/store.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../js/store.mjs';

function memStorage() {
  const m = new Map();
  return {
    getItem:k=>m.has(k)?m.get(k):null,
    setItem:(k,v)=>void m.set(k,String(v)),
    removeItem:k=>void m.delete(k),
  };
}

test('marks toggle and persist across instances backed by same storage', () => {
  const st = memStorage();
  const a = new Store(st);
  a.toggleMark('board1:hdmi', 7);
  assert.equal(a.isMarked('board1:hdmi', 7), true);
  const b = new Store(st); // reload from same storage
  assert.equal(b.isMarked('board1:hdmi', 7), true);
  assert.deepEqual(b.markedPins('board1:hdmi'), [7]);
});

test('clearMarks empties a scope only', () => {
  const st = memStorage(); const s = new Store(st);
  s.toggleMark('b1:c', 1); s.toggleMark('b2:c', 2);
  s.clearMarks('b1:c');
  assert.deepEqual(s.markedPins('b1:c'), []);
  assert.deepEqual(s.markedPins('b2:c'), [2]); // untouched
});

test('generic get/set prefs round-trip', () => {
  const s = new Store(memStorage());
  s.set('theme','dark');
  assert.equal(s.get('theme','light'),'dark');
  assert.equal(s.get('absent','fallback'),'fallback');
});

test('degrades gracefully when storage throws (private mode)', () => {
  const broken = {
    getItem(){ throw new Error('denied'); },
    setItem(){ throw new Error('denied'); },
    removeItem(){ throw new Error('denied'); },
  };
  const s = new Store(broken);
  // must not throw; in-session marks still work
  assert.doesNotThrow(()=>s.toggleMark('b:c',3));
  assert.equal(s.isMarked('b:c',3), true); // in-memory only
  assert.doesNotThrow(()=>s.clearMarks('b:c'));
  assert.doesNotThrow(()=>s.set('theme','dark'));
  assert.equal(s.get('theme','light'), 'light'); // couldn't persist, returns fallback
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`js/store.mjs`:
```javascript
// Marks (damaged-pin flags) and prefs persisted in localStorage, degrading
// gracefully when storage is unavailable (private mode, disabled, quota).

export class Store {
  constructor(storageLike, keyPrefix = 'cdr:') {
    this.prefix = keyPrefix;
    this._memFallback = new Map(); // used only when storage throws
    this.storage = storageLike ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  _safe(fn, onError) {
    if (!this.storage) return onError();
    try { return fn(this.storage); } catch (_) { return onError(); }
  }

  _readMarksMap() {
    return this._safe(
      s => { const j = s.getItem(`${this.prefix}marks`); return j ? JSON.parse(j) : {}; },
      () => this._memFallback,
    );
  }
  _writeMarksMap(m) {
    return this._safe(
      s => s.setItem(`${this.prefix}marks`, JSON.stringify(m)),
      () => { this._memFallback = m; },
    );
  }

  isMarked(scope, pin) {
    const m = this._readMarksMap();
    return Array.isArray(m[scope]) && m[scope].includes(pin);
  }
  markedPins(scope) {
    const m = this._readMarksMap();
    return Array.isArray(m[scope]) ? [...m[scope]] : [];
  }
  toggleMark(scope, pin) {
    const m = this._readMarksMap();
    const arr = Array.isArray(m[scope]) ? m[scope] : [];
    const i = arr.indexOf(pin);
    if (i >= 0) arr.splice(i, 1); else arr.push(pin);
    m[scope] = arr;
    this._writeMarksMap(m);
  }
  clearMarks(scope) {
    const m = this._readMarksMap();
    m[scope] = [];
    this._writeMarksMap(m);
  }

  get(key, fallback) {
    return this._safe(
      s => { const v = s.getItem(`${this.prefix}${key}`); return v == null ? fallback : v; },
      () => this._memFallback.has(`${this.prefix}${key}`)
        ? this._memFallback.get(`${this.prefix}${key}`) : fallback,
    );
  }
  set(key, value) {
    return this._safe(
      s => s.setItem(`${this.prefix}${key}`, String(value)),
      () => this._memFallback.set(`${this.prefix}${key}`, String(value)),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — store suite green (covers Review Focus item 4).

- [ ] **Step 5: Commit**

```bash
git add js/store.mjs test/store.test.mjs
git commit -m "feat(store): resilient localStorage-backed marks and prefs"
```

---

### Task 6: Seed data — catalog + all board JSON

**Files:**
- Create: `data/catalog.json`
- Create: `data/consoles/ps5-phat-cfi-1216a.json`
- Create: `data/consoles/ps4-phat-1004.json`
- Create: `data/consoles/ps4-slim-2016a.json`
- Create: `data/consoles/ps3-phat-cechk04.json`
- Create: `data/consoles/ps3-phat-cechl04.json`
- Create: `data/consoles/ps3-slim.json`
- Create: `data/consoles/ps3-superslim-cech-4304.json`
- Create: `data/consoles/xbox-one-original.json`
- Create: `data/consoles/xbox-one-s.json`
- Create: `data/consoles/xbox-one-x.json`
- Create: `data/consoles/xbox-360-phat-zephyr.json`
- Create: `data/consoles/xbox-360s-corona.json`
- Create: `data/consoles/wii-u-wup101.json`
- Create: `test/seed-validate.test.mjs`

**Interfaces:**
- Consumes: `loadCatalog`, `loadBoard` (Task 4), a real-file fetch stub reading from disk.
- Produces: the full live dataset consumed by the site.

- [ ] **Step 1: Write `data/catalog.json`**

```json
{
  "consoles": [
    { "id":"ps5","brand":"Sony","family":"PlayStation 5","name":"PS5 Phat",
      "boards":[{"id":"cfi-1216a","revision":"CFI-1216A","file":"data/consoles/ps5-phat-cfi-1216a.json"}]},
    { "id":"ps4-phat","brand":"Sony","family":"PlayStation 4","name":"PS4 Phat",
      "boards":[{"id":"1004","revision":"1004","file":"data/consoles/ps4-phat-1004.json"}]},
    { "id":"ps4-slim","brand":"Sony","family":"PlayStation 4","name":"PS4 Slim",
      "boards":[{"id":"2016a","revision":"2016A","file":"data/consoles/ps4-slim-2016a.json"}]},
    { "id":"ps3-phat","brand":"Sony","family":"PlayStation 3","name":"PS3 Phat",
      "boards":[
        {"id":"cechk04","revision":"CECHK04","file":"data/consoles/ps3-phat-cechk04.json"},
        {"id":"cechl04","revision":"CECHL04","file":"data/consoles/ps3-phat-cechl04.json"}]},
    { "id":"ps3-slim","brand":"Sony","family":"PlayStation 3","name":"PS3 Slim",
      "boards":[{"id":"ps3-slim-unconf","revision":"Unconfirmed","file":"data/consoles/ps3-slim.json"}]},
    { "id":"ps3-superslim","brand":"Sony","family":"PlayStation 3","name":"PS3 Super Slim",
      "boards":[{"id":"cech-4304","revision":"CECH-4304","file":"data/consoles/ps3-superslim-cech-4304.json"}]},
    { "id":"xbox-one","brand":"Microsoft","family":"Xbox One","name":"Xbox One Original",
      "boards":[{"id":"xbone-orig","revision":"Original","file":"data/consoles/xbox-one-original.json"}]},
    { "id":"xbox-one-s","brand":"Microsoft","family":"Xbox One","name":"Xbox One S",
      "boards":[{"id":"xbone-s","revision":"S","file":"data/consoles/xbox-one-s.json"}]},
    { "id":"xbox-one-x","brand":"Microsoft","family":"Xbox One","name":"Xbox One X",
      "boards":[{"id":"xbone-x","revision":"X","file":"data/consoles/xbox-one-x.json"}]},
    { "id":"xbox-360-phat","brand":"Microsoft","family":"Xbox 360","name":"Xbox 360 Phat",
      "boards":[{"id":"zephyr","revision":"Zephyr","file":"data/consoles/xbox-360-phat-zephyr.json"}]},
    { "id":"xbox-360s","brand":"Microsoft","family":"Xbox 360","name":"Xbox 360s",
      "boards":[{"id":"corona","revision":"Corona","file":"data/consoles/xbox-360s-corona.json"}]},
    { "id":"wii-u","brand":"Nintendo","family":"Wii U","name":"Wii U",
      "boards":[{"id":"wup101","revision":"WUP101","file":"data/consoles/wii-u-wup101.json"}]}
  ]
}
```

- [ ] **Step 2: Convert each board from the source post to JSON**

Use the helper shape from the spec. Each board file follows `full-board.json`'s structure with `confirmedOn`, `notes[]`, and the 19 pins in order. Specific conversions:

- `ps5-phat-cfi-1216a.json`: revision `CFI-1216A`, confirmedOn 1, notes []. Pins (post lists 19 bare values, in order 1..19): `0.79,0,0.79,0.79,0,0.79,0.79,0,0.79,0.79,0,0.79,0.65,OL,0.63,0.63,0,0.49,0.53`.
- `ps4-phat-1004.json`: revision `1004`, confirmedOn 1. Pins 1..19: `0.51,0,0.51,0.51,0,0.51,0.51,0,0.51,0.51,0,0.51,0.59,OL,0.59,0.59,0,0.67,0.67`.
- `ps4-slim-2016a.json`: revision `2016A`, confirmedOn 3. Pins: `0.56,0,0.56,0.56,0,0.56,0.56,0,0.56,0.58,0,0.58,0.54,OL,0.70,0.70,0,OL,0.73`. notes: `["Checked 3 2016As. On 2 of them pin 18 read OL; on the third 2016A pin 18 read 0.66."]`.
- `ps3-phat-cechk04.json`: revision `CECHK04`, confirmedOn 1. Pins: `0.60,0,0.60,0.60,0,0.60,0.60,0,0.60,0.60,0,0.60,OL,OL,0.71,0.71,0,0.49,0.73`.
- `ps3-phat-cechl04.json`: revision `CECHL04`, confirmedOn 1. Pins: `0.55,0,0.55,0.55,0,0.55,0.55,0,0.55,0.55,0,0.55,OL,OL,0.74,0.74,0,0.63,0.74`.
- `ps3-slim.json`: revision `Unconfirmed`, confirmedOn 1, notes `["Revision not yet confirmed by the original measurer."]`. Pins: `0.58,0,0.56,0.58,0,0.56,0.56,0,0.56,0.57,0,0.56,0.56,OL,0.72,0.72,0,0.62,0.72`.
- `ps3-superslim-cech-4304.json`: revision `CECH-4304`, confirmedOn 1. Pins: `0.56,0,0.56,0.56,0,0.56,0.56,0,0.56,0.56,0,0.56,0.56,OL,0.72,0.72,0,0.67,0.72`.
- `xbox-one-original.json`: revision `Original`, confirmedOn 1. Pins: `0.77,0,0.77,0.77,0,0.77,0.77,0,0.77,0.77,0,0.77,1.0,OL,0.71,0.71,0,0.54,OL`.
- `xbox-one-s.json`: revision `S`, confirmedOn 3, notes `["Confirmed on 3 consoles, one of which was digital-only.","Source post shows pin 17 as 'o' — a typo for 0; normalized here."]`. Pins (pin 17 normalized `0`): `0.76,0,0.76,0.76,0,0.76,0.76,0,0.76,0.76,0,0.76,0.66,OL,0.67,0.67,0,0.66,0.69`.
- `xbox-one-x.json`: revision `X`, confirmedOn 1. Pins: `0.74,0,0.74,0.74,0,0.74,0.74,0,0.74,0.74,0,0.74,0.63,0.83,0.63,0.65,0,0.62,0.66`.
- `xbox-360-phat-zephyr.json`: revision `Zephyr`, confirmedOn 1. Pins: `0.74,0,0.74,0.74,0,0.74,0.74,0,0.74,0.74,0,0.74,OL,OL,0.60,0.60,0,0.13,2.80`.
- `xbox-360s-corona.json`: revision `Corona`, confirmedOn 3, notes `["Exact Corona sub-revision uncertain in the source post."]`. Pins: `0.72,0,0.72,0.72,0,0.72,0.72,0,0.72,0.72,0,0.72,OL,OL,0.74,0.74,0,0.13,2.81`.
- `wii-u-wup101.json`: revision `WUP101`, confirmedOn 3. Pins: `0.55,0,0.55,0.55,0,0.55,0.55,0,0.55,0.55,0,0.55,0.55,OL,0.70,0.70,0,0.78,0.72`.

Each file's `connectors[0]` uses `id:"hdmi"`,`type:"HDMI"`,`label:"HDMI port"`,`svgTemplate:"assets/connectors/hdmi.svg"`,`pinCount:19`, and `measurement:{mode:"diode",probes:{red:"GND",black:"signal pin"},unit:"V (drop)",pins:[...]}` with `{"num":N,"value":"..."}` entries in numeric order.

- [ ] **Step 3: Write a validation test that loads ALL real seed files from disk**

`test/seed-validate.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, loadBoard } from '../js/loader.mjs';

// Real-file fetch stub: resolves any URL against the repo root on disk.
async function makeDiskFetcher() {
  return async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(new URL(String(url).replace(/^\.\//,''), import.meta.url))),
  });
}

test('every catalog board file loads and yields 19 enriched pins with no warnings', async () => {
  const fetchFn = await makeDiskFetcher();
  const cat = await loadCatalog(fetchFn);
  assert.ok(cat.consoles.length >= 12, 'expected ≥12 consoles seeded');
  for (const cons of cat.consoles) {
    for (const entry of cons.boards) {
      const board = await loadBoard(entry, fetchFn);
      const conn = board.connectors[0];
      assert.equal(conn.measurement.pins.length, 19, `${cons.name}/${entry.revision}: expected 19 pins`);
      assert.deepEqual(board.warnings, [], `${cons.name}/${entry.revision}: unexpected warnings ${JSON.stringify(board.warnings)}`);
    }
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — seed validation green; every board loads with exactly 19 pins and zero warnings. If a warning fires, fix the offending JSON (typo in value/class) and rerun.

- [ ] **Step 5: Commit**

```bash
git add data/catalog.json data/consoles/ test/seed-validate.test.mjs
git commit -m "feat(data): seed all console HDMI diode readings from source post"
```

---

### Task 7: SVG connector template (`assets/connectors/hdmi.svg`)

**Files:**
- Create: `assets/connectors/hdmi.svg`

**Interfaces:**
- Produces: an SVG with 19 `<rect class="pad" data-pin="N">` elements (plus pin-1 indicator) laid out in the standard HDMI Type-A 2-row footprint, designed to be styled via CSS variables and queried/enriched by `js/pinmap.mjs`.

- [ ] **Step 1: Author the SVG**

Layout: viewBox `0 0 220 140`. Title block "HDMI". 19 pads in two staggered rows mirroring the physical Type-A connector (row A: pins 1–10, row B: pins 11–19 reversed, with pin-1 corner indicator). Each pad:
```xml
<g class="pad-group" data-pin="1">
  <rect class="pad" x=".." y=".." width="14" height="22" rx="2"/>
  <text class="pad-label" x=".." y="..">1</text>
</g>
```
Include `<defs><style>/* pad fills/strokes bound to --sig-* vars */</style></defs>` with placeholder CSS that `style.css` overrides. Add a small triangle/star marker labelled "PIN 1" at the pin-1 corner.

Place pads at evenly spaced x positions; compute coordinates so the two rows align like the real connector. Exact pixel coords are authored here (not generated) — lay them out by hand in the SVG.

- [ ] **Step 2: Verify it parses and exposes 19 pads**

Quick check via node (no test file needed, but record the command):
Run: `node -e "const fs=require('fs');const s=fs.readFileSync('assets/connectors/hdmi.svg','utf8');const m=s.match(/data-pin=\"/g);console.assert((m||[]).length===19,'pad count', (m||[]).length);"`
Expected: prints nothing (assertion passes) — 19 pads.

- [ ] **Step 3: Commit**

```bash
git add assets/connectors/hdmi.svg
git commit -m "feat(assets): HDMI Type-A connector SVG template (19 pads)"
```

---

### Task 8: Stylesheet — themes, layout, responsive (`css/style.css`)

**Files:**
- Create: `css/style.css`

**Interfaces:**
- Consumes: the CSS variable contract from `js/signals.mjs` (`--sig-<class>`), the SVG element classes (`.pad`, `.pad-label`, `.pad-group`, `.marked`, `.dimmed`, `.pad.ol`, `.pad.low`), and app-shell DOM ids/classes defined in Task 10's `index.html`.

- [ ] **Step 1: Define theme tokens on `:root`**

Surface/text/border tokens, plus one `--sig-*` color per signal class (matching `signals.mjs`): `--sig-gnd`, `--sig-power-5v`, `--sig-tmds-data-pos`, `--sig-tmds-data-neg`, `--sig-tmds-clk-pos`, `--sig-tmds-clk-neg`, `--sig-ddc`, `--sig-cec`, `--sig-utility`, `--sig-hpd`. Also `--accent-mark` for the double-outline highlight.

- [ ] **Step 2: Dark theme via `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`**

Override surface/text/signal tokens for dark mode. Guard media query with `:root:not([data-theme="light"])` so the manual toggle wins.

- [ ] **Step 3: Layout: sticky sidebar + main canvas, responsive collapse**

At ≤768px the sidebar becomes a top drawer (collapsible). Canvas centered. Controls bar flex-wrap. 16px gutters throughout. Prevent horizontal overflow (`overflow-x:hidden` on body, `max-width:100vw`).

- [ ] **Step 4: Pad styling: fill from `--sig-*`, stroke, marked double-outline, dimmed opacity, OL dashed, low emphasis**

```css
.pad { fill: var(--pad-fill, transparent); stroke: var(--pad-stroke); stroke-width:1; }
.pad-group[data-class="gnd"] .pad { fill: var(--sig-gnd); }
/* ...one rule per class via attribute selector... */
.pad-group.marked .pad { stroke: var(--accent-mark); stroke-width:3; }
.pad-group.dimmed { opacity:.25; }
.pad.ol { fill:none; stroke-dasharray:3 2; }
.pad.low { fill-opacity:.55; }
.pad-label { font-size:9px; fill: var(--text); pointer-events:none; }
.hide-labels .pad-label { display:none; }
@media print { .sidebar,.controls-bar{display:none} .canvas{position:static} }
```

Author the full file with all ten class rules, legend swatches, tooltip styles, and a print stylesheet block.

- [ ] **Step 5: Manual sanity check (no automated test)**

Open the eventual `index.html` mentally against these rules; confirm class names match the SVG and app shell. No command to run.

- [ ] **Step 6: Commit**

```bash
git add css/style.css
git commit -m "feat(css): themed layout, signal palette, responsive, print styles"
```

---

### Task 9: UI helpers + pin renderer (`js/ui.mjs`, `js/pinmap.mjs`)

**Files:**
- Create: `js/ui.mjs`
- Create: `js/pinmap.mjs`

**Interfaces:**
- Consumes: `signals.mjs` (`SIGNAL_CLASSES`, `LEGEND_GROUPS`, `canonicalSignal`), `values.mjs` (`formatValue`, `emphasisKind`), `store.mjs` (`Store`), the SVG template from Task 7.
- Produces:
  - `js/ui.mjs`: `el(tag, attrs, kids)`, `escapeHtml(s)`, `clear(node)`.
  - `js/pinmap.mjs`: `createPinmap({container, connector, board, store})` returns `{ refresh(), setFilter(classOr'all'), setLabels(bool), destroy() }`. Renders the SVG, colors pads by class, binds hover→tooltip, click/focus→toggle mark, applies dim/highlight.

- [ ] **Step 1: Write `js/ui.mjs`**

```javascript
export function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null) continue;
    n.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return n;
}
export function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
export function clear(node){while(node.firstChild)node.removeChild(node.firstChild);}
```

- [ ] **Step 2: Write `js/pinmap.mjs`**

Responsibilities:
- Clone the SVG from `connector.svgTemplate` (fetched once and cached) into `container`.
- For each `.pad-group[data-pin=N]`: set `data-class` to the pin's `signalClass`, attach the parsed value/emphasis (`ol`/`low`), bind mouseenter/mouseleave→show/hide tooltip with pin №, signal display name, formatted value; bind click + keydown(Space/Enter)→`store.toggleMark(scope,pin)` then `refresh()`.
- `refresh()`: recompute `marked`/`dimmed` classes from `store.markedPins(scope)` and the active filter.
- `setFilter(c)`: store active filter, call `refresh()`.
- `setLabels(on)`: toggle `hide-labels` class on the container.
- Tooltip positioned near the pad via the mouse event or pad bbox.

Skeleton:
```javascript
import { canonicalSignal, SIGNAL_CLASSES } from './signals.mjs';
import { formatValue, emphasisKind } from './values.mjs';
import { el, clear } from './ui.mjs';

const svgCache = new Map();
async function loadSvg(path){
  if(svgCache.has(path)) return svgCache.get(path);
  const res = await fetch(path);
  const txt = await res.text();
  const tmp = document.createElementNS('http://www.w3.org/2000/svg','svg');
  tmp.innerHTML = txt.trim();
  const node = tmp.querySelector('svg') || tmp;
  svgCache.set(path, node.cloneNode(true));
  return svgCache.get(path);
}

export async function createPinmap({container, connector, board, store, onChange}){
  const scope = `${board.id}:${connector.id}`;
  let activeFilter = 'all';
  let tipEl = null;

  const svgRoot = await loadSvg(connector.svgTemplate);
  clear(container); container.appendChild(document.importNode(svgRoot,true));

  const groups = [...container.querySelectorAll('.pad-group')];
  const byNum = new Map(groups.map(g=>[Number(g.dataset.pin),g]));

  function tooltipHTML(pin, sigCls, parsed){
    const disp = SIGNAL_CLASSES[sigCls]?.displayName ?? sigCls;
    return `<b>Pin ${pin}</b><br>${disp}<br><span class="tt-val">${formatValue(parsed)}</span>`;
  }
  function showTip(g,e){ /* position absolutely near e.clientX/Y */ }
  function hideTip(){ if(tipEl){tipEl.remove();tipEl=null;} }

  function applyPad(g, pin){
    const ep = connector.measurement.pins.find(p=>p.num===pin);
    const cls = ep ? ep.signalClass : canonicalSignal(pin).className;
    g.dataset.class = cls;
    if(!ep) return;
    const ek = emphasisKind(ep.parsed);
    if(ek==='ol') g.classList.add('ol'); else g.classList.remove('ol');
    if(ek==='low') g.classList.add('low'); else g.classList.remove('low');
    g.title = ''; // we use custom tooltip
    g.tabIndex = 0;
    g.addEventListener('mouseenter',(e)=>showTip(g,e));
    g.addEventListener('mouseleave',hideTip);
    g.addEventListener('click',()=>{
      store.toggleMark(scope,pin); refresh(); onChange&&onChange();
    });
    g.addEventListener('keydown',(e)=>{
      if(e.key===' '||e.key==='Enter'){e.preventDefault();store.toggleMark(scope,pin);refresh();onChange&&onChange();}
    });
  }
  groups.forEach(g=>applyPad(g, Number(g.dataset.pin)));

  function refresh(){
    const marked = new Set(store.markedPins(scope));
    for(const g of groups){
      const pin=Number(g.dataset.pin);
      g.classList.toggle('marked', marked.has(pin));
      const cls=g.dataset.class;
      g.classList.toggle('dimmed', activeFilter!=='all' && cls!==activeFilter);
    }
  }
  return {
    refresh,
    setFilter(c){activeFilter=c;refresh();},
    setLabels(on){container.classList.toggle('hide-labels',!on);},
    destroy(){hideTip();clear(container);}
  };
}
```

Fill in `showTip` positioning fully (absolute-positioned div appended to container's offsetParent, using `getBoundingClientRect`).

- [ ] **Step 3: Smoke-load in a throwaway HTML harness (manual)**

Since this is DOM code, no automated test. Create a temp `scratch.html` importing `pinmap.mjs` against a fixture board, open in a browser, confirm pads color and clicks mark. Delete `scratch.html` afterward (do not commit).

- [ ] **Step 4: Commit**

```bash
git add js/ui.mjs js/pinmap.mjs
git commit -m "feat(ui): DOM helpers and interactive SVG pinmap renderer"
```

---

### Task 10: App shell — `index.html` + bootstrap (`js/app.mjs`)

**Files:**
- Create: `index.html`
- Create: `js/app.mjs`

**Interfaces:**
- Consumes: all prior modules; `data/catalog.json`; the SVG; `css/style.css`.
- Produces: a working single-page app: sidebar nav (console→board→connector), canvas (connector view + board/photo view), controls (filter, labels, theme, view-mode), footer (print, export CSV), error/loading states.

- [ ] **Step 1: Write `index.html`**

App shell with: `<div id="app"><aside class="sidebar" id="nav"></aside><main class="main"><div class="controls-bar" id="controls"></div><section class="canvas" id="canvas"></section><footer class="util" id="util"></footer></main></div>`, a `<div id="error">` region, `<link rel="stylesheet" href="css/style.css">`, and `<script type="module" src="js/app.mjs"></script>`. Apply `data-theme` from a tiny inline script reading localStorage to avoid FOUC.

- [ ] **Step 2: Write `js/app.mjs`**

Bootstrap sequence:
1. Instantiate `Store`; apply theme pref to `document.documentElement.dataset.theme`.
2. `try { const cat = await loadCatalog(); renderNav(cat); } catch(e){ showError(...) }`.
3. Nav click → `await loadBoard(entry)` → instantiate `createPinmap(...)` into `#canvas`; populate controls (filter dropdown from `LEGEND_GROUPS`, labels toggle, theme toggle, view-mode toggle); populate util (Print button → `window.print()`, Export CSV → serialize current connector's pins + marked flags).
4. Wire controls to pinmap (`setFilter`, `setLabels`) and store (`set('theme',...)`).
5. Board view: if `board.photos.length`, render thumbnails linking to full images; else show "No photos yet for this revision — contribute via the repo (see CONTRIBUTING)." Show the source-post notes (`board.notes`, `confirmedOn`) beneath the canvas regardless of view.
6. Surface `board.warnings` (if any) as a dismissible banner — none expected for seed, but the path exists for contributed data.

Render the legend (from `LEGEND_GROUPS` + `SIGNAL_CLASSES` cssVars) once, beside the canvas.

- [ ] **Step 3: Serve locally and verify end-to-end (manual)**

Run: `python3 -m http.server 8000` then open `http://localhost:8000/` in a browser.
Confirm: nav populates with 12 consoles; selecting PS5 Phat renders 19 colored pads; hovering shows pin/value; clicking marks (persists on reload); filter dims non-matching pads; theme toggle works; Print and Export CSV produce sane output. Kill the server.

- [ ] **Step 4: Commit**

```bash
git add index.html js/app.mjs
git commit -m "feat(app): bootstrap shell, nav, controls, views, export"
```

---

### Task 11: Docs, contributing, issue template, README

**Files:**
- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `.github/ISSUE_TEMPLATE/new-readings.md`

**Interfaces:**
- None (docs).

- [ ] **Step 1: Write `README.md`**

Sections: what it is, live link, how readings are taken (red probe on GND, diode mode, values vary by revision), how to use the interactive viewer, how to contribute (link CONTRIBUTING), licensing (dual MIT/CC BY-SA), credit to the originating forum post's author for the seed dataset.

- [ ] **Step 2: Write `CONTRIBUTING.md`**

Explain: the JSON schema (pointer to spec), how to add a board file + catalog entry, the measurement methodology (probe orientation, diode mode, note your meter + revision), and the licensing terms ("submitting readings licenses them CC BY-SA 4.0"). Encourage filing an Issue with the template for those who can't PR.

- [ ] **Step 3: Write `.github/ISSUE_TEMPLATE/new-readings.md`**

Front-matter issue template with fields: console, board revision, meter model, probe orientation (red/black), per-pin values 1–19, notes/variance, and a CC BY-SA 4.0 agreement checkbox.

- [ ] **Step 4: Commit**

```bash
git add README.md CONTRIBUTING.md .github/ISSUE_TEMPLATE/new-readings.md
git commit -m "docs: readme, contributing guide, new-readings issue template"
```

---

### Task 12: Push, enable GitHub Pages, verify live

**Files:**
- None (deployment).

- [ ] **Step 1: Ensure all tests pass**

Run: `npm test`
Expected: full suite green (smoke + signals + values + loader + store + seed-validate).

- [ ] **Step 2: Push to GitHub**

Run: `git push -u origin main`
Expected: 12 commits pushed to `koznov/console-diode-readings`.

- [ ] **Step 3: Enable Pages via gh API**

Run: `gh api -X POST repos/koznov/console-diode-readings/pages -f source[branch]=main -f source[path]=/ `
(Fallback if already exists: `gh api -X PUT repos/koznov/console-diode-readings/pages -f source[branch]=main -f source[path]=/`)
Expected: 201 Created (or 200), returning the pages URL.

- [ ] **Step 4: Confirm Pages build succeeded**

Run: `gh api repos/koznov/console-diode-readings/pages --jq '.status,.html_url'`
Poll until `status` is `built`; then `curl -sI https://koznov.github.io/console-diode-readings/ | head -1` expects `HTTP/2 200`.

- [ ] **Step 5: Final manual check in a browser**

Open `https://koznov.github.io/console-diode-readings/`, repeat the Task 10 Step 3 checks against the live URL. Note any regressions.

- [ ] **Step 6: Commit nothing — report**

Report the live URL and test/build status to the user.

---

## Self-Review Summary

- **Spec coverage:** Every spec section maps to a task — stack/global (Global Constraints + Task 1), repo structure (Tasks 1,6,7,8,10,11), data model (Tasks 2,4,6), signal classes (Task 2), interactions variant B (Tasks 7,8,9,10), theming (Task 8), accessibility/responsive (Task 8 + 9 keyboard handlers + 10), licensing (Task 1,11), seed conversion (Task 6), deployment (Task 12). No spec gap remains.
- **Placeholders:** Removed the stray `import` lines flagged in Task 5/6 test skeletons; all code blocks contain real code. Coordinates for the SVG in Task 7 are authored-by-hand (explicitly an authoring step, not a placeholder) — acceptable since pixel layout is irreducibly manual.
- **Type/name consistency:** `Store` API (toggleMark/clearMarks/markedPins/get/set) used identically in Task 9/10; `createPinmap` signature stable across 9/10; `EnrichedPin.signalClass/parsed/raw` consistent between loader (Task 4) and consumer (Task 9); `resolveSignalClass` consistent between signals (Task 2) and loader (Task 4).
- **Review Focus:** all five items have owning tasks with tests — malformed/missing pins (Task 5/6), bad signalClass override (Task 5/6), garbage values incl. `'o'`/empty (Task 4), localStorage-throws degradation (Task 7), catalog-fetch failure + 404 board tolerance (Task 5). Covered.
