import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createPlaybackCache, SLOTS } from '../lib/playback-cache.js';

const exists = async p => !!await fs.stat(p).catch(() => null);
const removeRoot = async root => {
  if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('visulaserz-playback-')) await fs.rm(root, { recursive: true, force: true });
};

test('temporary audio follows selections, sessions and heartbeats, preserving bookmarks', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visulaserz-playback-'));
  const owner = crypto.randomUUID(), other = crypto.randomUUID();
  const a = 'AAAAAAAAAAA', b = 'BBBBBBBBBBB';
  const sessions = new Set(['s1', 's2', 'other']);
  const busy = new Set();
  const cancelled = new Set();
  let now = 100;
  const cache = createPlaybackCache({ root, sessionAlive: s => sessions.has(s), ttlMs: 1000, holdMs: 5000, now: () => now,
    isBusy: (u, id) => busy.has(`${u}:${id}`),
    cancel: (u, id, retained) => {
      for (const key of busy) if (key.startsWith(u + ':') && (id ? key.endsWith(id) : !retained(key.split(':')[1]))) cancelled.add(key);
    },
  });
  const c1 = crypto.randomUUID(), c2 = crypto.randomUUID();
  const selection = (clientId, revision, tracks) => ({ clientId, revision, tracks });
  const file = (u, id, extension = 'mp3') => path.join(root, u, `${id}.${extension}`);
  async function fixture(u, id) {
    await fs.mkdir(path.join(root, u), { recursive: true });
    await fs.writeFile(file(u, id), 'audio');
    await fs.writeFile(file(u, id, 'jpg'), 'thumbnail');
    await fs.writeFile(file(u, id, 'json'), JSON.stringify({ id }));
  }
  try {
    await cache.update(owner, 's1', selection(c1, 1, { player: a }));
    await fixture(owner, a);
    now += 900;
    await cache.update(owner, 's1', selection(c1, 2, { player: a }));
    now += 900;
    await cache.sweep();
    assert.equal(await exists(file(owner, a)), true, 'paused/idle selection survives renewed heartbeat');

    await cache.update(owner, 's2', selection(c2, 1, { player: a }));
    await cache.update(owner, 's1', selection(c1, 3, { player: b }));
    await fixture(owner, b);
    assert.equal(await exists(file(owner, a)), true, 'another tab still needs the old audio');
    await cache.update(owner, 's2', selection(c2, 2, {}));
    assert.equal(await exists(file(owner, a)), false, 'last tab releases old audio');
    assert.equal(await exists(file(owner, a, 'jpg')), false);
    assert.equal(await exists(file(owner, a, 'json')), true, 'bookmark survives');
    await assert.rejects(cache.update(owner, 's1', selection(c1, 2, { player: a })), /superseded/);
    assert.equal(cache.retained(owner, b), true, 'stale heartbeat cannot undo track change');
    await assert.rejects(cache.update(owner, 's1', selection(c1, 4, { evil: '../../x' })), /Invalid/);

    await cache.update(other, 'other', selection(crypto.randomUUID(), 1, { player: a }));
    await fixture(other, a);
    sessions.delete('s1');
    await cache.revoke('s1');
    assert.equal(await exists(file(owner, b)), false, 'sign out releases audio');
    assert.equal(await exists(file(other, a)), true, 'different account is unaffected');
    await assert.rejects(cache.update(owner, 's1', selection(c1, 5, { player: a })), /Sign in/);
    now += 1001;
    await cache.sweep();
    assert.equal(await exists(file(other, a)), true, 'a held selection outlives the short lease: a locked phone sends no heartbeat');
    now += 4000;
    await cache.sweep();
    assert.equal(await exists(file(other, a)), false, 'silent disconnect expires after the hold');

    await cache.update(owner, 's2', selection(c2, 3, { player: a }));
    await fixture(owner, a);
    busy.add(`${owner}:${a}`);
    await cache.update(owner, 's2', selection(c2, 4, { player: b }));
    assert.equal(cancelled.has(`${owner}:${a}`), true, 'switch cancels unfinished download');
    assert.equal(await exists(file(owner, a)), true, 'do not unlink under a live writer');
    busy.clear();
    await cache.prune(owner);
    assert.equal(await exists(file(owner, a)), false, 'partial files removed after writer stops');
  } finally {
    await removeRoot(root);
  }
});

