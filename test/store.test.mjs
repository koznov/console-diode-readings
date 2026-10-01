import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../js/store.mjs';

function memStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: k => void m.delete(k),
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
  const st = memStorage();
  const s = new Store(st);
  s.toggleMark('b1:c', 1);
  s.toggleMark('b2:c', 2);
  s.clearMarks('b1:c');
  assert.deepEqual(s.markedPins('b1:c'), []);
  assert.deepEqual(s.markedPins('b2:c'), [2]); // untouched
});

test('generic get/set prefs round-trip', () => {
  const s = new Store(memStorage());
  s.set('theme', 'dark');
  assert.equal(s.get('theme', 'light'), 'dark');
  assert.equal(s.get('absent', 'fallback'), 'fallback');
});

test('degrades gracefully when storage throws (private mode)', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  const s = new Store(broken);
  // must not throw; in-session marks still work
  assert.doesNotThrow(() => s.toggleMark('b:c', 3));
  assert.equal(s.isMarked('b:c', 3), true); // in-memory only
  assert.doesNotThrow(() => s.clearMarks('b:c'));
  assert.doesNotThrow(() => s.set('theme', 'dark'));
  assert.equal(s.get('theme', 'light'), 'light'); // couldn't persist, returns fallback
});
