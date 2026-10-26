import { test } from 'node:test';
import assert from 'node:assert/strict';

// The browser pieces the queue code touches, as plain stand-ins.
globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { hidden: false });
globalThis.location = { protocol: 'https:', hostname: 'test.visulaserz.local' };
globalThis.matchMedia = () => ({ matches: false });
globalThis.screen = { width: 1400, height: 900 };
const storage = new Map();
globalThis.localStorage = { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
const beacons = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node-test', platform: 'test', maxTouchPoints: 0, sendBeacon: (url, body) => { beacons.push({ url, body }); return true; } } });
const revoked = [];
let blobs = 0;
URL.createObjectURL = () => `blob:test-${++blobs}`;
URL.revokeObjectURL = url => revoked.push(url);

const { Crate } = await import('../public/js/ui/crate.js');
const { syncKey, savedSync } = await import('../public/js/ui/lyric-sync.js');

const settle = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));
const track = id => ({ id, source: 'youtube', title: id, url: `/media/${id}.mp3` });

// Just enough of engine.js: an event target whose load() runs prepareTrack unless the track is
// marked ready, and records how each load was asked for.
class StubEngine extends EventTarget {
  constructor() { super(); this.track = null; this.loads = []; this.duration = 0; this.currentTime = 0; this.playing = false; this.loop = false; }
  async load(t, opts = {}) {
    this.loads.push({ id: t.id, ready: !!t.ready, opts });
    if (!t.ready && this.prepareTrack) t = await this.prepareTrack(t, 'player') || t;
    this.track = t;
    this.playing = opts.autoplay !== false;
    this.dispatchEvent(new CustomEvent('trackchange', { detail: t }));
  }
  tick(t, d = this.duration) { this.currentTime = t; this.duration = d; this.dispatchEvent(new Event('timeupdate')); }
}

// A server: every load is done at once unless `pending` or `refuse` say otherwise.
function server({ pending = new Set(), refuse = new Map(), missing = [] } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body });
    let data = {}, status = 200;
    if (url === '/api/health') data = { temporaryAudio: true, youtube: { available: true } };
    if (url === '/api/library') data = { tracks: [] };
    if (url === '/api/playback') {
      data = { ok: true, missing: missing.filter(id => Object.values(body.tracks).includes(id)) };
      for (const id of data.missing) missing.splice(missing.indexOf(id), 1);   // reported once, then fetched again
    }
    if (url === '/api/youtube/load') {
      if (refuse.has(body.url)) { status = refuse.get(body.url).status; data = refuse.get(body.url).data; refuse.get(body.url).times--; if (!refuse.get(body.url).times) refuse.delete(body.url); }
      else data = pending.has(body.url) ? { id: `job-${body.url}`, state: 'downloading', progress: 0.5 } : { state: 'done', track: track(body.url) };
    }
    if (url.startsWith('/api/youtube/job/')) {
      const id = url.slice('/api/youtube/job/job-'.length);
      data = pending.has(id) ? { id: `job-${id}`, state: 'downloading', progress: 0.5 } : { state: 'done', track: track(id) };
    }
    return { ok: status < 400, status, json: async () => data };
  };
  return calls;
}
const loadsOf = calls => calls.filter(c => c.url === '/api/youtube/load');
const lastSelection = calls => calls.filter(c => c.url === '/api/playback').at(-1)?.body.tracks;

async function hostedCrate(options) {
  const calls = server(options);
  const engine = new StubEngine();
  const crate = new Crate(engine);
  await crate.init();
  return { calls, engine, crate };
}

