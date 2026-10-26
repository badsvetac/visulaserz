import { el, store } from '../util.js';
import { createMidi } from '../control/midi.js';
import { createGamepads } from '../control/gamepad.js';
import { createCamera } from '../control/camera.js';
import { controlAt, addressOf, resolve, setKnob, nudgeKnob, holdPad, pressButton, surfaceOf } from '../control/targets.js';

// The CONTROL unit: the show played from a MIDI controller, a gamepad, or a hand in the air.
// LEARN, touch any knob, pad, button or touch pad on the screen, then move something on the
// controller: from then on, that moves it. A touch pad takes two controls (across, then up), or
// the camera's hand all at once. Mappings are kept, and a tool that is closed picks its own back
// up when it is opened again.

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const IDLE_MS = 450;                   // a touch pad played from knobs lets go this long after they stop

export function buildControl({ toast, lcdShow, key, group }) {
  const unit = document.getElementById('unit-control');
  const valid = (m) => m && typeof m.src === 'string' && m.target && typeof m.target.scope === 'string' && Number.isInteger(m.target.index);
  let maps = (store.get('control', {}).maps || []).filter(valid);
  const save = () => store.set('control', { maps });
  let learning = false;
  let pending = null;                  // { node, addr, parts } once a control has been touched in Learn
  const touches = new Map();           // a touch pad being played: key → { x, y, down, last, how, present, api }
  const edges = new Map();             // src → on, so a button bound to a click fires once per press
  const marked = new Set();
  let waving = 0;                      // how long a hand has waved at the camera while a control waits in Learn
  let beam = '#ff4fd8';

  // ── the unit ──────────────────────────────────────────────────────────────
  const midiKey = key('Connect', { title: 'Use a MIDI controller. The browser asks once.', onClick: () => midi.connect() });
  const midiStatus = el('span', { class: 'control-status' });
  const padStatus = el('span', { class: 'control-status' });
  const camKey = key('Camera', { title: 'Play with your hand in the air. Nothing is recorded or sent anywhere.', onClick: () => toggleCam() });
  const camView = el('canvas', { class: 'control-cam', width: 96, height: 72, 'aria-hidden': 'true' });
  const learnKey = key('Learn', { title: 'Touch a control on the screen, then move one on your controller (Esc stops)', onClick: () => setLearning(!learning) });
  const hint = el('span', { class: 'control-status control-hint' });
  const list = el('ul', { class: 'control-maps', 'aria-label': 'Mappings' });
  const clearKey = key('Clear', { title: 'Forget every mapping', onClick: () => { maps = []; save(); paint(); lcdShow('mappings', 'CLEARED'); } });
  // While Learn is on, a chip over the stage says what it waits for and ends it: the Control unit
  // is out of sight once you go to another rack unit or a tool, and a touch screen has no Escape.
  const chipText = el('span', { class: 'learn-chip-text' }, '');
  const chip = el('div', { class: 'learn-chip', role: 'status', hidden: true },
    el('span', { class: 'learn-chip-dot', 'aria-hidden': 'true' }), chipText,
    el('button', { class: 'learn-chip-done', type: 'button', title: 'Stop learning (Esc)', onclick: () => setLearning(false) }, 'Done'));
  document.body.append(chip);
  const say = (text) => { hint.textContent = text; chipText.textContent = text; };
  unit.append(el('div', { class: 'knob-row control-row' },
    group('MIDI', midiKey, midiStatus),
    group('Gamepad', padStatus),
    group('Air', camKey, camView),
    group('Learn', learnKey, hint),
    group('Mappings', list, clearKey),
  ));

  const midi = createMidi({ onMessage: (m) => input(m), onChange: () => paint() });
  const pads = createGamepads({ onInput: (m) => input(m), onChange: () => paint() });
  const cam = createCamera({ onHand: (h) => hand(h), onChange: () => paint() });

  const describe = (src) => (src.startsWith('midi:') ? midi.describe(src) : src.startsWith('pad:') ? pads.describe(src)
    : { 'cam:x': 'Hand ↔', 'cam:y': 'Hand ↕', 'cam:hand': 'Hand' }[src] || src);
  const PART = { x: 'across', y: 'up', touch: 'touch' };

  function paint() {
    const ms = midi.state, devs = midi.devices;
    midiStatus.textContent = { unsupported: 'This browser has no MIDI (Chrome and Edge do)', off: 'Not connected', asking: 'Waiting for permission…',
      denied: 'Not allowed: allow MIDI from the address bar', on: devs.length ? devs.join(', ') : 'Allowed: plug a controller in' }[ms];
    midiStatus.classList.toggle('is-on', ms === 'on' && devs.length > 0);
    midiKey.classList.toggle('is-active', ms === 'on');
    padStatus.textContent = pads.devices.length ? pads.devices.join(', ') : 'Press a button on a gamepad';
    padStatus.classList.toggle('is-on', pads.devices.length > 0);
    camKey.classList.toggle('is-active', cam.state === 'on');
    camKey.querySelector('span:last-child').textContent = cam.state === 'asking' ? 'Asking…' : 'Camera';
    camView.classList.toggle('is-on', cam.state === 'on');
    if (cam.state !== 'on') camView.getContext('2d').clearRect(0, 0, camView.width, camView.height);
    learnKey.classList.toggle('is-active', learning);
    chip.hidden = !learning;
    if (!pending) say(learning ? 'Touch a control on the screen' : maps.length ? `${maps.length} mapped` : 'Learn, touch a control, move one on the controller');
    list.replaceChildren(...maps.map((m, i) => el('li', {},
      el('span', { class: 'control-src' }, describe(m.src)),
      el('span', { class: 'control-to' }, `${m.target.label}${m.part ? ` (${PART[m.part]})` : ''}`),
      el('button', { class: 'control-x', type: 'button', title: 'Forget this mapping', 'aria-label': `Forget ${describe(m.src)}`, onclick: () => { maps.splice(i, 1); save(); paint(); } }, '×'))));
    if (!maps.length) list.append(el('li', { class: 'control-empty' }, 'Nothing mapped yet'));
    mark();
  }
  // while learning, every control that is already mapped shows it
  function mark() {
    for (const n of marked) n.classList.remove('is-mapped');
    marked.clear();
    if (!learning) return;
    for (const m of maps) { const n = resolve(m.target); if (n) { n.classList.add('is-mapped'); marked.add(n); } }
  }

  // ── learning ──────────────────────────────────────────────────────────────
  function setLearning(on) {
    learning = on;
    document.body.classList.toggle('is-learning', on);
    if (!on) dropPending();
    lcdShow('learn', on ? 'TOUCH A CONTROL' : 'OFF');
    paint();
  }
  function dropPending() {
    pending?.node.classList.remove('is-learn-target');
    pending = null;
  }
  // In Learn, a press on a control picks it instead of working it (and the click after it is eaten).
  function pick(e) {
    if (!learning) return;
    const node = controlAt(e.target);
    if (!node) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type !== 'pointerdown') return;
    const addr = addressOf(node);
    if (!addr) return;
    dropPending();
    pending = { node, addr, parts: [] };
    waving = 0;
    node.classList.add('is-learn-target');
    const air = cam.state === 'on' ? ', or wave at the camera for a second' : '';
    say(addr.kind === 'surface' ? `${addr.label}: move a control for across${air}` : `${addr.label}: now move a control${air}`);
  }
  document.addEventListener('pointerdown', pick, true);
  document.addEventListener('click', pick, true);

  function learnFrom(m) {
    const { addr } = pending;
    const flowing = m.kind === 'cc' || m.kind === 'bend' || m.kind === 'axis' || m.analog;
    if (m.src === 'cam:hand') {
      if (addr.kind === 'surface') bind([{ src: 'cam:x', part: 'x' }, { src: 'cam:y', part: 'y' }, { src: 'cam:hand', part: 'touch' }]);
      else bind([{ src: addr.kind === 'knob' ? 'cam:y' : 'cam:hand' }]);
      return;
    }
    if (addr.kind === 'surface') {
      if (!flowing || pending.parts.some((p) => p.src === m.src)) return;
      pending.parts.push({ src: m.src, part: pending.parts.length ? 'y' : 'x' });
      if (pending.parts.length === 2) bind(pending.parts);
      else say(`${describe(m.src)} is across. Now move another for up.`);
      return;
    }
    if (addr.kind === 'knob') {
      if (!flowing) { say('A knob wants a knob, a fader or a stick: move one of those.'); return; }
      bind([{ src: m.src }]);
      return;
    }
    // a pad or a button: a key, a gamepad button, a MIDI button that sends a CC
    if (m.kind === 'axis' || m.kind === 'bend' || m.analog) return;
    if ((m.kind === 'note' || m.kind === 'button') && !m.on) return;
    bind([{ src: m.src }]);
  }
  function bind(parts) {
    const target = { ...pending.addr };
    const sources = new Set(parts.map((p) => p.src));
    maps = maps.filter((x) => !sources.has(x.src));          // one control on the controller moves one thing
    for (const p of parts) maps.push(p.part ? { src: p.src, target, part: p.part } : { src: p.src, target });
    save();
    const node = pending.node;
    dropPending();
    node.classList.add('is-learnt');
    setTimeout(() => node.classList.remove('is-learnt'), 700);
    say(`${parts.map((p) => describe(p.src)).join(' + ')} → ${target.label}`);
    lcdShow('learnt', target.label.toUpperCase().slice(0, 18));
    paint();
  }

  // ── playing ───────────────────────────────────────────────────────────────
  function input(m) {
    // whether this control was down before this message, for the ones that act on a press
    const was = edges.get(m.src) ?? false;
    if (m.on !== undefined || m.kind === 'cc') edges.set(m.src, m.on ?? m.value >= 0.5);
    if (learning) { if (pending) learnFrom(m); return; }
    let used = false;
    for (const map of maps) if (map.src === m.src) { drive(map, m, was); used = true; }
    // a note no mapping wants is played: the Studio's picked channel listens for these
    if (!used && m.kind === 'note') dispatchEvent(new CustomEvent('vz-note', { detail: { key: m.num, vel: m.value, on: m.on } }));
  }
  function drive(map, m, was) {
    const node = resolve(map.target);
    if (!node) return;                      // its tool is closed: the mapping waits for it
    const kind = map.target.kind;
    if (kind === 'knob') {
      if (m.kind === 'axis') {
        // a stick pushes the knob along and leaves it where it is when let go (up is more)
        const v = m.num % 2 ? -m.value : m.value;
        if (Math.abs(v) > 0.12) nudgeKnob(node, v * (m.dt || 1 / 60) * 0.9);
      } else if (m.kind === 'cam') {
        if (m.present) setKnob(node, m.value);
      } else {
        setKnob(node, m.value);
      }
      return;
    }
    if (kind === 'pad' || kind === 'button') {
      const on = m.on ?? m.value >= 0.5;
      if (on === was) return;
      if (kind === 'pad') holdPad(node, on);
      else if (on) pressButton(node);
      return;
    }
    if (kind === 'surface') touchSurface(map, node, m);
  }
  function touchSurface(map, node, m) {
    const api = surfaceOf(node);
    if (!api) return;
    const id = `${map.target.scope}|${map.target.index}`;
    let t = touches.get(id);
    if (!t || t.api !== api) {
      if (t?.down) t.api.up();
      t = { x: 0.5, y: 0.5, down: false, last: 0, how: 'midi', present: false, api };
      touches.set(id, t);
    }
    const v = m.kind === 'axis' ? (map.part === 'y' ? 0.5 - m.value / 2 : 0.5 + m.value / 2) : m.value;   // a stick pushed up reads negative
    if (map.part === 'x') t.x = v;
    else if (map.part === 'y') t.y = v;
    else if (map.part === 'touch') t.present = !!m.on;
    t.how = m.kind === 'axis' ? 'stick' : m.kind === 'cam' || m.kind === 'hand' ? 'hand' : 'midi';
    if (m.kind === 'cam') t.present = m.present;
    t.last = performance.now();
    update(t);
  }
  function update(t, now = performance.now()) {
    const active = t.how === 'stick' ? Math.hypot(t.x - 0.5, t.y - 0.5) > 0.08 : t.how === 'hand' ? t.present : now - t.last < IDLE_MS;
    const p = { x: clamp01(t.x), y: clamp01(t.y) };
    if (active && !t.down) { t.down = true; t.api.down(p); } else if (active) t.api.move(p); else if (t.down) { t.down = false; t.api.up(); }
  }

  // ── the hand ──────────────────────────────────────────────────────────────
  function hand(h) {
    drawCam(h);
    if (learning) {
      // the camera sees the hand that is using the mouse too: it is only learnt from a wave that
      // goes on for most of a second, not from the moment it takes to pick the control
      waving = pending && h.present ? waving + 1 / 30 : 0;
      if (waving > 0.8) { waving = 0; learnFrom({ src: 'cam:hand', kind: 'hand', on: true }); }
      return;
    }
    input({ src: 'cam:x', kind: 'cam', value: h.x, present: h.present });
    input({ src: 'cam:y', kind: 'cam', value: h.y, present: h.present });
    if (h.present !== (edges.get('cam:hand') ?? false)) input({ src: 'cam:hand', kind: 'hand', on: h.present, value: h.present ? 1 : 0 });
  }
  function drawCam(h) {
    const g = camView.getContext('2d'), w = camView.width, ht = camView.height;
    if (!cam.video) { g.clearRect(0, 0, w, ht); return; }
    g.save();
    g.translate(w, 0);
    g.scale(-1, 1);                       // a mirror, the way a selfie camera shows you
    g.globalAlpha = 0.6;
    g.drawImage(cam.video, 0, 0, w, ht);
    g.restore();
    if (h.present) {
      g.fillStyle = beam;
      g.beginPath();
      g.arc(h.x * w, (1 - h.y) * ht, 5, 0, Math.PI * 2);
      g.fill();
    }
  }
  async function toggleCam() {
    if (cam.state === 'on') { cam.stop(); lcdShow('air', 'OFF'); return; }
    const ok = await cam.start();
    if (!ok) {
      toast(cam.state === 'denied' ? 'The camera was not allowed. Allow it from the address bar and press Camera again.'
        : 'No camera could be opened.', { kind: 'error' });
      return;
    }
    beam = getComputedStyle(document.body).getPropertyValue('--beam').trim() || beam;
    lcdShow('air', 'WAVE');
    // the first time, the hand goes to the Perform rack's XY pad, the most obvious thing to play in the air
    if (!maps.some((m) => m.src.startsWith('cam:'))) {
      const pad = document.querySelector('#unit-perform .xy');
      const target = (pad && addressOf(pad)) || { scope: '#unit-perform', kind: 'surface', index: 0, label: 'Perform · Touch pad' };
      target.label = 'Perform · XY pad';
      maps.push({ src: 'cam:x', target, part: 'x' }, { src: 'cam:y', target, part: 'y' }, { src: 'cam:hand', target, part: 'touch' });
      save();
      paint();
      toast('Camera on: your hand plays the XY pad in the Perform rack (filter and echo). Learn sends it anywhere else.');
    }
  }

  midi.resume();
  paint();

  return {
    get learning() { return learning; },
    get maps() { return maps; },
    midi, pads, cam,
    keydown(e) {
      if (learning && e.key === 'Escape') { setLearning(false); return true; }
      return false;
    },
    tick(dt) {
      pads.poll(dt);
      cam.tick(dt);
      const now = performance.now();
      for (const t of touches.values()) if (t.down && t.how === 'midi') update(t, now);
    },
  };
}
