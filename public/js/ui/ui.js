import { $, el, clamp, formatTime, debounce, downloadBlob, safeFilename, store } from '../util.js';
import { FX_PARAMS, FX_GROUPS, FX_PRESETS, presetValues, defaultFx } from '../audio/params.js';
import { renderDemoTrack } from '../audio/demo-track.js';
import { PALETTES, paletteGradient } from '../gfx/palettes.js';
import { SYMMETRY_MODES } from '../gfx/renderer.js';
import { Knob } from './knob.js';
import { looksLikeYouTube } from './crate.js';
import { buildStage } from './stage.js';
import { buildPerform } from './perform.js';
import { buildVibes } from './vibes.js';
import { buildRoom } from './room.js';
import { buildMarket, isSceneFile } from './market.js';
import { buildMeters } from './meters.js';
import { attachArtwork } from './artwork.js';
import { Lyrics, LYRIC_STYLES, LYRIC_FONT_NAMES, LYRIC_SIZES, LYRIC_POSITIONS } from './lyrics.js';

// One-click looks for the Vision rack: each only touches the switches and lens knobs it names.
const LOOK_PRESETS = [
  { name: 'Cinema', look: { bloom: 1.25, aberration: 0.35, grain: 0.5, scanlines: false, glitch: false, symmetry: 0, particles: true } },
  { name: 'Club', look: { bloom: 1.0, aberration: 1.3, grain: 0.3, scanlines: false, glitch: true, symmetry: 0, particles: true } },
  { name: 'Retro', look: { bloom: 0.8, aberration: 1.0, grain: 0.7, scanlines: true, glitch: false, symmetry: 0 } },
  { name: 'Mirror', look: { bloom: 0.9, aberration: 0.5, grain: 0.3, scanlines: false, glitch: false, symmetry: 3 } },
  { name: 'Zen', look: { bloom: 0.7, aberration: 0.15, grain: 0.15, scanlines: false, glitch: false, symmetry: 0, reduceFlashing: true } },
];

const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
  next: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z',
  loop: 'M17 17H7v-3l-4 4 4 4v-3h12v-6h-2zM7 7h10v3l4-4-4-4v3H5v6h2z',
  crate: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
  rack: 'M3 5h18v4H3zm0 6h18v4H3zm0 6h18v4H3zM6 6.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1zm0 6a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1zm0 6a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z',
  hide: 'M12 6c-5 0-8.5 4-9.5 6 1 2 4.5 6 9.5 6s8.5-4 9.5-6c-1-2-4.5-6-9.5-6zm0 9.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM3 3l18 18',
  full: 'M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z',
  rec: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  export: 'M12 3v10m0 0 4-4m-4 4-4-4M4 17v3h16v-3',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M5 7h14M9 7V4h6v3m-7 4v7m4-7v7M6 7l1 13h10l1-13',
  volume: 'M4 9v6h4l5 4V5L8 9zm12-2a5 5 0 0 1 0 10m2.5-13a9 9 0 0 1 0 16',
  chevron: 'M6 9l6 6 6-6',
  add: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  umbrella: 'M3 12a9 9 0 0 1 18 0zm9 0v6a2 2 0 0 1-4 0M12 3v1',
  image: 'M4 5h16v14H4zm0 10 5-5 4 4 3-3 4 4M15 9h.01',
};

