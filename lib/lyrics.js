// Synced-lyrics lookup on LRCLIB. Shared by the local server (server.js) and the hosted
// function (api/lyrics.js) so both match tracks the same way. Pure: no filesystem, no state.
const LRCLIB = 'https://lrclib.net/api';
const USER_AGENT = 'Visulaserz/1.0 (music visualiser)';
const NOISE = /\b(official|video|audio|lyrics?|lyric video|hd|hq|4k|8k|resmi|klip|ses videosu|visualizer|mv|full|version|feat\.?|ft\.?)\b/gi;

export const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Upload titles are messy: strip bracketed parts, hashtags, upload-speak; split "Artist - Title".
export function lyricsQuery(rawTitle, rawArtist) {
  let title = String(rawTitle || '').replace(/[([{《【「〈][^)\]}》】」〉]*[)\]}》】」〉]/g, ' ').replace(/#\S+/g, ' ').replace(/[|•·]/g, ' - ');
  let artist = String(rawArtist || '').replace(/\s*-\s*topic$/i, '').replace(/\b(vevo|official|records|archive|music|channel)\b/gi, ' ').trim();
  const split = title.split(/\s+[-–—]\s+|:\s+/);
  if (split.length >= 2) {
    artist = split[0].trim();
    title = split.slice(1).join(' ').trim();
  }
  const tidy = (s) => s.replace(NOISE, ' ').replace(/["“”]/g, '').replace(/\s*[.,:;]+\s+/g, ' ').replace(/\s+/g, ' ').trim();
  return { title: tidy(title), artist: tidy(artist) };
}

async function lrclib(pathname, params, retry = true) {
  const url = `${LRCLIB}${pathname}?${new URLSearchParams(params)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: ctrl.signal });
    if ((res.status === 429 || res.status >= 500) && retry) {
      await new Promise((r) => setTimeout(r, 1200)); // rate limited or a hiccup (LRCLIB does answer 503 now and then): one polite retry
      return lrclib(pathname, params, false);
    }
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [data];
  } finally {
    clearTimeout(timer);
  }
}

// Resolves to { query, synced, plain, match }, or null when there is no title to search for.
// Rejects when LRCLIB could not be reached at all (see lyricsErrorMessage). `budgetMs` caps the
// whole search, because a hosted function has a time limit and a visitor has less patience.
export async function findLyrics(rawTitle, rawArtist, duration = 0, { budgetMs = 45000 } = {}) {
  const { title, artist } = lyricsQuery(rawTitle, rawArtist);
  if (!title) return null;

  // Every word we know about the track; a candidate must be mostly made of these.
  const known = new Set(`${norm(title)} ${norm(artist)} ${norm(rawTitle)} ${norm(rawArtist)}`.split(' ').filter((w) => w.length > 1));
  const rank = (candidates) => candidates.map((c) => {
    const words = norm(`${c.trackName} ${c.artistName}`).split(' ').filter((w) => w.length > 1);
    const overlap = words.filter((w) => known.has(w)).length / Math.max(1, words.length);
    const dd = duration && c.duration ? Math.abs(c.duration - duration) : 0;
    const syncedOk = !!c.syncedLyrics && (!duration || dd <= 25);
    const score = (syncedOk ? 100 : 0) + (c.plainLyrics ? 10 : 0) + overlap * 40 - dd * 0.5 + (norm(c.artistName) === norm(artist) ? 15 : 0);
    return { c, score, syncedOk, overlap };
  }).filter((s) => s.overlap >= 0.5 && !(duration && s.c.duration && Math.abs(s.c.duration - duration) > 60)).sort((a, b) => b.score - a.score);

  // Several attempts, from precise to loose; stop at the first that yields a usable match.
  // Uploads often write "Song - Artist", so the swapped order is tried as well.
  const words = title.split(' ');
  const attempts = [];
  if (artist) attempts.push({ track_name: title, artist_name: artist }, { track_name: artist, artist_name: title });
  attempts.push({ q: artist ? `${artist} ${title}` : title });
  if (artist) attempts.push({ q: title }, { q: artist });
  if (words.length > 4) attempts.push({ q: words.slice(0, 4).join(' ') });
  if (words.length > 3) attempts.push({ q: words.slice(0, 3).join(' ') });

  const started = Date.now();
  let best = null;
  let answered = false;
  let lastError = null;
  for (const a of attempts) {
    if (Date.now() - started > budgetMs) break;
    try {
      const scored = rank(await lrclib('/search', a));
      answered = true;
      if (scored.length && (!best || scored[0].score > best.score)) best = scored[0];
      if (best && (best.syncedOk || best.c.plainLyrics)) break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!answered && lastError) throw lastError;

  return {
    query: { title, artist, duration },
    synced: best?.syncedOk ? best.c.syncedLyrics : null,
    plain: best?.c.plainLyrics || null,
    match: best ? { trackName: best.c.trackName, artistName: best.c.artistName, albumName: best.c.albumName, duration: best.c.duration } : null,
  };
}

export const lyricsErrorMessage = (e) => (e?.name === 'AbortError' ? 'The lyrics service took too long to answer.' : 'The lyrics service could not be reached.');
