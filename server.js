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
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { findLyrics, lyricsQuery, lyricsErrorMessage, norm } from './lib/lyrics.js';
import { cleanMix, rankForYou, songKey } from './lib/reco.js';
import { createPublicHost } from './lib/public-host.js';
import { createPlaybackCache, SLOTS } from './lib/playback-cache.js';
import { readProductionAssets } from './lib/production-assets.js';
import { createAdmin } from './lib/admin.js';
import { youtubeReason } from './lib/admin-store.js';
import { createYoutubeProxy } from './lib/youtube-proxy.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : path.join(ROOT, 'public');
const productionAssets = await readProductionAssets(process.env.ASSET_MANIFEST);
const CACHE_DIR = path.join(ROOT, 'cache');
const PUBLIC_HOSTS = (process.env.PUBLIC_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
const publicHost = await createPublicHost({ localCache: CACHE_DIR, dataRoot: process.env.DATA_DIR || path.join(ROOT, 'data'), allowedHosts: PUBLIC_HOSTS, protectedAssets: productionAssets ? new Set(productionAssets.memberScenes.keys()) : new Set(), adminAssets: productionAssets ? productionAssets.adminFiles : new Set(), notFound: (req, res) => sendNotFound(req, res) });
const userCache = () => publicHost.cacheDir();
const youtubeProxy = createYoutubeProxy({ database: publicHost.database, store: publicHost.store });
const HOST = publicHost.enabled ? (process.env.HOST || '127.0.0.1') : '127.0.0.1';
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
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
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

// A missing address: a page for a person's browser (the production build writes one), the same
// short JSON as before for everything else.
const notFoundPage = productionAssets?.allowed.has('/404.html') ? fs.readFileSync(path.join(PUBLIC_DIR, '404.html')) : null;
function sendNotFound(req, res) {
  if (notFoundPage && (req.method === 'GET' || req.method === 'HEAD') && /\btext\/html\b/.test(req.headers.accept || '')) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': notFoundPage.length, 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : notFoundPage);
  }
  return sendJson(res, 404, { error: 'Not found' });
}

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
  // The public middleware validates the host, origin, session and request limits.
  if (publicHost.enabled) return true;
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

// Built bundles, scene cards and share pictures carry a hash of their content in their names: a new
// version is a new address, so a browser may keep these for good.
const HASHED = /^\/assets\/(?:[\w-]+-[A-Z0-9]{8}\.(?:js|css)|(?:(?:scenes|tools)\/)?(?:thumbs|og)\/[\w-]+-[0-9a-f]{12}\.(?:webp|svg|jpg))$/;

async function serveFile(req, res, filePath) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return sendJson(res, 404, { error: 'Not found' });
  }
  if (!stat.isFile()) return sendJson(res, 404, { error: 'Not found' });

  // The validator lets a browser (or Cloudflare) ask "still the same?" and get a 304 instead of the
  // whole file, and lets a player continue a range only from the same file: audio fetched again
  // after its lease ran out is a new file with a new tag.
  const etag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
  const modified = Math.floor(stat.mtimeMs / 1000) * 1000;
  const headers = {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': res.getHeader('Cache-Control') || (productionAssets && HASHED.test(req.url.split('?')[0]) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
  };
  const match = req.headers['if-none-match'];
  const since = Date.parse(req.headers['if-modified-since'] || '');
  if (match ? match.split(',').some(t => t.trim().replace(/^W\//, '') === etag) : since >= modified && since <= Date.now()) {
    res.writeHead(304, { 'Cache-Control': headers['Cache-Control'], 'Last-Modified': headers['Last-Modified'], ETag: etag });
    return res.end();
  }
  if (stat.size === 0) {
    res.writeHead(200, { ...headers, 'Content-Length': 0 });
    return res.end();
  }

  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  // If-Range: the rest of a file the browser already has part of, or the whole file if it changed.
  const ifRange = req.headers['if-range'];
  const sameFile = !ifRange || (ifRange.startsWith('"') ? ifRange === etag : Date.parse(ifRange) === modified);
  if (m && (m[1] !== '' || m[2] !== '') && sameFile) {
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
  // pipeline, not pipe: a player that moves on mid-file (a seek, a skip, the screen-off hand-over)
  // aborts its request, and only pipeline then closes the file again. One that gave up while the
  // file was being looked up is already gone: pipeline would throw for it, so nothing is opened.
  if (res.destroyed) return;
  pipeline(fs.createReadStream(filePath, { start, end }), res, () => {});
}

function runCapture(cmd, args, { timeoutMs = 25000, input } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true, env: childEnv(), detached: !IS_WIN });
      feedInput(child, input);
    } catch {
      return resolve({ code: -1, stdout: '', stderr: '' });
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => killTree(child), timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (d) => { if (stdout.length < 4 * 1024 * 1024) stdout += d; else killTree(child); });
    child.stderr.setEncoding('utf8').on('data', (d) => { if (stderr.length < 256 * 1024) stderr += d; });
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

