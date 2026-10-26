import { DRUMS, SYNTH_PRESETS } from './sounds.js';
import { part, hasNotes, patternOf, LENGTHS, INSERTS, PLUGINS, COLORS } from './model.js';
import { DRAG_TYPE } from './browser.js';

// The CHANNEL RACK, FL Studio's step sequencer. A row per channel: its mute light, pan, volume,
// the mixer insert it goes to, its name (click it for the instrument's window) and its steps.
// Click a step to light it, drag along the row to paint, right-click to rub out, Shift for an
// accent. A channel with notes in the piano roll shows them in its row instead. The graph editor
// shows the picked channel's step velocities as bars to drag.

const STEP_W = 19;

export function buildRack(S, kit) {
  const { el } = S;
  let graph = false;
  let paint = null;
  let built = '';
  const cells = new Map();
  let lastNow = -1;

  const patName = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'The pattern this rack shows: click for the list' });
  patName.addEventListener('click', () => kit.menu(patName, [
    ...S.project.patterns.map((p) => ({ label: p.name, color: p.color, checked: p.id === S.project.pattern, fn: () => S.setPattern(p.id) })),
    { sep: true }, { label: 'New pattern', fn: () => S.newPattern() }, { label: 'Clone this pattern', fn: () => S.clonePattern() },
  ]));
  const swing = kit.knob({ label: 'Swing', value: S.project.swing, min: 0, max: 0.6, def: 0, show: true, fmt: (v) => `${Math.round((v / 0.6) * 100)}%`, onChange: (v) => { S.project.swing = v; S.changed('swing', true); } });
  const lenSel = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'How long this pattern is' });
  lenSel.addEventListener('click', () => kit.menu(lenSel, LENGTHS.map((n) => ({ label: `${n / 16} bar${n > 16 ? 's' : ''}`, checked: S.pat()?.len === n, fn: () => { S.pat().len = n; S.changed('length'); } }))));
  const graphBtn = el('button', { class: 'st2-btn', type: 'button', 'data-hint': 'Graph editor: the picked channel’s step velocities, to drag', onclick: () => { graph = !graph; graphBtn.classList.toggle('is-on', graph); built = ''; render(); } }, 'Velocity');
  const rows = el('div', {});
  const add = el('button', { class: 'st2-add', type: 'button', 'data-hint': 'Add a channel: an instrument, a drum, a synth preset', onclick: (e) => addMenu(e.currentTarget) }, '+ Channel');
  const scroll = el('div', { class: 'st2-rack-scroll' }, rows, add);
  const node = el('div', { class: 'st2-rack' },
    el('div', { class: 'st2-tools' }, patName, swing.el, lenSel, graphBtn), scroll);

  function addMenu(anchor) {
    kit.menu(anchor, [
      { head: 'Instruments' },
      { label: '3-Osc Synth', fn: () => S.addChannel('synth', 'lead') },
      { label: 'Drum Synth', fn: () => S.addChannel('drum', 'kick') },
      { label: 'Sampler (drop a sound in it)', fn: () => S.addChannel('sampler') },
      { label: 'Slicer (slices of the song)', fn: () => S.addChannel('slicer') },
      { head: 'Drums' }, ...DRUMS.map((d) => ({ label: d.name, fn: () => S.addChannel('drum', d.id) })),
      { head: 'Synth presets' }, ...SYNTH_PRESETS.map((p) => ({ label: p.name, fn: () => S.addChannel('synth', p.id) })),
    ]);
  }
  function channelMenu(ch, at) {
    const fill = (every) => () => { const q = part(S.pat(), ch.id); q.notes = []; for (let k = 0; k < S.pat().len; k++) q.steps[k] = k % every === 0 ? 100 : 0; S.changed('steps'); };
    kit.menu(null, [
      { head: ch.name },
      { label: 'Piano roll', fn: () => S.openRoll(ch.id) },
      { label: `${PLUGINS[ch.plugin]} window`, fn: () => S.openPlugin(ch.id) },
      { label: 'Rename…', fn: () => kit.rename(rows.querySelector(`[data-ch="${ch.id}"] .st2-name`), ch.name, (v) => { ch.name = v; S.changed('channels'); }) },
      { label: 'Fill each 2 steps', fn: fill(2) }, { label: 'Fill each 4 steps', fn: fill(4) }, { label: 'Fill each 8 steps', fn: fill(8) },
      { label: 'Clear in this pattern', fn: () => S.clearPart(ch) },
      { label: 'Clone channel', fn: () => S.cloneChannel(ch.id) },
      { head: 'Colour' },
      ...COLORS.slice(0, 8).map((c) => ({ label: c === ch.color ? 'This one' : 'Use this', color: c, fn: () => { ch.color = c; S.changed('channels'); } })),
      { sep: true },
      { label: 'Delete channel', danger: true, fn: () => S.removeChannel(ch.id) },
    ], at);
  }

  // ── a row ──────────────────────────────────────────────────────────────────────────────────
  function row(ch) {
    const sel = ch.id === S.project.selected;
    const led = el('button', { class: `st2-led ${ch.mute ? '' : 'is-on'} ${ch.solo ? 'is-solo' : ''}`, type: 'button', 'data-hint': `${ch.name}: click to mute, right-click to solo` });
    led.addEventListener('click', () => { ch.mute = !ch.mute; S.engine?.syncChannels(); S.changed('channels'); });
    led.addEventListener('contextmenu', (e) => { e.preventDefault(); ch.solo = !ch.solo; S.engine?.syncChannels(); S.changed('channels'); });
    const pan = kit.knob({ label: 'Pan', value: ch.pan, min: -1, max: 1, def: 0, origin: 0, fmt: (v) => (Math.abs(v) < 0.02 ? 'Centred' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'left' : 'right'}`), onChange: (v) => { ch.pan = v; S.engine?.syncChannels(); S.changed('mix', true); } });
    const vol = kit.knob({ label: 'Volume', value: ch.vol, def: 0.78, onChange: (v) => { ch.vol = v; S.engine?.syncChannels(); S.changed('mix', true); } });
    const ins = el('span', { class: 'st2-ins', 'data-hint': `Mixer insert: ${ch.insert ? `Insert ${ch.insert}` : 'Master'}. Drag up or down to route it` }, ch.insert ? String(ch.insert) : 'M');
    kit.dragNumber(ins, { get: () => ch.insert, set: (v) => { ch.insert = v; ins.textContent = v ? String(v) : 'M'; S.engine?.syncChannels(); }, min: 0, max: INSERTS, step: 1, px: 8, onEnd: () => S.changed('routing') });
    const name = el('button', { class: 'st2-name', type: 'button', style: `--c:${ch.color}`, 'data-hint': `${ch.name} (${PLUGINS[ch.plugin]}): click for its window, right-click for more` }, ch.name);
    name.addEventListener('click', () => { S.select(ch.id); S.openPlugin(ch.id); });
    name.addEventListener('contextmenu', (e) => { e.preventDefault(); S.select(ch.id); channelMenu(ch, { x: e.clientX, y: e.clientY }); });
    const r = el('div', { class: `st2-row ${sel ? 'is-selected' : ''}`, dataset: { ch: ch.id } }, led, pan.el, vol.el, ins, name);
    const pat = S.pat();
    if (pat && hasNotes(pat, ch.id)) {
      const c = el('canvas', { class: 'st2-mini', 'data-hint': 'Notes from the piano roll: click to open them', width: String(pat.len * STEP_W), height: '20' });
      c.style.width = `${pat.len * STEP_W - 2}px`;
      c.addEventListener('click', () => S.openRoll(ch.id));
      r.append(c);
      requestAnimationFrame(() => mini(c, ch, pat));
      cells.delete(ch.id);
    } else {
      const steps = el('div', { class: 'st2-steps' });
      const q = pat?.ch[ch.id];
      const btns = [];
      for (let k = 0; k < (pat?.len || 16); k++) {
        const v = q?.steps[k] || 0;
        const b = el('span', { class: `st2-step ${Math.floor(k / 4) % 2 ? 'alt' : ''} ${v ? 'on' : ''}`, style: `--c:${ch.color}`, dataset: { k: String(k) } });
        btns.push(b);
      }
      steps.append(...btns);
      cells.set(ch.id, btns);
      steps.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('.st2-step');
        if (!b) return;
        e.preventDefault();
        S.host.capture(steps, e);
        const k = Number(b.dataset.k), q2 = part(S.pat(), ch.id);
        const erase = e.button === 2;
        paint = { ch, on: erase ? 0 : (q2.steps[k] ? 0 : (e.shiftKey ? 127 : 100)), done: new Set([k]) };
        set(ch, k, paint.on);
        if (paint.on) S.audition(ch);
      });
      steps.addEventListener('pointermove', (e) => {
        if (!paint || paint.ch !== ch) return;
        const b = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.st2-step');
        if (!b || !steps.contains(b)) return;
        const k = Number(b.dataset.k);
        if (paint.done.has(k)) return;
        paint.done.add(k);
        set(ch, k, paint.on);
      });
      const end = () => { if (paint) { paint = null; S.changed('steps'); } };
      steps.addEventListener('pointerup', end);
      steps.addEventListener('pointercancel', end);
      steps.addEventListener('lostpointercapture', end);
      steps.addEventListener('contextmenu', (e) => e.preventDefault());
      r.append(steps);
    }
    if (!graph || !sel || hasNotes(pat, ch.id)) return [r];
    // the graph editor under the picked channel: a bar per step, its height the velocity
    const q = part(pat, ch.id);
    const bars = el('div', { class: 'st2-graph' });
    for (let k = 0; k < pat.len; k++) {
      const v = q.steps[k];
      bars.append(el('span', { class: 'st2-bar-v', dataset: { k: String(k) } }, el('i', { style: `height:${v ? (v / 127) * 100 : 0}%` })));
    }
    let on = false;
    const setV = (e) => {
      const b = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.st2-bar-v');
      if (!b || !bars.contains(b)) return;
      const k = Number(b.dataset.k);
      if (!q.steps[k]) return;
      const rr = b.getBoundingClientRect();
      const v = Math.max(1, Math.min(127, Math.round(((rr.bottom - e.clientY) / rr.height) * 127)));
      q.steps[k] = v;
      b.firstChild.style.height = `${(v / 127) * 100}%`;
      S.hint(`Velocity: ${v}`, true);
    };
    bars.addEventListener('pointerdown', (e) => { e.preventDefault(); S.host.capture(bars, e); on = true; setV(e); });
    bars.addEventListener('pointermove', (e) => { if (on) setV(e); });
    const done = () => { if (on) { on = false; S.changed('steps'); } };
    bars.addEventListener('pointerup', done);
    bars.addEventListener('pointercancel', done);
    bars.addEventListener('lostpointercapture', done);
    return [r, bars];
  }
  function set(ch, k, v) {
    part(S.pat(), ch.id).steps[k] = v;
    const b = cells.get(ch.id)?.[k];
    if (b) b.classList.toggle('on', !!v);
  }
  function mini(c, ch, pat) {
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    for (let b = 0; b < pat.len / 4; b++) if (b % 2) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect((b * 4 / pat.len) * w, 0, (4 / pat.len) * w, h); }
    const notes = pat.ch[ch.id]?.notes || [];
    if (!notes.length) return;
    const lo = Math.min(...notes.map((n) => n.k)), hi = Math.max(...notes.map((n) => n.k)), span = Math.max(12, hi - lo + 1);
    g.fillStyle = ch.color;
    for (const n of notes) g.fillRect((n.s / pat.len) * w, h - 3 - ((n.k - lo) / span) * (h - 6) - 1, Math.max(2, (n.l / pat.len) * w - 1), 3);
  }

  // anything from the browser dropped on the rack becomes a channel; an audio file, a sampler
  node.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  node.addEventListener('drop', (e) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (raw) {
      e.preventDefault();
      const spec = JSON.parse(raw);
      if (spec.add) S.addChannel(spec.add[0], spec.add[1]);
      else if (spec.sample) S.addSampler(S.samples.find((s) => s.name === spec.sample));
      return;
    }
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aiff?)$/i.test(x.name));
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    S.importSample(f).then((s) => { if (s) S.addSampler(s); });
  });

  function render() {
    const pat = S.pat();
    patName.textContent = pat ? pat.name : '—';
    lenSel.textContent = `${(pat?.len || 16) / 16} bar${(pat?.len || 16) > 16 ? 's' : ''}`;
    swing.setValue(S.project.swing, { silent: true });
    const shape = `${pat?.id}|${pat?.len}|${graph}|${S.project.selected}|${S.project.channels.map((c) => `${c.id}:${c.name}:${c.mute}:${c.solo}:${c.insert}:${c.color}:${hasNotes(pat, c.id)}`).join(',')}`;
    if (shape !== built) {
      built = shape;
      rows.replaceChildren(...S.project.channels.flatMap(row));
      return;
    }
    for (const ch of S.project.channels) {
      const btns = cells.get(ch.id);
      if (!btns) continue;
      const q = pat?.ch[ch.id];
      btns.forEach((b, k) => b.classList.toggle('on', !!q?.steps[k]));
    }
  }

  return {
    node,
    render,
    // the step playing lights down every row (pattern mode, this pattern)
    tick() {
      const at = S.engine?.position();
      const k = at && at.mode !== 'song' && at.pattern === S.project.pattern ? Math.floor(at.step) : -1;
      if (k === lastNow) return;
      lastNow = k;
      for (const btns of cells.values()) btns.forEach((b, i) => b.classList.toggle('now', i === k));
    },
    invalidate() { built = ''; },
  };
}
export { patternOf };