test('browser queue stays metadata-only; selections, idle heartbeat and close are synchronized', async () => {
  const { calls, engine, crate } = await hostedCrate();
  try {
    await crate.loadYouTube('AAAAAAAAAAA', { play: false, metadata: { title: 'Queued A' } });
    assert.equal(loadsOf(calls).length, 0);
    assert.equal(crate.tracks[0].title, 'Queued A');
    assert.equal(engine.track, null, 'queuing cannot start an idle player');
    await crate.play(0);
    assert.deepEqual(loadsOf(calls)[0].body.tracks, { player: 'AAAAAAAAAAA' });
    crate.temporary.heartbeat();
    await crate.temporary.tail;
    assert.deepEqual(lastSelection(calls), { player: 'AAAAAAAAAAA' }, 'idle keeps the selection');
    await crate.loadYouTube('BBBBBBBBBBB', { play: true });
    assert.deepEqual(loadsOf(calls).at(-1).body.tracks, { player: 'BBBBBBBBBBB' }, 'switch drops old track');
    await crate.prepareTrack(track('AAAAAAAAAAA'), 'deckA');
    assert.deepEqual(crate.temporary.tracks, { player: 'BBBBBBBBBBB', deckA: 'AAAAAAAAAAA' });
    await crate.prepareTrack({ source: 'file', id: 'local', url: 'blob:test' }, 'player');
    assert.deepEqual(lastSelection(calls), { deckA: 'AAAAAAAAAAA' }, 'local playback releases only the player');
    await crate.temporary.clear('deckA');
    assert.deepEqual(lastSelection(calls), {});

    const first = crate.temporary.load(track('AAAAAAAAAAA'), 'player', () => {});
    const second = crate.temporary.load(track('BBBBBBBBBBB'), 'player', () => {});
    const results = await Promise.allSettled([first, second]);
    assert.equal(results[0].reason.name, 'AbortError');
    assert.equal(results[1].value.id, 'BBBBBBBBBBB');
    const revisions = calls.filter(c => c.body?.revision).map(c => c.body.revision);
    assert.deepEqual(revisions, [...revisions].sort((a, b) => a - b));
    crate.temporary.close();
    const close = JSON.parse(await beacons.at(-1).body.text());
    assert.deepEqual(close.tracks, {});
    assert.ok(close.revision > revisions.at(-1));
  } finally {
    clearInterval(crate.temporary?.timer);
  }
});

test('the playing element keeps the lease alive, at most every 30 s, even with timers asleep', async () => {
  const { calls, engine, crate } = await hostedCrate();
  try {
    await crate.loadYouTube('AAAAAAAAAAA', { play: true });
    const beats = () => calls.filter(c => c.url === '/api/playback').length;
    const before = beats();
    engine.tick(5, 200);
    assert.equal(beats(), before, 'just heard from: no beat');
    crate.temporary.sentAt -= 31000;
    engine.tick(6, 200); engine.tick(6.25, 200);
    await settle();
    assert.equal(beats(), before + 1, 'one beat from timeupdate once 30 s have passed');
  } finally {
    clearInterval(crate.temporary?.timer);
  }
});

test('the next YouTube track is fetched ahead and starts without a network wait', async () => {
  const { calls, engine, crate } = await hostedCrate();
  const jobs = [];
  crate.addEventListener('job', e => jobs.push(e.detail));
  try {
    for (const id of ['AAAAAAAAAAA', 'BBBBBBBBBBB']) await crate.loadYouTube(id, { play: false });
    await crate.play(0);
    const shownJobs = jobs.length;
    engine.tick(60, 200);
    await settle();
    assert.equal(loadsOf(calls).length, 1, 'not fetched before the middle of the song');
    engine.tick(101, 200);
    await settle();
    const ahead = loadsOf(calls).at(-1).body;
    assert.equal(ahead.slot, 'next');
    assert.deepEqual(ahead.tracks, { player: 'AAAAAAAAAAA', next: 'BBBBBBBBBBB' });
    assert.equal(jobs.length, shownJobs, 'fetching ahead never shows a download card');
    assert.equal(crate.temporary.upcoming?.id, 'BBBBBBBBBBB');
    engine.tick(102, 200);
    await settle();
    assert.equal(loadsOf(calls).length, 2, 'fetched once');

    const before = loadsOf(calls).length;
    crate.onEnded();                                     // 'ended' with the screen locked
    assert.deepEqual(engine.loads.at(-1), { id: 'BBBBBBBBBBB', ready: true, opts: {} }, 'started in the same task, prepare skipped');
    assert.equal(crate.tracks[1].ready, undefined, 'the ready mark is for that one load only');
    assert.equal(crate.index, 1);
    await settle();
    assert.equal(loadsOf(calls).length, before, 'no download, no load request');
    assert.deepEqual(lastSelection(calls), { player: 'BBBBBBBBBBB' }, 'promoted from next to player in one request');

    // the queue wraps: A comes after B, and the lock screen's next uses the same path
    engine.tick(150, 200);
    await settle();
    assert.equal(crate.temporary.upcoming?.id, 'AAAAAAAAAAA');
    crate.next();
    assert.equal(engine.loads.at(-1).ready, true, 'lock-screen next starts the fetched track at once too');
  } finally {
    clearInterval(crate.temporary?.timer);
  }
});

