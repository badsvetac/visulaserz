// "Neon Drift": a 40-second synthwave sketch rendered in the browser with an
// OfflineAudioContext, so there is always something to play without any file or network.
import { encodeWav } from './wav.js';

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export async function renderDemoTrack() {
  const sr = 44100;
  const beat = 60 / 96;
  const bar = beat * 4;
  const bars = 16;
  const ctx = new OfflineAudioContext(2, Math.ceil((bars * bar + 2.5) * sr), sr);

  const master = ctx.createGain();
  master.gain.value = 0.85;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -12;
  glue.ratio.value = 4;
  glue.attack.value = 0.008;
  glue.release.value = 0.18;
  master.connect(glue).connect(ctx.destination);

  // Everything routed through "pump" ducks under each kick: the classic sidechain breath.
  const pump = ctx.createGain();
  pump.connect(master);

  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;

  const chords = [
    { bass: 33, notes: [57, 60, 64] }, // Am
    { bass: 29, notes: [53, 57, 60] }, // F
    { bass: 36, notes: [55, 60, 64] }, // C
    { bass: 31, notes: [55, 59, 62] }, // G
  ];
  const chordAt = (barIndex) => chords[Math.floor(barIndex / 2) % chords.length];

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(43, t + 0.13);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.45);
    pump.gain.setValueAtTime(0.3, t);
    pump.gain.linearRampToValueAtTime(1, t + beat * 0.6);
  }

  function noiseHit(t, { type, freq, q = 0.8, amp, decay, pan = 0 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
  }

  function snare(t) {
    noiseHit(t, { type: 'bandpass', freq: 1900, amp: 0.55, decay: 0.2 });
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.16);
  }

  // Bass: one saw voice, re-pitched and re-plucked on every eighth note.
  const bassOsc = ctx.createOscillator();
  bassOsc.type = 'sawtooth';
  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.Q.value = 5;
  const bassGain = ctx.createGain();
  bassGain.gain.value = 0;
  bassOsc.connect(bassFilter).connect(bassGain).connect(pump);
  bassOsc.start();

  // Arp: one square voice into a dotted-eighth delay.
  const arpOsc = ctx.createOscillator();
  arpOsc.type = 'square';
  const arpFilter = ctx.createBiquadFilter();
  arpFilter.type = 'lowpass';
  arpFilter.frequency.value = 2600;
  const arpGain = ctx.createGain();
  arpGain.gain.value = 0;
  const arpPan = ctx.createStereoPanner();
  const arpDelay = ctx.createDelay(1);
  arpDelay.delayTime.value = beat * 0.75;
  const arpFeedback = ctx.createGain();
  arpFeedback.gain.value = 0.42;
  const arpDelayPan = ctx.createStereoPanner();
  arpDelayPan.pan.value = -0.5;
  arpPan.pan.value = 0.3;
  arpOsc.connect(arpFilter).connect(arpGain);
  arpGain.connect(arpPan).connect(pump);
  arpGain.connect(arpDelay);
  arpDelay.connect(arpFeedback).connect(arpDelay);
  arpDelay.connect(arpDelayPan).connect(pump);
  arpOsc.start();

  // Pad: detuned saws per chord tone through a filter that opens over the whole track.
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.Q.value = 1.2;
  padFilter.frequency.setValueAtTime(500, 0);
  padFilter.frequency.linearRampToValueAtTime(900, 4 * bar);
  padFilter.frequency.linearRampToValueAtTime(2600, bars * bar);
  padFilter.connect(pump);

  // One bar of notes. Called for each bar only as the render reaches it (see below).
  function scheduleBar(b) {
    const t0 = b * bar;
    const chord = chordAt(b);
    const intro = b < 4;
    const finale = b >= 12;

    if (b % 2 === 0) {
      const len = bar * 2;
      for (const note of chord.notes) {
        for (const detune of [-8, 8]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = hz(note);
          o.detune.value = detune;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.05, t0 + 0.5);
          g.gain.setValueAtTime(0.05, t0 + len - 0.3);
          g.gain.linearRampToValueAtTime(0, t0 + len + 0.2);
          o.connect(g).connect(padFilter);
          o.start(t0);
          o.stop(t0 + len + 0.25);
        }
      }
    }

    for (let s = 0; s < 16; s++) {
      const t = t0 + s * (beat / 4);
      // arp on every sixteenth
      const shape = [0, 1, 2, 0, 2, 1, 2, 1];
      const octave = [12, 12, 12, 24, 12, 24, 12, 12];
      const k = s % 8;
      arpOsc.frequency.setValueAtTime(hz(chord.notes[shape[k]] + octave[k] + (finale ? 12 : 0)), t);
      const arpAmp = intro ? 0.05 : finale ? 0.11 : 0.085;
      arpGain.gain.setValueAtTime(arpAmp, t);
      // The ramp must finish before the next sixteenth starts, or the two automation events collide.
      arpGain.gain.exponentialRampToValueAtTime(0.002, t + beat / 4 - 0.008);

      if (!intro && s % 2 === 0) {
        bassOsc.frequency.setValueAtTime(hz(chord.bass + (s % 8 === 6 ? 12 : 0)), t);
        bassFilter.frequency.setValueAtTime(950, t);
        bassFilter.frequency.exponentialRampToValueAtTime(200, t + 0.22);
        bassGain.gain.setValueAtTime(0.1, t);
        bassGain.gain.linearRampToValueAtTime(0.5, t + 0.012);
        bassGain.gain.exponentialRampToValueAtTime(0.1, t + 0.28);
      }
      if (!intro && s % 4 === 0) kick(t);
      if (!intro && (s === 4 || s === 12)) snare(t);
      const hatOn = finale ? true : b >= 2 && s % 2 === 0 && (intro ? s % 4 === 2 : true);
      if (hatOn) noiseHit(t, { type: 'highpass', freq: 8200, amp: s % 4 === 2 ? 0.2 : 0.11, decay: s % 4 === 2 ? 0.07 : 0.04, pan: s % 4 === 2 ? 0.35 : -0.35 });
    }
    // a snare fill into the drop and into the finale
    if (b === 3 || b === 11) for (let s = 12; s < 16; s++) noiseHit(t0 + s * (beat / 4), { type: 'bandpass', freq: 1900, amp: 0.2 + (s - 12) * 0.1, decay: 0.12 });
    if (b === bars - 1) {
      bassGain.gain.setValueAtTime(0.1, bars * bar);
      bassGain.gain.linearRampToValueAtTime(0, bars * bar + 0.4);
    }
  }

  // An offline render visits every node that exists, started or not, so the ~3,000 drum hits
  // and pad voices made up front cost seconds of CPU before the first sound. Instead the render
  // stops just before each bar and only then makes that bar's notes: same notes, same times,
  // a fraction of the work. Every event lands after the stop, so nothing is late.
  // Firefox has no offline suspend(): there, every bar goes in up front as before.
  const LEAD = 0.05;
  let later = [];
  if (typeof ctx.suspend === 'function') {
    for (let b = 1; b < bars; b++) {
      try {
        ctx.suspend(b * bar - LEAD).then(() => { try { scheduleBar(b); } finally { ctx.resume(); } }, () => later.push(b));
      } catch {
        later.push(b);
      }
    }
  } else {
    later = Array.from({ length: bars - 1 }, (_, i) => i + 1);
  }
  scheduleBar(0);
  await new Promise((resolve) => setTimeout(resolve, 0)); // a refused stop says so before the render starts
  later.sort((a, b) => a - b).forEach(scheduleBar);

  const rendered = await ctx.startRendering();
  return {
    id: 'demo',
    source: 'demo',
    title: 'Neon Drift',
    artist: 'Built-in demo, synthesised in your browser',
    url: URL.createObjectURL(encodeWav(rendered)),
    thumb: null,
  };
}
