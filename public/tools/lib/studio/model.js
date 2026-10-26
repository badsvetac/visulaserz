import { DRUMS, SYNTH_PRESETS, presetParams, ROOT } from './sounds.js';
import { fxDefaults } from './effects.js';

// The Studio's project, laid out the way FL Studio lays one out. CHANNELS are the instruments
// (each one a plugin with its own settings, routed to a mixer insert); PATTERNS hold what the
// channels play, as steps or as piano-roll notes; the PLAYLIST arranges patterns in time on its
// tracks, as clips; the MIXER has a master and sixteen inserts, each with effect slots. It is all
// plain data, so it saves as JSON, undo is a copy of it, and a pattern is cloned by copying it.
// Times are in steps (sixteenth notes); a bar is 16 of them.

export const BAR = 16;
export const TRACKS = 16;
export const INSERTS = 16;
export const FX_SLOTS = 6;
export const MAX_PATTERNS = 99;
export const LENGTHS = [16, 32, 64, 128];
export const PLUGINS = { drum: 'Drum Synth', synth: '3-Osc Synth', sampler: 'Sampler', slicer: 'Slicer' };
export const COLORS = ['#7fc86a', '#5fa9d8', '#e8a64a', '#c879c2', '#e06d5e', '#6fcab9', '#bfc35e', '#9187dd', '#e58bb0', '#8fd3e8'];
export { ROOT };

const blank = () => ({ steps: new Array(128).fill(0), notes: [] });
export function part(pattern, chId) {
  let p = pattern.ch[chId];
  if (!p) { p = blank(); pattern.ch[chId] = p; }
  if (p.steps.length < 128) p.steps = [...p.steps, ...new Array(128 - p.steps.length).fill(0)];
  return p;
}

export function newPattern(project, name) {
  const n = project.patterns.length + 1;
  return { id: `p${project.nextId++}`, name: name || `Pattern ${n}`, color: COLORS[(n - 1) % COLORS.length], len: 16, ch: {} };
}
const freeInsert = (project) => {
  for (let i = 1; i <= INSERTS; i++) if (!project.channels.some((c) => c.insert === i)) return i;
  return 0;                                                   // all taken: straight to the master
};
export function newChannel(project, plugin, sound) {
  const id = `c${project.nextId++}`;
  const n = project.channels.length;
  const base = { id, plugin, vol: 0.78, pan: 0, mute: false, solo: false, insert: freeInsert(project), color: COLORS[(n + 3) % COLORS.length] };
  let ch;
  if (plugin === 'drum') ch = { ...base, name: DRUMS.find((d) => d.id === sound)?.name || 'Drum', params: { sound: sound || 'kick', tune: 0, decay: 1, tone: 0.5 } };
  else if (plugin === 'synth') ch = { ...base, name: SYNTH_PRESETS.find((s) => s.id === sound)?.name || 'Synth', params: presetParams(sound || 'lead') };
  else if (plugin === 'sampler') ch = { ...base, name: 'Sampler', params: { root: ROOT, reverse: false, attack: 0.002, release: 0.02, tune: 0, sampleName: null } };
  else ch = { ...base, name: 'Slicer', params: { bars: 2, slices: 16, reverse: false, tune: 0 } };
  const ins = project.mixer.inserts[ch.insert];
  if (ch.insert && ins && /^Insert \d+$/.test(ins.name)) ins.name = ch.name;   // FL names an insert after what feeds it
  return ch;
}
export const newFx = (project, type) => ({ id: `f${project.nextId++}`, type, on: true, params: fxDefaults(type) });

function mixer() {
  return {
    inserts: Array.from({ length: INSERTS + 1 }, (_, i) => ({ name: i ? `Insert ${i}` : 'Master', vol: i ? 0.8 : 0.85, pan: 0, mute: false, fx: new Array(FX_SLOTS).fill(null) })),
    songDuck: 0,
  };
}
function playlist() {
  return { tracks: Array.from({ length: TRACKS }, (_, i) => ({ name: `Track ${i + 1}`, mute: false })), clips: [] };
}
const UI = () => ({
  windows: {
    rack: { open: true, x: 24, y: 24, w: 640, h: 300 },
    roll: { open: false, x: 64, y: 40, w: 760, h: 420 },
    mixer: { open: false, x: 40, y: 70, w: 900, h: 400 },
    pads: { open: false, x: 120, y: 60, w: 420, h: 380 },
  },
  browser: true, typing: true, metronome: false, zoom: 22,
});

