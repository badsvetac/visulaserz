import crypto from 'node:crypto';

// Visitor counting for the admin desk without cookies and without keeping anyone's address, in
// the way Plausible does it: a visitor is a hash of their address and browser, salted with a
// random value that is replaced every day and deleted after it. Someone can be counted once a
// day and never recognised again, not tomorrow and not anywhere else. Only totals are stored.
//
// Requests are counted in memory and written once a minute (and on shutdown), as additions, so a
// restart loses at most a minute and two processes could never overwrite each other's numbers.

const HOUR = 3600e3;
const DAY = 864e5;
const ONLINE_MS = 5 * 60e3;           // a tab that pinged in the last five minutes is open
const BUCKET_MS = 10e3;               // the desk's live strip: ten-second columns...
const BUCKETS = 60;                   // ...ten minutes of them
const BOT = /bot\b|bot\/|crawl|spider|slurp|curl\/|wget|python|httpclient|okhttp|go-http|java\/|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|monitor|uptime|scanner|zgrab|masscan|ahrefs|semrush|petal|yandex|bingpreview/i;

const dayOf = t => new Date(t).toISOString().slice(0, 10);
const hourOf = t => Math.floor(t / HOUR);

// The browser in one word each for device, family and system: enough for a chart, too coarse to
// tell two people apart.
export function classify(ua = '') {
  const s = String(ua);
  if (!s || BOT.test(s)) return { bot: true, device: 'bot', browser: 'bot', os: 'bot' };
  const tablet = /iPad|Tablet|(Android(?!.*Mobile))/i.test(s);
  const mobile = !tablet && /Mobi|iPhone|iPod|Android/i.test(s);
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung' : /Firefox\/|FxiOS/.test(s) ? 'Firefox'
    : /Chrome\/|CriOS/.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Other';
  const os = /Windows/.test(s) ? 'Windows' : /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Android/.test(s) ? 'Android'
    : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : 'Other';
  return { bot: false, device: tablet ? 'Tablet' : mobile ? 'Phone' : 'Desktop', browser, os };
}

// The API's routes folded into the groups the desk shows (heartbeats and polling left out).
function apiGroup(pathname, method) {
  if (pathname === '/api/youtube/load') return 'youtube: import';
  if (pathname === '/api/youtube/search') return 'youtube: search';
  if (pathname.startsWith('/api/magic/')) return 'youtube: recommendations';
  if (pathname === '/api/lyrics') return 'lyrics';
  if (pathname.startsWith('/api/library')) return method === 'DELETE' ? 'library: remove' : 'library';
  if (pathname === '/api/market/access') return 'market scene';
  if (pathname.startsWith('/api/auth/') && pathname !== '/api/auth/me') return 'account: ' + pathname.slice('/api/auth/'.length);
  return null;
}

// Ceilings for what visitors control: every new browser string is a new visitor and every new
// Referer a new row, so a flood of made-up ones must not be able to fill the memory or the disk.
const MAX_VISITORS = 100000;          // visitors tracked a day; past it, views still count
const MAX_ONLINE = 20000;
const MAX_KEYS = 200;                 // distinct keys a day for one breakdown; past it, "Other"

