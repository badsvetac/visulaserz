// LOOPER: record what you play, then play over it. REC waits for the next bar and records 1, 2 or 4
// bars of what the tools are playing (your drum pads, theremin, chops, chords) or, with SOURCE on
// Mix, of everything you hear; then it loops it in time with the track while you add the next
// layer with OVERDUB. UNDO takes the last layer away, SOLO takes the track out from under the loop.
//
// Every layer is its own buffer, made on the main thread and handed to the audio thread, so nothing
// big is ever allocated or copied where the sound is made, and undo is simply dropping the last one.
// The loop keeps the bar it was recorded on as its downbeat, so it stays in time with the music.
//
// Keys, once it has been clicked: Space = REC, then OVERDUB on and off · S = stop / play · Z = undo · X = clear

const BARS = [1, 2, 4];
const MAX_LAYERS = 8;

const LOOPER_SOURCE = `
class VzLooper extends AudioWorkletProcessor {
  constructor() {
    super();
    this.layers = [];          // [[L, R], ...], all the same length
    this.dub = null;           // the layer being overdubbed into
    this.state = 'empty';      // empty | armed | recording | playing | stopped
    this.S = 0; this.L = 1;    // the loop's first frame (a bar line) and its length
    this.level = 0; this.levelTo = 1;
    this.alive = true;
    this.port.onmessage = (e) => this.command(e.data);
  }
  command(m) {
    if (m.type === 'record') {
      this.S = Math.round(m.at * sampleRate);
      this.L = m.L.length;
      this.layers = [[m.L, m.R]];
      this.dub = null;
      this.state = 'armed';
      this.levelTo = 1;
    } else if (m.type === 'dub') {
      if (m.on && (this.state === 'playing' || this.state === 'stopped') && this.layers.length < ${MAX_LAYERS}) {
        this.dub = [m.L, m.R];
        this.layers.push(this.dub);
        if (this.state === 'stopped') { this.state = 'playing'; this.levelTo = 1; }
      } else this.dub = null;
      this.report();
    } else if (m.type === 'play') { if (this.layers.length) { this.state = 'playing'; this.levelTo = 1; } this.report(); }
    else if (m.type === 'stop') { if (this.state === 'playing') { this.levelTo = 0; this.dub = null; this.state = 'stopped'; } this.report(); }
    else if (m.type === 'undo') { if (this.layers.length > 1) { const gone = this.layers.pop(); if (gone === this.dub) this.dub = null; } this.report(); }
    else if (m.type === 'clear') { this.layers = []; this.dub = null; this.state = 'empty'; this.report(); }
    else if (m.type === 'end') this.alive = false;
  }
  report() { this.port.postMessage({ type: 'state', state: this.state, layers: this.layers.length, dub: !!this.dub, S: this.S, L: this.L }); }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const oL = out[0], oR = out[1] || out[0];
    const iL = inp[0], iR = inp[1] || inp[0];
    const n = oL.length, f0 = currentFrame;
    const step = 1 / Math.max(1, Math.round(0.006 * sampleRate));
    for (let k = 0; k < n; k++) {
      const f = f0 + k;
      let l = 0, r = 0;
      if (this.state === 'armed' && f >= this.S) this.state = 'recording';
      if (this.state === 'recording') {
        const p = f - this.S;
        if (p >= this.L) { this.state = 'playing'; this.report(); }
        else { const z = this.layers[0]; z[0][p] = iL ? iL[k] : 0; z[1][p] = iR ? iR[k] : 0; }
      }
      if (this.state === 'playing' || this.state === 'stopped') {
        const p = (((f - this.S) % this.L) + this.L) % this.L;
        for (const z of this.layers) { l += z[0][p]; r += z[1][p]; }   // read before the overdub writes
        if (this.dub) { this.dub[0][p] += iL ? iL[k] : 0; this.dub[1][p] += iR ? iR[k] : 0; }
      }
      if (this.level < this.levelTo) this.level = Math.min(this.levelTo, this.level + step);
      else if (this.level > this.levelTo) this.level = Math.max(this.levelTo, this.level - step);
      oL[k] = l * this.level;
      if (oR !== oL) oR[k] = r * this.level;
    }
    return this.alive;
  }
}
registerProcessor('vz-looper', VzLooper);
`;

