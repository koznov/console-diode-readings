// Canonical HDMI 19-pin signal-class mapping. Single source of truth.
// Class keys drive CSS variables (--sig-<key>) and legend grouping.

export const HDMI_PIN_COUNT = 19;

export const SIGNAL_CLASSES = {
  'gnd':           { displayName: 'Ground / Shield',  legendGroup: 'Power & Ground', cssVar: '--sig-gnd' },
  'power-5v':      { displayName: '+5V Power',        legendGroup: 'Power & Ground', cssVar: '--sig-power-5v' },
  'tmds-data-pos': { displayName: 'TMDS Data +',      legendGroup: 'TMDS Data',      cssVar: '--sig-tmds-data-pos' },
  'tmds-data-neg': { displayName: 'TMDS Data −',      legendGroup: 'TMDS Data',      cssVar: '--sig-tmds-data-neg' },
  'tmds-clk-pos':  { displayName: 'TMDS Clock +',     legendGroup: 'TMDS Clock',     cssVar: '--sig-tmds-clk-pos' },
  'tmds-clk-neg':  { displayName: 'TMDS Clock −',     legendGroup: 'TMDS Clock',     cssVar: '--sig-tmds-clk-neg' },
  'ddc':           { displayName: 'DDC (SCL/SDA)',    legendGroup: 'Control',        cssVar: '--sig-ddc' },
  'cec':           { displayName: 'CEC',              legendGroup: 'Control',        cssVar: '--sig-cec' },
  'utility':      { displayName: 'Utility / HEAC',   legendGroup: 'Control',        cssVar: '--sig-utility' },
  'hpd':           { displayName: 'Hot Plug Detect',  legendGroup: 'Misc',          cssVar: '--sig-hpd' },
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

export const LEGEND_GROUPS = (() => {
  const order = ['Power & Ground', 'TMDS Data', 'TMDS Clock', 'Control', 'Misc'];
  const map = {};
  for (const [cls, meta] of Object.entries(SIGNAL_CLASSES)) {
    (map[meta.legendGroup] ??= []).push(cls);
  }
  return order.map(group => ({ group, classes: map[group] }));
})();
