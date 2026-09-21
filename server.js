// Visulaserz local server. Zero dependencies.
//  - serves the app from ./public
//  - serves cached audio from ./cache with HTTP Range support (so <audio> can seek)
//  - bridges to yt-dlp + ffmpeg so YouTube audio becomes a same-origin MP3 the Web Audio API may analyse
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { findLyrics, lyricsQuery, lyricsErrorMessage, norm } from './lib/lyrics.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const CACHE_DIR = path.join(ROOT, 'cache');
const HOST = '127.0.0.1'; // loopback only: this server is never exposed to the network
const PORT = Number(process.env.PORT) || 4777;
const MAX_DURATION_S = 4 * 60 * 60;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const JOB_TTL_MS = 30 * 60 * 1000;
const IS_WIN = process.platform === 'win32';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2',
};

// ───────────────────────────────────────────────────────── helpers

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readJsonBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Reject cross-site callers (DNS rebinding / drive-by requests from other web pages).
function isLocalRequest(req) {
  const allowed = [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`];
  if (!allowed.includes(String(req.headers.host || '').toLowerCase())) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (!allowed.includes(new URL(origin).host.toLowerCase())) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function serveFile(req, res, filePath) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return sendJson(res, 404, { error: 'Not found' });
  }
  if (!stat.isFile()) return sendJson(res, 404, { error: 'Not found' });

  const headers = {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'Last-Modified': stat.mtime.toUTCString(),
  };
  if (stat.size === 0) {
    res.writeHead(200, { ...headers, 'Content-Length': 0 });
    return res.end();
  }

  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] !== '' || m[2] !== '')) {
    if (m[1] === '') {
      start = Math.max(0, stat.size - Number(m[2])); // suffix range: last N bytes
    } else {
      start = Number(m[1]);
      if (m[2] !== '') end = Math.min(end, Number(m[2]));
    }
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function runCapture(cmd, args, { timeoutMs = 25000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true, env: childEnv() });
    } catch {
      return resolve({ code: -1, stdout: '', stderr: '' });
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => killTree(child), timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function childEnv() {
  // Make Python write UTF-8 regardless of the Windows console code page.
  return { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WIN) {
    // yt-dlp.exe is a launcher around python, which in turn runs ffmpeg: kill the whole tree.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
  } else {
    child.kill('SIGTERM');
  }
}

function attachLineReader(stream, onLine) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, i).replace(/\r$/, ''));
      buf = buf.slice(i + 1);
    }
  });
  stream.on('end', () => {
    if (buf) onLine(buf);
  });
}

// ───────────────────────────────────────────────────────── tool detection

const tools = { ready: false, ytdlp: null, ffmpeg: false };

async function detectTools() {
  const bin = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
  const candidates = [
    { cmd: path.join(ROOT, '.venv', IS_WIN ? 'Scripts' : 'bin', bin), args: [], via: 'project .venv', abs: true },
    { cmd: path.join(ROOT, 'bin', bin), args: [], via: 'project bin/', abs: true },
    { cmd: 'yt-dlp', args: [], via: 'PATH' },
    { cmd: IS_WIN ? 'python' : 'python3', args: ['-m', 'yt_dlp'], via: 'python module' },
  ];
  for (const c of candidates) {
    if (c.abs && !fs.existsSync(c.cmd)) continue;
    const r = await runCapture(c.cmd, [...c.args, '--version']);
    if (r.code === 0 && /^\d{4}\.\d+/.test(r.stdout.trim())) {
      const help = await runCapture(c.cmd, [...c.args, '--help']);
      tools.ytdlp = {
        cmd: c.cmd,
        args: c.args,
        via: c.via,
        version: r.stdout.trim(),
        jsRuntimes: help.stdout.includes('--js-runtimes'),
      };
      break;
    }
  }
  tools.ffmpeg = (await runCapture('ffmpeg', ['-version'])).code === 0;
  tools.ready = true;
  if (tools.ytdlp) console.log(`  yt-dlp ${tools.ytdlp.version} (${tools.ytdlp.via})${tools.ffmpeg ? ', ffmpeg ok' : ', ffmpeg MISSING'}`);
  else console.log('  yt-dlp not found: YouTube is disabled until you run "npm run setup"');
}

function youtubeUnavailableReason() {
  if (!tools.ready) return 'The server is still starting. Try again in a moment.';
  if (!tools.ytdlp) return 'YouTube needs yt-dlp. Run "npm run setup" in the project folder, then restart the app.';
  if (!tools.ffmpeg) return 'YouTube needs ffmpeg for MP3 conversion. Install ffmpeg, make sure it is on PATH, then restart the app.';
  return null;
}

// ───────────────────────────────────────────────────────── YouTube

function parseYouTubeId(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') {
    id = u.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

const jobs = new Map(); // jobId -> job
const inflight = new Map(); // videoId -> jobId
const children = new Set();

// Ordered download strategies. YouTube regularly changes which delivery path works without
// extra tokens, so a download-stage failure falls through to the next one.
const FORMAT_STRATEGIES = [
  { name: 'hls', format: 'bestaudio[protocol^=m3u8]/bestaudio/best' },
  { name: 'https', format: 'bestaudio[protocol^=http]/best' },
];

const trackPaths = (id) => ({
  mp3: path.join(CACHE_DIR, `${id}.mp3`),
  jpg: path.join(CACHE_DIR, `${id}.jpg`),
  json: path.join(CACHE_DIR, `${id}.json`),
});

async function readCachedTrack(id) {
  const p = trackPaths(id);
  try {
    const [meta] = await Promise.all([fsp.readFile(p.json, 'utf8').then(JSON.parse), fsp.access(p.mp3)]);
    return meta;
  } catch {
    return null;
  }
}

async function cleanPartials(id) {
  let names = [];
  try {
    names = await fsp.readdir(CACHE_DIR);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((n) => n.startsWith(`${id}.`) && !n.endsWith('.json'))
      .map((n) => fsp.unlink(path.join(CACHE_DIR, n)).catch(() => {})),
  );
}

function friendlyError(raw) {
  const line = (raw.split('\n').reverse().find((l) => l.startsWith('ERROR:')) || raw.split('\n').pop() || '').trim();
  const msg = line.replace(/^ERROR:\s*/, '').replace(/^\[[^\]]+\]\s*[A-Za-z0-9_-]{11}:\s*/, '');
  if (/sign in|confirm you.?re not a bot|age/i.test(msg)) return 'YouTube wants a sign-in for this video, so it cannot be loaded here. Try a different upload of the track.';
  if (/private video/i.test(msg)) return 'This video is private.';
  if (/unavailable|removed|terminated/i.test(msg)) return 'This video is unavailable.';
  if (/403|unable to download/i.test(msg)) return 'YouTube refused the download. Update yt-dlp with "npm run setup" and try again.';
  return msg || 'yt-dlp failed without an error message.';
}

function runDownload(job, strategy) {
  return new Promise((resolve) => {
    const y = tools.ytdlp;
    const args = [
      ...y.args,
      '--no-playlist', '--no-warnings', '--newline', '--progress', '--no-simulate',
      '-f', strategy.format,
      '-x', '--audio-format', 'mp3', '--audio-quality', '192K',
      '--write-thumbnail', '--convert-thumbnails', 'jpg',
      '--match-filters', `!is_live & duration <? ${MAX_DURATION_S}`,
      '--print', 'before_dl:VZMETA %(.{id,title,uploader,channel,duration})j',
      '--progress-template', 'download:VZPROG %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.fragment_index)s %(progress.fragment_count)s',
      '--progress-template', 'postprocess:VZPOST %(progress.postprocessor)s %(progress.status)s',
      '-P', CACHE_DIR, '-o', '%(id)s.%(ext)s',
    ];
    if (y.jsRuntimes) args.push('--js-runtimes', `node:${process.execPath}`);
    args.push('--', `https://www.youtube.com/watch?v=${job.videoId}`);

    const child = spawn(y.cmd, args, { cwd: ROOT, windowsHide: true, env: childEnv() });
    children.add(child);
    const timer = setTimeout(() => killTree(child), JOB_TIMEOUT_MS);
    let errText = '';

    const onLine = (line) => {
      if (line.startsWith('VZMETA ')) {
        try {
          const meta = JSON.parse(line.slice(7));
          job.title = meta.title || job.title;
          job.artist = meta.uploader || meta.channel || '';
          job.duration = Number(meta.duration) || 0;
        } catch { /* keep going without early metadata */ }
        job.state = 'downloading';
      } else if (line.startsWith('VZPROG ')) {
        const [done, total, estimate, fragIndex, fragCount] = line.slice(7).split(' ').map(Number);
        let frac = null;
        if (fragCount > 0) frac = fragIndex / fragCount;
        else if (total > 0) frac = done / total;
        else if (estimate > 0) frac = done / estimate;
        if (frac !== null && Number.isFinite(frac)) job.progress = Math.max(job.progress, Math.min(1, frac));
      } else if (line.startsWith('VZPOST ExtractAudio started')) {
        job.state = 'converting';
        job.progress = 1;
      } else if (line.startsWith('ERROR:')) {
        errText += `${line}\n`;
      }
    };
    attachLineReader(child.stdout, onLine);
    attachLineReader(child.stderr, onLine);

    const finish = (code) => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ code, errText });
    };
    child.on('error', (e) => {
      errText += `ERROR: ${e.message}\n`;
      finish(-1);
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}

async function runJob(job) {
  try {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    let lastErr = '';
    for (const strategy of FORMAT_STRATEGIES) {
      await cleanPartials(job.videoId);
      job.progress = 0;
      job.state = 'starting';
      const { code, errText } = await runDownload(job, strategy);
      const p = trackPaths(job.videoId);
      if (code === 0 && fs.existsSync(p.mp3)) {
        const track = {
          id: job.videoId,
          source: 'youtube',
          title: job.title || job.videoId,
          artist: job.artist || '',
          duration: job.duration || 0,
          url: `/media/${job.videoId}.mp3`,
          thumb: fs.existsSync(p.jpg) ? `/media/${job.videoId}.jpg` : null,
          addedAt: Date.now(),
        };
        await fsp.writeFile(p.json, JSON.stringify(track, null, 2));
        job.track = track;
        job.state = 'done';
        return;
      }
      if (code === 0) {
        // yt-dlp exits 0 when --match-filters skips the video.
        lastErr = 'ERROR: Live streams and videos longer than 4 hours are not supported.';
        break;
      }
      lastErr = errText;
      const downloadStageFailure = /403|unable to download|fragment|requested format/i.test(errText);
      if (!downloadStageFailure) break;
      console.log(`  [${job.videoId}] strategy "${strategy.name}" failed, trying next`);
    }
    await cleanPartials(job.videoId);
    job.state = 'error';
    job.error = friendlyError(lastErr);
  } catch (e) {
    job.state = 'error';
    job.error = e.message;
  } finally {
    inflight.delete(job.videoId);
    job.finishedAt = Date.now();
  }
}

const publicJob = (j) => ({
  id: j.id, videoId: j.videoId, state: j.state, progress: j.progress,
  title: j.title, artist: j.artist, error: j.error, track: j.track,
});

async function handleLoad(req, res) {
  const reason = youtubeUnavailableReason();
  if (reason) return sendJson(res, 503, { error: reason });
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }
  const videoId = parseYouTubeId(body.url);
  if (!videoId) return sendJson(res, 400, { error: 'That does not look like a YouTube video link.' });

  if (inflight.has(videoId)) return sendJson(res, 200, publicJob(jobs.get(inflight.get(videoId))));

  const job = {
    id: crypto.randomUUID(), videoId, state: 'starting', progress: 0,
    title: '', artist: '', duration: 0, error: null, track: null, finishedAt: null,
  };
  jobs.set(job.id, job);
  const cached = await readCachedTrack(videoId);
  if (cached) {
    Object.assign(job, { state: 'done', progress: 1, title: cached.title, artist: cached.artist, track: cached, finishedAt: Date.now() });
  } else {
    inflight.set(videoId, job.id);
    runJob(job);
  }
  sendJson(res, 200, publicJob(job));
}

