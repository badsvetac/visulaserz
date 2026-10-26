import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createAdminStore } from './admin-store.js';
import { createTraffic } from './traffic.js';

const scrypt = promisify(crypto.scrypt);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const validPassword = value => typeof value === 'string' && value.length >= 10 && value.length <= 128;
const safeUser = u => u ? { id: u.id, name: u.name, email: u.email } : null;
// What a page of the hosted site may load and do. Scripts only from the site itself (the tools
// build their audio worklets and a timer worker from blob: URLs); styles from the site, inline
// (the Studio injects its skin) and Google Fonts; images from the site, YouTube thumbnails and
// blob:/data: (covers, canvases). No plugins, no framing by others, no foreign form targets.
const CSP = [
  "default-src 'self'", "script-src 'self' blob:", "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://i.ytimg.com", "media-src 'self' blob: data:", "connect-src 'self' blob: data:",
  "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');
const constantEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString('hex')}`;
}
async function passwordMatches(password, saved) {
  const hash = saved || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
  return constantEqual(await passwordHash(String(password || '').slice(0, 128), hash.split(':')[0]), hash);
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new Error('Send a JSON request.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request.');
  return body;
}

export async function createPublicHost({ localCache, dataRoot, allowedHosts = [], protectedAssets = new Set(), adminAssets = new Set(), notFound = null }) {
  const enabled = allowedHosts.length > 0;
  const context = new AsyncLocalStorage();
  const hosts = new Set(allowedHosts.map(h => h.toLowerCase()));
  const limits = new Map();
  let db, store, traffic;
  let downloadCount = 0;
  let requestCount = 0;
  let lyricsCount = 0;
  let authCount = 0;
  let onSessionRevoked = async () => {};
  const cookieName = '__Host-visulaserz_session';
  const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
  if (enabled) {
    fs.mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(path.join(dataRoot, 'accounts.sqlite'));
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audio_policies (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, keep_audio INTEGER NOT NULL DEFAULT 0 CHECK (keep_audio IN (0,1)));
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);`);
    store = createAdminStore(db);
    traffic = createTraffic(db, { hosts: allowedHosts });
    const prune = setInterval(() => {
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
      for (const [key, item] of limits) if (item.until <= Date.now()) limits.delete(key);
    }, 60000);
    prune.unref();
  }
  const owner = () => context.getStore()?.user?.id || 'local';
  // Assigned on the server only; request bodies can never opt into permanent storage.
  const keepsAudio = (id = owner()) => enabled && !!db.prepare('SELECT keep_audio FROM audio_policies WHERE user_id = ?').get(id)?.keep_audio;
  const cacheDir = () => {
    if (!enabled) return localCache;
    const id = context.getStore()?.user?.id;
    if (!id) throw new Error('Sign in to access your music.');
    return path.join(dataRoot, 'cache', 'users', id);
  };
  function rate(key, max, duration = 60000) {
    let item = limits.get(key);
    if (!item || item.until <= Date.now()) {
      if (limits.size >= 10000) return false;
      item = { count: 0, until: Date.now() + duration };
      limits.set(key, item);
    }
    return ++item.count <= max;
  }
  function setSession(res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(sha(token), userId, Date.now() + SESSION_AGE);
    res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_AGE / 1000}`);
  }
  async function revokeSession(token) {
    if (!token) return;
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    await onSessionRevoked(token);
  }
  async function revokeUser(userId) {
    const tokens = db.prepare('SELECT token FROM sessions WHERE user_id = ?').all(userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    for (const { token } of tokens) await onSessionRevoked(token);
  }
  function session(req) {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { user: null, token: null };
    // A suspended account's sessions are revoked when it is suspended; this keeps any that slip through out too.
    const row = db.prepare('SELECT users.*, sessions.expires AS session_expires FROM sessions JOIN users ON users.id = sessions.user_id LEFT JOIN suspended ON suspended.user_id = users.id WHERE sessions.token = ? AND sessions.expires > ? AND suspended.user_id IS NULL').get(sha(token), Date.now());
    if (!row) return { user: null, token: sha(token) };
    const { session_expires: expires, ...user } = row;
    return { user, token: sha(token), cookie: token, expires };
  }
  // Same token, a new expiry: nothing else about the session changes.
  function renewSession(res, current) {
    const expires = Date.now() + SESSION_AGE;
    db.prepare('UPDATE sessions SET expires = ? WHERE token = ?').run(expires, current.token);
    current.expires = expires;
    if (!res.getHeader('Set-Cookie')) res.setHeader('Set-Cookie', `${cookieName}=${current.cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_AGE / 1000}`);
  }
  const isAdminUser = user => !!user && store.isAdmin(user.id);
  async function auth(req, res, pathname, current, ip) {
    if (pathname === '/api/auth/me' && req.method === 'GET') return json(res, 200, { enabled, user: safeUser(current.user) });
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return json(res, 405, { error: 'Method not allowed.' }); }
    if (!rate(`auth:${ip}`, 20, 15 * 60000)) { res.setHeader('Retry-After', '900'); return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }); }
    if (pathname === '/api/auth/logout') {
      await revokeSession(current.token);
      res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
      return json(res, 200, { ok: true });
    }
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Please check the form and try again.' }); }
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
    if (pathname === '/api/auth/register') {
      const name = String(body.name || '').trim().slice(0, 40);
      if (!store.setting('signupsOpen')) return json(res, 403, { error: 'New accounts are paused for now. Please check back soon.' });
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validPassword(body.password)) return json(res, 400, { error: 'Enter your name, a valid email, and a password of 10–128 characters.' });
      if (!rate('registrations', 30, 3600000)) return json(res, 429, { error: 'Registration is busy. Please try again later.' });
      const id = crypto.randomUUID();
      const password = await passwordHash(body.password);
      const recoveryCode = crypto.randomBytes(24).toString('base64url');
      try { db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, email, name, password, sha(recoveryCode), Date.now()); }
      catch (error) {
        if (String(error.message).includes('UNIQUE')) return json(res, 409, { error: 'This email already has an account. Sign in or use your recovery key.' });
        throw error;
      }
      setSession(res, id);
      return json(res, 201, { user: { id, name, email }, recoveryCode });
    }
    if (pathname === '/api/auth/login') {
      if (!rate(`login:${sha(email)}`, 15, 15 * 60000)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      const match = await passwordMatches(body.password, user?.password);
      if (!user || !match) return json(res, 401, { error: 'Email or password is incorrect.' });
      if (store.isSuspended(user.id)) return json(res, 403, { error: 'This account is suspended.' });
      await revokeSession(current.token);
      setSession(res, user.id);
      return json(res, 200, { user: safeUser(user) });
    }
    if (pathname === '/api/auth/password') {
      if (!current.user) return json(res, 401, { error: 'Sign in first.' });
      if (!validPassword(body.newPassword)) return json(res, 400, { error: 'Use a new password of 10–128 characters.' });
      if (!await passwordMatches(body.currentPassword, current.user.password)) return json(res, 400, { error: 'Current password is incorrect.' });
      const password = await passwordHash(body.newPassword);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(password, current.user.id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      await revokeUser(current.user.id);
      setSession(res, current.user.id);
      return json(res, 200, { ok: true });
    }
    if (pathname === '/api/auth/recover') {
      if (!validPassword(body.newPassword)) return json(res, 400, { error: 'Use a new password of 10–128 characters.' });
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      const given = sha(String(body.recoveryCode || '').trim().slice(0, 100));
      if (!constantEqual(given, user?.recovery || '0'.repeat(64)) || !user) return json(res, 400, { error: 'Email or recovery key is incorrect.' });
      if (store.isSuspended(user.id)) return json(res, 403, { error: 'This account is suspended.' });
      const password = await passwordHash(body.newPassword);
      const recoveryCode = crypto.randomBytes(24).toString('base64url');
      // Conditional update makes the old recovery key single-use even for simultaneous requests.
      const changed = db.prepare('UPDATE users SET password = ?, recovery = ? WHERE id = ? AND recovery = ?').run(password, sha(recoveryCode), user.id, given);
      if (!changed.changes) return json(res, 400, { error: 'This recovery key was already used.' });
      await revokeUser(user.id);
      setSession(res, user.id);
      return json(res, 200, { user: safeUser(user), recoveryCode });
    }
    return json(res, 404, { error: 'Not found.' });
  }
  async function wrap(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (!enabled) {
      if (req.url === '/api/auth/me') return json(res, 200, { enabled: false, user: null });
      return next();
    }
    // The hosted site only: HTTPS from now on, the policy above, the devices the app really uses.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), midi=(self), geolocation=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    try {
      const host = String(req.headers.host || '').toLowerCase();
      const healthCheck = ['127.0.0.1:8080', 'localhost:8080'].includes(host) && req.url === '/api/health';
      if (!hosts.has(host) && !healthCheck) return json(res, 421, { error: 'Unknown host.' });
      if (req.url.length > 4096) return json(res, 414, { error: 'URL too long.' });
      // One address per page for search engines: a page opened at www. moves to the bare domain.
      // Only page loads move; the API, the audio and whatever an already open www tab still fetches
      // keep answering there, since its sign-in cookie belongs to that host.
      const navigation = !req.headers['sec-fetch-mode'] || req.headers['sec-fetch-mode'] === 'navigate';
      if (host.startsWith('www.') && hosts.has(host.slice(4)) && ['GET', 'HEAD'].includes(req.method) && navigation && !/^\/(api|media)\//.test(req.url)) {
        res.writeHead(301, { Location: `https://${host.slice(4)}${req.url}`, 'Cache-Control': 'public, max-age=3600' });
        return res.end();
      }
      const url = new URL(req.url, 'https://visulaserz.com');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'Invalid URL.' }); }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p.startsWith('.'))) return json(res, 404, { error: 'Not found.' });
      const canonicalPath = '/' + pathname.split('/').filter(Boolean).join('/');
      const protectedAsset = protectedAssets.has(canonicalPath);
      // Looked up once, and only for a request that carries the cookie.
      let viewer = null;
      const who = () => viewer ??= (req.headers.cookie || '').includes(`${cookieName}=`) ? session(req) : { user: null, token: null };
      // Count the request once it has been answered. The admin desk's own pages, the site's admins
      // and Docker's health check are not traffic.
      // The desk's page answers only at its secret address (lib/admin-store.js); /admin, its old
      // page and any wrong /desk- address are an ordinary missing page, for admins too.
      const deskPage = canonicalPath.startsWith('/desk-') && canonicalPath === store.deskPath();
      const deskFile = canonicalPath !== '/admin/index.html' && (canonicalPath.startsWith('/admin/') || adminAssets.has(canonicalPath));
      const adminPath = canonicalPath === '/admin' || canonicalPath.startsWith('/admin/') || canonicalPath.startsWith('/desk-') || adminAssets.has(canonicalPath) || canonicalPath.startsWith('/api/admin/');
      const ping = canonicalPath === '/api/ping';
      if (!healthCheck && !adminPath) res.on('finish', () => {
        try {
          const { user } = who();
          if (isAdminUser(user)) return;
          // Every page served is a view, counted under its address (/scene/koi; / for the app).
          const view = req.method === 'GET' && res.statusCode === 200 && /^text\/html\b/.test(String(res.getHeader('content-type') || ''));
          const page = view ? (canonicalPath === '/index.html' ? '/' : canonicalPath.replace(/\.html$/, '')) : null;
          traffic.record({ req, status: res.statusCode, bytes: Number(res.getHeader('content-length')) || 0, pathname: canonicalPath, member: !!user, userId: user?.id || null, ping, view, page });
        } catch (error) { console.error('Traffic not counted:', error.code || error.name); }
      });
      // The desk exists only for an admin at its address (its script and style need the admin too):
      // to anyone else, and at any other address, it is an ordinary missing page.
      if (adminPath && !canonicalPath.startsWith('/api/')) {
        const current = who();
        if (!(deskPage || deskFile) || !isAdminUser(current.user)) return notFound ? notFound(req, res) : json(res, 404, { error: 'Not found.' });
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Vary', 'Cookie');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if (deskPage) res.setHeader('Referrer-Policy', 'no-referrer');
        return await context.run({ user: current.user, session: current.token, desk: deskPage }, next);
      }
      if (!pathname.startsWith('/api/') && !pathname.startsWith('/media/') && !protectedAsset) return next();
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Cookie');
      const origin = req.headers.origin;
      if (origin && !allowedHosts.some(h => origin === `https://${h}`)) return json(res, 403, { error: 'Cross-site requests are not allowed.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Cross-site requests are not allowed.' });
      if (!['GET', 'HEAD'].includes(req.method) && !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Send a JSON request.' });
      // An open tab says it is still open once a minute, so the desk can tell who is online.
      if (ping) {
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
        req.resume();
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        return res.end();
      }
      const current = who();
      const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown').slice(0, 64);
      if (pathname.startsWith('/api/auth/')) {
        if (req.method === 'GET') return await auth(req, res, pathname, current, ip);
        if (authCount >= 4) return json(res, 429, { error: 'Sign-in is busy. Please try again shortly.' });
        authCount++;
        try { return await auth(req, res, pathname, current, ip); }
        finally { authCount--; }
      }
      if (pathname !== '/api/health' && pathname !== '/api/lyrics' && !current.user) return json(res, 401, { error: protectedAsset || pathname.startsWith('/api/market/') ? 'Sign in to use this market scene.' : 'Sign in to use YouTube and your saved music.' });
      if ((protectedAsset || pathname.startsWith('/api/market/')) && !rate(`market:${current.user.id}`, 240)) {
        res.setHeader('Retry-After', '60');
        return json(res, 429, { error: 'Too many scene requests. Please try again in a minute.' });
      }
      // Lyrics wait on LRCLIB, not on yt-dlp: they get their own few places, so a slow lyrics
      // service cannot fill the ones YouTube searches and imports need.
      const lyrics = pathname === '/api/lyrics';
      const expensive = !lyrics && /^\/api\/(youtube\/(load|search)|magic\/)/.test(pathname);
      if (expensive || lyrics) {
        if (!rate(`api:${ip}`, 60) || (expensive ? requestCount >= 8 : lyricsCount >= 4)) {
          res.setHeader('Retry-After', '60');
          return json(res, 429, { error: 'The server is busy. Please try again in a minute.' });
        }
        if (expensive) requestCount++; else lyricsCount++;
      }
      // A member who keeps coming back stays signed in: past half its age, the session is renewed.
      // (Only on API answers: the audio's may be kept by the browser, and need no cookie.)
      if (current.user && pathname.startsWith('/api/') && current.expires - Date.now() < SESSION_AGE / 2) renewSession(res, current);
      try { return await context.run({ user: current.user, session: current.token }, next); }
      finally { if (expensive) requestCount--; else if (lyrics) lyricsCount--; }
    } catch (error) {
      console.error('Public request failed:', error.code || error.name);
      if (!res.headersSent && !res.destroyed) return json(res, 500, { error: 'The request could not be completed.' });
      res.destroy();
    }
  }
  async function reserveDownload() {
    if (!enabled) return () => {};
    if (downloadCount >= 2) throw new Error('Two tracks are loading right now. Please try again shortly.');
    downloadCount++;
    try {
      let bytes = 0;
      async function walk(dir) {
        const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(file);
          else if (entry.isFile()) bytes += (await fsp.stat(file).catch(() => ({ size: 0 }))).size;
        }
      }
      await walk(dataRoot);
      const space = await fsp.statfs(dataRoot);
      if (bytes + downloadCount * 768 * 1024 * 1024 > 20 * 1024 ** 3 || space.bavail * space.bsize < 2 * 1024 ** 3) throw new Error('Temporary audio storage is busy. Close an unused playback tab or try again shortly.');
      let released = false;
      return () => { if (!released) { released = true; downloadCount--; } };
    } catch (error) { downloadCount--; throw error; }
  }
  return {
    enabled, wrap, owner, keepsAudio, cacheDir, reserveDownload, key: id => `${owner()}:${id}`,
    sharedCache: enabled ? path.join(dataRoot, 'cache', 'shared') : localCache,
    audioRoot: path.join(dataRoot, 'cache', 'users'),
    session: () => context.getStore()?.session,
    sessionAlive: token => !!db?.prepare('SELECT 1 FROM sessions WHERE token = ? AND expires > ?').get(token, Date.now()),
    onSessionRevoked: fn => { onSessionRevoked = fn; },
    user: () => safeUser(context.getStore()?.user),
    // For the admin desk (lib/admin.js), which only ever runs behind isAdmin().
    isAdmin: () => isAdminUser(context.getStore()?.user),
    deskPage: () => !!context.getStore()?.desk,
    store, traffic, database: db, dataRoot,
    downloads: () => downloadCount,
    revokeUser,
    setKeepAudio: (id, on) => db.prepare('INSERT INTO audio_policies(user_id, keep_audio) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET keep_audio = excluded.keep_audio').run(id, on ? 1 : 0),
    close: () => traffic?.close(),
  };
}
