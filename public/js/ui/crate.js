// The crate is the queue plus every way of getting music into it: local files, the built-in
// demo, and YouTube through the local server.
import { TemporaryPlayback } from '../audio/temporary-playback.js';
let uid = 0;
function requireAccount(response) {
  if (response.status === 401) window.dispatchEvent(new Event('visulaserz:auth-required'));
  return response;
}
const thumbOf = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

export const looksLikeYouTube = (s) => /youtu\.?be|^[A-Za-z0-9_-]{11}$/.test(s.trim()) && !/\s/.test(s.trim());

export class Crate extends EventTarget {
  constructor(engine) {
    super();
    this.engine = engine;
    this.tracks = [];
    this.index = -1;
    this.gap = null; // the playing track was removed from the queue: where it was (Next plays what moved up)
    this.saved = [];
    this.youtube = { available: false, reason: 'Checking the local server…', checked: false };
    this.hosted = false; // the web edition: no YouTube loader, no saved library, files only
    this.job = null;     // the download card on show: the latest of this.jobs
    this.jobs = {};      // hosted downloads by slot (player, ambience, the decks)
    this.results = [];
    this.temporary = null;
    this.orphans = new Set(); // removed local files still playing: their addresses go once let go
    this.skips = 0;           // tracks passed over in a row because they would not play
    this.engine.prepareTrack = (track, slot) => this.prepareTrack(track, slot);
    this.engine.releaseTrack = slot => this.temporary?.clear(slot).catch(() => {});
    // Element events, not animation frames: these keep coming with the screen locked, from the
    // stand-in too (engine.js relays them).
    engine.addEventListener('timeupdate', () => this.#onTime());
    engine.addEventListener('stuck', (e) => this.#onStuck(e.detail || {}));
    engine.addEventListener('playing', () => { this.skips = 0; });
    engine.addEventListener('trackchange', () => this.#releaseOrphans());
    engine.addEventListener('ambiencefile', () => this.#releaseOrphans());
  }

  #emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  async init() {
    if (location.protocol === 'file:') {
      this.youtube = { available: false, reason: 'Start the app with "npm start" and open http://localhost:4777 to use YouTube.', checked: true };
      this.#emit('youtube');
      return;
    }
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`health ${res.status}`);
      const health = await res.json();
      this.hosted = health.mode === 'web';
      this.persistentAudio = !!health.persistentAudio;
      if (health.temporaryAudio && !this.temporary) {
        this.temporary = new TemporaryPlayback({ onExpired: ids => this.#expired(ids), onCleared: slot => this.#setJob(slot, null) });
      }
      this.youtube = { ...health.youtube, checked: true };
      this.notice = health.notice || null;          // a line from the admin desk, if one is up
      if (!this.hosted && !health.youtube.available && !health.youtube.reason) this.youtube.reason = 'YouTube is unavailable.';
      // The server checks for yt-dlp after it starts listening: ask again shortly if it was still starting.
      if (!health.youtube.available && /still starting/i.test(health.youtube.reason || '')) setTimeout(() => this.init(), 1500);
    } catch {
      // No API at all. Away from localhost that is a plain static host, not a stopped local server.
      this.hosted = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
      this.youtube = { available: false, reason: this.hosted ? '' : 'The local server is not running. Start it with "npm start".', checked: true };
    }
    this.#emit('youtube');
    if (!this.hosted) this.refreshSaved();
  }

  async refreshSaved() {
    try {
      const data = await (await fetch('/api/library')).json();
      this.saved = data.tracks || [];
    } catch {
      this.saved = [];
    }
    this.#emit('saved');
  }

  get current() { return this.tracks[this.index] || null; }

  add(track, { play = false, autoStart = true } = {}) {
    if (track.source === 'youtube' && this.tracks.some((t) => t.source === 'youtube' && t.id === track.id)) {
      const i = this.tracks.findIndex((t) => t.id === track.id);
      if (play) return this.play(i);
      return;
    }
    this.tracks.push(track);
    this.#emit('queue');
    if (play || (autoStart && !this.engine.track && !this.engine.decks)) return this.play(this.tracks.length - 1);
    this.#retarget();
  }

  addFiles(files) {
    let first = true;
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|oga|opus|flac|m4a|aac|webm)$/i.test(file.name)) continue;
      this.add({
        id: `file-${++uid}`,
        key: `file:${file.name}|${file.size}`, // the same file on another day (a tap sync is kept under it)
        source: 'file',
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: '',
        url: URL.createObjectURL(file),
        thumb: null,
      }, { play: first && !this.engine.playing, autoStart: first }); // several at once: the first one plays
      first = false;
    }
  }

