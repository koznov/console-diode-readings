// Marks (damaged-pin flags) and prefs persisted in localStorage, degrading
// gracefully when storage is unavailable (private mode, disabled, quota).
//
// Degradation policy (deliberately asymmetric):
//   - MARKS keep working in-session via an in-memory map, so a technician can
//     still mark pins even when persistence is impossible.
//   - PREFS (get/set) fail silently: a thrown set is a no-op, and get returns
//     its fallback. Prefs are cosmetic; losing them on reload is acceptable.

export class Store {
  constructor(storageLike, keyPrefix = 'cdr:') {
    this.prefix = keyPrefix;
    this._marksMem = null;       // in-session marks mirror, populated on storage failure
    this.storage = storageLike ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  _safe(fn, onError) {
    if (!this.storage) return onError();
    try {
      return fn(this.storage);
    } catch (_) {
      return onError();
    }
  }

  _readMarksMap() {
    return this._safe(
      s => {
        const j = s.getItem(`${this.prefix}marks`);
        return j ? JSON.parse(j) : {};
      },
      () => (this._marksMem ??= {}),
    );
  }

  _writeMarksMap(m) {
    return this._safe(
      s => s.setItem(`${this.prefix}marks`, JSON.stringify(m)),
      () => { this._marksMem = m; },
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
      s => {
        const v = s.getItem(`${this.prefix}${key}`);
        return v == null ? fallback : v;
      },
      () => fallback, // no in-session pref mirror: return fallback
    );
  }

  set(key, value) {
    return this._safe(
      s => s.setItem(`${this.prefix}${key}`, String(value)),
      () => {}, // silent no-op on failure
    );
  }
}
