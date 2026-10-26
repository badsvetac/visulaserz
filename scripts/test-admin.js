// Integration checks for the admin desk against the actual server, with isolated temporary data:
// who may see it, what each setting does to the site, member actions, traffic counting, and that
// all of it survives a restart. Run with Node 24: node scripts/test-admin.js
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createAdminStore, youtubeReason } from '../lib/admin-store.js';
import { classify, createTraffic } from '../lib/traffic.js';
import { createYoutubeProxy, validateProxyUrl } from '../lib/youtube-proxy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(tmpdir(), 'visulaserz-admin-test-'));
const port = Number(process.env.TEST_PORT) || 14891;
const HOST = 'test.visulaserz.local';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1';
let child, output = '', count = 0;
let deskKey = '';                     // the key in the desk's secret address, sent with every /api/admin/ call
const proxyConfig = path.join(directory, 'server-proxy.conf');
const privateProxy = 'http://proxy-test-user:private-proxy-password@127.0.0.1:18999/';
const providerProxy = '127.0.0.1:18999:proxy-test-user:private-proxy-password';
await writeFile(proxyConfig, '--proxy "http://server-proxy.invalid:8080"\n', { mode: 0o600 });
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); count++; };
const ok = (value, message) => { assert.ok(value, message); count++; };

async function start() {
  output = '';
  child = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_HOSTS: HOST, DATA_DIR: directory, YTDLP_CONFIG_FILE: proxyConfig } });
  child.stdout.on('data', d => output += d);
  child.stderr.on('data', d => output += d);
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/api/health')).status === 200) return; } catch {}
    if (child.exitCode !== null) throw new Error(`Test server exited: ${output}`);
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Test server did not start.');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped;
}
function request(url, { method = 'GET', data, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const body = data === undefined ? undefined : JSON.stringify(data);
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method, headers: { Host: HOST, 'User-Agent': DESKTOP,
      ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}), ...(cookie ? { Cookie: cookie } : {}),
      ...(deskKey && url.startsWith('/api/admin/') ? { 'X-Desk-Key': deskKey } : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json, text, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
      });
    });
    req.on('error', reject); req.end(body);
  });
}
const cli = (...args) => spawnSync(process.execPath, ['lib/admin-cli.js', ...args], { cwd: root, env: { ...process.env, DATA_DIR: directory, PUBLIC_HOSTS: HOST }, encoding: 'utf8' });
const register = (email, name) => request('/api/auth/register', { method: 'POST', data: { email, name, password: 'Test-only-password-123!' } });
const login = email => request('/api/auth/login', { method: 'POST', data: { email, password: 'Test-only-password-123!' } });

