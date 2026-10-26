import crypto from 'node:crypto';

// The site's own administration, kept in the accounts database beside the members it manages:
// who may run the site, what it is set to, which accounts are suspended, what YouTube has been
// asked to do, and a record of every change made from the admin desk. Admin rights are granted
// only from the server (lib/admin-cli.js), never by a request: there is no email verification,
// so an address alone proves nothing about who owns it.

const DEFAULTS = {
  signupsOpen: true,            // new accounts can be made
  youtubeEnabled: true,         // members can search, import and get recommendations
  youtubeDailyLimit: 0,         // new YouTube downloads per member in 24 hours (0: no limit)
  notice: '',                   // one line every visitor is shown once (empty: none)
  noticeKind: 'info',           // info | warn
};
const VALID = {
  signupsOpen: v => typeof v === 'boolean',
  youtubeEnabled: v => typeof v === 'boolean',
  youtubeDailyLimit: v => Number.isInteger(v) && v >= 0 && v <= 1000,
  notice: v => typeof v === 'string' && v.length <= 240 && !/[\u0000-\u001f]/.test(v),
  noticeKind: v => v === 'info' || v === 'warn',
};
export const SETTING_KEYS = Object.keys(DEFAULTS);
// Own names only: `in` would also accept "constructor", "toString" and the like from Object.
const known = key => Object.hasOwn(DEFAULTS, key);

// What a failed yt-dlp call was, in a word the desk can count; mirrors friendlyError() in server.js.
export function youtubeReason(raw = '') {
  const text = String(raw);
  if (/cancel|selection changed/i.test(text)) return 'cancelled';
  if (/confirm you.?re not a bot/i.test(text)) return 'bot-check';
  if (/private video/i.test(text)) return 'private';
  if (/sign in|age[- ]restricted|confirm your age|inappropriate for some users/i.test(text)) return 'age';
  if (/unavailable|removed|terminated/i.test(text)) return 'unavailable';
  if (/live streams|longer than 4 hours/i.test(text)) return 'too-long';
  if (/403|unable to download|refused/i.test(text)) return 'refused';
  if (/timed? ?out|timeout/i.test(text)) return 'timeout';
  return 'other';
}

