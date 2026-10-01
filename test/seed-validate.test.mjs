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
