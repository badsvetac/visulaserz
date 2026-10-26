import fs from 'node:fs/promises';
import path from 'node:path';

const UUID = /^[a-f0-9-]{36}$/;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
// 'next' is the queue's following YouTube track, fetched while the current one plays so the
// song after it can start at once, with the phone locked too.
export const SLOTS = new Set(['player', 'ambience', 'deckA', 'deckB', 'next']);

// Only live browser selections own audio. Library JSON is a bookmark, never a lease.
// Serialize selection changes and deletion so a late heartbeat cannot undo a switch.
// A tab that still holds a selection keeps it for holdMs: a locked or sleeping phone sends no
// heartbeats, yet is still playing (or paused on the lock screen) and will ask for the rest of
// the song. One that holds nothing lapses after ttlMs; a closing tab clears itself at once.
export function createPlaybackCache({ root, sessionAlive, isPersistent = () => false, isBusy = () => false, cancel = () => {}, ttlMs = 150000, holdMs = 30 * 60000, now = Date.now }) {
  const clients = new Map();
  let tail = Promise.resolve();
  const locked = fn => {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  };
  const live = c => now() - c.touched < (Object.keys(c.tracks).length ? holdMs : ttlMs) && sessionAlive(c.session);
  // A restart or deploy forgets every lease while the tabs keep playing. Tracks that were complete
  // on disk at startup stay servable for one hold period, so the tabs can claim them again with
  // their next heartbeat; partial downloads and audio without a bookmark still go at once.
  const graceUntil = now() + holdMs;
  const booted = new Set(); // `${owner}:${id}`
  let primed = false;
  const retained = (owner, id) => isPersistent(owner)
    || (booted.has(`${owner}:${id}`) && now() < graceUntil)
    || [...clients.values()].some(c => c.owner === owner && live(c) && Object.values(c.tracks).includes(id));

  async function prime() {
    if (primed) return;
    primed = true;
    const owners = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const owner of owners) {
      if (!owner.isDirectory() || !UUID.test(owner.name)) continue;
      const names = new Set(await fs.readdir(path.join(root, owner.name)).catch(() => []));
      for (const name of names) {
        const id = name.slice(0, 11);
        if (name === `${id}.json` && VIDEO.test(id) && names.has(`${id}.mp3`)) booted.add(`${owner.name}:${id}`);
      }
    }
  }

  async function clean(owner) {
    if (!UUID.test(owner)) return;
    const directory = path.join(root, owner);
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    const persistent = isPersistent(owner);
    const files = new Set(entries.filter(e => e.isFile()).map(e => e.name));
    for (const entry of entries) {
      // Preserve bookmarks; never follow symlinks or leave this user's cache directory.
      const id = entry.name.slice(0, 11);
      if (!entry.isFile() || !VIDEO.test(id) || entry.name[11] !== '.' || entry.name.endsWith('.json')) continue;
      if (persistent) {
        // Keep completed admin tracks, but discard abandoned conversion/partial files.
        if (isBusy(owner, id) || (files.has(`${id}.json`) && files.has(`${id}.mp3`) && [id + '.mp3', id + '.jpg'].includes(entry.name))) continue;
      } else if (retained(owner, id)) continue;
      if (isBusy(owner, id)) { cancel(owner, id); continue; }
      await fs.unlink(path.join(directory, entry.name)).catch(e => { if (e.code !== 'ENOENT') throw e; });
    }
    // A cancelled download may not have created a file yet.
    cancel(owner, null, id => retained(owner, id));
  }

  function validate(body) {
    if (!body || !UUID.test(body.clientId || '') || !Number.isSafeInteger(body.revision) || body.revision < 1 || !body.tracks || typeof body.tracks !== 'object' || Array.isArray(body.tracks)) throw new Error('Invalid playback selection. Reload the page.');
    const entries = Object.entries(body.tracks);
    if (entries.some(([slot, id]) => !SLOTS.has(slot) || !VIDEO.test(id))) throw new Error('Invalid playback selection.');
    return Object.fromEntries(entries);
  }

  async function update(owner, session, body, action = async () => {}) {
    const tracks = validate(body);
    if (!UUID.test(owner) || !session) throw new Error('Sign in again.');
    return locked(async () => {
      await prime();
      if (!sessionAlive(session)) throw new Error('Sign in again.');
      const key = `${session}:${body.clientId}`;
      const previous = clients.get(key);
      if (previous && previous.revision >= body.revision) throw new Error('Playback selection was superseded.');
      // Bound abandoned tabs even when a client deliberately submits fresh identifiers. At eight, the
      // one heard from longest ago gives way instead of this one being refused: a phone that reloads
      // its page (iOS does so after a while in the background) leaves its old lease behind, held.
      if (!previous) {
        const held = [...clients].filter(([, c]) => c.owner === owner && live(c) && Object.keys(c.tracks).length);
        if (held.length >= 8) clients.delete(held.reduce((a, b) => (b[1].touched < a[1].touched ? b : a))[0]);
      }
      clients.set(key, { owner, session, tracks, revision: body.revision, touched: now() });
      await clean(owner);
      return action();
    });
  }

  // The player is fetching this track's audio right now (a range request): whoever holds it is
  // evidently still there. Never revives a lease that has already lapsed.
  function touch(owner, id) {
    for (const c of clients.values()) if (c.owner === owner && live(c) && Object.values(c.tracks).includes(id)) c.touched = now();
  }

  const sweep = () => locked(async () => {
    await prime();
    const affected = new Set([...clients.values()].map(c => c.owner));
    for (const [key, c] of clients) if (!live(c)) clients.delete(key);
    if (booted.size && now() >= graceUntil) booted.clear();
    const owners = await fs.readdir(root, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    for (const owner of owners) if (owner.isDirectory() && UUID.test(owner.name)) await clean(owner.name);
    for (const owner of affected) cancel(owner, null, id => retained(owner, id));
  });
  const revoke = session => locked(async () => {
    const owners = new Set();
    for (const [key, c] of clients) if (c.session === session) { clients.delete(key); owners.add(c.owner); }
    // Signing out lets go of that account's audio from before a restart as well.
    for (const key of booted) if (owners.has(key.slice(0, 36))) booted.delete(key);
    for (const owner of owners) await clean(owner);
  });
  return { update, sweep, revoke, retained, touch, prune: owner => locked(() => clean(owner)) };
}
