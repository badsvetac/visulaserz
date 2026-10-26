import { TAPE_SOURCE } from './lib/tape.js';

// BEAT ROLL: hold a pad and the slice of music since the last beat (or half, quarter… down to a
// 32nd) repeats in time, quantised to the beat grid, the way a DJ's loop roll does. Holding a
// second pad changes the length without letting go; release everything and the track comes back
// exactly where it would have been by now, because the tape kept recording underneath (slip).
// REV plays the music backwards from the moment you press it. FILTER closes a low-pass over the
// repeats, so a roll builds into the drop instead of just stuttering.

const DIVS = [[1, '1', '1'], [0.5, '1/2', '2'], [0.25, '1/4', '3'], [0.125, '1/8', '4'], [1 / 16, '1/16', '5'], [1 / 32, '1/32', '6']];

export default {
  id: 'roll',
  name: 'Beat Roll',
  group: 'Rhythm',
  blurb: 'Hold a pad and the last beat, half, quarter or 32nd repeats in time; let go and the track is back where it would have been. With a reverse and a filter roll',
  tags: ['roll', 'stutter', 'repeat', 'reverse', 'slip', 'loop'],
  size: { w: 410, h: 196 },

  create(host, mount) {
    const { el } = host;
    let tape = null, filter = null, ctx = null;
    let destroyed = false;
    let held = [];                 // the pads being held, the last one wins
    let rolling = null;            // { at, len } while a slice repeats, 'rev' while reversed
    let filterOn = host.store.get('filter', false);

    const pads = DIVS.map(([beats, label, key]) => host.ui.pad({
      label, key, keyLabel: key, hint: `Hold: repeat the last ${label === '1' ? 'beat' : `${label} of a beat`}`,
      start: () => press(beats), stop: () => lift(beats),
    }));
    const rev = host.ui.pad({ label: 'Reverse', key: 'r', keyLabel: 'R', cls: 'pad-rev', hint: 'Hold: the music plays backwards from here', start: () => press('rev'), stop: () => lift('rev') });
    const meter = el('i');
    const filterSw = host.ui.toggle({ label: 'Filter', on: filterOn, title: 'Close a low-pass over the repeats as the roll goes on', onChange: (v) => { filterOn = v; host.store.set('filter', v); } });
    const status = el('span', { class: 'tool-readout' }, 'Hold a pad');
    mount.append(
      el('div', { class: 'roll-pads' }, pads.map((p) => p.node), rev.node),
      el('div', { class: 'roll-meter', title: 'Where the repeating slice is' }, meter),
      el('div', { class: 'tool-row' }, status, el('div', { class: 'tool-row-end' }, filterSw.el)),
    );

    // The tape only goes into the chain once its processor has loaded: until then the tool is
    // not in the music at all, which is the most transparent it can be.
    host.audio.whenReady(async (c) => {
      try {
        await host.audio.worklet('vz-tape', TAPE_SOURCE);
      } catch (e) {
        status.textContent = 'This browser cannot run the roll';
        return;
      }
      if (tape || destroyed) return;
      ctx = c;
      tape = new AudioWorkletNode(ctx, 'vz-tape', { outputChannelCount: [2], processorOptions: { seconds: 6 } });
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = ctx.sampleRate * 0.45;
      filter.Q.value = 2;
      tape.connect(filter);
      host.audio.insert({ input: tape, output: filter });
      host.audio.own(tape, filter);                             // let go of when the panel closes
    });

    function press(div) {
      if (!tape) { host.audio.ensure(); return; }
      held = held.filter((d) => d !== div);
      held.push(div);
      apply();
    }
    function lift(div) {
      held = held.filter((d) => d !== div);
      apply();
    }
    function apply() {
      if (!tape) return;
      const div = held[held.length - 1];
      const t = ctx.currentTime;
      if (div === undefined) {
        if (rolling) {
          tape.port.postMessage({ type: 'live' });
          filter.frequency.cancelScheduledValues(t);
          filter.frequency.setTargetAtTime(ctx.sampleRate * 0.45, t, 0.01);
          rolling = null;
          host.setActive(false);
          status.textContent = 'Hold a pad';
        }
        return;
      }
      if (div === 'rev') {
        tape.port.postMessage({ type: 'reverse', at: t });
        rolling = 'rev';
        status.textContent = 'Reverse';
      } else {
        // the slice starts on the last grid point of its own length that has gone by
        const len = div * host.clock.period;
        const at = host.clock.last(div, t);
        tape.port.postMessage({ type: 'loop', at, len });
        const first = !rolling;
        rolling = { at, len };
        status.textContent = `Roll ${DIVS.find((d) => d[0] === div)[1]} · ${Math.round(host.clock.bpm)} BPM`;
        if (filterOn && first) {
          filter.frequency.cancelScheduledValues(t);
          filter.frequency.setValueAtTime(Math.min(16000, ctx.sampleRate * 0.45), t);
          filter.frequency.exponentialRampToValueAtTime(420, t + 4 * host.clock.period);
        }
      }
      host.setActive(true);
      host.lcd('roll', rolling === 'rev' ? 'REVERSE' : DIVS.find((d) => d[0] === div)[1]);
    }

    let lastP = -1;
    return {
      tick() {
        if (rolling === 'rev') { meter.style.width = '100%'; host.visual.bend({ spin: -3, hue: -0.04 }); return; }   // the trails swirl backwards
        if (!rolling || !ctx) { meter.style.width = '0%'; lastP = -1; return; }
        const p = ((((ctx.currentTime - rolling.at) % rolling.len) + rolling.len) % rolling.len) / rolling.len;
        if (p < lastP) host.visual.hit(0.5);              // each repeat comes round on the picture as well
        lastP = p;
        meter.style.width = `${(p * 100).toFixed(1)}%`;
      },
      keydown(e) {
        const p = [...pads, rev].find((x) => x.key === e.key.toLowerCase());
        if (!p) return false;
        if (!e.repeat) p.press();
        return true;
      },
      keyup(e) { [...pads, rev].find((x) => x.key === e.key.toLowerCase())?.release(); },
      release() { [...pads, rev].forEach((p) => p.reset()); held = []; apply(); },
      destroy() { destroyed = true; tape?.port.postMessage({ type: 'end' }); tape = null; },
    };
  },
};
