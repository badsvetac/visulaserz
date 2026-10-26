import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The admin desk's API: everything under /api/admin/. It answers only an admin's session (any
// other caller is told the route does not exist), it never returns a password, recovery key,
// session token or the YouTube proxy's address, and every change it makes is written to the log.

const UUID = /^[a-f0-9-]{36}$/;
// A request the desk turns down, with the reason shown as it is; anything else is a server fault.
const refuse = message => Object.assign(new Error(message), { refusal: true });
const SESSION_AGE = 30 * 864e5;
const STORAGE_BUDGET = 20 * 1024 ** 3;          // the import guard's limit in lib/public-host.js
const send = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  res.end(data);
};
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw refuse('That request is too large.');
    chunks.push(chunk);
  }
  const data = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw refuse('Invalid request.');
  return data;
}

// Sizes of everything under a directory (files only, symlinks never followed).
async function du(dir) {
  let bytes = 0, files = 0;
  const walk = async d => {
    for (const entry of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile()) { files++; bytes += (await fsp.stat(p).catch(() => ({ size: 0 }))).size; }
    }
  };
  await walk(dir);
  return { bytes, files };
}
async function readNumber(file) {
  try { const v = (await fsp.readFile(file, 'utf8')).trim(); return /^\d+$/.test(v) ? Number(v) : null; } catch { return null; }
}

