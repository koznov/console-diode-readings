// Photo manager for a board: list existing photos (with inline caption editing)
// and add new ones. A new photo's bytes are committed to the repo immediately on
// "Add photo" (assets/photos/<boardId>/<name>); its reference is pushed into
// board.photos in memory and lands with the next "Save board". Deleting a photo
// removes only the reference — the image file stays in the repo.

import { el, clear } from '../../../js/ui.mjs';
import * as data from '../data.mjs';
import * as api from '../api.mjs';

export function renderPhotos(hostEl, ctx, board) {
  if (!Array.isArray(board.photos)) board.photos = [];

  const listHost = el('div');
  hostEl.append(listHost);

  // --- add-photo flow -------------------------------------------------------
  let pending = null; // { name, bytes, url, size:[w,h]|null, anchors:{} }
  const pendingHost = el('div');
  const fileInput = el('input', { type: 'file', accept: 'image/*' });

  hostEl.append(
    el('div', { class: 'action-bar' }, [
      fileInput,
      el('span', { style: 'color:var(--text-muted); font-size:0.82rem' },
        'Pick an image, click it to drop pin anchors, then add.'),
    ]),
    pendingHost,
  );

  function drawList() {
    clear(listHost);
    if (!board.photos.length) {
      listHost.append(el('p', { style: 'color:var(--text-muted)' }, 'No photos yet.'));
      return;
    }
    board.photos.forEach((raw, i) => listHost.append(photoRow(raw, i)));
  }

  function photoRow(raw, index) {
    // Bare-string entries are valid on the site but fail admin validation —
    // promote them to object form in place so Save can proceed.
    if (typeof raw === 'string') board.photos[index] = { src: raw };
    const p = board.photos[index];

    const thumb = el('img', { class: 'photo-thumb', src: data.toBrowser(p.src), alt: '' });
    const capInput = el('input', { type: 'text', value: p.caption || '', placeholder: 'Caption (optional)' });
    capInput.addEventListener('input', () => {
      if (capInput.value.trim()) p.caption = capInput.value.trim();
      else delete p.caption;
    });

    const nAnchors = p.anchors ? Object.keys(p.anchors).length : 0;
    const sizeTxt = Array.isArray(p.size) && p.size.length === 2 ? ` · ${p.size[0]}×${p.size[1]}` : '';
    const anchorTxt = nAnchors ? ` · ${nAnchors} pin anchor${nAnchors === 1 ? '' : 's'}` : '';

    return el('div', { class: 'list-row' }, [
      thumb,
      el('div', { class: 'lr-main' }, [
        capInput,
        el('div', { class: 'lr-sub' }, `${p.src}${sizeTxt}${anchorTxt}`),
      ]),
      el('div', { class: 'lr-actions' }, [
        el('button', { class: 'btn small danger', onclick: () => removePhoto(index) }, 'Delete'),
      ]),
    ]);
  }

  function removePhoto(index) {
    const p = board.photos[index];
    if (!ctx.confirm(`Remove this photo from the board? The image file stays in the repo.`)) return;
    board.photos.splice(index, 1);
    drawList();
  }

  // --- pending (new) photo --------------------------------------------------

  function resetPending() {
    if (pending && pending.url) URL.revokeObjectURL(pending.url);
    pending = null;
    clear(pendingHost);
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ''; // allow re-picking the same file
    if (!file) return;
    resetPending();
    try {
      pending = { name: file.name, bytes: await file.arrayBuffer(), url: URL.createObjectURL(file), size: null, anchors: {} };
    } catch (e) {
      ctx.toast(`Could not read ${file.name}: ${e.message}`, 'error');
      return;
    }
    buildPendingCard();
  });

  function buildPendingCard() {
    clear(pendingHost);

    const img = el('img', { src: pending.url, alt: '' });
    const markers = el('div');
    const stage = el('div', { class: 'photo-stage' }, [img, markers]);

    img.addEventListener('load', () => {
      pending.size = [img.naturalWidth, img.naturalHeight];
      sizeHint.textContent = `${pending.size[0]}×${pending.size[1]}`;
      addBtn.disabled = false;
    });

    stage.addEventListener('click', (e) => {
      if (e.target !== img || !pending.size) return;
      const pin = Number(pinInput.value);
      if (!Number.isInteger(pin) || pin < 1) {
        ctx.toast('Enter a pin number first, then click the photo.', 'error');
        return;
      }
      const rect = img.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * pending.size[0] * 10) / 10;
      const y = Math.round(((e.clientY - rect.top) / rect.height) * pending.size[1] * 10) / 10;
      pending.anchors[String(pin)] = [x, y]; // re-clicking a pin moves its anchor
      drawMarkers();
    });

    function drawMarkers() {
      clear(markers);
      for (const [pin, pos] of Object.entries(pending.anchors)) {
        const m = el('div', { class: 'anchor-marker' }, pin);
        m.style.left = `${(pos[0] / pending.size[0]) * 100}%`;
        m.style.top = `${(pos[1] / pending.size[1]) * 100}%`;
        markers.append(m);
      }
    }

    const pinInput = el('input', { type: 'number', min: '1', placeholder: 'pin #', style: 'width:72px' });
    const captionInput = el('input', { type: 'text', placeholder: 'Caption (optional)' });
    const sizeHint = el('span', { class: 'hint' }, '…');
    const addBtn = el('button', { class: 'btn primary', disabled: true }, 'Add photo');
    const cancelBtn = el('button', { class: 'btn small', onclick: resetPending }, 'Cancel');

    pendingHost.append(
      el('div', { class: 'card' }, [
        stage,
        el('div', { class: 'photo-tools' }, [
          pinInput,
          captionInput,
          sizeHint,
          el('span', { class: 'spacer' }),
          cancelBtn,
          addBtn,
        ]),
        el('div', { class: 'hint' },
          'Click the photo to drop an anchor for the entered pin. The image is committed now; its reference is saved with "Save board".'),
      ]),
    );

    addBtn.addEventListener('click', async () => {
      if (!ctx.token) { ctx.toast('Add your GitHub token in Settings first.', 'error'); return; }
      addBtn.disabled = true;
      try {
        const path = `assets/photos/${board.id}/${photoFileName(pending.name)}`;
        await api.writeBinaryFile(ctx.repo, path, pending.bytes, `Add photo for ${board.id}`, ctx.repo.branch, ctx.token);
        const entry = { src: path };
        if (captionInput.value.trim()) entry.caption = captionInput.value.trim();
        if (pending.size) entry.size = [pending.size[0], pending.size[1]];
        if (Object.keys(pending.anchors).length) entry.anchors = pending.anchors;
        board.photos.push(entry);
        ctx.toast('Photo committed — press "Save board" to attach it.', 'success');
        resetPending();
        drawList();
      } catch (e) {
        ctx.toast(e.message, 'error');
        addBtn.disabled = false;
      }
    });
  }

  // Filesystem-safe photo name: slug the base, keep a lowercase extension.
  function photoFileName(name) {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    const ext = (m ? m[1] : 'png').toLowerCase();
    const base = data.slug(String(name || '').replace(/\.[^.]*$/, '')) || 'photo';
    return `${base}.${ext}`;
  }

  drawList();
}