test('the next slot follows queue changes; a refused fetch stays quiet; the player takes over a running one', async () => {
  const pending = new Set(['DDDDDDDDDDD']);
  const refuse = new Map([['EEEEEEEEEEE', { status: 429, data: { error: "You have reached today's limit." }, times: 1 }]]);
  const { calls, engine, crate } = await hostedCrate({ pending, refuse });
  const errors = [];
  crate.addEventListener('error', e => errors.push(e.detail));
  try {
    for (const id of ['AAAAAAAAAAA', 'CCCCCCCCCCC']) await crate.loadYouTube(id, { play: false });
    await crate.play(0);
    engine.tick(150, 200);
    await settle();
    assert.equal(crate.temporary.tracks.next, 'CCCCCCCCCCC');
    crate.remove(1);
    await settle();
    assert.deepEqual(lastSelection(calls), { player: 'AAAAAAAAAAA' }, 'removed from the queue: let go at once');

    await crate.loadYouTube('EEEEEEEEEEE', { play: false });
    engine.tick(151, 200);
    await settle();
    assert.equal(crate.temporary.tracks.next, undefined, 'a refused fetch clears the slot');
    assert.deepEqual(errors, [], 'and shows no error');
    const tried = loadsOf(calls).length;
    engine.tick(152, 200); engine.tick(153, 200);
    await settle();
    assert.equal(loadsOf(calls).length, tried, 'and is not tried again on every tick');

    crate.remove(1);
    await crate.loadYouTube('DDDDDDDDDDD', { play: false });
    engine.tick(154, 200);
    await settle();
    assert.equal(crate.temporary.tracks.next, 'DDDDDDDDDDD');
    pending.delete('DDDDDDDDDDD');
    crate.next();                                         // its download is still running
    await settle(20);
    const takeOver = loadsOf(calls).at(-1).body;
    assert.equal(takeOver.slot, 'player');
    assert.deepEqual(takeOver.tracks, { player: 'DDDDDDDDDDD' }, 'the player takes it over in the same request');
    assert.equal(engine.track.id, 'DDDDDDDDDDD');
  } finally {
    clearInterval(crate.temporary?.timer);
  }
});

test('nothing is fetched ahead while a loop holds the song; a busy server is asked again soon, a daily limit is not', async () => {
  const refuse = new Map([
    ['BBBBBBBBBBB', { status: 429, data: { error: 'Two tracks are loading right now. Please try again shortly.' }, times: 1 }],
    ['CCCCCCCCCCC', { status: 429, data: { error: "You have reached today's limit of 5 YouTube downloads." }, times: 1 }],
  ]);
  const { calls, engine, crate } = await hostedCrate({ refuse });
  const realNow = Date.now;
  try {
    for (const id of ['AAAAAAAAAAA', 'BBBBBBBBBBB']) await crate.loadYouTube(id, { play: false });
    await crate.play(0);
    engine.loop = true;
    engine.tick(150, 200);
    await settle();
    assert.equal(loadsOf(calls).length, 1, 'a looping song never ends: no download for what comes after it');
    engine.loop = false;
    engine.tick(151, 200);
    await settle();
    assert.equal(loadsOf(calls).at(-1).body.slot, 'next', 'the loop let go: fetched ahead');
    assert.equal(crate.temporary.tracks.next, undefined, 'busy: refused');
    const tried = loadsOf(calls).length;
    let clock = realNow() + 61000;
    Date.now = () => clock;
    engine.tick(152, 200);
    await settle();
    assert.equal(loadsOf(calls).length, tried + 1, 'busy passes: asked again a minute later');
    assert.equal(crate.temporary.tracks.next, 'BBBBBBBBBBB');

    crate.remove(1);
    await crate.loadYouTube('CCCCCCCCCCC', { play: false });
    engine.tick(153, 200);
    await settle();
    const limited = loadsOf(calls).length;
    clock += 61000;
    engine.tick(154, 200);
    await settle();
    assert.equal(loadsOf(calls).length, limited, 'the daily limit does not pass in a minute');
    clock += 10 * 60000;
    engine.tick(155, 200);
    await settle();
    assert.equal(loadsOf(calls).length, limited + 1, 'tried again after ten minutes');
  } finally {
    Date.now = realNow;
    clearInterval(crate.temporary?.timer);
  }
});

