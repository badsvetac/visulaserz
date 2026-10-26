// VOCAL CUT: takes the singer out of the song, or leaves only the singer. A lead vocal is nearly
// always mixed dead centre, the same in both speakers, while much of the band is spread wide: so
// what the two channels share (the mid) carries the voice, and what differs between them (the
// side) carries almost none of it. NO VOCALS takes the voice's range out of the mid but keeps the
// mid's bass and air, so the kick, the bass line and the hats stay; VOCALS ONLY keeps that range
// of the mid and nothing else. AMOUNT goes from untouched to all the way, BAND says how wide the
// voice's range is taken. It works best on studio mixes: a live recording, or a mono record, has
// its voice everywhere and keeps it. The scope shows the stereo field: the voice is the upright
// stroke in the middle, and it goes when the vocals do (it shows the voice's range only).
// It works on the track alone: your drum pads, the siren and the microphone go past it untouched.
//
// Keys, once it has been clicked: 1 Off, 2 No vocals, 3 Vocals only.

const MODES = ['Off', 'No vocals', 'Vocals only'];
const BANDS = [['Voice', 180, 5500], ['Wide', 120, 8500], ['Narrow', 280, 3600]];

export default {
  id: 'vocalcut',
  name: 'Vocal Cut',
  group: 'FX',
  blurb: 'Take the singer out of the song for a karaoke or an instrumental, or keep only the voice for an a cappella moment. Works on any studio mix, live',
  tags: ['karaoke', 'vocals', 'acapella', 'instrumental', 'mid side', 'stereo'],
  size: { w: 390, h: 250 },
  resizable: { minW: 320, minH: 220, maxW: 800, maxH: 520 },

  create(host, mount) {
    const { el } = host;
    let mode = 0;                   // always starts off: a tool that silently ate the vocals would be a trap
    let amount = host.store.get('amount', 1);
    let band = Math.min(BANDS.length - 1, host.store.get('band', 0) | 0);
    let fx = null, destroyed = false;
    let scale = 2;                  // the scope's zoom, following the level

    const keys = MODES.map((m, i) => el('button', { class: 'tool-key', type: 'button', title: `${m} (key ${i + 1})`, onclick: () => setMode(i) }, m, el('kbd', {}, String(i + 1))));
    const amountKnob = host.ui.knob({ label: 'Amount', value: amount, def: 1, onChange: (v) => { amount = v; host.store.set('amount', v); apply(); } });
    const bandCycle = host.ui.cycle({ label: 'Band', options: BANDS.map((b) => b[0]), index: band, title: 'How wide a range is taken as the voice', onChange: (i) => { band = i; host.store.set('band', i); tune(); } });
    const canvas = el('canvas');
    const scope = el('div', { class: 'tool-surface vocal-scope', title: 'The stereo field: up is what both speakers share (the voice lives there), across is what differs' }, canvas);
    const readout = el('span', { class: 'tool-readout' }, 'Off');
    mount.append(
      el('div', { class: 'tool-keys' }, keys),
      scope,
      el('div', { class: 'tool-row' }, readout, el('div', { class: 'tool-row-end' }, bandCycle.el, amountKnob.el)),
    );
    const g = canvas.getContext('2d');
    keys[0].classList.add('is-active');

    // ── sound ─────────────────────────────────────────────────────────────────
    // Built once, then only its gains move. Off, the mid and the side are put back together
    // exactly as they came (L = M + S, R = M − S), so the slot is transparent.
    host.audio.whenReady((ctx) => {
      if (fx || destroyed) return;
      const input = ctx.createGain();
      input.channelCount = 2;
      input.channelCountMode = 'explicit';
      input.channelInterpretation = 'speakers';
      const split = ctx.createChannelSplitter(2);
      input.connect(split);
      const mid = ctx.createGain();
      mid.gain.value = 0.5;
      split.connect(mid, 0);
      split.connect(mid, 1);
      const side = ctx.createGain();
      side.gain.value = 0.5;
      const flip = ctx.createGain();
      flip.gain.value = -1;
      split.connect(side, 0);
      split.connect(flip, 1).connect(side);

      // two Butterworth stages in a row make a Linkwitz–Riley crossover: the low and the high
      // part it keeps add back up without a hump or a hole where they meet
      const biquad = (type) => { const b = ctx.createBiquadFilter(); b.type = type; b.Q.value = Math.SQRT1_2; return b; };
      const chain = (...nodes) => { nodes.reduce((a, b) => a.connect(b)); return nodes; };
      const lows = chain(biquad('lowpass'), biquad('lowpass'));
      const highs = chain(biquad('highpass'), biquad('highpass'));
      const voice = chain(biquad('highpass'), biquad('highpass'), biquad('lowpass'), biquad('lowpass'));
      const midDirect = ctx.createGain();
      const keep = ctx.createGain();          // the mid's bass and air, for No vocals
      const only = ctx.createGain();          // the mid's voice range, for Vocals only
      const sideLevel = ctx.createGain();
      keep.gain.value = only.gain.value = 0;
      const midBus = ctx.createGain();
      mid.connect(midDirect).connect(midBus);
      mid.connect(lows[0]); lows[1].connect(keep);
      mid.connect(highs[0]); highs[1].connect(keep);
      keep.connect(midBus);
      mid.connect(voice[0]); voice[3].connect(only).connect(midBus);
      side.connect(sideLevel);
      const sideFlip = ctx.createGain();
      sideFlip.gain.value = -1;
      sideLevel.connect(sideFlip);
      const left = ctx.createGain(), right = ctx.createGain();
      midBus.connect(left); sideLevel.connect(left);
      midBus.connect(right); sideFlip.connect(right);
      const output = ctx.createChannelMerger(2);
      left.connect(output, 0, 0);
      right.connect(output, 0, 1);

      // the scope listens to what comes out, in the voice's range only: the kick and the bass stay
      // in the middle on purpose and would otherwise fill the picture
      const look = ctx.createChannelSplitter(2);
      const anL = ctx.createAnalyser(), anR = ctx.createAnalyser();
      anL.fftSize = anR.fftSize = 1024;
      const lookHp = biquad('highpass'), lookLp = biquad('lowpass');
      lookHp.frequency.value = 220;
      lookLp.frequency.value = 5000;
      output.connect(lookHp).connect(lookLp).connect(look);
      look.connect(anL, 0);
      look.connect(anR, 1);

      fx = { ctx, midDirect, keep, only, sideLevel, lows, highs, voice, anL, anR, bufL: new Float32Array(1024), bufR: new Float32Array(1024) };
      tune();
      apply(true);
      host.audio.insert({ input, output }, { music: true });   // the track only: what the tools play goes past
    });

    function tune() {
      if (!fx) return;
      const [, lo, hi] = BANDS[band];
      const t = fx.ctx.currentTime;
      for (const b of fx.lows) b.frequency.setTargetAtTime(lo, t, 0.02);
      for (const b of fx.highs) b.frequency.setTargetAtTime(hi, t, 0.02);
      fx.voice[0].frequency.setTargetAtTime(lo, t, 0.02);
      fx.voice[1].frequency.setTargetAtTime(lo, t, 0.02);
      fx.voice[2].frequency.setTargetAtTime(hi, t, 0.02);
      fx.voice[3].frequency.setTargetAtTime(hi, t, 0.02);
    }
    function apply(now = false) {
      readout.textContent = mode ? `${MODES[mode]} · ${Math.round(amount * 100)}%` : 'Off';
      host.setActive(mode > 0 && amount > 0.01);
      if (!fx) return;
      const a = mode ? amount : 0;
      const target = {
        midDirect: 1 - a,
        keep: mode === 1 ? a : 0,
        only: mode === 2 ? a : 0,
        sideLevel: mode === 2 ? 1 - a : 1,
      };
      const t = fx.ctx.currentTime;
      for (const k in target) {
        if (now) fx[k].gain.value = target[k];
        else fx[k].gain.setTargetAtTime(target[k], t, 0.03);
      }
    }
    function setMode(i) {
      if (i === mode) return;
      if (!fx) host.audio.ensure();
      mode = i;
      keys.forEach((k, j) => k.classList.toggle('is-active', j === i));
      host.lcd('vocal cut', MODES[i].toUpperCase());
      apply();
    }

    // ── the scope ─────────────────────────────────────────────────────────────
    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(6, 6, 10, 0.32)';            // what was drawn fades, so the field has a trail
      g.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.46;
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.moveTo(cx - r * 1.6, cy); g.lineTo(cx + r * 1.6, cy); g.stroke();
      if (!fx) return;
      fx.anL.getFloatTimeDomainData(fx.bufL);
      fx.anR.getFloatTimeDomainData(fx.bufR);
      let peak = 0;
      for (let i = 0; i < 1024; i++) peak = Math.max(peak, Math.abs(fx.bufL[i]) + Math.abs(fx.bufR[i]));
      scale += ((peak > 0.002 ? 0.9 / peak : scale) - scale) * 0.05;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = mode === 1 ? 'rgba(120, 226, 255, 0.5)' : mode === 2 ? 'rgba(255, 168, 76, 0.55)' : 'rgba(255, 79, 216, 0.45)';
      for (let i = 0; i < 1024; i += 2) {
        const l = fx.bufL[i], rr = fx.bufR[i];
        const x = cx + (l - rr) * scale * r;            // across: what differs between the speakers
        const y = cy - (l + rr) * scale * r;            // up: what they share
        g.fillRect(x, y, 1.5, 1.5);
      }
      g.globalCompositeOperation = 'source-over';
      g.font = '400 6.5px Michroma, sans-serif';
      g.fillStyle = 'rgba(211,208,199,0.45)';
      g.textAlign = 'center';
      g.fillText('CENTRE', cx, 11);
      g.textAlign = 'right';
      g.fillText('SIDES', w - 8, cy - 5);
    }

    return {
      tick() { draw(); },
      keydown(e) {
        if (!/^[1-3]$/.test(e.key)) return false;
        if (!e.repeat) setMode(Number(e.key) - 1);
        return true;
      },
      resize() { draw(); },
      destroy() { destroyed = true; },
    };
  },
};
