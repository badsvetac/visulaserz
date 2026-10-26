import { createStudioEngine } from './lib/studio/engine.js';
import { loadProject, saveProject, newChannel, newPattern, newFx, part, patternOf, isEmpty, songEnd, BAR, FX_SLOTS, PLUGINS, ROOT } from './lib/studio/model.js';
import { STUDIO_CSS } from './lib/studio/style.js';
import { createKit, createWindows } from './lib/studio/ui-kit.js';
import { createHistory } from './lib/studio/history.js';
import { buildToolbar } from './lib/studio/toolbar.js';
import { buildBrowser } from './lib/studio/browser.js';
import { buildPlaylist } from './lib/studio/playlist.js';
import { buildRack } from './lib/studio/rack.js';
import { buildRoll } from './lib/studio/roll.js';
import { buildMixer } from './lib/studio/mixer.js';
import { buildPads } from './lib/studio/pads.js';
import { pluginWindow, fxWindow } from './lib/studio/plugins.js';
import { TAPE_SOURCE } from './lib/tape.js';

// STUDIO: a music workstation over the song, built the way FL Studio is built. The PLAYLIST
// arranges patterns in time; the CHANNEL RACK holds the instruments, each with its row of steps;
// the PIANO ROLL draws their notes; the MIXER runs every channel through an insert with effect
// slots into the master; every instrument and effect has its own window. PAT plays the picked
// pattern round and round, SONG plays the playlist. Synced, it runs on the tempo of the song that
// is playing, and its key lights up the piano roll; free, it has its own tempo and needs no song.
// What it plays goes through the tools into the picture and the video, and it can be saved as a
// project file or rendered to a WAV.
//
// Keys, once it has been clicked: Space plays and stops · the letter rows are a piano
// (Z S X D C V G B H N J M and Q 2 W 3 E R 5 T 6 Y 7 U I) · - and = move it an octave ·
// [ and ] step through the patterns · Ctrl+Z / Ctrl+Y undo and redo · in the piano roll Ctrl+A,
// Ctrl+C, Ctrl+V, Ctrl+B, Delete and the arrows. With the typing keyboard off: L switches PAT and
// SONG, and P B D E pick the tools.

// a phone or a small tablet (the tools are plugins and keep to themselves, so this is worked out here)
const SMALL_DEVICE = /Android|Mobi|iP(hone|ad|od)/i.test(navigator.userAgent) || !!navigator.userAgentData?.mobile
  || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
const PIANO = 'zsxdcvgbhnjm,l.;/'.split('');
const PIANO_HI = 'q2w3er5t6y7ui9o0p'.split('');
const WINDOWS = {
  rack: { title: 'Channel rack', w: 640, h: 300, minW: 420, minH: 160 },
  roll: { title: 'Piano roll', w: 760, h: 420, minW: 480, minH: 240 },
  mixer: { title: 'Mixer', w: 900, h: 380, minW: 520, minH: 260 },
  pads: { title: 'Drum pads', w: 420, h: 380, minW: 300, minH: 260 },
};

