// GitHub Contents API client for the admin panel. The pure helpers (base64, URL,
// payload) are exported separately so they can be unit-tested under node; the thin
// network wrappers at the bottom need a browser fetch + token.

export const API = 'https://api.github.com';

const TOKEN_KEY = 'cdr-admin:token';
const SETTINGS_KEY = 'cdr-admin:settings';

// --- base64 (portable across node and browser) ------------------------------

function hasBuffer() {
  return typeof Buffer !== 'undefined' && !!Buffer.from;
}

function bytesToBin(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return bin;
}

// Encode a utf8 string OR raw bytes to base64. Non-ASCII survives the round-trip.
export function toBase64(strOrBytes) {
  if (hasBuffer()) {
    const buf = strOrBytes instanceof Uint8Array ? Buffer.from(strOrBytes) : Buffer.from(String(strOrBytes), 'utf8');
    return buf.toString('base64');
  }
  const bytes = strOrBytes instanceof Uint8Array ? strOrBytes : new TextEncoder().encode(String(strOrBytes));
  return btoa(bytesToBin(bytes));
}

// Decode base64 to a utf8 string.
export function fromBase64(b64) {
  if (hasBuffer()) return Buffer.from(String(b64), 'base64').toString('utf8');
  const bin = atob(String(b64));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Raw bytes → base64 (for committing binary files like photos).
export function bytesToBase64(bytes) {
  if (hasBuffer()) return Buffer.from(bytes).toString('base64');
  return btoa(bytesToBin(new Uint8Array(bytes)));
}

// --- URL + payload helpers ---------------------------------------------------

// Full Contents-API URL for a repo-relative path, each segment percent-encoded.
export function contentsPath(repo, path) {
  const segs = String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${API}/repos/${repo.owner}/${repo.repo}/contents/${segs}`;
}

// Body for a Contents PUT. `sha` is included only when present (conflict guard).
export function buildCommitPayload(contentB64, message, branch, sha) {
  const payload = { content: contentB64, message, branch };
  if (sha != null) payload.sha = sha;
  return payload;
}

// --- repo detection + token/settings storage ---------------------------------

// Derive the target repo from a Pages URL. loc: { hostname, pathname }.
export function detectRepoFromLocation(loc) {
  const m = /^([a-z0-9][a-z0-9-]*)\.github\.io$/i.exec(String(loc?.hostname || ''));
  if (!m) return null;
  const segs = String(loc?.pathname || '').split('/').filter(Boolean);
  if (!segs.length) return null;
  return { owner: m[1].toLowerCase(), repo: segs[0], branch: 'main' };
}

function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function safeSet(key, val) { try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) {} }

export function getToken() { const t = safeGet(TOKEN_KEY); return t ? t.trim() : ''; }
export function setToken(token) { safeSet(TOKEN_KEY, token && String(token).trim()); }

// Optional override of the detected repo, stored as JSON.
export function getSettings() {
  const raw = safeGet(SETTINGS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}
export function setSettings(settings) { safeSet(SETTINGS_KEY, settings ? JSON.stringify(settings) : null); }

// The effective repo target: a stored override wins over URL detection.
export function resolveRepo(detected) {
  const s = getSettings();
  if (s.owner && s.repo) return { owner: s.owner, repo: s.repo, branch: s.branch || 'main' };
  return detected;
}

// --- network wrappers (browser only) -----------------------------------------

async function gh(path, token, init = {}) {
  const headers = Object.assign(
    { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    init.headers || {},
  );
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body != null) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, Object.assign({}, init, { headers }));
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || `GitHub API ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// GET a file's contents → { content (utf8 string), sha }.
export async function readFile(repo, path, token) {
  const data = await gh(contentsPath(repo, path), token);
  if (!data || typeof data.content !== 'string') throw new Error(`no content for ${path}`);
  return { content: fromBase64(data.content), sha: data.sha };
}

// PUT a text file (utf8). Pass `sha` to guard against concurrent edits.
export async function writeFile(repo, path, contentText, message, branch, token, sha) {
  const payload = buildCommitPayload(toBase64(contentText), message, branch, sha);
  return gh(contentsPath(repo, path), token, { method: 'PUT', body: JSON.stringify(payload) });
}

// PUT a binary file (e.g. a photo). `bytes` is an ArrayBuffer or Uint8Array.
export async function writeBinaryFile(repo, path, bytes, message, branch, token, sha) {
  const payload = buildCommitPayload(bytesToBase64(new Uint8Array(bytes)), message, branch, sha);
  return gh(contentsPath(repo, path), token, { method: 'PUT', body: JSON.stringify(payload) });
}

// DELETE a file. Pass `sha` to guard against concurrent edits.
export async function deleteFile(repo, path, message, branch, token, sha) {
  const q = new URLSearchParams({ message, branch });
  if (sha != null) q.set('sha', String(sha));
  return gh(`${contentsPath(repo, path)}?${q.toString()}`, token, { method: 'DELETE' });
}

// Verify the token can read + push to this repo → { ok, name, push, defaultBranch }.
export async function verifyAccess(repo, token) {
  const data = await gh(`${API}/repos/${repo.owner}/${repo.repo}`, token);
  return {
    ok: true,
    name: data.full_name,
    push: !!(data.permissions && data.permissions.push),
    defaultBranch: data.default_branch || repo.branch,
  };
}