export function createTraffic(db, { hosts = [], now = Date.now, maxVisitors = MAX_VISITORS, maxOnline = MAX_ONLINE, maxKeys = MAX_KEYS } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS traffic_hours (hour INTEGER PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, bots INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS traffic_days (day TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, bots INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0, short INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS traffic_dims (day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, kind, key));
    CREATE TABLE IF NOT EXISTS traffic_seen (day TEXT NOT NULL, hash TEXT NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL, PRIMARY KEY (day, hash));
    CREATE TABLE IF NOT EXISTS traffic_salt (day TEXT PRIMARY KEY, salt TEXT NOT NULL);`);
  const own = new Set(hosts.map(h => h.toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '')));

  let today = '', salt = '';
  const seen = new Map();             // today's visitors: hash -> { first, last, dirty }
  const online = new Map();           // hash -> { last, member }
  const members = new Map();          // member id -> last time any of their tabs was seen
  let hours = new Map();              // hour -> pending additions
  let days = new Map();               // day -> pending additions
  let dims = new Map();               // `${day}\t${kind}\t${key}` -> pending addition
  const hourVisitors = new Map();     // hour -> Set of hashes (for the hour's unique count)
  const buckets = [];                 // [{ t, requests, views, bytes }] for the live strip
  const keysToday = new Map();        // `${kind}` -> Set of keys counted today (for the ceiling)

  // A new day: finish the last one (its visit lengths), forget its visitors, make a new salt.
  function roll(t) {
    const day = dayOf(t);
    if (day === today) return;
    if (today) finishDay(today);
    db.prepare('DELETE FROM traffic_salt WHERE day <> ?').run(day);
    db.prepare('DELETE FROM traffic_seen WHERE day <> ?').run(day);
    db.prepare('DELETE FROM traffic_hours WHERE hour < ?').run(hourOf(t) - 35 * 24);
    db.prepare('DELETE FROM traffic_days WHERE day < ?').run(dayOf(t - 400 * DAY));
    db.prepare('DELETE FROM traffic_dims WHERE day < ?').run(dayOf(t - 400 * DAY));
    today = day;
    salt = db.prepare('SELECT salt FROM traffic_salt WHERE day = ?').get(day)?.salt || '';
    if (!salt) {
      salt = crypto.randomBytes(16).toString('hex');
      db.prepare('INSERT OR REPLACE INTO traffic_salt(day, salt) VALUES(?,?)').run(day, salt);
    }
    seen.clear();
    keysToday.clear();
    for (const row of db.prepare('SELECT hash, first_at, last_at FROM traffic_seen WHERE day = ?').all(day)) seen.set(row.hash, { first: row.first_at, last: row.last_at, dirty: false });
  }
  function finishDay(day) {
    if (day !== today) return;
    let seconds = 0, short = 0;
    for (const v of seen.values()) { const s = Math.round((v.last - v.first) / 1000); seconds += s; if (s < 10) short++; }
    write();
    db.prepare('INSERT INTO traffic_days(day, seconds, short, visitors) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET seconds = excluded.seconds, short = excluded.short, visitors = excluded.visitors')
      .run(day, seconds, short, seen.size);
  }

  const add = (map, key, field, n = 1) => { const row = map.get(key) || {}; row[field] = (row[field] || 0) + n; map.set(key, row); };
  function addDim(day, kind, key, n = 1) {
    if (!key) return;
    key = String(key).slice(0, 80);
    if (day === today) {
      const keys = keysToday.get(kind) || new Set();
      if (!keys.has(key)) { if (keys.size >= maxKeys) key = 'Other'; else keys.add(key); }
      keysToday.set(kind, keys);
    }
    const k = `${day}\t${kind}\t${key}`;
    dims.set(k, (dims.get(k) || 0) + n);
  }
  function bucket(t) {
    const start = Math.floor(t / BUCKET_MS) * BUCKET_MS;
    let last = buckets[buckets.length - 1];
    if (!last || last.t !== start) {
      last = { t: start, requests: 0, views: 0, bytes: 0 };
      buckets.push(last);
      while (buckets.length > BUCKETS) buckets.shift();
    }
    return last;
  }
  const visitor = (ip, ua) => crypto.createHash('sha256').update(`${salt}|${ip}|${ua}`).digest('hex').slice(0, 24);

  function touch(hash, t, member, userId) {
    if (userId) members.set(userId, t);
    const v = seen.get(hash);
    if (v) { v.last = t; v.dirty = true; }
    else if (seen.size < maxVisitors) seen.set(hash, { first: t, last: t, dirty: true });
    if (online.has(hash) || online.size < maxOnline) online.set(hash, { last: t, member: !!member });
  }
  // Tabs that went quiet leave the online lists every minute, whether or not the desk is open.
  function forget(t) {
    for (const [hash, o] of online) if (t - o.last > ONLINE_MS) online.delete(hash);
    for (const [id, last] of members) if (t - last > ONLINE_MS) members.delete(id);
  }

  // One finished request. `view` is set for a page (with `page`, its address), `ping` for the
  // open-tab heartbeat.
  function record({ req, status, bytes = 0, pathname, member = false, userId = null, view = false, page = null, ping = false }) {
    const t = now();
    roll(t);
    const day = today, hour = hourOf(t);
    const ua = String(req.headers['user-agent'] || '');
    const kind = classify(ua);
    if (kind.bot) {
      add(hours, hour, 'bots'); add(days, day, 'bots');
      // which pages the search engines themselves read (scripts and preview bots are not that)
      if (view && page && /Googlebot|bingbot|YandexBot|DuckDuckBot|Applebot|Baiduspider|Yeti|Naver/i.test(ua)) addDim(day, 'crawled', page);
      if (view) addDim(day, 'bot', /Googlebot/.test(ua) ? 'Google' : /bingbot/i.test(ua) ? 'Bing' : /HeadlessChrome/.test(ua) ? 'Headless Chrome' : /curl|wget|python|go-http|okhttp|java/i.test(ua) ? 'Scripts' : 'Other bots');
      return;
    }
    const ip = String(req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || '');
    const hash = visitor(ip, ua);
    if (ping) { if (seen.has(hash) || online.has(hash)) touch(hash, t, member, userId); return; }
    const b = bucket(t);
    b.requests++; b.bytes += bytes;
    add(hours, hour, 'requests'); add(days, day, 'requests');
    add(hours, hour, 'bytes', bytes); add(days, day, 'bytes', bytes);
    if (status >= 500) { add(hours, hour, 'errors'); add(days, day, 'errors'); }
    if (pathname.startsWith('/api/')) {
      const group = apiGroup(pathname, req.method);
      if (group) addDim(day, 'api', group);
      if (status >= 400 && pathname !== '/api/auth/me') addDim(day, 'status', String(status));
      if (pathname === '/api/auth/register' && status === 201) addDim(day, 'account', 'joined');
      if (pathname === '/api/auth/login') addDim(day, 'account', status === 200 ? 'signed in' : status === 401 ? 'wrong password' : `refused (${status})`);
      if (pathname === '/api/auth/recover' && status === 200) addDim(day, 'account', 'recovered');
    }
    if (!view) return;
    b.views++;
    add(hours, hour, 'views'); add(days, day, 'views');
    const set = hourVisitors.get(hour) || new Set();
    if (set.size < maxVisitors) set.add(hash);
    hourVisitors.set(hour, set);
    for (const old of hourVisitors.keys()) if (old < hour - 2) hourVisitors.delete(old);
    touch(hash, t, member, userId);
    if (page) addDim(day, 'page', page);
    const country = String(req.headers['cf-ipcountry'] || '').toUpperCase();
    addDim(day, 'country', /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : country === 'T1' ? 'Tor' : 'Unknown');
    addDim(day, 'device', kind.device); addDim(day, 'browser', kind.browser); addDim(day, 'os', kind.os);
    const lang = /^([a-z]{2,3})\b/i.exec(String(req.headers['accept-language'] || ''))?.[1]?.toLowerCase();
    addDim(day, 'language', lang || 'unknown');
    let referrer = 'Direct';
    try {
      const from = new URL(String(req.headers.referer || ''));
      const host = from.hostname.toLowerCase().replace(/^www\./, '');
      if (own.has(host)) referrer = null;                     // moving around the site itself
      else referrer = /(^|\.)google\./.test(host) ? 'Google' : /(^|\.)bing\.com$/.test(host) ? 'Bing' : /(^|\.)duckduckgo\.com$/.test(host) ? 'DuckDuckGo'
        : /(^|\.)(t\.co|twitter\.com|x\.com)$/.test(host) ? 'X / Twitter' : /(^|\.)(instagram\.com)$/.test(host) ? 'Instagram' : /(^|\.)(youtube\.com|youtu\.be)$/.test(host) ? 'YouTube'
        : /(^|\.)(reddit\.com)$/.test(host) ? 'Reddit' : /(^|\.)(facebook\.com|fb\.com)$/.test(host) ? 'Facebook' : /(^|\.)(tiktok\.com)$/.test(host) ? 'TikTok' : host;
    } catch { /* no referrer: typed in, bookmarked or an app */ }
    if (referrer) addDim(day, 'referrer', referrer);
    try {
      const u = new URL(req.url, 'https://visulaserz.com');
      const source = u.searchParams.get('utm_source') || u.searchParams.get('ref');
      if (source) addDim(day, 'campaign', source.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40));
    } catch { /* not a URL */ }
  }

  // Everything counted since the last write, added to the stored totals in one transaction.
  function write() {
    if (!hours.size && !days.size && !dims.size && ![...seen.values()].some(v => v.dirty)) return;
    const pendingHours = hours, pendingDays = days, pendingDims = dims;
    hours = new Map(); days = new Map(); dims = new Map();
    db.exec('BEGIN IMMEDIATE');
    try {
      const h = db.prepare(`INSERT INTO traffic_hours(hour, views, requests, bytes, errors, bots) VALUES(?,?,?,?,?,?)
        ON CONFLICT(hour) DO UPDATE SET views = views + excluded.views, requests = requests + excluded.requests, bytes = bytes + excluded.bytes, errors = errors + excluded.errors, bots = bots + excluded.bots`);
      for (const [hour, r] of pendingHours) h.run(hour, r.views || 0, r.requests || 0, r.bytes || 0, r.errors || 0, r.bots || 0);
      const hv = db.prepare('UPDATE traffic_hours SET visitors = max(visitors, ?) WHERE hour = ?');
      for (const [hour, set] of hourVisitors) hv.run(set.size, hour);
      const d = db.prepare(`INSERT INTO traffic_days(day, views, requests, bytes, errors, bots) VALUES(?,?,?,?,?,?)
        ON CONFLICT(day) DO UPDATE SET views = views + excluded.views, requests = requests + excluded.requests, bytes = bytes + excluded.bytes, errors = errors + excluded.errors, bots = bots + excluded.bots`);
      for (const [day, r] of pendingDays) d.run(day, r.views || 0, r.requests || 0, r.bytes || 0, r.errors || 0, r.bots || 0);
      const m = db.prepare('INSERT INTO traffic_dims(day, kind, key, n) VALUES(?,?,?,?) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + excluded.n');
      for (const [k, n] of pendingDims) { const [day, kind, key] = k.split('\t'); m.run(day, kind, key, n); }
      const s = db.prepare('INSERT INTO traffic_seen(day, hash, first_at, last_at) VALUES(?,?,?,?) ON CONFLICT(day, hash) DO UPDATE SET last_at = excluded.last_at');
      for (const [hash, v] of seen) if (v.dirty) { s.run(today, hash, v.first, v.last); v.dirty = false; }
      if (today) {
        let seconds = 0, short = 0;
        for (const v of seen.values()) { const sec = Math.round((v.last - v.first) / 1000); seconds += sec; if (sec < 10) short++; }
        db.prepare('INSERT INTO traffic_days(day, visitors, seconds, short) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET visitors = excluded.visitors, seconds = excluded.seconds, short = excluded.short')
          .run(today, seen.size, seconds, short);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      // Put the numbers back so the next write tries again.
      for (const [k, r] of pendingHours) for (const [f, n] of Object.entries(r)) add(hours, k, f, n);
      for (const [k, r] of pendingDays) for (const [f, n] of Object.entries(r)) add(days, k, f, n);
      for (const [k, n] of pendingDims) dims.set(k, (dims.get(k) || 0) + n);
      throw error;
    }
  }
  const flush = () => { try { const t = now(); roll(t); forget(t); write(); } catch (error) { console.error('Traffic not written:', error.code || error.name); } };
  const timer = setInterval(flush, 60e3);
  timer.unref();
  roll(now());

  function onlineNow() {
    const t = now();
    let visitors = 0, members = 0;
    for (const [hash, o] of online) {
      if (t - o.last > ONLINE_MS) { online.delete(hash); continue; }
      visitors++; if (o.member) members++;
    }
    return { visitors, members };
  }
  function onlineMemberIds() {
    const t = now();
    for (const [id, last] of members) if (t - last > ONLINE_MS) members.delete(id);
    return new Set(members.keys());
  }
  function live() {
    const t = now(), first = Math.floor(t / BUCKET_MS) * BUCKET_MS - (BUCKETS - 1) * BUCKET_MS;
    const byStart = new Map(buckets.map(b => [b.t, b]));
    const series = [];
    for (let i = 0; i < BUCKETS; i++) { const s = first + i * BUCKET_MS; const b = byStart.get(s); series.push({ t: s, requests: b?.requests || 0, views: b?.views || 0, bytes: b?.bytes || 0 }); }
    return { ...onlineNow(), bucketSeconds: BUCKET_MS / 1000, series };
  }
  function daySeries(n = 30) {
    flush();
    const t = now(), rows = new Map(db.prepare('SELECT * FROM traffic_days WHERE day >= ?').all(dayOf(t - (n - 1) * DAY)).map(r => [r.day, r]));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const day = dayOf(t - i * DAY), r = rows.get(day) || {};
      out.push({ day, views: r.views || 0, visitors: r.visitors || 0, requests: r.requests || 0, bytes: r.bytes || 0, errors: r.errors || 0, bots: r.bots || 0, seconds: r.seconds || 0, short: r.short || 0 });
    }
    return out;
  }
  function hourSeries(n = 48) {
    flush();
    const top = hourOf(now()), rows = new Map(db.prepare('SELECT * FROM traffic_hours WHERE hour > ?').all(top - n).map(r => [r.hour, r]));
    const out = [];
    for (let h = top - n + 1; h <= top; h++) { const r = rows.get(h) || {}; out.push({ t: h * HOUR, views: r.views || 0, visitors: r.visitors || 0, requests: r.requests || 0, bytes: r.bytes || 0, errors: r.errors || 0, bots: r.bots || 0 }); }
    return out;
  }
  function breakdown(kind, n = 30, limit = 12) {
    flush();
    return db.prepare('SELECT key, sum(n) AS n FROM traffic_dims WHERE kind = ? AND day >= ? GROUP BY key ORDER BY n DESC LIMIT ?').all(kind, dayOf(now() - (n - 1) * DAY), limit);
  }
  const since = () => db.prepare('SELECT min(day) AS day FROM traffic_days').get()?.day || today;

  return { record, flush, live, onlineNow, onlineMemberIds, sizes: () => ({ seen: seen.size, online: online.size, members: members.size }), daySeries, hourSeries, breakdown, since, close: () => { clearInterval(timer); flush(); } };
}
