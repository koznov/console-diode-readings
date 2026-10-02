import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../admin/js/api.mjs';

// ---- base64 ---------------------------------------------------------------------

test('toBase64/fromBase64 round-trip ASCII and non-ASCII text', () => {
  for (const s of ['hello', '', 'привет ✓ 0.809']) {
    assert.equal(api.fromBase64(api.toBase64(s)), s);
  }
});

test('toBase64 matches known vectors and accepts raw bytes', () => {
  assert.equal(api.toBase64('hello'), 'aGVsbG8=');
  const pngMagic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
  assert.equal(api.bytesToBase64(pngMagic), 'iVBORw0KGgo=');
  assert.equal(api.toBase64(pngMagic), api.bytesToBase64(pngMagic));
});

// ---- URL + payload ------------------------------------------------------------------

test('contentsPath builds the Contents-API URL with encoded segments', () => {
  const repo = { owner: 'koznov', repo: 'console-diode-readings' };
  assert.equal(
    api.contentsPath(repo, 'data/catalog.json'),
    `${api.API}/repos/koznov/console-diode-readings/contents/data/catalog.json`,
  );
  assert.equal(
    api.contentsPath(repo, 'assets/photos/my photo.png'),
    `${api.API}/repos/koznov/console-diode-readings/contents/assets/photos/my%20photo.png`,
  );
});

test('buildCommitPayload includes sha only when given', () => {
  const p1 = api.buildCommitPayload('aGk=', 'msg', 'main');
  assert.deepEqual(p1, { content: 'aGk=', message: 'msg', branch: 'main' });
  assert.equal('sha' in p1, false);

  const p2 = api.buildCommitPayload('aGk=', 'msg', 'main', 'abc123');
  assert.deepEqual(p2, { content: 'aGk=', message: 'msg', branch: 'main', sha: 'abc123' });
});

// ---- repo detection -------------------------------------------------------------------

test('detectRepoFromLocation reads owner + first path segment from a Pages URL', () => {
  const loc = { hostname: 'koznov.github.io', pathname: '/console-diode-readings/board/ps5' };
  assert.deepEqual(api.detectRepoFromLocation(loc), { owner: 'koznov', repo: 'console-diode-readings', branch: 'main' });
});

test('detectRepoFromLocation lowercases the owner and rejects non-Pages hosts', () => {
  const loc = { hostname: 'Koznov.GitHub.io', pathname: '/my-repo/' };
  assert.deepEqual(api.detectRepoFromLocation(loc), { owner: 'koznov', repo: 'my-repo', branch: 'main' });

  for (const bad of [
    { hostname: 'example.com', pathname: '/console-diode-readings/' },
    { hostname: 'localhost', pathname: '/admin/' },
    { hostname: 'github.io', pathname: '/console-diode-readings/' }, // no owner subdomain
  ]) {
    assert.equal(api.detectRepoFromLocation(bad), null, JSON.stringify(bad));
  }
});

test('detectRepoFromLocation needs a path segment (bare domain is not a repo)', () => {
  for (const pathname of ['', '/']) {
    assert.equal(api.detectRepoFromLocation({ hostname: 'koznov.github.io', pathname }), null);
  }
});

// ---- settings + resolve ------------------------------------------------------------------

test('resolveRepo passes the detected repo through when nothing is stored (node has no localStorage)', () => {
  const detected = { owner: 'koznov', repo: 'console-diode-readings', branch: 'main' };
  assert.deepEqual(api.resolveRepo(detected), detected);
});

test('resolveRepo lets a stored override win and defaults the branch to main', () => {
  const fake = { store: {} };
  globalThis.localStorage = {
    getItem: (k) => (k in fake.store ? fake.store[k] : null),
    setItem: (k, v) => { fake.store[k] = String(v); },
    removeItem: (k) => { delete fake.store[k]; },
  };
  try {
    api.setSettings({ owner: 'other', repo: 'fork' }); // branch omitted → defaults to main
    assert.deepEqual(api.resolveRepo({ owner: 'koznov', repo: 'x', branch: 'main' }),
      { owner: 'other', repo: 'fork', branch: 'main' });

    api.setSettings({ owner: 'other', repo: 'fork', branch: 'dev' });
    assert.equal(api.resolveRepo(null).branch, 'dev');

    api.setSettings(null); // cleared → back to detection
    assert.deepEqual(api.resolveRepo(detectedOf()), detectedOf());
  } finally {
    delete globalThis.localStorage;
  }
});

function detectedOf() { return { owner: 'koznov', repo: 'console-diode-readings', branch: 'main' }; }