export default {
  id: 'studio',
  name: 'Studio',
  group: 'Studio',
  blurb: 'A music workstation over the song, built like FL Studio: playlist, channel rack, piano roll, mixer with effect slots and plugin windows, locked to the song’s tempo and key',
  tags: ['studio', 'daw', 'playlist', 'piano roll', 'mixer', 'beat maker', 'fl studio'],
  size: { w: 1180, h: 680 },
  resizable: { minW: 780, minH: 460, maxW: 1800, maxH: 1100 },

  create(host, mount) {
    const { el } = host;
    if (!document.getElementById('vz-studio-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'vz-studio-css', textContent: STUDIO_CSS }));
    mount.classList.add('vz-studio');
    const project = loadProject(host.store.get('project', null));
    let saveTimer = 0;
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => host.store.set('project', saveProject(project)), 400); };
    let engine = null, ctx = null, destroyed = false, exporting = false;
    let track = null, tape = null, tapeJob = null, tapeSince = 0, grabTimer = 0;
    let octave = 0, uiDt = 0;
    const flashes = [];
    const recording = new Map();
    let grabFor = null, asked = 0;
    let kit, history, toolbar, browser, playlist, windows;   // made below, once S exists

    // ── what every part of the Studio shares ─────────────────────────────────────────────────
    const S = {
      el, host, project, root: mount,
      get engine() { return engine; },
      rec: false,
      samples: [],
      clipboard: null,
      mixerInsert: 1,
      activeWin: 'rack',
      views: {},
      get ch() { return project.channels.find((c) => c.id === project.selected) || null; },
      pat: () => patternOf(project, project.pattern),
      hint: (t, live) => toolbar?.hint(t, live),
      saveUi: () => save(),
      focusWin(id) { S.activeWin = id; },
      onWindows: () => toolbar?.paint(),
      changed(what, quiet = false) {
        save();
        history.changed();
        wantTrack();
        if (quiet) return;
        refresh(what);
      },
      select(id) {
        if (project.selected === id) return;
        project.selected = id;
        const c = S.ch;
        if (c?.insert) S.mixerInsert = c.insert;
        save();
        refresh('select');
      },
      setPattern(id) {
        if (!patternOf(project, id)) return;
        if (engine?.playing && project.mode !== 'song') engine.queue(id); else project.pattern = id;
        save();
        refresh('pattern');
        host.lcd('pattern', patternOf(project, id).name.toUpperCase().slice(0, 16));
      },
      newPattern() {
        const p = newPattern(project);
        project.patterns.push(p);
        project.pattern = p.id;
        S.changed('patterns');
        return p;
      },
      clonePattern() {
        const from = S.pat();
        if (!from) return;
        const copy = JSON.parse(JSON.stringify(from));
        copy.id = `p${project.nextId++}`;
        copy.name = `${from.name} 2`.slice(0, 24);
        project.patterns.splice(project.patterns.indexOf(from) + 1, 0, copy);
        project.pattern = copy.id;
        S.changed('patterns');
      },
      deletePattern() {
        const p = S.pat();
        if (!p || project.patterns.length < 2) { host.toast('A project keeps at least one pattern.'); return; }
        const i = project.patterns.indexOf(p);
        project.patterns.splice(i, 1);
        project.playlist.clips = project.playlist.clips.filter((c) => c.pattern !== p.id);
        project.pattern = project.patterns[Math.max(0, i - 1)].id;
        S.changed('patterns');
      },
      setMode(m) {
        if (project.mode === m) return;
        const was = engine?.playing;
        if (was) engine.stop();
        project.mode = m;
        if (was) engine.play();
        save();
        toolbar.paint();
        host.lcd('studio', m === 'song' ? 'SONG' : 'PATTERN');
      },
      // The sound, woken by this press if it is not up yet: making the audio context builds the
      // Studio's engine at once (whenReady below), so the first press plays instead of only waking it.
      wake() { if (!engine) host.audio.ensure(); return engine; },
      toggle() {
        if (!S.wake()) return;
        engine.toggle();
        host.setActive(engine.playing);
        if (!engine.playing) recording.clear();
        toolbar.paint();
      },
      stop() {
        if (!engine) return;
        engine.stop();
        engine.seek(0);
        recording.clear();
        host.setActive(false);
        toolbar.paint();
      },
      toggleRec() { S.rec = !S.rec; toolbar.paint(); host.lcd('studio', S.rec ? 'RECORD' : 'REC OFF'); },
      toggleWindow(id) { windows.toggle(id, spec(id)); toolbar.paint(); },
      openWindow(id) { windows.open(id, spec(id)); toolbar.paint(); },
      openRoll(id) { if (id) S.select(id); windows.open('roll', spec('roll')); S.views.roll?.render(); toolbar.paint(); },
      openPlugin(id) {
        const ch = project.channels.find((c) => c.id === id);
        if (!ch) return;
        const big = ch.plugin === 'synth';
        windows.open(`plugin:${id}`, { title: `${ch.name} · ${PLUGINS[ch.plugin]}`, build: pluginWindow(S, kit, ch), w: big ? 470 : 420, h: big ? 560 : 360, minW: 360, minH: 220 });
      },
      openFx(i, fxId) { windows.open(`fx:${fxId}`, { title: 'Effect', build: fxWindow(S, kit, i, fxId), w: 380, h: 220, minW: 300, minH: 150 }); },
      toggleBrowser() {
        browserShown = !browserShown;
        if (!narrow()) project.ui.browser = browserShown;       // a phone's choice is not the big screen's
        browser.node.hidden = !browserShown;
        save(); toolbar.paint(); setTimeout(() => { windows.relayout(); playlist.resize(); });
      },
      addChannel(plugin, sound) {
        const ch = newChannel(project, plugin, sound);
        project.channels.push(ch);
        project.selected = ch.id;
        engine?.syncChannels();
        S.changed('channels');
        if (plugin === 'slicer') { needTape(); host.toast('Play the song and press Grab in the Slicer window: its last bars become slices.'); }
        else if (plugin !== 'sampler') S.audition(ch);
        return ch;
      },
      cloneChannel(id) {
        const src = project.channels.find((c) => c.id === id);
        if (!src) return;
        const ch = JSON.parse(JSON.stringify({ ...src, sample: null }));
        ch.id = `c${project.nextId++}`;
        ch.name = `${src.name} 2`.slice(0, 24);
        ch.sample = src.sample;
        project.channels.splice(project.channels.indexOf(src) + 1, 0, ch);
        for (const pat of project.patterns) if (pat.ch[src.id]) pat.ch[ch.id] = JSON.parse(JSON.stringify(pat.ch[src.id]));
        const sl = engine?.slices(src);
        if (sl) engine.setSlices(ch, sl.buffer, sl.cuts.length);
        project.selected = ch.id;
        engine?.syncChannels();
        S.changed('channels');
      },
      removeChannel(id) {
        const i = project.channels.findIndex((c) => c.id === id);
        if (i < 0) return;
        project.channels.splice(i, 1);
        for (const pat of project.patterns) delete pat.ch[id];
        windows.drop(`plugin:${id}`);
        project.selected = project.channels[Math.min(i, project.channels.length - 1)]?.id ?? null;
        engine?.syncChannels();
        S.changed('channels');
      },
      clearPart(ch) {
        const q = S.pat()?.ch[ch.id];
        if (q) { q.steps.fill(0); q.notes.length = 0; }
        S.changed('notes');
      },
      addFx(i, type) {
        const ins = project.mixer.inserts[i];
        if (!ins) return;
        const k = ins.fx.findIndex((f) => !f);
        if (k < 0) { host.toast(`All ${FX_SLOTS} slots of ${ins.name} are full.`); return; }
        ins.fx[k] = newFx(project, type);
        S.mixerInsert = i;
        engine?.chain(i);
        S.changed('fx');
        S.openFx(i, ins.fx[k].id);
      },
      audition(ch, key = ROOT) {
        if (!S.wake()) return;
        engine.noteOn(ch, key, 0.8);
        setTimeout(() => engine?.noteOff(ch, key), 180);
      },
      async importSample(file) {
        const c = host.audio.ensure();
        if (!c) return null;
        try {
          const buffer = await c.decodeAudioData(await file.arrayBuffer());
          const s = { name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), buffer };
          S.samples = [...S.samples.filter((x) => x.name !== s.name), s];
          browser.render();
          return s;
        } catch {
          host.toast(`${file.name} could not be read as audio.`, { kind: 'error' });
          return null;
        }
      },
      addSampler(s) {
        if (!s) return;
        const ch = S.addChannel('sampler');
        ch.sample = s;
        ch.name = s.name.slice(0, 24);
        ch.params.sampleName = s.name;
        S.changed('channels');
        S.audition(ch);
      },
      async loadInto(ch, file) {
        const s = await S.importSample(file);
        if (!s) return;
        ch.sample = s;
        ch.params.sampleName = s.name;
        if (/^Sampler( \d+)?$/.test(ch.name)) ch.name = s.name.slice(0, 24);
        S.changed('channels');
        S.audition(ch);
      },
      async grab(ch, retry = 0) {
        clearTimeout(grabTimer);
        if (!engine) { host.audio.ensure(); host.toast('Play the song first, then Grab.'); return; }
        if (!host.analysis.active) { host.toast('Play the song first: Grab takes the last bars of what is playing.'); return; }
        const node = await needTape();
        if (destroyed) return;
        if (!node) { host.toast('This browser cannot record the song, so the Slicer has nothing to cut.', { kind: 'error' }); return; }
        const len = (ch.params.bars || 2) * 4 * host.clock.period;
        const end = host.clock.last(4, ctx.currentTime - 0.005);
        if (end - len < tapeSince + 0.02) {
          // the tape began listening only a moment ago: the slices come once it has heard the bars
          // (asked again quietly if the beat grid moved in the meantime)
          const ready = host.clock.next(4, tapeSince + len + 0.02) + 0.05;
          const wait = Math.max(0.1, ready - ctx.currentTime);
          if (!retry) host.toast(`Listening to the song: the slices arrive in ${Math.ceil(wait)} s.`);
          if (retry < 6) grabTimer = setTimeout(() => { if (!destroyed) S.grab(ch, retry + 1); }, wait * 1000);
          return;
        }
        grabFor = ch;
        tape.port.postMessage({ type: 'dump', id: ++asked, at: end - len, len });
      },
      undo() { if (history.undo()) host.lcd('studio', 'UNDO'); },
      redo() { if (history.redo()) host.lcd('studio', 'REDO'); },
      afterRestore() {
        windows.each((o) => { if (o.id.startsWith('plugin:') && !project.channels.some((c) => `plugin:${c.id}` === o.id)) windows.drop(o.id); });
        // The project now holds fresh copies of every channel, insert, effect and note: whatever
        // was built on the old ones is built again, open or not, so nothing goes on editing them.
        for (const v of Object.values(S.views)) v?.invalidate?.();
        S.views.roll?.clearSelection?.();
        windows.each((o) => { if (o.id.startsWith('plugin:') || o.id.startsWith('fx:')) o.view?.render?.(); });
        engine?.syncChannels();
        wantTrack();
        save();                                    // what was undone stays undone after a reload
        refresh('all');
      },
      saveFile() {
        const url = URL.createObjectURL(new Blob([JSON.stringify(saveProject(project), null, 1)], { type: 'application/json' }));
        const a = el('a', { href: url, download: 'Visulaserz Studio project.vzstudio' });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        host.lcd('studio', 'SAVED');
      },
      async openFile(file) {
        try {
          const fresh = loadProject(JSON.parse(await file.text()));
          windows.each((o) => { if (o.id.startsWith('plugin:') || o.id.startsWith('fx:')) windows.drop(o.id); });
          for (const k of Object.keys(project)) delete project[k];
          Object.assign(project, fresh);
          engine?.syncChannels();
          wantTrack();
          history.reset();
          save();
          refresh('all');
          host.toast(`${file.name} is open.`);
        } catch {
          host.toast('That file is not a Studio project.', { kind: 'error' });
        }
      },
      exportWav: (kind) => exportWav(kind),
      maximize() { host.window?.maximize(!host.window.maximized); setTimeout(() => { windows.relayout(); playlist.resize(); }, 80); },
    };

    // ── the parts ─────────────────────────────────────────────────────────────────────────────
    kit = createKit(S);
    history = createHistory(S);
    toolbar = buildToolbar(S, kit);
    browser = buildBrowser(S, kit);
    const work = el('div', { class: 'st2-work' });
    mount.append(toolbar.node, el('div', { class: 'st2-main' }, browser.node, work));
    // On a narrow Studio (a phone) the browser starts put away, for this visit only: the project
    // keeps its own choice for the big screen, and the toolbar's Browser button still brings it out.
    // The toolbar becomes one row to swipe along, so the windows keep the height.
    const narrow = () => (mount.clientWidth || window.innerWidth) < 600;
    const short = () => (mount.clientHeight || window.innerHeight) < 420;    // a phone on its side: the toolbar on one row too
    let wasNarrow = narrow();
    let browserShown = project.ui.browser !== false && !wasNarrow;
    browser.node.hidden = !browserShown;
    mount.classList.toggle('is-narrow', wasNarrow);
    mount.classList.toggle('is-short', short());
    Object.defineProperty(S, 'browserOpen', { get: () => browserShown });
    if (wasNarrow && window.innerHeight > window.innerWidth && !host.store.get('sidewaysTip', false)) {
      host.store.set('sidewaysTip', true);
      host.toast('Tip: turn the phone sideways for the full Studio. Swipe the toolbar for more.', { timeout: 6000 });
    }
    playlist = buildPlaylist(S, kit);
    work.append(playlist.node);
    S.views.playlist = playlist;
    work.addEventListener('pointerdown', (e) => { if (!e.target.closest('.st2-win')) S.focusWin('playlist'); }, true);
    // A phone counts a finger's pointerdown as no permission for sound; its lift is one. A pad or a
    // key tapped first makes the sound there, and this lets it start (or resume) as the finger lifts.
    mount.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse' && (!engine || ctx?.state !== 'running')) host.audio.ensure(); });
    windows = createWindows(S, work);
    S.windows = windows;
    const makers = { rack: () => buildRack(S, kit), roll: () => buildRoll(S, kit), mixer: () => buildMixer(S, kit), pads: () => buildPads(S) };
    // a main window: the view is made the first time it opens, and kept
    const spec = (id) => ({ ...WINDOWS[id], build: (body) => { const v = makers[id](); S.views[id] = v; body.append(v.node); return v; } });
    for (const [id, st] of Object.entries(project.ui.windows)) if (st.open && WINDOWS[id]) windows.open(id, spec(id));

    function refresh(what = 'all') {
      toolbar.paint();
      playlist.render();
      for (const id of Object.keys(WINDOWS)) if (windows.isOpen(id)) S.views[id]?.render();
      if (['channels', 'all', 'plugin', 'patterns'].includes(what)) browser.render();
      if (what === 'all' || what === 'channels') windows.each((o) => { if (o.id.startsWith('plugin:') && !o.el.hidden) o.view?.render?.(); });
    }

    // ── the sound ─────────────────────────────────────────────────────────────────────────────
    host.audio.whenReady((c) => {
      if (engine || destroyed) return;
      ctx = c;
      engine = createStudioEngine({ ctx, out: host.audio.input, clock: host.clock, project, onVisual });
      engine.syncChannels();
      wantTrack();
      host.onDispose(() => { clearTimeout(grabTimer); tape?.port.postMessage({ type: 'end' }); engine?.destroy(); });
      refresh('all');
    });
    // The song itself is left alone until something here needs it: the Song duck (a gain in one of
    // the track's slots, which the kick dips) or a Slicer (a tape listening beside that gain). Both
    // are taken on first use, so opening the Studio never touches the music, and even then the song
    // only ever runs through plain gains: a tape that fails can lose its slices, never the song.
    function trackSlot() {
      if (track || !engine || destroyed) return track;
      const tap = ctx.createGain(), duck = ctx.createGain();
      tap.connect(duck);
      host.audio.insert({ input: tap, output: duck }, { music: true });
      host.audio.own(tap, duck);                   // let go of when the Studio closes
      engine.setTrackDuck(duck.gain);
      track = { tap, duck };
      return track;
    }
    function wantTrack() {
      if (engine && project.mixer.songDuck > 0.01) trackSlot();
    }
    function needTape() {
      if (tape || tapeJob || !engine || destroyed) return tapeJob || Promise.resolve(tape);
      tapeJob = host.audio.worklet('vz-tape', TAPE_SOURCE).then(() => {
        if (destroyed) return null;
        const node = new AudioWorkletNode(ctx, 'vz-tape', { numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit', processorOptions: { seconds: 20 } });
        node.port.onmessage = (e) => { if (e.data.type === 'dump' && e.data.id === asked && grabFor) took(grabFor, e.data); };
        host.audio.own(node);                      // its port and its handler go when the Studio closes
        trackSlot().tap.connect(node);
        tape = node;
        tapeSince = ctx.currentTime;
        return node;
      }).catch(() => null);                        // no worklets: no slicer, the rest works
      return tapeJob;
    }
    function took(ch, { L, R }) {
      grabFor = null;
      const b = ctx.createBuffer(2, L.length, ctx.sampleRate);
      b.copyToChannel(L, 0);
      b.copyToChannel(R, 1);
      const count = ch.params.slices || 16;
      engine.setSlices(ch, b, count);
      // the bars come back in order on this pattern, ready to be moved about in the piano roll
      const pat = S.pat(), steps = (ch.params.bars || 2) * BAR;
      if (pat.len < steps) pat.len = Math.min(128, steps);
      const q = part(pat, ch.id);
      q.steps.fill(0);
      q.notes = Array.from({ length: count }, (_, i) => ({ s: (i * steps) / count, l: steps / count, k: ROOT + i, v: 100 }));
      S.changed('notes');
      windows.get(`plugin:${ch.id}`)?.view?.render();
      host.lcd('slices', `${count} · ${ch.params.bars} BAR${ch.params.bars > 1 ? 'S' : ''}`);
      host.visual.hit(0.6);
    }
    // the picture: the kick lands hardest, the snare and the clap next, a bass note makes it breathe
    function onVisual(t, ch, key, vel) {
      let s = 0.2, shock = 0;
      if (ch.plugin === 'drum') {
        s = { kick: 1, snare: 0.65, clap: 0.65, tom: 0.45, perc: 0.35, crash: 0.8, cowbell: 0.35, rim: 0.3, snap: 0.4 }[ch.params.sound] ?? 0.12;
        if (ch.params.sound === 'kick') shock = 0.12;
        if (ch.params.sound === 'crash') shock = 0.35;
      } else if (ch.plugin === 'synth') s = /808|bass|reese/.test(ch.params.preset) ? 0.35 : 0.16;
      else if (ch.plugin === 'slicer') s = 0.3;
      else if (ch.plugin === 'sampler') s = 0.4;
      flashes.push([t, s * vel, shock * vel, ch.id]);
    }

    // ── the keyboard as a piano ───────────────────────────────────────────────────────────────
    const held = new Map();
    const sounding = new Map();    // note number → the channel it was started on, which also lets it go
    function pianoKey(e) {
      const k = e.key.toLowerCase();
      let i = PIANO.indexOf(k);
      if (i >= 0) return 48 + 12 * octave + i;
      i = PIANO_HI.indexOf(k);
      if (i >= 0) return 60 + 12 * octave + i;
      return null;
    }
    function press(key, vel = 0.85) {
      const ch = S.ch;
      if (!S.wake() || !ch) return;
      const was = sounding.get(key);
      if (was && was !== ch) engine.noteOff(was, key);            // the same key held on another channel
      engine.noteOn(ch, key, vel);
      sounding.set(key, ch);
      if (!S.rec || !engine.playing) return;
      // recorded onto the step it falls nearest to, the way FL quantises a live take
      const at = engine.position();
      if (!at || at.mode === 'song') return;
      const pat = patternOf(project, at.pattern);
      if (!pat) return;
      const q = part(pat, ch.id);
      if (!q.notes.length && q.steps.some(Boolean)) { q.steps.forEach((v, k) => { if (v && k < pat.len) q.notes.push({ s: k, l: 1, k: ROOT, v }); }); q.steps.fill(0); }
      const n = { s: Math.round(at.step) % pat.len, l: 1, k: key, v: Math.round(vel * 127) };
      q.notes.push(n);
      recording.set(key, { n, pat, from: at.step });
      S.changed('notes');
    }
    function lift(key) {
      // let go on the channel the note was started on, even if another one has been picked since
      const ch = sounding.get(key) || S.ch;
      sounding.delete(key);
      if (!ch || !engine) return;
      engine.noteOff(ch, key);
      const r = recording.get(key);
      if (!r) return;
      recording.delete(key);
      const at = engine.position();
      if (at) { let len = at.step - r.from; if (len < 0) len += r.pat.len; r.n.l = Math.max(1, Math.round(len)); }
      S.changed('notes');
    }
    const onMidi = (e) => { const { key, vel, on } = e.detail || {}; if (!Number.isFinite(key)) return; if (on) press(key, vel || 0.85); else lift(key); };
    addEventListener('vz-note', onMidi);
    host.onDispose(() => removeEventListener('vz-note', onMidi));
    // Ctrl shortcuts never reach a tool through the page's own keyboard handler: the panel takes them
    const panel = mount.closest('.tool-panel') || mount;
    const onCtrl = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.target.matches?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      let done = false;
      if (k === 'z' && !e.shiftKey) { S.undo(); done = true; }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { S.redo(); done = true; }
      else if (k === 's') { S.saveFile(); done = true; }
      else if (S.activeWin === 'roll' && windows.isOpen('roll')) done = !!S.views.roll?.key(e);
      if (done) { e.preventDefault(); e.stopPropagation(); }
    };
    panel.addEventListener('keydown', onCtrl);
    host.onDispose(() => panel.removeEventListener('keydown', onCtrl));

    refresh('all');

    return {
      tick(dt) {
        engine?.pump();
        if (ctx) {
          const now = ctx.currentTime;
          let s = 0, sh = 0;
          while (flashes.length && flashes[0][0] <= now) {
            const f = flashes.shift();
            s = Math.max(s, f[1]);
            sh = Math.max(sh, f[2]);
            if (windows.isOpen('pads')) S.views.pads?.flash(f[3]);
          }
          if (flashes.length > 400) flashes.splice(0, flashes.length - 400);
          if (s > 0) host.visual.hit(s);
          if (sh > 0) host.visual.shock(sh);
        }
        // the screens at most 60 times a second, however fast the display runs: on a 240 Hz panel
        // the playlist, the meters and the piano roll would otherwise be drawn four times for one look
        uiDt += dt;
        if (uiDt < 1 / 62) return;
        const step = Math.min(0.1, uiDt);
        uiDt = 0;
        toolbar.tick(step);
        playlist.tick(step);
        for (const id of ['rack', 'roll', 'mixer']) if (windows.isOpen(id)) S.views[id]?.tick?.(step);
      },
      keydown(e) {
        if (e.target.matches?.('input, textarea')) return false;
        if (e.key === ' ') { if (!e.repeat) S.toggle(); return true; }
        if (e.key === '[' || e.key === ']') {
          const list = project.patterns, i = list.findIndex((p) => p.id === project.pattern);
          S.setPattern(list[(i + (e.key === ']' ? 1 : -1) + list.length) % list.length].id);
          return true;
        }
        // the window being worked in has the first say (the piano roll's Delete and arrows, the pads)
        const active = S.activeWin;
        if (active === 'pads' && windows.isOpen('pads') && S.views.pads?.key(e)) return true;
        if (active === 'roll' && windows.isOpen('roll') && S.views.roll?.key(e)) return true;
        if (project.ui.typing !== false) {
          if (e.key === '-' || e.key === '=') { octave = Math.max(-3, Math.min(3, octave + (e.key === '=' ? 1 : -1))); host.lcd('octave', octave >= 0 ? `+${octave}` : String(octave)); return true; }
          const key = pianoKey(e);
          if (key === null) return false;
          const k = e.key.toLowerCase();
          if (!e.repeat && !held.has(k)) { held.set(k, key); press(key); }
          return true;
        }
        if (e.key.toLowerCase() === 'l') { S.setMode(project.mode === 'song' ? 'pat' : 'song'); return true; }
        if (active === 'playlist') return playlist.key(e);
        return false;
      },
      keyup(e) {
        const k = e.key.toLowerCase(), key = held.get(k);
        if (key === undefined) return;
        held.delete(k);
        lift(key);
      },
      // a fold, Escape or Panic: whatever the keyboard holds lets go (the music itself runs on)
      release() {
        for (const key of held.values()) lift(key);
        held.clear();
        for (const key of [...sounding.keys()]) lift(key);       // MIDI notes whose note-off never came
        engine?.allOff();
        kit.closeMenu();
      },
      resize() {
        const n = narrow();
        if (n !== wasNarrow) {                                   // a phone turned, a window made narrow
          wasNarrow = n;
          mount.classList.toggle('is-narrow', n);
          if (n && browserShown) { browserShown = false; browser.node.hidden = true; toolbar.paint(); }
        }
        mount.classList.toggle('is-short', short());
        windows.relayout(); playlist.resize();
      },
      destroy() { destroyed = true; clearTimeout(saveTimer); clearTimeout(grabTimer); host.store.set('project', saveProject(project)); engine?.destroy(); },
    };

    // ── a WAV of the song or the pattern ──────────────────────────────────────────────────────
    async function exportWav(kind) {
      if (!S.wake()) return;
      if (exporting) { host.toast('A WAV is being made already: it downloads when it is ready.'); return; }
      const song = kind === 'song';
      if (song && !project.playlist.clips.length) { host.toast('The playlist is empty: put some patterns in it first.'); return; }
      if (!song && isEmpty(S.pat())) { host.toast('This pattern is empty.'); return; }
      const sd = engine.stepDur, sr = 48000;
      const loops = Math.max(1, Math.round(64 / (S.pat()?.len || 16)));
      const seconds = (song ? songEnd(project) : (S.pat()?.len || 16) * loops) * sd + 3;
      // the render and the file are both held in memory: a phone takes a shorter song than a computer
      const limit = SMALL_DEVICE ? 8 * 60 : 30 * 60;
      if (seconds > limit) { host.toast(`That song is ${Math.round(seconds / 60)} minutes long: a WAV can be up to ${limit / 60} minutes${SMALL_DEVICE ? ' on this device' : ''}.`, { kind: 'error', timeout: 7000 }); return; }
      exporting = true;
      host.lcd('export', 'RENDERING');
      try {
        const copy = loadProject(JSON.parse(JSON.stringify(saveProject(project))));
        Object.assign(copy, { sync: false, bpm: 60 / (sd * 4), mode: song ? 'song' : 'pat', pattern: project.pattern });
        copy.ui.metronome = false;
        for (const c of copy.channels) c.sample = project.channels.find((x) => x.id === c.id)?.sample || null;
        const off = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
        const eng = createStudioEngine({ ctx: off, out: off.destination, clock: host.clock, project: copy, live: false });
        eng.syncChannels();
        for (const c of copy.channels) { const sl = engine.slices(c); if (sl) eng.setSlices(c, sl.buffer, sl.cuts.length); }
        eng.scheduleAll(0.02, { song, loops });
        const buf = await off.startRendering();
        if (destroyed) return;
        const name = song ? 'Visulaserz Studio - Song' : `Visulaserz Studio - ${S.pat()?.name || 'Pattern'}`;
        const a = el('a', { href: URL.createObjectURL(wav(buf)), download: `${name}.wav` });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        host.lcd('export', 'WAV READY');
      } catch (e) {
        console.error('[studio] export', e);
        host.lcd('export', 'EXPORT FAILED');
        host.toast(`The WAV could not be made: ${e?.message || e}`, { kind: 'error', timeout: 8000 });
      } finally {
        exporting = false;
      }
    }
  },
};

function wav(buf) {
  const ch = 2, n = buf.length, ab = new ArrayBuffer(44 + n * ch * 2), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  return new Blob([ab], { type: 'audio/wav' });
}
