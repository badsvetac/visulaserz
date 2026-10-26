import { el, clamp, store, debounce } from '../util.js';
import { createHost } from './host.js';

// The desk: tools float over the stage as small panels you drag anywhere by their header, resize
// from the corner when they allow it, fold up to their header, and stack (the one touched last is
// on top). Where each one sits is remembered as a share of the free space around it, so a desk
// laid out on a laptop still lands in the same corners on a big screen.
//
// A tool hears the keyboard only while its panel has the focus: every letter of the keyboard
// already does something on the show, so a click on a tool lends it the keys and Escape (or a
// click elsewhere) hands them back.

const SNAP = 14;          // px: a panel this close to an edge sticks to it
const HEAD_H = 30;        // the header height each tool's size was laid out with
const STORE_KEY = 'toolDesk';

export function createDesk({ registry, engine, analysis, clock, lcdShow, toast, icon, reduceMotion, renderer }) {
  const layer = el('div', { class: 'tool-layer panel-fade', role: 'region', 'aria-label': 'Tools on the stage' });
  document.body.append(layer);

  // The transport bar stays reachable underneath. Its height is read from the page (a phone's is
  // taller, with the seek bar on a row of its own), once per layout rather than on every move.
  let deckHeight = null;
  const deckEl = document.querySelector('.deck');
  const deckH = () => {
    if (deckHeight === null) deckHeight = deckEl ? deckEl.offsetHeight : 64;
    return deckHeight;
  };
  // whether any panel is out: the page moves the Sign in button under the desk, and on a touch
  // screen keeps the panels in view when the controls fade away
  function marks() {
    const any = layer.childElementCount > 0;
    layer.classList.toggle('has-panel', any);
    document.body.classList.toggle('has-tool-panel', any);
  }

  const open = new Map();          // id → { tool, panel, body, host, inst, at }
  const opening = new Map();       // id → Promise while a tool's code is being fetched
  // the transport can change shape while the window does not (a phone layout settling, DJ mode):
  // the panels make room for it again
  if (deckEl && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const h = deckEl.offsetHeight;
      if (h === deckHeight) return;
      deckHeight = h;
      for (const o of open.values()) apply(o);
    }).observe(deckEl);
  }
  let saved = store.get(STORE_KEY, null);
  if (!saved || typeof saved !== 'object' || !saved.at) saved = { v: 1, open: [], at: {} };
  let top = 1;
  let hovered = 0;
  let cascade = 0;

  const persist = debounce(() => {
    const at = { ...saved.at };
    for (const [id, o] of open) at[id] = o.at;
    saved = { v: 1, open: [...open.keys()], at };
    store.set(STORE_KEY, saved);
  }, 200);

  // ── where a panel goes ─────────────────────────────────────────────────────
  const room = (w, h) => ({ w: Math.max(0, window.innerWidth - w), h: Math.max(0, window.innerHeight - deckH() - h) });

  // The size a panel is shown at: a big panel (the Studio) shrinks to the window it is in, down to
  // its own smallest size, and no panel is ever wider or taller than the window (a phone) — there
  // its body scrolls instead. A header made taller for fingers is added, not taken from the body.
  function fit(o) {
    const { at } = o, lim = o.tool.resizable;
    const maxW = window.innerWidth - 8, maxH = window.innerHeight - deckH() - 8;
    const w = Math.min(lim ? Math.max(lim.minW, Math.min(at.w, maxW)) : at.w, maxW);
    const h = Math.min((lim ? Math.max(lim.minH, Math.min(at.h, maxH)) : at.h) + (o.headExtra || 0), maxH);
    return { w: Math.max(160, w), h: Math.max(80, h) };
  }

  function apply(o) {
    const { panel, at } = o;
    panel.classList.toggle('is-max', !!at.max && !at.min);
    if (at.max && !at.min) {
      Object.assign(panel.style, { left: '0px', top: '0px', width: `${window.innerWidth}px`, height: `${window.innerHeight - deckH()}px` });
      panel.classList.remove('is-min');
      return;
    }
    const size = fit(o);
    const w = size.w, h = at.min ? panel.querySelector('.tool-head').offsetHeight : size.h;
    panel.style.width = `${w}px`;
    panel.style.height = at.min ? '' : `${size.h}px`;
    const space = room(w, h);
    panel.style.left = `${Math.round(clamp(at.x, 0, 1) * space.w)}px`;
    panel.style.top = `${Math.round(clamp(at.y, 0, 1) * space.h)}px`;
    panel.classList.toggle('is-min', !!at.min);
  }

  // A pixel position becomes a share of the free space, after sticking to any edge it is near.
  function placeAt(o, left, topPx) {
    const size = fit(o);
    const h = o.at.min ? o.panel.querySelector('.tool-head').offsetHeight : size.h;
    const space = room(size.w, h);
    let x = clamp(left, 0, space.w);
    let y = clamp(topPx, 0, space.h);
    if (x < SNAP) x = 0; else if (space.w - x < SNAP) x = space.w;
    if (y < SNAP) y = 0; else if (space.h - y < SNAP) y = space.h;
    o.at.x = space.w ? x / space.w : 0;
    o.at.y = space.h ? y / space.h : 0;
    apply(o);
  }

  function raise(o) {
    o.panel.style.zIndex = String(++top);
    if (top > 9000) {                                     // renumber long before the stacking breaks
      top = 1;
      [...open.values()].sort((a, b) => a.panel.style.zIndex - b.panel.style.zIndex).forEach((p) => { p.panel.style.zIndex = String(++top); });
    }
  }

  function flash(o) {
    o.panel.classList.remove('is-called');
    void o.panel.offsetWidth;
    o.panel.classList.add('is-called');
  }

  // ── the panel ─────────────────────────────────────────────────────────────
  function buildPanel(tool, at) {
    const led = el('span', { class: 'tool-led', 'aria-hidden': 'true' });
    const minBtn = el('button', { class: 'tool-btn', type: 'button', 'aria-label': `Fold ${tool.name}`, title: 'Fold up to the header (double-click the header too)' }, icon('chevron'));
    const closeBtn = el('button', { class: 'tool-btn', type: 'button', 'aria-label': `Close ${tool.name}`, title: 'Put it away. It stays on your desk in the Perform rack.' }, icon('close'));
    const head = el('header', { class: 'tool-head', title: 'Drag to move it anywhere' },
      el('span', { class: 'tool-grip', 'aria-hidden': 'true' }), el('span', { class: 'tool-name' }, tool.name), led, minBtn, closeBtn);
    const body = el('div', { class: 'tool-body' });
    const grip = tool.resizable ? el('span', { class: 'tool-resize', 'aria-hidden': 'true', title: 'Drag to resize' }) : null;
    const panel = el('section', { class: `tool-panel tool-${tool.id}`, tabindex: '-1', 'aria-label': tool.name, dataset: { tool: tool.id } }, head, body, grip);
    return { panel, head, body, grip, minBtn, closeBtn };
  }

  function wire(o, parts) {
    const { panel, head, grip, minBtn, closeBtn } = parts;

    // The click that lands on a tool lends it the keyboard and brings it to the front. Pads
    // cancel the browser's own focusing (it would steal the pointer), so the panel takes it here;
    // a knob still takes it from the panel a moment later, which keeps it inside the tool.
    panel.addEventListener('pointerdown', () => {
      raise(o);
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }, { capture: true });
    panel.addEventListener('pointerenter', () => { hovered++; });
    panel.addEventListener('pointerleave', () => { hovered = Math.max(0, hovered - 1); });

    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button') || o.at.max) return;
      e.preventDefault();
      try { head.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      panel.classList.add('is-moving');
    });
    head.addEventListener('pointermove', (e) => { if (drag) placeAt(o, e.clientX - drag.dx, e.clientY - drag.dy); });
    const drop = () => { if (!drag) return; drag = null; panel.classList.remove('is-moving'); persist(); };
    head.addEventListener('pointerup', drop);
    head.addEventListener('pointercancel', drop);
    head.addEventListener('lostpointercapture', drop);
    head.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) fold(o); });

    if (grip) {
      let size = null;
      grip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        try { grip.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
        const r = panel.getBoundingClientRect();
        size = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, left: r.left, top: r.top };
        panel.classList.add('is-moving');
      });
      grip.addEventListener('pointermove', (e) => {
        if (!size) return;
        const lim = o.tool.resizable;
        o.at.w = Math.round(clamp(size.w + e.clientX - size.x, lim.minW, Math.min(lim.maxW, window.innerWidth - size.left)));
        o.at.h = Math.round(clamp(size.h + e.clientY - size.y, lim.minH, Math.min(lim.maxH, window.innerHeight - deckH() - size.top)));
        placeAt(o, size.left, size.top);                  // the top-left corner stays put while it grows
        o.inst?.resize?.();
      });
      const done = () => { if (!size) return; size = null; panel.classList.remove('is-moving'); o.inst?.resize?.(); persist(); };
      grip.addEventListener('pointerup', done);
      grip.addEventListener('pointercancel', done);
      grip.addEventListener('lostpointercapture', done);
    }

    minBtn.addEventListener('click', () => fold(o));
    panel.addEventListener('vz-maximize', (e) => { o.at.max = !!e.detail; apply(o); o.inst?.resize?.(); persist(); });
    closeBtn.addEventListener('click', () => closeTool(o.tool.id));
  }

  function fold(o) {
    o.at.min = !o.at.min;
    if (o.at.min) o.inst?.release?.();                     // nothing keeps playing behind a folded panel
    apply(o);
    if (!o.at.min) o.inst?.resize?.();
    persist();
  }

  // ── opening and closing ───────────────────────────────────────────────────
  function openTool(id, { focus = true } = {}) {
    const known = open.get(id);
    if (known) {
      if (known.at.min) fold(known);
      raise(known);
      flash(known);
      if (focus) known.panel.focus({ preventScroll: true });
      return Promise.resolve(known);
    }
    if (opening.has(id)) return opening.get(id);
    const job = (async () => {
      let tool;
      try { tool = await registry.load(id); } catch (e) {
        toast(`That tool could not be fetched: ${e.message}`, { kind: 'error' });
        return null;
      }
      if (open.has(id)) return open.get(id);
      registry.install(id);
      const keep = saved.at[id];
      const at = {
        w: tool.resizable && keep?.w ? clamp(keep.w, tool.resizable.minW, tool.resizable.maxW) : tool.size.w,
        h: tool.resizable && keep?.h ? clamp(keep.h, tool.resizable.minH, tool.resizable.maxH) : tool.size.h,
        x: Number.isFinite(keep?.x) ? keep.x : clamp(0.82 - (cascade % 5) * 0.07, 0, 1),
        y: Number.isFinite(keep?.y) ? keep.y : clamp(0.28 + (cascade % 5) * 0.08, 0, 1),
        min: !!keep?.min,
        max: !!keep?.max,
      };
      if (!keep) cascade++;
      const parts = buildPanel(tool, at);
      const o = { tool, panel: parts.panel, head: parts.head, body: parts.body, at, host: null, inst: null, headExtra: 0 };
      wire(o, parts);
      layer.append(parts.panel);
      marks();
      deckHeight = null;
      measureHead(o);
      apply(o);
      raise(o);
      o.host = createHost({ engine, analysis, clock, lcdShow, toast, reduceMotion, renderer }, tool, parts.panel);
      try {
        o.inst = (await tool.create(o.host, parts.body)) || {};
      } catch (e) {
        console.error(`[${id}]`, e);
        toast(`${tool.name} could not start: ${e.message}`, { kind: 'error', timeout: 7000 });
        o.host.dispose();
        parts.panel.remove();
        marks();
        return null;
      }
      open.set(id, o);
      if (focus) parts.panel.focus({ preventScroll: true });
      flash(o);
      lcdShow('tool', tool.name);
      persist();
      registry.dispatchEvent(new CustomEvent('desk', { detail: { id, open: true } }));
      return o;
    })().finally(() => opening.delete(id));
    opening.set(id, job);
    return job;
  }

  function closeTool(id) {
    const o = open.get(id);
    if (!o) return;
    open.delete(id);
    try { o.inst?.release?.(); o.inst?.destroy?.(); } catch (e) { console.warn(`[${id}]`, e); }
    o.host.dispose();
    if (o.panel.matches(':hover')) hovered = Math.max(0, hovered - 1);
    o.panel.remove();
    marks();
    saved.at[id] = o.at;
    persist();
    registry.dispatchEvent(new CustomEvent('desk', { detail: { id, open: false } }));
  }

  // how much taller than its 30 px a header is drawn (bigger for fingers on a touch screen)
  function measureHead(o) { o.headExtra = Math.max(0, (o.head.offsetHeight || HEAD_H) - HEAD_H); }

  registry.addEventListener('change', (e) => { if (e.detail.type === 'uninstall') closeTool(e.detail.id); });
  window.addEventListener('resize', debounce(() => {
    deckHeight = null;                                   // the transport may have changed shape (a phone turned)
    for (const o of open.values()) { measureHead(o); apply(o); o.inst?.resize?.(); }
  }, 120));

  const focused = () => [...open.values()].find((o) => o.panel.contains(document.activeElement));

  return {
    layer,
    clock,
    open: openTool,
    close: closeTool,
    toggle(id) { return open.has(id) ? (closeTool(id), null) : openTool(id); },
    isOpen: (id) => open.has(id),
    get hovered() { return hovered > 0; },
    get openIds() { return [...open.keys()]; },
    instance: (id) => open.get(id)?.inst ?? null,

    // the tools that were out when the page was closed come back where they were, without the focus
    async restore() {
      const ids = (Array.isArray(saved.open) ? saved.open : []).filter((id) => registry.isInstalled(id));
      for (const id of ids) await openTool(id, { focus: false });
    },

    keydown(e) {
      const o = focused();
      if (!o || o.at.min) return false;
      if (e.key === 'Escape') { o.inst?.release?.(); o.panel.blur(); document.activeElement?.blur?.(); return true; }
      return !!o.inst?.keydown?.(e);
    },
    // every tool hears a key going up, focused or not, so a pad held from the keyboard is never stuck
    keyup(e) { for (const o of open.values()) o.inst?.keyup?.(e); },
    // the panic key: whatever any tool is holding lets go
    releaseAll() { for (const o of open.values()) { try { o.inst?.release?.(); } catch (err) { console.warn(err); } } },

    tick(dt, an) {
      clock.update(dt, an);
      for (const o of open.values()) {
        if (o.at.min) continue;
        try { o.inst?.tick?.(dt, an); } catch (e) { console.error(`[${o.tool.id}]`, e); }
      }
    },
  };
}
