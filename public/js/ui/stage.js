import { el, formatTime, downloadBlob, safeFilename } from '../util.js';

// The STAGE unit: things you do to a running show. Pads are momentary (hold them), the
// loop is set live, and the live input turns the app into a visualiser for anything playing.
export function buildStage({ engine, analysis, renderer, toast, lcdShow }) {
  const unit = document.getElementById('unit-stage');
  const pads = [];

  function pad({ label, key, keyLabel = key, hint, start, stop = () => {}, cls = '' }) {
    const node = el('button', { class: `pad ${cls}`, type: 'button', title: hint },
      el('span', { class: 'led' }), el('span', { class: 'pad-label' }, label), el('span', { class: 'pad-key' }, keyLabel));
    let down = false;
    const press = () => { if (down) return; down = true; node.classList.add('is-down'); start(); };
    const release = () => { if (!down) return; down = false; node.classList.remove('is-down'); stop(); };
    node.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); node.setPointerCapture(e.pointerId); press(); });
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener('lostpointercapture', release);
    node.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
    node.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
    node.addEventListener('blur', release);
    pads.push({ key, press, release });
    return node;
  }

  let strobeWarned = false;
  const padRow = el('div', { class: 'pads' },
    pad({ label: 'Tape stop', key: 't', keyLabel: 'T', hint: 'Hold: the motor winds down and the pitch sinks with it',
      start: () => { engine.tapeStop(true); lcdShow('tape', 'STOP'); }, stop: () => { engine.tapeStop(false); lcdShow('tape', 'RUN'); } }),
    pad({ label: 'Stutter', key: 's', keyLabel: 'S', hint: 'Hold: repeats the slice where you pressed (an eighth note at the detected tempo)',
      start: () => { engine.setStutter(true, analysis.bpm ? 30 / analysis.bpm : 0.18); lcdShow('stutter', 'ON'); }, stop: () => { engine.setStutter(false); lcdShow('stutter', 'OFF'); } }),
    pad({ label: 'Strobe', key: 'x', keyLabel: 'X', hint: 'Hold: white strobe (disabled while Reduce flashing is on)',
      start: () => {
        if (renderer.look.reduceFlashing) { if (!strobeWarned) { strobeWarned = true; toast('Strobe stays off while “Reduce flashing” is on.'); } return; }
        renderer.strobe = true; lcdShow('strobe', 'ON');
      }, stop: () => { renderer.strobe = false; } }),
    pad({ label: 'Blackout', key: 'b', keyLabel: 'B', hint: 'Hold: lights out', start: () => { renderer.blackout = true; lcdShow('blackout', '■'); }, stop: () => { renderer.blackout = false; } }),
    pad({ label: 'Freeze', key: 'z', keyLabel: 'Z', hint: 'Hold: freezes the picture while the music goes on', start: () => { renderer.freeze = true; lcdShow('freeze', 'HOLD'); }, stop: () => { renderer.freeze = false; } }),
    pad({ label: 'Drop', key: 'Enter', keyLabel: '⏎', hint: 'Fire a beat by hand: shockwaves, flashes, laser cue', cls: 'pad-accent', start: () => analysis.triggerBeat() }),
    pad({ label: 'Snap', key: 'j', keyLabel: 'J', hint: 'Save a PNG of the picture', start: () => {
      renderer.captureNext = (blob) => {
        if (!blob) return toast('The snapshot could not be captured.', { kind: 'error' });
        downloadBlob(blob, `${safeFilename(engine.track?.title || 'visulaserz')} - snap.png`);
        toast('Snapshot saved.');
      };
    } }),
  );

  // ── A–B loop ──────────────────────────────────────────────────────────────
  let a = null;
  const abReadout = el('span', { class: 'ab-readout' }, '—');
  const refreshAB = () => {
    if (engine.ab) abReadout.textContent = `${formatTime(engine.ab.a)} → ${formatTime(engine.ab.b)}`;
    else if (a !== null) abReadout.textContent = `${formatTime(a)} → set B`;
    else abReadout.textContent = 'no loop';
  };
  const setA = () => { if (!engine.duration) return; a = engine.currentTime; engine.clearAB(); refreshAB(); lcdShow('loop A', formatTime(a)); };
  const setB = () => {
    if (!engine.duration) return;
    if (a === null) a = 0;
    const b = engine.currentTime;
    if (b - a < 0.2) return toast('Set A first, then B a little later.');
    engine.setAB(a, b);
    lcdShow('loop', `${formatTime(a)}–${formatTime(b)}`);
  };
  const clearAB = () => { a = null; engine.clearAB(); refreshAB(); lcdShow('loop', 'OFF'); };
  engine.addEventListener('abchange', refreshAB);
  engine.addEventListener('trackchange', () => { a = null; refreshAB(); });
  const loopRow = el('div', { class: 'stage-row' },
    el('button', { class: 'key', type: 'button', onclick: setA, title: 'Loop start (I)' }, el('span', { class: 'led' }), 'Set A'),
    el('button', { class: 'key', type: 'button', onclick: setB, title: 'Loop end (O)' }, el('span', { class: 'led' }), 'Set B'),
    el('button', { class: 'key key-ghost', type: 'button', onclick: clearAB, title: 'Clear the loop (U)' }, 'Clear'),
    abReadout,
  );

  // ── live input ────────────────────────────────────────────────────────────
  const liveStatus = el('span', { class: 'ab-readout' }, 'off');
  async function listen(kind) {
    try {
      let stream;
      if (kind === 'computer') {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser cannot capture the computer’s audio.');
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        stream.getVideoTracks().forEach((t) => t.stop()); // only the audio is wanted
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error('No audio was shared. Pick a tab or the whole screen and tick “Share audio”.');
        }
        engine.startLive(stream, 'This computer');
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        engine.startLive(stream, 'Microphone');
      }
      lcdShow('live', kind === 'computer' ? 'COMPUTER' : 'MIC');
    } catch (e) {
      if (e.name === 'NotAllowedError') toast('Permission was not given, so nothing is being listened to.');
      else toast(e.message, { kind: 'error', timeout: 8000 });
    }
  }
  engine.addEventListener('live', () => { liveStatus.textContent = engine.live ? `listening: ${engine.liveLabel}` : 'off'; });
  const liveRow = el('div', { class: 'stage-row' },
    el('button', { class: 'key', type: 'button', onclick: () => listen('computer'), title: 'Visualise whatever this computer is playing (Spotify, a game, a call)' }, el('span', { class: 'led' }), 'This computer'),
    el('button', { class: 'key', type: 'button', onclick: () => listen('mic'), title: 'Visualise the microphone' }, el('span', { class: 'led' }), 'Microphone'),
    el('button', { class: 'key key-ghost', type: 'button', onclick: () => engine.stopLive() }, 'Stop'),
    liveStatus,
  );

  const group = (legend, body) => el('div', { class: 'group stage-group', role: 'group', 'aria-label': legend }, el('div', { class: 'group-legend' }, legend), body);
  unit.append(el('div', { class: 'stage-grid' }, group('Pads · hold them', padRow), group('Loop', loopRow), group('Live input', liveRow)));
  refreshAB();

  const byKey = (e) => pads.find((p) => p.key === e.key || p.key === e.key.toLowerCase());
  return {
    keydown(e) {
      const p = byKey(e);
      if (p) { if (!e.repeat) p.press(); return true; }
      const k = e.key.toLowerCase();
      if (k === 'i') { setA(); return true; }
      if (k === 'o') { setB(); return true; }
      if (k === 'u') { clearAB(); return true; }
      return false;
    },
    keyup(e) { byKey(e)?.release(); },
  };
}
