# 🎮 Console Diode Readings

An interactive reference of **diode-mode multimeter readings** for HDMI ports
across PlayStation, Xbox, and Nintendo consoles — so repair technicians can
verify and cross-check measurements against known-good boards.

🌐 **Live site:** https://koznov.github.io/console-diode-readings/

Inspired by the interactive BGA pinout viewer at
[forterfix.com/bga_pinouts](https://forterfix.com/bga_pinouts), but for
console HDMI ports.

## How readings are taken

All readings are taken in **multimeter diode mode** with the **red probe on
ground** and the **black probe on the pin in question**. Values are the
forward voltage drop in volts (or `OL` = open line).

> ⚠️ Readings will not always be exact. Expect some variation between meters
> and between board revisions. Where the original measurer confirmed a
> reading across multiple consoles, that count is shown. Revision-specific
> caveats appear in the notes panel under the connector.

## Using the viewer

1. Pick a console and board revision in the sidebar.
2. The HDMI footprint renders as it sits on the board with the connector
   removed: one row of 19 colour-coded pads, **pin 19 on the left, pin 1 on
   the right**, with every reading printed under its pad.
3. **Hover** a pad to see which signal that pin carries (schematic name,
   e.g. `SCL`, plus the full line name).
4. **Click / tap** a pad (or focus + Space/Enter) to select it — the panel
   below the connector shows the pin's function, its reading, and any notes.
   Press Esc or *Deselect* to clear.
5. In that panel, **Mark damaged** flags the pin (red outline). Marks persist
   in your browser and survive reloads; *Clear marks* removes them all.
6. The **Signals** legend is interactive: hover a signal to light up its
   pins, click to pin it — the panel then lists that signal's pins and
   readings. Click again, *Show all pins*, or Esc to release.
7. Use the controls to toggle pin numbers, switch light/dark theme, or flip
   to the board/photo view.
8. **Print** or **Export CSV** for an offline reference of the current board
   (exports include pin names and your marked pins).

## Contributing

Got readings for a console or revision that isn't here? Contributions are
welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)**. The easiest path is to
open an issue using the *New Readings* template and paste your values.

## Licensing

This repository uses **two licenses**:

- **Site code** (HTML, CSS, JavaScript, SVG) — **MIT** (see `LICENSE`).
- **Data, measurements, photographs, and descriptive prose** (`data/`,
  `assets/photos/`, README/CONTRIBUTING text) — **CC BY-SA 4.0**
  (see `DATA-LICENSE`).

Submitting readings licences them under CC BY-SA 4.0.

## Credits

The seed dataset was collected by a community member and originally shared in
a forum post covering HDMI diode readings across PS5, PS4, PS3, Xbox One,
Xbox 360, and Wii U families. Several readings were confirmed across
multiple consoles by the original author. Thank you to everyone who
contributes measurements.