try {
  // ── unit checks: the pieces that need no server ──────────────────────────────
  check(youtubeReason('ERROR: [youtube] abc: Sign in to confirm you’re not a bot'), 'bot-check');
  check(youtubeReason('ERROR: Private video. Sign in if you have been granted access'), 'private');
  check(youtubeReason('ERROR: Sign in to confirm your age'), 'age');
  check(youtubeReason('ERROR: Video unavailable'), 'unavailable');
  check(youtubeReason('ERROR: unable to download video data: HTTP Error 403'), 'refused');
  check(youtubeReason('Playback selection changed.'), 'cancelled');
  check(classify(DESKTOP), { bot: false, device: 'Desktop', browser: 'Chrome', os: 'Windows' });
  check(classify(PHONE), { bot: false, device: 'Phone', browser: 'Safari', os: 'iOS' });
  check(classify('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0 Safari/537.36').bot, true);
  check(classify('Googlebot/2.1 (+http://www.google.com/bot.html)').bot, true);
  check(classify('').bot, true);
  {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, created_at INTEGER NOT NULL);');
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('u1', 'u1@example.invalid', 'U', 'x', 'y', 1);
    const store = createAdminStore(db);
    store.recordYoutube({ kind: 'import', ok: true, user: 'u1' });
    store.recordYoutube({ kind: 'import', ok: false, user: 'u1', reason: 'refused' });
    store.recordYoutube({ kind: 'import', ok: false, user: 'u1', reason: 'cancelled' });
    store.recordYoutube({ kind: 'search', ok: true, user: 'u1' });
    check(store.downloadsToday('u1'), 2, 'a cancelled download and a search do not count against the daily limit');
    check(store.youtubeReasons(7).map(r => r.reason), ['refused'], 'a cancelled download is not counted as a failure');
    check(store.youtubeRecentFailures().length, 1);
    assert.throws(() => store.update({ youtubeDailyLimit: -1 }, 'admin')); count++;
    assert.throws(() => store.update({ nope: true }, 'admin')); count++;
    check(store.update({ youtubeDailyLimit: 5, signupsOpen: true }, 'admin'), ['youtubeDailyLimit'], 'only changed settings are written');
    check(store.notice(), null);
    store.update({ notice: 'Maintenance tonight', noticeKind: 'warn' }, 'admin');
    ok(/^[a-f0-9]{12}$/.test(store.notice().id), 'a notice gets a stable id');
    // names Object lends every object are not settings
    for (const name of ['constructor', 'toString', 'hasOwnProperty']) { assert.throws(() => store.update({ [name]: 1 }, 'admin'), /Unknown setting/); count++; }
    assert.throws(() => store.update(JSON.parse('{"__proto__": true}'), 'admin'), /Unknown setting/); count++;
    check(Object.getPrototypeOf(store.settings()), Object.prototype, 'the settings object is untouched');
    const proxy = createYoutubeProxy({ database: db, store, configFile: proxyConfig });
    check(proxy.status().source, 'server');
    for (const scheme of ['http', 'https', 'socks4', 'socks4a', 'socks5', 'socks5h']) {
      ok(validateProxyUrl(`${scheme}://user:p%40ss@proxy.example:1080`).startsWith(scheme + '://'), `accepts ${scheme}`);
    }
    check(validateProxyUrl(providerProxy), privateProxy, 'provider credentials become an HTTP URL');
    check(validateProxyUrl(' proxy.example:8080:user:password '), 'http://user:password@proxy.example:8080/');
    check(validateProxyUrl('[2001:db8::1]:8080:user:password'), 'http://user:password@[2001:db8::1]:8080/');
    const punctuationProxy = new URL(validateProxyUrl('proxy.example:8080:user@name:p@ss:100%/#?'));
    check(decodeURIComponent(punctuationProxy.username), 'user@name', 'provider usernames are encoded without changing their value');
    check(decodeURIComponent(punctuationProxy.password), 'p@ss:100%/#?', 'password punctuation remains literal, including percent signs and colons');
    for (const bad of ['', null, 17, 'host:8080', '--exec touch /tmp/pwn', 'file:///etc/passwd', 'ftp://proxy.example',
      'http://', 'http://host:0', 'http://host:65536', 'http://host/path', 'http://host/?q=1', 'http://host/#secret',
      'http://user:pa ss@host', 'http://user:pa%0Ass@host', 'http://user:%ZZ@host', 'http://host\n--exec evil',
      'http://host\\path', 'http://' + 'x'.repeat(4096), 'host:8080:user', 'host:8080::password', 'host:8080:user:',
      'host:0:user:password', 'host:65536:user:password', 'host:-1:user:password', 'host:eighty:user:password',
      'host/path:8080:user:password', 'host@evil:8080:user:password', 'host:8080:user:pass\n--exec=evil',
      '2001:db8::1:8080:user:password', 'host:8080:user:\ud800', 'host:8080:user:' + '%'.repeat(1500)]) {
      assert.throws(() => proxy.update({ action: 'set', url: bad }, 'admin'), error => error.refusal === true); count++;
    }
    check(proxy.status().source, 'server', 'invalid changes leave the original proxy active');
    proxy.update({ action: 'set', url: providerProxy }, 'admin');
    const invocation = proxy.invocation();
    check(invocation.args, ['--config-locations', '-', '--config-locations', proxyConfig]);
    ok(!JSON.stringify(invocation.args).includes('private-proxy-password'), 'credentials never enter child process arguments');
    ok(invocation.input.includes(privateProxy), 'each child receives its own private config');
    ok(!JSON.stringify([store.settings(), store.recentLog(), proxy.status()]).includes('private-proxy-password'), 'settings, status and logs contain no proxy secret');
    const restored = createYoutubeProxy({ database: db, store, configFile: proxyConfig });
    check(restored.invocation(), invocation, 'a new proxy manager restores the saved connection');
    proxy.update({ action: 'reset' }, 'admin');
    check(proxy.invocation(), { args: ['--config-locations', proxyConfig], input: undefined }, 'reset restores the server config');
    check(invocation.input.includes(privateProxy), true, 'an existing child config is unaffected by reset');
    const failing = createYoutubeProxy({ database: db, configFile: proxyConfig, store: { log() { throw new Error('test log failure'); } } });
    assert.throws(() => failing.update({ action: 'set', url: privateProxy }, 'admin'), /test log failure/); count++;
    check(proxy.status().source, 'server', 'a failed audit write rolls back the proxy change');
    check(createYoutubeProxy({ configFile: '' }).status().source, 'none', 'local mode needs no database');
  }
  {
    // a flood of made-up browsers and referrers stays inside its ceilings, and quiet tabs leave the lists
    const db = new DatabaseSync(':memory:');
    let clock = Date.UTC(2026, 9, 6, 12);
    const traffic = createTraffic(db, { hosts: ['example.test'], now: () => clock, maxVisitors: 5, maxOnline: 4, maxKeys: 3 });
    for (let i = 0; i < 40; i++) {
      const req = { method: 'GET', url: '/', headers: { 'user-agent': `${DESKTOP} flood/${i}`, referer: `https://spam${i}.example/` }, socket: { remoteAddress: '203.0.113.9' } };
      traffic.record({ req, status: 200, pathname: '/', view: true });
    }
    const sizes = traffic.sizes();
    check(sizes.seen, 5, 'visitors tracked a day stop at the ceiling');
    check(sizes.online, 4, 'and so does the online list');
    const refs = traffic.breakdown('referrer', 1, 50);
    check(refs.length, 4, 'three referrers and "Other"');
    check(refs.find(r => r.key === 'Other').n, 37, 'the rest are folded into Other');
    check(traffic.daySeries(1)[0].views, 40, 'every view still counts');
    clock += 6 * 60e3;
    traffic.flush();
    check(traffic.sizes().online, 0, 'quiet tabs leave the online list without anyone looking');
    traffic.close();
  }

  // ── the server ──────────────────────────────────────────────────────────────
  await start();
  // the hosted site's security headers, on the page and on the API
  for (const route of ['/', '/api/health']) {
    const r = await request(route, { headers: { 'User-Agent': 'curl/8.9 (header probe)' } });   // a script, so not counted as a visitor
    ok(/default-src 'self'/.test(r.headers['content-security-policy'] || '') && /object-src 'none'/.test(r.headers['content-security-policy']) && /frame-ancestors 'self'/.test(r.headers['content-security-policy']), `${route}: a content security policy`);
    check(r.headers['strict-transport-security'], 'max-age=31536000', `${route}: HTTPS only`);
    ok(/camera=\(self\)/.test(r.headers['permissions-policy'] || '') && /geolocation=\(\)/.test(r.headers['permissions-policy']), `${route}: only the devices the app uses`);
    check(r.headers['cross-origin-opener-policy'], 'same-origin', `${route}: its own window`);
  }
  check((await request('/admin')).status, 404, 'no /admin for visitors');
  check((await request('/admin/index.html')).status, 404);
  check((await request('/admin/admin.js')).status, 404);
  check((await request('/api/admin/overview')).status, 401, 'the admin API needs a session first');

  // the desk's secret address: made at the first start, known to the command line only
  const where = cli('where');
  check(where.status, 0);
  let deskPath = where.stdout.trim().replace(/^https?:\/\/[^/]+/, '');
  ok(/^\/desk-[a-f0-9]{24}$/.test(deskPath), 'the desk has a secret address');
  ok(where.stdout.startsWith(`https://${HOST}/desk-`), 'with the site in front of it');
  deskKey = deskPath.slice('/desk-'.length);
  check((await request(deskPath)).status, 404, 'the right address without a session is a missing page');

  const owner = await register('owner@example.invalid', 'Owner');
  const alice = await register('alice@example.invalid', 'Alice');
  check(owner.status, 201); check(alice.status, 201);
  check((await request(deskPath, { cookie: owner.cookie })).status, 404, 'a member is not an admin until granted');
  check((await request('/api/admin/overview', { cookie: owner.cookie })).status, 404);

  check(cli('grant', 'nobody@example.invalid').status, 1, 'admin rights need an existing account');
  check(cli('grant', 'owner@example.invalid').status, 0);
  ok(cli('list').stdout.includes('owner@example.invalid'));
  check((await request('/api/auth/me', { cookie: owner.cookie })).json.admin, undefined, 'the site never says who is an admin');
  // the address is the only door, for admins too
  check((await request('/admin', { cookie: owner.cookie })).status, 404, '/admin is a missing page for admins too');
  check((await request('/admin/index.html', { cookie: owner.cookie })).status, 404, 'and so is the page file itself');
  check((await request('/desk-000000000000000000000000', { cookie: owner.cookie })).status, 404, 'a wrong address is a missing page');
  check((await request(`${deskPath}x`, { cookie: owner.cookie })).status, 404);
  const page = await request(deskPath, { cookie: owner.cookie });
  check(page.status, 200, 'the desk opens for an admin at its address');
  ok(page.text.includes('<title>'), 'it is the desk page');
  check(page.headers['x-robots-tag'], 'noindex, nofollow');
  check(page.headers['referrer-policy'], 'no-referrer', 'the address never leaks in a Referer');
  ok(String(page.headers['cache-control']).includes('no-store'));
  check((await request(`${deskPath}/`, { cookie: owner.cookie })).status, 200, 'with or without the trailing slash');
  check((await request('/admin/admin.js', { cookie: owner.cookie })).status, 200, 'its script loads for the admin');
  check((await request(deskPath, { cookie: alice.cookie })).status, 404, 'and stays hidden from other members');
  check((await request('/api/admin/overview', { cookie: alice.cookie })).status, 404, 'a member with the key gets nothing');
  check((await request('/api/admin/overview', { cookie: owner.cookie, headers: { 'X-Desk-Key': '' } })).status, 404, 'an admin session alone does not open the API');
  check((await request('/api/admin/overview', { cookie: owner.cookie, headers: { 'X-Desk-Key': '0'.repeat(24) } })).status, 404, 'nor with a wrong key');
  check((await request('/api/admin/overview', { cookie: owner.cookie, headers: { 'X-Desk-Key': 'é'.repeat(24) } })).status, 404, 'nor with an odd one');
  check((await request('/api/admin/overview', { cookie: owner.cookie })).status, 200, 'session and key together do');

  // traffic: two people and a crawler look at the page; the admin's own visit is not counted
  await request('/', { headers: { 'User-Agent': DESKTOP, 'CF-IPCountry': 'DE', 'Accept-Language': 'de-DE,de;q=0.9', Referer: 'https://www.google.com/' } });
  await request('/', { headers: { 'User-Agent': DESKTOP, 'CF-IPCountry': 'DE' } });
  await request('/?utm_source=Instagram', { headers: { 'User-Agent': PHONE, 'CF-IPCountry': 'TR', 'Accept-Language': 'tr-TR' } });
  await request('/', { headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } });
  await request('/', { cookie: owner.cookie });
  check((await request('/api/ping', { method: 'POST', data: {}, headers: { 'User-Agent': PHONE } })).status, 204, 'an open tab says so');
  check((await request('/api/ping')).status, 405);
  const traffic = await request('/api/admin/traffic?days=7', { cookie: owner.cookie });
  check(traffic.status, 200);
  const today = traffic.json.days.at(-1);
  check(today.views, 3, 'three page views by people; the admin and the crawler are left out');
  check(today.visitors, 2, 'two different visitors');
  ok(today.bots >= 1, 'the crawler is counted as a bot');
  const dims = Object.fromEntries(Object.entries(traffic.json.breakdown).map(([k, rows]) => [k, Object.fromEntries(rows.map(r => [r.key, r.n]))]));
  check(dims.country.DE, 2); check(dims.country.TR, 1);
  check(dims.device.Desktop, 2); check(dims.device.Phone, 1);
  check(dims.referrer.Google, 1); check(dims.campaign.instagram, 1);
  check(dims.language.de, 1); check(dims.language.tr, 1);
  check(dims.account.joined, 2);
  check(dims.page['/'], 3, 'the pages people looked at, by address');
  check(dims.crawled['/'], 1, 'and the pages crawlers read, kept apart');
  ok(traffic.json.online.visitors >= 1, 'someone is online');
  ok(!traffic.text.includes('127.0.0.1') && !traffic.text.includes(DESKTOP), 'no address or browser string is stored or returned');

  // settings change the site at once
  const settings = (changes, cookie = owner.cookie, headers = {}) => request('/api/admin/settings', { method: 'POST', data: { changes }, cookie, headers });
  check((await settings({ signupsOpen: false }, owner.cookie, { Origin: 'https://attacker.example' })).status, 403, 'no cross-site changes');
  check((await request('/api/admin/settings', { method: 'POST', cookie: owner.cookie, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  check((await settings({ signupsOpen: false }, alice.cookie)).status, 404, 'a member cannot change settings');
  check((await settings({ signupsOpen: 'no' })).status, 400);
  check((await settings({ unknown: true })).status, 400);
  check((await settings({ signupsOpen: false })).json.settings.signupsOpen, false);
  check((await register('carol@example.invalid', 'Carol')).status, 403, 'sign-ups paused');
  check((await settings({ signupsOpen: true })).status, 200);
  const carol = await register('carol@example.invalid', 'Carol');
  check(carol.status, 201, 'sign-ups open again');
  check((await settings({ youtubeEnabled: false })).status, 200);
  const off = (await request('/api/health')).json.youtube;
  check(off.available, false); ok(/switched off/.test(off.reason));
  check((await request('/api/youtube/search?q=test', { cookie: alice.cookie })).status, 503, 'YouTube switched off for members');
  check((await settings({ youtubeEnabled: true })).status, 200);
  check((await settings({ notice: 'New scenes tonight', noticeKind: 'info' })).status, 200);
  const notice = (await request('/api/health')).json.notice;
  check(notice.text, 'New scenes tonight'); check(notice.kind, 'info');
  check((await settings({ notice: '' })).status, 200);
  check((await request('/api/health')).json.notice, null);
  check((await settings({ youtubeDailyLimit: 3 })).json.settings.youtubeDailyLimit, 3);

  // Proxy changes require both admin authorization and the desk key. The secret has its
  // own write-only route; the general settings API cannot read or overwrite it.
  const setProxy = (data, cookie = owner.cookie, headers = {}) => request('/api/admin/youtube/proxy', { method: 'POST', data, cookie, headers });
  check((await request('/api/admin/settings', { cookie: owner.cookie })).json.youtubeProxy.source, 'server');
  check((await setProxy({ action: 'set', url: privateProxy })).status, 200);
  check((await request('/api/admin/youtube/proxy', { method: 'POST', data: { action: 'reset' } })).status, 401, 'anonymous cannot change the proxy');
  check((await setProxy({ action: 'set', url: privateProxy }, alice.cookie)).status, 404, 'members cannot change the proxy');
  check((await setProxy({ action: 'reset' }, owner.cookie, { 'X-Desk-Key': '' })).status, 404, 'the desk key is required');
  check((await setProxy({ action: 'reset' }, owner.cookie, { Origin: 'https://attacker.example' })).status, 403, 'cross-site proxy changes are refused');
  check((await settings({ youtubeProxy: privateProxy })).status, 400, 'the private proxy is not a public setting');
  for (const data of [{ action: 'set', url: '' }, { action: 'set', url: 'file:///private' }, { action: 'disable' }, {}]) {
    check((await setProxy(data)).status, 400, 'invalid proxy requests are refused');
  }
  check((await request('/api/admin/settings', { cookie: owner.cookie })).json.youtubeProxy.source, 'custom', 'failed changes keep the saved proxy');
  check((await setProxy({ action: 'reset' })).json.youtubeProxy.source, 'server');
  const proxySaved = await setProxy({ action: 'set', url: providerProxy });
  check(proxySaved.status, 200);
  check(proxySaved.json.youtubeProxy.source, 'custom');
  for (const route of ['settings', 'overview', 'youtube', 'system', 'log']) {
    const r = await request(`/api/admin/${route}`, { cookie: owner.cookie });
    ok(!r.text.includes('private-proxy-password') && !r.text.includes('proxy-test-user'), `no credentials in ${route}`);
  }
  ok(!proxySaved.text.includes('private-proxy-password'), 'saving never echoes credentials');
  ok(!(await request('/api/health', { cookie: alice.cookie })).text.includes('private-proxy-password'), 'the public health endpoint contains no proxy credentials');

  // members
  const list = await request('/api/admin/members', { cookie: owner.cookie });
  check(list.status, 200);
  check(list.json.members.length, 3);
  ok(!/password|recovery|token/i.test(JSON.stringify(list.json.members.map(m => Object.keys(m)))), 'no secret fields');
  ok(!list.text.includes('Test-only-password'), 'no password');
  const id = email => list.json.members.find(m => m.email === email).id;
  const act = (data, cookie = owner.cookie) => request('/api/admin/members/action', { method: 'POST', data, cookie });
  check((await act({ id: id('alice@example.invalid'), action: 'keepAudio', value: true })).status, 200);
  check((await request('/api/health', { cookie: alice.cookie })).json.persistentAudio, true, 'kept audio switched on for Alice');
  check((await act({ id: id('alice@example.invalid'), action: 'keepAudio', value: false })).status, 200);
  check((await request('/api/health', { cookie: alice.cookie })).json.persistentAudio, false);
  check((await act({ id: id('alice@example.invalid'), action: 'signOut' })).status, 200);
  check((await request('/api/auth/me', { cookie: alice.cookie })).json.user, null, 'signed out everywhere');
  check((await act({ id: id('owner@example.invalid'), action: 'suspend' })).status, 400, 'an admin cannot be suspended from the desk');
  check((await act({ id: id('alice@example.invalid'), action: 'suspend', reason: 'test' })).status, 200);
  check((await login('alice@example.invalid')).status, 403, 'a suspended member cannot sign in');
  check((await act({ id: id('alice@example.invalid'), action: 'reinstate' })).status, 200);
  const aliceAgain = await login('alice@example.invalid');
  check(aliceAgain.status, 200, 'and can again once reinstated');
  const aliceDir = path.join(directory, 'cache', 'users', id('alice@example.invalid'));
  await mkdir(aliceDir, { recursive: true });
  await writeFile(path.join(aliceDir, 'AAAAAAAAAAA.json'), '{}');
  check((await act({ id: id('alice@example.invalid'), action: 'delete', confirm: 'wrong@example.invalid' })).status, 400, 'deleting needs the exact email');
  check((await act({ id: id('alice@example.invalid'), action: 'delete', confirm: 'ALICE@example.invalid ' })).status, 200);
  check((await login('alice@example.invalid')).status, 401, 'the account is gone');
  await assert.rejects(access(aliceDir)); count++;
  check((await act({ id: '00000000-0000-0000-0000-000000000000', action: 'signOut' })).status, 400);
  check((await act({ id: id('carol@example.invalid'), action: 'explode' })).status, 400);

  // the rest of the desk answers
  for (const route of ['overview', 'live', 'youtube', 'storage', 'system', 'settings', 'log']) {
    const r = await request(`/api/admin/${route}`, { cookie: owner.cookie });
    check(r.status, 200, route);
  }
  const overview = (await request('/api/admin/overview', { cookie: owner.cookie })).json;
  check(overview.members.total, 2);
  check(overview.today.views, 3);
  const log = (await request('/api/admin/log', { cookie: owner.cookie })).json.log.map(e => e.action);
  for (const action of ['grant-admin', 'setting', 'keep-audio-on', 'keep-audio-off', 'sign-out', 'suspend', 'reinstate', 'delete-account', 'youtube-proxy-set', 'youtube-proxy-reset']) ok(log.includes(action), `logged: ${action}`);

  // a new address: the old one stops answering at once, from the desk or from the command line
  const moved = await request('/api/admin/desk/new', { method: 'POST', data: {}, cookie: owner.cookie });
  check(moved.status, 200);
  ok(/^\/desk-[a-f0-9]{24}$/.test(moved.json.path) && moved.json.path !== deskPath, 'a new address');
  check((await request(deskPath, { cookie: owner.cookie })).status, 404, 'the old address is gone');
  check((await request('/api/admin/overview', { cookie: owner.cookie })).status, 404, 'and so is its key');
  check((await request(moved.json.path, { cookie: owner.cookie })).status, 200, 'the new one opens');
  deskPath = moved.json.path; deskKey = deskPath.slice('/desk-'.length);
  check((await request('/api/admin/overview', { cookie: owner.cookie })).status, 200);
  ok(cli('where').stdout.trim().endsWith(deskPath), 'the command line knows the new address');
  const fromCli = cli('new-address').stdout.trim().replace(/^https?:\/\/[^/]+/, '');
  check((await request(deskPath, { cookie: owner.cookie })).status, 404, 'a new address from the command line works at once');
  deskPath = fromCli; deskKey = deskPath.slice('/desk-'.length);
  check((await request(deskPath, { cookie: owner.cookie })).status, 200);
  ok((await request('/api/admin/log', { cookie: owner.cookie })).json.log.some(e => e.action === 'new-desk-address'), 'logged: new-desk-address');
  check((await request('/api/admin/storage/clear', { method: 'POST', data: { what: '../users' }, cookie: owner.cookie })).status, 400, 'only the shared caches can be cleared');
  check((await request('/api/admin/storage/clear', { method: 'POST', data: { what: 'lyrics' }, cookie: owner.cookie })).status, 200);
  check((await request('/api/admin/nothing', { cookie: owner.cookie })).status, 404);

  // a restart keeps the numbers, the settings and the admin
  await stop();
  await start();
  const again = await request('/api/admin/overview', { cookie: owner.cookie });
  check(again.status, 200, 'still an admin, at the same address, after a restart');
  check(again.json.today.views, 3, 'traffic kept across a restart');
  check(again.json.today.visitors, 2, 'the same visitors are not counted twice after a restart');
  check(again.json.settings.youtubeDailyLimit, 3);
  check(again.json.youtube.proxySource, 'custom', 'the saved proxy survives a server restart');
  const persisted = new DatabaseSync(path.join(directory, 'accounts.sqlite'));
  check(JSON.parse(persisted.prepare("SELECT value FROM settings WHERE key = 'youtubeProxy'").get().value), privateProxy, 'the connection is included in the existing database backup');
  persisted.close();
  check((await setProxy({ action: 'reset' })).json.youtubeProxy.source, 'server', 'reset works after a restart');
  ok(!output.includes('private-proxy-password'), 'the server output never logs the proxy secret');
  await request('/', { headers: { 'User-Agent': DESKTOP, 'CF-IPCountry': 'DE' } });
  check((await request('/api/admin/traffic?days=1', { cookie: owner.cookie })).json.days.at(-1).visitors, 2, 'a returning visitor the same day is still one visitor');
  check(cli('revoke', 'owner@example.invalid').status, 0);
  check((await request('/api/admin/overview', { cookie: owner.cookie })).status, 404, 'revoked at once');
  console.log(`PASS: ${count} checks — admin access, settings, member actions, traffic counting, privacy and restart persistence.`);
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await stop();
  if (path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('visulaserz-admin-test-')) await rm(directory, { recursive: true, force: true });
}
