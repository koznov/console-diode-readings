// Boards view: list a console's boards + add one, and the full board editor.
// The editor loads the raw JSON (keeping its blob sha for conflict guarding),
// edits notes in place, delegates connectors to pins.mjs and photos to
// photos.mjs, then commits the whole board with a single validated Save.

import { el, clear } from '../../../js/ui.mjs';
import * as data from '../data.mjs';
import * as api from '../api.mjs';
import { validateBoard } from '../validate.mjs';
import { renderConnectors, finalizeConnectors } from './pins.mjs';
import { renderPhotos } from './photos.mjs';

const CATALOG_PATH = 'data/catalog.json';

// --- list + add -------------------------------------------------------------

export function renderBoards(contentEl, ctx, consoleId) {
  const c = data.findConsole(ctx.catalog, consoleId);
  if (!c) throw new Error(`console "${consoleId}" not found`);
  const boards = c.boards || [];

  contentEl.append(
    el('h1', {}, c.name),
    el('p', { class: 'subtitle' }, `${c.id} · ${boards.length} board${boards.length === 1 ? '' : 's'}`),
  );

  const listCard = el('div', { class: 'card' });
  listCard.append(el('h2', {}, 'Boards'));
  if (!boards.length) {
    listCard.append(el('p', { style: 'color:var(--text-muted)' }, 'No boards yet — add one below.'));
  } else {
    for (const b of boards) {
      listCard.append(
        el('div', { class: 'list-row' }, [
          el('div', { class: 'lr-main' }, [
            el('div', { class: 'lr-title' }, b.id),
            el('div', { class: 'lr-sub' }, `${b.revision ? `rev ${b.revision} · ` : ''}${b.file}`),
          ]),
          el('div', { class: 'lr-actions' }, [
            el('button', { class: 'btn small primary', onclick: () => ctx.navigate({ name: 'board', consoleId, boardId: b.id }) }, 'Open'),
            el('button', { class: 'btn small danger', onclick: () => removeBoard(b) }, 'Delete'),
          ]),
        ]),
      );
    }
  }
  contentEl.append(listCard);

  // --- add board form -------------------------------------------------------
  const errLine = el('div', { class: 'error-msg' });
  const idInput = el('input', { type: 'text', placeholder: 'edm-010' });
  const revInput = el('input', { type: 'text', placeholder: 'EDM-010 (fat)' });
  const addBtn = el('button', { class: 'btn primary' }, 'Add board');

  contentEl.append(
    el('div', { class: 'card' }, [
      el('h2', {}, 'Add a board'),
      errLine,
      el('div', { class: 'row-2' }, [
        field('Board ID', idInput, 'Filesystem-safe; derived from what you type.'),
        field('Revision label', revInput, 'Shown on the site; optional. Leave blank if none.'),
      ]),
      el('div', { class: 'action-bar' }, [addBtn]),
    ]),
  );

  addBtn.addEventListener('click', async () => {
    const boardId = data.slug(idInput.value);
    const revision = revInput.value.trim();
    if (!boardId) { errLine.textContent = 'Board ID is required.'; return; }
    if (boards.some(b => b.id === boardId)) { errLine.textContent = `A board "${boardId}" already exists on this console.`; return; }
    errLine.textContent = '';
    if (!ctx.token) { ctx.toast('Add your GitHub token in Settings first.', 'error'); return; }

    const file = data.defaultBoardFile(consoleId, boardId);
    addBtn.disabled = true;
    try {
      // Board file first (an unreferenced orphan is harmless), then the catalog.
      const newBoard = data.buildBoard({ id: boardId, consoleId, revision });
      await api.writeFile(ctx.repo, file, data.serializeBoard(newBoard), `Add board ${boardId} to ${consoleId}`, ctx.repo.branch, ctx.token);
      const next = data.addBoardToCatalog(ctx.catalog, consoleId, { id: boardId, revision, file });
      await api.writeFile(ctx.repo, CATALOG_PATH, data.serializeCatalog(next), `Register board ${boardId} on ${consoleId}`, ctx.repo.branch, ctx.token);
      ctx.toast(`Added "${boardId}".`, 'success');
      ctx.navigate({ name: 'board', consoleId, boardId });
    } catch (e) {
      errLine.textContent = e.message;
      addBtn.disabled = false;
    }
  });

  async function removeBoard(b) {
    if (!ctx.confirm(`Delete board "${b.id}"? This removes it from the catalog and deletes ${b.file}.`)) return;
    if (!ctx.token) { ctx.toast('Add your GitHub token in Settings first.', 'error'); return; }
    try {
      const { catalog: next, file } = data.removeBoardFromCatalog(ctx.catalog, consoleId, b.id);
      await api.writeFile(ctx.repo, CATALOG_PATH, data.serializeCatalog(next), `Remove board ${b.id} from ${consoleId}`, ctx.repo.branch, ctx.token);
      try { await api.deleteFile(ctx.repo, file, `Delete board file for removed board ${b.id}`, ctx.repo.branch, ctx.token); }
      catch (e) { ctx.toast(`Board removed from catalog, but could not delete ${file}: ${e.message}`, 'error'); return; }
      ctx.toast('Board removed.', 'success');
      await ctx.refreshCatalog();
    } catch (e) {
      ctx.toast(e.message, 'error');
    }
  }

  function field(labelText, input, hint) {
    const kids = [el('label', {}, labelText), input];
    if (hint) kids.push(el('div', { class: 'hint' }, hint));
    return el('div', { class: 'field' }, kids);
  }
}