async function handleSearch(res, query) {
  const reason = youtubeUnavailableReason();
  if (reason) return sendJson(res, 503, { error: reason });
  const q = String(query || '').replace(/[ -]/g, ' ').trim().slice(0, 120);
  if (!q) return sendJson(res, 400, { error: 'Type something to search for.' });
  const y = tools.ytdlp;
  const r = await runCapture(y.cmd, [...y.args, '--flat-playlist', '-J', '--no-warnings', `ytsearch10:${q}`], { timeoutMs: 40000 });
  if (r.code !== 0) return sendJson(res, 502, { error: friendlyError(r.stderr) });
  try {
    const results = (JSON.parse(r.stdout).entries || [])
      .filter((e) => e && /^[A-Za-z0-9_-]{11}$/.test(e.id || '') && e.live_status !== 'is_live')
      .map((e) => ({
        id: e.id,
        title: e.title || e.id,
        artist: e.channel || e.uploader || '',
        duration: Number(e.duration) || 0,
        thumb: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
      }));
    sendJson(res, 200, { results });
  } catch {
    sendJson(res, 502, { error: 'Could not read the search results from yt-dlp.' });
  }
}

async function handleLibrary(res) {
  let names = [];
  try {
    names = await fsp.readdir(CACHE_DIR);
  } catch { /* no cache yet */ }
  const ids = names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
  const tracks = (await Promise.all(ids.map(readCachedTrack))).filter(Boolean);
  tracks.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  sendJson(res, 200, { tracks });
}

