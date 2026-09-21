// The crate is the queue plus every way of getting music into it: local files, the built-in
// demo, and YouTube through the local server.
let uid = 0;

export const looksLikeYouTube = (s) => /youtu\.?be|^[A-Za-z0-9_-]{11}$/.test(s.trim()) && !/\s/.test(s.trim());

export class Crate extends EventTarget {
  constructor(engine) {
    super();
    this.engine = engine;
    this.tracks = [];
    this.index = -1;
    this.saved = [];
    this.youtube = { available: false, reason: 'Checking the local server…', checked: false };
    this.hosted = false; // the web edition: no YouTube loader, no saved library, files only
    this.job = null;
    this.results = [];
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
      this.youtube = { ...health.youtube, checked: true };
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

  add(track, { play = false } = {}) {
    if (track.source === 'youtube' && this.tracks.some((t) => t.source === 'youtube' && t.id === track.id)) {
      const i = this.tracks.findIndex((t) => t.id === track.id);
      if (play) this.play(i);
      return;
    }
    this.tracks.push(track);
    this.#emit('queue');
    if (play || !this.engine.track) this.play(this.tracks.length - 1);
  }

  addFiles(files) {
    let first = true;
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|oga|opus|flac|m4a|aac|webm)$/i.test(file.name)) continue;
      this.add({
        id: `file-${++uid}`,
        source: 'file',
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: '',
        url: URL.createObjectURL(file),
        thumb: null,
      }, { play: first && !this.engine.playing });
      first = false;
    }
  }

  async play(i) {
    if (i < 0 || i >= this.tracks.length) return;
    this.index = i;
    this.#emit('queue');
    await this.engine.load(this.tracks[i]);
  }

  next() { this.play(this.index + 1 < this.tracks.length ? this.index + 1 : 0); }
  prev() { this.play(this.index > 0 ? this.index - 1 : this.tracks.length - 1); }

  remove(i) {
    const [t] = this.tracks.splice(i, 1);
    if (t?.source === 'file') URL.revokeObjectURL(t.url);
    if (i < this.index) this.index--;
    else if (i === this.index) this.index = Math.min(this.index, this.tracks.length - 1);
    this.#emit('queue');
  }

  onEnded() {
    if (this.tracks.length > 1) this.next();
    else if (this.tracks.length === 1) this.play(0);
  }

  // ── YouTube ──────────────────────────────────────────────────────────────
  async loadYouTube(url, { play = true } = {}) {
    let res;
    try {
      res = await fetch('/api/youtube/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    } catch {
      throw new Error('The local server is not running. Start it with "npm start".');
    }
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

  async search(q) {
    let res;
    try {
      res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
    } catch {
      throw new Error('The local server is not running. Start it with "npm start".');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed.');
    this.results = data.results;
    this.#emit('results');
    return data.results;
  }

  async removeSaved(id) {
    const res = await fetch(`/api/library/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not remove the track.');
    this.refreshSaved();
  }
}