function icon(name) {
  const stroke = ['export', 'close', 'trash', 'volume', 'chevron', 'add', 'check', 'hide', 'umbrella', 'image'].includes(name);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  if (stroke) {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  } else path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

const hexToRgb = (hex) => hex.slice(1).match(/../g).map((h) => parseInt(h, 16)).join(', ');

export function buildUI({ engine, analysis, renderer, registry, director, crate }) {
  const body = document.body;
  const settings = store.get('settings', {});
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let market = null;
  const saveSettings = debounce(() => store.set('settings', {
    fx: engine.fx, room: engine.roomMix, look: renderer.look, trailOverrides: renderer.trailOverrides,
    scene: market ? market.settledScene : renderer.sceneId, palette: renderer.palette.id, volume: engine.volume,
    sensitivity: analysis.sensitivity, motion: analysis.motion, auto: director.enabled,
  }), 300);

  // ── toasts ────────────────────────────────────────────────────────────────
  const toasts = $('#toasts');
  function toast(message, { kind = 'info', timeout = 4200 } = {}) {
    const node = el('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
    toasts.append(node);
    requestAnimationFrame(() => node.classList.add('is-in'));
    const remove = () => { node.classList.remove('is-in'); setTimeout(() => node.remove(), 300); };
    if (timeout) setTimeout(remove, timeout);
    return remove;
  }

  // ── LCD ───────────────────────────────────────────────────────────────────
  const lcdMain = $('#lcd-main');
  const lcdSub = $('#lcd-sub');
  let lcdHold = 0;
  function lcdShow(label, value) {
    lcdMain.textContent = `${label.toUpperCase()}  ${value}`;
    lcdHold = 2.2;
  }

  // ── accent colour follows the palette ─────────────────────────────────────
  function applyAccent() {
    const hex = renderer.palette.accent;
    document.documentElement.style.setProperty('--beam', hex);
    document.documentElement.style.setProperty('--beam-rgb', hexToRgb(hex));
    renderer.lyrics.setAccent(hexToRgb(hex).split(',').map((v) => Number(v) / 255));
    document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('is-active', b.dataset.palette === renderer.palette.id));
  }

  // ── rack: shared builders ─────────────────────────────────────────────────
  function key(label, { onClick, active = false, title, extra = '' } = {}) {
    const btn = el('button', { class: `key ${extra} ${active ? 'is-active' : ''}`, type: 'button', title, onclick: onClick, 'aria-pressed': String(active) },
      el('span', { class: 'led' }), el('span', {}, label));
    return btn;
  }
  function setActive(container, predicate) {
    container.querySelectorAll('.key').forEach((b) => {
      const on = predicate(b);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  function group(legend, ...children) {
    return el('div', { class: 'group', role: 'group', 'aria-label': legend }, el('div', { class: 'group-legend' }, legend), el('div', { class: 'group-body' }, ...children));
  }
  function toggle(label, get, set, { title } = {}) {
    const btn = el('button', { class: 'switch', type: 'button', title, 'aria-pressed': String(!!get()) }, el('span', { class: 'switch-track' }, el('span', { class: 'switch-thumb' })), el('span', { class: 'switch-label' }, label));
    btn.addEventListener('click', () => {
      set(!get());
      btn.setAttribute('aria-pressed', String(!!get()));
      lcdShow(label, get() ? 'ON' : 'OFF');
      saveSettings();
    });
    btn.refresh = () => btn.setAttribute('aria-pressed', String(!!get()));
    return btn;
  }
  function cycle(label, options, get, set) {
    const value = el('span', { class: 'cycle-value' }, options[get()]);
    const btn = el('button', { class: 'cycle', type: 'button', title: `${label}: click to change` }, el('span', { class: 'cycle-label' }, label), value);
    btn.addEventListener('click', (e) => {
      const dir = e.shiftKey ? -1 : 1;
      set((get() + dir + options.length) % options.length);
      value.textContent = options[get()];
      lcdShow(label, options[get()]);
      saveSettings();
    });
    btn.refresh = () => { value.textContent = options[get()]; };
    return btn;
  }

  // ── SOUND unit ────────────────────────────────────────────────────────────
  const soundUnit = $('#unit-sound');
  const fxKnobs = {};
  const presetRow = el('div', { class: 'keys', role: 'group', 'aria-label': 'Sound presets' });
  let activePreset = 'original';

  function applyPreset(preset, values) {
    activePreset = preset.id;
    engine.setAll(values);
    refreshFxKnobs();
    setActive(presetRow, (b) => b.dataset.preset === preset.id);
    lcdShow('preset', preset.name);
    saveSettings();
  }
  for (const preset of FX_PRESETS) {
    const btn = key(preset.name, { onClick: () => applyPreset(preset, presetValues(preset)), active: preset.id === 'original' });
    btn.dataset.preset = preset.id;
    presetRow.append(btn);
  }
  const mine = key('Mine', {
    title: 'Your stored sound. Use "Store" to save the current knobs here.',
    onClick: () => {
      const saved = store.get('mine', null);
      if (!saved) return toast('Nothing stored yet. Set the knobs how you like them, then press Store.');
      applyPreset({ id: 'mine', name: 'Mine' }, { ...defaultFx(), ...saved });
    },
  });
  mine.dataset.preset = 'mine';
  const storeBtn = el('button', { class: 'key key-ghost', type: 'button', title: 'Store the current knobs as "Mine"', onclick: () => {
    store.set('mine', { ...engine.fx });
    toast('Stored as “Mine”.');
    activePreset = 'mine';
    setActive(presetRow, (b) => b.dataset.preset === 'mine');
  } }, el('span', {}, 'Store'));
  presetRow.append(mine, storeBtn);

  function fxKnob(id) {
    const def = FX_PARAMS[id];
    const knob = new Knob({
      id, label: def.label, min: def.min, max: def.max, def: def.def, value: engine.fx[id], curve: def.curve, origin: def.origin, fmt: def.fmt,
      onChange: (v) => {
        engine.setParam(id, v);
        markCustom();
        saveSettings();
      },
      onTouch: (k) => lcdShow(`${def.group} ${def.label}`, def.fmt(k.value)),
    });
    fxKnobs[id] = knob;
    return knob.el;
  }
  function markCustom() {
    if (activePreset === null) return;
    activePreset = null;
    setActive(presetRow, () => false);
  }
  function refreshFxKnobs() {
    for (const [id, k] of Object.entries(fxKnobs)) k.setValue(engine.fx[id], { silent: true });
    pitchLock.refresh();
  }
  const pitchLock = toggle('Pitch lock', () => engine.fx.pitchLock, (v) => { engine.setPitchLock(v); markCustom(); }, { title: 'Keep the original pitch while changing speed' });

  // Which recording, if any, plays as the scene sound; click to go back to the synthesis.
  const ambienceSource = el('button', { class: 'cycle', type: 'button', title: 'The scene sound. Pick any track with its ☂ button in the crate; click here to go back to the built-in rain.' },
    el('span', { class: 'cycle-label' }, 'Source'), el('span', { class: 'cycle-value' }, 'Synth'));
  ambienceSource.addEventListener('click', () => { engine.clearAmbienceFile(); lcdShow('ambience', 'SYNTH'); });
  engine.addEventListener('ambiencefile', () => {
    const f = engine.ambience?.file;
    ambienceSource.querySelector('.cycle-value').textContent = f ? f.label.slice(0, 14) : 'Synth';
    ambienceSource.classList.toggle('is-active', !!f);
  });

  const room = buildRoom({ engine, lcdShow, saveSettings });

  const knobRow = el('div', { class: 'knob-row' });
  for (const g of FX_GROUPS) {
    const ids = Object.keys(FX_PARAMS).filter((id) => FX_PARAMS[id].group === g);
    const items = ids.map(fxKnob);
    if (g === 'Varispeed') items.push(pitchLock);
    if (g === 'Ambience') items.push(ambienceSource, room.node);
    knobRow.append(group(g, ...items));
  }
  soundUnit.append(presetRow, knobRow);

  // ── VISION unit ───────────────────────────────────────────────────────────
  const visionUnit = $('#unit-vision');
  // The strip carries only the scenes that were added from the market (registry.scenes), on one
  // line that scrolls sideways, so the rack keeps its height however many there are.
  const sceneRow = el('div', { class: 'keys keys-strip', role: 'group', 'aria-label': 'Scenes' });
  function renderSceneRow() {
    const strip = registry.scenes;
    sceneRow.replaceChildren();
    strip.forEach((scene, i) => {
      if (scene.group && scene.group !== strip[i - 1]?.group) sceneRow.append(el('span', { class: 'strip-label' }, scene.group));
      const btn = key(scene.name, { onClick: () => selectScene(scene.id), active: scene.id === renderer.sceneId, title: i < 9 ? `${scene.name} (key ${i + 1})` : scene.name });
      btn.dataset.scene = scene.id;
      sceneRow.append(btn);
    });
  }
  renderSceneRow();
  sceneRow.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;             // a trackpad already scrolls it sideways
    sceneRow.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  const autoBtn = toggle('Auto', () => director.enabled, (v) => { director.enabled = v; }, { title: 'Let the show change scenes by itself' });
  const marketBtn = el('button', { class: 'key key-market', type: 'button', title: 'Browse, try and add scenes (K)', onclick: () => toggleMarket() }, icon('add'), el('span', {}, 'Market'));
  const sceneBar = el('div', { class: 'scene-bar' }, sceneRow, marketBtn, autoBtn);

  let shownScene = null;
  function syncSceneRow() {
    shownScene = renderer.sceneId;
    setActive(sceneRow, (b) => b.dataset.scene === shownScene);
    const b = sceneRow.querySelector('.is-active');
    if (b) sceneRow.scrollLeft = b.offsetLeft - (sceneRow.clientWidth - b.offsetWidth) / 2;
  }

  const trailKnobs = {};
  const lookKnobs = {};
  // A scene of the user's own only had to compile to get in. If it then freezes the graphics card,
  // the page dies before anything can be saved, so the suspicion is written down first and
  // withdrawn once the scene has drawn for a few seconds. Start-up reads it: see "restore settings".
  let probation = 0;
  function watchCustom() {
    if (!renderer.scene?.custom) return;
    store.set('probation', renderer.sceneId);
    probation = 3;
  }
  function selectScene(id) {
    market?.cancelTry();
    renderer.setScene(id);
    watchCustom();
    syncSceneRow();
    for (const [k, knob] of Object.entries(trailKnobs)) knob.setValue(renderer.trail[k], { silent: true });
    lcdShow('scene', renderer.scene.name);
    saveSettings();
  }

  const swatches = el('div', { class: 'swatches' });
  for (const p of PALETTES) {
    const b = el('button', { class: 'swatch', type: 'button', title: p.name, 'aria-label': `${p.name} palette`, style: `background:${paletteGradient(p)}` });
    b.dataset.palette = p.id;
    b.addEventListener('click', () => selectPalette(p.id));
    swatches.append(b);
  }
  function selectPalette(id) {
    renderer.setPalette(id);
    applyAccent();
    lcdShow('palette', renderer.palette.name);
    saveSettings();
  }
  function nextPalette(dir) {
    const i = PALETTES.findIndex((p) => p.id === renderer.palette.id);
    selectPalette(PALETTES[(i + dir + PALETTES.length) % PALETTES.length].id);
  }
  const hueDrift = toggle('Drift', () => renderer.look.hueDrift, (v) => { renderer.look.hueDrift = v; }, { title: 'Slowly rotate the palette over time' });
  const cycleBtn = toggle('Cycle', () => !!renderer.look.cycle, (v) => { renderer.look.cycle = v; }, { title: 'Move to the next palette every 16 beats' });
  const lookRow = el('div', { class: 'keys', role: 'group', 'aria-label': 'Looks' });
  for (const lp of LOOK_PRESETS) {
    lookRow.append(el('button', { class: 'key', type: 'button', onclick: () => {
      Object.assign(renderer.look, lp.look);
      refreshLook();
      lcdShow('look', lp.name);
      saveSettings();
    } }, lp.name));
  }
  function refreshLook() {
    for (const { knob, get } of Object.values(lookKnobs)) knob.setValue(get(), { silent: true });
    visionUnit.querySelectorAll('.switch, .cycle').forEach((b) => b.refresh?.());
    applyAccent();
  }

  // A photo behind the glass in the Rain scene: drop an image anywhere, or pick one here.
  let backdropName = '';
  const backdropBtn = el('button', { class: 'cycle', type: 'button', title: 'A photo for scenes that show one (Rain). Drop an image anywhere on the page, or click to choose; click again to clear.' },
    el('span', { class: 'cycle-label' }, 'Backdrop'), el('span', { class: 'cycle-value' }, 'none'));
  backdropBtn.addEventListener('click', () => {
    if (renderer.hasBackdrop) setBackdrop(null);
    else imageInput.click();
  });
  function setBackdrop(file) {
    if (!file) {
      renderer.setBackdrop(null);
      backdropName = '';
      backdropBtn.querySelector('.cycle-value').textContent = 'none';
      backdropBtn.classList.remove('is-active');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      renderer.setBackdrop(img);
      URL.revokeObjectURL(url);
      backdropName = file.name;
      backdropBtn.querySelector('.cycle-value').textContent = file.name.replace(/\.[^.]+$/, '').slice(0, 12);
      backdropBtn.classList.add('is-active');
      // the photo shows through the Rain scene's window: fetch it from the market if it is not on the strip
      registry.install('rain').then(() => {
        if (!renderer.hasBackdrop) return;                              // cleared again while Rain was downloading
        if (renderer.sceneId !== 'rain') selectScene('rain');
        toast('Photo set behind the glass of the Rain scene. Click “Backdrop” in the Vision rack to clear it.');
      }, (e) => toast(`The photo is loaded, but the Rain scene could not be fetched (${e.message}). Add Rain from the Market when you are back online.`, { kind: 'error', timeout: 8000 }));
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be opened.', { kind: 'error' }); };
    img.src = url;
  }
  const imageInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  imageInput.addEventListener('change', () => { if (imageInput.files[0]) setBackdrop(imageInput.files[0]); imageInput.value = ''; });
  document.body.append(imageInput);

  // ── lyrics ────────────────────────────────────────────────────────────────
  const lyrics = new Lyrics({ engine, renderer, toast });
  const lyricsStatus = $('#lyrics-status');
  lyrics.onStatus = (state, text) => {
    lyricsStatus.textContent = text;
    lyricsStatus.classList.toggle('is-synced', state === 'synced');
    if (state === 'synced') lcdShow('lyrics', 'SYNCED ✓');
    else if (state === 'none' || state === 'plain') {
      lcdShow('lyrics', 'NOT FOUND');
      if (engine.track?.source !== 'demo') toast('No timed lyrics for this track. In the crate: search “artist - song”, drop an .lrc file, or paste LRC.', { timeout: 6000 });
    } else if (state === 'error') toast(`Lyrics: ${text}`, { kind: 'error', timeout: 6000 });
  };
  $('#lyrics-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!engine.track) return toast('Load a track first.');
    lyrics.load(engine.track, $('#lyrics-query').value.trim());
  });
  const lrcText = $('#lyrics-text');
  const lrcApply = $('#lyrics-apply');
  $('#lyrics-paste').addEventListener('click', () => { lrcText.hidden = false; lrcApply.hidden = false; lrcText.focus(); });
  lrcApply.addEventListener('click', () => {
    if (lyrics.setLrc(lrcText.value, 'pasted LRC')) { lrcText.hidden = true; lrcApply.hidden = true; }
  });
  const lyricControls = group('Lyrics',
    toggle('Show', () => lyrics.prefs.enabled, (v) => lyrics.setPref('enabled', v)),
    cycle('Style', LYRIC_STYLES, () => lyrics.prefs.style, (v) => lyrics.setPref('style', v)),
    cycle('Font', LYRIC_FONT_NAMES, () => lyrics.prefs.font, (v) => lyrics.setPref('font', v)),
    cycle('Size', LYRIC_SIZES, () => lyrics.prefs.size, (v) => lyrics.setPref('size', v)),
    cycle('Place', LYRIC_POSITIONS, () => lyrics.prefs.position, (v) => lyrics.setPref('position', v)),
    new Knob({ id: 'lyricOffset', label: 'Offset', min: -2, max: 2, def: 0, value: lyrics.prefs.offset, origin: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} s`,
      onChange: (v) => lyrics.setPref('offset', v), onTouch: (k) => lcdShow('lyrics offset', `${k.value > 0 ? '+' : ''}${k.value.toFixed(2)} s`) }).el,
  );

  function lookKnob(id, label, min, max, def, opts = {}) {
    const knob = new Knob({
      id, label, min, max, def, value: opts.get ? opts.get() : renderer.look[id], origin: opts.origin, curve: opts.curve, fmt: opts.fmt || ((v) => `${Math.round(v * 100)}%`),
      onChange: (v) => { (opts.set || ((x) => { renderer.look[id] = x; }))(v); saveSettings(); },
      onTouch: (k) => lcdShow(label, (opts.fmt || ((v) => `${Math.round(v * 100)}%`))(k.value)),
    });
    if (opts.trail) trailKnobs[id] = knob;
    lookKnobs[id] = { knob, get: opts.get || (() => renderer.look[id]) };
    return knob.el;
  }
  const vibes = buildVibes({ engine, renderer, registry, selectScene, selectPalette, refreshLook, toast, lcdShow, saveSettings });

  const t = renderer.trail;
  visionUnit.append(
    sceneBar,
    el('div', { class: 'vibe-bar' }, el('span', { class: 'strip-label' }, 'Vibes'), vibes.node),
    lookRow,
    el('div', { class: 'knob-row' },
      group('Palette', swatches, hueDrift, cycleBtn),
      group('Motion',
        lookKnob('react', 'React', 0.4, 2.2, 1, { get: () => analysis.sensitivity, set: (v) => { analysis.sensitivity = v; }, fmt: (v) => `${v.toFixed(2)}×` }),
        lookKnob('motion', 'Motion', 0.3, 2, 1, { get: () => analysis.motion, set: (v) => { analysis.motion = v; }, fmt: (v) => `${v.toFixed(2)}×` }),
        lookKnob('trails', 'Trails', 0, 0.985, t.trails, { trail: true, get: () => renderer.trail.trails, set: (v) => renderer.setTrail('trails', v) }),
        lookKnob('zoom', 'Zoom', 0.97, 1.06, t.zoom, { trail: true, origin: 1, get: () => renderer.trail.zoom, set: (v) => renderer.setTrail('zoom', v), fmt: (v) => `${((v - 1) * 100).toFixed(1)}%` }),
        lookKnob('spin', 'Spin', -0.02, 0.02, t.spin, { trail: true, origin: 0, get: () => renderer.trail.spin, set: (v) => renderer.setTrail('spin', v), fmt: (v) => `${(v * 57.3).toFixed(2)}°` }),
      ),
      group('Lens',
        lookKnob('bloom', 'Bloom', 0, 2, 0.9),
        lookKnob('aberration', 'Fringe', 0, 2, 0.6),
        lookKnob('grain', 'Grain', 0, 1, 0.35),
      ),
      group('Switches',
        cycle('Symmetry', SYMMETRY_MODES, () => renderer.look.symmetry, (v) => { renderer.look.symmetry = v; }),
        cycle('Quality', ['Low', 'Medium', 'High', 'Ultra'], () => ['low', 'medium', 'high', 'ultra'].indexOf(renderer.look.quality), (v) => renderer.setQuality(['low', 'medium', 'high', 'ultra'][v])),
        toggle('Particles', () => renderer.look.particles, (v) => { renderer.look.particles = v; }),
        toggle('Scanlines', () => renderer.look.scanlines, (v) => { renderer.look.scanlines = v; }),
        toggle('Glitch', () => renderer.look.glitch, (v) => { renderer.look.glitch = v; }, { title: 'Tear the picture on strong beats' }),
        toggle('Reduce flashing', () => renderer.look.reduceFlashing, (v) => { renderer.look.reduceFlashing = v; }, { title: 'Softens beat flashes and zoom punches' }),
        backdropBtn,
      ),
      lyricControls,
    ),
  );

  // ── market ────────────────────────────────────────────────────────────────
  market = buildMarket({ registry, renderer, analysis, director, selectScene, toast, lcdShow, icon });
  registry.addEventListener('change', () => { renderSceneRow(); syncSceneRow(); });
  function toggleMarket() {
    if (!market.isOpen && !roomForBoth()) openCrate(false);           // otherwise the two drawers bury the stage between them
    market.toggle();
  }

  // ── rack tabs / collapse ──────────────────────────────────────────────────
  const rack = $('#rack');
  const units = { sound: soundUnit, vision: visionUnit, perform: $('#unit-perform'), stage: $('#unit-stage') };
  function showUnit(name) {
    for (const [k, u] of Object.entries(units)) u.hidden = k !== name;
    document.querySelectorAll('.rack-tabs .tab').forEach((tab) => {
      const on = tab.dataset.unit === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    if (name === 'vision') syncSceneRow();                            // the strip could not centre itself while it was hidden
  }
  document.querySelectorAll('.rack-tabs .tab').forEach((tab) => tab.addEventListener('click', () => { showUnit(tab.dataset.unit); rack.classList.remove('is-collapsed'); }));
  const setRackCollapsed = (v) => {
    rack.classList.toggle('is-collapsed', v);
    $('#rack-toggle').setAttribute('aria-label', v ? 'Expand the rack' : 'Collapse the rack');
  };
  $('#rack-toggle').append(icon('chevron'));
  $('#rack-toggle').addEventListener('click', () => setRackCollapsed(!rack.classList.contains('is-collapsed')));

  // ── deck (transport) ──────────────────────────────────────────────────────
  const playBtn = $('#btn-play');
  const setIcon = (btn, name) => { btn.replaceChildren(icon(name)); };
  const iconButtons = { 'btn-prev': 'prev', 'btn-next': 'next', 'btn-loop': 'loop', 'btn-crate': 'crate', 'btn-rack': 'rack', 'btn-hide': 'hide', 'btn-full': 'full', 'btn-export': 'export', 'crate-close': 'close', 'market-close': 'close', 'hero-close': 'close' };
  for (const [id, name] of Object.entries(iconButtons)) { const b = document.getElementById(id); if (b) b.append(icon(name)); }
  $('#btn-rec').prepend(icon('rec'));
  $('#vol-icon').append(icon('volume'));
  setIcon(playBtn, 'play');

  const refreshPlay = () => {
    setIcon(playBtn, engine.playing ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', engine.playing ? 'Pause' : 'Play');
    body.classList.toggle('is-playing', engine.playing);
  };
  engine.addEventListener('play', refreshPlay);
  engine.addEventListener('pause', refreshPlay);
  engine.addEventListener('ended', () => { refreshPlay(); if (!engine.loop) crate.onEnded(); });
  engine.addEventListener('blocked', () => toast('Press play to start the sound. Browsers only allow audio after a click.', { kind: 'info' }));
  engine.addEventListener('failure', (e) => toast(e.detail, { kind: 'error', timeout: 7000 }));

  playBtn.addEventListener('click', () => {
    if (engine.live) return engine.stopLive();
    if (!engine.track) return openCrate(true);
    engine.toggle();
  });
  $('#btn-prev').addEventListener('click', () => (engine.currentTime > 4 ? engine.seek(0) : crate.prev()));
  $('#btn-next').addEventListener('click', () => crate.next());
  $('#btn-loop').addEventListener('click', () => {
    engine.setLoop(!engine.loop);
    $('#btn-loop').classList.toggle('is-active', engine.loop);
    $('#btn-loop').setAttribute('aria-pressed', String(engine.loop));
    lcdShow('loop', engine.loop ? 'ON' : 'OFF');
  });

  const seek = $('#seek');
  const seekFill = $('#seek-fill');
  const tCur = $('#t-cur');
  const tDur = $('#t-dur');
  let scrubbing = false;
  const seekAt = (e) => {
    const r = seek.getBoundingClientRect();
    engine.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * engine.duration);
  };
  seek.addEventListener('pointerdown', (e) => { scrubbing = true; seek.setPointerCapture(e.pointerId); seekAt(e); });
  seek.addEventListener('pointermove', (e) => scrubbing && seekAt(e));
  seek.addEventListener('pointerup', () => { scrubbing = false; });
  seek.addEventListener('keydown', (e) => {
    const map = { ArrowLeft: -5, ArrowRight: 5, PageDown: -30, PageUp: 30 };
    if (e.key in map) { engine.seek(engine.currentTime + map[e.key]); e.preventDefault(); }
  });

  const vol = $('#vol');
  vol.value = settings.volume ?? 0.85;
  engine.setVolume(Number(vol.value));
  vol.addEventListener('input', () => { engine.setVolume(Number(vol.value)); lcdShow('volume', `${Math.round(vol.value * 100)}%`); saveSettings(); });

  $('#btn-full').addEventListener('click', toggleFullscreen);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast('Fullscreen is not available here.'));
  }
  $('#btn-hide').addEventListener('click', () => setHidden(true));
  $('#btn-rack').addEventListener('click', () => { setRackCollapsed(!rack.classList.contains('is-collapsed')); });

  // ── now playing / hero ────────────────────────────────────────────────────
  const hero = $('#hero');
  engine.addEventListener('trackchange', (e) => {
    const track = e.detail;
    $('#np').hidden = false;
    $('#np-title').textContent = track.title;
    $('#np-artist').textContent = track.artist || (track.source === 'file' ? 'Local file' : '');
    const art = $('#np-art');
    art.hidden = !track.thumb;
    if (track.thumb) art.src = track.thumb;
    document.title = `${track.title} — Visulaserz`;
    hero.classList.add('is-gone');
    renderQueue();
  });
  engine.addEventListener('live', () => {
    refreshPlay();
    if (!engine.live) return;
    $('#np').hidden = false;
    $('#np-title').textContent = engine.liveLabel;
    $('#np-artist').textContent = 'Live input';
    $('#np-art').hidden = true;
    document.title = `${engine.liveLabel} — Visulaserz`;
    hero.classList.add('is-gone');
    renderQueue();
  });
  hero.querySelector('[data-action="demo"]').addEventListener('click', playDemo);
  hero.querySelector('[data-action="files"]').addEventListener('click', () => fileInput.click());
  hero.querySelector('[data-action="crate"]').addEventListener('click', () => openCrate(true));

  let demoTrack = null;
  async function playDemo() {
    engine.ensureContext();
    if (!demoTrack) {
      const done = toast('Synthesising the demo track…', { timeout: 0 });
      try { demoTrack = await renderDemoTrack(); } finally { done(); }
    }
    crate.add(demoTrack, { play: true });
  }

  // ── crate ─────────────────────────────────────────────────────────────────
  const crateEl = $('#crate');
  const roomForBoth = () => window.innerWidth >= 1600;                   // two drawers, and still a stage and a strip between them
  const openCrate = (open) => {
    if (open && market?.isOpen && !roomForBoth()) market.open(false);
    crateEl.classList.toggle('is-open', open);
    crateEl.setAttribute('aria-hidden', String(!open));
    if (open) $('#yt-input').focus({ preventScroll: true });
  };
  $('#btn-crate').addEventListener('click', () => openCrate(!crateEl.classList.contains('is-open')));
  $('#crate-close').addEventListener('click', () => openCrate(false));
  crateEl.querySelector('[data-action="files"]').addEventListener('click', () => fileInput.click());
  crateEl.querySelector('[data-action="demo"]').addEventListener('click', playDemo);

  const fileInput = $('#file-input');
  fileInput.addEventListener('change', () => { engine.ensureContext(); crate.addFiles(fileInput.files); fileInput.value = ''; });

  const ytForm = $('#yt-form');
  const ytInput = $('#yt-input');
  const ytHint = $('#yt-hint');
  const jobEl = $('#yt-job');
  crate.addEventListener('youtube', () => {
    const { available, reason } = crate.youtube;
    // The web edition has no YouTube loader at all: it plays files from the visitor's device.
    body.classList.toggle('is-hosted', crate.hosted);
    $('#hosted-note').hidden = !crate.hosted;
    if (crate.hosted) hero.querySelector('.hero-line').textContent = 'Drop a track or start with the demo. Your files never leave this device.';
    ytHint.textContent = available ? '' : reason;
    ytHint.hidden = available || !reason;
    ytInput.disabled = !available;
    ytForm.querySelector('button').disabled = !available;
    ytInput.placeholder = available ? 'YouTube link, or a song to search for' : 'YouTube is unavailable';
  });
  ytForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = ytInput.value.trim();
    if (!q) return;
    engine.ensureContext();
    try {
      if (looksLikeYouTube(q)) {
        ytInput.value = '';
        await crate.loadYouTube(q, { play: true });
      } else {
        ytForm.classList.add('is-busy');
        await crate.search(q);
        ytForm.classList.remove('is-busy');
      }
    } catch (err) {
      ytForm.classList.remove('is-busy');
      toast(err.message, { kind: 'error', timeout: 8000 });
    }
  });
  crate.addEventListener('job', (e) => {
    const job = e.detail;
    jobEl.hidden = !job;
    if (!job) return;
    const label = { starting: 'Contacting YouTube…', downloading: 'Downloading', converting: 'Converting to MP3…', done: 'Ready' }[job.state] || job.state;
    const pct = job.state === 'downloading' ? ` ${Math.round(job.progress * 100)}%` : '';
    jobEl.replaceChildren(
      el('div', { class: 'job-title' }, job.title || job.videoId),
      el('div', { class: 'job-state' }, `${label}${pct}`),
      el('div', { class: `job-bar ${job.state === 'converting' ? 'is-indeterminate' : ''}` }, el('div', { class: 'job-fill', style: `width:${Math.round(job.progress * 100)}%` })),
    );
  });

  const trackRow = (track, { onPlay, onRemove, onAmbience, active = false, meta = '' }) => el('li', { class: `row ${active ? 'is-active' : ''}` },
    el('button', { class: 'row-main', type: 'button', onclick: onPlay, title: 'Play' },
      track.thumb ? el('img', { class: 'row-art', src: track.thumb, alt: '', loading: 'lazy' }) : el('span', { class: 'row-art row-art-empty' }, icon('play')),
      el('span', { class: 'row-text' }, el('span', { class: 'row-title' }, track.title), el('span', { class: 'row-meta' }, [track.artist, meta].filter(Boolean).join(' · '))),
    ),
    onAmbience ? el('button', { class: 'icon-btn row-remove', type: 'button', 'aria-label': 'Use as scene sound', title: 'Loop this under the music as the scene sound (rain, wind…)', onclick: onAmbience }, icon('umbrella')) : null,
    onRemove ? el('button', { class: 'icon-btn row-remove', type: 'button', 'aria-label': 'Remove', onclick: onRemove }, icon('trash')) : null,
  );

  function useAsAmbience(track) {
    engine.setAmbienceFile(track);
    toast(`“${track.title}” now loops under the music in scenes with sound (Rain). Level: the Ambience knob.`, { timeout: 6000 });
  }

  function renderQueue() {
    const list = $('#queue');
    list.replaceChildren(...crate.tracks.map((t, i) => trackRow(t, { active: i === crate.index && engine.track === t, onPlay: () => crate.play(i), onRemove: () => crate.remove(i), onAmbience: () => useAsAmbience(t) })));
    $('#queue-empty').hidden = crate.tracks.length > 0;
  }
  crate.addEventListener('queue', renderQueue);
  crate.addEventListener('results', () => {
    const section = $('#results-section');
    section.hidden = crate.results.length === 0;
    $('#results').replaceChildren(...crate.results.map((r) => trackRow(r, {
      meta: r.duration ? formatTime(r.duration) : '',
      onPlay: async () => {
        try { await crate.loadYouTube(r.id, { play: true }); } catch (err) { toast(err.message, { kind: 'error', timeout: 8000 }); }
      },
      onAmbience: async () => {
        engine.ensureContext();
        try { useAsAmbience(await crate.loadYouTube(r.id, { play: false })); } catch (err) { toast(err.message, { kind: 'error', timeout: 8000 }); }
      },
    })));
  });
  crate.addEventListener('saved', () => {
    const section = $('#saved-section');
    section.hidden = crate.saved.length === 0;
    $('#saved').replaceChildren(...crate.saved.map((t) => trackRow(t, {
      meta: t.duration ? formatTime(t.duration) : '',
      onPlay: () => { engine.ensureContext(); crate.add(t, { play: true }); },
      onRemove: async () => { try { await crate.removeSaved(t.id); } catch (err) { toast(err.message, { kind: 'error' }); } },
      onAmbience: () => useAsAmbience(t),
    })));
  });

  // ── drag & drop ───────────────────────────────────────────────────────────
  const veil = $('#drop-veil');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; veil.classList.add('is-on'); } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; veil.classList.remove('is-on'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    veil.classList.remove('is-on');
    if (!e.dataTransfer?.files?.length) return;
    engine.ensureContext();
    const files = [...e.dataTransfer.files];
    const image = files.find((f) => f.type.startsWith('image/'));
    if (image) setBackdrop(image);
    const lrc = files.find((f) => /\.(lrc|txt)$/i.test(f.name));
    if (lrc) lrc.text().then((text) => lyrics.setLrc(text, lrc.name));
    const shaders = files.filter(isSceneFile);                        // a .glsl file is a scene of the user's own
    if (shaders.length) market.importFiles(shaders);
    crate.addFiles(files.filter((f) => !f.type.startsWith('image/') && !/\.(lrc|txt)$/i.test(f.name) && !isSceneFile(f)));
  });

  // ── stage pads, meters, artwork ───────────────────────────────────────────
  const stage = buildStage({ engine, analysis, renderer, toast, lcdShow });
  const perform = buildPerform({ engine, toast, lcdShow, onFxChange: () => { refreshFxKnobs(); markCustom(); } });
  const meters = buildMeters({ engine });
  const artwork = attachArtwork({ engine, renderer });
  window.addEventListener('keyup', (e) => { stage.keyup(e); perform.keyup(e); });
  let cycleBeat = 0;
  let cycleClock = 0;
  let lastAmbience = null;
  let ambienceTick = 0;
  let lastStageH = 0;

  // ── recording & export ────────────────────────────────────────────────────
  const recBtn = $('#btn-rec');
  let recorder = null;
  let recStart = 0;
  function toggleRecording() {
    if (recorder) {
      recorder.stop();
      return;
    }
    if (typeof MediaRecorder === 'undefined') return toast('Recording is not supported in this browser.', { kind: 'error' });
    const stream = renderer.canvas.captureStream(60);
    engine.getRecordingStream().getAudioTracks().forEach((t) => stream.addTrack(t));
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
    const chunks = [];
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6, audioBitsPerSecond: 192e3 });
    } catch (e) {
      return toast(`Recording could not start: ${e.message}`, { kind: 'error' });
    }
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      downloadBlob(blob, `${safeFilename(engine.track?.title || 'visulaserz')} - visulaserz.${mime.includes('mp4') ? 'mp4' : 'webm'}`);
      recorder = null;
      recBtn.classList.remove('is-recording');
      recBtn.setAttribute('aria-pressed', 'false');
      stream.getVideoTracks().forEach((t) => t.stop());
      toast('Recording saved.');
    };
    recorder.start(1000);
    recStart = performance.now();
    recBtn.classList.add('is-recording');
    recBtn.setAttribute('aria-pressed', 'true');
    toast('Recording. Press REC again to stop and save.');
  }
  recBtn.addEventListener('click', toggleRecording);

  $('#btn-export').addEventListener('click', async () => {
    if (!engine.track) return toast('Load a track first.');
    const done = toast('Rendering your edit to WAV…', { timeout: 0 });
    try {
      const blob = await engine.exportWav();
      const preset = FX_PRESETS.find((p) => p.id === activePreset);
      const suffix = preset && preset.id !== 'original' ? preset.name.toLowerCase() : 'edit';
      downloadBlob(blob, `${safeFilename(engine.track.title)} (${suffix}).wav`);
      toast(engine.fx.pitchLock ? 'Saved. The export uses varispeed, so pitch follows speed.' : 'Saved.');
    } catch (e) {
      toast(e.message, { kind: 'error', timeout: 7000 });
    } finally {
      done();
    }
  });

  // ── hidden UI / cinema ────────────────────────────────────────────────────
  let idle = 0;
  let hoverUI = false;
  const setHidden = (v) => {
    body.classList.toggle('is-hidden', v);
    if (v) toast('Press H or move the mouse to bring the controls back.', { timeout: 2500 });
  };
  document.querySelectorAll('.marquee, .crate, .market, .rack, .deck').forEach((panel) => {
    panel.addEventListener('pointerenter', () => { hoverUI = true; });
    panel.addEventListener('pointerleave', () => { hoverUI = false; });
  });
  const wake = () => {
    idle = 0;
    body.classList.remove('is-cinema');
    if (body.classList.contains('is-hidden')) body.classList.remove('is-hidden');
  };
  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });

  // ── keyboard ──────────────────────────────────────────────────────────────
  const help = $('#help');
  window.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.classList?.contains('knob') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    if ((tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) || (tag === 'A' && e.key === 'Enter')) return; // a focused button or link acts as one
    if (stage.keydown(e)) { e.preventDefault(); return; }
    if (perform.keydown(e)) { e.preventDefault(); return; }
    const k = e.key;
    let handled = true;
    if (k === ' ') { if (engine.track) engine.toggle(); else playDemo(); }
    else if (k === 'ArrowLeft') engine.seek(engine.currentTime - (e.shiftKey ? 30 : 5));
    else if (k === 'ArrowRight') engine.seek(engine.currentTime + (e.shiftKey ? 30 : 5));
    else if (k === 'ArrowUp' || k === 'ArrowDown') { vol.value = clamp(Number(vol.value) + (k === 'ArrowUp' ? 0.05 : -0.05), 0, 1); vol.dispatchEvent(new Event('input')); }
    else if (/^[1-9]$/.test(k) && registry.scenes[Number(k) - 1]) selectScene(registry.scenes[Number(k) - 1].id);
    else if (k === ']') { director.step(1); selectScene(renderer.sceneId); }
    else if (k === '[') { director.step(-1); selectScene(renderer.sceneId); }
    else if (k === 'p' || k === 'P') nextPalette(e.shiftKey ? -1 : 1);
    else if (k === '.' || k === ',') { const i = Math.max(0, FX_PRESETS.findIndex((p) => p.id === activePreset)); const p = FX_PRESETS[(i + (k === '.' ? 1 : -1) + FX_PRESETS.length) % FX_PRESETS.length]; applyPreset(p, presetValues(p)); }
    else if (k === 'a' || k === 'A') autoBtn.click();
    else if (k === '=' || k === '-') vibes.step(k === '=' ? 1 : -1); // G is the Throw pad
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'h' || k === 'H') setHidden(!body.classList.contains('is-hidden'));
    else if (k === 'c' || k === 'C') openCrate(!crateEl.classList.contains('is-open'));
    else if (k === 'k' || k === 'K') toggleMarket();
    else if (k === 'r' || k === 'R') setRackCollapsed(!rack.classList.contains('is-collapsed'));
    else if (k === 'l' || k === 'L') $('#btn-loop').click();
    else if (k === 'm' || k === 'M') { vol.value = Number(vol.value) > 0 ? 0 : 0.85; vol.dispatchEvent(new Event('input')); }
    else if (k === 'n' || k === 'N') crate.next();
    else if (k === 'e' || k === 'E') $('#btn-export').click();
    else if (k === 'v' || k === 'V') toggleRecording();
    else if (k === 'd' || k === 'D') body.classList.toggle('is-debug');
    else if (k === '?') help.hidden = !help.hidden;
    else if (k === 'Escape') { help.hidden = true; if (market.isOpen) market.open(false); else openCrate(false); }
    else handled = false;
    if (handled) e.preventDefault();
  });
  $('#help-close').addEventListener('click', () => { help.hidden = true; });

  // ── restore settings ──────────────────────────────────────────────────────
  if (settings.fx) { engine.setAll(settings.fx); activePreset = null; setActive(presetRow, () => false); refreshFxKnobs(); }
  // The audio context does not exist yet, so this only records the levels; they reach the
  // Ambience the moment it is built, on the first gesture.
  if (settings.room) { Object.assign(engine.roomMix, settings.room); room.refresh(); }
  if (settings.look) Object.assign(renderer.look, settings.look);
  if (settings.trailOverrides) renderer.trailOverrides = settings.trailOverrides;
  if (reduceMotion && settings.look?.reduceFlashing === undefined) renderer.look.reduceFlashing = true;
  if (settings.sensitivity) analysis.sensitivity = settings.sensitivity;
  if (settings.motion) analysis.motion = settings.motion;
  if (settings.auto) director.enabled = true;
  if (settings.palette) renderer.setPalette(settings.palette);
  const suspect = store.get('probation', null);
  if (suspect && suspect === settings.scene) {
    store.set('probation', null);
    saveSettings();                                                   // or the next reload would walk into it again
    toast(`“${registry.get(suspect)?.name || suspect}” was not started: the picture died while it was showing last time. It is still in the Market (K), where you can delete it or drop a fixed file.`, { kind: 'error', timeout: 12000 });
  } else if (settings.scene) {
    renderer.setScene(settings.scene);
    watchCustom();
  }
  renderer.setQuality(renderer.look.quality);
  visionUnit.querySelectorAll('.switch, .cycle').forEach((b) => b.refresh?.());
  visionUnit.querySelectorAll('.knob').forEach(() => {});
  syncSceneRow();
  for (const [k, knob] of Object.entries(trailKnobs)) knob.setValue(renderer.trail[k], { silent: true });
  applyAccent();
  showUnit('sound');
  openCrate(true);

  // ── per-frame updates ─────────────────────────────────────────────────────
  const debug = $('#debug');
  let debugAcc = 0;
  return {
    toast,
    lyrics,
    market,
    tick(dt, an) {
      market.tick();
      perform.tick(dt, an);
      vibes.tick(dt);
      if (probation > 0 && (probation -= dt) <= 0 && !renderer.gl.isContextLost()) store.set('probation', null);
      if (!scrubbing) {
        const d = engine.duration;
        seekFill.style.width = `${d ? (engine.currentTime / d) * 100 : 0}%`;
        seek.setAttribute('aria-valuenow', String(Math.round(d ? (engine.currentTime / d) * 100 : 0)));
      }
      tCur.textContent = formatTime(engine.currentTime);
      tDur.textContent = formatTime(engine.duration);

      meters.tick(dt, an);
      artwork.tick(dt);
      // lyrics live in the space above the rack, however tall the rack is right now
      const stageH = body.classList.contains('is-cinema') || body.classList.contains('is-hidden') ? window.innerHeight : rack.getBoundingClientRect().top;
      if (stageH !== lastStageH) { lastStageH = stageH; lyrics.stageFrac = clamp(stageH / window.innerHeight, 0.3, 1); }
      lyrics.tick(dt, an);

      if (renderer.sceneId !== shownScene) syncSceneRow();            // the Auto director or the console changed it

      // scene sound: follows whichever scene is showing, however it was chosen
      const ambience = renderer.scene.ambience || null;
      if (ambience !== lastAmbience) {
        lastAmbience = ambience;
        engine.setAmbience(ambience);
      }
      if (ambience && engine.ambience) {
        if (an.isBeat && an.beatCount % 16 === 0) engine.ambience.thunder(0.5 + Math.random() * 1.5); // the flash comes first
        if ((ambienceTick++ & 15) === 0) engine.ambience.setIntensity(an.level);
      }

      if (renderer.look.cycle) {
        cycleClock += dt;
        if (an.beatCount - cycleBeat >= 16 || cycleClock > 30) {
          cycleBeat = an.beatCount;
          cycleClock = 0;
          nextPalette(1);
        }
      }

      lcdHold -= dt;
      if (lcdHold <= 0) {
        const name = recorder ? `● REC ${formatTime((performance.now() - recStart) / 1000)}`
          : engine.live ? `LIVE · ${engine.liveLabel.toUpperCase()}` : `${renderer.scene.name.toUpperCase()}`;
        const preset = FX_PRESETS.find((p) => p.id === activePreset);
        lcdMain.textContent = `${name}  ·  ${preset ? preset.name.toUpperCase() : activePreset === 'mine' ? 'MINE' : 'CUSTOM'}`;
      }
      lcdSub.textContent = `${an.bpm ? `${Math.round(an.bpm)} BPM` : '— BPM'}  ${Math.round(renderer.fps)} FPS`;
      $('#lcd').style.setProperty('--lvl', an.level.toFixed(3));

      if (engine.playing && !hoverUI && !scrubbing && !crateEl.classList.contains('is-open') && !market.isOpen) {
        idle += dt;
        if (idle > 3.5) body.classList.add('is-cinema');
      }
      if (body.classList.contains('is-debug')) {
        debugAcc += dt;
        if (debugAcc > 0.1) {
          debugAcc = 0;
          debug.textContent = `fps ${renderer.fps.toFixed(0)}  bass ${an.bass.toFixed(2)}  mid ${an.mid.toFixed(2)}  high ${an.high.toFixed(2)}  level ${an.level.toFixed(2)}  beat ${an.beat.toFixed(2)}  #${an.beatCount}  bpm ${an.bpm.toFixed(0)}  bal ${an.balance.toFixed(2)}  ${renderer.sceneRT?.w}×${renderer.sceneRT?.h} ${renderer.hdr ? 'hdr' : 'ldr'}`;
        }
      }
    },
  };
}
