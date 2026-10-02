# Web Admin Panel Design (Static / GitHub Pages)

**Date:** 2026-10-02
**Status:** Approved
**Author:** Claude (with user input)

## Overview

A static web admin panel that runs entirely on **GitHub Pages** — no server. The
owner edits console, board, pin and photo data through a browser UI; every change
is committed directly back into this repository via the **GitHub Contents API**,
using the owner's personal access token. Because the site is served from `main`,
each commit updates the live site automatically.

## Why static

The earlier design in this file assumed an Express API backend, which cannot run on
`github.io` (static hosting only). This redesign removes all server-side code and
persists edits by committing files to the repo **from the browser**. The GitHub REST
API accepts authenticated cross-origin requests from a browser, so no proxy or
server is needed.

## Goals / success criteria

- Owner can add, edit and delete consoles and boards.
- Owner can edit pin values and notes for any connector on a board.
- Owner can upload a board photo and annotate it with two click-placed pin anchors,
  producing exactly the `photos[]` shape the main site already renders.
- All writes target the existing JSON files / PNG assets; the main site needs **no**
  changes to consume them.
- No build step, no runtime dependencies — deploying is just committing static files
  under `admin/`.

## Non-goals (v1)

- Multi-user auth or roles (owner-only).
- Concurrent-edit locking beyond a blob-`sha` conflict warning.
- Bulk import/export and version-history UI.

## Architecture & file layout

```
admin/
├── index.html          # SPA shell: sidebar nav + breadcrumb + content + toasts
├── admin.css           # theme tokens (mirror css/style.css) + layout + forms
└── js/
    ├── main.mjs        # bootstrap: load catalog, wire nav, route between views
    ├── api.mjs         # GitHub Contents API client, token + repo detection
    ├── data.mjs        # path mapping + pure model transforms (catalog ↔ files)
    ├── validate.mjs    # schema validation mirroring js/loader.mjs rules
    └── views/
        ├── consoles.mjs  # console list / add / edit / delete
        ├── boards.mjs    # board list / add / open editor (per console)
        ├── pins.mjs      # connector + pin value/note table for a board
        └── photos.mjs    # photo upload + click-to-place anchor annotation
```

The panel reuses the main site's pure modules by relative import — no new
dependencies, no bundler:

- `parseValue` from `../../js/values.mjs`
- `padPositions` from `../../js/photo.mjs`
- `HDMI_PIN_COUNT`, `resolveSignalClass` from `../../js/signals.mjs`
- DOM helpers `el`, `escapeHtml`, `clear` from `../../js/ui.mjs`

## Data model (unchanged)

The panel reads and writes the existing files; it does not invent a new format.

- `data/catalog.json`:
  `{ "consoles": [ { id, brand, family, name, boards: [ {id, revision, file} ] } ] }`.
  The temporary `adminApi` block is removed — there is no API server anymore.
- `data/consoles/<file>`: a board object with `connectors[]` (each carrying
  `measurement.pins[]`) and `photos[]`, exactly as the main site's `js/loader.mjs`
  consumes it.
- Photos live under `assets/photos/<boardId>/<name>.<ext>`.

New board files are named `<consoleId>-<boardId>.json` (sanitised) under
`data/consoles/`; the resulting path is stored in the catalog entry, which remains
the single source of truth for file locations.

## GitHub identity & auth

- **Repo target** auto-detected from the Pages URL: hostname `<owner>.github.io`,
  first path segment = repo name; default branch `main`. Overridable via a Settings
  view (stored in `localStorage`).
- The owner pastes a **fine-grained PAT** (this repository, *Contents* read/write)
  once into Settings. It is stored in `localStorage` under `cdr-admin:token` and sent
  only to `api.github.com`.
- When the token is saved we call `GET /repos/{owner}/{repo}` and check
  `permissions.push` to confirm write access before trusting it.

## Data flow

**Read:** fetch `../data/catalog.json`; when a board is opened, fetch its file
(`../<file>`). Browser paths are the repo-relative path prefixed with `../`.

**Write** — one commit per changed path via the Contents API:

- Edit pins / notes / photo metadata → rewrite the board JSON
  (`PUT /repos/{o}/{r}/contents/<file>`), passing the current blob `sha` so a
  concurrent change is not clobbered.
- Add a photo → `PUT` the image bytes to `assets/photos/…`, then (on Save) `PUT` the
  updated board JSON that references it.
- Add a board / console → create file(s), then update `catalog.json`.
- Delete a board / console → `DELETE` file(s) (with their `sha`), then update
  `catalog.json`.

## Validation & error handling

Validation mirrors `js/loader.mjs` so the panel cannot commit what the site would
reject: pin number within `pinCount`, value parseable by `parseValue`, and a photo
that carries anchors must have a positive `[width, height]` size and exactly two
distinct pins (checked with `padPositions`). Invalid fields are highlighted inline
and block saving.

API errors surface as toasts carrying GitHub's message; a 409 (blob-`sha` mismatch)
prompts a reload instead of overwriting the newer file.

## Testing

`node --test test/`. Unit tests cover the pure logic: path mapping, catalog/board
model transforms, validation rules, and the base64 / URL / payload helpers in
`api.mjs`. DOM views and live network calls are exercised manually against the repo.
New files: `test/admin-data.test.mjs`, `test/admin-validate.test.mjs`,
`test/admin-api.test.mjs`.

## Deploy & cleanup

Deploy = commit static files under `admin/`; Pages serves `/admin/` from `main`.
Remove the server approach as part of this change: delete `api/`, replace the
abandoned React/Vite scaffold in `admin/`, and drop the `adminApi` block from
`catalog.json`.
