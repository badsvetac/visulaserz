import { clamp, store } from '../util.js';
import { LYRIC_STYLE_NAMES, loadLyricFonts } from '../gfx/lyric-layer.js';
import { savedSync } from './lyric-sync.js';

export const LYRIC_STYLES = ['Auto', ...LYRIC_STYLE_NAMES.map((s) => s[0].toUpperCase() + s.slice(1))];
export const LYRIC_FONT_NAMES = ['Auto', 'Body', 'Display', 'Poster', 'Serif', 'Mono'];
export const LYRIC_SIZES = ['S', 'M', 'L', 'XL'];
export const LYRIC_POSITIONS = ['Lower', 'Center', 'Upper'];
const SIZE_FRAC = [0.045, 0.062, 0.085, 0.115];

// LRC → [{ t, end, text, words: [{ t, end, text }] }]. Handles several stamps per line,
// the [offset:] tag, and enhanced <mm:ss.xx> word stamps. Lines without word stamps get their
// words spread over the line's time by length, so karaoke-style effects still flow.
export function parseLrc(text) {
  const lines = [];
  let offset = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const trimmed = raw.trim();
    const meta = /^\[(ar|ti|al|by|offset|length|re|ve|au):(.*)\]$/i.exec(trimmed);
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') offset = (Number(meta[2]) || 0) / 1000;
      continue;
    }
    const stamps = [...trimmed.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    let body = trimmed.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
    let words = null;
    if (/<\d+:\d+/.test(body)) {
      words = [];
      for (const m of body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)/g)) {
        const w = m[3].trim();
        if (w) words.push({ t: Number(m[1]) * 60 + Number(m[2]) + offset, text: w });
      }
      body = body.replace(/<\d+:\d+(?:\.\d+)?>/g, '').replace(/\s+/g, ' ').trim();
    }
    for (const s of stamps) lines.push({ t: Number(s[1]) * 60 + Number(s[2]) + offset, text: body, words: words ? words.map((w) => ({ ...w })) : null });
  }
  lines.sort((a, b) => a.t - b.t);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    line.end = Math.max(line.t + 0.8, Math.min(next ? next.t : line.t + 6, line.t + 10));
    if (!line.words) {
      const ws = line.text.split(/\s+/).filter(Boolean);
      const total = ws.reduce((s, w) => s + w.length + 1, 0) || 1;
      const span = Math.min(line.end - line.t, 1.4 + 0.38 * ws.length); // a singing pace, not the whole gap
      let t = line.t;
      line.words = ws.map((w) => {
        const d = (span * (w.length + 1)) / total;
        const word = { text: w, t, end: t + d };
        t += d;
        return word;
      });
    } else {
      line.words.forEach((w, j) => { w.end = line.words[j + 1] ? line.words[j + 1].t : line.end; });
    }
  }
  return lines;
}

// Owns the lyric data (lookup, LRC parsing, preferences) and drives the renderer's lyric layer.
export class Lyrics {
  constructor({ engine, renderer, toast }) {
    this.engine = engine;
    this.renderer = renderer;
    this.layer = renderer.lyrics;
    this.toast = toast;
    this.prefs = { enabled: true, style: 0, font: 0, size: 1, position: 0, offset: 0, ...store.get('lyrics', {}) };
    this.prefs.style = clamp(this.prefs.style | 0, 0, LYRIC_STYLES.length - 1);
    this.prefs.font = clamp(this.prefs.font | 0, 0, LYRIC_FONT_NAMES.length - 1);
    this.prefs.size = clamp(this.prefs.size | 0, 0, LYRIC_SIZES.length - 1);
    this.lines = null;
    this.plain = null;
    this.index = -1;
    this.shownIndex = -2;
    this.shownStyle = '';
    this.token = 0;
    this.status = 'idle';
    this.statusText = '';
    this.onStatus = null;
    this.locale = undefined;
    this.stageFrac = 1;
    engine.addEventListener('trackchange', (e) => this.load(e.detail));
    engine.addEventListener('live', () => { if (engine.live) this.#clear('none', 'Live input has no lyrics.'); });
    this.fontsReady = false;
    loadLyricFonts().then(() => { this.fontsReady = true; this.shownIndex = -2; }); // redraw with the real faces
  }

  setPref(key, value) {
    this.prefs[key] = value;
    store.set('lyrics', this.prefs);
    if (key === 'style' || key === 'font' || key === 'enabled') this.shownIndex = -2; // re-rasterise
    if (!this.prefs.enabled) this.layer.clear();
  }

  // Auto mode picks a style per group of four lines, so a whole clip varies by itself; two
  // neighbouring groups never share one.
  styleFor(index) {
    if (this.prefs.style > 0) return LYRIC_STYLE_NAMES[this.prefs.style - 1];
    const n = LYRIC_STYLE_NAMES.length;
    const pick = (g) => Math.floor((((Math.sin(g * 12.9898 + 4.1414) * 43758.5453) % 1) + 1) % 1 * n) % n;
    const g = Math.floor(Math.max(0, index) / 4);
    let s = pick(g);
    if (g > 0 && s === pick(g - 1)) s = (s + 1) % n;
    return LYRIC_STYLE_NAMES[s];
  }

  fontFor() {
    return this.prefs.font > 0 ? LYRIC_FONT_NAMES[this.prefs.font].toLowerCase() : null;
  }

  #setStatus(state, text) {
    this.status = state;
    this.statusText = text;
    this.onStatus?.(state, text);
  }

  #clear(state, text) {
    this.token++;
    this.lines = null;
    this.plain = null;
    this.index = -1;
    this.shownIndex = -2;
    this.layer.clear();
    this.#setStatus(state, text);
  }

