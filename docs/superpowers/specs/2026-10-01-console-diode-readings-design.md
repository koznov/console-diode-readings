# Console Diode Readings — Design Spec

Date: 2026-10-01
Status: Approved (verbal), awaiting written-spec review
Repository: https://github.com/koznov/console-diode-readings
Live (after first push + Pages): https://koznov.github.io/console-diode-readings/

## Purpose

A static reference site hosting **diode-mode multimeter readings** for connectors
on various game consoles, so repair technicians can verify and cross-check
measurements against known-good boards. Inspired by https://forterfix.com/bga_pinouts
but for console HDMI ports (and, by design, extensible beyond).

Initial seed data: a community-collected table of HDMI diode readings across
PS5, PS4, PS3, Xbox One, Xbox 360, and Wii U families (multiple board revisions),
included verbatim in `data/`.

## Goals / Non-goals

Goals:
- Fully static, zero-build, hosted on GitHub Pages (free tier, public repo).
- Interactive pinout of the HDMI connector (19 pins) with hover tooltips,
  click-to-mark-damaged, local-state persistence, signal-type filtering,
  light/dark theme, connector↔board-photo view toggle, print/export.
- Extensible data model: console → board revision → connector → measurement → pins.
  Today all connectors are HDMI and all measurements are diode mode (red probe on
  ground), but the schema does not hard-code this.
- Community contributions via Issues/Pull Requests with templates and licensing.

Non-goals (initial):
- No backend, no database, no build step, no framework dependency.
- No automated photo upload pipeline (photos committed to the repo manually).
- No i18n, no search engine beyond in-page filtering.

## Stack

- HTML + CSS + vanilla ES-module JavaScript. No bundler, no build.
- `.nojekyll` disables GitHub's Jekyll pass-through so arbitrary folders/assets
  are served verbatim.
- Data stored as JSON, fetched client-side via `fetch()`.

## Repository Structure

```
.nojekyll                              Disables Jekyll on Pages
README.md
CONTRIBUTING.md                        How to submit new readings
LICENSE                                Site code — MIT
DATA-LICENSE                           Measurements, photos, texts — CC BY-SA 4.0
index.html                             App shell
css/
  style.css                            Theme tokens, layout, responsive
js/
  app.js                               Bootstrap + wiring (entry, ES module)
  data.js                              Fetch/load catalog + console JSON
  pinmap.js                            Render SVG connector, interactions
  store.js                             LocalStorage state (marked pins, theme)
data/
  catalog.json                         Tree of consoles → boards → connectors
  consoles/
    ps5-phat-cfi-1216a.json
    ps4-phat-1004.json
    ps4-slim-2016a.json
    ps3-phat-cechk04.json
    ps3-phat-cechl04.json
    ps3-slim.json
    ps3-superslim-cech-4304.json
    xbox-one-original.json
    xbox-one-s.json
    xbox-one-x.json
    xbox-360-phat-zephyr.json
    xbox-360s-corona.json
    wii-u-wup101.json
assets/
  connectors/
    hdmi.svg                           Vector template of HDMI connector
  photos/
    <board-id>/                        Board photos (added later)
.github/
  ISSUE_TEMPLATE/
    new-readings.md                    Template for submitting new readings
```

## Data Model

Top-level entity graph (extensible per Goal A):

```
Console ─┬─ Board(revision) ─┬─ Connector(type) ─┬─ Measurement(mode) ─┬─ Pin[]
         │                   │                   │                     └─ {num, signal_class, value, note}
         │                   │                   └─ {mode:"diode", probes:{red:"GND"}}
         │                   │                   └─ label, svgTemplate, pinCount
         │                   └─ revision, notes[], confirmedOn(N)
         └─ family, name, brand
```

### catalog.json

```jsonc
{
  "consoles": [
    {
      "id": "ps5",
      "brand": "Sony",
      "family": "PlayStation 5",
      "name": "PS5 Phat",
      "boards": [
        { "id": "cfi-1216a", "revision": "CFI-1216A", "file": "consoles/ps5-phat-cfi-1216a.json" }
      ]
    }
    // ...
  ]
}
```

### Per-board file (e.g. ps5-phat-cfi-1216a.json)

```jsonc
{
  "id": "cfi-1216a",
  "consoleId": "ps5",
  "revision": "CFI-1216A",
  "confirmedOn": 1,            // number of consoles measured; >1 means cross-checked
  "notes": [],                 // free-text caveats (e.g. pin-18 variance on 2016A)
  "connectors": [
    {
      "id": "hdmi",
      "type": "HDMI",
      "label": "HDMI port",
      "svgTemplate": "assets/connectors/hdmi.svg",
      "pinCount": 19,
      "measurement": {
        "mode": "diode",
        "probes": { "red": "GND", "black": "signal pin" },
        "unit": "V (drop)",
        "pins": [
          { "num": 1,  "signalClass": "tmds-data+", "value": "0.79" },
          { "num": 2,  "signalClass": "gnd",        "value": "0"    },
          // ... 19 entries
          { "num": 14, "signalClass": "nc",         "value": "OL"   }
        ]
      }
    }
  ],
  "photos": []                 // paths under assets/photos/<board-id>/, filled later
}
```

Notes on representation:
- Values are strings to preserve `OL` and avoid float normalization surprises.
- `signalClass` drives coloring; the canonical HDMI mapping is fixed in
  `js/data.js` (see Signal Classes).
