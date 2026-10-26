import { NOTES, keyListener } from '../key.js';
import { part, ROOT } from './model.js';
import { noteName } from './sounds.js';

// The PIANO ROLL, as FL Studio's works. Draw (P) puts a note down and lets you drag it into place;
// Paint (B) lays a run of notes as the pointer moves; Delete (D) rubs them out; Select (E) draws a
// box round notes, to move them, delete them, copy them (Ctrl+C, Ctrl+V), double them (Ctrl+B),
// all of which the Edit menu does too; Move (H), the middle button or two fingers scroll the view.
// The right button always rubs out. A note's end stretches it. Under the notes, the velocity
// lane: drag across it to set how hard each note is played. The song's key lights its rows; a
// stamp draws a whole chord with one click; ghost notes show the other channels of the pattern.

const SNAPS = [['1/32', 0.5], ['1/16', 1], ['1/8', 2], ['1/4', 4], ['1/2', 8], ['Bar', 16]];
const STAMPS = [
  ['No stamp', null], ['Major', [0, 4, 7]], ['Minor', [0, 3, 7]], ['Maj 7', [0, 4, 7, 11]], ['Min 7', [0, 3, 7, 10]], ['Dom 7', [0, 4, 7, 10]],
  ['Sus 4', [0, 5, 7]], ['Power', [0, 7, 12]], ['Octave', [0, 12]], ['Key triad', 'triad'], ['Key 7th', 'seventh'],
];
const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const ROW = 13, KEYS = 52, RULER = 16, VEL = 54, LOW = 12, HIGH = 108;
const BLACK = [1, 3, 6, 8, 10];

