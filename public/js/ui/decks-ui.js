// DJ — the decks console: two decks either side of a club mixer, their waveforms across the top.
//
// It is laid out the way a two-channel controller is. Each deck has a tempo fader on its outside
// edge (up is slower, down is faster, as on a CDJ), a jog wheel — touch the platter to scratch,
// push the rim to nudge — with CUE, PLAY and SYNC under it, and eight performance pads in five
// modes: hot cues, beat loops, rolls, beat jumps and the grid tools. The mixer in the middle has trim, a three-band
// isolator and a filter per channel, channel faders with level meters, the crossfader, and a beat
// FX unit. Above it all the two zoomed waveforms scroll past a fixed playhead with their beat grids,
// so you can see two kicks line up before you hear them.
import { clamp, el, store } from '../util.js';
import { Knob } from './knob.js';
import { Fader } from './fader.js';
import { DeckMixer, HOT_COLORS, TEMPO_RANGES, FX_BEATS, REV_SECONDS } from '../audio/decks.js';

const PAD_MODES = [
  { id: 'hot', label: 'Cues' },
  { id: 'loop', label: 'Loop', beats: [0.25, 0.5, 1, 2, 4, 8, 16, 32] },
  { id: 'roll', label: 'Roll', beats: [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8] },
  { id: 'jump', label: 'Jump', beats: [-1, 1, -4, 4, -16, 16, -32, 32] },
  { id: 'grid', label: 'Grid', actions: ['Tap', '×2', '÷2', 'Reset', '◀ ½', '½ ▶', '◀ 10ms', '10ms ▶'] },
];
const KEYS = {
  A: { pads: ['1', '2', '3', '4', 'q', 'w', 'e', 'r'], cue: 'z', play: 'x', sync: 's' },
  B: { pads: ['7', '8', '9', '0', 'u', 'i', 'o', 'p'], cue: 'n', play: 'm', sync: 'j' },
};
const DECK_COLOR = { A: '#45c8ff', B: '#ffad45' };
const WAVE = { low: '#2f7bff', mid: '#ffa233', high: '#f2f0ff' };
const beatName = (b) => (Math.abs(b) >= 1 ? String(Math.abs(b)) : `1/${Math.round(1 / Math.abs(b))}`);
const fmtTime = (s, tenths = true) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `${m}:${(tenths ? sec.toFixed(1) : Math.floor(sec).toString()).padStart(tenths ? 4 : 2, '0')}`;
};

// ── controls ─────────────────────────────────────────────────────────────────
// The tempo fader: a centre detent, minus at the top and plus at the bottom, as on a CDJ.
class TempoFader {
  constructor({ label, onChange }) {
    this.value = 0;
    this.onChange = onChange;
    this.fill = el('span', { class: 'tf-fill' });
    this.cap = el('span', { class: 'tf-cap' });
    this.slot = el('span', { class: 'tf-slot' }, el('span', { class: 'tf-zero' }), this.fill, this.cap);
    this.el = el('div', { class: 'tf', role: 'slider', tabindex: '0', 'aria-label': label, title: `${label}: drag, scroll or arrow keys. Double-click returns to 0.` }, this.slot);
    let drag = false;
    const from = (e) => {
      const r = this.slot.getBoundingClientRect();
      let v = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (Math.abs(v) < 0.025) v = 0;                         // the detent
      this.set(v);
    };
    this.el.addEventListener('pointerdown', (e) => { if (e.button) return; drag = true; this.el.setPointerCapture(e.pointerId); from(e); e.preventDefault(); });
    this.el.addEventListener('pointermove', (e) => { if (drag) from(e); });
    const stop = () => { drag = false; };
    this.el.addEventListener('pointerup', stop);
    this.el.addEventListener('lostpointercapture', stop);
    this.el.addEventListener('dblclick', () => this.set(0));
    this.el.addEventListener('wheel', (e) => { e.preventDefault(); this.set(this.value + (e.deltaY > 0 ? 1 : -1) * (e.shiftKey ? 0.002 : 0.0125)); }, { passive: false });
    this.el.addEventListener('keydown', (e) => {
      const d = { ArrowUp: -0.0125, ArrowDown: 0.0125 }[e.key];
      if (d !== undefined) { e.preventDefault(); e.stopPropagation(); this.set(this.value + d * (e.shiftKey ? 0.2 : 1)); }
    });
    this.render();
  }
  set(v, { silent = false } = {}) {
    this.value = clamp(v, -1, 1);
    this.render();
    if (!silent) this.onChange(this.value);
  }
  render() {
    const pct = 50 + this.value * 50;
    this.cap.style.top = `${pct}%`;
    this.fill.style.top = `${Math.min(50, pct)}%`;
    this.fill.style.height = `${Math.abs(this.value) * 50}%`;
    this.el.classList.toggle('is-on', Math.abs(this.value) > 0.0005);
  }
}

// The crossfader.
class CrossFader {
  constructor({ onChange }) {
    this.value = 0.5;
    this.onChange = onChange;
    this.cap = el('span', { class: 'xf-cap' });
    this.slot = el('span', { class: 'xf-slot' }, el('span', { class: 'xf-mid' }), this.cap);
    this.el = el('div', { class: 'xf', role: 'slider', tabindex: '0', 'aria-label': 'Crossfader', title: 'Crossfader: drag, scroll or ← →. Double-click centres it.' }, this.slot);
    let drag = false;
    const from = (e) => {
      const r = this.slot.getBoundingClientRect();
      let v = (e.clientX - r.left) / r.width;
      if (Math.abs(v - 0.5) < 0.02) v = 0.5;
      this.set(v);
    };
    this.el.addEventListener('pointerdown', (e) => { if (e.button) return; drag = true; this.el.setPointerCapture(e.pointerId); from(e); e.preventDefault(); });
    this.el.addEventListener('pointermove', (e) => { if (drag) from(e); });
    const stop = () => { drag = false; };
    this.el.addEventListener('pointerup', stop);
    this.el.addEventListener('lostpointercapture', stop);
    this.el.addEventListener('dblclick', () => this.set(0.5));
    this.el.addEventListener('wheel', (e) => { e.preventDefault(); this.set(this.value + (e.deltaY > 0 ? 0.04 : -0.04)); }, { passive: false });
    this.render();
  }
  set(v) { this.value = clamp(v, 0, 1); this.render(); this.onChange(this.value); }
  render() { this.cap.style.left = `${this.value * 100}%`; }
}

