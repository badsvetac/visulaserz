import { el } from '../util.js';
import { ECHO_DIVISIONS } from '../audio/engine.js';
import { makePad } from './pad.js';
import { buildXYPad } from './xy-pad.js';

// The PERFORM unit: the moves a DJ makes with their hands while the track runs. Everything
// here is an override that lives inside the FX chain, so none of it is saved with the rack,
// none of it reaches the exported WAV, and turning a knob mid-gesture cannot cancel it.
export function buildPerform({ engine, toast, lcdShow, onFxChange }) {
  const unit = document.getElementById('unit-perform');
  if (!unit) return { keydown: () => false, keyup: () => {}, tick: () => {} };
  const pads = [];
  const add = (opts) => { const p = makePad(opts); pads.push(p); return p.node; };

  // ── isolator ──────────────────────────────────────────────────────────────
  // Killing a band is heard *and* seen: the main analyser sits after the effects, so the
  // picture thins out with the sound, while the beat detector taps the raw track and keeps
  // flashing. Take the bass out and the scene goes airy but never loses the pulse.
  const killRow = el('div', { class: 'pads' },
    add({ label: 'Kill low', key: 'q', keyLabel: 'Q', cls: 'pad-low', hint: 'Hold: the bottom drops out (below 250 Hz)',
      start: () => { engine.setKill(0, true); lcdShow('kill', 'LOW'); }, stop: () => engine.setKill(0, false) }),
    add({ label: 'Kill mid', key: 'w', keyLabel: 'W', cls: 'pad-mid', hint: 'Hold: the body goes (250 Hz – 2.5 kHz), leaving bass and air',
      start: () => { engine.setKill(1, true); lcdShow('kill', 'MID'); }, stop: () => engine.setKill(1, false) }),
    add({ label: 'Kill high', key: 'y', keyLabel: 'Y', cls: 'pad-high', hint: 'Hold: the top goes (above 2.5 kHz) — the track sounds like the next room',
      start: () => { engine.setKill(2, true); lcdShow('kill', 'HIGH'); }, stop: () => engine.setKill(2, false) }),
  );

  // ── echo ──────────────────────────────────────────────────────────────────
  let syncIndex = 0;
  const syncValue = el('span', { class: 'cycle-value' }, ECHO_DIVISIONS[0].name);
  const syncBtn = el('button', { class: 'cycle', type: 'button', title: 'Lock the echo to the detected tempo. It follows the Speed knob, because the beat is measured after it.' },
    el('span', { class: 'cycle-label' }, 'Sync'), syncValue);
  syncBtn.addEventListener('click', (e) => {
    syncIndex = (syncIndex + (e.shiftKey ? -1 : 1) + ECHO_DIVISIONS.length) % ECHO_DIVISIONS.length;
    engine.setEchoSync(syncIndex);
    syncValue.textContent = ECHO_DIVISIONS[syncIndex].name;
    syncBtn.classList.toggle('is-active', syncIndex > 0);
    lcdShow('echo sync', ECHO_DIVISIONS[syncIndex].name);
    if (syncIndex > 0 && !engine.tempo) toast('No tempo yet — play a few bars and the echo will lock on by itself.');
  });

  const echoRow = el('div', { class: 'pads' },
    add({ label: 'Throw', key: 'g', keyLabel: 'G', cls: 'pad-accent', hint: 'Hold: push the music into the echo. Let go and the repeats keep ringing.',
      start: () => { engine.setThrow(true); lcdShow('echo', 'THROW'); }, stop: () => engine.setThrow(false) }),
    add({ label: 'Echo out', key: '0', keyLabel: '0', toggle: true, hint: 'Press: the track disappears and only the repeats are left. Press again to bring it back.',
      start: () => { engine.setEchoOut(true); lcdShow('echo', 'OUT'); }, stop: () => { engine.setEchoOut(false); lcdShow('echo', 'IN'); } }),
  );

  // ── panic ─────────────────────────────────────────────────────────────────
  // Live, a stuck kill is the difference between a mistake and a disaster. One key puts
  // every held override back to neutral, whatever is physically still pressed.
  const panic = el('button', { class: 'key key-ghost', type: 'button', title: 'Release every held effect at once (\\)', onclick: () => releaseAll() }, 'Panic');
  function releaseAll() {
    pads.forEach((p) => p.reset());
    engine.clearPerformance();
    lcdShow('perform', 'CLEAR');
  }

  const xy = buildXYPad({ engine, lcdShow, onChange: onFxChange });

  const group = (legend, body) => el('div', { class: 'group stage-group', role: 'group', 'aria-label': legend },
    el('div', { class: 'group-legend' }, legend), body);
  unit.append(el('div', { class: 'stage-grid' },
    group('Isolator · hold them', killRow),
    group('Echo', el('div', { class: 'perform-echo' }, echoRow, el('div', { class: 'stage-row' }, syncBtn, panic))),
    group('XY pad · drag it', xy.node),
  ));

  const byKey = (e) => pads.find((p) => p.key === e.key.toLowerCase());
  return {
    keydown(e) {
      const p = byKey(e);
      if (p) { if (!e.repeat) p.press(); return true; }
      if (e.key === '\\') { releaseAll(); return true; }
      return false;
    },
    keyup(e) { byKey(e)?.release(); },
    tick(dt, an) {
      engine.setTempo(an.bpm);
      xy.tick(dt);
    },
    syncToKnobs: xy.syncToKnobs,
  };
}
