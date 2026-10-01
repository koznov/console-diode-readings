# Contributing

Thank you for helping grow this reference. The most valuable contribution is
**new diode readings** for consoles or board revisions we don't yet cover.

## Measurement methodology

So the data stays comparable, please follow the same procedure the existing
readings use:

1. Set your multimeter to **diode mode**.
2. Put the **red probe on ground** (a known ground pad on the board).
3. Touch the **black probe to each HDMI pin** in turn (pins 1–19).
4. Record the value shown: a voltage drop like `0.79`, or `OL` for an open
   line, or `0` / near-zero for ground/shield pins.
5. Note your **meter model** and the **exact board revision** (silkscreen
   marking, e.g. `CFI-1216A`, `CECHK04`, `Zephyr`). Readings can differ
   between revisions, so this matters.

Values vary between meters and boards — that's expected. If you measure more
than one console of the same revision, say how many and flag any pin that
differs between them.

## How to submit

### Option A — Open an issue (easiest)

Use the **New Readings** issue template (`.github/ISSUE_TEMPLATE/new-readings.md`)
and fill in your console, revision, meter, probe orientation, and the 19
per-pin values. A maintainer will convert it to a data file.

### Option B — Pull request

1. Add a JSON file under `data/consoles/` following the shape of an existing
   board file (copy one as a template). Each pin is `{"num": N, "value": "..."}`
   in order 1–19. Keep values as **strings** (so `OL` and `0` are preserved).
   An optional `"note": "..."` on a pin is shown in the viewer when that pin
   is selected — use it for per-pin caveats (e.g. *"varies 0.49–0.53"*).
2. Register it in `data/catalog.json` under the right console (add the console
   if it's new).
3. Run `npm test` — the seed-validation test loads every board and asserts 19
   pins with no warnings. It will catch typos in values or signal classes.
4. Optionally add board photos under `assets/photos/<board-id>/` and list them
   in the board's `photos` array.
5. Open the PR.

## Schema at a glance

```jsonc
{
  "id": "my-board-id",
  "consoleId": "ps5",
  "revision": "MY-REV",
  "confirmedOn": 2,                 // number of consoles you measured
  "notes": ["pin 18 varied: OL on 2 boards, 0.66 on a third"],
  "connectors": [{
    "id": "hdmi", "type": "HDMI", "label": "HDMI port",
    "svgTemplate": "assets/connectors/hdmi.svg", "pinCount": 19,
    "measurement": {
      "mode": "diode",
      "probes": { "red": "GND", "black": "signal pin" },
      "unit": "V (drop)",
      "pins": [ {"num":1,"value":"0.79"}, /* ... 19 entries ... */ {"num":19,"value":"0.53"} ]
    }
  }],
  "photos": []
}
```

The signal class of each pin is derived canonically from its number (see
`js/signals.mjs`); you normally don't set `signalClass` per pin. Overrides are
supported but discouraged — the loader falls back to the canonical class if
you typo one (and emits a warning).

## Licensing

By submitting readings (via issue or pull request), you agree your
contribution is licensed under **CC BY-SA 4.0** (see `DATA-LICENSE`).
Site code changes remain MIT.