// The project a first visit opens on: an arrangement already in the playlist (chords, then the
// drums, then the 808), the four drum channels FL starts with, and every pattern on its own track.
export function defaultProject() {
  const p = { v: 2, nextId: 1, bpm: 128, sync: true, swing: 0, mode: 'pat', pattern: null, selected: null, key: { root: 9, minor: true }, channels: [], patterns: [], mixer: mixer(), playlist: playlist(), ui: UI() };
  const add = (plugin, sound, extra = {}) => {
    const c = newChannel(p, plugin, sound);
    Object.assign(c, extra);
    if (extra.name && c.insert) p.mixer.inserts[c.insert].name = extra.name;
    p.channels.push(c);
    return c;
  };
  const kick = add('drum', 'kick'), clap = add('drum', 'clap'), hat = add('drum', 'hat'), snare = add('drum', 'snare');
  const bass = add('synth', '808', { color: '#5fa9d8' });
  const keys = add('synth', 'pluck', { name: 'Chords', color: '#c879c2' });
  p.mixer.inserts[bass.insert].fx[0] = newFx(p, 'duck');                     // the 808 pumps with the kick
  p.mixer.inserts[keys.insert].fx[0] = { ...newFx(p, 'delay'), params: { ...fxDefaults('delay'), mix: 0.18 } };
  p.mixer.inserts[keys.insert].fx[1] = { ...newFx(p, 'reverb'), params: { ...fxDefaults('reverb'), mix: 0.22 } };
  p.mixer.inserts[keys.insert].fx[2] = newFx(p, 'duck');
  const beat = newPattern(p, 'Beat'); p.patterns.push(beat);
  [0, 4, 8, 12].forEach((s) => { part(beat, kick.id).steps[s] = 110; });
  [4, 12].forEach((s) => { part(beat, clap.id).steps[s] = 100; });
  [2, 6, 10, 14].forEach((s) => { part(beat, hat.id).steps[s] = 90; });
  const fill = newPattern(p, 'Beat fill'); p.patterns.push(fill);
  [0, 4, 8, 10, 12].forEach((s) => { part(fill, kick.id).steps[s] = 110; });
  [4, 12].forEach((s) => { part(fill, clap.id).steps[s] = 100; });
  for (let s = 0; s < 16; s++) part(fill, hat.id).steps[s] = s % 2 ? 70 : 100;
  [13, 14, 15].forEach((s) => { part(fill, snare.id).steps[s] = 60 + s * 3; });
  // four bars of A minor: Am, F, C, G
  const roots = [33, 29, 36, 31], triads = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];
  const bl = newPattern(p, '808'); bl.len = 64; p.patterns.push(bl);
  roots.forEach((r, b) => [[0, 3], [3, 3], [6, 4], [10, 3]].forEach(([s, l]) => part(bl, bass.id).notes.push({ s: b * 16 + s, l, k: r, v: 100 })));
  const ch = newPattern(p, 'Chords'); ch.len = 64; p.patterns.push(ch);
  triads.forEach((tri, b) => [2, 6, 10, 14].forEach((s) => tri.forEach((k) => part(ch, keys.id).notes.push({ s: b * 16 + s, l: 2, k, v: s === 2 ? 110 : 90 }))));
  p.playlist.tracks[0].name = 'Chords';
  p.playlist.tracks[1].name = 'Drums';
  p.playlist.tracks[2].name = '808';
  const clip = (track, bar, bars, pat) => p.playlist.clips.push({ id: `k${p.nextId++}`, track, start: bar * BAR, len: bars * BAR, pattern: pat.id });
  clip(0, 0, 8, ch);
  clip(1, 2, 5, beat);
  clip(1, 7, 1, fill);
  clip(2, 4, 4, bl);
  p.pattern = beat.id;
  p.selected = keys.id;
  return p;
}