// The jog wheel. The platter turns with the record: one turn is 1.8 s of music. A hand on the
// platter scratches; dragging the rim bends the speed for as long as it moves (nudging into phase);
// the scroll wheel does a small bend while playing, or fine-searches while stopped.
class Jog {
  constructor(deck) {
    this.deck = deck;
    this.platter = el('div', { class: 'jog-platter' }, el('span', { class: 'jog-mark' }));
    this.bpmEl = el('span', { class: 'jog-bpm' }, '—');
    this.el = el('div', { class: 'jog', title: 'Touch the platter to scratch, drag the rim to nudge, scroll to bend' },
      el('div', { class: 'jog-rim' }), this.platter,
      el('div', { class: 'jog-center' }, el('span', { class: 'jog-letter' }, deck.id), this.bpmEl));
    this.bend = 0;
    this.pulse = 0;
    this.sent = 0;
    this.drag = null;
    this.deg = -1;
    this.#bind();
  }

  #bind() {
    const node = this.el;
    const angleOf = (e) => {
      const r = node.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    node.addEventListener('pointerdown', (e) => {
      if (e.button || !this.deck.loaded) return;
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      const r = node.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width / 2);
      this.drag = { rim: d > 0.8, last: angleOf(e), total: 0, t: performance.now() };
      if (!this.drag.rim) { this.deck.scratchStart(); node.classList.add('is-touched'); }
    });
    node.addEventListener('pointermove', (e) => {
      const g = this.drag;
      if (!g) return;
      const a = angleOf(e);
      let d = a - g.last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      g.last = a;
      g.total += d;
      const now = performance.now(), dt = Math.max(1, now - g.t) / 1000;
      g.t = now;
      if (!g.rim) this.deck.scratchMove((g.total / (2 * Math.PI)) * REV_SECONDS);
      else if (this.deck.playing) this.bend = clamp((d / dt / (2 * Math.PI)) * 0.12, -0.3, 0.3);
      else this.deck.seek(this.deck.position + (d / (2 * Math.PI)) * REV_SECONDS * 0.5);
    });
    const end = () => {
      if (!this.drag) return;
      if (!this.drag.rim) { this.deck.scratchEnd(); node.classList.remove('is-touched'); }
      this.drag = null;
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.addEventListener('lostpointercapture', end);
    node.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.deck.loaded) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      if (this.deck.playing) this.pulse = clamp(this.pulse + dir * 0.03, -0.12, 0.12);
      else this.deck.seek(this.deck.position + dir * (e.shiftKey ? 0.004 : 0.04));
    }, { passive: false });
  }

  tick(dt) {
    // the rim's bend lasts only while it is moving; the scroll's bend fades out on its own
    if (this.drag?.rim && performance.now() - this.drag.t > 60) this.bend = 0;
    if (!this.drag?.rim) this.bend *= Math.exp(-dt / 0.05);
    this.pulse *= Math.exp(-dt / 0.15);
    const b = this.bend + this.pulse;
    if (Math.abs(b - this.sent) > 1e-4 || (b === 0 && this.sent !== 0)) { this.deck.bend(Math.abs(b) < 1e-4 ? 0 : b); this.sent = Math.abs(b) < 1e-4 ? 0 : b; }
    const deg = Math.round((((this.deck.position / REV_SECONDS) * 360) % 360) * 10) / 10;
    if (deg !== this.deg) { this.deg = deg; this.platter.style.transform = `rotate(${deg}deg)`; }   // a still platter costs no style work
  }
}

// A level meter: fourteen segments, green to amber to red, with a falling peak hold.
class Meter {
  constructor(cls = '') {
    this.canvas = el('canvas', { class: `dj-meter ${cls}`, width: 10, height: 120 });
    this.g = this.canvas.getContext('2d');
    this.level = 0;
    this.hold = 0;
    this.holdT = 0;
  }
  get quiet() { return this.level === 0 && this.hold === 0; }
  draw(peak, dt) {
    const db = 20 * Math.log10(Math.max(peak, 1e-5));
    const v = clamp((db + 36) / 39, 0, 1);                  // -36 dBFS … +3
    this.level = Math.max(v, this.level - dt * 1.6);
    if (v >= this.hold) { this.hold = v; this.holdT = 0.9; } else if ((this.holdT -= dt) <= 0) this.hold = Math.max(0, this.hold - dt * 0.6);
    const { canvas: c, g } = this;
    const w = c.width, h = c.height, n = 14, seg = h / n;
    // painted again only when a segment comes on or goes off
    const lit = `${Math.floor(n * (this.level + 1e-6))}|${Math.floor(n * (this.hold + 1e-6))}`;
    if (lit === this.lit) return;
    this.lit = lit;
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const lit = (i + 1) / n <= this.level + 1e-6;
      const top = (i + 1) / n > this.hold - 1 / n && (i + 1) / n <= this.hold + 1e-6;
      const col = i >= n - 2 ? '#ff3b3b' : i >= n - 5 ? '#ffc23b' : '#46e07a';
      g.fillStyle = lit || top ? col : 'rgba(255,255,255,0.07)';
      g.globalAlpha = lit || top ? 1 : 1;
      g.fillRect(0, h - (i + 1) * seg + 1, w, seg - 2);
    }
  }
}

