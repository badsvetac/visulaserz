export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Frame-rate independent exponential smoothing: tau is the time constant in seconds.
export const smoothTo = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)));

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function debounce(fn, ms) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Tiny DOM builder: el('button', { class: 'x', onclick: fn, 'aria-label': 'Y' }, 'text', childNode)
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// iPadOS asks for desktop pages and calls itself a Mac; only the touch points give it away.
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// A phone or tablet: a coarse pointer on a small screen, or a browser that says it is mobile.
// Decides the defaults that keep a phone cool (frame cap, resolution), never what the page can do.
export const isPhone = isIOS || !!navigator.userAgentData?.mobile || /Android|Mobi/i.test(navigator.userAgent)
  || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const safeFilename = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'track';

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`visulaserz:${key}`);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      // a value of another shape than the caller expects (a stored null, an old format) is no value
      if (fallback !== undefined && fallback !== null && (value === null || typeof value !== typeof fallback || Array.isArray(value) !== Array.isArray(fallback))) return fallback;
      return value;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`visulaserz:${key}`, JSON.stringify(value));
    } catch { /* storage may be unavailable (private mode): settings just will not persist */ }
  },
};