// A project from the first Studio (patterns A to H, a fixed mixer per channel), brought over:
// its channels keep their sounds, its mixer knobs become effects in their inserts.
function fromV1(s) {
  const p = { ...defaultProject(), channels: [], patterns: [], playlist: playlist(), mixer: mixer(), nextId: 1 };
  p.nextId = (s.nextId | 0) + 100;
  p.bpm = s.bpm || 128;
  p.sync = s.sync !== false;
  p.swing = s.swing || 0;
  p.key = { root: 9, minor: true, ...(s.key || {}) };
  (s.channels || []).forEach((c, i) => {
    const m = c.mix || {};
    const ins = Math.min(INSERTS, i + 1);
    let params;
    if (c.kind === 'drum') params = { sound: c.sound || 'kick', tune: c.tune || 0, decay: c.decay || 1, tone: 0.5 };
    else if (c.kind === 'synth') {
      params = presetParams(c.preset);
      const u = c.user || {};
      params.cutoff *= u.cutoff ?? 1; params.reso *= u.reso ?? 1; params.a *= u.attack ?? 1; params.r *= u.release ?? 1;
      if (u.glide !== undefined) params.glide = u.glide;
      params.tune = c.tune || 0;
    } else if (c.kind === 'sampler') params = { root: ROOT, reverse: !!c.reverse, attack: 0.002, release: 0.02, tune: c.tune || 0, sampleName: c.sampleName || null };
    else params = { bars: c.bars || 2, slices: c.slices || 16, reverse: !!c.reverse, tune: c.tune || 0 };
    p.channels.push({ id: c.id, name: c.name, plugin: c.kind, params, vol: m.vol ?? 0.78, pan: m.pan ?? 0, mute: !!m.mute, solo: !!m.solo, insert: ins, color: COLORS[(i + 3) % COLORS.length] });
    const insert = p.mixer.inserts[ins];
    insert.name = c.name;
    const slots = [];
    if (m.filter < -0.02) slots.push({ ...newFx(p, 'filter'), params: { ...fxDefaults('filter'), mode: 0, cutoff: 18000 * Math.pow(220 / 18000, -m.filter) } });
    if (m.filter > 0.02) slots.push({ ...newFx(p, 'filter'), params: { ...fxDefaults('filter'), mode: 1, cutoff: 20 * Math.pow(250, m.filter) } });
    if (m.drive > 0.01) slots.push({ ...newFx(p, 'drive'), params: { ...fxDefaults('drive'), drive: m.drive, mix: 0.8 } });
    if (m.delay > 0.01) slots.push({ ...newFx(p, 'delay'), params: { ...fxDefaults('delay'), mix: m.delay } });
    if (m.reverb > 0.01) slots.push({ ...newFx(p, 'reverb'), params: { ...fxDefaults('reverb'), mix: m.reverb } });
    if (m.duck) slots.push(newFx(p, 'duck'));
    slots.forEach((f, k) => { insert.fx[k] = f; });
  });
  (s.patterns || []).forEach((pat, i) => {
    const has = Object.values(pat.ch || {}).some((q) => q.notes?.length || q.steps?.some(Boolean));
    if (!has && i > 0) return;
    const np = { id: `p${p.nextId++}`, name: `Pattern ${pat.name || i + 1}`, color: COLORS[i % COLORS.length], len: LENGTHS.includes(pat.len) ? pat.len : 16, ch: {} };
    for (const [id, q] of Object.entries(pat.ch || {})) { const d = part(np, id); (q.steps || []).forEach((v, k) => { d.steps[k] = v; }); d.notes = (q.notes || []).map((n) => ({ ...n })); }
    p.patterns.push(np);
  });
  if (!p.patterns.length) p.patterns.push(newPattern(p));
  p.pattern = p.patterns[0].id;
  p.selected = p.channels.find((c) => c.id === s.selected)?.id || p.channels[0]?.id || null;
  p.mixer.songDuck = s.master?.duckTrack || 0;
  p.mixer.inserts[0].vol = s.master?.vol ?? 0.85;
  return p;
}

