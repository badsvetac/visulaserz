import { el, store } from '../util.js';

// TAP SYNC: makes timed lyrics for a song that has none. Paste the words (or take the untimed ones
// LRCLIB found), play the song, and tap once as each line begins: Space, or the big button. Every
// tap shows on the stage at once, so a late one is seen and undone (Backspace). At the end the
// sync is kept for this song (it loads by itself next time), and it can be downloaded as an .lrc
// file and nudged earlier or later as a whole. An empty line in the words is a pause: tapping it
// clears the screen until the next line.

const EARLY = 0.2;          // a line goes up a little before it is sung, which also absorbs a late finger
const KEEP = 60;            // songs whose syncs are remembered on this device

const stamp = (t) => {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `[${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}]`;
};
// A local file's id is new on every load (file-1, file-2…), so it is known by its name and size
// instead (crate.js), and a sync made for one file is never shown on another.
export const syncKey = (track) => {
  if (!track) return '';
  const key = track.source === 'file' ? track.key || `file:${track.title || ''}` : track.id || `${track.artist || ''}|${track.title || ''}`;
  return String(key).slice(0, 160);
};
// Syncs saved under those per-load ids belong to no file in particular: dropped once.
const STALE = /^file-(dj-)?\d+$/;
function syncs() {
  const all = store.get('lyricSyncs', {});
  if (!all || typeof all !== 'object') return {};
  const stale = Object.keys(all).filter((k) => STALE.test(k));
  if (stale.length) {
    for (const k of stale) delete all[k];
    store.set('lyricSyncs', all);
  }
  return all;
}
// the sync this device remembers for a track, if any
export function savedSync(track) {
  return syncs()[syncKey(track)]?.lrc || null;
}
function remember(track, lrc) {
  const all = { ...syncs() };
  all[syncKey(track)] = { lrc, at: Date.now() };
  const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  for (const k of keys.slice(KEEP)) delete all[k];
  store.set('lyricSyncs', all);
}

