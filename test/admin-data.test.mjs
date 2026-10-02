import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as data from '../admin/js/data.mjs';

// ---- path helpers -----------------------------------------------------------

test('toBrowser prefixes repo paths with the site root', () => {
  assert.equal(data.toBrowser('data/catalog.json'), '../data/catalog.json');
  assert.equal(data.toBrowser('/data/catalog.json'), '../data/catalog.json'); // leading slash stripped
});

test('slug lowercases and dashifies non-alphanumeric runs', () => {
  assert.equal(data.slug('PS5 Phat'), 'ps5-phat');
  assert.equal(data.slug('  EDM-010  '), 'edm-010');
  assert.equal(data.slug('a__b--c'), 'a-b-c');
  assert.equal(data.slug(null), '');
});

test('defaultBoardFile slugs both parts', () => {
  assert.equal(data.defaultBoardFile('ps5', 'EDM-010'), 'data/consoles/ps5-edm-010.json');
});

// ---- lookup ------------------------------------------------------------------

test('findConsole returns the match or null', () => {
  const catalog = { consoles: [{ id: 'ps5' }, { id: 'xbox360' }] };
  assert.deepEqual(data.findConsole(catalog, 'xbox360'), { id: 'xbox360' });
  assert.equal(data.findConsole(catalog, 'nope'), null);
  assert.equal(data.findConsole(null, 'ps5'), null);
});

// ---- console transforms -------------------------------------------------------

test('addConsoleToCatalog appends a fresh entry and does not mutate the input', () => {
  const catalog = { consoles: [{ id: 'ps5', boards: [] }] };
  const before = JSON.parse(JSON.stringify(catalog));
  const next = data.addConsoleToCatalog(catalog, { id: 'xbox360', brand: 'Microsoft' });
  assert.equal(next.consoles.length, 2);
  assert.deepEqual(next.consoles[1], { id: 'xbox360', brand: 'Microsoft', family: '', name: '', boards: [] });
  assert.deepEqual(catalog, before); // input untouched
});

test('addConsoleToCatalog throws on a duplicate id', () => {
  const catalog = { consoles: [{ id: 'ps5' }] };
  assert.throws(() => data.addConsoleToCatalog(catalog, { id: 'ps5' }), /already exists/);
});

test('updateConsoleInCatalog changes only the given fields', () => {
  const catalog = { consoles: [{ id: 'ps5', brand: 'Sony', family: 'PS5', name: 'PlayStation 5' }] };
  const next = data.updateConsoleInCatalog(catalog, 'ps5', { name: 'PlayStation 5 (fat)' });
  assert.equal(next.consoles[0].name, 'PlayStation 5 (fat)');
  assert.equal(next.consoles[0].brand, 'Sony'); // untouched
  assert.throws(() => data.updateConsoleInCatalog(catalog, 'nope', { name: 'x' }), /not found/);
});

test('removeConsoleFromCatalog returns the catalog and its board files to delete', () => {
  const catalog = { consoles: [
    { id: 'ps5', boards: [{ id: 'edm-010', file: 'data/consoles/ps5-edm-010.json' }] },
    { id: 'xbox360', boards: [] },
  ]};
  const { catalog: next, files } = data.removeConsoleFromCatalog(catalog, 'ps5');
  assert.deepEqual(next.consoles.map(c => c.id), ['xbox360']);
  assert.deepEqual(files, ['data/consoles/ps5-edm-010.json']);
  assert.throws(() => data.removeConsoleFromCatalog(catalog, 'nope'), /not found/);
});

// ---- board transforms ----------------------------------------------------------

test('addBoardToCatalog registers the entry with a default revision', () => {
  const catalog = { consoles: [{ id: 'ps5', boards: [] }] };
  const next = data.addBoardToCatalog(catalog, 'ps5', { id: 'edm-010', file: 'data/consoles/ps5-edm-010.json' });
  assert.deepEqual(next.consoles[0].boards, [
    { id: 'edm-010', revision: '', file: 'data/consoles/ps5-edm-010.json' },
  ]);
});

test('addBoardToCatalog throws on unknown console or duplicate board', () => {
  const catalog = { consoles: [{ id: 'ps5', boards: [{ id: 'edm-010', file: 'f' }] }] };
  assert.throws(() => data.addBoardToCatalog(catalog, 'nope', { id: 'b', file: 'f' }), /not found/);
  assert.throws(() => data.addBoardToCatalog(catalog, 'ps5', { id: 'edm-010', file: 'g' }), /already exists/);
});

test('removeBoardFromCatalog returns the catalog and the board file to delete', () => {
  const catalog = { consoles: [{ id: 'ps5', boards: [
    { id: 'edm-010', file: 'data/consoles/ps5-edm-010.json' },
    { id: 'other', file: 'data/consoles/ps5-other.json' },
  ]}]};
  const { catalog: next, file } = data.removeBoardFromCatalog(catalog, 'ps5', 'edm-010');
  assert.deepEqual(next.consoles[0].boards.map(b => b.id), ['other']);
  assert.equal(file, 'data/consoles/ps5-edm-010.json');
  assert.throws(() => data.removeBoardFromCatalog(catalog, 'ps5', 'nope'), /not found/);
});

// ---- board construction + serialization -----------------------------------------

test('buildBoard fills defaults and keeps the on-disk key order', () => {
  const b = data.buildBoard({ id: 'edm-010', consoleId: 'ps5', revision: 'EDM-010 (fat)' });
  assert.deepEqual(Object.keys(b), ['id', 'consoleId', 'revision', 'confirmedOn', 'notes', 'connectors', 'photos']);
  assert.equal(b.confirmedOn, 1);
  assert.deepEqual(b.notes, []);
  assert.deepEqual(b.connectors, []);
  assert.deepEqual(b.photos, []);
});

test('buildBoard passes through provided arrays and confirmedOn', () => {
  const notes = ['n1'];
  const b = data.buildBoard({ id: 'x', consoleId: 'c', revision: '', confirmedOn: 2, notes });
  assert.equal(b.confirmedOn, 2);
  assert.deepEqual(b.notes, notes);
});

test('serialize* emit 2-space JSON with a trailing newline', () => {
  const board = data.buildBoard({ id: 'x', consoleId: 'c', revision: '' });
  assert.equal(data.serializeBoard(board), JSON.stringify(board, null, 2) + '\n');
  assert.ok(data.serializeBoard(board).endsWith('}\n'));
  assert.equal(data.serializeCatalog({ consoles: [] }), '{\n  "consoles": []\n}\n');
});
