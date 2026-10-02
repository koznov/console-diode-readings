// Consoles view: list every console and add / edit / delete them. Catalog
// changes are committed to data/catalog.json through the GitHub Contents API.

import { el, clear } from '../../../js/ui.mjs';
import * as data from '../data.mjs';
import * as api from '../api.mjs';
import { validateConsole } from '../validate.mjs';

const CATALOG_PATH = 'data/catalog.json';

export function renderConsoles(contentEl, ctx) {
  const consoles = ctx.catalog.consoles || [];

  contentEl.append(
    el('h1', {}, 'Consoles'),
    el('p', { class: 'subtitle' }, `${consoles.length} console${consoles.length === 1 ? '' : 's'} in the catalog.`),
  );

  // --- list -----------------------------------------------------------------
  const listCard = el('div', { class: 'card' });
  listCard.append(el('h2', {}, 'All consoles'));
  if (!consoles.length) {
    listCard.append(el('p', { style: 'color:var(--text-muted)' }, 'No consoles yet — add one below.'));
  } else {
    for (const c of consoles) {
      const n = (c.boards || []).length;
      listCard.append(
        el('div', { class: 'list-row' }, [
          el('div', { class: 'lr-main' }, [
            el('div', { class: 'lr-title' }, c.name),
            el('div', { class: 'lr-sub' }, `${c.id} · ${n} board${n === 1 ? '' : 's'}`),
          ]),
          el('div', { class: 'lr-actions' }, [
            el('button', { class: 'btn small primary', onclick: () => ctx.navigate({ name: 'boards', consoleId: c.id }) }, 'Boards'),
            el('button', { class: 'btn small', onclick: () => buildForm(c) }, 'Edit'),
            el('button', { class: 'btn small danger', onclick: () => removeConsole(c) }, 'Delete'),
          ]),
        ]),
      );
    }
  }
  contentEl.append(listCard);

  // --- add / edit form ------------------------------------------------------
  const formTitle = el('h2');
  const formBody = el('div');
  const formCard = el('div', { class: 'card' }, [formTitle, formBody]);
  contentEl.append(formCard);
  buildForm(null);

  function buildForm(consoleObj) {
    clear(formBody);
    const isEdit = !!consoleObj;
    clear(formTitle);
    formTitle.append(isEdit ? `Edit ${consoleObj.name}` : 'Add a console');

    const errLine = el('div', { class: 'error-msg' });
    const idInput = el('input', { type: 'text', value: isEdit ? consoleObj.id : '', placeholder: 'ps5', disabled: isEdit || null });
    const brandInput = el('input', { type: 'text', value: isEdit ? consoleObj.brand : '', placeholder: 'Sony' });
    const familyInput = el('input', { type: 'text', value: isEdit ? consoleObj.family : '', placeholder: 'PlayStation 5' });
    const nameInput = el('input', { type: 'text', value: isEdit ? consoleObj.name : '', placeholder: 'PS5 (fat, EDM-010)' });

    formBody.append(
      errLine,
      el('div', { class: 'row-2' }, [
        field('ID', idInput, isEdit ? null : 'Filesystem-safe; derived from what you type.'),
        field('Brand', brandInput),
      ]),
      el('div', { class: 'row-2' }, [
        field('Family', familyInput),
        field('Display name', nameInput),
      ]),
    );

    const saveBtn = el('button', { class: 'btn primary' }, isEdit ? 'Save changes' : 'Add console');
    const actions = el('div', { class: 'action-bar' }, [saveBtn]);
    if (isEdit) actions.append(el('button', { class: 'btn small', onclick: () => buildForm(null) }, 'Cancel'));
    formBody.append(actions);

    saveBtn.addEventListener('click', async () => {
      const id = isEdit ? consoleObj.id : data.slug(idInput.value);
      const obj = { id, brand: brandInput.value.trim(), family: familyInput.value.trim(), name: nameInput.value.trim() };
      const errors = validateConsole(obj);
      if (errors.length) { errLine.textContent = errors.join('  ·  '); return; }
      errLine.textContent = '';

      if (!ctx.token) { ctx.toast('Add your GitHub token in Settings first.', 'error'); return; }
      saveBtn.disabled = true;
      try {
        const next = isEdit
          ? data.updateConsoleInCatalog(ctx.catalog, id, obj)
          : data.addConsoleToCatalog(ctx.catalog, obj);
        await api.writeFile(ctx.repo, CATALOG_PATH, data.serializeCatalog(next),
          `${isEdit ? 'Update' : 'Add'} console ${id}`, ctx.repo.branch, ctx.token);
        ctx.toast(isEdit ? 'Console updated.' : `Added "${obj.name}".`, 'success');
        await ctx.refreshCatalog();
      } catch (e) {
        errLine.textContent = e.message;
        saveBtn.disabled = false;
      }
    });
  }

  async function removeConsole(c) {
    const boards = c.boards || [];
    const what = boards.length ? ` and deletes ${boards.length} board file(s)` : '';
    if (!ctx.confirm(`Delete "${c.name}"? This removes it from the catalog${what}.`)) return;
    if (!ctx.token) { ctx.toast('Add your GitHub token in Settings first.', 'error'); return; }

    try {
      const { catalog: next, files } = data.removeConsoleFromCatalog(ctx.catalog, c.id);
      await api.writeFile(ctx.repo, CATALOG_PATH, data.serializeCatalog(next), `Remove console ${c.id}`, ctx.repo.branch, ctx.token);
      const failed = [];
      for (const f of files) {
        try { await api.deleteFile(ctx.repo, f, `Remove board file for deleted console ${c.id}`, ctx.repo.branch, ctx.token); }
        catch (e) { failed.push(f); }
      }
      if (failed.length) ctx.toast(`Catalog updated, but could not delete: ${failed.join(', ')}`, 'error');
      else ctx.toast('Console removed.', 'success');
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