export function buildLyricSync({ engine, lyrics, toast, lcdShow, openCrate }) {
  let session = null;        // { lines, stamps, step: 'words' | 'tap' | 'done', track, shift }

  const words = el('textarea', { class: 'lrc-text sync-words', rows: '8', spellcheck: 'false', placeholder: 'The words, one line per line.\nAn empty line is a pause: tapping it clears the screen.' });
  const fromTop = el('button', { class: 'btn btn-primary', type: 'button', onclick: () => begin(true) }, 'Start from the top');
  const fromHere = el('button', { class: 'btn', type: 'button', onclick: () => begin(false) }, 'Start here');
  const cancel = el('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel');
  const prev = el('p', { class: 'sync-prev' });
  const next = el('p', { class: 'sync-next' });
  const count = el('span', { class: 'sync-count' });
  const tapBtn = el('button', { class: 'btn btn-primary sync-tap', type: 'button', onclick: () => tap() }, 'Tap', el('kbd', {}, 'Space'));
  const undoBtn = el('button', { class: 'btn', type: 'button', onclick: () => undo() }, 'Undo', el('kbd', {}, '⌫'));
  const finishBtn = el('button', { class: 'btn', type: 'button', onclick: () => finish() }, 'Finish', el('kbd', {}, '⏎'));
  const done = el('p', { class: 'sync-done' });
  const earlier = el('button', { class: 'btn', type: 'button', title: 'Every line a tenth of a second sooner', onclick: () => nudge(-0.1) }, '−0.1 s');
  const later = el('button', { class: 'btn', type: 'button', title: 'Every line a tenth of a second later', onclick: () => nudge(0.1) }, '+0.1 s');
  const download = el('button', { class: 'btn btn-primary', type: 'button', onclick: () => save() }, 'Download .lrc');
  const closeBtn = el('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close');

  const panes = {
    words: el('div', { class: 'sync-pane' }, el('p', { class: 'sync-note' }, 'Paste the words, then play the song and tap as each line starts.'), words, el('div', { class: 'sync-actions' }, cancel, fromHere, fromTop)),
    tap: el('div', { class: 'sync-pane' }, el('div', { class: 'sync-head' }, el('span', { class: 'legend' }, 'Tap as this line starts'), count), next, prev, el('div', { class: 'sync-actions' }, undoBtn, finishBtn, tapBtn)),
    done: el('div', { class: 'sync-pane' }, done, el('div', { class: 'sync-actions' }, el('span', { class: 'sync-note sync-nudge' }, 'Move all of it'), earlier, later, closeBtn, download)),
  };
  const card = el('div', { class: 'sync-card', role: 'dialog', 'aria-label': 'Tap sync' }, el('h3', { class: 'legend' }, 'Tap sync'), panes.words, panes.tap, panes.done);
  const veil = el('div', { class: 'sync-veil', hidden: true }, card);
  document.body.append(veil);

  function show(step) {
    session.step = step;
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== step;
  }
  function open() {
    if (!engine.track) { toast('Load a song first: tap sync times its words as it plays.'); return; }
    session = { lines: [], stamps: [], track: engine.track, step: 'words', shift: 0 };
    words.value = lyrics.plain ? String(lyrics.plain).trim() : '';
    veil.hidden = false;
    openCrate?.(false);                      // the stage is where the taps show
    show('words');
    words.focus();
  }
  function close() {
    veil.hidden = true;
    session = null;
  }
  function begin(top) {
    const lines = words.value.split(/\r?\n/).map((l) => l.trim());
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    while (lines.length && !lines[0]) lines.shift();
    if (!lines.length) { toast('Paste the words first, one line per line.'); return; }
    session.lines = lines;
    session.stamps = [];
    if (top) engine.seek(0);
    if (!engine.playing) engine.play();
    show('tap');
    paint();
    lcdShow('tap sync', 'TAP');
  }

  function lrc() {
    const t = session.track;
    const head = [t.artist && `[ar:${t.artist}]`, t.title && `[ti:${t.title}]`, '[by:Visulaserz tap sync]'].filter(Boolean);
    return [...head, ...session.stamps.map((s, i) => `${stamp(s + session.shift)}${session.lines[i]}`)].join('\n');
  }
  // what has been tapped so far goes on the stage straight away
  function apply(label) {
    if (session.stamps.length) lyrics.setLrc(lrc(), label);
  }
  function paint() {
    const i = session.stamps.length, n = session.lines.length;
    count.textContent = `${Math.min(i + 1, n)} / ${n}`;
    const line = session.lines[i];
    next.textContent = i >= n ? 'That was the last line: Finish.' : line || '(a pause: tap when the singing stops)';
    next.classList.toggle('is-pause', i < n && !line);
    prev.textContent = i > 0 ? `${stamp(session.stamps[i - 1]).slice(1, -1)}  ${session.lines[i - 1] || '(pause)'}` : '';
  }
  function tap() {
    if (session?.step !== 'tap') return;
    if (session.stamps.length >= session.lines.length) { finish(); return; }
    const t = engine.currentTime - EARLY;
    const last = session.stamps[session.stamps.length - 1];
    session.stamps.push(last !== undefined ? Math.max(last + 0.05, t) : t);    // a line can never start before the one above it
    apply('tapping…');
    paint();
    if (session.stamps.length === session.lines.length) lcdShow('tap sync', 'LAST LINE');
  }
  function undo() {
    if (session?.step !== 'tap' || !session.stamps.length) return;
    session.stamps.pop();
    if (session.stamps.length) apply('tapping…');
    else lyrics.setLrc(`${stamp(0)}`, 'tapping…');
    paint();
  }
  function finish() {
    if (!session.stamps.length) { close(); return; }
    session.lines = session.lines.slice(0, session.stamps.length);
    show('done');
    keep();
    lcdShow('tap sync', `${session.stamps.length} LINES`);
  }
  function keep() {
    const text = lrc();
    lyrics.setLrc(text, 'your sync');
    remember(session.track, text);
    const shift = session.shift ? ` · moved ${session.shift > 0 ? '+' : ''}${session.shift.toFixed(1)} s` : '';
    done.textContent = `${session.stamps.length} lines synced and kept for this song: it will load by itself next time${shift}.`;
  }
  function nudge(dt) {
    session.shift = Math.round((session.shift + dt) * 10) / 10;
    keep();
  }
  function save() {
    const t = session.track;
    const name = `${[t.artist, t.title].filter(Boolean).join(' - ') || 'lyrics'}`.replace(/[\\/:*?"<>|]+/g, '').slice(0, 120);
    const url = URL.createObjectURL(new Blob([`${lrc()}\n`], { type: 'text/plain;charset=utf-8' }));
    const a = el('a', { href: url, download: `${name}.lrc` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // a new song in the middle of a sync ends it: its taps belonged to the other one
  engine.addEventListener('trackchange', () => { if (session && session.step !== 'done') close(); });

  // While tapping, the sync has the keyboard before anything else on the page (a focused button
  // included): Space taps, Backspace undoes, Enter finishes, and no other key changes the show.
  function keydown(e) {
    if (!session || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'Escape') { close(); return true; }
    if (session.step !== 'tap') return false;
    if (e.key === ' ') { if (!e.repeat) tap(); return true; }
    if (e.key === 'Backspace') { undo(); return true; }
    if (e.key === 'Enter') { finish(); return true; }
    return e.key.length === 1;
  }
  addEventListener('keydown', (e) => { if (keydown(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  return {
    open,
    get active() { return !!session; },
  };
}