  async play(i) {
    if (i < 0 || i >= this.tracks.length) return;
    this.index = i;
    this.gap = null;
    const track = this.tracks[i];
    const ready = this.temporary?.ready(track);
    let loading = null;
    if (ready) {
      // Fetched while the last song played: it starts in this very task, before any network wait,
      // which is what lets the queue go on by itself with the phone locked (engine.load).
      Object.assign(track, ready, { thumb: thumbOf(track.id), ready: true });
      loading = this.engine.load(track);
      delete track.ready;
      this.temporary.promote(track.id);
      this.#setJob('player', null);
      this.refreshSaved();
    }
    this.#emit('queue');
    if (!loading) loading = this.engine.load(track);
    this.#retarget();
    try { await loading; }
    catch (error) { if (error.name !== 'AbortError') this.#emit('error', error.message); }
  }

  next() { this.play(this.#after()); }
  prev() { const p = (this.gap ?? this.index) - 1; this.play(p >= 0 ? p : this.tracks.length - 1); }

  remove(i) {
    const [t] = this.tracks.splice(i, 1);
    if (!t) return;
    if (t.source === 'file') this.#revoke(t.url);
    if (this.gap !== null) { if (i < this.gap) this.index = --this.gap - 1; }
    else if (i < this.index) this.index--;
    // The playing track left the queue. It plays on, and Next plays the one that moved into its
    // place (not the one after that); no row shows as playing meanwhile.
    else if (i === this.index) { this.gap = i; this.index = i - 1; }
    this.#emit('queue');
    this.#retarget();
  }

  onEnded() {
    if (this.tracks.length > 1) this.next();
    else if (this.tracks.length === 1) this.play(0);
  }

  // the queue position next() plays
  #after() { const n = this.gap ?? this.index + 1; return n < this.tracks.length ? n : 0; }

  // The YouTube track next() would play, if fetching it ahead is worth a download: not for the song
  // itself repeating, not while the decks or a live input have the floor.
  #upcoming() {
    const e = this.engine;
    if (!this.tracks.length || e.decks || e.live) return null;
    const t = this.tracks[this.#after()];
    return t?.source === 'youtube' && t.id !== e.track?.id ? t : null;
  }

  // Every tick of the playing element. Past the middle of a song and within two minutes of its end,
  // the following YouTube track is fetched ahead (so a skipped song costs no download). Not while a
  // loop holds the song: it never ends (one fetched before the loop stays for when it does).
  #onTime() {
    const tp = this.temporary;
    if (!tp) return;
    tp.beat();
    const e = this.engine, d = e.duration, t = e.currentTime;
    if (!d || e.loop || e.ab || t < Math.max(d - 120, d / 2)) return;
    const next = this.#upcoming();
    if (next && tp.tracks.next !== next.id) tp.prefetch(next);
  }

  // The queue changed: a track fetched ahead that no longer comes next is let go. Its replacement is
  // fetched when the time comes (#onTime).
  #retarget() {
    const held = this.temporary?.tracks.next;
    if (held && held !== this.#upcoming()?.id) this.temporary.clear('next').catch(() => {});
  }

  // The player could not go on (engine.js gave up after its retries). A YouTube track whose server
  // copy went away is fetched again and continues where it stopped; anything else, or a track that
  // fails again straight away, makes way for the next one, but never round and round a queue in
  // which nothing plays.
  #onStuck({ track, at = 0 }) {
    const engine = this.engine;
    if (!track || track !== engine.track || engine.decks || this.reloading) return;
    const again = this.stuck?.id === track.id && Date.now() - this.stuck.at < 60000;
    this.stuck = { id: track.id, at: Date.now() };
    if (track.source === 'youtube' && this.temporary && !again) {
      engine.load(track, { autoplay: engine.playing, at }).catch((error) => {
        if (error.name === 'AbortError') return;
        this.#emit('error', error.message);
        this.#skip();
      });
      return;
    }
    this.#skip();
  }

  #skip() {
    if (this.tracks.length > 1 && this.skips++ < this.tracks.length) this.next();
  }