// A saved project, checked: anything broken or missing falls back to the default's own value.
export function loadProject(saved) {
  if (saved?.v === 1) return fromV1(saved);
  if (!saved || typeof saved !== 'object' || saved.v !== 2 || !Array.isArray(saved.channels) || !Array.isArray(saved.patterns)) return defaultProject();
  const d = defaultProject();
  const p = { ...d, ...saved, key: { ...d.key, ...(saved.key || {}) }, ui: { ...d.ui, ...(saved.ui || {}), windows: { ...d.ui.windows, ...(saved.ui?.windows || {}) } } };
  p.channels = saved.channels.filter((c) => c && typeof c.id === 'string' && PLUGINS[c.plugin]).map((c) => ({ ...c, sample: null }));
  p.patterns = saved.patterns.filter((x) => x && typeof x.id === 'string').map((x) => {
    const pat = { id: x.id, name: String(x.name || 'Pattern'), color: x.color || COLORS[0], len: LENGTHS.includes(x.len) ? x.len : 16, ch: {} };
    for (const c of p.channels) {
      const src = x.ch?.[c.id];
      if (!src) continue;
      const q = part(pat, c.id);
      if (Array.isArray(src.steps)) src.steps.slice(0, 128).forEach((v, k) => { q.steps[k] = Math.max(0, Math.min(127, v | 0)); });
      if (Array.isArray(src.notes)) q.notes = src.notes.filter((n) => n && Number.isFinite(n.s) && Number.isFinite(n.l) && Number.isFinite(n.k)).map((n) => ({ s: n.s, l: Math.max(0.25, n.l), k: Math.max(0, Math.min(127, n.k)), v: n.v ?? 100 }));
    }
    return pat;
  });
  if (!p.patterns.length) p.patterns.push(newPattern(p));
  const m = saved.mixer || {};
  p.mixer = mixer();
  (m.inserts || []).slice(0, INSERTS + 1).forEach((ins, i) => {
    if (!ins) return;
    Object.assign(p.mixer.inserts[i], { name: String(ins.name || p.mixer.inserts[i].name), vol: ins.vol ?? p.mixer.inserts[i].vol, pan: ins.pan ?? 0, mute: !!ins.mute });
    (ins.fx || []).slice(0, FX_SLOTS).forEach((f, k) => { if (f && fxDefaults && typeof f.type === 'string') { try { p.mixer.inserts[i].fx[k] = { id: f.id || `f${p.nextId++}`, type: f.type, on: f.on !== false, params: { ...fxDefaults(f.type), ...(f.params || {}) } }; } catch { /* an effect this version does not know */ } } });
  });
  p.mixer.songDuck = m.songDuck || 0;
  const pl = saved.playlist || {};
  p.playlist = playlist();
  (pl.tracks || []).slice(0, TRACKS).forEach((t, i) => { if (t) Object.assign(p.playlist.tracks[i], { name: String(t.name || p.playlist.tracks[i].name), mute: !!t.mute }); });
  p.playlist.clips = (pl.clips || []).filter((c) => c && Number.isFinite(c.start) && Number.isFinite(c.len) && c.track >= 0 && c.track < TRACKS && p.patterns.some((x) => x.id === c.pattern));
  if (!p.patterns.some((x) => x.id === p.pattern)) p.pattern = p.patterns[0].id;
  if (!p.channels.some((c) => c.id === p.selected)) p.selected = p.channels[0]?.id ?? null;
  const ids = [...p.channels, ...p.patterns, ...p.playlist.clips].map((x) => Number(String(x.id).slice(1)) || 0);
  p.nextId = Math.max(p.nextId | 0, ...ids) + 1;
  return p;
}

// What is stored: only the steps that are on and the notes, so an empty part costs nothing.
export function saveProject(p) {
  return {
    ...p,
    channels: p.channels.map(({ sample, ...c }) => ({ ...c, params: { ...c.params, sampleName: sample?.name || c.params?.sampleName || null } })),
    patterns: p.patterns.map((pat) => ({
      id: pat.id, name: pat.name, color: pat.color, len: pat.len,
      ch: Object.fromEntries(Object.entries(pat.ch).filter(([id, q]) => p.channels.some((c) => c.id === id) && (q.notes.length || q.steps.some(Boolean)))
        .map(([id, q]) => [id, { steps: q.steps.some(Boolean) ? q.steps.slice(0, pat.len) : [], notes: q.notes }])),
    })),
  };
}

export const patternOf = (p, id) => p.patterns.find((x) => x.id === id) || null;
export const hasNotes = (pattern, chId) => (pattern?.ch[chId]?.notes.length || 0) > 0;
export const isEmpty = (pattern) => Object.values(pattern.ch).every((q) => !q.notes.length && !q.steps.some(Boolean));
// where the song ends: the end of its last clip, on a bar
export const songEnd = (p) => Math.max(BAR, Math.ceil(Math.max(0, ...p.playlist.clips.map((c) => c.start + c.len)) / BAR) * BAR);
