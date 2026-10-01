import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, loadBoard } from '../js/loader.mjs';

// Real-file fetch stub: resolves any URL against the repo root on disk.
const ROOT = new URL('../', import.meta.url);
async function makeDiskFetcher() {
  return async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(new URL(String(url).replace(/^\.\//, ''), ROOT))),
  });
}

test('every catalog board file loads and yields 19 enriched pins with no warnings', async () => {
  const fetchFn = await makeDiskFetcher();
  const cat = await loadCatalog(fetchFn);
  assert.ok(cat.consoles.length >= 12, 'expected >=12 consoles seeded');
  for (const cons of cat.consoles) {
    for (const entry of cons.boards) {
      const board = await loadBoard(entry, fetchFn);
      const conn = board.connectors[0];
      assert.equal(conn.measurement.pins.length, 19, `${cons.name}/${entry.revision}: expected 19 pins`);
      assert.deepEqual(board.warnings, [], `${cons.name}/${entry.revision}: unexpected warnings ${JSON.stringify(board.warnings)}`);
    }
  }
});

// width/height in pixels from the file header: PNG, or JPEG (first start-of-frame segment)
function imageSize(buf) {
  if (buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

test('every photo a board lists exists, and a declared size is the picture\'s real size', async () => {
  const fetchFn = await makeDiskFetcher();
  const cat = await loadCatalog(fetchFn);
  for (const cons of cat.consoles) {
    for (const entry of cons.boards) {
      const board = await loadBoard(entry, fetchFn);
      for (const photo of board.photos) {
        const where = `${cons.name}/${entry.revision}: ${photo.src}`;
        let buf;
        try {
          buf = await readFile(new URL(photo.src, ROOT));
        } catch {
          assert.fail(`${where} is listed in photos but the file is missing`);
        }
        if (photo.size) {
          // pads are placed from these pixels; a wrong size would put every pin off the contact
          assert.deepEqual(imageSize(buf), photo.size, `${where}: size in the board file differs from the picture (PNG or JPEG expected)`);
        }
      }
    }
  }
});
