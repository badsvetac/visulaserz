// The Studio's small parts: icons, popup menus, knobs that report to the hint bar, a number you
// drag up and down (the tempo, an insert), and the window manager that keeps the floating
// windows (channel rack, piano roll, mixer, plugins) inside the workspace, the way FL keeps its.

const PATHS = {
  play: '<path d="M4 2.5v11l9-5.5z" fill="currentColor"/>',
  stop: '<rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor"/>',
  rec: '<circle cx="8" cy="8" r="4.6" fill="currentColor"/>',
  playlist: '<path d="M2 3h12M2 6.5h7M2 10h12M2 13.5h5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="10" y="5" width="4" height="3" fill="currentColor"/>',
  rack: '<g fill="currentColor"><rect x="2" y="3" width="3" height="2.4"/><rect x="6" y="3" width="2" height="2.4"/><rect x="9" y="3" width="2" height="2.4"/><rect x="12" y="3" width="2" height="2.4"/><rect x="2" y="6.8" width="3" height="2.4"/><rect x="6" y="6.8" width="2" height="2.4"/><rect x="12" y="6.8" width="2" height="2.4"/><rect x="2" y="10.6" width="3" height="2.4"/><rect x="9" y="10.6" width="2" height="2.4"/></g>',
  roll: '<g fill="currentColor"><rect x="2" y="2" width="3" height="12" opacity=".5"/><rect x="7" y="4" width="4" height="2"/><rect x="9" y="8" width="5" height="2"/><rect x="6" y="11" width="3" height="2"/></g>',
  mixer: '<g stroke="currentColor" stroke-width="1.5"><path d="M4 2v12M8 2v12M12 2v12"/></g><g fill="currentColor"><rect x="2.4" y="8" width="3.2" height="2.2"/><rect x="6.4" y="4" width="3.2" height="2.2"/><rect x="10.4" y="10" width="3.2" height="2.2"/></g>',
  browser: '<path d="M2 3.5h4l1.5 1.5H14v8H2z" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  pads: '<g fill="currentColor"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1" opacity=".5"/></g>',
  metro: '<path d="M5.5 2h5l2.5 12H3z" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 11l3.5-6.5" stroke="currentColor" stroke-width="1.4"/>',
  keys: '<rect x="1.5" y="4" width="13" height="8" rx="1" stroke="currentColor" stroke-width="1.3" fill="none"/><g fill="currentColor"><rect x="3.5" y="6" width="1.5" height="1.5"/><rect x="6" y="6" width="1.5" height="1.5"/><rect x="8.5" y="6" width="1.5" height="1.5"/><rect x="11" y="6" width="1.5" height="1.5"/><rect x="4.5" y="9" width="7" height="1.5"/></g>',
  undo: '<path d="M5 4L2 7l3 3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2.5 7H10a3.5 3.5 0 0 1 0 7H7" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  redo: '<path d="M11 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M13.5 7H6a3.5 3.5 0 0 0 0 7h3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  save: '<path d="M3 2h8l2 2v10H3z" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="5" y="2.7" width="5" height="3.3" fill="currentColor"/>',
  open: '<path d="M2 4h4l1.5 1.5H14v7.5H2z" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  export: '<path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3 12v2h10v-2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  max: '<rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M2.5 5.5h11" stroke="currentColor" stroke-width="1.4"/>',
  draw: '<path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  paint: '<path d="M10.5 2.5l3 3-5 5-3-3z" fill="currentColor"/><path d="M5 9c-2 0-2.5 2-3 4 2-.5 4-1 4-3" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  erase: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8"/>',
  select: '<rect x="2.5" y="2.5" width="11" height="11" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.5" fill="none"/>',
  pan: '<path d="M8 1.5v13M1.5 8h13M6 3.5l2-2 2 2M6 12.5l2 2 2-2M3.5 6l-2 2 2 2M12.5 6l2 2-2 2" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  plus: '<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8"/>',
  magnet: '<path d="M4 3v5a4 4 0 0 0 8 0V3" stroke="currentColor" stroke-width="2.2" fill="none"/>',
};
export function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = PATHS[name] || '';
  return s;
}
const WAVE_PATHS = {
  sine: 'M1 6 C4 0, 6 0, 9 6 S14 12, 17 6',
  triangle: 'M1 9 L5 3 L9 9 L13 3 L17 9',
  square: 'M1 9 V3 H9 V9 H17 V3',
  sawtooth: 'M1 9 L9 3 V9 L17 3 V9',
  noise: 'M1 6 L3 2 L4 9 L6 4 L7 10 L9 1 L10 8 L12 3 L13 9 L15 4 L17 7',
};
export function waveIcon(w) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 18 12');
  s.innerHTML = `<path d="${WAVE_PATHS[w]}" stroke="currentColor" stroke-width="1.5" fill="none"/>`;
  return s;
}

