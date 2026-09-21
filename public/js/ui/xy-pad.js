import { el, clamp } from '../util.js';
import { FX_PARAMS } from '../audio/params.js';

// A Kaoss-style performance pad: one finger bends two parameters at once, and lets go of
// them again. The spring-back is the whole point — you can dive into a filter sweep during
// a chorus and the rack is exactly where you left it a quarter of a second later.
export const XY_MODES = [
  { name: 'Filter × Echo', x: 'filter', y: 'echoMix' },
  { name: 'Slow × Space', x: 'speed', y: 'reverbMix' },
  { name: 'Dirt × Muffle', x: 'drive', y: 'muffle' },
  { name: 'Orbit × Wobble', x: 'orbit', y: 'orbitRate' },
];

const SPRING = 0.22; // seconds to glide home after release

// Knobs are not linear: params.js gives some of them a curve so the useful part of the
// range gets most of the travel. The pad has to speak the same language or the middle of
// the square would not match the middle of the knob.
const toValue = (id, n) => {
  const p = FX_PARAMS[id];
  return p.min + (p.max - p.min) * Math.pow(clamp(n, 0, 1), p.curve || 1);
};
const toNorm = (id, v) => {
  const p = FX_PARAMS[id];
  return Math.pow(clamp((v - p.min) / (p.max - p.min), 0, 1), 1 / (p.curve || 1));
};

export function buildXYPad({ engine, onChange, lcdShow }) {
  let mode = 0;
  let holding = false;
  let latched = false;
  let base = null;     // where the knobs were before the finger landed
  let spring = null;   // { from:{x,y}, t } while gliding home
  let pos = { x: 0.5, y: 0.5 };

  const dot = el('span', { class: 'xy-dot' });
  const hLine = el('span', { class: 'xy-line xy-line-h' });
  const vLine = el('span', { class: 'xy-line xy-line-v' });
  const labelX = el('span', { class: 'xy-axis xy-axis-x' });
  const labelY = el('span', { class: 'xy-axis xy-axis-y' });
  const surface = el('div', {
    class: 'xy', role: 'application', tabindex: '0',
    title: 'Press and drag: two effects at once. Hold Shift as you release to leave them where they are.',
  }, hLine, vLine, dot, labelX, labelY);

  const modeBtn = el('button', { class: 'cycle', type: 'button', title: 'Which two effects the pad bends' },
    el('span', { class: 'cycle-label' }, 'Pad'), el('span', { class: 'cycle-value' }, XY_MODES[0].name));

  function refreshLabels() {
    const m = XY_MODES[mode];
    labelX.textContent = FX_PARAMS[m.x].label;
    labelY.textContent = FX_PARAMS[m.y].label;
    modeBtn.querySelector('.cycle-value').textContent = m.name;
  }
  modeBtn.addEventListener('click', (e) => {
    if (holding) return;
    mode = (mode + (e.shiftKey ? -1 : 1) + XY_MODES.length) % XY_MODES.length;
    refreshLabels();
    syncToKnobs();
    lcdShow?.('pad', XY_MODES[mode].name);
  });

  // When nothing is being held the crosshair should sit wherever the real knobs are, so
  // the pad always tells the truth about the current sound.
  function syncToKnobs() {
    if (holding) return;
    const m = XY_MODES[mode];
    pos = { x: toNorm(m.x, engine.fx[m.x]), y: toNorm(m.y, engine.fx[m.y]) };
    render();
  }

  function render() {
    dot.style.left = `${pos.x * 100}%`;
    dot.style.bottom = `${pos.y * 100}%`;
    vLine.style.left = `${pos.x * 100}%`;
    hLine.style.bottom = `${pos.y * 100}%`;
  }

  function writeAt(x, y) {
    const m = XY_MODES[mode];
    pos = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
    engine.setMany({ [m.x]: toValue(m.x, pos.x), [m.y]: toValue(m.y, pos.y) }, { silent: true });
    render();
    onChange?.();
  }

  const at = (e) => {
    const r = surface.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  };

  surface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    surface.setPointerCapture(e.pointerId);
    const m = XY_MODES[mode];
    holding = true;
    spring = null;
    base = { [m.x]: engine.fx[m.x], [m.y]: engine.fx[m.y] };
    surface.classList.add('is-held');
    const p = at(e);
    writeAt(p.x, p.y);
    lcdShow?.('pad', XY_MODES[mode].name);
  });
  surface.addEventListener('pointermove', (e) => {
    if (!holding) return;
    const p = at(e);
    writeAt(p.x, p.y);
  });
  const lift = (e) => {
    if (!holding) return;
    holding = false;
    surface.classList.remove('is-held');
    latched = e?.shiftKey === true;
    if (latched || !base) { base = null; return; }
    const m = XY_MODES[mode];
    // Remember both ends now: reading the live value every frame would make the glide
    // chase a moving target and never be the straight line it looks like.
    spring = { from: { [m.x]: engine.fx[m.x], [m.y]: engine.fx[m.y] }, to: { ...base }, t: 0 };
  };
  surface.addEventListener('pointerup', lift);
  surface.addEventListener('pointercancel', lift);
  surface.addEventListener('lostpointercapture', lift);

  refreshLabels();
  syncToKnobs();
  // Follow the rack when anything else moves it — a preset, the restored settings, a knob.
  // The pad's own writes are silent, so this can never chase its own tail.
  engine.addEventListener('fxchange', syncToKnobs);

  return {
    node: el('div', { class: 'xy-wrap' }, surface, modeBtn),
    syncToKnobs,
    tick(dt) {
      if (!spring) return;
      spring.t += dt / SPRING;
      const k = Math.min(1, spring.t);
      const ease = k * k * (3 - 2 * k);
      const next = {};
      for (const id of Object.keys(spring.to)) next[id] = spring.from[id] + (spring.to[id] - spring.from[id]) * ease;
      engine.setMany(next, { silent: true });
      onChange?.();
      if (k >= 1) { spring = null; base = null; syncToKnobs(); }
    },
  };
}
