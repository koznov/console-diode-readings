---
name: New Readings
about: Submit HDMI diode readings for a console/board revision not yet covered
title: "[Readings] <Console> — <Board revision>"
labels: readings
---

## Console & revision

- **Console:** (e.g. PS5 Phat, PS4 Slim, Xbox One X)
- **Board revision:** (exact silkscreen marking, e.g. CFI-1216A, CECHK04, Corona)
- **Meter model:** (so others can compare)
- **Probe orientation:** red on ☐ GND / black on signal pin (the standard for this dataset)

## Per-pin readings (diode mode)

Fill in all 19 pins. Use `OL` for open lines, `0` for ground/near-zero, decimal
drops otherwise.

| Pin | Value | | Pin | Value |
|-----|-------|-|-----|-------|
| 1 |  | | 11 |  |
| 2 |  | | 12 |  |
| 3 |  | | 13 |  |
| 4 |  | | 14 |  |
| 5 |  | | 15 |  |
| 6 |  | | 16 |  |
| 7 |  | | 17 |  |
| 8 |  | | 18 |  |
| 9 |  | | 19 |  |
| 10 |  | | | |

## Confirmation & notes

- Measured on **how many** consoles of this revision? _____
- Did any pin differ between consoles? If so, which pin and what values?
- Any other caveats (loose connector, prior repair, etc.)?

## Licence agreement

- [ ] I agree these readings are licensed under **CC BY-SA 4.0** (see `DATA-LICENSE`),
      and I took them myself or have the right to contribute them.

> Tip: if you prefer, open a pull request instead — see CONTRIBUTING.md for the
> JSON schema and the `npm test` validation step.