export function createAdmin({ publicHost, tools, jobs, cancelJobs, testYoutube, youtubeProxy, productionAssets }) {
  const { store, traffic, database: db, dataRoot } = publicHost;
  const startedAt = Date.now();
  // How late the server's own half-second timer fires: a plain measure of how responsive it is.
  const lags = [];
  let expected = Date.now() + 500;
  const lagTimer = setInterval(() => { const t = Date.now(); lags.push(Math.max(0, t - expected)); if (lags.length > 240) lags.shift(); expected = t + 500; }, 500);
  lagTimer.unref();
  let cpuMark = { usage: process.cpuUsage(), at: process.hrtime.bigint() };
  const limits = new Map();
  const allow = (key, max, ms) => {
    const t = Date.now(), item = limits.get(key);
    if (!item || item.until <= t) { limits.set(key, { n: 1, until: t + ms }); return true; }
    return ++item.n <= max;
  };

  // Walking every member's folder is slow when there is a lot of music: keep it half a minute.
  let storageCache = null;
  async function storage(force = false) {
    if (!force && storageCache && Date.now() - storageCache.at < 30e3) return storageCache.data;
    const usersRoot = path.join(dataRoot, 'cache', 'users');
    const perUser = new Map();
    for (const entry of await fsp.readdir(usersRoot, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !UUID.test(entry.name)) continue;
      const dir = path.join(usersRoot, entry.name);
      let bytes = 0, tracks = 0, audio = 0;
      for (const f of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (!f.isFile()) continue;
        const size = (await fsp.stat(path.join(dir, f.name)).catch(() => ({ size: 0 }))).size;
        bytes += size;
        if (f.name.endsWith('.json')) tracks++;
        if (f.name.endsWith('.mp3')) audio++;
      }
      perUser.set(entry.name, { bytes, tracks, audio });
    }
    const shared = path.join(dataRoot, 'cache', 'shared');
    const [lyrics, magic, all, space] = await Promise.all([du(path.join(shared, 'lyrics')), du(path.join(shared, 'magic')), du(dataRoot), fsp.statfs(dataRoot).catch(() => null)]);
    const dbBytes = (await Promise.all(['', '-wal', '-shm'].map(s => fsp.stat(path.join(dataRoot, `accounts.sqlite${s}`)).then(x => x.size).catch(() => 0)))).reduce((a, b) => a + b, 0);
    const data = {
      used: all.bytes, files: all.files, budget: STORAGE_BUDGET,
      free: space ? space.bavail * space.bsize : null, disk: space ? space.blocks * space.bsize : null,
      database: dbBytes, lyrics, magic, perUser,
      audio: [...perUser.values()].reduce((a, u) => ({ bytes: a.bytes + u.bytes, tracks: a.tracks + u.tracks, audio: a.audio + u.audio }), { bytes: 0, tracks: 0, audio: 0 }),
    };
    storageCache = { at: Date.now(), data };
    return data;
  }

  function members() {
    const t = Date.now();
    const admins = store.adminIds(), suspended = store.suspendedIds(), imports = store.youtubeByUser(7);
    const onlineIds = traffic.onlineMemberIds();
    return db.prepare(`SELECT u.id, u.email, u.name, u.created_at AS created,
        (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires > ?) AS sessions,
        (SELECT max(expires) FROM sessions s WHERE s.user_id = u.id) AS lastExpiry,
        COALESCE((SELECT keep_audio FROM audio_policies a WHERE a.user_id = u.id), 0) AS keepAudio
      FROM users u ORDER BY u.created_at DESC`).all(t).map(u => ({
      id: u.id, email: u.email, name: u.name, created: u.created,
      sessions: u.sessions, lastSignIn: u.lastExpiry ? u.lastExpiry - SESSION_AGE : null,
      keepAudio: !!u.keepAudio, admin: admins.has(u.id), suspended: suspended.has(u.id), online: onlineIds.has(u.id),
      imports7d: imports.get(u.id)?.n || 0,
    }));
  }

  // Per day for the last n days, every kind of YouTube call split into worked and failed.
  function youtubeDays(n = 30) {
    const rows = store.youtubeDays(n), byDay = new Map();
    const t = Date.now();
    for (let i = n - 1; i >= 0; i--) byDay.set(new Date(t - i * 864e5).toISOString().slice(0, 10), { imports: 0, failed: 0, cancelled: 0, searches: 0, searchFailed: 0, recommendations: 0, cache: 0, bytes: 0, ms: 0, timed: 0 });
    for (const r of rows) {
      const d = byDay.get(r.day);
      if (!d) continue;
      if (r.kind === 'import') { if (r.ok) { d.imports += r.n; d.bytes += r.bytes || 0; d.ms += r.ms || 0; d.timed += r.n; } else if (r.cancelled) d.cancelled += r.n; else d.failed += r.n; }
      else if (r.kind === 'search') { if (r.ok) d.searches += r.n; else d.searchFailed += r.n; }
      else if (r.kind === 'recommendations') d.recommendations += r.n;
      else if (r.kind === 'cache') d.cache += r.n;
    }
    return [...byDay].map(([day, d]) => ({ day, ...d, avgMs: d.timed ? Math.round(d.ms / d.timed) : 0 }));
  }

  function youtubeStatus() {
    const t = tools();
    const proxy = youtubeProxy.status();
    return {
      enabled: store.setting('youtubeEnabled'), available: !t.unavailable, reason: t.unavailable,
      ytdlp: t.ytdlp ? { version: t.ytdlp.version, via: t.ytdlp.via, jsRuntimes: !!t.ytdlp.jsRuntimes } : null,
      ffmpeg: t.ffmpeg, proxy: proxy.configured, proxySource: proxy.source,
      dailyLimit: store.setting('youtubeDailyLimit'), downloading: publicHost.downloads(), maxDownloads: 2,
    };
  }

  function system() {
    const now = process.hrtime.bigint(), usage = process.cpuUsage();
    const elapsed = Number(now - cpuMark.at) / 1e3;                       // µs
    const cpu = elapsed > 0 ? ((usage.user - cpuMark.usage.user) + (usage.system - cpuMark.usage.system)) / elapsed : 0;
    cpuMark = { usage, at: now };
    const mem = process.memoryUsage();
    const sorted = [...lags].sort((a, b) => a - b), at = q => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
    const delay = { p50: at(0.5), p99: at(0.99), max: sorted.at(-1) || 0 };
    return { startedAt, uptime: process.uptime(), node: process.version, platform: `${os.type()} ${os.release()}`, cpus: os.cpus().length, load: os.loadavg(), cpu,
      memory: { rss: mem.rss, heap: mem.heapUsed }, loop: delay, build: productionAssets?.build || null };
  }
  async function container() {
    const [limit, current] = await Promise.all([readNumber('/sys/fs/cgroup/memory.max'), readNumber('/sys/fs/cgroup/memory.current')]);
    return { memoryLimit: limit, memoryUsed: current };
  }

  function summary() {
    const days = traffic.daySeries(14), today = days[days.length - 1], yesterday = days[days.length - 2];
    const list = members();
    const week = Date.now() - 7 * 864e5;
    const yt = youtubeDays(7);
    return {
      today, yesterday, week: days.slice(-7).reduce((a, d) => ({ views: a.views + d.views, visitors: a.visitors + d.visitors }), { views: 0, visitors: 0 }),
      days, online: traffic.onlineNow(), since: traffic.since(),
      members: { total: list.length, newThisWeek: list.filter(m => m.created > week).length, keepAudio: list.filter(m => m.keepAudio).length, suspended: list.filter(m => m.suspended).length, latest: list.slice(0, 5) },
      youtube: { ...youtubeStatus(), today: yt[yt.length - 1], week: yt.reduce((a, d) => ({ imports: a.imports + d.imports, failed: a.failed + d.failed, cancelled: a.cancelled + d.cancelled, searches: a.searches + d.searches }), { imports: 0, failed: 0, cancelled: 0, searches: 0 }) },
      settings: store.settings(), log: store.recentLog(6),
    };
  }

  async function memberAction(admin, input) {
    const { id, action } = input;
    if (!UUID.test(String(id || ''))) throw refuse('Unknown member.');
    const target = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(id);
    if (!target) throw refuse('Unknown member.');
    const protectedTarget = store.isAdmin(target.id);
    if (['suspend', 'delete'].includes(action) && (protectedTarget || target.id === admin.id)) throw refuse('Admins cannot be suspended or deleted here. Remove admin rights on the server first.');
    if (action === 'keepAudio') {
      if (typeof input.value !== 'boolean') throw refuse('Say on or off.');
      publicHost.setKeepAudio(target.id, input.value);
      store.log(admin.email, input.value ? 'keep-audio-on' : 'keep-audio-off', target.email);
    } else if (action === 'signOut') {
      await publicHost.revokeUser(target.id);
      store.log(admin.email, 'sign-out', target.email);
    } else if (action === 'suspend') {
      store.suspend(target.id);
      await publicHost.revokeUser(target.id);
      cancelJobs(target.id);
      store.log(admin.email, 'suspend', target.email, typeof input.reason === 'string' ? input.reason.slice(0, 200) : null);
    } else if (action === 'reinstate') {
      store.reinstate(target.id);
      store.log(admin.email, 'reinstate', target.email);
    } else if (action === 'delete') {
      if (String(input.confirm || '').trim().toLowerCase() !== target.email) throw refuse('Type the member’s email exactly to delete the account.');
      await publicHost.revokeUser(target.id);
      cancelJobs(target.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
      // Their track list and any audio kept for them: a folder named by their id, never a path from the request.
      await fsp.rm(path.join(dataRoot, 'cache', 'users', target.id), { recursive: true, force: true });
      storageCache = null;
      store.log(admin.email, 'delete-account', target.email);
    } else throw refuse('Unknown action.');
    return { ok: true, members: members() };
  }

  async function handle(req, res, pathname, url) {
    // An admin's session is not enough: the desk sends its address's key, which no cookie carries.
    if (!publicHost.isAdmin() || !store.isDeskKey(req.headers['x-desk-key'])) return send(res, 404, { error: 'Unknown API route.' });
    const admin = publicHost.user();
    if (!allow(`admin:${admin.id}`, 600, 60e3)) return send(res, 429, { error: 'Slow down a little: too many requests.' });
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 400);
    try {
      if (req.method === 'GET') {
        if (pathname === '/api/admin/overview') return send(res, 200, { ...summary(), storage: await storage().then(s => ({ used: s.used, budget: s.budget, free: s.free, disk: s.disk })) });
        if (pathname === '/api/admin/live') return send(res, 200, { ...traffic.live(), uptime: process.uptime(), jobs: jobs().filter(j => !j.finishedAt).map(j => ({ state: j.state, progress: j.progress })), downloading: publicHost.downloads() });
        if (pathname === '/api/admin/traffic') {
          const kinds = ['page', 'country', 'referrer', 'campaign', 'device', 'browser', 'os', 'language', 'api', 'account', 'status', 'bot', 'crawled'];
          const long = new Set(['page', 'country', 'referrer', 'crawled']);
          return send(res, 200, { days: traffic.daySeries(Math.min(days, 90)), hours: traffic.hourSeries(28 * 24), since: traffic.since(), online: traffic.onlineNow(),
            breakdown: Object.fromEntries(kinds.map(k => [k, traffic.breakdown(k, days, long.has(k) ? 16 : 10)])) });
        }
        if (pathname === '/api/admin/members') {
          const list = members(), files = (await storage()).perUser;
          return send(res, 200, { members: list.map(m => ({ ...m, ...(files.get(m.id) || { bytes: 0, tracks: 0, audio: 0 }) })) });
        }
        if (pathname === '/api/admin/youtube') {
          const byUser = store.youtubeByUser(7), emails = new Map(db.prepare('SELECT id, email FROM users').all().map(u => [u.id, u.email]));
          return send(res, 200, { status: youtubeStatus(), days: youtubeDays(30), reasons: store.youtubeReasons(7), failures: store.youtubeRecentFailures(12),
            jobs: jobs().filter(j => !j.finishedAt).map(j => ({ state: j.state, progress: j.progress })),
            top: [...byUser].map(([id, r]) => ({ email: emails.get(id) || 'deleted account', imports: r.n, bytes: r.bytes || 0 })).sort((a, b) => b.imports - a.imports).slice(0, 8) });
        }
        if (pathname === '/api/admin/storage') {
          const s = await storage(url.searchParams.get('fresh') === '1');
          const emails = new Map(db.prepare('SELECT id, email FROM users').all().map(u => [u.id, u.email]));
          const keep = new Set(db.prepare('SELECT user_id FROM audio_policies WHERE keep_audio = 1').all().map(r => r.user_id));
          return send(res, 200, { ...s, perUser: undefined, members: [...s.perUser].map(([id, u]) => ({ email: emails.get(id) || 'no account (left over)', keepAudio: keep.has(id), ...u })).sort((a, b) => b.bytes - a.bytes).slice(0, 20) });
        }
        if (pathname === '/api/admin/system') return send(res, 200, { ...system(), container: await container(), youtube: youtubeStatus() });
        if (pathname === '/api/admin/settings') return send(res, 200, { settings: store.settings(), youtubeProxy: youtubeProxy.status() });
        if (pathname === '/api/admin/log') return send(res, 200, { log: store.recentLog(Number(url.searchParams.get('limit')) || 200) });
        return send(res, 404, { error: 'Unknown API route.' });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
      const input = await body(req);
      if (pathname === '/api/admin/settings') {
        let changed;
        try { changed = store.update(input.changes, admin.email); } catch (error) { throw refuse(error.message); }
        return send(res, 200, { settings: store.settings(), changed });
      }
      if (pathname === '/api/admin/members/action') return send(res, 200, await memberAction(admin, input));
      // A new address: the old one stops answering at once.
      if (pathname === '/api/admin/desk/new') return send(res, 200, { path: `/desk-${store.newDeskKey(admin.email)}` });
      if (pathname === '/api/admin/youtube/proxy') return send(res, 200, { youtubeProxy: youtubeProxy.update(input, admin.email) });
      if (pathname === '/api/admin/youtube/test') {
        if (!allow('youtube-test', 1, 20e3)) return send(res, 429, { error: 'One test at a time: try again in a few seconds.' });
        const result = await testYoutube();
        store.log(admin.email, 'youtube-test', null, result.ok ? `ok in ${result.ms} ms` : `failed: ${result.reason}`);
        return send(res, 200, result);
      }
      if (pathname === '/api/admin/storage/clear') {
        if (!['lyrics', 'magic'].includes(input.what)) throw refuse('Only the lyrics and recommendation caches can be cleared here.');
        await fsp.rm(path.join(dataRoot, 'cache', 'shared', input.what), { recursive: true, force: true });
        storageCache = null;
        store.log(admin.email, 'clear-cache', input.what);
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Unknown API route.' });
    } catch (error) {
      if (error instanceof SyntaxError) return send(res, 400, { error: 'That request was not valid JSON.' });
      if (error.refusal) return send(res, 400, { error: error.message });
      console.error('Admin request failed:', error.code || error.name, error.message);
      return send(res, 500, { error: 'The admin request could not be completed.' });
    }
  }

  return { handle };
}