test('the player fetching audio keeps its lease; the next slot holds the following track until it is promoted', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visulaserz-playback-'));
  const owner = crypto.randomUUID(), client = crypto.randomUUID();
  const a = 'AAAAAAAAAAA', b = 'BBBBBBBBBBB', c = 'CCCCCCCCCCC';
  let now = 100;
  const cache = createPlaybackCache({ root, sessionAlive: () => true, ttlMs: 1000, holdMs: 5000, now: () => now });
  const file = id => path.join(root, owner, `${id}.mp3`);
  const fixture = async id => {
    await fs.mkdir(path.join(root, owner), { recursive: true });
    await fs.writeFile(file(id), 'audio');
    await fs.writeFile(path.join(root, owner, `${id}.json`), '{}');
  };
  try {
    assert.equal(SLOTS.has('next'), true, 'the server accepts a next slot');
    await cache.update(owner, 'session', { clientId: client, revision: 1, tracks: { player: a, next: b } });
    await fixture(a); await fixture(b);
    assert.equal(cache.retained(owner, a) && cache.retained(owner, b), true, 'both the playing and the fetched-ahead track are held');

    now += 4000;
    cache.touch(owner, a);                       // a range request from the player
    now += 4000;
    await cache.sweep();
    assert.equal(await exists(file(a)), true, 'media requests renew the lease');
    now += 5001;
    cache.touch(owner, a);                       // too late: the lease had lapsed
    await cache.sweep();
    assert.equal(await exists(file(a)), false, 'a lapsed lease is not revived by a media request');

    await cache.update(owner, 'session', { clientId: client, revision: 2, tracks: { player: a, next: b } });
    await fixture(a); await fixture(b);
    await cache.update(owner, 'session', { clientId: client, revision: 3, tracks: { player: b } });
    assert.equal(await exists(file(b)), true, 'promotion moves the file from next to player in one step');
    assert.equal(await exists(file(a)), false, 'the finished song is let go');
    await fixture(c);
    await cache.update(owner, 'session', { clientId: client, revision: 4, tracks: { player: b, next: c } });
    await cache.update(owner, 'session', { clientId: client, revision: 5, tracks: { player: b, next: a } });
    assert.equal(await exists(file(c)), false, 'a re-targeted next slot releases the track that no longer comes next');
  } finally {
    await removeRoot(root);
  }
});

test('a restart keeps finished tracks for one hold period so open tabs can claim them again', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visulaserz-playback-'));
  const owner = crypto.randomUUID(), other = crypto.randomUUID();
  const a = 'AAAAAAAAAAA', b = 'BBBBBBBBBBB', c = 'CCCCCCCCCCC';
  const at = (u, name) => path.join(root, u, name);
  let now = 100;
  try {
    for (const u of [owner, other]) {
      await fs.mkdir(path.join(root, u));
      for (const name of [`${a}.mp3`, `${a}.jpg`, `${a}.json`, `${b}.mp3`, `${b}.json`, `${c}.mp3`, `${c}.webm.part`]) await fs.writeFile(at(u, name), 'fixture');
    }
    const sessions = new Set(['s1']);
    const cache = createPlaybackCache({ root, sessionAlive: s => sessions.has(s), ttlMs: 1000, holdMs: 5000, now: () => now });
    await cache.sweep();                          // the server's first sweep, before it listens
    assert.equal(await exists(at(owner, `${a}.mp3`)), true, 'a finished track survives the restart');
    assert.equal(await exists(at(owner, `${a}.jpg`)), true);
    assert.equal(cache.retained(owner, a), true, 'and is still served before its tab re-claims it');
    assert.equal(cache.retained(other, a), true);
    assert.equal(await exists(at(owner, `${c}.mp3`)), false, 'audio without a bookmark is an orphan');
    assert.equal(await exists(at(owner, `${c}.webm.part`)), false, 'a partial download is an orphan');
    assert.equal(cache.retained(other, c), false);

    now += 3000;
    await cache.update(owner, 's1', { clientId: crypto.randomUUID(), revision: 1, tracks: { player: a } });
    now += 2500;                                  // past the grace
    await cache.sweep();
    assert.equal(await exists(at(owner, `${a}.mp3`)), true, 're-claimed by its tab');
    assert.equal(await exists(at(owner, `${b}.mp3`)), false, 'nobody re-claimed it');
    assert.equal(await exists(at(other, `${a}.mp3`)), false, 'nobody re-claimed it');
    assert.equal(await exists(at(other, `${a}.json`)), true, 'the track list survives');

    const again = createPlaybackCache({ root, sessionAlive: s => sessions.has(s), ttlMs: 1000, holdMs: 5000, now: () => now });
    await again.update(owner, 's1', { clientId: crypto.randomUUID(), revision: 1, tracks: {} });
    sessions.delete('s1');
    await again.revoke('s1');
    assert.equal(await exists(at(owner, `${a}.mp3`)), false, 'signing out lets go of audio kept through a restart');
  } finally {
    await removeRoot(root);
  }
});

