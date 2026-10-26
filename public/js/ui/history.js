import { clamp, store } from '../util.js';

const MAX_PLAYS = 500;
const COUNT_AFTER_S = 30;        // a listen counts after half a minute …
const COUNT_AFTER_SHARE = 0.5;   // … or after half of a track shorter than a minute

// ── Taste ────────────────────────────────────────────────────────────────────
// How much one past listen says about what you want to hear today. This one function gives the
// "for you" list its character: make recency decay slower and it remembers last month's phase;
// weigh `share` harder and tracks you skipped stop counting; count late-night plays more…
// It receives one play { at: ms timestamp, share: 0..1 of the track that was heard } and the
// current time, and returns a non-negative number. A track's pull is the sum over its plays.
export function tasteWeight(play, now = Date.now()) {
  const days = Math.max(0, (now - play.at) / 86400000);
  const recency = Math.exp(-days / 10);                              // a listen loses half its say in about a week
  const commitment = 0.4 + 0.6 * clamp(play.share ?? 0.5, 0, 1);     // bailed after 40 s says less than played to the end
  return recency * commitment;
}

// Remembers what was actually listened to (not merely loaded), in this browser only.
export class ListeningHistory extends EventTarget {
  constructor(engine) {
    super();
    this.engine = engine;
    this.plays = store.get('plays', []);
    this.track = null;
    this.current = null;   // the play being written for the loaded track, once it counts
    this.heard = 0;
    this.unsaved = 0;
    engine.addEventListener('trackchange', (e) => this.#begin(e.detail));
    window.addEventListener('pagehide', () => this.#save());
  }

  #begin(track) {
    this.#save();
    this.track = track && track.source !== 'demo' ? track : null;
    this.current = null;
    this.heard = 0;
  }

  #save() {
    this.unsaved = 0;
    store.set('plays', this.plays);
  }

  tick(dt) {
    const { engine, track } = this;
    if (!track || !engine.playing || engine.live || engine.decks) return;
    this.heard += dt;
    const duration = engine.duration || track.duration || 0;
    if (!this.current) {
      if (this.heard < (duration ? Math.min(COUNT_AFTER_S, duration * COUNT_AFTER_SHARE) : COUNT_AFTER_S)) return;
      const yt = track.source === 'youtube';
      this.current = { key: yt ? `yt:${track.id}` : `file:${track.title}`, id: yt ? track.id : '', title: track.title, artist: track.artist || '', at: Date.now(), share: 0 };
      this.plays.push(this.current);
      if (this.plays.length > MAX_PLAYS) this.plays.splice(0, this.plays.length - MAX_PLAYS);
      this.#save();
      this.dispatchEvent(new Event('change'));
    }
    this.current.share = duration ? clamp(this.heard / duration, 0, 1) : 0.5;
    this.unsaved += dt;
    if (this.unsaved > 10) this.#save();
  }

  // The tracks that pull hardest on today's taste, strongest first.
  seeds(n = 5) {
    const now = Date.now();
    const byKey = new Map();
    for (const play of this.plays) {
      const s = byKey.get(play.key) || { id: play.id, title: play.title, artist: play.artist, weight: 0 };
      s.weight += tasteWeight(play, now);
      byKey.set(play.key, s);
    }
    return [...byKey.values()].filter((s) => s.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, n);
  }

  // Everything already heard, most recent first, once each: recommendations should be new.
  played(limit = 600) {
    const seen = new Set();
    const out = [];
    for (let i = this.plays.length - 1; i >= 0 && out.length < limit; i--) {
      const p = this.plays[i];
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      out.push({ id: p.id, title: p.title, artist: p.artist });
    }
    return out;
  }

  forget() {
    this.plays = [];
    this.current = null;
    this.#save();
    this.dispatchEvent(new Event('change'));
  }
}
