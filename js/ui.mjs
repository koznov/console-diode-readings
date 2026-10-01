// Small DOM helpers shared by app.mjs and pinmap.mjs.

export function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null) continue;
    n.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return n;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
