import fs from 'node:fs';

const KEY = 'youtubeProxy';
const SCHEMES = new Set(['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:']);
const refuse = message => Object.assign(new Error(message), { refusal: true });

export function validateProxyUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw refuse('Enter a proxy URL of at most 4096 characters.');
  let text = value.trim();
  const formatError = 'Enter a proxy URL or host:port:username:password.';
  if (!text || /[\s\u0000-\u001f\u007f\\]/.test(text)) throw refuse(formatError);
  if (!/^[a-z0-9]+:\/\//i.test(text)) {
    // Providers commonly supply colon-separated credentials. Only the first three
    // separators delimit fields; remaining colons belong to the password. IPv6
    // hosts must be bracketed. Explicit URLs retain their chosen protocol.
    const parts = /^(\[[^\]]+\]|[^:/?#@\[\]]+):(\d{1,5}):([^:]+):(.+)$/.exec(text);
    if (!parts) throw refuse(formatError);
    const [, host, port, username, password] = parts;
    if (+port < 1 || +port > 65535) throw refuse('Enter a proxy port between 1 and 65535.');
    try { text = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`; }
    catch { throw refuse('The proxy username or password contains an invalid character.'); }
  }
  let url;
  try { url = new URL(text); } catch { throw refuse('That proxy URL is not valid.'); }
  if (!SCHEMES.has(url.protocol)) throw refuse('Use an HTTP, HTTPS, SOCKS4, SOCKS4a, SOCKS5 or SOCKS5h proxy.');
  if (!url.hostname || (url.pathname && url.pathname !== '/') || /[?#]/.test(text) || (url.port && (+url.port < 1 || +url.port > 65535))) {
    throw refuse('The proxy URL must contain a host and valid port, without a path, query or fragment.');
  }
  try {
    if (/[\u0000-\u001f\u007f]/.test(decodeURIComponent(url.username) + decodeURIComponent(url.password))) throw new Error();
  } catch { throw refuse('The proxy username or password contains an invalid escape or control character.'); }
  if (url.href.length > 4096) throw refuse('The encoded proxy URL must be at most 4096 characters.');
  return url.href;
}

// A private setting, deliberately outside admin-store's public settings allowlist. It is
// backed up with the accounts database and is never returned by the API or written to logs.
// Each child gets its own config on stdin, so passwords stay out of process arguments and a
// change cannot overwrite the config of a download that has already started.
export function createYoutubeProxy({ database, store, configFile = process.env.YTDLP_CONFIG_FILE } = {}) {
  const read = () => database?.prepare('SELECT value, updated_at FROM settings WHERE key = ?').get(KEY);
  const saved = () => {
    const row = read();
    if (!row) return null;
    try { return validateProxyUrl(JSON.parse(row.value)); }
    catch { throw new Error('The saved YouTube proxy setting is invalid.'); }
  };
  const status = () => {
    const row = read();
    const serverConfigured = !!configFile && fs.existsSync(configFile);
    return { source: row ? 'custom' : serverConfigured ? 'server' : 'none', configured: !!row || serverConfigured,
      serverConfigured, updatedAt: row?.updated_at || null };
  };
  // Fail closed if persisted configuration is corrupt, rather than bypassing the proxy.
  saved();
  return {
    status,
    invocation() {
      const proxy = saved();
      // yt-dlp gives the FIRST explicit config priority. Keep other server options, with
      // only --proxy overridden by our small, safely quoted stdin config.
      const args = [...(proxy ? ['--config-locations', '-'] : []), ...(configFile ? ['--config-locations', configFile] : [])];
      return { args, input: proxy ? `--proxy '${proxy.replace(/'/g, "'\\''")}'\n` : undefined };
    },
    update(input, admin) {
      if (!database || !store) throw refuse('Proxy changes are available only on the hosted site.');
      if (input.action !== 'set' && input.action !== 'reset') throw refuse('Choose a new proxy or restore the server default.');
      const proxy = input.action === 'set' ? validateProxyUrl(input.url) : null;
      database.exec('BEGIN IMMEDIATE');
      try {
        if (proxy) database.prepare('INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
          .run(KEY, JSON.stringify(proxy), Date.now());
        else database.prepare('DELETE FROM settings WHERE key = ?').run(KEY);
        store.log(admin, proxy ? 'youtube-proxy-set' : 'youtube-proxy-reset');
        database.exec('COMMIT');
      } catch (error) { database.exec('ROLLBACK'); throw error; }
      return status();
    },
  };
}