export function createKit(S) {
  const { el, host } = S;
  const root = S.root;

  // ── the hint bar: whatever is under the pointer says what it is ─────────────────────────────
  root.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-hint]');
    if (t && root.contains(t)) S.hint(t.dataset.hint);
  });

  // ── knobs ─────────────────────────────────────────────────────────────────────────────────
  function knob({ label, value, min = 0, max = 1, def = value, curve, origin, fmt, onChange, big = false, show = false, hint }) {
    const f = fmt || ((v) => `${Math.round(((v - min) / (max - min)) * 100)}%`);
    const k = host.ui.knob({ label, min, max, value, def, curve, origin, fmt: f, onChange: (v) => { S.hint(`${label}: ${f(v)}`, true); onChange?.(v); } });
    if (show) k.el.classList.add('has-label');
    if (big) k.el.classList.add('big');
    k.el.dataset.hint = hint || `${label}: ${f(value)}. Drag up or down, double-click to reset.`;
    k.el.addEventListener('pointerover', () => { k.el.dataset.hint = `${label}: ${f(k.value)}`; });
    return k;
  }

  // ── a number dragged up and down (FL's tempo and insert boxes) ─────────────────────────────
  function dragNumber(node, { get, set, min, max, step = 1, px = 4, onEnd }) {
    let d = null;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      host.capture(node, e);
      d = { y: e.clientY, v: get() };
    });
    node.addEventListener('pointermove', (e) => {
      if (!d) return;
      const fine = e.shiftKey ? 0.1 : 1;
      const v = Math.max(min, Math.min(max, Math.round((d.v + ((d.y - e.clientY) / px) * step * fine) / (step * fine)) * step * fine));
      if (v !== get()) set(v);
    });
    const end = () => { if (d) { d = null; onEnd?.(); } };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.addEventListener('lostpointercapture', end);
    node.addEventListener('wheel', (e) => { e.preventDefault(); set(Math.max(min, Math.min(max, get() - Math.sign(e.deltaY) * step))); onEnd?.(); }, { passive: false });
  }

  // ── menus ─────────────────────────────────────────────────────────────────────────────────
  let open = null;
  function closeMenu() { open?.remove(); open = null; document.removeEventListener('pointerdown', outside, true); }
  function outside(e) { if (open && !open.contains(e.target)) closeMenu(); }
  // items: { label, fn, head, sep, danger, color, checked }
  function menu(anchor, items, at) {
    closeMenu();
    const m = el('div', { class: 'st2-menu', role: 'menu' });
    for (const it of items) {
      if (!it) continue;
      if (it.sep) { m.append(el('div', { class: 'st2-mi-sep' })); continue; }
      if (it.head) { m.append(el('div', { class: 'st2-mi is-head' }, it.head)); continue; }
      m.append(el('button', { class: `st2-mi ${it.danger ? 'is-danger' : ''}`, type: 'button', role: 'menuitem', onclick: () => { closeMenu(); it.fn(); } },
        it.color ? el('span', { class: 'dot', style: `background:${it.color}` }) : null, it.checked ? '✓ ' : '', it.label));
    }
    root.append(m);
    const r = root.getBoundingClientRect();
    const a = at || anchor.getBoundingClientRect();
    let x = (at ? at.x : a.left) - r.left, y = (at ? at.y : a.bottom + 2) - r.top;
    m.style.left = `${Math.max(2, x)}px`;
    m.style.top = `${Math.max(2, y)}px`;
    requestAnimationFrame(() => {
      const mr = m.getBoundingClientRect();
      if (mr.right > r.right - 2) m.style.left = `${Math.max(2, r.width - mr.width - 4)}px`;
      if (mr.bottom > r.bottom - 2) m.style.top = `${Math.max(2, (at ? at.y - r.top : a.top - r.top) - mr.height - 2)}px`;
    });
    open = m;
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
    return m;
  }

  // ── renaming in place ─────────────────────────────────────────────────────────────────────
  function rename(node, value, done) {
    const input = el('input', { class: 'st2-input', value, maxlength: '24', spellcheck: 'false' });
    const r = node.getBoundingClientRect(), rr = root.getBoundingClientRect();
    input.style.position = 'absolute';
    input.style.zIndex = '9999';
    input.style.left = `${r.left - rr.left}px`;
    input.style.top = `${r.top - rr.top}px`;
    input.style.width = `${Math.max(90, r.width)}px`;
    root.append(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (ok) => { if (finished) return; finished = true; const v = input.value.trim(); input.remove(); if (ok && v) done(v); };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  return { knob, dragNumber, menu, closeMenu, rename, icon };
}

// The window manager. A window remembers where it was in the project's ui, so the layout comes
// back as it was left; a click anywhere on one brings it to the front.
export function createWindows(S, work) {
  const { el } = S;
  const wins = new Map();
  let z = 10;
  const ui = () => S.project.ui.windows;
  // Where a window is shown: the whole of it in view, and never bigger than the work area, even
  // below its own smallest size (a phone: its insides scroll). What is kept in the project is left
  // alone, so a visit from a phone does not shrink the layout of the big screen.
  function place(o) {
    const W = work.clientWidth || 800, H = work.clientHeight || 500;
    const st = o.st = ui()[o.id] || (ui()[o.id] = o.st);              // (a project opened from a file has its own)
    const w = Math.min(Math.max(o.minW, st.w), W), h = Math.min(Math.max(o.minH, st.h), H);
    const x = Math.max(0, Math.min(st.x, W - w)), y = Math.max(0, Math.min(st.y, H - h));
    Object.assign(o.el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    return { x, y, w, h };
  }
  function raise(o) {
    o.el.style.zIndex = String(++z);
    for (const w of wins.values()) w.el.classList.toggle('is-front', w === o);
  }
  function open(id, { title, build, w = 420, h = 300, x, y, minW = 260, minH = 140 } = {}) {
    let o = wins.get(id);
    if (!o) {
      const cascade = wins.size * 26;
      const st = ui()[id] || (ui()[id] = { open: true, x: x ?? 40 + cascade, y: y ?? 30 + cascade, w, h });
      const titleEl = el('span', { class: 'st2-win-title' }, title);
      const xBtn = el('button', { class: 'st2-win-x', type: 'button', 'aria-label': `Close ${title}`, onclick: () => close(id) }, '×');
      const head = el('div', { class: 'st2-win-head' }, titleEl, xBtn);
      const body = el('div', { class: 'st2-win-body' });
      const grip = el('span', { class: 'st2-win-grip' });
      const node = el('section', { class: 'st2-win', dataset: { win: id } }, head, body, grip);
      work.append(node);
      o = { id, el: node, body, titleEl, st, minW, minH, view: null };
      wins.set(id, o);
      node.addEventListener('pointerdown', () => { raise(o); S.focusWin(id); }, true);
      // a drag starts from where the window is shown, and what it ends on is kept; a cancelled
      // touch (the browser taking the gesture) ends it the same way as letting go
      let drag = null;
      head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button')) return;
        e.preventDefault();
        S.host.capture(head, e);
        drag = { x: e.clientX - node.offsetLeft, y: e.clientY - node.offsetTop };
      });
      head.addEventListener('pointermove', (e) => {
        if (!drag) return;
        o.st.x = e.clientX - drag.x; o.st.y = e.clientY - drag.y;
        const at = place(o);
        o.st.x = at.x; o.st.y = at.y;
      });
      const endMove = () => { if (drag) { drag = null; S.saveUi(); } };
      head.addEventListener('pointerup', endMove);
      head.addEventListener('pointercancel', endMove);
      head.addEventListener('lostpointercapture', endMove);
      let size = null;
      grip.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); S.host.capture(grip, e); size = { x: e.clientX, y: e.clientY, w: node.offsetWidth, h: node.offsetHeight }; });
      grip.addEventListener('pointermove', (e) => {
        if (!size) return;
        o.st.w = size.w + e.clientX - size.x; o.st.h = size.h + e.clientY - size.y;
        const at = place(o);
        o.st.w = at.w; o.st.h = at.h;
        o.view?.resize?.();
      });
      const endSize = () => { if (size) { size = null; o.view?.resize?.(); S.saveUi(); } };
      grip.addEventListener('pointerup', endSize);
      grip.addEventListener('pointercancel', endSize);
      grip.addEventListener('lostpointercapture', endSize);
      o.view = build(body, o);
    }
    o.st = ui()[id] || (ui()[id] = o.st);
    o.st.open = true;
    o.el.hidden = false;
    place(o);
    raise(o);
    S.focusWin(id);
    o.view?.render?.();
    o.view?.resize?.();
    return o;
  }
  function close(id) {
    const o = wins.get(id);
    if (!o || o.el.hidden) return;
    o.el.hidden = true;
    o.st.open = false;
    o.view?.closed?.();
    S.saveUi();
    S.onWindows?.();
  }
  function drop(id) {
    const o = wins.get(id);
    if (!o) return;
    o.el.remove();
    wins.delete(id);
    delete ui()[id];
  }
  return {
    open, close, drop,
    toggle(id, opts) { if (wins.get(id) && !wins.get(id).el.hidden) close(id); else open(id, opts); S.onWindows?.(); },
    isOpen: (id) => !!wins.get(id) && !wins.get(id).el.hidden,
    get: (id) => wins.get(id),
    each(fn) { for (const o of wins.values()) fn(o); },
    relayout() { for (const o of wins.values()) if (!o.el.hidden) { place(o); o.view?.resize?.(); } },
    title(id, t) { const o = wins.get(id); if (o) o.titleEl.textContent = t; },
  };
}