// --- editor -----------------------------------------------------------------

export function renderBoardEditor(contentEl, ctx, consoleId, boardId) {
  (async () => {
    try {
      const c = data.findConsole(ctx.catalog, consoleId);
      if (!c) throw new Error(`console "${consoleId}" not found`);
      const entry = (c.boards || []).find(b => b.id === boardId);
      if (!entry) throw new Error(`board "${boardId}" not found on ${consoleId}`);

      // Load raw content + blob sha. Contents API when authenticated (gives the
      // sha for conflict guarding); otherwise fall back to the static copy.
      let text, sha;
      if (ctx.token) {
        const r = await api.readFile(ctx.repo, entry.file, ctx.token);
        text = r.content; sha = r.sha;
      } else {
        const res = await fetch(data.toBrowser(entry.file));
        if (!res.ok) throw new Error(`could not load board file (${res.status})`);
        text = await res.text();
      }
      let board;
      try { board = JSON.parse(text); } catch (e) { throw new Error('board file is not valid JSON'); }

      buildEditor(contentEl, ctx, c, entry, board, sha);
    } catch (e) {
      clear(contentEl);
      contentEl.append(
        el('div', { class: 'card' }, [
          el('h2', {}, 'Could not open board'),
          el('p', { style: 'color:var(--accent-mark)' }, e.message),
          el('p', { style: 'color:var(--text-muted)' },
            'If you just added this board, make sure it is registered in the catalog and its file exists.'),
        ]),
      );
    }
  })();

  function buildEditor(contentEl, ctx, c, entry, board, sha) {
    clear(contentEl);

    // Header: title + editable revision.
    const revInput = el('input', { type: 'text', value: board.revision || '' });
    revInput.addEventListener('input', () => { board.revision = revInput.value.trim(); });

    contentEl.append(
      el('h1', {}, board.id),
      el('p', { class: 'subtitle' }, `${c.name} · ${entry.file}`),
      el('div', { class: 'card' }, [
        el('div', { class: 'row-2' }, [
          field('Revision label', revInput, 'Shown on the site; optional.'),
        ]),
      ]),
    );

    // Notes (one per line).
    const notesArea = el('textarea', { placeholder: 'One note per line…' });
    notesArea.value = (board.notes || []).join('\n');
    notesArea.addEventListener('input', () => {
      board.notes = notesArea.value.split('\n').map(s => s.trim()).filter(Boolean);
    });
    contentEl.append(
      el('div', { class: 'card' }, [el('h2', {}, 'Notes'), notesArea]),
    );

    // Connectors + photos (each mutates `board` in place and re-renders itself).
    const connHost = el('div');
    contentEl.append(el('div', { class: 'card' }, [el('h2', {}, 'Connectors'), connHost]));
    renderConnectors(connHost, ctx, board);

    const photoHost = el('div');
    contentEl.append(el('div', { class: 'card' }, [el('h2', {}, 'Photos'), photoHost]));
    renderPhotos(photoHost, ctx, board);

    // Single Save validates the whole board, then commits it with its sha.
    const saveBtn = el('button', { class: 'btn primary' }, 'Save board');
    contentEl.append(
      el('div', { class: 'card action-bar' }, [
        el('span', { style: 'color:var(--text-muted); font-size:0.85rem' },
          'Saving commits the whole board file (connectors, notes and photo references).'),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn small', onclick: () => ctx.navigate({ name: 'boards', consoleId }) }, 'Back to boards'),
        saveBtn,
      ]),
    );

    saveBtn.addEventListener('click', async () => {
      finalizeConnectors(board); // drop unmeasured pins, normalize "ol" → "OL"
      const errors = validateBoard(board);
      if (errors.length) {
        ctx.toast(errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more)` : ''), 'error');
        return;
      }
      if (!ctx.token) { ctx.toast('Add your GitHub token in Settings first.', 'error'); return; }
      saveBtn.disabled = true;
      try {
        await api.writeFile(ctx.repo, entry.file, data.serializeBoard(board), `Update board ${board.id}`, ctx.repo.branch, ctx.token, sha);
        ctx.toast('Board saved.', 'success');
        ctx.navigate({ name: 'board', consoleId, boardId }); // reload → fresh sha
      } catch (e) {
        if (e.status === 409) ctx.toast('The file changed since you opened it. Reload and re-apply your edits.', 'error');
        else ctx.toast(e.message, 'error');
        saveBtn.disabled = false;
      }
    });

    function field(labelText, input, hint) {
      const kids = [el('label', {}, labelText), input];
      if (hint) kids.push(el('div', { class: 'hint' }, hint));
      return el('div', { class: 'field' }, kids);
    }
  }
}