test('at eight held tabs, a new one replaces the tab heard from longest ago instead of being refused', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visulaserz-playback-'));
  const owner = crypto.randomUUID();
  const ids = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC', 'DDDDDDDDDDD', 'EEEEEEEEEEE', 'FFFFFFFFFFF', 'GGGGGGGGGGG', 'HHHHHHHHHHH', 'IIIIIIIIIII'];
  const tabs = ids.map(() => crypto.randomUUID());
  let now = 100;
  const cache = createPlaybackCache({ root, sessionAlive: () => true, ttlMs: 1000, holdMs: 60000, now: () => now });
  const file = id => path.join(root, owner, `${id}.mp3`);
  try {
    await fs.mkdir(path.join(root, owner));
    // a phone that reloaded its page eight times: every load is a new tab holding a song
    for (let i = 0; i < 8; i++) {
      now += 100;
      await cache.update(owner, 'session', { clientId: tabs[i], revision: 1, tracks: { player: ids[i] } });
      await fs.writeFile(file(ids[i]), 'audio');
      await fs.writeFile(path.join(root, owner, `${ids[i]}.json`), '{}');
    }
    now += 100;
    await cache.update(owner, 'session', { clientId: tabs[0], revision: 2, tracks: { player: ids[0] } });   // the first is still playing
    await cache.update(owner, 'session', { clientId: tabs[8], revision: 1, tracks: { player: ids[8] } });
    assert.equal(cache.retained(owner, ids[8]), true, 'the ninth tab is not refused');
    assert.equal(await exists(file(ids[1])), false, 'the tab heard from longest ago gave way');
    assert.equal(await exists(file(ids[0])), true, 'a tab that is still heard from keeps its song');
    assert.equal(ids.slice(2, 8).every(id => cache.retained(owner, id)), true);
  } finally {
    await removeRoot(root);
  }
});

test('permanent account survives switches, logout, expiry and restart; partials still disappear', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visulaserz-playback-'));
  const owner = crypto.randomUUID(), regular = crypto.randomUUID(), clientId = crypto.randomUUID();
  const id = 'AAAAAAAAAAA';
  let alive = true, now = 100;
  const options = { root, sessionAlive: () => alive, isPersistent: user => user === owner, ttlMs: 1000, holdMs: 1500, now: () => now };
  const cache = createPlaybackCache(options);
  const media = user => path.join(root, user, `${id}.mp3`);
  try {
    for (const user of [owner, regular]) {
      await fs.mkdir(path.join(root, user));
      for (const ext of ['mp3','jpg','json','webm.part']) await fs.writeFile(path.join(root, user, `${id}.${ext}`), 'fixture');
    }
    await cache.update(owner, 'session', { clientId, revision: 1, tracks: { player: id } });
    await cache.update(owner, 'session', { clientId, revision: 2, tracks: {} });
    assert.equal(await fs.readFile(media(owner), 'utf8'), 'fixture');
    await cache.revoke('session');
    alive = false; now += 2000;
    await cache.sweep();
    assert.equal(await fs.readFile(media(owner), 'utf8'), 'fixture');
    assert.equal(await fs.stat(media(regular)).then(() => true, () => false), false);
    assert.equal(await fs.stat(path.join(root, owner, `${id}.webm.part`)).then(() => true, () => false), false);
    await createPlaybackCache(options).sweep();
    assert.equal(await fs.readFile(media(owner), 'utf8'), 'fixture');
  } finally {
    await removeRoot(root);
  }
});
