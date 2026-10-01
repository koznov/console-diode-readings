import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, loadBoard } from '../js/loader.mjs';

const jsonFixture = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url)));

function stubFetch(map) {
  return async (url) => {
    const norm = String(url).replace(/^\.\//, '');
    const entry = map[norm] ?? map[String(url)];
    if (!entry) return { ok: false, status: 404 };
    return { ok: true, json: async () => entry };
  };
}

test('loadCatalog returns the console tree', async () => {
  const cat = await loadCatalog(stubFetch({
    'data/catalog.json': await jsonFixture('./fixtures/mini-catalog.json')
  }));
  assert.equal(cat.consoles.length, 1);
  assert.equal(cat.consoles[0].boards[0].revision, 'Rev A');
});

test('loadBoard enriches pins with canonical signal class + parsed value', async () => {
  const cat = await loadCatalog(stubFetch({
    'data/catalog.json': await jsonFixture('./fixtures/mini-catalog.json'),
    'test/fixtures/full-board.json': await jsonFixture('./fixtures/full-board.json'),
  }));
  const board = await loadBoard(cat.consoles[0].boards[0], stubFetch({
    'test/fixtures/full-board.json': await jsonFixture('./fixtures/full-board.json'),
  }));
  const conn = board.connectors[0];
  assert.equal(conn.pinCount, 19);
  assert.equal(conn.measurement.pins.length, 19);
  assert.equal(conn.measurement.pins[1].signalClass, 'gnd');      // pin 2
  assert.equal(conn.measurement.pins[1].parsed.kind, 'zero');
  assert.equal(conn.measurement.pins[13].parsed.kind, 'ol');     // pin 14
  assert.deepEqual(board.warnings, []);
});

test('loadBoard surfaces a warning naming the board + missing pins (does not crash)', async () => {
  const entry = { id: 'short', revision: 'Short Rev', file: 'test/fixtures/short-board.json' };
  const board = await loadBoard(entry, stubFetch({
    'test/fixtures/short-board.json': await jsonFixture('./fixtures/short-board.json'),
  }));
  assert.ok(board.warnings.some(w => /pin 19|missing/i.test(w)), JSON.stringify(board.warnings));
  assert.equal(board.connectors[0].measurement.pins.length, 18); // render what we have
});

test('loadBoard falls back a bad signalClass override to canonical and warns', async () => {
  const entry = { id: 'badclass', revision: 'Bad Class', file: 'test/fixtures/bad-class-board.json' };
  const board = await loadBoard(entry, stubFetch({
    'test/fixtures/bad-class-board.json': await jsonFixture('./fixtures/bad-class-board.json'),
  }));
  assert.equal(board.connectors[0].measurement.pins[1].signalClass, 'gnd'); // fell back from 'grnd'
  assert.ok(board.warnings.some(w => /signalClass|fallback/i.test(w)));
});

test('loadCatalog tolerates a board file that 404s by rejecting loadBoard cleanly', async () => {
  const cat = await loadCatalog(stubFetch({
    'data/catalog.json': {
      consoles: [
        { id: 'c1', brand: 'B', family: 'F', name: 'N',
          boards: [
            { id: 'good', revision: 'G', file: 'test/fixtures/full-board.json' },
            { id: 'gone', revision: 'Gone', file: 'test/fixtures/missing.json' }
          ] }
      ]
    },
    'test/fixtures/full-board.json': await jsonFixture('./fixtures/full-board.json'),
    // missing.json intentionally absent -> 404
  }));
  assert.equal(cat.consoles[0].boards.length, 2); // catalog still lists both
  await assert.rejects(loadBoard(cat.consoles[0].boards[1], stubFetch({})),
    /404|could not load/i);
});


// ---- photos[]: a bare path stays a plain picture, an object can carry live pins ----

async function boardWithPhotos(photos) {
  const base = await jsonFixture('./fixtures/full-board.json');
  const entry = { id: 'photo-board', revision: 'Photo Rev', file: 'test/fixtures/photo-board.json' };
  return loadBoard(entry, stubFetch({ 'test/fixtures/photo-board.json': { ...base, photos } }));
}

const LIVE = {
  src: 'assets/photos/x/port.png',
  caption: 'HDMI port',
  size: [1120, 842],
  anchors: { '19': [338.1, 589.7], '1': [805.6, 589.2] },
};

test('loadBoard turns a bare photo path into a plain picture without pins', async () => {
  const board = await boardWithPhotos(['assets/photos/x/a.jpg']);
  assert.deepEqual(board.photos, [{ src: 'assets/photos/x/a.jpg', caption: '', size: null, anchors: null }]);
  assert.deepEqual(board.warnings, []);
});

test('loadBoard keeps size and anchors of a photo that carries live pins', async () => {
  const board = await boardWithPhotos([LIVE]);
  assert.deepEqual(board.photos, [LIVE]);
  assert.deepEqual(board.warnings, []);
});

test('loadBoard keeps a photo whose anchors are unusable, shows it without pins and warns naming it', async () => {
  const board = await boardWithPhotos([{ ...LIVE, anchors: { '19': [338.1, 589.7] } }]);
  assert.equal(board.photos.length, 1);
  assert.equal(board.photos[0].src, LIVE.src);
  assert.equal(board.photos[0].anchors, null);
  assert.equal(board.warnings.length, 1);
  assert.match(board.warnings[0], /assets\/photos\/x\/port\.png/);
  assert.match(board.warnings[0], /exactly two/);
});

test('loadBoard warns when anchors come without a usable size, since pads could not be placed', async () => {
  for (const size of [undefined, [1120], [0, 842], ['1120', '842'], [1120, Infinity]]) {
    const board = await boardWithPhotos([{ ...LIVE, size }]);
    assert.equal(board.photos[0].anchors, null, `size ${JSON.stringify(size)}`);
    assert.equal(board.photos[0].size, null, `size ${JSON.stringify(size)}`);
    assert.equal(board.warnings.length, 1, `size ${JSON.stringify(size)}`);
    assert.match(board.warnings[0], /size/);
  }
});

test('loadBoard drops a photo entry that has no src and warns, keeping the others', async () => {
  const board = await boardWithPhotos([{ caption: 'orphan' }, 'assets/photos/x/ok.png', 42]);
  assert.deepEqual(board.photos.map(p => p.src), ['assets/photos/x/ok.png']);
  assert.equal(board.warnings.length, 2);
  assert.match(board.warnings[0], /photo #1/);
  assert.match(board.warnings[1], /photo #3/);
});