export function buildRoll(S, kit) {
  const { el, host } = S;
  let tool = 'draw';
  let snap = 1;
  let stamp = 0;
  let ghost = true;
  let lastLen = 2;
  let sy = null, sx = 0, zx = 0;           // vertical scroll (px), horizontal scroll (steps), px per step (0: fit)
  let drag = null;
  let held = null;
  let sel = new Set();
  let dirty = true;
  let shownFor = '';

  // ── the header ─────────────────────────────────────────────────────────────────────────────
  const chSel = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'The channel whose notes these are' });
  chSel.addEventListener('click', () => kit.menu(chSel, S.project.channels.map((c) => ({ label: c.name, color: c.color, checked: c.id === S.project.selected, fn: () => S.select(c.id) }))));
  const toolBtn = (name, id, hint) => { const b = el('button', { class: 'st2-btn', type: 'button', 'data-hint': hint, onclick: () => setTool(id) }, kit.icon(name)); b.dataset.tool = id; return b; };
  const tools = [toolBtn('draw', 'draw', 'Draw (P): click for a note, drag it into place'), toolBtn('paint', 'paint', 'Paint (B): drag to lay a run of notes'),
    toolBtn('erase', 'delete', 'Delete (D): click or drag over notes to rub them out'), toolBtn('select', 'select', 'Select (E): box notes in, then move, copy or delete them'),
    toolBtn('pan', 'pan', 'Move (H): drag to scroll the roll up, down and along. Two fingers do it with any tool')];
  // what the keyboard shortcuts do, on a button too (a phone has no Ctrl+C)
  const editSel = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'Edit: select all, copy, cut, paste, duplicate, delete' }, 'Edit');
  editSel.addEventListener('click', () => kit.menu(editSel, [
    { label: 'Select all (Ctrl+A)', fn: () => { sel = new Set(notes()); dirty = true; } },
    { label: 'Copy (Ctrl+C)', fn: () => copy() },
    { label: 'Cut (Ctrl+X)', fn: () => cut() },
    { label: 'Paste (Ctrl+V)', fn: () => { if (ch() && pat()) paste(); } },
    { label: 'Duplicate (Ctrl+B)', fn: () => { if (ch() && pat()) duplicate(); } },
    { sep: true },
    { label: 'Delete the selected (Del)', danger: true, fn: () => { if (sel.size) { for (const n of [...sel]) erase(n); S.changed('notes'); } } },
  ]));
  const snapSel = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'Snap: what notes stick to' });
  snapSel.addEventListener('click', () => kit.menu(snapSel, SNAPS.map(([n], i) => ({ label: n, checked: i === snap, fn: () => { snap = i; paintHead(); dirty = true; } }))));
  const stampSel = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'Stamp: draw a whole chord with one click' });
  stampSel.addEventListener('click', () => kit.menu(stampSel, STAMPS.map(([n], i) => ({ label: n, checked: i === stamp, fn: () => { stamp = i; paintHead(); } }))));
  const keySel = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'The song’s key: its notes are lit' });
  keySel.addEventListener('click', () => kit.menu(keySel, [
    { head: 'Root' }, ...NOTES.map((n, i) => ({ label: n, checked: i === S.project.key.root, fn: () => { S.project.key.root = i; S.changed('key'); } })),
    { head: 'Scale' }, { label: 'Major', checked: !S.project.key.minor, fn: () => { S.project.key.minor = false; S.changed('key'); } }, { label: 'Minor', checked: S.project.key.minor, fn: () => { S.project.key.minor = true; S.changed('key'); } },
  ]));
  const listen = el('button', { class: 'st2-btn', type: 'button', 'data-hint': 'Listen to the song for a few seconds and take its key', onclick: () => { if (ear.start()) { listen.classList.add('is-on'); listen.textContent = 'Listening…'; } } }, 'Listen');
  const ghostBtn = el('button', { class: 'st2-btn is-on', type: 'button', 'data-hint': 'Ghost notes: the other channels of this pattern, faintly', onclick: () => { ghost = !ghost; ghostBtn.classList.toggle('is-on', ghost); dirty = true; } }, 'Ghosts');
  const quant = el('button', { class: 'st2-btn', type: 'button', 'data-hint': 'Quantize: put the notes (or the selected ones) on the snap grid', onclick: () => quantize() }, 'Quantize');
  const clear = el('button', { class: 'st2-btn', type: 'button', 'data-hint': 'Clear: take out every note of this channel in this pattern', onclick: () => { const c = S.ch; if (c) { S.clearPart(c); sel.clear(); } } }, 'Clear');
  const canvas = el('canvas');
  const wrap = el('div', { class: 'st2-roll-canvas' }, canvas);
  const node = el('div', { class: 'st2-roll' },
    el('div', { class: 'st2-tools' }, chSel, ...tools, editSel, snapSel, stampSel, keySel, listen, ghostBtn, el('span', { class: 'st2-grow' }), quant, clear), wrap);
  const g = canvas.getContext('2d');
  const ear = keyListener(host, {
    onDone({ root, minor, name }) { listen.classList.remove('is-on'); listen.textContent = 'Listen'; S.project.key = { root, minor }; S.changed('key'); host.toast(`The song is in ${name}: its notes are lit in the piano roll.`); },
    onFail(m) { listen.classList.remove('is-on'); listen.textContent = 'Listen'; host.toast(m); },
  });
  function setTool(t) { tool = t; tools.forEach((b) => b.classList.toggle('is-on', b.dataset.tool === t)); }
  function paintHead() {
    const c = S.ch;
    chSel.textContent = c ? c.name : 'No channel';
    snapSel.textContent = `Snap ${SNAPS[snap][0]}`;
    stampSel.textContent = STAMPS[stamp][0];
    keySel.textContent = `${NOTES[S.project.key.root]} ${S.project.key.minor ? 'minor' : 'major'}`;
  }
  setTool('draw');

  const ch = () => S.ch;
  const pat = () => S.pat();
  const notes = () => (ch() && pat() ? part(pat(), ch().id).notes : []);
  const unit = () => SNAPS[snap][1];
  const scale = () => SCALE[S.project.key.minor ? 'minor' : 'major'];
  const inScale = (k) => scale().includes((((k - S.project.key.root) % 12) + 12) % 12);
  const nearest = (k) => { for (let d = 0; d < 7; d++) { if (inScale(k - d)) return k - d; if (inScale(k + d)) return k + d; } return k; };

  // ── geometry ───────────────────────────────────────────────────────────────────────────────
  let W = 0, H = 0;
  const gridH = () => H - RULER - VEL;
  const colW = () => zx || Math.max(10, (W - KEYS) / Math.max(16, pat()?.len || 16));
  const xOf = (s) => KEYS + (s - sx) * colW();
  const yOf = (k) => RULER + (HIGH - k) * ROW - sy;
  const stepAt = (x) => (x - KEYS) / colW() + sx;
  const keyAt = (y) => HIGH - Math.floor((y - RULER + sy) / ROW);
  function measure() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    W = w; H = h;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  const clampY = () => { sy = Math.max(0, Math.min((HIGH - LOW + 1) * ROW - gridH(), sy)); };
  function centre() {
    const ns = notes(), c = ch();
    let k = ROOT;
    if (ns.length) k = ns.reduce((a, n) => a + n.k, 0) / ns.length;
    else if (c?.plugin === 'synth' && /808|bass|reese/.test(c.params.preset)) k = 36;
    else if (c?.plugin === 'synth') k = 64;
    sy = (HIGH - k) * ROW - gridH() / 2;
    clampY();
  }

  // ── drawing ────────────────────────────────────────────────────────────────────────────────
  function draw() {
    if (!measure()) return;
    if (sy === null) centre();
    const c = ch(), p = pat(), cw = colW(), len = p?.len || 16;
    g.clearRect(0, 0, W, H);
    const slicer = c?.plugin === 'slicer';
    const count = slicer ? (S.engine?.slices(c)?.cuts.length || c.params.slices || 16) : 0;
    // the rows
    g.save();
    g.beginPath(); g.rect(0, RULER, W, gridH()); g.clip();
    for (let k = keyAt(RULER); k >= keyAt(RULER + gridH()) && k >= LOW; k--) {
      const y = yOf(k), pc = ((k % 12) + 12) % 12;
      const usable = !slicer || (k >= ROOT && k < ROOT + count);
      g.fillStyle = !usable ? '#1a1e20' : BLACK.includes(pc) ? '#2a3034' : '#323a3f';
      g.fillRect(KEYS, y, W - KEYS, ROW);
      if (usable && !slicer && inScale(k)) { g.fillStyle = pc === S.project.key.root ? 'rgba(243,155,63,0.14)' : 'rgba(243,155,63,0.06)'; g.fillRect(KEYS, y, W - KEYS, ROW); }
      g.fillStyle = pc === 0 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.18)';
      g.fillRect(KEYS, y + ROW - 1, W - KEYS, 1);
    }
    // the grid
    for (let s = Math.floor(sx); s <= len; s += unit() < 1 ? 0.5 : 1) {
      const x = Math.round(xOf(s)) + 0.5;
      if (x < KEYS) continue;
      g.fillStyle = s % 16 === 0 ? 'rgba(0,0,0,0.6)' : s % 4 === 0 ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.16)';
      g.fillRect(x, RULER, 1, gridH());
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(xOf(len), RULER, W, gridH());                    // past the end of the pattern
    // the other channels, faintly
    if (ghost && p) {
      g.strokeStyle = 'rgba(220,230,235,0.22)';
      for (const [id, q] of Object.entries(p.ch)) {
        if (id === c?.id) continue;
        for (const n of q.notes) { const y = yOf(n.k); if (y < RULER - ROW || y > RULER + gridH()) continue; g.strokeRect(xOf(n.s) + 0.5, y + 1.5, Math.max(2, n.l * cw - 1), ROW - 3); }
      }
    }
    // the notes
    const color = c?.color || '#8edc5b';
    for (const n of notes()) {
      const x = xOf(n.s) + 0.5, y = yOf(n.k) + 1, w = Math.max(3, n.l * cw - 1), h = ROW - 2;
      if (y + h < RULER || y > RULER + gridH() || x > W || x + w < KEYS) continue;
      const on = sel.has(n);
      g.fillStyle = on ? '#ffffff' : color;
      g.globalAlpha = 0.55 + 0.45 * ((n.v ?? 100) / 127);
      roundRect(x, y, w, h, 2);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = on ? color : 'rgba(0,0,0,0.55)';
      g.lineWidth = 1;
      roundRect(x, y, w, h, 2);
      g.stroke();
      if (w > 30) {
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.font = '700 8.5px Saira, Arial, sans-serif';
        g.textAlign = 'left';
        g.fillText(slicer ? `Slice ${n.k - ROOT + 1}` : noteName(n.k), x + 3, y + h - 3);
      }
    }
    if (drag?.mode === 'box') {
      g.strokeStyle = '#f39b3f'; g.setLineDash([3, 2]);
      g.strokeRect(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
      g.setLineDash([]);
    }
    g.restore();
    // the keyboard
    g.save();
    g.beginPath(); g.rect(0, RULER, KEYS, gridH()); g.clip();
    for (let k = keyAt(RULER); k >= keyAt(RULER + gridH()) && k >= LOW; k--) {
      const y = yOf(k), pc = ((k % 12) + 12) % 12, black = BLACK.includes(pc);
      g.fillStyle = held === k ? '#f39b3f' : black ? '#1c2023' : '#e2e7ea';
      g.fillRect(0, y, black ? KEYS * 0.62 : KEYS - 1, ROW - 1);
      if (black && held !== k) { g.fillStyle = '#d5dbde'; g.fillRect(KEYS * 0.62, y, KEYS * 0.38 - 1, ROW - 1); }
      if (slicer && k >= ROOT && k < ROOT + count) { g.fillStyle = '#1c2023'; g.font = '700 8px Saira, Arial, sans-serif'; g.textAlign = 'right'; g.fillText(`S${k - ROOT + 1}`, KEYS - 4, y + ROW - 3); }
      else if (pc === 0) { g.fillStyle = '#2a3034'; g.font = '700 8.5px Saira, Arial, sans-serif'; g.textAlign = 'right'; g.fillText(noteName(k), KEYS - 4, y + ROW - 3); }
    }
    g.restore();
    // the ruler
    g.fillStyle = '#1e2326';
    g.fillRect(0, 0, W, RULER);
    g.fillStyle = '#aab4b9';
    g.font = '600 9px Saira, Arial, sans-serif';
    g.textAlign = 'left';
    for (let b = 0; b * 16 <= len; b++) { const x = xOf(b * 16); if (x >= KEYS - 1) { g.fillRect(Math.round(x), RULER - 5, 1, 5); g.fillText(String(b + 1), x + 3, 11); } }
    // the velocity lane
    const vy = H - VEL;
    g.fillStyle = '#1b1f22';
    g.fillRect(0, vy, W, VEL);
    g.fillStyle = '#2b3236';
    g.fillRect(0, vy, W, 1);
    g.fillStyle = '#7d878d';
    g.font = '700 8px Saira, Arial, sans-serif';
    g.fillText('VELOCITY', 6, vy + 12);
    for (const n of notes()) {
      const x = xOf(n.s);
      if (x < KEYS || x > W) continue;
      const h = ((n.v ?? 100) / 127) * (VEL - 10);
      g.fillStyle = sel.has(n) ? '#ffffff' : color;
      g.fillRect(Math.round(x), vy + VEL - 4 - h, 2, h);
      g.beginPath(); g.arc(Math.round(x) + 1, vy + VEL - 4 - h, 3, 0, Math.PI * 2); g.fill();
    }
    // the playhead (in pattern mode, on this pattern)
    const at = S.engine?.position();
    if (at && at.mode !== 'song' && at.pattern === p?.id) { g.fillStyle = '#9be86a'; g.fillRect(Math.round(xOf(at.step)), 0, 1.5, H - VEL); }
    dirty = false;
  }
  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ── editing ────────────────────────────────────────────────────────────────────────────────
  const floorSnap = (s) => Math.floor(s / unit() + 1e-6) * unit();
  const nearSnap = (s) => Math.round(s / unit()) * unit();
  function chord(k) {
    const st = STAMPS[stamp][1];
    if (!st) return [k];
    if (Array.isArray(st)) return st.map((d) => k + d);
    // a chord of the key: the 1st, 3rd and 5th (and 7th) of the scale, from the note picked
    const base = nearest(k), sc = scale(), r = S.project.key.root;
    const deg = Math.max(0, sc.indexOf((((base - r) % 12) + 12) % 12));
    return (st === 'triad' ? [0, 2, 4] : [0, 2, 4, 6]).map((o) => { const d = deg + o; return base - sc[deg] + sc[d % 7] + Math.floor(d / 7) * 12; });
  }
  function hit(x, y) {
    const k = keyAt(y), s = stepAt(x), list = notes();
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.k === k && s >= n.s && s < n.s + n.l) return { n, edge: xOf(n.s + n.l) - x < 6 };
    }
    return null;
  }
  // FL turns a channel's steps into notes the moment its piano roll opens: so does this
  function adopt() {
    const c = ch(), p = pat();
    if (!c || !p) return;
    const q = part(p, c.id);
    if (q.notes.length || !q.steps.some(Boolean)) return;
    const count = c.plugin === 'slicer' ? (S.engine?.slices(c)?.cuts.length || c.params.slices || 16) : 1;
    q.steps.forEach((v, k) => { if (v && k < p.len) q.notes.push({ s: k, l: 1, k: c.plugin === 'slicer' ? ROOT + (k % count) : ROOT, v }); });
    q.steps.fill(0);
    S.changed('notes');
  }
  function addAt(s, y) {
    const len = pat()?.len || 16;
    if (s < 0 || s >= len) return [];
    const made = chord(keyAt(y)).filter((k) => k >= LOW && k <= HIGH).map((k) => ({ s, l: Math.min(lastLen, len - s), k, v: 100 }));
    part(pat(), ch().id).notes.push(...made);
    if (made[0]) S.audition(ch(), made[0].k);
    return made;
  }
  function erase(n) {
    const list = notes(), i = list.indexOf(n);
    if (i >= 0) { list.splice(i, 1); sel.delete(n); dirty = true; }
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Moving the view: the Move tool, the middle button, or a second finger. Two fingers on a touch
  // screen always scroll; whatever the first one had begun is put back, the way a phone does it.
  const fingers = new Map();
  function startPan(e, x, y) {
    if (drag && drag.mode !== 'pan') cancel();
    drag = { mode: 'pan', x0: x, y0: y, sx0: sx, sy0: sy ?? 0, id: e.pointerId };
    canvas.style.cursor = 'grabbing';
  }
  function cancel() {
    // a gesture that turned into a scroll: notes it made go, notes it moved or stretched go back
    if (!drag) return;
    if (drag.mode === 'key') { S.engine?.noteOff(ch(), held); held = null; }
    if (drag.made) for (const n of drag.made) erase(n);
    if (drag.erased?.length) notes().push(...drag.erased);
    if (drag.was) for (const [n, v] of drag.was) n.v = v;
    if (drag.mode === 'move') drag.notes.forEach((n, i) => { n.s = drag.from[i].s; n.k = drag.from[i].k; });
    if (drag.mode === 'resize') drag.notes.forEach((n, i) => { n.l = drag.from[i]; });
    drag = null;
    dirty = true;
  }
  canvas.addEventListener('pointerdown', (e) => {
    const c = ch();
    if (!c || !pat()) return;
    e.preventDefault();
    host.capture(canvas, e);
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerType === 'touch') fingers.set(e.pointerId, { x, y });
    if (fingers.size >= 2 || tool === 'pan' || e.button === 1) {
      const pts = [...fingers.values()], mx = pts.length ? pts.reduce((a, p) => a + p.x, 0) / pts.length : x, my = pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : y;
      startPan(e, mx, my);
      return;
    }
    if (y >= H - VEL) { drag = { mode: 'vel' }; velAt(x, y); return; }
    if (y < RULER) return;
    if (x < KEYS) { held = keyAt(y); S.wake()?.noteOn(c, held, 0.8); drag = { mode: 'key' }; dirty = true; return; }
    const h = hit(x, y);
    if (e.button === 2 || tool === 'delete') { drag = { mode: 'erase', any: false, erased: [] }; if (h) { erase(h.n); drag.erased.push(h.n); drag.any = true; } return; }
    if (tool === 'select' && !h) {
      if (!e.shiftKey) sel.clear();
      drag = { mode: 'box', x0: x, y0: y, x1: x, y1: y };
      dirty = true;
      return;
    }
    if (h) {
      if (!sel.has(h.n)) { if (!e.shiftKey) sel.clear(); sel.add(h.n); }
      const group = [...sel];
      drag = h.edge
        ? { mode: 'resize', notes: group, from: group.map((n) => n.l), x0: stepAt(x) }
        : { mode: 'move', notes: group, from: group.map((n) => ({ s: n.s, k: n.k })), s0: stepAt(x), k0: keyAt(y), lastK: h.n.k };
      S.audition(c, h.n.k);
    } else {
      sel.clear();
      const made = addAt(floorSnap(stepAt(x)), y);
      if (!made.length) return;
      made.forEach((n) => sel.add(n));
      drag = tool === 'paint'
        ? { mode: 'paint', last: made[0].s, made: [...made] }
        : { mode: 'move', notes: made, from: made.map((n) => ({ s: n.s, k: n.k })), s0: stepAt(x), k0: keyAt(y), lastK: made[0].k, made };
    }
    dirty = true;
  });
  const middle = () => { const pts = [...fingers.values()]; return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length }; };
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x, y });
    if (drag?.mode === 'pan') {
      const m = fingers.size ? middle() : { x, y };
      sx = Math.max(0, drag.sx0 - (m.x - drag.x0) / colW());
      sy = drag.sy0 - (m.y - drag.y0);
      clampY();
      dirty = true;
      return;
    }
    if (!drag) {
      const h = y >= RULER && y < H - VEL && x >= KEYS ? hit(x, y) : null;
      canvas.style.cursor = tool === 'pan' ? 'grab' : y >= H - VEL ? 'ns-resize' : x < KEYS ? 'pointer' : h ? (h.edge ? 'ew-resize' : 'move') : tool === 'delete' ? 'not-allowed' : tool === 'select' ? 'crosshair' : 'copy';
      return;
    }
    const c = ch(), len = pat()?.len || 16;
    if (drag.mode === 'vel') { velAt(x, y); return; }
    if (drag.mode === 'erase') { const h = hit(x, y); if (h) { erase(h.n); drag.erased.push(h.n); drag.any = true; } return; }
    if (drag.mode === 'key') { const k = keyAt(y); if (k !== held) { S.engine?.noteOff(c, held); held = k; S.engine?.noteOn(c, k, 0.8); dirty = true; } return; }
    if (drag.mode === 'box') {
      drag.x1 = x; drag.y1 = y;
      const s0 = stepAt(Math.min(drag.x0, x)), s1 = stepAt(Math.max(drag.x0, x)), k0 = keyAt(Math.max(drag.y0, y)), k1 = keyAt(Math.min(drag.y0, y));
      for (const n of notes()) { const inside = n.s + n.l > s0 && n.s < s1 && n.k >= k0 && n.k <= k1; if (inside) sel.add(n); else if (!e.shiftKey) sel.delete(n); }
      dirty = true;
      return;
    }
    if (drag.mode === 'paint') {
      const s = floorSnap(stepAt(x));
      if (Math.abs(s - drag.last) >= unit() - 1e-6 && s >= 0 && s < len) {
        if (!notes().some((n) => Math.abs(n.s - s) < 1e-6 && n.k === keyAt(y))) drag.made.push(...addAt(s, y));
        drag.last = s;
        dirty = true;
      }
      return;
    }
    if (drag.mode === 'move') {
      const ds = nearSnap(stepAt(x) - drag.s0), dk = keyAt(y) - drag.k0;
      const minS = Math.min(...drag.from.map((f) => f.s)), maxS = Math.max(...drag.from.map((f) => f.s));
      const maxK = Math.max(...drag.from.map((f) => f.k)), minK = Math.min(...drag.from.map((f) => f.k));
      const okDs = Math.max(-minS, Math.min(len - unit() - maxS, ds));
      const okDk = Math.max(LOW - minK, Math.min(HIGH - maxK, dk));
      drag.notes.forEach((n, i) => { n.s = drag.from[i].s + okDs; n.k = drag.from[i].k + okDk; });
      if (drag.notes[0] && drag.notes[0].k !== drag.lastK) { drag.lastK = drag.notes[0].k; S.audition(c, drag.lastK); }
      dirty = true;
      return;
    }
    if (drag.mode === 'resize') {
      const d = nearSnap(stepAt(x) - drag.x0);
      drag.notes.forEach((n, i) => { n.l = Math.max(unit(), Math.min(len - n.s, drag.from[i] + d)); });
      dirty = true;
    }
  });
  const up = (e) => {
    fingers.delete(e.pointerId);
    if (!drag) return;
    if (drag.mode === 'pan') {
      if (fingers.size) { const m = middle(); Object.assign(drag, { x0: m.x, y0: m.y, sx0: sx, sy0: sy }); return; }   // one finger still down: it carries on
      drag = null;
      canvas.style.cursor = '';
      return;
    }
    const c = ch(), mode = drag.mode;
    if (mode === 'key') { S.engine?.noteOff(c, held); held = null; }
    if ((mode === 'move' || mode === 'resize') && drag.notes[0]) lastLen = drag.notes[0].l;
    const changed = mode === 'move' || mode === 'resize' || mode === 'paint' || mode === 'vel' || (mode === 'erase' && drag.any);
    drag = null;
    dirty = true;
    if (changed) S.changed('notes');
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) { zx = Math.max(6, Math.min(80, colW() * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); }
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) sx = Math.max(0, sx + (e.deltaX || e.deltaY) / colW());
    else { sy += e.deltaY * 0.6; clampY(); }
    dirty = true;
  }, { passive: false });
  // the velocity lane: the notes under the pointer take the height it is at
  function velAt(x, y) {
    const v = Math.max(1, Math.min(127, Math.round(((H - 4 - y) / (VEL - 10)) * 127)));
    const s = stepAt(x), tol = Math.max(0.25, 4 / colW());
    let any = false;
    const was = drag?.mode === 'vel' ? (drag.was ||= new Map()) : null;      // to put back if it turns into a scroll
    for (const n of notes()) if (Math.abs(n.s - s) <= tol && (!sel.size || sel.has(n))) { if (was && !was.has(n)) was.set(n, n.v); n.v = v; any = true; }
    if (any) { S.hint(`Velocity: ${v}`, true); dirty = true; }
  }
  function quantize() {
    const list = sel.size ? [...sel] : notes();
    for (const n of list) n.s = Math.max(0, Math.min((pat()?.len || 16) - unit(), nearSnap(n.s)));
    dirty = true;
    S.changed('notes');
  }
  function copy() {
    const list = sel.size ? [...sel] : notes();
    if (!list.length) return;
    const s0 = Math.min(...list.map((n) => n.s)), s1 = Math.max(...list.map((n) => n.s + n.l));
    S.clipboard = { notes: list.map((n) => ({ ...n, s: n.s - s0 })), span: s1 - s0, from: s0 };
    S.hint(`Copied: ${list.length} note${list.length > 1 ? 's' : ''}`, true);
  }
  function cut() {
    copy();
    if (!sel.size) return;
    for (const n of [...sel]) erase(n);
    S.changed('notes');
  }
  function paste() {
    const cb = S.clipboard;
    if (!cb?.notes?.length) return;
    // at the playhead when it runs, else straight after where the notes came from
    const at = S.engine?.position(), len = pat().len;
    let s0 = at && at.mode !== 'song' ? floorSnap(at.step) : cb.from + cb.span;
    if (s0 + 0.001 >= len) s0 = 0;
    const made = cb.notes.filter((n) => s0 + n.s < len).map((n) => ({ ...n, s: s0 + n.s, l: Math.min(n.l, len - s0 - n.s) }));
    notes().push(...made);
    sel = new Set(made);
    dirty = true;
    S.changed('notes');
  }
  function duplicate() {
    const list = sel.size ? [...sel] : notes();
    if (!list.length) return;
    const s0 = Math.min(...list.map((n) => n.s)), s1 = Math.max(...list.map((n) => n.s + n.l));
    const span = Math.ceil((s1 - s0) / unit()) * unit(), len = pat().len;
    const made = list.filter((n) => n.s + span < len).map((n) => ({ ...n, s: n.s + span, l: Math.min(n.l, len - n.s - span) }));
    notes().push(...made);
    sel = new Set(made);
    dirty = true;
    S.changed('notes');
  }

  return {
    node,
    render() {
      paintHead();
      const key = `${ch()?.id}|${pat()?.id}`;
      if (key !== shownFor) { shownFor = key; sel.clear(); adopt(); sy = null; sx = 0; }
      dirty = true;
    },
    tick(dt) { ear.tick(dt); if (dirty || S.engine?.playing) draw(); },
    resize() { dirty = true; },
    // after an undo the notes are fresh copies: a selection (or a drag) of the old ones would edit nothing
    clearSelection() { sel = new Set(); if (drag && drag.mode !== 'pan' && drag.mode !== 'key') drag = null; dirty = true; },
    // the keys of an editor: they reach here only while this window is the one being worked in
    key(e) {
      const c = ch();
      if (!c || !pat()) return false;
      const ctrl = e.ctrlKey || e.metaKey, list = notes();
      if (ctrl && e.key.toLowerCase() === 'a') { sel = new Set(list); dirty = true; return true; }
      if (ctrl && e.key.toLowerCase() === 'c') { copy(); return true; }
      if (ctrl && e.key.toLowerCase() === 'x') { cut(); return true; }
      if (ctrl && e.key.toLowerCase() === 'v') { paste(); return true; }
      if (ctrl && e.key.toLowerCase() === 'b') { duplicate(); return true; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { for (const n of [...sel]) erase(n); S.changed('notes'); return true; }
      if (e.key.startsWith('Arrow') && sel.size) {
        const len = pat().len, group = [...sel];
        const dk = e.key === 'ArrowUp' ? (e.shiftKey ? 12 : 1) : e.key === 'ArrowDown' ? (e.shiftKey ? -12 : -1) : 0;
        const ds = e.key === 'ArrowRight' ? unit() : e.key === 'ArrowLeft' ? -unit() : 0;
        if (group.every((n) => n.k + dk >= LOW && n.k + dk <= HIGH && n.s + ds >= 0 && n.s + ds + 1e-6 < len)) group.forEach((n) => { n.k += dk; n.s += ds; });
        if (dk && group[0]) S.audition(c, group[0].k);
        dirty = true;
        S.changed('notes');
        return true;
      }
      if (e.key === 'Escape' && sel.size) { sel.clear(); dirty = true; return true; }
      if (!ctrl && S.project.ui.typing === false) {
        const t = { p: 'draw', b: 'paint', d: 'delete', e: 'select', h: 'pan' }[e.key.toLowerCase()];
        if (t) { setTool(t); return true; }
      }
      return false;
    },
  };
}
