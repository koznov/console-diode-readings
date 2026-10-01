// Canonical HDMI 19-pin signal-class mapping. Single source of truth.
// Class keys drive CSS variables (--sig-<key>) and legend grouping.

export const HDMI_PIN_COUNT = 19;

export const SIGNAL_CLASSES = {
  'gnd':           { displayName: 'Ground / Shield',  legendGroup: 'Power & Ground', cssVar: '--sig-gnd',
                     description: 'Ground return / cable shield. Reads ~0 V in diode mode (direct short to ground).' },
  'power-5v':      { displayName: '+5V Power',        legendGroup: 'Power & Ground', cssVar: '--sig-power-5v',
                     description: 'Supplies +5 V to the sink for EDID/HPD. Usually behind a switch or fuse; OL here often means a blown fuse.' },
  'tmds-data-pos': { displayName: 'TMDS Data +',      legendGroup: 'TMDS Data',      cssVar: '--sig-tmds-data-pos',
                     description: 'Positive half of a differential TMDS video/audio data pair into the HDMI transmitter or ESD/filter IC.' },
  'tmds-data-neg': { displayName: 'TMDS Data −',      legendGroup: 'TMDS Data',      cssVar: '--sig-tmds-data-neg',
                     description: 'Negative half of a differential TMDS video/audio data pair. Should read the same as its + partner.' },
  'tmds-clk-pos':  { displayName: 'TMDS Clock +',     legendGroup: 'TMDS Clock',     cssVar: '--sig-tmds-clk-pos',
                     description: 'Positive half of the TMDS pixel-clock pair. Typically matches the data pairs.' },
  'tmds-clk-neg':  { displayName: 'TMDS Clock −',     legendGroup: 'TMDS Clock',     cssVar: '--sig-tmds-clk-neg',
                     description: 'Negative half of the TMDS pixel-clock pair. Should read the same as its + partner.' },
  'ddc':           { displayName: 'DDC (SCL/SDA)',    legendGroup: 'Control',        cssVar: '--sig-ddc',
                     description: 'I²C Display Data Channel used for EDID and HDCP handshake; pulled up to +5 V on the board.' },
  'cec':           { displayName: 'CEC',              legendGroup: 'Control',        cssVar: '--sig-cec',
                     description: 'Consumer Electronics Control: single-wire bus for remote-control commands between devices.' },
  'utility':      { displayName: 'Utility / HEAC',   legendGroup: 'Control',        cssVar: '--sig-utility',
                     description: 'Reserved / Ethernet-channel line. Not connected on most consoles, so OL is the normal reading.' },
  'hpd':           { displayName: 'Hot Plug Detect',  legendGroup: 'Misc',          cssVar: '--sig-hpd',
                     description: 'Sink pulls this high to tell the console a display is attached; the console only starts video after it sees HPD.' },
};

// Specific line on each HDMI Type-A pin (the class above groups these).
export const PIN_NAMES = {
  1: 'TMDS Data2+',  2: 'TMDS Data2 Shield',  3: 'TMDS Data2−',
  4: 'TMDS Data1+',  5: 'TMDS Data1 Shield',  6: 'TMDS Data1−',
  7: 'TMDS Data0+',  8: 'TMDS Data0 Shield',  9: 'TMDS Data0−',
  10: 'TMDS Clock+', 11: 'TMDS Clock Shield', 12: 'TMDS Clock−',
  13: 'CEC', 14: 'Utility / HEAC', 15: 'SCL (DDC)', 16: 'SDA (DDC)',
  17: 'DDC/CEC Ground', 18: '+5V Power', 19: 'Hot Plug Detect',
};

const PIN_CLASS = {
  1: 'tmds-data-pos', 2: 'gnd', 3: 'tmds-data-neg',
  4: 'tmds-data-pos', 5: 'gnd', 6: 'tmds-data-neg',
  7: 'tmds-data-pos', 8: 'gnd', 9: 'tmds-data-neg',
  10: 'tmds-clk-pos', 11: 'gnd', 12: 'tmds-clk-neg',
  13: 'cec', 14: 'utility', 15: 'ddc', 16: 'ddc',
  17: 'gnd', 18: 'power-5v', 19: 'hpd',
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

// Everything the UI needs to describe one pin. `override` is a board-level
// signalClass override (already validated by resolveSignalClass semantics).
export function pinInfo(pin, override) {
  const className = resolveSignalClass(pin, override); // throws RangeError out of range
  const meta = SIGNAL_CLASSES[className];
  return {
    pin,
    name: PIN_NAMES[pin],
    className,
    classDisplayName: meta.displayName,
    description: meta.description,
  };
}

export const LEGEND_GROUPS = (() => {
  const order = ['Power & Ground', 'TMDS Data', 'TMDS Clock', 'Control', 'Misc'];
  const map = {};
  for (const [cls, meta] of Object.entries(SIGNAL_CLASSES)) {
    (map[meta.legendGroup] ??= []).push(cls);
  }
  return order.map(group => ({ group, classes: map[group] }));
})();
