// Browser selections keep server audio alive, including while paused. Queue entries do not.
// Besides the slots that sound (player, ambience, the decks) there is 'next': the queue's following
// YouTube track, fetched quietly while the current one plays, so that it can start the moment the
// current one ends, with no download in between (and so with the phone locked too).
const REFUSED_MS = 10 * 60 * 1000;   // a track that could not be fetched ahead is not tried again for this long…
const BUSY_MS = 60 * 1000;           // …or this long when the server was only busy or out of reach

export class TemporaryPlayback {
  constructor({ onExpired = () => {}, onCleared = () => {} } = {}) {
    this.clientId = crypto.randomUUID();
    this.revision = 0;
    this.tracks = {};
    this.versions = {};
    this.tail = Promise.resolve();
    this.closed = false;
    this.sentAt = 0;          // when the server last heard this tab's selection
    this.upcoming = null;     // { id, track } once the 'next' slot's audio is on the server
    this.refused = new Map(); // id -> until when it is not fetched ahead again (it failed)
    this.onExpired = onExpired;
    this.onCleared = onCleared;
    // Timers may sleep in a background page; the player's timeupdate keeps the beat then (beat()).
    this.timer = setInterval(() => this.heartbeat({ due: 20000 }), 30000);
    window.addEventListener('pagehide', () => this.close());
    window.addEventListener('pageshow', event => {
      if (event.persisted) { this.closed = false; this.heartbeat(); }
    });
    window.addEventListener('online', () => this.heartbeat());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.heartbeat(); });
  }

  send(endpoint, extra = {}) {
    this.sentAt = Date.now();
    const body = { clientId: this.clientId, revision: ++this.revision, tracks: { ...this.tracks }, ...extra };
    const request = this.tail.then(async () => {
      if (this.closed) throw new Error('Playback session closed.');
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event('visulaserz:auth-required'));
        throw Object.assign(new Error(data.error || 'Could not update playback.'), { status: response.status, retry: !!data.retry });
      }
      return data;
    });
    this.tail = request.catch(() => {});
    return request;
  }

  // `due`: only if the server has not heard from this tab for that long (the interval, beat()).
  heartbeat({ due = 0 } = {}) {
    if (this.closed || !Object.keys(this.tracks).length || Date.now() - this.sentAt < due) return;
    this.send('/api/playback').then(data => {
      if (!data.missing?.length) return;
      // the track fetched ahead is gone again (a long sleep, a restart): fetch it again when due
      if (data.missing.includes(this.tracks.next)) this.#dropNext();
      this.onExpired(data.missing);
    }).catch(() => {});
  }

  // Called on every timeupdate of the playing element, which a locked phone still delivers.
  beat() { this.heartbeat({ due: 30000 }); }

  async clear(slot) {
    this.versions[slot] = (this.versions[slot] || 0) + 1;
    if (slot === 'next') this.upcoming = null;
    this.onCleared(slot);
    if (!(slot in this.tracks)) return;
    delete this.tracks[slot];
    await this.send('/api/playback');
  }

  async load(track, slot, onJob = () => {}) {
    const version = this.versions[slot] = (this.versions[slot] || 0) + 1;
    this.tracks[slot] = track.id;
    // The player takes the track that was being fetched as 'next' over in this same request, so
    // the server keeps the download (or the file) running instead of cancelling it.
    if (slot === 'player' && this.tracks.next === track.id) this.#dropNext();
    const current = () => !this.closed && this.versions[slot] === version;
    try {
      let job;
      for (let attempt = 1; ; attempt++) {
        try { job = await this.send('/api/youtube/load', { url: track.id, slot }); break; }
        catch (error) {
          // picked again while its previous download is still being stopped: ask again shortly
          if (!error.retry || attempt >= 6 || !current()) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!current()) throw new DOMException('Playback selection changed.', 'AbortError');
        }
      }
      const deadline = Date.now() + 11 * 60 * 1000;
      while (current()) {
        onJob(job);
        if (job.state === 'done') return job.track;
        if (job.state === 'error') throw new Error(job.error || 'Download failed.');
        if (Date.now() > deadline) throw new Error('The download timed out. Please try again.');
        await new Promise(resolve => setTimeout(resolve, 650));
        if (!current()) break;
        const response = await fetch(`/api/youtube/job/${job.id}`, { signal: AbortSignal.timeout(15000) });
        job = await response.json();
        if (!response.ok) throw new Error(job.error || 'Please select the track again.');
      }
      throw new DOMException('Playback selection changed.', 'AbortError');
    } catch (error) {
      if (current()) { onJob(null); await this.clear(slot).catch(() => {}); }
      throw error;
    } finally {
      if (this.versions[slot] === version) onJob(null);
    }
  }

  // Fetch the queue's following track ahead. Quiet: no progress card and no error (a daily limit
  // reached only means that song loads the usual way when its turn comes), and never the player.
  prefetch(track) {
    if (this.closed || this.tracks.next === track.id || Date.now() < (this.refused.get(track.id) || 0)) return;
    this.upcoming = null;
    const fetching = this.load(track, 'next');
    const version = this.versions.next;
    fetching.then(loaded => {
      if (this.versions.next === version) this.upcoming = { id: track.id, track: loaded };
    }, error => {
      if (error.name === 'AbortError') return;
      // A failed download (a private or age-restricted video) or the daily limit would only fail
      // again, and each try counts as a download. Anything else (two imports already running, a
      // restart, a dropped connection) passes, so that one is tried again soon.
      const lasting = error.status === 429 ? /limit/i.test(error.message) : !error.status && !['TypeError', 'TimeoutError', 'SyntaxError'].includes(error.name);
      this.refused.set(track.id, Date.now() + (lasting ? REFUSED_MS : BUSY_MS));
    });
  }

  // The server's track record for a queue entry whose audio is already waiting in 'next'.
  ready(track) {
    return track?.source === 'youtube' && this.upcoming?.id === track.id && this.tracks.next === track.id ? this.upcoming.track : null;
  }

  // The fetched-ahead track has started: its audio moves from 'next' to 'player' in one request,
  // so the file never stands without a holder in between.
  promote(id) {
    this.versions.player = (this.versions.player || 0) + 1;
    this.#dropNext();
    this.tracks.player = id;
    this.heartbeat();
  }

  #dropNext() {
    this.versions.next = (this.versions.next || 0) + 1;
    delete this.tracks.next;
    this.upcoming = null;
  }

  close() {
    this.closed = true;
    const body = JSON.stringify({ clientId: this.clientId, revision: ++this.revision, tracks: {} });
    navigator.sendBeacon('/api/playback', new Blob([body], { type: 'application/json' }));
  }
}