test('a stuck track is fetched again where it stopped, then the queue moves on, never in circles', async () => {
  const { calls, engine, crate } = await hostedCrate();
  try {
    for (const id of ['AAAAAAAAAAA', 'BBBBBBBBBBB']) await crate.loadYouTube(id, { play: false });
    await crate.play(0);
    engine.dispatchEvent(new CustomEvent('stuck', { detail: { track: engine.track, at: 42, network: true } }));
    await settle();
    assert.equal(engine.loads.at(-1).id, 'AAAAAAAAAAA');
    assert.equal(engine.loads.at(-1).opts.at, 42, 'reloaded at the same position');
    assert.equal(loadsOf(calls).at(-1).body.slot, 'player', 'through the server again');
    engine.dispatchEvent(new CustomEvent('stuck', { detail: { track: engine.track, at: 43 } }));
    await settle();
    assert.equal(engine.track.id, 'BBBBBBBBBBB', 'stuck again at once: the next track plays');

    const files = [{ name: 'a.mp3', size: 1, type: 'audio/mpeg' }, { name: 'b.mp3', size: 2, type: 'audio/mpeg' }];
    const local = new Crate(new StubEngine());
    local.addFiles(files);
    await settle();
    let loads = 0;
    local.engine.load = async t => { loads++; local.engine.track = t; local.engine.dispatchEvent(new CustomEvent('stuck', { detail: { track: t } })); };
    local.next();
    await settle(20);
    assert.ok(loads <= files.length + 1, `a queue of broken files stops (${loads} loads)`);
  } finally {
    clearInterval(crate.temporary?.timer);
  }
});

test('an expired lease is fetched again in the background and resumes at the same moment', async () => {
  const missing = [];
  const { calls, engine, crate } = await hostedCrate({ missing });
  try {
    await crate.loadYouTube('AAAAAAAAAAA', { play: true });
    engine.currentTime = 123;
    missing.push('AAAAAAAAAAA');
    crate.temporary.heartbeat();
    await settle(20);
    const reload = engine.loads.at(-1);
    assert.equal(reload.ready, true, 'the download ran before the swap: no silent wait');
    assert.equal(reload.opts.at, 123, 'continues where it was');
    assert.equal(reload.opts.autoplay, true);
    assert.equal(loadsOf(calls).at(-1).body.slot, 'player');
  } finally {
    clearInterval(crate.temporary?.timer);
  }
});

test('local files: several at once play the first; removing the playing one skips nothing and keeps its address until it stops', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  const engine = new StubEngine();
  const crate = new Crate(engine);
  crate.addFiles([{ name: '01 Intro.mp3', size: 10, type: 'audio/mpeg' }, { name: '02 Song.mp3', size: 20, type: 'audio/mpeg' }, { name: '03 End.mp3', size: 30, type: 'audio/mpeg' }]);
  await settle();
  assert.equal(crate.index, 0);
  assert.equal(engine.track.title, '01 Intro');
  assert.equal(engine.loads.length, 1, 'only the first started');
  assert.equal(crate.tracks[1].key, 'file:02 Song.mp3|20');

  const playing = engine.track.url;
  crate.remove(0);
  assert.equal(revoked.includes(playing), false, 'still playing: its address stays');
  crate.next();
  await settle();
  assert.equal(engine.track.title, '02 Song', 'Next plays the song that moved up, not the one after it');
  assert.equal(revoked.includes(playing), true, 'let go once another track plays');
  crate.remove(1);
  assert.equal(revoked.includes(crate.tracks.at(-1)?.url), false);
});

test('a download card goes when a local file takes the slot', async () => {
  const { crate } = await hostedCrate({ pending: new Set(['AAAAAAAAAAA']) });
  const jobs = [];
  crate.addEventListener('job', e => jobs.push(e.detail));
  try {
    crate.prepareTrack(track('AAAAAAAAAAA'), 'player').catch(() => {});
    await settle();
    assert.equal(jobs.at(-1)?.state, 'downloading');
    await crate.prepareTrack({ source: 'file', id: 'file-9', url: 'blob:x' }, 'player');
    assert.equal(jobs.at(-1), null, 'superseded: the card is cleared');
  } finally {
    clearInterval(crate.temporary?.timer);
  }
});

test('a tap sync for a local file is kept under its name and size, not its per-load id', () => {
  const a = { id: 'file-1', key: 'file:song.mp3|1234', source: 'file', title: 'song' };
  const b = { id: 'file-1', key: 'file:other.mp3|99', source: 'file', title: 'other' };
  assert.notEqual(syncKey(a), syncKey(b), 'the same per-load id on another day is another file');
  assert.equal(syncKey({ id: 'abcdefghijk', source: 'youtube' }), 'abcdefghijk');
  storage.set('visulaserz:lyricSyncs', JSON.stringify({ 'file-1': { lrc: '[00:01.00]stale', at: 1 }, 'file:song.mp3|1234': { lrc: '[00:01.00]mine', at: 2 } }));
  assert.equal(savedSync(b), null, 'a stale per-load sync is never shown on another file');
  assert.equal(savedSync(a), '[00:01.00]mine');
  assert.deepEqual(Object.keys(JSON.parse(storage.get('visulaserz:lyricSyncs'))), ['file:song.mp3|1234'], 'stale entries are dropped');
});