// ── waveforms ────────────────────────────────────────────────────────────────
function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}

// The zoomed view: the music scrolls past a fixed playhead, three bands drawn over each other
// (lows blue, mids amber, highs white), the beat grid behind, cues, hot cues and loops on top.
function drawWave(canvas, deck, span) {
  const g = canvas.getContext('2d');
  const dpr = fitCanvas(canvas);
  const w = canvas.width, h = canvas.height, mid = w / 2, half = h / 2;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0, 0, w, h);
  if (!deck.loaded) {
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.font = `${11 * dpr}px "Saira Semi Condensed", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(deck.loading ? `Loading “${deck.loading.title}”…` : `Deck ${deck.id} — load a track from the crate (A / B on any row) or drop a file on the deck`, mid, half);
    return;
  }
  const { bins, binRate } = deck.info;
  const pos = deck.position;
  const pps = w / span;
  const t0 = pos - mid / pps, t1 = pos + mid / pps;
  // the loop under everything
  const loop = deck.roll || deck.loop;
  if (loop) {
    g.fillStyle = deck.roll ? 'rgba(255,90,200,0.18)' : 'rgba(80,255,140,0.16)';
    const a = mid + (loop.start - pos) * pps, b = mid + (loop.end - pos) * pps;
    g.fillRect(a, 0, b - a, h);
  }
  // the beat grid: every beat faint, every bar brighter
  if (deck.bpm) {
    const p = deck.period, f = deck.first;
    for (let k = Math.ceil((t0 - f) / p); ; k++) {
      const t = f + k * p;
      if (t > t1) break;
      const x = Math.round(mid + (t - pos) * pps);
      const bar = ((k % 4) + 4) % 4 === 0;
      g.fillStyle = bar ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.13)';
      g.fillRect(x, 0, bar ? Math.max(1, dpr) : 1, h);
    }
  }
  // three bands, one path each
  const n = bins.length / 3;
  for (let band = 0; band < 3; band++) {
    g.beginPath();
    const scale = band === 0 ? 0.96 : band === 1 ? 0.78 : 0.6;
    for (let x = 0; x < w; x++) {
      const t = pos + (x - mid) / pps;
      if (t < 0) continue;
      const i = Math.floor(t * binRate);
      if (i >= n) break;
      const v = bins[i * 3 + band] / 255;
      if (v < 0.01) continue;
      const hh = v * half * scale;
      g.rect(x, half - hh, 1, hh * 2);
    }
    g.fillStyle = band === 0 ? WAVE.low : band === 1 ? WAVE.mid : WAVE.high;
    g.globalAlpha = band === 0 ? 0.95 : band === 1 ? 0.85 : 0.75;
    g.fill();
  }
  g.globalAlpha = 1;
  // the cue point and the hot cues
  const marker = (t, color, label) => {
    const x = mid + (t - pos) * pps;
    if (x < -20 || x > w + 20) return;
    g.fillStyle = color;
    g.fillRect(Math.round(x), 0, Math.max(1, dpr), h);
    g.beginPath(); g.moveTo(x - 5 * dpr, 0); g.lineTo(x + 5 * dpr, 0); g.lineTo(x, 7 * dpr); g.closePath(); g.fill();
    if (label) {
      g.font = `600 ${9 * dpr}px "Martian Mono", monospace`;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(label, x + 3 * dpr, 7 * dpr);
    }
  };
  marker(deck.cue, '#ff9a1f', '');
  deck.hot.forEach((t, i) => { if (t !== null) marker(t, HOT_COLORS[i], String.fromCharCode(65 + i)); });
  if (deck.loopIn !== null && !deck.loop) marker(deck.loopIn, '#50ff8c', 'IN');
  // the playhead
  g.fillStyle = '#ff2b4f';
  g.fillRect(Math.round(mid - dpr), 0, Math.max(2, 2 * dpr), h);
}

// The overview: the whole track, the part already played dimmed.
class Overview {
  constructor(deck) {
    this.deck = deck;
    this.canvas = el('canvas', { class: 'dj-overview', title: 'Click or drag to move the needle' });
    this.image = null;
    let drag = false;
    const go = (e) => {
      if (!this.deck.loaded) return;
      const r = this.canvas.getBoundingClientRect();
      this.deck.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * this.deck.duration);
    };
    this.canvas.addEventListener('pointerdown', (e) => { if (e.button) return; drag = true; this.canvas.setPointerCapture(e.pointerId); go(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (drag) go(e); });
    this.canvas.addEventListener('pointerup', () => { drag = false; });
    this.canvas.addEventListener('lostpointercapture', () => { drag = false; });
  }
  build() {
    const c = this.canvas;
    fitCanvas(c);
    this.image = null;
    if (!this.deck.loaded) return;
    const off = document.createElement('canvas');
    off.width = c.width; off.height = c.height;
    const g = off.getContext('2d');
    const ov = this.deck.info.overview, cols = ov.length / 3;
    const half = off.height / 2;
    for (let band = 0; band < 3; band++) {
      g.beginPath();
      for (let x = 0; x < off.width; x++) {
        const i = Math.floor((x / off.width) * cols);
        const hh = (ov[i * 3 + band] / 255) * half * (band === 0 ? 0.98 : band === 1 ? 0.78 : 0.6);
        g.rect(x, half - hh, 1, hh * 2);
      }
      g.fillStyle = band === 0 ? WAVE.low : band === 1 ? WAVE.mid : WAVE.high;
      g.globalAlpha = band === 0 ? 0.9 : 0.8;
      g.fill();
    }
    this.image = off;
  }
  draw() {
    const c = this.canvas;
    const g = c.getContext('2d');
    const dpr = fitCanvas(c);
    if (this.image && (this.image.width !== c.width || this.image.height !== c.height)) this.build();
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, c.width, c.height);
    if (!this.image) return;
    g.drawImage(this.image, 0, 0);
    const d = this.deck, w = c.width, h = c.height;
    const x = (d.position / d.duration) * w;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, x, h);
    const tick = (t, color) => { g.fillStyle = color; g.fillRect(Math.round((t / d.duration) * w), 0, Math.max(1, dpr), h); };
    tick(d.cue, '#ff9a1f');
    d.hot.forEach((t, i) => { if (t !== null) tick(t, HOT_COLORS[i]); });
    if (d.loop) { g.fillStyle = 'rgba(80,255,140,0.3)'; g.fillRect((d.loop.start / d.duration) * w, 0, Math.max(2, ((d.loop.end - d.loop.start) / d.duration) * w), h); }
    g.fillStyle = '#fff';
    g.fillRect(Math.round(x - dpr), 0, Math.max(2, 2 * dpr), h);
  }
}

// ── the console ──────────────────────────────────────────────────────────────
export function buildDecks({ engine, crate, toast, openCrate, onModeChange }) {
  const root = el('section', { class: 'dj', id: 'dj', 'aria-label': 'DJ decks', hidden: true });
  document.body.append(root);
  let mixer = null;
  let creating = null;
  let built = null;
  let span = store.get('dj:zoom', 10);
  let frame = 0;

  async function ensureMixer() {
    if (mixer) return mixer;
    creating ||= DeckMixer.create(engine.ensureContext()).then((m) => { mixer = m; built = build(m); return m; })
      .catch((e) => { creating = null; throw e; });         // the next press tries again
    return creating;
  }

  // ── building it ──────────────────────────────────────────────────────────
  function build(m) {
    const waves = m.decks.map((d) => el('canvas', { class: `dj-wave is-${d.id.toLowerCase()}`, title: `Deck ${d.id}` }));
    const phase = el('span', { class: 'dj-phase-dot' });
    const zoomBtn = (dir, label) => el('button', { class: 'dj-mini', type: 'button', title: dir < 0 ? 'Zoom in' : 'Zoom out', onclick: () => { span = clamp(span * (dir < 0 ? 0.7 : 1.43), 3, 40); store.set('dj:zoom', span); } }, label);
    const wavesBox = el('div', { class: 'dj-waves' },
      el('div', { class: 'dj-wave-stack' }, waves[0], el('div', { class: 'dj-phase', title: 'Phase: where Deck B’s beat falls against Deck A’s' }, el('span', { class: 'dj-phase-mid' }), phase), waves[1]),
      el('div', { class: 'dj-wave-tools' }, zoomBtn(-1, '+'), zoomBtn(1, '−'), el('span', { class: 'dj-tools-gap' }),
        el('button', { class: 'dj-mini', type: 'button', title: 'Hide the console (D). The decks keep playing.', onclick: () => open(false) }, 'Hide'),
        el('button', { class: 'dj-mini dj-exit', type: 'button', title: 'Leave DJ mode: stop both decks and go back to the normal player', onclick: () => exitDj({ resume: idle() }) }, 'Exit')));

    const panels = m.decks.map((d) => buildDeck(m, d));
    for (const d of m.decks) d.addEventListener('load', () => {
      if (!d.track && !d.loading) crate.temporary?.clear(`deck${d.id}`).catch(() => {});
    });
    const mixerPanel = buildMixer(m);
    root.append(wavesBox, el('div', { class: 'dj-body' }, panels[0].el, mixerPanel.el, panels[1].el));

    m.addEventListener('onair', (e) => {
      engine.dispatchEvent(new CustomEvent('djtrack', { detail: e.detail.track }));
      panels.forEach((p) => p.el.classList.toggle('is-on-air', p.deck === e.detail));
    });
    m.addEventListener('trim', (e) => { mixerPanel.trims[m.decks.indexOf(e.detail)].setValue(m.strip(e.detail).trimDb, { silent: true }); });
    // a waveform that changes size (a rotated phone, a wider window) is drawn again at its new size
    if (typeof ResizeObserver === 'function') {
      const sized = new ResizeObserver(() => panels.forEach((p) => { p.view.dirty = true; }));
      for (const c of [...waves, ...panels.map((p) => p.overview.canvas)]) sized.observe(c);
    }
    return { waves, phase, panels, mixerPanel, phaseAt: '' };
  }

  function buildDeck(m, deck) {
    const keys = KEYS[deck.id];
    const right = deck.id === 'B';
    let mode = 'hot';
    const view = { dirty: true, at: -1, span: 0 };      // the waves are drawn again only when they can have changed
    const put = (node, s) => { if (node.textContent !== s) node.textContent = s; };
    // header
    const title = el('div', { class: 'dj-title' }, '—');
    const artist = el('div', { class: 'dj-artist' }, '');
    const bpm = el('div', { class: 'dj-bpm' }, '—');
    const tempoText = el('div', { class: 'dj-tempo-text' }, '0.00%');
    const time = el('button', { class: 'dj-time', type: 'button', title: 'Remaining · click for elapsed' }, '0:00.0');
    let showRemain = true;
    time.addEventListener('click', () => { showRemain = !showRemain; time.title = showRemain ? 'Remaining · click for elapsed' : 'Elapsed · click for remaining'; });
    const lamps = [0, 1, 2, 3].map(() => el('span', { class: 'dj-lamp' }));
    const load = el('button', { class: 'dj-mini', type: 'button', title: 'Open the crate to pick a track (A / B on any row)', onclick: () => openCrate(true) }, 'Load');
    const head = el('div', { class: 'dj-head' },
      el('span', { class: 'dj-letter' }, deck.id),
      el('div', { class: 'dj-names' }, title, artist),
      el('div', { class: 'dj-lamps', title: 'Beat of the bar' }, lamps),
      el('div', { class: 'dj-readout' }, bpm, tempoText),
      time, load);
    const overview = new Overview(deck);

    // tempo column
    const tempo = new TempoFader({ label: `Deck ${deck.id} tempo`, onChange: (v) => deck.setTempo(v * deck.range) });
    const rangeBtn = el('button', { class: 'dj-mini', type: 'button', title: 'Tempo range', onclick: () => { const i = TEMPO_RANGES.indexOf(deck.range); deck.setRange(TEMPO_RANGES[(i + 1) % TEMPO_RANGES.length]); } }, '±8');
    const keyBtn = el('button', { class: 'dj-mini dj-toggle', type: 'button', title: 'Key lock: change tempo without changing the key', onclick: () => deck.setKeylock(!deck.keylock) }, 'Key');
    const tempoCol = el('div', { class: 'dj-tempo-col' }, rangeBtn, tempo.el, keyBtn);

    // jog and transport
    const jog = new Jog(deck);
    const big = (cls, label, key, title) => el('button', { class: `dj-big ${cls}`, type: 'button', title: `${title} (${key.toUpperCase()})` }, el('span', {}, label));
    const cueBtn = big('is-cue', 'CUE', keys.cue, 'Cue: playing → back to the cue; stopped → set the cue here; held on the cue → play while held');
    const playBtn = big('is-play', '▶ ‖', keys.play, 'Play / pause');
    const syncBtn = el('button', { class: 'dj-mini dj-sync dj-toggle', type: 'button', title: `Sync tempo and beat to the other deck (${keys.sync.toUpperCase()})` }, 'Sync');
    const slipBtn = el('button', { class: 'dj-mini dj-toggle', type: 'button', title: 'Slip: while you scratch, the track runs on underneath; let go and it carries on from there' }, 'Slip');
    momentary(cueBtn, () => deck.cueDown(), () => deck.cueUp());
    cueBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    playBtn.addEventListener('click', () => deck.togglePlay());
    syncBtn.addEventListener('click', () => { if (deck.synced) { deck.synced = false; refresh(); } else if (!deck.sync()) toast('Sync needs a beat grid on both decks: load a track into each.'); });
    slipBtn.addEventListener('click', () => deck.setSlip(!deck.slipMode));
    const jogCol = el('div', { class: 'dj-jog-col' }, jog.el, el('div', { class: 'dj-transport' }, cueBtn, playBtn, el('div', { class: 'dj-transport-small' }, syncBtn, slipBtn)));

    // pads
    const modeBtns = PAD_MODES.map((pm) => el('button', { class: 'dj-mode', type: 'button', onclick: () => { mode = pm.id; refreshPads(); } }, pm.label));
    const pads = keys.pads.map((k, i) => {
      const b = el('button', { class: 'dj-pad', type: 'button' }, el('span', { class: 'dj-pad-label' }, ''), el('span', { class: 'dj-pad-key' }, k.toUpperCase()));
      momentary(b, (e) => padDown(i, e), () => padUp(i));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (mode === 'hot') deck.clearHotCue(i); });
      return b;
    });
    const padDown = (i, e) => {
      if (mode === 'hot') { if (e?.shiftKey) deck.clearHotCue(i); else deck.hotCue(i); }
      else if (mode === 'loop') deck.beatLoop(PAD_MODES[1].beats[i]);
      else if (mode === 'roll') deck.rollOn(PAD_MODES[2].beats[i]);
      else if (mode === 'jump') deck.beatJump(PAD_MODES[3].beats[i]);
      else if (i === 0) { if (deck.tap() === 'paused') toast('Tap along while the deck plays.'); setTimeout(refreshPads, 2100); }
      else if (i === 1) deck.gridDouble();
      else if (i === 2) deck.gridHalve();
      else if (i === 3) deck.gridReset();
      else if (i === 4 || i === 5) deck.gridShift(i === 4 ? -0.5 : 0.5);
      else if (deck.bpm) deck.gridShift((i === 6 ? -0.01 : 0.01) / deck.period);
      refreshPads();
    };
    const padUp = () => { if (mode === 'roll') deck.rollOff(); refreshPads(); };
    const loopRow = el('div', { class: 'dj-loop-row' },
      el('button', { class: 'dj-mini', type: 'button', title: 'Loop in', onclick: () => deck.setLoopIn() }, 'In'),
      el('button', { class: 'dj-mini', type: 'button', title: 'Loop out', onclick: () => deck.setLoopOut() }, 'Out'),
      el('button', { class: 'dj-mini', type: 'button', title: 'Halve the loop', onclick: () => deck.loopHalve() }, '½'),
      el('button', { class: 'dj-mini', type: 'button', title: 'Double the loop', onclick: () => deck.loopDouble() }, '2×'),
      el('button', { class: 'dj-mini', type: 'button', title: 'Exit the loop, or go back into the last one', onclick: () => deck.reloop() }, 'Exit'));
    const padCol = el('div', { class: 'dj-pad-col' }, el('div', { class: 'dj-modes' }, modeBtns), el('div', { class: 'dj-pads' }, pads), loopRow);

    const main = el('div', { class: 'dj-main' }, ...(right ? [padCol, jogCol, tempoCol] : [tempoCol, jogCol, padCol]));
    const panel = el('div', { class: `dj-deck is-${deck.id.toLowerCase()}`, style: `--deck:${DECK_COLOR[deck.id]}`, dataset: { deck: deck.id } }, head, overview.canvas, main);

    function refreshPads() {
      modeBtns.forEach((b, i) => b.classList.toggle('is-active', PAD_MODES[i].id === mode));
      pads.forEach((b, i) => {
        const label = b.firstChild;
        let lit = false, color = '';
        if (mode === 'hot') {
          const t = deck.hot[i];
          label.textContent = t === null ? String.fromCharCode(65 + i) : String.fromCharCode(65 + i);
          lit = t !== null;
          color = HOT_COLORS[i];
        } else if (mode === 'loop') {
          const bt = PAD_MODES[1].beats[i];
          label.textContent = beatName(bt);
          lit = !!deck.loop && Math.abs(deck.loop.beats - bt) < 1e-6;
          color = '#50ff8c';
        } else if (mode === 'roll') {
          const bt = PAD_MODES[2].beats[i];
          label.textContent = beatName(bt);
          lit = !!deck.roll && Math.abs(deck.roll.beats - bt) < 1e-6;
          color = '#ff5ac8';
        } else if (mode === 'jump') {
          const bt = PAD_MODES[3].beats[i];
          label.textContent = `${bt < 0 ? '◀' : '▶'} ${beatName(bt)}`;
          color = '#9db4ff';
        } else {
          const run = i === 0 && deck.taps && performance.now() - deck.taps.at < 2000 ? deck.taps.list.length : 0;
          label.textContent = run ? `Tap ${run}` : PAD_MODES[4].actions[i];
          color = '#ffb547';
          lit = run > 0;
        }
        b.classList.toggle('is-lit', lit);
        b.style.setProperty('--pad', color);
      });
    }

    function refresh() {
      view.dirty = true;
      title.textContent = deck.track?.title || (deck.loading ? `Loading “${deck.loading.title}”…` : 'No track');
      artist.textContent = deck.track ? (deck.track.artist || (deck.track.source === 'file' ? 'Local file' : '')) : '';
      rangeBtn.textContent = `±${deck.range}`;
      keyBtn.classList.toggle('is-active', deck.keylock);
      syncBtn.classList.toggle('is-active', deck.synced);
      slipBtn.classList.toggle('is-active', deck.slipMode);
      playBtn.classList.toggle('is-active', deck.playing);
      cueBtn.classList.toggle('is-ready', deck.loaded && !deck.playing);
      tempo.set(deck.range ? deck.tempo / deck.range : 0, { silent: true });
      panel.classList.toggle('is-empty', !deck.loaded);
      refreshPads();
    }
    ['state', 'tempo', 'cues', 'loop', 'grid'].forEach((ev) => deck.addEventListener(ev, refresh));
    deck.addEventListener('loading', refresh);
    deck.addEventListener('load', () => { overview.build(); refresh(); });
    deck.addEventListener('ended', () => toast(`Deck ${deck.id} reached the end of the track.`));
    refresh();

    return {
      deck, el: panel, jog, overview, cueBtn, playBtn, pads, padDown, padUp, refresh, view,
      text() {
        const p = deck.position;
        put(time, deck.loaded ? (showRemain ? `-${fmtTime(deck.duration - p)}` : fmtTime(p)) : '0:00.0');
        put(bpm, deck.bpm ? deck.liveBpm.toFixed(2) : '—');
        // a tempo the analysis was not sure of: shown, but marked, with the Grid pads to fix it
        bpm.classList.toggle('is-unsure', deck.loaded && deck.info.confidence < 0.25 && !deck.gridEdited);
        put(jog.bpmEl, deck.bpm ? deck.liveBpm.toFixed(1) : '—');
        put(tempoText, `${deck.tempo >= 0 ? '+' : '−'}${Math.abs(deck.tempo).toFixed(2)}%`);
        const beat = deck.bpm && deck.loaded ? ((deck.beatAt(p).beat % 4) + 4) % 4 : -1;
        lamps.forEach((l, i) => l.classList.toggle('is-lit', i === beat && (deck.playing || deck.previewing)));
        time.classList.toggle('is-warn', deck.loaded && showRemain && deck.duration - p < 30 && deck.playing);
        playBtn.classList.toggle('is-blink', deck.loaded && !deck.playing && (frame >> 4) % 2 === 0);
      },
    };
  }

  function buildMixer(m) {
    const strips = m.decks.map((deck, i) => {
      const s = m.strip(deck);
      const dbFmt = (v) => (v <= -0.995 ? 'KILL' : `${v < 0 ? (20 * Math.log10(Math.pow(1 + v, 2.2))).toFixed(0) : `+${(20 * Math.log10(1 + v)).toFixed(1)}`} dB`);
      const trim = new Knob({ id: `trim${i}`, label: 'Trim', min: -12, max: 12, def: 0, value: s.trimDb, origin: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`, onChange: (v) => m.setTrim(deck, v) });
      const eq = ['high', 'mid', 'low'].map((band) => new Knob({ id: `${band}${i}`, label: band === 'high' ? 'Hi' : band === 'mid' ? 'Mid' : 'Low', min: -1, max: 1, def: 0, value: 0, origin: 0, fmt: dbFmt, onChange: (v) => m.setEq(deck, band, v) }));
      const filter = new Knob({ id: `filter${i}`, label: 'Filter', min: -1, max: 1, def: 0, value: 0, origin: 0, fmt: (v) => (Math.abs(v) < 0.04 ? '—' : v < 0 ? `LPF ${Math.round(-v * 100)}` : `HPF ${Math.round(v * 100)}`), onChange: (v) => m.setFilter(deck, v) });
      const fader = new Fader({ id: `ch${i}`, label: deck.id, value: 1, def: 1, onChange: (v) => m.setFader(deck, v) });
      // the fader stands beside the knobs, on the side facing the meters
      const col = el('div', { class: `dj-ch is-${deck.id.toLowerCase()}`, style: `--deck:${DECK_COLOR[deck.id]}` }, el('div', { class: 'dj-ch-knobs' }, trim.el, ...eq.map((k) => k.el), filter.el), fader.el);
      return { col, trim, eq, filter, fader };
    });
    const meters = [new Meter(), new Meter()];
    const masterMeter = new Meter('is-master');
    const master = new Knob({ id: 'master', label: 'Master', min: 0, max: 1.25, def: 1, value: 1, origin: 0, fmt: (v) => `${Math.round(v * 100)}%`, onChange: (v) => m.setMaster(v) });
    // beat FX
    const echo = el('button', { class: 'dj-mini dj-toggle', type: 'button', title: 'Echo, timed to the beat of the deck on air' }, 'Echo');
    const flanger = el('button', { class: 'dj-mini dj-toggle', type: 'button', title: 'Flanger: one sweep every eight beat divisions' }, 'Flanger');
    const beats = el('span', { class: 'dj-fx-beats' }, '1');
    const fxLevel = new Knob({ id: 'fxlevel', label: 'Level', min: 0, max: 1, def: 0.7, value: 0.7, fmt: (v) => `${Math.round(v * 100)}%`, onChange: (v) => m.setFx({ level: v }) });
    echo.addEventListener('click', () => m.setFx({ echo: !m.fx.echo }));
    flanger.addEventListener('click', () => m.setFx({ flanger: !m.fx.flanger }));
    const step = (d) => m.setFx({ beats: clamp(m.fx.beats + d, 0, FX_BEATS.length - 1) });
    const quant = el('button', { class: 'dj-mini dj-toggle', type: 'button', title: 'Quantise: cues, loops and jumps land on the beat grid' }, 'Quant');
    quant.addEventListener('click', () => m.setQuantize(!m.quantize));
    const fx = el('div', { class: 'dj-fx' },
      el('span', { class: 'legend' }, 'Beat FX'), echo, flanger,
      el('div', { class: 'dj-fx-step' },
        el('button', { class: 'dj-mini', type: 'button', title: 'Shorter', onclick: () => step(-1) }, '◀'), beats,
        el('button', { class: 'dj-mini', type: 'button', title: 'Longer', onclick: () => step(1) }, '▶')),
      fxLevel.el, quant);
    const refreshFx = () => {
      echo.classList.toggle('is-active', m.fx.echo);
      flanger.classList.toggle('is-active', m.fx.flanger);
      beats.textContent = beatName(FX_BEATS[m.fx.beats]);
      quant.classList.toggle('is-active', m.quantize);
    };
    m.addEventListener('fx', refreshFx);
    m.addEventListener('quantize', refreshFx);
    refreshFx();
    const xf = new CrossFader({ onChange: (v) => m.setCrossfader(v) });
    const curve = el('button', { class: 'dj-mini', type: 'button', title: 'Crossfader curve: smooth for blends, sharp for cuts and scratching' }, 'Smooth');
    curve.addEventListener('click', () => { m.setCrossfaderCurve(m.xcurve === 'smooth' ? 'sharp' : 'smooth'); curve.textContent = m.xcurve === 'smooth' ? 'Smooth' : 'Sharp'; });
    const center = el('div', { class: 'dj-center' }, el('div', { class: 'dj-meters' }, meters[0].canvas, masterMeter.canvas, meters[1].canvas), master.el);
    const elMixer = el('div', { class: 'dj-mixer' }, fx,
      el('div', { class: 'dj-chs' }, strips[0].col, center, strips[1].col),
      el('div', { class: 'dj-xf-row' }, el('span', { class: 'dj-xf-label' }, 'A'), xf.el, el('span', { class: 'dj-xf-label' }, 'B'), curve));
    return { el: elMixer, meters, masterMeter, trims: strips.map((s) => s.trim), xf, strips };
  }

  // a button held like a pad: down on press, up on release however the press ends
  function momentary(node, down, up) {
    let held = false;
    node.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); node.setPointerCapture(e.pointerId); held = true; node.classList.add('is-down'); down(e); });
    const release = () => { if (!held) return; held = false; node.classList.remove('is-down'); up(); };
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener('lostpointercapture', release);
    node.addEventListener('blur', release);
  }

  // ── opening, closing, loading ───────────────────────────────────────────────
  // What the single player was doing when the console took over: given back if the console is
  // closed again with nothing put on the decks, so trying DJ mode never leaves the song stopped.
  let resumeSingle = false;
  const idle = () => !mixer || (!mixer.playing && !mixer.decks.some((d) => d.loaded || d.loading));

  async function open(on) {
    if (on) {
      let m;
      try { m = await ensureMixer(); } catch (e) {
        toast(`The decks could not start: ${e.message}. Press DJ to try again.`, { kind: 'error', timeout: 7000 });
        return false;
      }
      if (!engine.decks) resumeSingle = engine.playing && !engine.live;      // before the decks pause it
      m.wake();
      engine.attachDecks(m);
      root.hidden = false;
      document.body.classList.add('is-dj', 'is-dj-open');
      requestAnimationFrame(() => built?.panels.forEach((p) => { p.overview.build(); p.view.dirty = true; }));
    } else {
      // Hide keeps a set going; with nothing on the decks there is no set, so DJ mode ends
      if (engine.decks && idle()) { exitDj({ resume: true }); return true; }   // the 'decks' event hides it all
      root.hidden = true;
      document.body.classList.remove('is-dj-open');
    }
    onModeChange?.();
    return true;
  }

  function exitDj({ resume = false } = {}) {
    const back = resume && resumeSingle && !!engine.track;
    resumeSingle = false;
    engine.detachDecks();
    if (back) engine.play();
  }

  // An empty DJ mode (nothing loaded, loading or playing) is left, and the single player given
  // back as it was. The transport's Play and Space call it first: true if it did leave.
  function exitIfIdle() {
    if (!engine.decks || !idle()) return false;
    exitDj({ resume: true });
    return true;
  }

  engine.addEventListener('decks', () => {
    if (!engine.decks) {
      if (crate.temporary && mixer) for (const d of mixer.decks) d.unload();
      mixer?.sleep();
      root.hidden = true;
      document.body.classList.remove('is-dj', 'is-dj-open');
    }
    onModeChange?.();
  });

  // the deck to load into when a track is picked without saying which: the one not on air
  function freeDeck() {
    const [a, b] = mixer.decks;
    if (!a.playing && !a.loaded) return a;
    if (!b.playing && !b.loaded) return b;
    if (mixer.onAir === a && !b.playing) return b;
    if (mixer.onAir === b && !a.playing) return a;
    return !a.playing ? a : !b.playing ? b : null;
  }

  async function loadInto(id, track) {
    let m;
    try { m = await ensureMixer(); } catch (e) { return toast(`The decks could not start: ${e.message}`, { kind: 'error', timeout: 7000 }); }
    if (!engine.decks && !(await open(true))) return;
    const deck = id ? m.decks.find((d) => d.id === id) : freeDeck();
    if (!deck) return toast('Both decks are playing. Pause one to load a track into it.');
    if (deck.playing) return toast(`Deck ${deck.id} is playing. Pause it first.`);
    const selection = deck.selection = (deck.selection || 0) + 1;
    try {
      track = await crate.prepareTrack(track, `deck${deck.id}`);
      if (deck.selection !== selection) return;
      await deck.load(track);
      toast(`Deck ${deck.id}: “${track.title}” · ${deck.bpm ? `${deck.bpm.toFixed(2)} BPM` : 'no steady beat found'}`);
    } catch (err) {
      if (deck.selection === selection) crate.temporary?.clear(`deck${deck.id}`).catch(() => {});
      if (err.name !== 'AbortError') toast(err.message, { kind: 'error', timeout: 6000 });
    }
  }

  // which deck panel is under a point on the screen (for dropping files on a deck)
  function deckAt(x, y) {
    if (root.hidden) return null;
    for (const n of document.elementsFromPoint(x, y)) {
      const panel = n.closest?.('.dj-deck');
      if (panel) return panel.dataset.deck;
    }
    return null;
  }

  // ── keys, while the console is open ─────────────────────────────────────────
  const held = new Map();
  function keydown(e) {
    if (root.hidden || !built) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const xf = built.mixerPanel.xf;
      xf.set(e.shiftKey ? (k === 'ArrowLeft' ? 0 : 1) : xf.value + (k === 'ArrowLeft' ? -0.1 : 0.1));
      return true;
    }
    for (const p of built.panels) {
      const map = KEYS[p.deck.id];
      if (e.repeat && (k === map.cue || map.pads.includes(k))) return true;
      if (k === map.cue) { held.set(k, () => p.deck.cueUp()); p.cueBtn.classList.add('is-down'); p.deck.cueDown(); return true; }
      if (k === map.play) { p.deck.togglePlay(); return true; }
      if (k === map.sync) { p.el.querySelector('.dj-sync').click(); return true; }
      const i = map.pads.indexOf(k);
      if (i >= 0) { held.set(k, () => p.padUp(i)); p.pads[i].classList.add('is-down'); p.padDown(i, e); return true; }
    }
    return false;
  }
  function keyup(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const up = held.get(k);
    if (!up) return;
    held.delete(k);
    built?.panels.forEach((p) => { p.cueBtn.classList.remove('is-down'); p.pads.forEach((b) => b.classList.remove('is-down')); });
    up();
  }

  // ── every frame ────────────────────────────────────────────────────────────
  let last = performance.now();
  let meterDt = 0;
  function tick() {
    if (!mixer || !built) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    mixer.tick();
    frame++;
    if (root.hidden) return;
    built.panels.forEach((p, i) => {
      p.jog.tick(dt);
      // two stopped decks draw nothing: the waves move only while a record does, or when it changed
      const d = p.deck, v = p.view, pos = d.position;
      if (v.dirty || d.playing || d.previewing || pos !== v.at || span !== v.span) {
        v.dirty = false; v.at = pos; v.span = span;
        drawWave(built.waves[i], d, span);
        p.overview.draw();
      }
      if (frame % 3 === 0) p.text();
    });
    // the meters at most 30 times a second, and not at all once both decks are silent and settled
    const { meters, masterMeter } = built.mixerPanel;
    meterDt += dt;
    if (frame % 2 === 0 && (mixer.playing || ![...meters, masterMeter].every((mt) => mt.quiet))) {
      meters.forEach((mt, i) => mt.draw(mixer.level(i), meterDt));
      masterMeter.draw(mixer.level(-1), meterDt);
      meterDt = 0;
    } else if (frame % 2 === 0) meterDt = 0;
    // phase: where B's beat sits against A's, in beats (centre = in phase)
    const [a, b] = mixer.decks;
    let phaseAt = 'off';
    if (a.bpm && b.bpm && a.loaded && b.loaded) {
      let d = b.beatAt().frac - a.beatAt().frac;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      phaseAt = `${(50 + d * 100).toFixed(1)}%`;
      if (phaseAt !== built.phaseAt) {
        built.phase.style.left = phaseAt;
        built.phase.classList.toggle('is-locked', Math.abs(d) < 0.02);
      }
    }
    if (phaseAt !== built.phaseAt) built.phase.hidden = phaseAt === 'off';
    built.phaseAt = phaseAt;
  }

  return {
    open,
    toggle: () => open(root.hidden),
    get isOpen() { return !root.hidden; },
    get active() { return !!engine.decks; },
    loadInto,
    deckAt,
    keydown,
    keyup,
    tick,
    exit: exitDj,
    exitIfIdle,
  };
}
