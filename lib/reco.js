// Magic recommendations: how YouTube's "radio mix" lists become two short lists in the crate.
// Pure functions — no network, no disk — so they can be run from node and reasoned about.
//
// A mix is YouTube's own answer to "what goes with this track". For one track that answer is
// simply cleaned up. For a listening history, the mixes of the listener's strongest recent tracks
// are blended: a song gains from every mix it appears in, more from a seed that was played more,
// more the higher it ranks there — and then the list is spread across artists so it wanders.
import { lyricsQuery, norm } from './lyrics.js';

const RANK_SOFTNESS = 6;            // a mix's 1st pick counts 1, its 7th about half, its 25th a fifth
const SAME_ARTIST_PENALTY = 0.55;   // every further pick by an artist already chosen is worth this much less
const SAME_SEED_PENALTY = 0.8;      // … and so, more gently, is every further pick that one seed is responsible for
const MIN_SECONDS = 60;             // skip stings and intros …
const MAX_SECONDS = 12 * 60;        // … and hour-long compilations

// One key per *song*: "Artist - Title (Official Video)" and "Artist – Title [Lyrics]" are the same thing.
export function songKey(title, artist = '') {
  const q = lyricsQuery(title, artist);
  return norm(`${q.artist} ${q.title}`) || norm(title);
}

export function artistKey(item) {
  return norm(lyricsQuery(item.title, item.artist).artist) || norm(item.artist);
}

// yt-dlp flat-playlist entries → tidy items, without the seed itself, duplicates, live streams or odd lengths.
export function cleanMix(entries, { seedId = '', seedKey = '' } = {}) {
  const seen = new Set(seedKey ? [seedKey] : []);
  const out = [];
  for (const e of entries || []) {
    if (!e || !/^[A-Za-z0-9_-]{11}$/.test(e.id || '') || e.id === seedId || e.live_status === 'is_live') continue;
    const duration = Number(e.duration) || 0;
    if (duration && (duration < MIN_SECONDS || duration > MAX_SECONDS)) continue;
    const title = String(e.title || e.id);
    const artist = String(e.channel || e.uploader || '');
    const key = songKey(title, artist);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: e.id, title, artist, duration, thumb: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`, key });
  }
  return out;
}

// seeds: [{ id, title, weight }] · mixes: Map(seed id → cleaned items)
// exclude: Set of video ids · excludeKeys: Set of song keys the listener already knows
export function rankForYou(seeds, mixes, { exclude = new Set(), excludeKeys = new Set(), limit = 18 } = {}) {
  const top = Math.max(...seeds.map((s) => s.weight), 1e-9);
  const pool = new Map();
  for (const seed of seeds) {
    const w = seed.weight / top;
    (mixes.get(seed.id) || []).forEach((item, rank) => {
      if (exclude.has(item.id) || excludeKeys.has(item.key)) return;
      const gain = w / (1 + rank / RANK_SOFTNESS);
      const c = pool.get(item.key) || { item, score: 0, best: 0, because: seed, votes: 0 };
      c.score += gain;
      c.votes += 1;
      if (gain > c.best) { c.best = gain; c.because = seed; }
      pool.set(item.key, c);
    });
  }

  // Greedy: always the best that is left, but each further pick from one artist — or owed to one
  // seed — is discounted, so the list moves between the listener's moods instead of mining one.
  const left = [...pool.values()];
  const perArtist = new Map();
  const perSeed = new Map();
  const picked = [];
  while (left.length && picked.length < limit) {
    let bestIndex = 0;
    let bestValue = -1;
    left.forEach((c, i) => {
      const value = c.score * SAME_ARTIST_PENALTY ** (perArtist.get(artistKey(c.item)) || 0) * SAME_SEED_PENALTY ** (perSeed.get(c.because.id) || 0);
      if (value > bestValue) { bestValue = value; bestIndex = i; }
    });
    const [c] = left.splice(bestIndex, 1);
    const ak = artistKey(c.item);
    perArtist.set(ak, (perArtist.get(ak) || 0) + 1);
    perSeed.set(c.because.id, (perSeed.get(c.because.id) || 0) + 1);
    picked.push({ ...c.item, score: Number(bestValue.toFixed(3)), votes: c.votes, because: { id: c.because.id, title: c.because.title } });
  }
  return picked;
}