  // `query` is an optional manual "artist - title" typed by the user.
  async load(track, query = '') {
    this.#clear('searching', 'Looking for synced lyrics…');
    const my = this.token;
    if (!track || track.source === 'demo') return this.#setStatus('none', 'The demo has no words.');
    // a sync made here by tapping wins over a lookup, unless the lookup was asked for by name
    const mine = !query && savedSync(track);
    if (mine) { this.setLrc(mine, 'your tap sync'); return; }
    if (!this.engine.duration && !track.duration) await new Promise((r) => setTimeout(r, 800));
    if (my !== this.token) return;
    try {
      const q = new URLSearchParams({ title: query || track.title, artist: query ? '' : track.artist || '', duration: String(Math.round(this.engine.duration || track.duration || 0)) });
      const res = await fetch(`/api/lyrics?${q}`);
      const data = await res.json();
      if (my !== this.token) return;
      if (!res.ok) throw new Error(data.error || 'Lyrics lookup failed.');
      const label = data.match ? `${data.match.artistName} – ${data.match.trackName}` : '';
      if (data.synced) this.setLrc(data.synced, label);
      else if (data.plain) {
        this.plain = data.plain;
        this.#setStatus('plain', `Words found (${label}) but not timed. Tap sync times them as the song plays.`);
      } else this.#setStatus('none', 'No lyrics found. Search “artist - song” above, drop an .lrc file, paste LRC, or tap sync your own.');
    } catch (e) {
      if (my === this.token) this.#setStatus('error', e.message);
    }
  }

  setLrc(text, label = 'LRC file') {
    const lines = parseLrc(text);
    if (!lines.length) {
      this.toast('That does not look like LRC text (lines start with [mm:ss.xx]).', { kind: 'error' });
      return false;
    }
    this.token++;
    this.lines = lines;
    this.index = -1;
    this.shownIndex = -2;
    // Uppercase styles need the language for dotted/dotless i: "bilseydim" → "BİLSEYDİM" only in Turkish.
    this.locale = /[şğıİ]/.test(lines.map((l) => l.text).join(' ')) ? 'tr' : undefined;
    this.#setStatus('synced', `Synced · ${label} · ${lines.length} lines`);
    return true;
  }

  tick(dt, an) {
    const layer = this.layer;
    if (!this.lines || !this.prefs.enabled || this.engine.decks) {
      if (layer.count) layer.clear();
      return;
    }
    const t = this.engine.currentTime + this.prefs.offset;
    const lines = this.lines;
    let i = this.index;
    if (i < 0 || t < lines[i].t || (lines[i + 1] && t >= lines[i + 1].t)) {
      i = -1;
      for (let k = 0; k < lines.length; k++) {
        if (lines[k].t <= t) i = k;
        else break;
      }
      this.index = i;
    }
    const style = this.styleFor(i);
    if (i !== this.shownIndex || style !== this.shownStyle) {
      this.shownIndex = i;
      this.shownStyle = style;
      layer.setLine({ line: i >= 0 ? lines[i] : null, prev: lines[i - 1], next: lines[i + 1], index: i, style, font: this.fontFor(), locale: this.locale });
    }
    const rt = this.renderer.overlayRT;
    if (!rt) return;
    layer.update({
      t, dt, beat: an.beat, isBeat: an.isBeat, level: an.level,
      W: rt.w, H: rt.h, stageFrac: this.stageFrac,
      place: LYRIC_POSITIONS[this.prefs.position].toLowerCase(),
      sizeFrac: SIZE_FRAC[this.prefs.size],
    });
  }
}
