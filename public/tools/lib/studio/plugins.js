import { DRUMS, SYNTH_PRESETS, WAVES, presetParams, noteName, ROOT } from './sounds.js';
import { fxDef } from './effects.js';
import { PLUGINS } from './model.js';
import { waveIcon } from './ui-kit.js';

// The windows of the instruments and the effects, the way FL opens a plugin's window when its
// channel's name is clicked: the channel's own volume, pan and pitch at the top, the plugin's
// controls under them, and a little keyboard at the bottom to try it out.

export function pluginWindow(S, kit, channel) {
  return (body, win) => {
    const { el } = S;
    const root = el('div', { class: 'st2-plugin' });
    body.append(root);
    let wave = null;
    // The channel is found again by its id on every render: an undo or a redo puts fresh copies of
    // the channels in the project, and a window holding the old one would edit nothing.
    const id = channel.id;
    let ch = channel;
    function title() { S.windows.title(`plugin:${id}`, `${ch.name} · ${PLUGINS[ch.plugin]}`); }
    const changed = (quiet = true) => S.changed('plugin', quiet);
    const k = (o) => kit.knob({ show: true, ...o });
    function section(name, ...kids) { return el('div', { class: 'st2-section' }, el('div', { class: 'st2-section-title' }, name), ...kids); }
    function chips(options, isOn, pick) {
      const row = el('div', { class: 'st2-chips' });
      const paint = () => [...row.children].forEach((b, i) => b.classList.toggle('is-on', isOn(i)));
      options.forEach((o, i) => row.append(el('button', { class: 'st2-chip', type: 'button', onclick: () => { pick(i); paint(); } }, o)));
      paint();
      return row;
    }
    function render() {
      ch = S.project.channels.find((c) => c.id === id) || ch;
      root.replaceChildren();
      title();
      const p = ch.params;
      // the channel itself
      root.append(section('Channel', el('div', { class: 'st2-knobs' },
        k({ label: 'Volume', value: ch.vol, def: 0.78, onChange: (v) => { ch.vol = v; S.engine?.syncChannels(); changed(); } }).el,
        k({ label: 'Pan', value: ch.pan, min: -1, max: 1, def: 0, origin: 0, fmt: (v) => (Math.abs(v) < 0.02 ? 'Centred' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'L' : 'R'}`), onChange: (v) => { ch.pan = v; S.engine?.syncChannels(); changed(); } }).el,
        k({ label: 'Pitch', value: p.tune || 0, min: -24, max: 24, def: 0, origin: 0, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`, onChange: (v) => { p.tune = Math.round(v); changed(); } }).el,
        el('p', { class: 'st2-note' }, `Goes to ${ch.insert ? S.project.mixer.inserts[ch.insert].name : 'the master'} in the mixer.`))));
      if (ch.plugin === 'drum') drum(p);
      else if (ch.plugin === 'synth') synth(p);
      else if (ch.plugin === 'sampler') sampler(p);
      else slicer(p);
      root.append(keyboard());
    }

    function drum(p) {
      root.append(section('Drum', chips(DRUMS.map((d) => d.name), (i) => DRUMS[i].id === p.sound, (i) => {
        const was = DRUMS.find((d) => d.id === p.sound)?.name;
        p.sound = DRUMS[i].id;
        if (ch.name === was) { ch.name = DRUMS[i].name; title(); S.changed('channels'); } else changed(false);
        S.audition(ch);
      }), el('div', { class: 'st2-knobs' },
        k({ label: 'Decay', value: p.decay ?? 1, min: 0.2, max: 3, def: 1, fmt: (v) => `${v.toFixed(2)}×`, onChange: (v) => { p.decay = v; changed(); } }).el,
        k({ label: 'Tone', value: p.tone ?? 0.5, def: 0.5, fmt: (v) => (v < 0.45 ? 'Darker' : v > 0.55 ? 'Brighter' : 'Even'), onChange: (v) => { p.tone = v; changed(); } }).el)));
    }

    function synth(p) {
      const pre = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'Start from a preset' }, SYNTH_PRESETS.find((x) => x.id === p.preset)?.name || 'Preset');
      pre.addEventListener('click', () => kit.menu(pre, SYNTH_PRESETS.map((x) => ({ label: x.name, checked: x.id === p.preset, fn: () => {
        const was = SYNTH_PRESETS.find((y) => y.id === p.preset)?.name;
        ch.params = { ...presetParams(x.id), tune: p.tune || 0 };
        if (ch.name === was) ch.name = x.name;
        S.changed('channels');
        render();
        S.audition(ch);
      } }))));
      root.append(el('div', { class: 'st2-tools', style: 'background:none;border:0;padding:0' }, el('span', { class: 'st2-label' }, 'Preset'), pre));
      const oscs = [];
      for (let i = 0; i < 3; i++) {
        const o = p.osc[i] || (p.osc[i] = { wave: 'sine', coarse: 0, fine: 0, level: 0 });
        const waves = el('div', { class: 'st2-waves' });
        const paintW = () => [...waves.children].forEach((b, j) => b.classList.toggle('is-on', WAVES[j] === o.wave));
        WAVES.forEach((w) => waves.append(el('button', { class: 'st2-wave', type: 'button', 'data-hint': `Oscillator ${i + 1}: ${w === 'sawtooth' ? 'saw' : w}`, onclick: () => { o.wave = w; paintW(); changed(); S.audition(ch); } }, waveIcon(w))));
        paintW();
        oscs.push(el('div', { class: 'st2-osc' }, el('span', { class: 'st2-osc-n' }, String(i + 1)), waves,
          k({ label: 'Coarse', value: o.coarse || 0, min: -24, max: 24, def: 0, origin: 0, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`, onChange: (v) => { o.coarse = Math.round(v); changed(); } }).el,
          k({ label: 'Fine', value: o.fine || 0, min: -100, max: 100, def: 0, origin: 0, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`, onChange: (v) => { o.fine = Math.round(v); changed(); } }).el,
          k({ label: 'Level', value: o.level ?? 0, def: i ? 0 : 1, onChange: (v) => { o.level = v; changed(); } }).el));
      }
      root.append(section('Oscillators', ...oscs));
      root.append(section('Filter', el('div', { class: 'st2-knobs' },
        k({ label: 'Cutoff', value: p.cutoff, min: 40, max: 18000, def: 2400, curve: 3, fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`), onChange: (v) => { p.cutoff = v; changed(); } }).el,
        k({ label: 'Reso', value: p.reso, min: 0.3, max: 15, def: 1, curve: 2, fmt: (v) => v.toFixed(1), onChange: (v) => { p.reso = v; changed(); } }).el,
        k({ label: 'Env amount', value: p.env || 0, min: 0, max: 9000, def: 0, curve: 2, fmt: (v) => `${Math.round(v)} Hz`, onChange: (v) => { p.env = v; changed(); } }).el,
        k({ label: 'Env decay', value: p.envDecay || 0.2, min: 0.02, max: 2, def: 0.2, curve: 2, fmt: (v) => `${Math.round(v * 1000)} ms`, onChange: (v) => { p.envDecay = v; changed(); } }).el)));
      root.append(section('Envelope', el('div', { class: 'st2-knobs' },
        k({ label: 'Attack', value: p.a, min: 0.001, max: 2, def: 0.004, curve: 3, fmt: (v) => `${Math.round(v * 1000)} ms`, onChange: (v) => { p.a = v; changed(); } }).el,
        k({ label: 'Decay', value: p.d, min: 0.02, max: 4, def: 0.3, curve: 2, fmt: (v) => `${Math.round(v * 1000)} ms`, onChange: (v) => { p.d = v; changed(); } }).el,
        k({ label: 'Sustain', value: p.s, def: 0.7, onChange: (v) => { p.s = v; changed(); } }).el,
        k({ label: 'Release', value: p.r, min: 0.01, max: 4, def: 0.2, curve: 2, fmt: (v) => `${Math.round(v * 1000)} ms`, onChange: (v) => { p.r = v; changed(); } }).el)));
      const monoChip = chips(['Poly', 'Mono'], (i) => (i === 1) === !!p.mono, (i) => { p.mono = i === 1; changed(false); });
      root.append(section('Voice', monoChip, el('div', { class: 'st2-knobs' },
        k({ label: 'Glide', value: p.glide || 0, min: 0, max: 0.4, def: 0.05, fmt: (v) => `${Math.round(v * 1000)} ms`, onChange: (v) => { p.glide = v; changed(); } }).el,
        k({ label: 'Unison', value: p.unison || 1, min: 1, max: 7, def: 1, fmt: (v) => `${Math.round(v)} voice${Math.round(v) > 1 ? 's' : ''}`, onChange: (v) => { p.unison = Math.round(v); changed(); } }).el,
        k({ label: 'Spread', value: p.spread || 0, min: 0, max: 50, def: 20, fmt: (v) => `${Math.round(v)} ct`, onChange: (v) => { p.spread = v; changed(); } }).el,
        k({ label: 'Drive', value: p.drive || 0, def: 0, onChange: (v) => { p.drive = v; changed(); } }).el)));
    }

    function sampler(p) {
      const canvas = el('canvas');
      const box = el('div', { class: 'st2-wavebox', 'data-hint': 'Drop an audio file here' }, canvas);
      wave = () => drawWave(canvas, ch.sample?.buffer, null);
      const file = el('input', { type: 'file', accept: 'audio/*', hidden: true });
      file.addEventListener('change', () => { if (file.files[0]) S.loadInto(ch, file.files[0]).then(render); file.value = ''; });
      box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('is-drop'); });
      box.addEventListener('dragleave', () => box.classList.remove('is-drop'));
      box.addEventListener('drop', (e) => {
        box.classList.remove('is-drop');
        const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aiff?)$/i.test(x.name));
        if (f) { e.preventDefault(); e.stopPropagation(); S.loadInto(ch, f).then(render); }
      });
      const rootSel = el('button', { class: 'st2-select', type: 'button', 'data-hint': 'The note the sample sounds as recorded' }, `Root ${noteName(p.root ?? ROOT)}`);
      rootSel.addEventListener('click', () => kit.menu(rootSel, Array.from({ length: 49 }, (_, i) => 36 + i).map((n) => ({ label: noteName(n), checked: n === (p.root ?? ROOT), fn: () => { p.root = n; changed(false); render(); } }))));
      root.append(section('Sample', box,
        el('div', { class: 'st2-tools', style: 'background:none;border:0;padding:0' },
          el('button', { class: 'st2-btn', type: 'button', onclick: () => file.click() }, ch.sample ? 'Change…' : 'Load…'), file,
          el('span', { class: 'st2-label' }, ch.sample ? ch.sample.name : p.sampleName ? `${p.sampleName} (drop it in again: sounds are not kept)` : 'No sound yet'), el('span', { class: 'st2-grow' }), rootSel),
        chips(['Forward', 'Reverse'], (i) => (i === 1) === !!p.reverse, (i) => { p.reverse = i === 1; changed(false); S.audition(ch); }),
        el('div', { class: 'st2-knobs' },
          k({ label: 'Attack', value: p.attack ?? 0.002, min: 0.001, max: 0.5, def: 0.002, curve: 3, fmt: (v) => `${Math.round(v * 1000)} ms`, onChange: (v) => { p.attack = v; changed(); } }).el,
          k({ label: 'Release', value: p.release ?? 0.02, min: 0.005, max: 1, def: 0.02, curve: 3, fmt: (v) => `${Math.round(v * 1000)} ms`, onChange: (v) => { p.release = v; changed(); } }).el)));
      requestAnimationFrame(() => wave?.());
    }

    function slicer(p) {
      const canvas = el('canvas');
      const box = el('div', { class: 'st2-wavebox' }, canvas);
      wave = () => { const sl = S.engine?.slices(ch); drawWave(canvas, sl?.buffer, sl?.cuts.length); };
      const sl = S.engine?.slices(ch);
      root.append(section('Slices of the song', box,
        el('div', { class: 'st2-tools', style: 'background:none;border:0;padding:0' },
          el('button', { class: 'st2-btn is-on', type: 'button', 'data-hint': 'Take the last bars of the song that is playing', onclick: () => S.grab(ch) }, sl ? 'Grab again' : 'Grab from the song'),
          el('span', { class: 'st2-label' }, 'Bars'), chips(['1', '2', '4'], (i) => [1, 2, 4][i] === p.bars, (i) => { p.bars = [1, 2, 4][i]; changed(false); }),
          el('span', { class: 'st2-label' }, 'Slices'), chips(['8', '16', '32'], (i) => [8, 16, 32][i] === p.slices, (i) => { p.slices = [8, 16, 32][i]; const s = S.engine?.slices(ch); if (s) S.engine.setSlices(ch, s.buffer, p.slices); changed(false); render(); })),
        chips(['Forward', 'Reverse'], (i) => (i === 1) === !!p.reverse, (i) => { p.reverse = i === 1; changed(false); }),
        el('p', { class: 'st2-note' }, sl ? 'Each slice is a note in the piano roll (Slice 1 is C5), and step n plays slice n.' : 'Play the song, then Grab: its last bars are cut into slices, laid out in order on this pattern.')));
      requestAnimationFrame(() => wave?.());
    }

    // a little keyboard to try the instrument out, two octaves from C4
    function keyboard() {
      const canvas = el('canvas');
      const box = el('div', { class: 'st2-keys', 'data-hint': 'Play it' }, canvas);
      const lo = ch.plugin === 'slicer' ? ROOT : 48, n = 25;
      const whites = [];
      for (let m = lo; m < lo + n; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
      let down = null;
      const draw = () => {
        const w = box.clientWidth, h = box.clientHeight;
        if (!w) return;
        canvas.width = w; canvas.height = h;
        const g = canvas.getContext('2d');
        const ww = w / whites.length;
        whites.forEach((m, i) => { g.fillStyle = down === m ? '#f39b3f' : '#e2e7ea'; g.fillRect(i * ww + 0.5, 0, ww - 1, h); if (m % 12 === 0) { g.fillStyle = '#56616a'; g.font = '700 8px Saira, Arial'; g.fillText(noteName(m), i * ww + 3, h - 4); } });
        whites.forEach((m, i) => { const b = m + 1; if ([1, 3, 6, 8, 10].includes(b % 12) && b < lo + n) { g.fillStyle = down === b ? '#f39b3f' : '#1c2023'; g.fillRect((i + 1) * ww - ww * 0.3, 0, ww * 0.6, h * 0.6); } });
      };
      const at = (e) => {
        const r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, ww = r.width / whites.length;
        const i = Math.floor(x / ww), white = whites[Math.max(0, Math.min(whites.length - 1, i))];
        if (y < r.height * 0.6) {
          const left = i * ww, f = (x - left) / ww;
          if (f > 0.7 && [1, 3, 6, 8, 10].includes((white + 1) % 12)) return white + 1;
          if (f < 0.3 && [1, 3, 6, 8, 10].includes((white - 1) % 12)) return white - 1;
        }
        return white;
      };
      box.addEventListener('pointerdown', (e) => { e.preventDefault(); S.host.capture(box, e); down = at(e); S.wake()?.noteOn(ch, down, 0.85); draw(); });
      box.addEventListener('pointermove', (e) => { if (down === null) return; const m = at(e); if (m !== down) { S.engine?.noteOff(ch, down); down = m; S.engine?.noteOn(ch, m, 0.85); draw(); } });
      const up = () => { if (down === null) return; S.engine?.noteOff(ch, down); down = null; draw(); };
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
      box.addEventListener('lostpointercapture', up);
      requestAnimationFrame(draw);
      return box;
    }
    render();
    return { render, resize() { wave?.(); } };
  };
}

function drawWave(canvas, buffer, cuts) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (!buffer) {
    g.fillStyle = '#56616a';
    g.font = '600 11px Saira, Arial';
    g.textAlign = 'center';
    g.fillText('No sound yet', w / 2, h / 2 + 4);
    return;
  }
  const d = buffer.getChannelData(0), per = Math.max(1, Math.floor(d.length / w));
  g.fillStyle = '#f39b3f';
  for (let x = 0; x < w; x++) {
    let m = 0;
    for (let i = x * per, e = Math.min(d.length, (x + 1) * per); i < e; i += 4) m = Math.max(m, Math.abs(d[i]));
    const a = Math.min(1, m * 1.4) * (h / 2 - 2);
    g.fillRect(x, h / 2 - a, 1, a * 2);
  }
  if (cuts) {
    g.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 1; i < cuts; i++) g.fillRect(Math.round((i / cuts) * w), 0, 1, h);
  }
}

// an effect's window: a knob for every setting, a row of buttons for a choice
export function fxWindow(S, kit, insertIndex, fxId) {
  return (body) => {
    const { el } = S;
    const root = el('div', { class: 'st2-plugin' });
    body.append(root);
    // found again by its id, here and in every change: after an undo the effect is a fresh copy
    const find = () => S.project.mixer.inserts[insertIndex]?.fx.find((f) => f?.id === fxId);
    const edit = (fn) => { const cur = find(); if (cur) fn(cur); };
    function render() {
      const f = find();
      root.replaceChildren();
      if (!f) { root.append(el('p', { class: 'st2-note' }, 'This effect has been taken out.')); return; }
      const def = fxDef(f.type);
      S.windows.title(`fx:${fxId}`, `${def.name} · ${insertIndex ? `Insert ${insertIndex}` : 'Master'}`);
      const knobs = el('div', { class: 'st2-knobs' });
      const rows = [];
      for (const prm of def.params) {
        if (prm.options) {
          const row = el('div', { class: 'st2-chips' });
          const paint = () => [...row.children].forEach((b, i) => b.classList.toggle('is-on', i === ((find() || f).params[prm.id] | 0)));
          prm.options.forEach((o, i) => row.append(el('button', { class: 'st2-chip', type: 'button', onclick: () => { edit((cur) => { cur.params[prm.id] = i; }); paint(); S.engine?.chain(insertIndex); S.changed('fx', true); } }, o)));
          paint();
          rows.push(el('div', { class: 'st2-tools', style: 'background:none;border:0;padding:0' }, el('span', { class: 'st2-label' }, prm.label), row));
        } else {
          knobs.append(kit.knob({ label: prm.label, value: f.params[prm.id] ?? prm.def, min: prm.min, max: prm.max, def: prm.def, curve: prm.curve, origin: prm.origin, fmt: prm.fmt, show: true, big: true,
            onChange: (v) => { edit((cur) => { cur.params[prm.id] = v; }); S.engine?.chain(insertIndex); S.changed('fx', true); } }).el);
        }
      }
      const onBtn = el('button', { class: `st2-btn ${f.on ? 'is-on' : ''}`, type: 'button', onclick: () => { edit((cur) => { cur.on = !cur.on; }); S.engine?.chain(insertIndex); S.changed('fx'); render(); S.views?.mixer?.render?.(); } }, el('span', { class: 'led' }), f.on ? 'On' : 'Off');
      root.append(el('div', { class: 'st2-section' }, el('div', { class: 'st2-section-title' }, def.name), ...rows, knobs), el('div', { class: 'st2-tools', style: 'background:none;border:0;padding:0' }, onBtn));
    }
    render();
    return { render };
  };
}
