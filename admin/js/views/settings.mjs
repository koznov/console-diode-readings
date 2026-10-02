// Settings view: the GitHub token (stored in localStorage, sent only to
// api.github.com) and an optional override of the auto-detected target repo.

import { el, clear } from '../../../js/ui.mjs';
import * as api from '../api.mjs';

export function renderSettings(contentEl, ctx) {
  contentEl.append(
    el('h1', {}, 'Settings'),
    el('p', { class: 'subtitle' }, 'Connection to the GitHub repo this panel edits.'),
  );

  // --- token -----------------------------------------------------------------
  const statusLine = el('div', { class: 'hint' });
  const tokenInput = el('input', { type: 'password', value: ctx.token, placeholder: 'ghp_… or github_pat_… (fine-grained)' });
  const saveTokenBtn = el('button', { class: 'btn primary' }, 'Save token');
  const verifyBtn = el('button', { class: 'btn' }, 'Verify access');

  contentEl.append(
    el('div', { class: 'card' }, [
      el('h2', {}, 'GitHub token'),
      el('div', { class: 'field' }, [
        el('label', {}, 'Personal access token'),
        tokenInput,
        el('div', { class: 'hint' },
          'Use a fine-grained token with Contents: Read and write on this repo only. It is stored in your browser (localStorage) and sent only to api.github.com.'),
      ]),
      el('div', { class: 'action-bar' }, [saveTokenBtn, verifyBtn]),
      statusLine,
    ]),
  );

  function setStatus(text, kind = '') {
    clear(statusLine);
    if (!text) return;
    const color = kind === 'error' ? 'var(--accent-mark)' : kind === 'ok' ? '#16a34a' : 'var(--text-muted)';
    statusLine.append(el('span', { style: `color:${color}; font-size:0.85rem` }, text));
  }

  saveTokenBtn.addEventListener('click', () => {
    ctx.setToken(tokenInput.value);
    setStatus(ctx.token ? 'Token saved.' : 'Token cleared.', ctx.token ? 'ok' : '');
  });

  verifyBtn.addEventListener('click', async () => {
    if (!ctx.token) { setStatus('Save a token first.', 'error'); return; }
    verifyBtn.disabled = true;
    setStatus('Checking…');
    try {
      const v = await api.verifyAccess(ctx.repo, ctx.token);
      if (v.push) setStatus(`Connected to ${v.name} — push OK (default branch: ${v.defaultBranch}).`, 'ok');
      else setStatus(`Can read ${v.name}, but the token has no push permission.`, 'error');
    } catch (e) {
      setStatus(e.message, 'error');
    } finally {
      verifyBtn.disabled = false;
    }
  });

  // --- repo override ---------------------------------------------------------
  const detected = ctx.detected || {};
  const stored = api.getSettings();
  const ownerInput = el('input', { type: 'text', value: stored.owner || '', placeholder: detected.owner || '' });
  const repoInput = el('input', { type: 'text', value: stored.repo || '', placeholder: detected.repo || '' });
  const branchInput = el('input', { type: 'text', value: stored.branch || '', placeholder: detected.branch || 'main' });

  contentEl.append(
    el('div', { class: 'card' }, [
      el('h2', {}, 'Target repository'),
      el('p', { style: 'color:var(--text-muted); font-size:0.85rem; margin-top:0' },
        `Auto-detected from the page URL: ${detected.owner ? `${detected.owner}/${detected.repo} @ ${detected.branch}` : 'unknown (not on *.github.io)'}. Fill in fields to override.`),
      el('div', { class: 'row-3' }, [
        field('Owner', ownerInput),
        field('Repository', repoInput),
        field('Branch', branchInput, 'Where commits land; Pages deploys from it.'),
      ]),
      el('div', { class: 'action-bar' }, [
        el('button', { class: 'btn primary', onclick: saveRepo }, 'Save'),
        el('button', { class: 'btn small', onclick: resetRepo }, 'Reset to auto-detect'),
      ]),
    ]),
  );

  function saveRepo() {
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();
    if (owner && !repo) { ctx.toast('Repository name is required when overriding the owner.', 'error'); return; }
    api.setSettings(owner ? { owner, repo, branch: branchInput.value.trim() || 'main' } : null);
    ctx.applySettings();
    const r = ctx.repo;
    ctx.toast(`Target: ${r.owner}/${r.repo} @ ${r.branch}`, 'success');
  }

  function resetRepo() {
    api.setSettings(null);
    ctx.applySettings();
    ownerInput.value = ''; repoInput.value = ''; branchInput.value = '';
    const r = ctx.repo;
    ctx.toast(`Back to auto-detect: ${r.owner}/${r.repo} @ ${r.branch}`, 'success');
  }

  function field(labelText, input, hint) {
    const kids = [el('label', {}, labelText), input];
    if (hint) kids.push(el('div', { class: 'hint' }, hint));
    return el('div', { class: 'field' }, kids);
  }
}
