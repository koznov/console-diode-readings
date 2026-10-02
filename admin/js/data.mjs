// Pure path mapping + catalog/board model transforms for the admin panel.
// No DOM, no network — safe to import under `node --test`.

export const SITE_ROOT = '../'; // admin/ sits at site root; repo paths are relative to it

// A repo-relative path (e.g. "data/catalog.json") as a browser fetch URL from /admin/.
export function toBrowser(repoPath) {
  return SITE_ROOT + String(repoPath).replace(/^\/+/, '');
}

// Filesystem-safe slug: lowercase, non-alphanumeric runs → single dash, trimmed.
export function slug(s) {
  return String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Default location for a new board file: data/consoles/<consoleId>-<boardId>.json
export function defaultBoardFile(consoleId, boardId) {
  return `data/consoles/${slug(consoleId)}-${slug(boardId)}.json`;
}

export function findConsole(catalog, consoleId) {
  return (catalog?.consoles || []).find(c => c.id === consoleId) ?? null;
}

// Deep clone so catalog mutations never touch the caller's object.
function cloneCatalog(catalog) {
  return JSON.parse(JSON.stringify(catalog));
}

// --- catalog transforms (each returns a NEW catalog; input is not mutated) --

export function addConsoleToCatalog(catalog, consoleObj) {
  const next = cloneCatalog(catalog);
  if (!Array.isArray(next.consoles)) next.consoles = [];
  if (findConsole(next, consoleObj.id)) throw new Error(`console "${consoleObj.id}" already exists`);
  next.consoles.push({
    id: consoleObj.id,
    brand: consoleObj.brand ?? '',
    family: consoleObj.family ?? '',
    name: consoleObj.name ?? '',
    boards: [],
  });
  return next;
}

// `id` is immutable in v1 — only display fields can change.
export function updateConsoleInCatalog(catalog, consoleId, { brand, family, name }) {
  const next = cloneCatalog(catalog);
  const c = findConsole(next, consoleId);
  if (!c) throw new Error(`console "${consoleId}" not found`);
  if (brand != null) c.brand = brand;
  if (family != null) c.family = family;
  if (name != null) c.name = name;
  return next;
}

// Returns { catalog, files } — the updated catalog and board file paths to delete.
export function removeConsoleFromCatalog(catalog, consoleId) {
  const next = cloneCatalog(catalog);
  const idx = (next.consoles || []).findIndex(c => c.id === consoleId);
  if (idx < 0) throw new Error(`console "${consoleId}" not found`);
  const [removed] = next.consoles.splice(idx, 1);
  return { catalog: next, files: (removed.boards || []).map(b => b.file) };
}

export function addBoardToCatalog(catalog, consoleId, board) {
  const next = cloneCatalog(catalog);
  const c = findConsole(next, consoleId);
  if (!c) throw new Error(`console "${consoleId}" not found`);
  if (!Array.isArray(c.boards)) c.boards = [];
  if (c.boards.some(b => b.id === board.id)) throw new Error(`board "${board.id}" already exists on ${consoleId}`);
  c.boards.push({ id: board.id, revision: board.revision ?? '', file: board.file });
  return next;
}

// Returns { catalog, file } — the updated catalog and the board file path to delete.
export function removeBoardFromCatalog(catalog, consoleId, boardId) {
  const next = cloneCatalog(catalog);
  const c = findConsole(next, consoleId);
  if (!c) throw new Error(`console "${consoleId}" not found`);
  const idx = (c.boards || []).findIndex(b => b.id === boardId);
  if (idx < 0) throw new Error(`board "${boardId}" not found on ${consoleId}`);
  const [removed] = c.boards.splice(idx, 1);
  return { catalog: next, file: removed.file };
}

// --- board construction ----------------------------------------------------

// Build a fresh board object with the same key order as existing files.
export function buildBoard({ id, consoleId, revision, confirmedOn = 1, notes, connectors, photos }) {
  const board = { id, consoleId, revision };
  board.confirmedOn = Number(confirmedOn) || 1;
  board.notes = Array.isArray(notes) ? notes : [];
  board.connectors = Array.isArray(connectors) ? connectors : [];
  board.photos = Array.isArray(photos) ? photos : [];
  return board;
}

// Serialize a board to the exact on-disk form: 2-space indent + trailing newline.
export function serializeBoard(board) {
  return JSON.stringify(board, null, 2) + '\n';
}

// Same on-disk form for data/catalog.json.
export function serializeCatalog(catalog) {
  return JSON.stringify(catalog, null, 2) + '\n';
}
