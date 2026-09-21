// Hosted edition: GET /api/lyrics?title=…&artist=…&duration=… as a serverless function.
// Same matching as the local server; the CDN cache stands in for its disk cache.
import { findLyrics, lyricsErrorMessage } from '../lib/lyrics.js';

const first = (v) => String((Array.isArray(v) ? v[0] : v) ?? '').slice(0, 200);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const duration = Math.min(Math.max(Number(first(req.query.duration)) || 0, 0), 4 * 60 * 60);
  try {
    const out = await findLyrics(first(req.query.title), first(req.query.artist), duration, { budgetMs: 20000 });
    if (!out) return res.status(400).json({ error: 'No title to search for.' });
    // A hit is the same for every visitor: keep it at the edge for a week so LRCLIB is asked
    // once per song. A miss is kept briefly, since the words may be added to LRCLIB later.
    res.setHeader('Cache-Control', out.synced || out.plain ? 'public, s-maxage=604800, stale-while-revalidate=2592000' : 'public, s-maxage=900');
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: lyricsErrorMessage(e) });
  }
}
