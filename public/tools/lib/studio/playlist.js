import { BAR, TRACKS, patternOf, songEnd, newPattern } from './model.js';
import { DRAG_TYPE } from './browser.js';

// The PLAYLIST: the song, laid out in time. Patterns sit on its tracks as clips; a clip longer
// than its pattern plays the pattern round again. Draw a clip of the picked pattern with a click,
// drag it to move it (Ctrl-drag to copy it), drag its end to stretch it, right-click to rub it
// out. A click on the ruler moves the song position. The pattern list at the left picks the
// pattern that new clips are made of.

const TH = 34;                 // a track's height
const RULER = 20;
const SNAPS = [['Bar', BAR], ['Beat', 4], ['Step', 1]];

export function buildPlaylist(S, kit) {
  const { el } = S;
  let tool = 'draw';
  let snap = 0;
  let scrollX = 0;             // in steps
  let scrollY = 0;             // in px
  let drag = null;
  let dirty = true;
  const pxStep = () => (S.project.ui.zoom || 22) / 4;

  const drawBtn = el('button', { class: 'st2-btn is-on', type: 'button', 'data-hint': 'Draw: click to put the picked pattern down, drag to move a clip (P)', onclick: () => setTool('draw') }, kit.icon('draw'));
  const delBtn = el('button', { class: 'st2-btn', type: 'button', 'data-hint': 'Delete: click or drag over clips to take them out (D)', onclick: () => setTool('delete') }, kit.icon('erase'));
  const snapSel = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'Snap: what clips stick to' }, `Snap: ${SNAPS[snap][0]}`);
  snapSel.addEventListener('click', () => kit.menu(snapSel, SNAPS.map(([name], i) => ({ label: name, checked: i === snap, fn: () => { snap = i; snapSel.textContent = `Snap: ${name}`; } }))));
  const zoomOut = el('button', { class: 'st2-btn', type: 'button', 'data-hint': 'Zoom out (Ctrl+wheel)', onclick: () => zoom(1 / 1.25) }, '−');
  const zoomIn = el('button', { class: 'st2-btn', type: 'button', 'data-hint': 'Zoom in (Ctrl+wheel)', onclick: () => zoom(1.25) }, '+');
  const lenInfo = el('span', { class: 'st2-label' });
  const picks = el('div', { class: 'st2-picker' });
  const tracks = el('div', { class: 'st2-tracks' });
  const canvas = el('canvas');
  const grid = el('div', { class: 'st2-grid' }, canvas);
  const node = el('div', { class: 'st2-playlist' },
    el('div', { class: 'st2-tools' }, el('span', { class: 'st2-label' }, 'Playlist'), drawBtn, delBtn, snapSel, zoomOut, zoomIn, el('span', { class: 'st2-grow' }), lenInfo),
    el('div', { class: 'st2-pl-body' }, picks, tracks, grid));
  const g = canvas.getContext('2d');

  function setTool(t) { tool = t; drawBtn.classList.toggle('is-on', t === 'draw'); delBtn.classList.toggle('is-on', t === 'delete'); }
  function zoom(f) { S.project.ui.zoom = Math.max(6, Math.min(80, (S.project.ui.zoom || 22) * f)); dirty = true; S.saveUi(); }

  // ── the pattern list ───────────────────────────────────────────────────────────────────────
  function paintPicks() {
    picks.replaceChildren(...S.project.patterns.map((p) => {
      const n = el('div', { class: `st2-pick ${p.id === S.project.pattern ? 'is-on' : ''}`, draggable: 'true', 'data-hint': `${p.name}: click to pick it, double-click to rename, drag it onto the playlist` },
        el('span', { class: 'sw', style: `background:${p.color}` }), p.name);
      n.addEventListener('click', () => S.setPattern(p.id));
      n.addEventListener('dblclick', () => kit.rename(n, p.name, (v) => { p.name = v; S.changed('patterns'); }));
      n.addEventListener('dragstart', (e) => e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ pattern: p.id })));
      n.addEventListener('contextmenu', (e) => { e.preventDefault(); S.setPattern(p.id); kit.menu(n, [
        { label: 'Rename…', fn: () => kit.rename(n, p.name, (v) => { p.name = v; S.changed('patterns'); }) },
        { label: 'Clone', fn: () => S.clonePattern() },
        { head: 'Colour' },
        ...['#7fc86a', '#5fa9d8', '#e8a64a', '#c879c2', '#e06d5e', '#6fcab9', '#bfc35e', '#9187dd'].map((c) => ({ label: c === p.color ? 'This one' : 'Use this', color: c, fn: () => { p.color = c; S.changed('patterns'); } })),
        { sep: true },
        { label: 'Delete', danger: true, fn: () => S.deletePattern() },
      ], { x: e.clientX, y: e.clientY }); });
      return n;
    }), el('button', { class: 'st2-pick-add', type: 'button', 'data-hint': 'A new, empty pattern', onclick: () => S.newPattern() }, '+ Pattern'));
  }
  // ── the track names ────────────────────────────────────────────────────────────────────────
  function paintTracks() {
    tracks.replaceChildren(...S.project.playlist.tracks.map((t, i) => {
      const n = el('div', { class: `st2-track ${t.mute ? 'is-mute' : ''}`, style: `top:${RULER + i * TH - scrollY}px;height:${TH}px`, 'data-hint': `${t.name}: click the light to mute it, double-click to rename` },
        el('span', { class: 'led' }), el('span', { class: 'nm' }, t.name));
      n.querySelector('.led').addEventListener('click', (e) => { e.stopPropagation(); t.mute = !t.mute; S.changed('tracks'); paintTracks(); dirty = true; });
      n.addEventListener('dblclick', () => kit.rename(n, t.name, (v) => { t.name = v; S.changed('tracks'); paintTracks(); }));
      return n;
    }));
  }

  // ── geometry ───────────────────────────────────────────────────────────────────────────────
  let W = 0, H = 0;
  function measure() {
    const w = grid.clientWidth, h = grid.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    W = w; H = h;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  const xOf = (step) => (step - scrollX) * pxStep();
  const stepAt = (x) => x / pxStep() + scrollX;
  const trackAt = (y) => Math.floor((y - RULER + scrollY) / TH);
  const snapStep = (s, size = SNAPS[snap][1]) => Math.max(0, Math.floor(s / size + 1e-6) * size);
  function clipAt(x, y) {
    const tr = trackAt(y), s = stepAt(x);
    const list = S.project.playlist.clips;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.track === tr && s >= c.start && s < c.start + c.len) return { c, edge: xOf(c.start + c.len) - x < 8 };
    }
    return null;
  }

  // ── drawing ────────────────────────────────────────────────────────────────────────────────
  function draw() {
    if (!measure()) return;
    const ps = pxStep(), bar = ps * BAR;
    g.clearRect(0, 0, W, H);
    // the lanes, with every other bar a shade lighter
    g.fillStyle = '#2b3338';
    g.fillRect(0, RULER, W, H - RULER);
    const first = Math.floor(scrollX / BAR);
    for (let b = first; xOf(b * BAR) < W; b++) {
      const x = xOf(b * BAR);
      if (b % 2) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(x, RULER, bar, H - RULER); }
      g.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)';
      g.fillRect(Math.round(x), RULER, 1, H - RULER);
      if (ps * 4 > 10) for (let k = 1; k < 4; k++) { g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(Math.round(x + k * ps * 4), RULER, 1, H - RULER); }
    }
    for (let i = 0; i <= TRACKS; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, RULER + i * TH - scrollY, W, 1); }
    // the clips
    for (const c of S.project.playlist.clips) {
      const pat = patternOf(S.project, c.pattern);
      if (!pat) continue;
      const x = xOf(c.start), y = RULER + c.track * TH - scrollY + 1, w = c.len * ps, h = TH - 2;
      if (x > W || x + w < 0 || y > H || y + h < RULER) continue;
      const muted = S.project.playlist.tracks[c.track]?.mute;
      g.globalAlpha = muted ? 0.35 : 1;
      g.fillStyle = shade(pat.color, -0.35);
      round(x, y, w, h, 3); g.fill();
      g.fillStyle = shade(pat.color, 0.05);
      round(x + 1, y + 1, w - 2, h - 2, 2.5); g.fill();
      g.fillStyle = shade(pat.color, -0.25);
      g.fillRect(x + 1, y + 1, w - 2, 11);
      g.fillStyle = '#121517';
      g.font = '700 9.5px Saira, Arial, sans-serif';
      g.textAlign = 'left';
      g.save();
      g.beginPath(); g.rect(x + 2, y, Math.max(0, w - 4), h); g.clip();
      g.fillText(pat.name, x + 4, y + 10);
      preview(pat, c, x, y + 13, w, h - 15);
      g.restore();
      // where the pattern comes round inside a long clip
      for (let r = pat.len; r < c.len; r += pat.len) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + r * ps, y + 12, 1, h - 13); }
      if (drag?.clip === c) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; round(x, y, w, h, 3); g.stroke(); }
      g.globalAlpha = 1;
    }
    // the ruler
    g.fillStyle = '#1e2326';
    g.fillRect(0, 0, W, RULER);
    g.fillStyle = '#9aa5ab';
    g.font = '600 9.5px Saira, Arial, sans-serif';
    for (let b = first; xOf(b * BAR) < W; b++) {
      const x = xOf(b * BAR);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(Math.round(x), RULER - 6, 1, 6);
      if (bar > 26 || b % 4 === 0) { g.fillStyle = '#b8c2c7'; g.fillText(String(b + 1), x + 3, 13); }
    }
    const end = songEnd(S.project);
    g.fillStyle = 'rgba(243,155,63,0.35)';
    g.fillRect(xOf(end), 0, 2, RULER);
    // where the song starts from, and where it is
    const st = S.engine?.startAt || 0;
    g.fillStyle = '#f39b3f';
    g.beginPath(); g.moveTo(xOf(st), RULER - 1); g.lineTo(xOf(st) - 5, RULER - 8); g.lineTo(xOf(st) + 5, RULER - 8); g.closePath(); g.fill();
    const at = S.engine?.position();
    if (at && at.mode === 'song') {
      const x = xOf(at.step);
      g.fillStyle = '#9be86a';
      g.fillRect(Math.round(x), 0, 1.5, H);
      if (x > W * 0.9 || x < 0) { scrollX = Math.max(0, at.step - (W * 0.2) / ps); dirty = true; }
    }
    lenInfo.textContent = `Song: ${end / BAR} bars`;
    dirty = false;
  }
  function preview(pat, c, x, y, w, h) {
    // a pattern's notes, or its steps, drawn small inside the clip
    const notes = [], hits = [];
    for (const [id, q] of Object.entries(pat.ch)) {
      if (!S.project.channels.some((ch) => ch.id === id)) continue;
      if (q.notes.length) notes.push(...q.notes);
      else q.steps.forEach((v, k) => { if (v && k < pat.len) hits.push(k); });
    }
    const ps = pxStep();
    g.fillStyle = 'rgba(10,12,14,0.55)';
    if (notes.length) {
      const lo = Math.min(...notes.map((n) => n.k)), hi = Math.max(...notes.map((n) => n.k)), span = Math.max(12, hi - lo + 1);
      for (let r = 0; r < c.len; r += pat.len) {
        for (const n of notes) {
          if (n.s + r >= c.len) continue;
          const nx = x + (n.s + r) * ps, ny = y + h - 2 - ((n.k - lo) / span) * (h - 4);
          g.fillRect(nx, ny - 1, Math.max(1.5, n.l * ps - 1), 2);
        }
      }
    }
    if (hits.length) {
      for (let r = 0; r < c.len; r += pat.len) for (const k of hits) if (k + r < c.len) g.fillRect(x + (k + r) * ps, y + h - 5, Math.max(1.5, ps * 0.6), 4);
    }
  }
  function round(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ── editing ────────────────────────────────────────────────────────────────────────────────
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Two fingers (or the middle button) scroll the playlist; whatever the first finger had begun
  // is put back, the way a phone does it.
  const fingers = new Map();
  const middle = () => { const pts = [...fingers.values()]; return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length }; };
  const maxY = () => Math.max(0, TRACKS * TH + RULER - H);
  function startPan(x, y) {
    const d = drag;
    if (d?.clip) {
      if (d.created) { const i = S.project.playlist.clips.indexOf(d.clip); if (i >= 0) S.project.playlist.clips.splice(i, 1); }
      else if (d.from) Object.assign(d.clip, d.from);
    }
    drag = { mode: 'pan', x0: x, y0: y, sx0: scrollX, sy0: scrollY };
    dirty = true;
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    S.host.capture(canvas, e);
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerType === 'touch') fingers.set(e.pointerId, { x, y });
    if (fingers.size >= 2 || e.button === 1) { const m = fingers.size >= 2 ? middle() : { x, y }; startPan(m.x, m.y); return; }
    if (y < RULER) {                                         // the ruler moves the song position
      S.engine?.seek(snapStep(stepAt(x)));
      drag = { mode: 'seek' };
      dirty = true;
      return;
    }
    const hit = clipAt(x, y);
    if (e.button === 2 || tool === 'delete') {
      drag = { mode: 'erase' };
      if (hit) remove(hit.c);
      return;
    }
    if (hit) {
      let c = hit.c;
      const copying = e.ctrlKey || e.metaKey;
      if (copying) { c = { ...c, id: `k${S.project.nextId++}` }; S.project.playlist.clips.push(c); }   // Ctrl-drag copies
      const from = { start: c.start, track: c.track, len: c.len };
      drag = hit.edge && !copying ? { mode: 'resize', clip: c, from } : { mode: 'move', clip: c, grab: stepAt(x) - c.start, moved: false, from, created: copying };
    } else {
      const pat = patternOf(S.project, S.project.pattern), tr = trackAt(y);
      if (!pat || tr < 0 || tr >= TRACKS) return;
      const c = { id: `k${S.project.nextId++}`, track: tr, start: snapStep(stepAt(x)), len: Math.max(pat.len, BAR), pattern: pat.id };
      S.project.playlist.clips.push(c);
      drag = { mode: 'move', clip: c, grab: stepAt(x) - c.start, moved: true, created: true };
    }
    dirty = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x, y });
    if (drag?.mode === 'pan') {
      const m = fingers.size ? middle() : { x, y };
      scrollX = Math.max(0, drag.sx0 - (m.x - drag.x0) / pxStep());
      scrollY = Math.max(0, Math.min(maxY(), drag.sy0 - (m.y - drag.y0)));
      paintTracks();
      dirty = true;
      return;
    }
    if (!drag) {
      const hit = y >= RULER ? clipAt(x, y) : null;
      canvas.style.cursor = y < RULER ? 'pointer' : hit ? (hit.edge ? 'ew-resize' : 'grab') : tool === 'delete' ? 'not-allowed' : 'copy';
      return;
    }
    if (drag.mode === 'seek') { S.engine?.seek(snapStep(stepAt(x))); dirty = true; return; }
    if (drag.mode === 'erase') { const hit = clipAt(x, y); if (hit) remove(hit.c); return; }
    const c = drag.clip;
    if (drag.mode === 'move') {
      const start = snapStep(stepAt(x) - drag.grab + SNAPS[snap][1] / 2);
      const tr = Math.max(0, Math.min(TRACKS - 1, trackAt(y)));
      if (start !== c.start || tr !== c.track) drag.moved = true;
      c.start = start;
      c.track = tr;
    } else {
      const size = SNAPS[snap][1];
      c.len = Math.max(size, Math.round((stepAt(x) - c.start) / size) * size);
    }
    dirty = true;
  });
  const up = (e) => {
    fingers.delete(e.pointerId);
    if (!drag) return;
    if (drag.mode === 'pan') {
      if (fingers.size) { const m = middle(); Object.assign(drag, { x0: m.x, y0: m.y, sx0: scrollX, sy0: scrollY }); return; }   // one finger still down
      drag = null;
      return;
    }
    if (drag.mode !== 'seek') S.changed('playlist');
    drag = null;
    dirty = true;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('dblclick', (e) => {
    const r = canvas.getBoundingClientRect();
    const hit = clipAt(e.clientX - r.left, e.clientY - r.top);
    if (hit) { S.setPattern(hit.c.pattern); S.openWindow('rack'); }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) { zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); return; }
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) scrollX = Math.max(0, scrollX + (e.deltaX || e.deltaY) / pxStep());
    else { scrollY = Math.max(0, Math.min(TRACKS * TH + RULER - H, scrollY + e.deltaY * 0.5)); paintTracks(); }
    dirty = true;
  }, { passive: false });
  // a pattern dragged in from the browser or the list lands where it is dropped
  grid.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); });
  grid.addEventListener('drop', (e) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    e.preventDefault();
    const spec = JSON.parse(raw);
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let id = spec.pattern;
    if (!id && spec.add) {                                    // an instrument dropped here gets a pattern of its own
      const ch = S.addChannel(spec.add[0], spec.add[1]);
      const p = newPattern(S.project, ch.name);
      S.project.patterns.push(p);
      id = p.id;
    }
    const pat = patternOf(S.project, id), tr = trackAt(y);
    if (!pat || tr < 0 || tr >= TRACKS) return;
    S.project.playlist.clips.push({ id: `k${S.project.nextId++}`, track: tr, start: snapStep(stepAt(x)), len: Math.max(pat.len, BAR), pattern: pat.id });
    S.setPattern(pat.id);
    S.changed('playlist');
  });
  function remove(c) {
    const list = S.project.playlist.clips, i = list.indexOf(c);
    if (i < 0) return;
    list.splice(i, 1);
    dirty = true;
    S.changed('playlist');
  }

  return {
    node,
    render() { paintPicks(); paintTracks(); dirty = true; },
    tick() { if (dirty || S.engine?.playing) draw(); },
    resize() { dirty = true; },
    key(e) {
      if (e.key === 'p' || e.key === 'P') { setTool('draw'); return true; }
      if (e.key === 'd' || e.key === 'D') { setTool('delete'); return true; }
      return false;
    },
  };
}

// a colour made lighter (amount > 0) or darker
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amount < 0 ? 0 : 255, p = Math.abs(amount);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}
export { shade };