  // The server let a selection go (a phone asleep for very long, a restart): fetch it again. The song
  // plays on from what the browser already has meanwhile, and the fresh copy takes over at the same
  // moment, so the gap is a reload instead of a whole download.
  #expired(ids) {
    const engine = this.engine, track = engine.track;
    if (track?.source === 'youtube' && ids.includes(track.id) && !engine.decks && !this.reloading) {
      this.reloading = true;
      this.prepareTrack(track, 'player')
        .then(() => {
          if (engine.track !== track) return;
          track.ready = true;
          const loading = engine.load(track, { autoplay: engine.playing, at: engine.currentTime });
          delete track.ready;
          return loading;
        })
        .catch(error => { if (error.name !== 'AbortError') this.#emit('error', error.message); })
        .finally(() => { this.reloading = false; });
    }
    // the scene sound looping a YouTube track
    const file = engine.ambience?.file;
    const id = /^\/media\/([A-Za-z0-9_-]{11})\.mp3$/.exec(file?.url || '')?.[1];
    if (id && ids.includes(id)) {
      const known = [...this.tracks, ...this.saved].find(t => t.source === 'youtube' && t.id === id) || {};
      engine.setAmbienceFile({ ...known, id, source: 'youtube', title: known.title || file.label || id, url: file.url }).catch(() => {});
    }
  }

  // A removed local file's address is given back only once nothing plays it: the player, the scene sound.
  #inUse(url) { return url === this.engine.track?.url || url === this.engine.ambience?.file?.url; }
  #revoke(url) { if (this.#inUse(url)) this.orphans.add(url); else URL.revokeObjectURL(url); }
  #releaseOrphans() {
    for (const url of this.orphans) if (!this.#inUse(url)) { URL.revokeObjectURL(url); this.orphans.delete(url); }
  }

  // Each slot downloads on its own; the card shows the one that started last.
  #setJob(slot, job) {
    if (job) this.jobs[slot] = job;
    else delete this.jobs[slot];
    const shown = Object.values(this.jobs).at(-1) || null;
    if (!shown && !this.job) return;
    this.job = shown;
    this.#emit('job', shown);
  }

  // ── YouTube ──────────────────────────────────────────────────────────────
  async loadYouTube(url, { play = true, metadata = {} } = {}) {
    if (this.temporary) {
      const id = /^[A-Za-z0-9_-]{11}$/.test(url) ? url : (() => {
        try { const u = new URL(url); return u.hostname === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).at(-1); } catch { return null; }
      })();
      if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error('That does not look like a YouTube video link.');
      const known = this.results.find(t => t.id === id) || this.saved.find(t => t.id === id) || metadata;
      const track = { ...known, id, source: 'youtube', title: known.title || id, url: `/media/${id}.mp3`, thumb: thumbOf(id) };
      await this.add(track, { play, autoStart: false });
      return this.tracks.find(t => t.id === id) || track;
    }
    let res;
    try {
      res = await fetch('/api/youtube/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    } catch {
      throw new Error('Could not reach the music server. Please try again.');
    }
    requireAccount(res);
    const job = await res.json();
    if (!res.ok) throw new Error(job.error || 'YouTube request failed.');
    this.job = job;
    this.#emit('job', job);
    if (job.state === 'done') return this.#finishJob(job, play);
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const r = await fetch(`/api/youtube/job/${job.id}`);
          const j = await r.json();
          if (!r.ok) { requireAccount(r); this.job = null; reject(new Error(j.error || 'Please load the track again.')); return; }
          this.job = j;
          this.#emit('job', j);
          if (j.state === 'done') resolve(this.#finishJob(j, play));
          else if (j.state === 'error') { this.job = null; reject(new Error(j.error || 'Download failed.')); }
          else setTimeout(poll, 400);
        } catch {
          setTimeout(poll, 1500);
        }
      };
      setTimeout(poll, 400);
    });
  }

  #finishJob(job, play) {
    this.job = null;
    this.#emit('job', null);
    this.add(job.track, { play });
    this.refreshSaved();
    return job.track;
  }

  async prepareTrack(track, slot = 'player') {
    if (!this.temporary) return track;
    // a local file in this slot now: its download card (if any) goes with the download (clear)
    if (track.source !== 'youtube') { await this.temporary.clear(slot).catch(() => {}); return track; }
    const loaded = await this.temporary.load(track, slot, job => this.#setJob(slot, job));
    Object.assign(track, loaded, { thumb: thumbOf(track.id) });
    this.refreshSaved();
    this.#emit('queue');
    return track;
  }

  async search(q) {
    let res;
    try {
      res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
    } catch {
      throw new Error('Could not reach the music server. Please try again.');
    }
    requireAccount(res);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed.');
    this.results = data.results;
    this.#emit('results');
    return data.results;
  }

  async removeSaved(id) {
    const res = requireAccount(await fetch(`/api/library/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }));
    if (!res.ok) throw new Error((await res.json()).error || 'Could not remove the track.');
    this.refreshSaved();
  }
}
