// Admin panel bootstrap: load the catalog, wire the sidebar + breadcrumb, and
// route between views. All view content lives in js/views/*.mjs; this file owns
// navigation, toasts, and the shared context handed to every view.

import { el, clear } from '../../js/ui.mjs';
import * as data from './data.mjs';
import * as api from './api.mjs';
import { renderConsoles } from './views/consoles.mjs';
import { renderBoards, renderBoardEditor } from './views/boards.mjs';
import { renderSettings } from './views/settings.mjs';

const navEl = document.getElementById('nav');
const crumbsEl = document.getElementById('crumbs');
const contentEl = document.getElementById('content');
const toastsEl = document.getElementById('toasts');

// --- shared state -----------------------------------------------------------

const state = {
  catalog: null,      // in-memory copy of data/catalog.json
  detected: null,     // repo derived from the Pages URL (before any override)
  repo: null,         // resolved target repo { owner, repo, branch }
  token: '',          // PAT from localStorage ('' if unset)
};

function toast(message, kind = 'info') {
  const t = el('div', { class: `toast ${kind}` }, message);
  toastsEl.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3500);
}

// The context every view receives. Views mutate the in-memory catalog and call
// back through these helpers to persist + refresh.
const ctx = {
  get catalog() { return state.catalog; },
  get detected() { return state.detected; },
  get repo() { return state.repo; },
  get token() { return state.token; },

  toast,
  confirm: (msg) => window.confirm(msg),

  // Persist the PAT and update in-memory state so views see it without a reload.
  setToken(token) { api.setToken(token); state.token = token ? String(token).trim() : ''; },

  // Re-resolve the target repo after Settings changes the stored override.
  applySettings() { state.repo = api.resolveRepo(state.detected); },

  // Re-fetch the catalog from disk and re-render the current route.
  async refreshCatalog() {
    state.catalog = await loadCatalog();
    buildNav(currentRoute);
    render(currentRoute);
  },

  navigate(route) {
    currentRoute = route;
    buildNav(route);
    render(route);
  },
};

// --- navigation -------------------------------------------------------------

let currentRoute = { name: 'consoles' };

function setCrumbs(items) {
  clear(crumbsEl);
  items.forEach((it, i) => {
    if (i > 0) crumbsEl.append(el('span', { class: 'sep' }, '/'));
    if (it.href != null && it.route) {
      const a = el('a', { href: '#' }, it.label);
      a.addEventListener('click', (e) => { e.preventDefault(); ctx.navigate(it.route); });
      crumbsEl.append(a);
    } else {
      crumbsEl.append(el('span', {}, it.label));
    }
  });
}

function buildNav(route) {
  clear(navEl);
  navEl.append(el('div', { class: 'nav-brand' }, 'Console Diode Readings'));
  const items = [
    { label: 'Consoles', route: { name: 'consoles' } },
    { label: 'Settings', route: { name: 'settings' } },
  ];
  for (const it of items) {
    const active = route.name === it.route.name;
    const b = el('button', { class: `nav-item${active ? ' active' : ''}` }, it.label);
    b.addEventListener('click', () => ctx.navigate(it.route));
    navEl.append(b);
  }
}

function render(route) {
  clear(contentEl);
  const busy = el('div', {}, 'Loading…');
  contentEl.append(busy);

  (async () => {
    try {
      if (route.name === 'consoles') {
        setCrumbs([{ label: 'Consoles' }]);
        renderConsoles(contentEl, ctx);
      } else if (route.name === 'boards') {
        const c = data.findConsole(state.catalog, route.consoleId);
        setCrumbs([
          { label: 'Consoles', route: { name: 'consoles' } },
          { label: c ? c.name : route.consoleId },
        ]);
        renderBoards(contentEl, ctx, route.consoleId);
      } else if (route.name === 'board') {
        const c = data.findConsole(state.catalog, route.consoleId);
        setCrumbs([
          { label: 'Consoles', route: { name: 'consoles' } },
          { label: c ? c.name : route.consoleId, route: { name: 'boards', consoleId: route.consoleId } },
          { label: route.boardId },
        ]);
        renderBoardEditor(contentEl, ctx, route.consoleId, route.boardId);
      } else if (route.name === 'settings') {
        setCrumbs([{ label: 'Settings' }]);
        renderSettings(contentEl, ctx);
      } else {
        throw new Error(`unknown route "${route.name}"`);
      }
    } catch (e) {
      clear(contentEl);
      contentEl.append(el('div', { class: 'card' }, [
        el('h2', {}, 'Could not load'),
        el('p', { style: 'color:var(--accent-mark)' }, e.message),
      ]));
    } finally {
      busy.remove();
    }
  })();
}

// --- bootstrap --------------------------------------------------------------

async function loadCatalog() {
  const res = await fetch(data.toBrowser('data/catalog.json'));
  if (!res.ok) throw new Error(`could not load catalog (${res.status})`);
  const c = await res.json();
  if (!c || !Array.isArray(c.consoles)) throw new Error('catalog.consoles is not an array');
  return c;
}

async function init() {
  state.detected = api.detectRepoFromLocation(location);
  state.repo = api.resolveRepo(state.detected);
  state.token = api.getToken();
  try {
    state.catalog = await loadCatalog();
  } catch (e) {
    contentEl.innerHTML = '';
    contentEl.append(el('div', { class: 'card' }, [
      el('h2', {}, 'Could not start'),
      el('p', {}, e.message),
      el('p', { style: 'color:var(--text-muted)' },
        'Make sure the site is served from GitHub Pages and data/catalog.json exists.'),
    ]));
    return;
  }
  buildNav(currentRoute);
  render(currentRoute);
}

init();