async function handleLibraryDelete(res, id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return sendJson(res, 400, { error: 'Bad track id.' });
  if (inflight.has(id)) return sendJson(res, 409, { error: 'That track is still downloading.' });
  await Promise.all(Object.values(trackPaths(id)).map((f) => fsp.unlink(f).catch(() => {})));
  sendJson(res, 200, { ok: true });
}

// ───────────────────────────────────────────────────────── lyrics (LRCLIB)
// The matching lives in lib/lyrics.js, shared with the hosted function; this adds the disk cache.

const LYRICS_DIR = path.join(CACHE_DIR, 'lyrics');

async function handleLyrics(res, params) {
  const rawTitle = params.get('title');
  const rawArtist = params.get('artist');
  const duration = Number(params.get('duration')) || 0;
  const { title, artist } = lyricsQuery(rawTitle, rawArtist);
  if (!title) return sendJson(res, 400, { error: 'No title to search for.' });
  await fsp.mkdir(LYRICS_DIR, { recursive: true });
  const key = crypto.createHash('sha1').update(`${norm(artist)}|${norm(title)}|${Math.round(duration / 5)}`).digest('hex');
  const cacheFile = path.join(LYRICS_DIR, `${key}.json`);
  try {
    return sendJson(res, 200, JSON.parse(await fsp.readFile(cacheFile, 'utf8')));
  } catch { /* not cached yet */ }

  let out;
  try {
    out = await findLyrics(rawTitle, rawArtist, duration);
  } catch (e) {
    return sendJson(res, 502, { error: lyricsErrorMessage(e) });
  }
  const m = out.match;
  console.log(`  [lyrics] "${artist}" – "${title}" (${duration}s) → ${m ? `${out.synced ? 'synced' : out.plain ? 'plain' : 'nothing'}: ${m.artistName} – ${m.trackName} (${m.duration}s)` : 'no match'}`);
  if (out.synced || out.plain) fsp.writeFile(cacheFile, JSON.stringify(out)).catch(() => {});
  sendJson(res, 200, out);
}