export default {
  id: 'looper',
  name: 'Looper',
  group: 'Rhythm',
  blurb: 'Record a few bars of what you play (or of the whole mix) and it loops in time while you layer more on top. Overdub, undo, and solo the loop over silence',
  tags: ['loop', 'looper', 'overdub', 'layers', 'record', 'jam'],
  size: { w: 340, h: 250 },

  create(host, mount) {
    const { el } = host;
    let bars = Math.min(BARS.length - 1, host.store.get('bars', 1) | 0);
    let source = host.store.get('source', 0) | 0;              // 0 the tools, 1 the whole mix
    let level = host.store.get('level', 0.9);
    let node = null, ctx = null, fromTools = null, fromMix = null, outGain = null;
    let state = { state: 'empty', layers: 0, dub: false, S: 0, L: 1 };
    let solo = false, destroyed = false, lastLoop = -1;

    const rec = host.ui.pad({ label: 'Rec', key: ' ', keyLabel: 'Space', cls: 'pad-accent', hint: 'Record from the next bar; once it loops, Space switches overdub on and off', start: () => recOrDub() });
    const play = host.ui.pad({ label: 'Stop', key: 's', keyLabel: 'S', hint: 'Stop or play the loop', start: () => playStop() });
    const undo = host.ui.pad({ label: 'Undo', key: 'z', keyLabel: 'Z', hint: 'Take the last layer away', start: () => send({ type: 'undo' }) });
    const clear = host.ui.pad({ label: 'Clear', key: 'x', keyLabel: 'X', hint: 'Forget the loop', start: () => { send({ type: 'clear' }); setSolo(false); } });
    const barsCycle = host.ui.cycle({ label: 'Length', options: BARS.map((b) => `${b} bar${b > 1 ? 's' : ''}`), index: bars, onChange: (i) => { bars = i; host.store.set('bars', i); } });
    const sourceCycle = host.ui.cycle({ label: 'Source', options: ['Tools', 'Mix'], index: source, title: 'Tools: only what the tools play. Mix: everything you hear', onChange: (i) => { source = i; host.store.set('source', i); route(); } });
    const soloSw = host.ui.toggle({ label: 'Solo', title: 'Take the track out from under the loop', onChange: (v) => setSolo(v) });
    const levelKnob = host.ui.knob({ label: 'Level', value: level, def: 0.9, onChange: (v) => { level = v; host.store.set('level', v); if (outGain) outGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); } });
    const fill = el('i');
    const status = el('span', { class: 'tool-readout' }, 'Empty: press Rec');
    mount.append(
      el('div', { class: 'looper-pads' }, rec.node, play.node, undo.node, clear.node),
      el('div', { class: 'roll-meter looper-meter', title: 'Where the loop is' }, fill),
      el('div', { class: 'tool-row' }, barsCycle.el, sourceCycle.el, soloSw.el, el('div', { class: 'tool-row-end' }, levelKnob.el)),
      status,
    );

    // The looper is an effect slot that passes the mix through untouched and adds the loop to it;
    // what it records comes in on its own input: the tools' bus, or the mix entering the slot.
    host.audio.whenReady(async (c) => {
      try { await host.audio.worklet('vz-looper', LOOPER_SOURCE); } catch { status.textContent = 'This browser cannot run the looper'; return; }
      if (node || destroyed) return;
      ctx = c;
      node = new AudioWorkletNode(ctx, 'vz-looper', { outputChannelCount: [2] });
      node.port.onmessage = (e) => { if (e.data.type === 'state') { state = e.data; paint(); } };
      const input = ctx.createGain(), output = ctx.createGain();
      input.connect(output);
      fromTools = ctx.createGain();
      fromMix = ctx.createGain();
      host.audio.instruments.connect(fromTools).connect(node);
      input.connect(fromMix).connect(node);
      outGain = ctx.createGain();
      outGain.gain.value = level;
      node.connect(outGain).connect(output);
      route();
      host.audio.insert({ input, output });
      host.onDispose(() => { try { host.audio.instruments?.disconnect(fromTools); } catch { /* gone */ } });
      host.audio.own(input, output, fromTools, fromMix, node, outGain);      // let go of when the panel closes
    });
    const send = (m, transfer) => node?.port.postMessage(m, transfer || []);
    function route() {
      if (!fromTools) return;
      const t = ctx.currentTime;
      fromTools.gain.setTargetAtTime(source === 0 ? 1 : 0, t, 0.01);
      fromMix.gain.setTargetAtTime(source === 1 ? 1 : 0, t, 0.01);
    }
    function setSolo(v) {
      solo = v;
      soloSw.set(v, true);
      host.audio.muteMusic(v ? 0 : 1);
    }
    const layer = () => { const L = new Float32Array(state.L), R = new Float32Array(state.L); return { L, R }; };

    function recOrDub() {
      if (!node) { host.audio.ensure(); return; }
      if (state.state === 'armed' || state.state === 'recording') {
        send({ type: 'clear' });                                   // a second press while it waits or records cancels it
        state = { ...state, state: 'empty', layers: 0, dub: false };
        host.lcd('looper', 'CANCELLED');
      } else if (state.state === 'empty') {
        // a fresh loop starts on the next bar line of the beat clock
        const len = BARS[bars] * 4 * host.clock.period;
        const at = host.clock.next(4, ctx.currentTime + 0.02);
        const frames = Math.round(len * ctx.sampleRate);
        const L = new Float32Array(frames), R = new Float32Array(frames);
        send({ type: 'record', at, L, R }, [L.buffer, R.buffer]);
        state = { state: 'armed', layers: 1, dub: false, S: Math.round(at * ctx.sampleRate), L: frames };
        host.lcd('looper', `REC ${BARS[bars]} BAR${BARS[bars] > 1 ? 'S' : ''}`);
      } else if (state.dub) {
        send({ type: 'dub', on: false });
      } else if (state.layers >= MAX_LAYERS) {
        host.toast(`The loop has ${MAX_LAYERS} layers already: undo one to add another.`);
      } else {
        const { L, R } = layer();
        send({ type: 'dub', on: true, L, R }, [L.buffer, R.buffer]);
      }
      paint();
    }
    function playStop() {
      if (state.state === 'playing') send({ type: 'stop' });
      else if (state.state === 'stopped') send({ type: 'play' });
    }

    function paint() {
      const s = state.state;
      rec.node.querySelector('.pad-label').textContent = s === 'playing' || s === 'stopped' ? (state.dub ? 'Dub off' : 'Overdub') : 'Rec';
      rec.node.classList.toggle('is-armed', s === 'armed');
      rec.node.classList.toggle('is-recording', s === 'recording' || state.dub);
      play.node.querySelector('.pad-label').textContent = s === 'stopped' ? 'Play' : 'Stop';
      status.textContent = {
        empty: 'Empty: press Rec',
        armed: 'Waiting for the next bar…',
        recording: `Recording ${BARS[bars]} bar${BARS[bars] > 1 ? 's' : ''}…`,
        playing: `${state.dub ? 'Overdubbing' : 'Playing'} · ${state.layers} layer${state.layers === 1 ? '' : 's'}`,
        stopped: `Stopped · ${state.layers} layer${state.layers === 1 ? '' : 's'}`,
      }[s];
      host.setActive(s === 'recording' || s === 'playing');
    }

    return {
      tick() {
        if (!ctx || state.state === 'empty') { fill.style.width = '0%'; return; }
        const f = ctx.currentTime * ctx.sampleRate;
        const p = state.state === 'armed' ? 0 : ((((f - state.S) % state.L) + state.L) % state.L) / state.L;
        fill.style.width = `${(p * 100).toFixed(1)}%`;
        const loop = Math.floor((f - state.S) / state.L);
        if (state.state === 'playing' && loop !== lastLoop) { lastLoop = loop; host.visual.hit(0.3); }   // the loop's downbeat on the picture
        if (state.state === 'armed' || state.state === 'recording') paint();
      },
      keydown(e) {
        const p = [rec, play, undo, clear].find((x) => x.key === e.key.toLowerCase());
        if (!p) return false;
        if (!e.repeat) p.press();
        return true;
      },
      keyup(e) { [rec, play, undo, clear].find((x) => x.key === e.key.toLowerCase())?.release(); },
      // the panic key stops an overdub and the solo, but keeps the loop itself
      release() { [rec, play, undo, clear].forEach((p) => p.reset()); if (state.dub) send({ type: 'dub', on: false }); if (solo) setSolo(false); },
      destroy() { destroyed = true; send({ type: 'end' }); node = null; },
    };
  },
};