export function createAdminStore(db, { now = Date.now } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS admins (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, granted_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS suspended (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, admin TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT);
    CREATE TABLE IF NOT EXISTS yt_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, ok INTEGER NOT NULL, ms INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, user_id TEXT, reason TEXT);
    CREATE INDEX IF NOT EXISTS yt_events_time ON yt_events(at);
    CREATE INDEX IF NOT EXISTS yt_events_user ON yt_events(user_id, at);`);

  // Settings are read on every page load, so they live in memory and are written through.
  const settings = { ...DEFAULTS };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    if (!known(row.key)) continue;
    try { const value = JSON.parse(row.value); if (VALID[row.key](value)) settings[row.key] = value; } catch { /* keep the default */ }
  }
  const noticeId = () => settings.notice ? crypto.createHash('sha256').update(`${settings.noticeKind}|${settings.notice}`).digest('hex').slice(0, 12) : '';

  function log(admin, action, target = null, detail = null) {
    db.prepare('INSERT INTO admin_log(at, admin, action, target, detail) VALUES(?,?,?,?,?)')
      .run(now(), String(admin).slice(0, 254), action, target === null ? null : String(target).slice(0, 254), detail === null ? null : String(detail).slice(0, 500));
  }

  // Validates every change before writing any of them, so a bad field leaves the site as it was.
  function update(changes, admin) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Nothing to change.');
    const entries = Object.entries(changes);
    for (const [key, value] of entries) {
      if (!known(key)) throw new Error(`Unknown setting: ${String(key).slice(0, 40)}`);
      if (!VALID[key](value)) throw new Error(`That value does not fit ${key}.`);
    }
    const changed = entries.filter(([key, value]) => settings[key] !== value);
    if (!changed.length) return [];
    db.exec('BEGIN IMMEDIATE');
    try {
      const write = db.prepare('INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
      for (const [key, value] of changed) write.run(key, JSON.stringify(value), now());
      for (const [key, value] of changed) log(admin, 'setting', key, JSON.stringify(value));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    for (const [key, value] of changed) settings[key] = value;
    return changed.map(([key]) => key);
  }

  // The desk's address: /desk-<key>. The key lives here, never in the code, and the server reads it
  // fresh every time, so a new one from the command line works at once.
  const KEY = /^[a-f0-9]{24}$/;
  const writeKey = key => db.prepare("INSERT INTO settings(key, value, updated_at) VALUES('deskKey', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(JSON.stringify(key), now());
  function deskKey() {
    let key = null;
    try { key = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'deskKey'").get()?.value ?? 'null'); } catch { /* replaced below */ }
    if (!KEY.test(key || '')) { key = crypto.randomBytes(12).toString('hex'); writeKey(key); }
    return key;
  }
  function newDeskKey(admin) {
    const key = crypto.randomBytes(12).toString('hex');
    writeKey(key);
    log(admin, 'new-desk-address');
    return key;
  }
  deskKey();

  const userByEmail = email => db.prepare('SELECT id, email, name, created_at FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());

  // ── YouTube: one row per thing the network was asked to do ─────────────────
  const recordStmt = db.prepare('INSERT INTO yt_events(at, kind, ok, ms, bytes, user_id, reason) VALUES(?,?,?,?,?,?,?)');
  function recordYoutube({ kind, ok, ms = 0, bytes = 0, user = null, reason = null }) {
    try { recordStmt.run(now(), kind, ok ? 1 : 0, Math.max(0, Math.round(ms)), Math.max(0, Math.round(bytes)), user, reason); }
    catch (error) { console.error('YouTube event not recorded:', error.code || error.name); }
  }
  const prune = setInterval(() => {
    db.prepare('DELETE FROM yt_events WHERE at < ?').run(now() - 90 * 864e5);
    db.prepare('DELETE FROM admin_log WHERE id NOT IN (SELECT id FROM admin_log ORDER BY id DESC LIMIT 5000)').run();
  }, 6 * 3600e3);
  prune.unref();

  return {
    settings: () => ({ ...settings }),
    setting: key => settings[key],
    notice: () => settings.notice ? { id: noticeId(), text: settings.notice, kind: settings.noticeKind } : null,
    update,
    log,
    recentLog: (limit = 100) => db.prepare('SELECT id, at, admin, action, target, detail FROM admin_log ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(1, limit | 0), 500)),
    isAdmin: id => !!id && !!db.prepare('SELECT 1 FROM admins WHERE user_id = ?').get(id),
    deskKey, newDeskKey,
    deskPath: () => `/desk-${deskKey()}`,
    isDeskKey(given) {
      if (typeof given !== 'string') return false;
      const a = Buffer.from(given), b = Buffer.from(deskKey());
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },
    adminIds: () => new Set(db.prepare('SELECT user_id FROM admins').all().map(r => r.user_id)),
    isSuspended: id => !!id && !!db.prepare('SELECT 1 FROM suspended WHERE user_id = ?').get(id),
    suspendedIds: () => new Set(db.prepare('SELECT user_id FROM suspended').all().map(r => r.user_id)),
    suspend: id => db.prepare('INSERT OR IGNORE INTO suspended(user_id, at) VALUES(?,?)').run(id, now()).changes > 0,
    reinstate: id => db.prepare('DELETE FROM suspended WHERE user_id = ?').run(id).changes > 0,
    // From the command line only (lib/admin-cli.js).
    grant(email) {
      const user = userByEmail(email);
      if (!user) throw new Error('No account uses that email. Sign up on the site first, then grant it.');
      db.prepare('INSERT OR IGNORE INTO admins(user_id, granted_at) VALUES(?,?)').run(user.id, now());
      log('command line', 'grant-admin', user.email);
      return user;
    },
    revoke(email) {
      const user = userByEmail(email);
      if (!user) throw new Error('No account uses that email.');
      const changed = db.prepare('DELETE FROM admins WHERE user_id = ?').run(user.id).changes > 0;
      if (changed) log('command line', 'revoke-admin', user.email);
      return changed;
    },
    listAdmins: () => db.prepare('SELECT users.email, users.name, admins.granted_at FROM admins JOIN users ON users.id = admins.user_id ORDER BY admins.granted_at').all(),
    recordYoutube,
    // New downloads (not tracks already on the server) one member started in the last 24 hours.
    downloadsToday: id => db.prepare("SELECT count(*) AS n FROM yt_events WHERE user_id = ? AND kind = 'import' AND reason IS NOT 'cancelled' AND at > ?").get(id, now() - 864e5).n,
    youtubeDays(days = 30) {
      const since = now() - days * 864e5;
      return db.prepare(`SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch') AS day, kind, ok, reason IS 'cancelled' AS cancelled, count(*) AS n, sum(ms) AS ms, sum(bytes) AS bytes
        FROM yt_events WHERE at > ? GROUP BY day, kind, ok, cancelled ORDER BY day`).all(since);
    },
    // A member switching tracks mid-download cancels it: that is not YouTube failing, so it is counted apart.
    youtubeReasons: (days = 7) => db.prepare("SELECT reason, kind, count(*) AS n FROM yt_events WHERE ok = 0 AND reason IS NOT 'cancelled' AND at > ? GROUP BY reason, kind ORDER BY n DESC").all(now() - days * 864e5),
    youtubeRecentFailures: (limit = 12) => db.prepare("SELECT at, kind, reason, ms FROM yt_events WHERE ok = 0 AND reason IS NOT 'cancelled' ORDER BY id DESC LIMIT ?").all(limit),
    youtubeByUser: (days = 7) => new Map(db.prepare("SELECT user_id, count(*) AS n, sum(bytes) AS bytes FROM yt_events WHERE kind = 'import' AND ok = 1 AND at > ? GROUP BY user_id").all(now() - days * 864e5).map(r => [r.user_id, r])),
  };
}
