// Schema validation for the admin panel. Mirrors js/loader.mjs so the panel
// cannot commit what the site would reject or warn about. Pure (no DOM).

import { parseValue } from '../../js/values.mjs';
import { padPositions } from '../../js/photo.mjs';
import { HDMI_PIN_COUNT } from '../../js/signals.mjs';
import { kindOf, rawPinKey } from '../../js/kinds.mjs';

// Validate one pin reading string. A blank value is allowed (a pin may be left
// unmeasured); a non-blank value must parse. Returns null if OK, else a message.
export function validatePinValue(value) {
  if (value == null || String(value).trim() === '') return null;
  try {
    parseValue(value);
  } catch (e) {
    return e.message;
  }
  return null;
}

// Validate one connector object. Returns an array of error strings.
export function validateConnector(conn, index = 0) {
  const label = conn?.id ? `connector "${conn.id}"` : `connector #${index + 1}`;
  if (!conn || typeof conn !== 'object') return [`${label}: not an object`];

  const errors = [];
  if (typeof conn.id !== 'string' || !conn.id) errors.push(`${label}: id is required`);

  let kind;
  try {
    kind = kindOf(conn);
  } catch (e) {
    return [...errors, `${label}: ${e.message}`];
  }
  const word = kind.pinWord.toLowerCase();
  const pins = Array.isArray(conn.measurement?.pins) ? conn.measurement.pins : [];
  // an HDMI connector may declare fewer pins; a chip's balls come from its package
  const pinCount = Number(conn.pinCount) || HDMI_PIN_COUNT;
  const exists = (key) => kind.isBga ? kind.hasKey(key) : Number.isInteger(key) && key >= 1 && key <= pinCount;

  const seen = new Set();
  for (const pin of pins) {
    const key = rawPinKey(kind, pin);
    if (key == null || !exists(key)) {
      errors.push(kind.isBga
        ? `${label}: ball ${pin?.ball} does not exist on ${kind.package.name}`
        : `${label}: pin number ${pin?.num} is out of range 1..${pinCount}`);
      continue;
    }
    if (seen.has(key)) errors.push(`${label}: duplicate ${word} ${key}`);
    seen.add(key);

    const v = validatePinValue(pin.value);
    if (v) errors.push(`${label} ${word} ${key}: ${v}`);
  }
  return errors;
}

// Validate one photo entry. Returns an array of error strings. Anchors are
// optional; when present they must be well-formed and carry a positive size —
// exactly the rules js/loader.mjs enforces before it will draw live pins.
export function validatePhoto(photo, index = 0) {
  const label = `photo #${index + 1}`;
  if (!photo || typeof photo !== 'object') return [`${label}: not an object`];

  const errors = [];
  if (typeof photo.src !== 'string' || !photo.src) errors.push(`${label}: src is required`);

  if (photo.anchors != null) {
    const size = photo.size;
    if (!(Array.isArray(size) && size.length === 2 && size.every(v => Number.isFinite(v) && v > 0))) {
      errors.push(`${label}: anchors need a positive size [width, height]`);
    } else {
      try {
        padPositions(photo.anchors);
      } catch (e) {
        errors.push(`${label}: ${e.message}`);
      }
    }
  }
  return errors;
}

// Validate an entire board object. Returns an array of error strings.
export function validateBoard(board) {
  if (!board || typeof board !== 'object') return ['board is not an object'];

  const errors = [];
  // id/consoleId must be non-empty; revision is display-only on the site, so an
  // empty label (a board added without one) is valid.
  for (const field of ['id', 'consoleId']) {
    if (typeof board[field] !== 'string' || !board[field]) errors.push(`${field} is required`);
  }
  if (typeof board.revision !== 'string') errors.push('revision must be a string');
  (Array.isArray(board.connectors) ? board.connectors : []).forEach((c, i) => errors.push(...validateConnector(c, i)));
  (Array.isArray(board.photos) ? board.photos : []).forEach((p, i) => errors.push(...validatePhoto(p, i)));
  return errors;
}

// Validate a console entry. Returns an array of error strings.
export function validateConsole(consoleObj) {
  if (!consoleObj || typeof consoleObj !== 'object') return ['console is not an object'];
  const errors = [];
  for (const field of ['id', 'brand', 'family', 'name']) {
    if (typeof consoleObj[field] !== 'string' || !consoleObj[field]) errors.push(`${field} is required`);
  }
  return errors;
}