- Free-text caveats from the source post (e.g. *"checked 3 2016As; on 2 I had
  OL on pin 18, on the third 0.66"*) go into `notes[]` on the board, preserving
  provenance.

## Signal Classes (HDMI 19-pin)

Canonical pin → signal-class mapping, held in code (not repeated per file):

| Pin | Signal                          | Class key     |
|-----|--------------------------------|---------------|
| 1   | TMDS Data2+                    | tmds-data-pos |
| 2   | TMDS Data2 Shield (GND)        | gnd           |
| 3   | TMDS Data2−                    | tmds-data-neg |
| 4   | TMDS Data1+                    | tmds-data-pos |
| 5   | TMDS Data1 Shield (GND)        | gnd           |
| 6   | TMDS Data1−                    | tmds-data-neg |
| 7   | TMDS Data0+                    | tmds-data-pos |
| 8   | TMDS Data0 Shield (GND)        | gnd           |
| 9   | TMDS Data0−                    | tmds-data-neg |
| 10  | TMDS Clock+                    | tmds-clk-pos  |
| 11  | TMDS Clock Shield (GND)        | gnd           |
| 12  | TMDS Clock−                    | tmds-clk-neg  |
| 13  | CEC (Consumer Electronics Ctrl)| cec           |
| 14  | Utility / Reserved (HEAC Data) | utility       | (commonly NC/OL on console sources)
| 15  | SCL (DDC)                      | ddc           |
| 16  | SDA (DDC)                      | ddc           |
| 17  | Ground                         | gnd           |
| 18  | +5V Power                      | power-5v      |
| 19  | Hot Plug Detect (HPD)          | hpd           |

Empirical sanity check against seed data: pin 14 is `OL` on every sampled
board (reserved), pin 17 is `0` on every board (shield/ground), consistent with
the mapping above.

Legend colors (theme-token driven):
- gnd — slate gray
- tmds-data-pos/neg — blue pair (two shades)
- tmds-clk-pos/neg — amber/orange pair
- ddc — violet
- cec — teal
- utility — brown (pin 14 reserved/HEAC data)
- hpd — yellow
- power-5v — red
- nc — muted/translucent (used only for truly-not-connected readings)

Value emphasis:
- `OL` — outlined / dashed fill (open line).
- `0` / near-zero (< 0.05) — flagged low (often ground/shield).
- Numeric — drawn normally; tooltip shows the volt-drop value.

## Interactions (variant B parity with forterfix)

Single-page app, left sidebar + main canvas:

Sidebar:
- Hierarchical navigator: Brand/Family → Console → Board revision → Connector.
- Selecting a leaf loads that board's connector(s) into the canvas.

Canvas (connector view, default):
- SVG connector rendered from `hdmi.svg` template with 19 numbered pads.
- Hover pad → tooltip: pin №, signal name, signal class, measured value.
- Click pad → toggle "damaged/mark" state; persisted in localStorage keyed by
  `<boardId>:<connectorId>:<pinNum>`.
- Marked pads get double-outline highlight (matches forterfix convention).
- Counter: "N pins marked" + "Clear selection" button.

Controls bar:
- Filter pads by signal class (all / critical / ground / power / data /
  control / clock / NC) — dims non-matching pads.
- Toggle pin labels on/off.
- Light/dark theme toggle (persisted in localStorage).
- View mode: Connector ⇄ Board (photo). Board view shows photos from
  `assets/photos/<board-id>/` if present, else a friendly "no photos yet" state.

Footer/utility:
- Print / Export: a "Print" button produces a print stylesheet snapshot of the
  current connector with marked pins annotated; "Export CSV" exports the
  current board's pin readings (+ marked flags) for offline reference.

State (store.js):
- `marked.<boardId>.<connectorId>` → array of pin nums.
- `theme` → "light" | "dark".
- `labelsVisible` → boolean.
- `viewMode` → "connector" | "board".

## Theming

CSS custom properties on `:root`, overridden under `@media (prefers-color-scheme)`
and an explicit `[data-theme="dark"]` selector for the manual toggle. Tokens for
surface, text, border, each signal class, marked-pad accent, OL dashed style.

## Accessibility & Responsive

- Keyboard navigable pads (tabindex), focus ring; Esc closes tooltip; Space/Enter
  toggles mark on focused pad.
- Min phone-width: 320px, 16px gutters, no horizontal scroll. Sidebar collapses
  to a top drawer on narrow widths.
- Color choices meet WCAG AA contrast for text-on-fill legends.

## Licensing

Two layers:
- Site code (`*.html/css/js/svg`, build glue) → **MIT** (`LICENSE`).
- Data, measurements, photographs, prose (`data/**`, `assets/photos/**`,
  README/CONTRIBUTING text describing readings) → **CC BY-SA 4.0** (`DATA-LICENSE`).
Contributors submitting readings agree their contribution is licensed CC BY-SA 4.0
(stated in CONTRIBUTING.md and the Issue template).

## Seed Data Conversion

All readings from the originating forum post are converted to JSON verbatim,
including:
- Board revision tags (e.g. `[CFI-1216A]`, `[Zephyr]`, `[Corona]`).
- "Confirmed on N consoles" counts → `confirmedOn`.
- Bracketed notes (e.g. NB on PS4 Slim 2016A pin-18 variance) → `notes[]`.
- Typographic quirks preserved as-is in notes (e.g. `"o"` typo on Xbox One S
  pin 17 normalized to `0` with a note acknowledging the source typo).

Mapping of source sections → board files is enumerated in Repository Structure.

## Deployment

GitHub Pages, deployed from branch `main`, folder `/root`. Enabled programmatically
via `gh api` after first push. `.nojekyll` present in first commit.

## Out of scope / Future

- Photo ingestion (manual commit).
- Voltage/resistance modes and non-HDMI connectors (schema-ready, UI deferred).
- Full-text search across all boards (deferred; in-page filter suffices initially).
- Automated PNG/WebP optimization in CI (deferred).