function feedInput(child, input) {
  child.stdin.on('error', () => {}); // A child may exit before it reads its configuration.
  child.stdin.end(input);
}

function runYoutube(args, options = {}) {
  const config = youtubeProxy.invocation();
  const y = tools.ytdlp;
  return runCapture(y.cmd, [...y.args, ...config.args, ...args], { ...options, input: config.input });
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
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
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

function youtubeToolsReason() {
  if (!tools.ready) return 'The server is still starting. Try again in a moment.';
  if (!tools.ytdlp) return 'YouTube needs yt-dlp. Run "npm run setup" in the project folder, then restart the app.';
  if (!tools.ffmpeg) return 'YouTube needs ffmpeg for MP3 conversion. Install ffmpeg, make sure it is on PATH, then restart the app.';
  return null;
}
function youtubeUnavailableReason() {
  // The admin desk can switch YouTube off for the whole site (lib/admin-store.js).
  if (publicHost.enabled && !publicHost.store.setting('youtubeEnabled')) return 'YouTube is switched off on this site for now. Your track list and local audio files still work.';
  return youtubeToolsReason();
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
const playbackCache = publicHost.enabled ? createPlaybackCache({
  root: publicHost.audioRoot,
  sessionAlive: publicHost.sessionAlive,
  isPersistent: publicHost.keepsAudio,
  isBusy: (owner, id) => inflight.has(`${owner}:${id}`),
  cancel: (owner, id, retained) => {
    for (const job of jobs.values()) {
      if (job.owner !== owner || job.finishedAt || (id ? job.videoId !== id : retained(job.videoId))) continue;
      job.cancelled = true;
      killTree(job.child);
    }
  },
}) : null;
if (playbackCache) {
  publicHost.onSessionRevoked(playbackCache.revoke);
  // A restart has no live playback leases. Remove partial and orphan audio, preserving bookmarks;
  // finished tracks wait one hold period for their tabs to claim them again (lib/playback-cache.js).
  await playbackCache.sweep();
  setInterval(() => playbackCache.sweep().catch(e => console.error('Audio cleanup failed:', e.code || e.name)), 15000).unref();
}

// Ordered download strategies. YouTube regularly changes which delivery path works without
// extra tokens, so a download-stage failure falls through to the next one.
const FORMAT_STRATEGIES = [
  { name: 'hls', format: 'bestaudio[protocol^=m3u8]/bestaudio/best' },
  { name: 'https', format: 'bestaudio[protocol^=http]/best' },
];

const trackPaths = (id) => ({
  mp3: path.join(userCache(), `${id}.mp3`),
  jpg: path.join(userCache(), `${id}.jpg`),
  json: path.join(userCache(), `${id}.json`),
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
    names = await fsp.readdir(userCache());
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((n) => n.startsWith(`${id}.`) && !n.endsWith('.json'))
      .map((n) => fsp.unlink(path.join(userCache(), n)).catch(() => {})),
  );
}

// Members are told what they can do about it; the admin desk's own test is told where to look.
const NOT_ANSWERING = 'YouTube is not answering right now. Please try again in a few minutes. Your track list and local audio files still work.';
function friendlyError(raw, { desk = false } = {}) {
  const line = (raw.split('\n').reverse().find((l) => l.startsWith('ERROR:')) || raw.split('\n').pop() || '').trim();
  const msg = line.replace(/^ERROR:\s*/, '').replace(/^\[[^\]]+\]\s*[A-Za-z0-9_-]{11}:\s*/, '');
  if (/proxy|tunnel connection|407\b/i.test(msg)) return publicHost.enabled && !desk ? NOT_ANSWERING : 'The YouTube proxy connection failed. Check its address, credentials and availability in the admin desk.';
  // Two different walls that both say "sign in", and the advice for them is opposite. The bot
  // check is about this CONNECTION: every video fails until it lifts, so "try another upload"
  // sends the user on a pointless hunt. Age restriction is about this VIDEO, and another upload
  // often works. The bot check has to be tested first because its text contains "sign in" too.
  // (This used to match a bare /age/, which also caught "webpage" and "message" and reported
  // ordinary network errors as sign-in walls.)
  if (/confirm you.?re not a bot/i.test(msg)) return 'YouTube requires a sign-in verification for this connection, so this video could not be imported. Your track list and local audio files are still available.';
  // Private videos say "Sign in if you have been granted access", so they go before the generic
  // sign-in test or they are reported as age-restricted.
  if (/private video/i.test(msg)) return 'This video is private.';
  if (/sign in|age[- ]restricted|confirm your age|inappropriate for some users/i.test(msg)) return 'YouTube requires sign-in or age verification for this video, so it cannot be imported here. Your track list and local audio files are still available.';
  if (/unavailable|removed|terminated/i.test(msg)) return 'This video is unavailable.';
  if (/403|unable to download/i.test(msg)) return publicHost.enabled ? 'YouTube refused this import. Your track list and local audio files are still available.' : 'YouTube refused the download. Update yt-dlp with "npm run setup" and try again.';
  // Upstream diagnostics can contain proxy credentials. Hosted callers and the desk log
  // receive only our fixed messages, even if a proxy fails while its setting is changing.
  if (publicHost.enabled) return desk ? 'The YouTube request failed. Check the saved connection in the admin desk and try again.' : NOT_ANSWERING;
  return msg || 'yt-dlp failed without an error message.';
}

function runDownload(job, strategy) {
  return new Promise((resolve) => {
    const y = tools.ytdlp;
    const config = youtubeProxy.invocation();
    const args = [
      ...y.args, ...config.args,
      '--no-playlist', '--no-warnings', '--newline', '--progress', '--no-simulate',
      '-f', strategy.format,
      '-x', '--audio-format', 'mp3', '--audio-quality', '192K',
      '--write-thumbnail', '--convert-thumbnails', 'jpg',
      '--match-filters', `!is_live & duration <? ${MAX_DURATION_S}`,
      '--print', 'before_dl:VZMETA %(.{id,title,uploader,channel,duration})j',
      '--progress-template', 'download:VZPROG %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.fragment_index)s %(progress.fragment_count)s',
      '--progress-template', 'postprocess:VZPOST %(progress.postprocessor)s %(progress.status)s',
      '-P', userCache(), '-o', '%(id)s.%(ext)s',
    ];
    if (publicHost.enabled) args.push('--ignore-config', '--max-filesize', '256M', '--retries', '3', '--fragment-retries', '3');
    if (y.jsRuntimes) args.push('--js-runtimes', `node:${process.execPath}`);
    args.push('--', `https://www.youtube.com/watch?v=${job.videoId}`);

    const child = spawn(y.cmd, args, { cwd: ROOT, windowsHide: true, env: childEnv(), detached: !IS_WIN });
    feedInput(child, config.input);
    job.child = child;
    children.add(child);
    if (job.cancelled) killTree(child);
    const timer = setTimeout(() => { job.timedOut = true; killTree(child); }, JOB_TIMEOUT_MS);
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
      job.child = null;
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
  const started = Date.now();
  let rawError = '';
  try {
    await fsp.mkdir(userCache(), { recursive: true });
    let lastErr = '';
    for (const strategy of FORMAT_STRATEGIES) {
      if (job.cancelled) throw new Error('Playback selection changed.');
      await cleanPartials(job.videoId);
      if (job.cancelled) throw new Error('Playback selection changed.');
      job.progress = 0;
      job.state = 'starting';
      const { code, errText } = await runDownload(job, strategy);
      if (job.cancelled) throw new Error('Playback selection changed.');
      if (job.timedOut) throw new Error('This import took too long, so it timed out. Please try again in a few minutes.');
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
    rawError = lastErr;
    job.error = friendlyError(lastErr);
  } catch (e) {
    job.state = 'error';
    rawError = e.message;
    job.error = e.message;
  } finally {
    recordImport(job, started, rawError);
    if (job.state === 'error') await cleanPartials(job.videoId);
    inflight.delete(publicHost.key(job.videoId));
    job.release?.();
    job.finishedAt = Date.now();
    if (playbackCache) await playbackCache.prune(job.owner).catch(e => console.error('Audio cleanup failed:', e.code || e.name));
  }
}

// What the admin desk counts about a download: how long it took, how big it was, why it failed.
// Which video a member chose is not recorded.
function recordImport(job, started, rawError) {
  if (!publicHost.store) return;
  let bytes = 0;
  if (job.state === 'done') try { bytes = fs.statSync(trackPaths(job.videoId).mp3).size; } catch { /* already gone */ }
  publicHost.store.recordYoutube({ kind: 'import', ok: job.state === 'done', ms: Date.now() - started, bytes, user: job.owner,
    reason: job.state === 'done' ? null : youtubeReason(job.cancelled ? 'cancelled' : rawError || job.error) });
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

  if (playbackCache && !publicHost.keepsAudio()) {
    if (!SLOTS.has(body.slot) || body.tracks?.[body.slot] !== videoId) return sendJson(res, 400, { error: 'Reload the page to start temporary playback.' });
    try {
      return await playbackCache.update(publicHost.owner(), publicHost.session(), body, () => startLoad(videoId, res));
    } catch (error) { return sendJson(res, 409, { error: error.message }); }
  }
  return startLoad(videoId, res);
}

async function startLoad(videoId, res) {
  const key = publicHost.key(videoId);
  const pending = jobs.get(inflight.get(key));
  // Picked again while its old download is still being stopped (a quick A, B, A): the page asks again
  // in a moment by itself (retry), rather than this waiting inside the selection lock.
  if (pending?.cancelled) return sendJson(res, 409, { error: 'The previous download is stopping. Please try again shortly.', retry: true });
  if (inflight.has(key)) return sendJson(res, 200, publicJob(jobs.get(inflight.get(key))));

  const job = {
    id: crypto.randomUUID(), videoId, state: 'starting', progress: 0,
    title: '', artist: '', duration: 0, error: null, track: null, finishedAt: null,
    owner: publicHost.owner(),
  };
  const cached = await readCachedTrack(videoId);
  if (cached) {
    Object.assign(job, { state: 'done', progress: 1, title: cached.title, artist: cached.artist, track: cached, finishedAt: Date.now() });
    publicHost.store?.recordYoutube({ kind: 'cache', ok: true, user: job.owner });
  } else {
    if (inflight.has(key)) return sendJson(res, 200, publicJob(jobs.get(inflight.get(key))));
    // The desk's daily limit counts every download a member starts, a track loaded again included.
    const limit = publicHost.store?.setting('youtubeDailyLimit');
    if (limit && !publicHost.isAdmin() && publicHost.store.downloadsToday(job.owner) >= limit) return sendJson(res, 429, { error: `You have reached today's limit of ${limit} YouTube downloads. It frees up within 24 hours; your local audio files still play.` });
    try { job.release = await publicHost.reserveDownload(); }
    catch (error) { return sendJson(res, 429, { error: error.message }); }
    // A second request can arrive while checking disk space; never start duplicate writers.
    if (inflight.has(key)) { job.release(); return sendJson(res, 200, publicJob(jobs.get(inflight.get(key)))); }
    inflight.set(key, job.id);
    jobs.set(job.id, job);
    runJob(job);
  }
  jobs.set(job.id, job);
  sendJson(res, 200, publicJob(job));
}

async function handleSearch(res, query) {
  const reason = youtubeUnavailableReason();
  if (reason) return sendJson(res, 503, { error: reason });
  const q = String(query || '').replace(/[ -]/g, ' ').trim().slice(0, 120);
  if (!q) return sendJson(res, 400, { error: 'Type something to search for.' });
  const started = Date.now();
  const r = await runYoutube(['--flat-playlist', '-J', '--no-warnings', `ytsearch10:${q}`], { timeoutMs: 40000 });
  publicHost.store?.recordYoutube({ kind: 'search', ok: r.code === 0, ms: Date.now() - started, user: publicHost.owner(), reason: r.code === 0 ? null : youtubeReason(r.stderr) });
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
    names = await fsp.readdir(userCache());
  } catch { /* no cache yet */ }
  const ids = names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
  const tracks = (await Promise.all(ids.filter(id => /^[A-Za-z0-9_-]{11}$/.test(id)).map(async id => {
    if (!playbackCache) return readCachedTrack(id);
    try {
      const meta = JSON.parse(await fsp.readFile(trackPaths(id).json, 'utf8'));
      return { ...meta, url: `/media/${id}.mp3`, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
    } catch { return null; }
  }))).filter(Boolean);
  tracks.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  sendJson(res, 200, { tracks });
}

async function handleLibraryDelete(res, id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return sendJson(res, 400, { error: 'Bad track id.' });
  if (inflight.has(publicHost.key(id))) return sendJson(res, 409, { error: 'That track is still downloading.' });
  const files = !publicHost.keepsAudio() && playbackCache?.retained(publicHost.owner(), id) ? [trackPaths(id).json] : Object.values(trackPaths(id));
  await Promise.all(files.map((f) => fsp.unlink(f).catch(() => {})));
  sendJson(res, 200, { ok: true });
}

// ───────────────────────────────────────────────────────── magic (recommendations)
// YouTube's own radio mix for a video is the raw material; lib/reco.js turns mixes into lists.
// Only metadata is fetched here — nothing is downloaded until the listener picks a track.

const MAGIC_DIR = path.join(publicHost.sharedCache, 'magic');
const MIX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const mixInflight = new Map(); // videoId -> Promise
let magicRunning = 0;
const magicWaiters = [];

// At most two yt-dlp lookups at a time, however many seeds a request names.
async function withMagicSlot(fn) {
  while (magicRunning >= 2) await new Promise((resolve) => magicWaiters.push(resolve));
  magicRunning++;
  try {
    return await fn();
  } finally {
    magicRunning--;
    magicWaiters.shift()?.();
  }
}

async function readFresh(file, maxAgeMs) {
  try {
    const data = JSON.parse(await fsp.readFile(file, 'utf8'));
    return Date.now() - (data.fetchedAt || 0) < maxAgeMs ? data : null;
  } catch {
    return null;
  }
}

async function ytFlat(target, extra = []) {
  const started = Date.now();
  const r = await withMagicSlot(() => runYoutube(['--flat-playlist', '-J', '--no-warnings', ...extra, target], { timeoutMs: 40000 }));
  publicHost.store?.recordYoutube({ kind: 'recommendations', ok: r.code === 0, ms: Date.now() - started, user: publicHost.owner(), reason: r.code === 0 ? null : youtubeReason(r.stderr) });
  if (r.code !== 0) throw new Error(friendlyError(r.stderr));
  return JSON.parse(r.stdout);
}

// The cleaned radio mix of one video, kept on disk for a week.
function getMix(id) {
  if (mixInflight.has(id)) return mixInflight.get(id);
  const work = (async () => {
    const file = path.join(MAGIC_DIR, `mix-${id}.json`);
    const cached = await readFresh(file, MIX_TTL_MS);
    if (cached) return cached;
    const data = await ytFlat(`https://www.youtube.com/watch?v=${id}&list=RD${id}`, ['--playlist-end', '30']);
    const seed = (data.entries || []).find((e) => e && e.id === id);
    const title = seed?.title || '';
    const mix = { fetchedAt: Date.now(), id, title, items: cleanMix(data.entries, { seedId: id, seedKey: title ? songKey(title, seed.channel || '') : '' }) };
    await fsp.mkdir(MAGIC_DIR, { recursive: true });
    fsp.writeFile(file, JSON.stringify(mix)).catch(() => {});
    return mix;
  })().finally(() => mixInflight.delete(id));
  mixInflight.set(id, work);
  return work;
}

// A seed is a video id. Files from disk only have a name, so that is searched for once and remembered.
async function resolveSeed({ id, title, artist }) {
  if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return { id, title: String(title || '').slice(0, 200) };
  const q = lyricsQuery(title, artist);
  const query = `${q.artist} ${q.title}`.trim().slice(0, 120);
  if (query.length < 3) return null;
  const file = path.join(MAGIC_DIR, `seed-${crypto.createHash('sha1').update(norm(query)).digest('hex')}.json`);
  const cached = await readFresh(file, 90 * 24 * 60 * 60 * 1000);
  if (cached) return cached.id ? { id: cached.id, title: String(title || cached.title) } : null;
  const data = await ytFlat(`ytsearch1:${query}`);
  const hit = (data.entries || []).find((e) => e && /^[A-Za-z0-9_-]{11}$/.test(e.id || ''));
  await fsp.mkdir(MAGIC_DIR, { recursive: true });
  fsp.writeFile(file, JSON.stringify({ fetchedAt: Date.now(), id: hit?.id || null, title: hit?.title || '' })).catch(() => {});
  return hit ? { id: hit.id, title: String(title || hit.title) } : null;
}

async function savedIds() {
  try {
    return new Set((await fsp.readdir(userCache())).filter((n) => n.endsWith('.mp3')).map((n) => n.slice(0, -4)));
  } catch {
    return new Set();
  }
}

// "If you like this one…": the mix of the track that is playing.
async function handleMagicTrack(res, params) {
  const reason = youtubeUnavailableReason();
  if (reason) return sendJson(res, 503, { error: reason });
  try {
    const seed = await resolveSeed({ id: params.get('id'), title: params.get('title'), artist: params.get('artist') });
    if (!seed) return sendJson(res, 200, { seed: null, items: [] });
    const [mix, saved] = await Promise.all([getMix(seed.id), savedIds()]);
    sendJson(res, 200, { seed, items: mix.items.map((it) => ({ ...it, saved: saved.has(it.id) })) });
  } catch (e) {
    sendJson(res, 502, { error: e.message || 'Could not fetch recommendations.' });
  }
}

// "For you": the mixes of the listener's strongest recent tracks, blended.
async function handleMagicForYou(req, res) {
  const reason = youtubeUnavailableReason();
  if (reason) return sendJson(res, 503, { error: reason });
  let body;
  try {
    body = await readJsonBody(req, 256 * 1024);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }
  const wanted = (Array.isArray(body.seeds) ? body.seeds : []).slice(0, 6)
    .map((s) => ({ id: String(s?.id || ''), title: String(s?.title || '').slice(0, 200), artist: String(s?.artist || '').slice(0, 200), weight: Math.max(Number(s?.weight) || 0, 0) }))
    .filter((s) => s.weight > 0 && (s.id || s.title));
  if (!wanted.length) return sendJson(res, 200, { seeds: [], items: [] });
  const played = (Array.isArray(body.played) ? body.played : []).slice(0, 600);
  const exclude = new Set(played.map((t) => String(t?.id || '')).filter(Boolean));
  const excludeKeys = new Set(played.map((t) => songKey(String(t?.title || ''), String(t?.artist || ''))).filter(Boolean));

  const seeds = [];
  const mixes = new Map();
  await Promise.all(wanted.map(async (w) => {
    try {
      const seed = await resolveSeed(w);
      if (!seed) return;
      const mix = await getMix(seed.id);
      exclude.add(seed.id);
      seeds.push({ id: seed.id, title: w.title || seed.title, weight: w.weight });
      mixes.set(seed.id, mix.items);
    } catch { /* one seed failing should not sink the rest */ }
  }));
  if (!seeds.length) return sendJson(res, 502, { error: 'YouTube did not answer. Try again in a moment.' });
  const saved = await savedIds();
  const items = rankForYou(seeds, mixes, { exclude, excludeKeys, limit: 18 }).map((it) => ({ ...it, saved: saved.has(it.id) }));
  sendJson(res, 200, { seeds: seeds.map(({ id, title }) => ({ id, title })), items });
}

// ───────────────────────────────────────────────────────── lyrics (LRCLIB)
// The matching lives in lib/lyrics.js, shared with the hosted function; this adds the disk cache.

const LYRICS_DIR = path.join(publicHost.sharedCache, 'lyrics');
const LYRICS_MISS_MS = 24 * 60 * 60 * 1000;

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
    const cached = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    // A miss is remembered for a day (the words may reach LRCLIB later); a hit for good.
    if (cached.synced || cached.plain || Date.now() - (cached.fetchedAt || 0) < LYRICS_MISS_MS) return sendJson(res, 200, cached);
  } catch { /* not cached yet */ }

  let out;
  try {
    out = await findLyrics(rawTitle, rawArtist, duration);
  } catch (e) {
    return sendJson(res, 502, { error: lyricsErrorMessage(e) });
  }
  const m = out.match;
  console.log(`  [lyrics] "${artist}" – "${title}" (${duration}s) → ${m ? `${out.synced ? 'synced' : out.plain ? 'plain' : 'nothing'}: ${m.artistName} – ${m.trackName} (${m.duration}s)` : 'no match'}`);
  fsp.writeFile(cacheFile, JSON.stringify(out.synced || out.plain ? out : { ...out, fetchedAt: Date.now() })).catch(() => {});
  sendJson(res, 200, out);
}

// ───────────────────────────────────────────────────────── admin desk
// /admin and /api/admin/: only for accounts granted admin rights on the server (lib/admin-cli.js).

const admin = publicHost.enabled ? createAdmin({
  publicHost,
  productionAssets,
  youtubeProxy,
  tools: () => ({ ytdlp: tools.ytdlp, ffmpeg: tools.ffmpeg, unavailable: youtubeUnavailableReason() }),
  jobs: () => [...jobs.values()],
  cancelJobs: owner => {
    for (const job of jobs.values()) if (job.owner === owner && !job.finishedAt) { job.cancelled = true; killTree(job.child); }
  },
  // One search through the same yt-dlp and proxy members use: does YouTube answer this server?
  async testYoutube() {
    const reason = youtubeToolsReason();
    if (reason) return { ok: false, ms: 0, reason };
    const started = Date.now();
    const r = await runYoutube(['--flat-playlist', '-J', '--no-warnings', 'ytsearch1:Big Buck Bunny Blender'], { timeoutMs: 40000 });
    const ms = Date.now() - started;
    const ok = r.code === 0 && r.stdout.includes('"entries"');
    publicHost.store.recordYoutube({ kind: 'test', ok, ms, reason: ok ? null : youtubeReason(r.stderr) });
    return ok ? { ok, ms } : { ok, ms, reason: friendlyError(r.stderr || 'yt-dlp returned nothing.', { desk: true }) };
  },
}) : null;

// ───────────────────────────────────────────────────────── router

const server = http.createServer((req, res) => publicHost.wrap(req, res, async () => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const p = decodeURIComponent(url.pathname);

    if (p.startsWith('/api/')) {
      if (!isLocalRequest(req)) return sendJson(res, 403, { error: 'Forbidden' });

      if (p === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          accounts: publicHost.enabled,
          temporaryAudio: !!playbackCache && !publicHost.keepsAudio(),
          persistentAudio: publicHost.keepsAudio(),
          youtube: { available: !youtubeUnavailableReason(), reason: youtubeUnavailableReason(), version: tools.ytdlp?.version ?? null },
          notice: publicHost.store?.notice() ?? null,
        });
      }
      if (p === '/api/market/access' && req.method === 'GET') {
        const id = url.searchParams.get('id');
        if (!productionAssets?.memberIds.has(id)) return sendJson(res, 404, { error: 'Unknown market scene.' });
        if (!publicHost.user()) return sendJson(res, 401, { error: 'Sign in to use this market scene.' });
        return sendJson(res, 200, { allowed: true });
      }
      if (p === '/api/playback' && req.method === 'POST') {
        if (!playbackCache || publicHost.keepsAudio()) return sendJson(res, 200, { ok: true });
        try {
          const body = await readJsonBody(req);
          await playbackCache.update(publicHost.owner(), publicHost.session(), body);
          const missing = [];
          for (const id of new Set(Object.values(body.tracks))) {
            if (!inflight.has(publicHost.key(id)) && !fs.existsSync(trackPaths(id).mp3)) missing.push(id);
          }
          return sendJson(res, 200, { ok: true, missing });
        } catch (error) { return sendJson(res, 409, { error: error.message }); }
      }
      if (p === '/api/youtube/load' && req.method === 'POST') return handleLoad(req, res);
      if (p === '/api/youtube/search' && req.method === 'GET') return handleSearch(res, url.searchParams.get('q'));
      if (p.startsWith('/api/youtube/job/') && req.method === 'GET') {
        const job = jobs.get(p.slice('/api/youtube/job/'.length));
        return job && job.owner === publicHost.owner() ? sendJson(res, 200, publicJob(job)) : sendJson(res, 404, { error: 'Unknown job.' });
      }
      if (p === '/api/lyrics' && req.method === 'GET') return handleLyrics(res, url.searchParams);
      if (p === '/api/magic/track' && req.method === 'GET') return handleMagicTrack(res, url.searchParams);
      if (p === '/api/magic/foryou' && req.method === 'POST') return handleMagicForYou(req, res);
      if (p.startsWith('/api/admin/')) return admin ? admin.handle(req, res, p, url) : sendJson(res, 404, { error: 'Unknown API route.' });
      if (p === '/api/library' && req.method === 'GET') return handleLibrary(res);
      if (p.startsWith('/api/library/') && req.method === 'DELETE') return handleLibraryDelete(res, p.slice('/api/library/'.length));
      return sendJson(res, 404, { error: 'Unknown API route.' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });

    if (p.startsWith('/media/')) {
      const name = p.slice('/media/'.length);
      if (!/^[A-Za-z0-9_-]{11}\.(mp3|jpg)$/.test(name)) return sendJson(res, 404, { error: 'Not found' });
      if (playbackCache) {
        const owner = publicHost.owner(), id = name.slice(0, 11);
        if (!playbackCache.retained(owner, id)) return sendJson(res, 404, { error: 'Select the track again to load its audio.' });
        playbackCache.touch(owner, id);
        // The audio behind an id stays the same while it is held, so the screen-off stand-in and a
        // seek back can use what this browser already fetched (private: never a shared cache).
        res.setHeader('Cache-Control', 'private, max-age=900');
      }
      return serveFile(req, res, path.join(userCache(), name));
    }

    // The site's pages answer at one address each, without .html and without a trailing slash;
    // the other spellings are moved there.
    if (productionAssets?.pages.size && p !== '/') {
      const page = p.replace(/\/+$/, '').replace(/\.html$/, '');
      if (productionAssets.pages.has(page) && page !== p) {
        res.writeHead(301, { Location: page + url.search, 'Cache-Control': 'public, max-age=3600' });
        return res.end();
      }
    }
    const rel = p === '/' ? 'index.html' : publicHost.deskPage?.() ? 'admin/index.html' : productionAssets?.pages.has(p) ? `${p.slice(1)}.html` : p.replace(/^\/+/, '');
    const filePath = path.resolve(PUBLIC_DIR, rel);
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
    const route = '/' + path.relative(PUBLIC_DIR, filePath).split(path.sep).join('/');
    if (productionAssets) {
      if (!productionAssets.allowed.has(route) || route === '/404.html') return sendNotFound(req, res);
      if (productionAssets.memberScenes.has(route)) {
        if (!publicHost.user()) return sendJson(res, 401, { error: 'Sign in to use this market scene.' });
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Vary', 'Cookie');
      }
    }
    return serveFile(req, res, filePath);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
    else res.destroy();
  }
}));
server.headersTimeout = 15000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;
server.maxConnections = 256;

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
}, 60 * 1000).unref();

function shutdown() {
  for (const child of children) killTree(child);
  publicHost.close?.();                      // the last minute of traffic numbers
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
