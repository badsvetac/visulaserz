// Integration checks against the actual server, with isolated temporary account data.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import crypto from 'node:crypto';
import { lyricsQuery, norm } from '../lib/lyrics.js';

const directory = await mkdtemp(path.join(tmpdir(), 'visulaserz-hosting-test-'));
const port = Number(process.env.TEST_PORT) || 14889;
let child;
let output = '';
let count = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); count++; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Files (Linux) or handles (Windows) the test server holds open; null where neither can be counted.
async function openHandles(pid) {
  if (process.platform === 'linux') return (await readdir(`/proc/${pid}/fd`)).length;
  if (process.platform === 'win32') return Number(execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).HandleCount`], { encoding: 'utf8', windowsHide: true }).trim());
  return null;
}
// A player that moves on mid-file (a seek, a skip, the screen-off hand-over) drops its request.
function abortAfterFirstChunk(url, cookie) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, headers: { Host: 'test.visulaserz.local', Cookie: cookie, Range: 'bytes=0-' } }, res => {
      res.once('data', () => req.destroy());
    });
    req.on('error', () => {});
    req.on('close', resolve);
    req.end();
  });
}
async function start() {
  child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), windowsHide: true, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_HOSTS: 'test.visulaserz.local', DATA_DIR: directory } });
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/api/health')).status === 200) return; } catch {}
    if (child.exitCode !== null) throw new Error(`Test server exited: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Test server did not start.');
}
function request(url, { method = 'GET', data, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const body = data === undefined ? undefined : JSON.stringify(data);
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method, headers: { Host: 'test.visulaserz.local', ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json, text, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
      });
    });
    req.on('error', reject); req.end(body);
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const stopped = once(child, 'exit'); child.kill(); await stopped;
}
try {
  await start();
  check((await request('/')).status, 200);
  check((await request('/api/health')).json.accounts, true);
  check((await request('/api/health')).json.temporaryAudio, true);
  check((await request('/api/health', { headers: { Host: 'attacker.example' } })).status, 421);
  check((await request('/api/auth/register', { method: 'POST', data: {}, headers: { Origin: 'https://attacker.example' } })).status, 403);
  check((await request('/api/library')).status, 401);
  check((await request('/%2e%2e%2fpackage.json')).status, 404);
  check((await request('/.git/config')).status, 404);
  check((await request('/%bad')).status, 400);
  const credentials = { email: 'alice@example.invalid', name: 'Alice', password: 'Test-only-password-123!' };
  const alice = await request('/api/auth/register', { method: 'POST', data: credentials });
  check(alice.status, 201);
  check(alice.json.user.email, credentials.email);
  check(alice.text.includes(credentials.password), false);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) check(alice.headers['set-cookie'][0].includes(flag), true);
  check((await request('/api/auth/me', { cookie: alice.cookie })).json.user.id, alice.json.user.id);
  const bob = await request('/api/auth/register', { method: 'POST', data: { ...credentials, email: 'bob@example.invalid', name: 'Bob' } });
  check(bob.status, 201);
  const userDir = path.join(directory, 'cache', 'users', alice.json.user.id);
  await mkdir(userDir, { recursive: true });
  const trackId = 'AAAAAAAAAAA';
  const clientId = crypto.randomUUID();
  const select = (revision, tracks, cookie = alice.cookie) => request('/api/playback', { method: 'POST', cookie, data: { clientId, revision, tracks } });
  check((await request('/api/playback', { method: 'POST', data: { clientId, revision: 1, tracks: {} } })).status, 401);
  check((await select(1, { player: trackId })).status, 200);
  await writeFile(path.join(userDir, trackId + '.mp3'), '0123456789abcdef');
  await writeFile(path.join(userDir, trackId + '.json'), JSON.stringify({ id: trackId, title: 'Alice private test track', url: `/media/${trackId}.mp3`, source: 'youtube', addedAt: Date.now() }));
  check((await request('/api/library', { cookie: alice.cookie })).json.tracks.length, 1);
  check((await request('/api/library', { cookie: bob.cookie })).json.tracks.length, 0);
  const partial = await request(`/media/${trackId}.mp3`, { cookie: alice.cookie, headers: { Range: 'bytes=2-5' } });
  check(partial.status, 206); check(partial.text, '2345');
  // kept briefly by this browser only, so the screen-off stand-in does not download the song again
  check(partial.headers['cache-control'], 'private, max-age=900'); check(partial.headers.vary, 'Cookie');
  const etag = partial.headers.etag;
  check(/^"[0-9a-z]+-[0-9a-z]+"$/.test(etag || ''), true, 'media carries a validator');
  check((await request(`/media/${trackId}.mp3`, { cookie: alice.cookie, headers: { 'If-None-Match': etag } })).status, 304);
  const replaced = await request(`/media/${trackId}.mp3`, { cookie: alice.cookie, headers: { Range: 'bytes=2-5', 'If-Range': '"another-file"' } });
  check(replaced.status, 200, 'a range of a file that changed is answered with the whole new file'); check(replaced.text, '0123456789abcdef');
  check((await request(`/media/${trackId}.mp3`, { cookie: bob.cookie })).status, 404);
  check((await request(`/media/${trackId}.mp3`)).status, 401);
  // A second tab fetches the queue's next track ahead into the 'next' slot.
  const secondTab = crypto.randomUUID(), bigId = 'BIGBIGBIGBI';
  const tab2 = (revision, tracks) => request('/api/playback', { method: 'POST', cookie: alice.cookie, data: { clientId: secondTab, revision, tracks } });
  check((await tab2(1, { bogus: bigId })).status, 409);
  check((await tab2(2, { player: trackId, next: bigId })).status, 200);
  await writeFile(path.join(userDir, bigId + '.mp3'), Buffer.alloc(6 * 1024 * 1024, 7));
  await writeFile(path.join(userDir, bigId + '.json'), JSON.stringify({ id: bigId, title: 'Big test track', source: 'youtube', addedAt: Date.now() }));
  check((await request(`/media/${bigId}.mp3`, { cookie: alice.cookie, method: 'HEAD' })).status, 200, 'the next slot holds its audio');
  // Aborted media requests must close their files (an open one keeps a deleted MP3's disk space).
  const handlesBefore = await openHandles(child.pid);
  for (let i = 0; i < 50; i++) await abortAfterFirstChunk(`/media/${bigId}.mp3`, alice.cookie);
  await sleep(500);
  const handlesAfter = await openHandles(child.pid);
  if (handlesBefore !== null) check(handlesAfter - handlesBefore < 15, true, `50 aborted downloads left ${handlesAfter - handlesBefore} handles open`);
  // A player that gives up before the file has even been looked up is simply forgotten.
  for (let i = 0; i < 60; i++) {
    const early = http.request({ hostname: '127.0.0.1', port, path: `/media/${bigId}.mp3`, headers: { Host: 'test.visulaserz.local', Cookie: alice.cookie } });
    early.on('error', () => {});
    early.end();
    setTimeout(() => early.destroy(), i % 6);
  }
  await sleep(500);
  check(/UNABLE_TO_PIPE|request failed/i.test(output), false, `requests dropped early upset the server: ${output.slice(-300)}`);
  check((await request('/api/health')).status, 200);
  check((await tab2(3, {})).status, 200);
  check((await request(`/media/${bigId}.mp3`, { cookie: alice.cookie, method: 'HEAD' })).status, 404, 'released with the slot');
  check(await readFile(path.join(userDir, bigId + '.mp3')).then(() => true, () => false), false);
  await rm(path.join(userDir, bigId + '.json'));
  await request(`/api/library/${trackId}`, { method: 'DELETE', cookie: bob.cookie, headers: { 'Content-Type': 'application/json' } });
  check(await readFile(path.join(userDir, trackId + '.mp3'), 'utf8'), '0123456789abcdef');
  check((await select(2, { player: trackId })).status, 200);
  check((await select(1, {})).status, 409);
  check((await request(`/media/${trackId}.mp3`, { cookie: alice.cookie })).status, 200);
  check((await select(3, {})).status, 200);
  check((await request(`/media/${trackId}.mp3`, { cookie: alice.cookie })).status, 404);
  check((await request('/api/library', { cookie: alice.cookie })).json.tracks.length, 1);
  check((await select(4, { player: trackId })).json.missing, [trackId]);
  await writeFile(path.join(userDir, trackId + '.mp3'), '0123456789abcdef');
  check((await request('/api/auth/login', { method: 'POST', data: { ...credentials, password: 'incorrect-password' } })).status, 401);
  const login = await request('/api/auth/login', { method: 'POST', data: credentials }); check(login.status, 200);
  const change = await request('/api/auth/password', { method: 'POST', cookie: login.cookie, data: { currentPassword: credentials.password, newPassword: 'Changed-test-password-456!' } });
  check(change.status, 200);
  check((await request('/api/auth/me', { cookie: alice.cookie })).json.user, null);
  check(await readFile(path.join(userDir, trackId + '.mp3')).then(() => true, () => false), false);
  check((await request('/api/auth/me', { cookie: change.cookie })).json.user.id, alice.json.user.id);
  const recovered = await request('/api/auth/recover', { method: 'POST', data: { email: 'bob@example.invalid', recoveryCode: bob.json.recoveryCode, newPassword: 'Recovered-test-password-789!' } });
  check(recovered.status, 200);
  check(recovered.json.recoveryCode === bob.json.recoveryCode, false);
  check((await request('/api/auth/me', { cookie: bob.cookie })).json.user, null);
  check((await request('/api/auth/recover', { method: 'POST', data: { email: 'bob@example.invalid', recoveryCode: bob.json.recoveryCode, newPassword: 'Reused-recovery-test-123!' } })).status, 400);
  const { DatabaseSync } = await import('node:sqlite');
  const policyDb = new DatabaseSync(path.join(directory, 'accounts.sqlite'));
  policyDb.prepare('INSERT INTO audio_policies(user_id,keep_audio) VALUES(?,1)').run(bob.json.user.id);
  policyDb.close();
  const permanentDir = path.join(directory, 'cache', 'users', bob.json.user.id);
  await mkdir(permanentDir, { recursive: true });
  await writeFile(path.join(permanentDir, trackId + '.mp3'), 'permanent audio');
  await writeFile(path.join(permanentDir, trackId + '.json'), JSON.stringify({ id: trackId, title: 'Permanent track', source: 'youtube' }));
  check((await request('/api/health', { cookie: recovered.cookie })).json.temporaryAudio, false);
  check((await request('/api/health', { cookie: recovered.cookie })).json.persistentAudio, true);
  check((await request('/api/health', { cookie: change.cookie })).json.temporaryAudio, true);
  check((await request(`/media/${trackId}.mp3`, { cookie: recovered.cookie })).text, 'permanent audio');
  check((await request('/api/playback', { method: 'POST', cookie: recovered.cookie, data: { clientId, revision: 1, tracks: {} } })).status, 200);
  check(await readFile(path.join(permanentDir, trackId + '.mp3'), 'utf8'), 'permanent audio');
  // A deploy or restart while a song plays: the open tab keeps playing it.
  check((await select(5, { player: trackId }, change.cookie)).status, 200);
  await writeFile(path.join(userDir, trackId + '.mp3'), '0123456789abcdef');
  await stop(); await start();
  check((await request('/api/auth/me', { cookie: change.cookie })).json.user.id, alice.json.user.id);
  check((await request('/api/library', { cookie: change.cookie })).json.tracks.length, 1);
  check(await readFile(path.join(permanentDir, trackId + '.mp3'), 'utf8'), 'permanent audio');
  check((await request(`/media/${trackId}.mp3`, { cookie: change.cookie, headers: { Range: 'bytes=0-3' } })).status, 206, 'a finished track survives a restart until its tab claims it again');
  check((await select(6, { player: trackId }, change.cookie)).json.missing, [], 'and the tab finds it still there');
  // A member who keeps listening stays signed in: a session past half its age is renewed.
  const sessionsDb = new DatabaseSync(path.join(directory, 'accounts.sqlite'));
  const sessionToken = crypto.createHash('sha256').update(change.cookie.split('=')[1]).digest('hex');
  sessionsDb.prepare('UPDATE sessions SET expires = ? WHERE token = ?').run(Date.now() + 10 * 86400000, sessionToken);
  const renewed = await request('/api/library', { cookie: change.cookie });
  check(renewed.cookie, change.cookie, 'the same session cookie is sent again');
  check(/Max-Age=2592000/.test(renewed.headers['set-cookie']?.[0] || ''), true);
  check(sessionsDb.prepare('SELECT expires FROM sessions WHERE token = ?').get(sessionToken).expires > Date.now() + 29 * 86400000, true, 'with a new expiry');
  check((await request('/api/library', { cookie: change.cookie })).headers['set-cookie'], undefined, 'a fresh session is left alone');
  sessionsDb.close();
  // A lyrics miss is remembered (for a day) instead of asking LRCLIB again on every play.
  const words = lyricsQuery('A song nobody has', 'Nobody');
  const lyricsKey = crypto.createHash('sha1').update(`${norm(words.artist)}|${norm(words.title)}|${Math.round(200 / 5)}`).digest('hex');
  await mkdir(path.join(directory, 'cache', 'shared', 'lyrics'), { recursive: true });
  await writeFile(path.join(directory, 'cache', 'shared', 'lyrics', `${lyricsKey}.json`), JSON.stringify({ query: words, synced: null, plain: null, match: null, fetchedAt: Date.now() }));
  const miss = await request(`/api/lyrics?title=${encodeURIComponent('A song nobody has')}&artist=Nobody&duration=200`);
  check([miss.status, miss.json.synced, miss.json.plain], [200, null, null]);
  check(typeof miss.json.fetchedAt, 'number', 'answered from the remembered miss');
  check((await request('/api/auth/logout', { method: 'POST', cookie: change.cookie, data: {} })).status, 200);
  check(await readFile(path.join(userDir, trackId + '.mp3')).then(() => true, () => false), false);
  check((await request('/api/auth/me', { cookie: change.cookie })).json.user, null);
  check((await request('/api/auth/logout', { method: 'POST', cookie: recovered.cookie, data: {} })).status, 200);
  check(await readFile(path.join(permanentDir, trackId + '.mp3'), 'utf8'), 'permanent audio');
  const permanentLogin = await request('/api/auth/login', { method: 'POST', data: { email: 'bob@example.invalid', password: 'Recovered-test-password-789!' } });
  check(permanentLogin.status, 200);
  check((await request(`/api/library/${trackId}`, { method: 'DELETE', cookie: permanentLogin.cookie, headers: { 'Content-Type': 'application/json' } })).status, 200);
  check(await readFile(path.join(permanentDir, trackId + '.mp3')).then(() => true, () => false), false);
  console.log(`PASS: ${count} checks — authentication, recovery, persistence, account isolation, media ranges and host/origin restrictions.`);
} finally {
  await stop();
  // This directory is created by mkdtemp above and contains only these test fixtures.
  if (path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('visulaserz-hosting-test-')) await rm(directory, { recursive: true, force: true });
}
