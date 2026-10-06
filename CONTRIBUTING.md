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

Values vary between meters (typically 5–10 %) and between boards — that's
expected, which is why the **meter model** matters: readers calibrate the
site's numbers to their own meter, and knowing what yours was helps them
judge the offset. If you measure more than one console of the same revision,
say how many and flag any pin that differs between them.

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
   in the board's `photos` array (see *Photos with live pins* below). Photos
   are licensed like the data (CC BY-SA 4.0), so only add pictures you took
   or have the right to share.
5. Open the PR.

## Memory chips (GDDR6)

A board can also carry readings of a BGA memory chip, as a second entry in
`connectors`. Measure the chip's **pads on the board with the chip removed**,
same diode mode and probe orientation, and key each reading by **ball**:

```jsonc
{
  "id": "gddr6",
  "type": "GDDR6",
  "package": "gddr6",          // ball map from js/bga.mjs (180-ball GDDR6, top view)
  "label": "GDDR6 RAM",
  "measurement": {
    "mode": "diode",
    "probes": { "red": "GND", "black": "ball" },
    "unit": "V (drop)",
    "pins": [ { "ball": "A1", "value": "0.0061" }, { "ball": "A2", "value": "0.0034" } /* … all 180 */ ]
  }
}
```

- Keep every decimal your meter shows (`"0.2579"`): on a chip the
  differences that matter are in the third and fourth place.
- Ball names and colours come from the package, not from the file. Say in
  the board's `notes` which chip you measured (e.g. its U-number).
- `npm test` checks every ball exists, none is listed twice and none is
  missing. The admin panel's **+ Add GDDR6 chip** button creates the entry.

## Photos with live pins

A `photos` entry is either a plain path (`"assets/photos/x/top.jpg"`, shown as
a picture) or an object that also makes the pins clickable on the photo:

```jsonc
{
  "src": "assets/photos/my-board-id/hdmi-port.png",
  "caption": "HDMI port, top view",
  "size": [1120, 842],                                   // the picture's real width, height in pixels
  "anchors": { "19": [338.1, 589.7], "1": [805.6, 589.2] }  // pin → [x, y] pixel of that contact's centre
}
```

- Open the picture in any image viewer that shows pixel coordinates and note
  the centre of **two contacts**, ideally the two ends of the row (pins 19
  and 1) for the best accuracy. Coordinates start at the top-left corner.
- The pin you name is the pin that sits there: if pin 1 is on the left of
  your photo, put `"1"` on the left anchor. The viewer spaces the other 17
  contacts evenly along the line through the two, so the row may be tilted
  or the shot portrait. Shoot from above with the pad row in focus.
- `npm test` checks the file exists and that `size` matches it. Bad anchors
  never hide the picture: it is shown without pins, with a warning.

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
