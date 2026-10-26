import { BAR, patternOf, songEnd } from './model.js';
import { icon } from './ui-kit.js';

// The toolbar along the top, the way FL Studio's runs: PAT or SONG, the transport, the tempo and
// the song position on LCDs, the pattern picker, the metronome and the typing keyboard, the
// window buttons, undo, the hint bar, the master level, and the file buttons.

export function buildToolbar(S, kit) {
  const { el } = S;
  const b = (content, hint, onclick, cls = '') => el('button', { class: `st2-btn ${cls}`, type: 'button', 'data-hint': hint, onclick }, ...[].concat(content));

  const patBtn = b([el('span', { class: 'led' }), 'PAT'], 'Pattern mode: the picked pattern plays round and round (L)', () => S.setMode('pat'));
  const songBtn = b([el('span', { class: 'led' }), 'SONG'], 'Song mode: the playlist plays from left to right (L)', () => S.setMode('song'));
  const playBtn = b(icon('play'), 'Play or pause (Space)', () => S.toggle(), 'st2-play');
  const stopBtn = b(icon('stop'), 'Stop, and go back to the start', () => S.stop());
  const recBtn = b(icon('rec'), 'Record: what you play on the keyboard or a MIDI keyboard goes into the pattern', () => S.toggleRec(), 'st2-rec');

  const tempoVal = el('span', {}, '128.000');
  const tempo = el('div', { class: 'st2-lcd is-drag', 'data-hint': 'Tempo: drag up or down (Shift for fine). Sync follows the song.' }, tempoVal, el('small', {}, 'BPM'));
  kit.dragNumber(tempo, {
    get: () => S.project.bpm, min: 60, max: 220, step: 1, px: 3,
    set: (v) => { if (S.project.sync) { S.project.sync = false; } S.project.bpm = Math.round(v * 10) / 10; paintTempo(); },
    onEnd: () => S.changed('tempo'),
  });
  const syncBtn = b('SYNC', 'Follow the tempo of the song that is playing', () => { S.project.sync = !S.project.sync; paintTempo(); S.changed('tempo'); });
  const taps = [];
  const tapBtn = b('TAP', 'Tap the tempo in: four taps or more', () => {
    const now = performance.now();
    while (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length >= 3) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      const bpm = 60000 / (gaps.reduce((a, x) => a + x, 0) / gaps.length);
      S.project.sync = false;
      S.project.bpm = Math.round(Math.max(60, Math.min(220, bpm)) * 10) / 10;
      paintTempo();
      S.changed('tempo');
    }
  });
  const posVal = el('span', {}, '1:01:00');
  const pos = el('div', { class: 'st2-lcd is-green', 'data-hint': 'Song position: bar, step, tick' }, posVal);

  const sw = el('span', { class: 'sw' }), nm = el('span', { class: 'nm' });
  const picker = el('div', { class: 'st2-pattern', 'data-hint': 'The pattern: click for the list, new and clone. [ and ] step through them' }, sw, nm);
  picker.addEventListener('click', () => kit.menu(picker, [
    { head: 'Patterns' },
    ...S.project.patterns.map((p) => ({ label: p.name, color: p.color, checked: p.id === S.project.pattern, fn: () => S.setPattern(p.id) })),
    { sep: true },
    { label: 'New pattern', fn: () => S.newPattern() },
    { label: 'Clone this pattern', fn: () => S.clonePattern() },
    { label: 'Rename…', fn: () => kit.rename(picker, patternOf(S.project, S.project.pattern)?.name || '', (v) => { patternOf(S.project, S.project.pattern).name = v; S.changed('patterns'); }) },
    { label: 'Delete this pattern', danger: true, fn: () => S.deletePattern() },
  ]));

  const metroBtn = b(icon('metro'), 'Metronome', () => { S.project.ui.metronome = !S.project.ui.metronome; paint(); S.saveUi(); });
  const typeBtn = b(icon('keys'), 'Typing keyboard to piano: the letter rows play notes. Off, the letters are shortcuts', () => { S.project.ui.typing = !S.project.ui.typing; paint(); S.saveUi(); });

  const winBtn = (name, id, hint) => b(icon(name), hint, () => S.toggleWindow(id));
  const rackBtn = winBtn('rack', 'rack', 'Channel rack');
  const rollBtn = winBtn('roll', 'roll', 'Piano roll');
  const mixBtn = winBtn('mixer', 'mixer', 'Mixer');
  const padsBtn = winBtn('pads', 'pads', 'Drum pads: finger-drum the channels');
  const browserBtn = b(icon('browser'), 'Browser: instruments, drums, effects, patterns', () => S.toggleBrowser());
  const undoBtn = b(icon('undo'), 'Undo (Ctrl+Z)', () => S.undo());
  const redoBtn = b(icon('redo'), 'Redo (Ctrl+Y)', () => S.redo());

  const hint = el('div', { class: 'st2-hint' }, 'Point at anything to see what it does');
  const master = kit.knob({ label: 'Master', value: S.project.mixer.inserts[0].vol, def: 0.85, onChange: (v) => { S.project.mixer.inserts[0].vol = v; S.engine?.chain(0); S.changed('mix', true); }, hint: 'Master volume' });
  const meterBar = el('i');
  const meter = el('div', { class: 'st2-meter', 'data-hint': 'Output' }, meterBar);

  const fileIn = el('input', { type: 'file', accept: '.vzstudio,.json,application/json', hidden: true });
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) S.openFile(fileIn.files[0]); fileIn.value = ''; });
  const saveBtn = b(icon('save'), 'Save the project as a file', () => S.saveFile());
  const openBtn = b(icon('open'), 'Open a project file', () => fileIn.click());
  const exportBtn = b([icon('export'), 'WAV'], 'Export as a WAV file: the song, or the pattern', () => kit.menu(exportBtn, [
    { head: 'Export WAV' },
    { label: 'The song (the playlist)', fn: () => S.exportWav('song') },
    { label: 'This pattern, four times', fn: () => S.exportWav('pattern') },
  ]));
  const maxBtn = b(icon('max'), 'Fill the window with the Studio, or give the stage back', () => S.maximize());

  const node = el('div', { class: 'st2-bar' },
    el('div', { class: 'st2-group st2-mode' }, patBtn, songBtn),
    el('div', { class: 'st2-group' }, playBtn, stopBtn, recBtn),
    el('div', { class: 'st2-group' }, tempo, syncBtn, tapBtn),
    pos,
    picker,
    el('div', { class: 'st2-group' }, metroBtn, typeBtn),
    el('span', { class: 'st2-sep' }),
    el('div', { class: 'st2-group' }, rackBtn, rollBtn, mixBtn, padsBtn, browserBtn),
    el('div', { class: 'st2-group' }, undoBtn, redoBtn),
    hint,
    el('div', { class: 'st2-group' }, master.el, meter),
    el('div', { class: 'st2-group' }, saveBtn, openBtn, exportBtn, maxBtn),
    fileIn,
  );

  function paintTempo() {
    tempoVal.textContent = (S.project.sync ? S.host.clock.bpm : S.project.bpm).toFixed(3);
    syncBtn.classList.toggle('is-on', S.project.sync);
    tempo.classList.toggle('is-green', S.project.sync);
  }
  function paint() {
    const p = S.project;
    patBtn.classList.toggle('is-on', p.mode !== 'song');
    songBtn.classList.toggle('is-on', p.mode === 'song');
    playBtn.classList.toggle('is-on', !!S.engine?.playing);
    playBtn.replaceChildren(icon(S.engine?.playing ? 'stop' : 'play'));
    recBtn.classList.toggle('is-on', S.rec);
    metroBtn.classList.toggle('is-on', !!p.ui.metronome);
    typeBtn.classList.toggle('is-on', p.ui.typing !== false);
    browserBtn.classList.toggle('is-on', S.browserOpen ?? p.ui.browser !== false);
    rackBtn.classList.toggle('is-on', S.windows.isOpen('rack'));
    rollBtn.classList.toggle('is-on', S.windows.isOpen('roll'));
    mixBtn.classList.toggle('is-on', S.windows.isOpen('mixer'));
    padsBtn.classList.toggle('is-on', S.windows.isOpen('pads'));
    const pat = patternOf(p, p.pattern);
    sw.style.background = pat?.color || '#888';
    nm.textContent = pat?.name || '—';
    master.setValue(p.mixer.inserts[0].vol, { silent: true });
    paintTempo();
  }
  let peak = 0, age = 0;
  const shown = { pos: '', w: '' };
  return {
    node,
    paint,
    hint(text, live) {
      const [head, ...rest] = String(text).split(': ');
      hint.replaceChildren(...(rest.length && live !== false ? [el('b', {}, head), rest.join(': ')] : [text]));
    },
    tick(dt) {
      const at = S.engine?.position();
      let step = 0;
      if (at) step = at.step;
      else if (S.project.mode === 'song') step = S.engine?.startAt || 0;
      const bar = Math.floor(step / BAR) + 1, st = Math.floor(step % BAR) + 1, tick = Math.floor((step % 1) * 24);
      const pos = `${bar}:${String(st).padStart(2, '0')}:${String(tick).padStart(2, '0')}`;
      if (pos !== shown.pos) posVal.textContent = shown.pos = pos;
      if ((age += dt) > 0.5) { age = 0; if (S.project.sync) paintTempo(); }
      const v = S.engine ? S.engine.level(0) : 0;
      peak = Math.max(v, peak - dt * 1.4);
      const w = `${Math.max(0, Math.min(100, ((20 * Math.log10(peak + 1e-6) + 48) / 48) * 100)).toFixed(1)}%`;
      if (w !== shown.w) meterBar.style.width = shown.w = w;
    },
    songEnd: () => songEnd(S.project),
  };
}