// ───────────────────────────────────────────────────────── router

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const p = decodeURIComponent(url.pathname);

    if (p.startsWith('/api/')) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: 'Forbidden' });

      if (p === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          youtube: { available: !youtubeUnavailableReason(), reason: youtubeUnavailableReason(), version: tools.ytdlp?.version ?? null },
        });
      }
      if (p === '/api/youtube/load' && req.method === 'POST') return handleLoad(req, res);
      if (p === '/api/youtube/search' && req.method === 'GET') return handleSearch(res, url.searchParams.get('q'));
      if (p.startsWith('/api/youtube/job/') && req.method === 'GET') {
        const job = jobs.get(p.slice('/api/youtube/job/'.length));
        return job ? sendJson(res, 200, publicJob(job)) : sendJson(res, 404, { error: 'Unknown job.' });
      }
      if (p === '/api/lyrics' && req.method === 'GET') return handleLyrics(res, url.searchParams);
      if (p === '/api/library' && req.method === 'GET') return handleLibrary(res);
      if (p.startsWith('/api/library/') && req.method === 'DELETE') return handleLibraryDelete(res, p.slice('/api/library/'.length));
      return sendJson(res, 404, { error: 'Unknown API route.' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });

    if (p.startsWith('/media/')) {
      const name = p.slice('/media/'.length);
      if (!/^[A-Za-z0-9_-]{11}\.(mp3|jpg)$/.test(name)) return sendJson(res, 404, { error: 'Not found' });
      return serveFile(req, res, path.join(CACHE_DIR, name));
    }

    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC_DIR, rel);
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
    return serveFile(req, res, filePath);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
    else res.destroy();
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
}, 60 * 1000).unref();

function shutdown() {
  for (const child of children) killTree(child);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Close the other app or start with a different port:  PORT=4800 npm start`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  VISULASERZ is running:  http://localhost:${PORT}\n`);
  detectTools();
});
