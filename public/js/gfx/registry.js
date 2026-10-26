import { clamp, store } from '../util.js';
import NOVA from '../../scenes/nova.js';

// The scene registry. A scene is a plugin: one module in /scenes that default-exports
// { id, name, group, blurb, tags, energy, particles, trails, zoom, spin, frag }. The market reads
// catalog.json (the same fields without the shader), so browsing costs nothing; a scene's code is
// only imported when it is on the strip or being tried. Nova is built in, which is what lets the
// renderer always have something to draw, whatever happens to the network or to storage.

const SCENES_URL = typeof __VZ_SCENES_URL__ === 'string'
  ? new URL(__VZ_SCENES_URL__, location.href) : new URL('../../scenes/', import.meta.url);
const FILE_RE = /^[a-z0-9-]+\.js$/;
const THUMB_RE = /^thumbs\/[a-z0-9-]+\.webp$/;
export const sceneUrl = (relative) => new URL(relative, SCENES_URL).href;
const ID_RE = /^[a-z0-9-]{1,40}$/;
const MAX_SOURCE = 64 * 1024;

// What a first-time visitor finds on the strip. Everything else waits in the market.
const STARTER_PACK = ['lasers', 'bars', 'tunnel', 'voyage', 'highway', 'aurora', 'rain', 'bosphorus', 'vinyl'];

export const BUILT_IN = NOVA.id;
export const CUSTOM_GROUP = 'Custom';

const num = (v, lo, hi, def) => (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : def);
const hasMain = (s) => typeof s === 'string' && s.length <= MAX_SOURCE && /\bvoid\s+main\s*\(/.test(s);

// The optional extra shaders a market scene may bring (glsl.js, "scene extras"). Anything that is
// not shaped right is dropped, and the scene still draws its picture.
function extraPoints(p) {
  if (!p || typeof p !== 'object' || !hasMain(p.vert)) return null;
  return { count: Math.round(num(p.count, 1, 20000, 1000)), vert: p.vert, frag: hasMain(p.frag) ? p.frag : null, blend: p.blend === 'alpha' ? 'alpha' : 'add' };
}
function extraSim(s) {
  if (!s || typeof s !== 'object' || !hasMain(s.frag)) return null;
  return { frag: s.frag, height: Math.round(num(s.height, 64, 1024, 360)), steps: Math.round(num(s.steps, 1, 16, 1)) };
}

// Every scene passes through here, whether it came from /scenes, from storage or from a dropped
// file, so the renderer and the knobs never meet a value outside the range they were built for.
export function normalise(raw) {
  if (!raw || typeof raw.frag !== 'string' || !ID_RE.test(raw.id || '')) return null;
  return {
    id: raw.id,
    name: String(raw.name || raw.id).slice(0, 28),
    group: String(raw.group || CUSTOM_GROUP).slice(0, 16),
    blurb: String(raw.blurb || '').slice(0, 140),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 6) : [],
    energy: num(raw.energy, 0, 1, 0.5),
    particles: [0, 1, 2, 3, 4].includes(Number(raw.particles)) ? Number(raw.particles) : 0,
    trails: num(raw.trails, 0, 0.985, 0.3),
    zoom: num(raw.zoom, 0.97, 1.06, 1),
    spin: num(raw.spin, -0.02, 0.02, 0),
    ambience: raw.ambience === 'rain' ? 'rain' : undefined,
    custom: !!raw.custom,
    frag: raw.frag,
    points: raw.custom ? null : extraPoints(raw.points),          // a dropped .glsl file is one shader and nothing more
    sim: raw.custom ? null : extraSim(raw.sim),
  };
}

// A dropped .glsl file becomes a scene. Settings ride along as comments, so the file stays a plain
// shader that any editor highlights:   // @name Deep Field    // @trails 0.4    // @particles 1
export function parseSceneSource(text, filename = 'scene.glsl') {
  if (typeof text !== 'string' || !/\bvoid\s+main\s*\(/.test(text)) throw new Error('That file has no “void main()”, so it is not a scene shader.');
  if (text.length > MAX_SOURCE) throw new Error('That shader is larger than 64 KB.');
  const meta = {};
  for (const m of text.matchAll(/^\s*\/\/\s*@(\w+)[ \t]+(.+?)\s*$/gm)) meta[m[1].toLowerCase()] = m[2];
  for (const k of ['energy', 'particles', 'trails', 'zoom', 'spin']) if (meta[k]) [meta[k]] = meta[k].split(/\s+/);   // a note may follow the number
  const name = (meta.name || filename.replace(/\.[^.]+$/, '')).trim().slice(0, 28) || 'Untitled';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'scene';
  return normalise({
    ...meta,
    id: `custom-${slug}`,
    name,
    group: CUSTOM_GROUP,
    tags: meta.tags ? meta.tags.split(/[\s,]+/).filter(Boolean) : [],
    custom: true,
    frag: text.replace(/\r\n?/g, '\n').replace(/^[ \t]*#version.*$/m, ''),   // the shared header already declares it; line numbers stay put
  });
}

export class SceneRegistry extends EventTarget {
  #loading = new Map();
  #attempts = new Map();
  #strip = [NOVA];
  #missing = [];                                   // on the strip, but their code could not be fetched this time
  #removed = new Set();                            // taken off in this tab: another tab's copy must not bring them back

  constructor() {
    super();
    this.catalog = [];                             // market entries: no shader code in here
    this.catalogError = null;
    this.loaded = new Map([[NOVA.id, NOVA]]);      // id → scene with its shader: installed, or only tried
    this.installed = [NOVA.id];
  }

  // Installed scenes in strip order: the catalog's order (grouped), then the user's own.
  get scenes() { return this.#strip; }
  get(id) { return this.loaded.get(id); }
  entry(id) { return this.catalog.find((e) => e.id === id); }
  isInstalled(id) { return this.installed.includes(id); }

  // Everything the market can show: the catalogue plus the user's own scenes. Without a catalogue
  // (offline, a failed fetch) it lists what is already held: the strip first, then anything taken
  // off it this session, which can still be put back because its code is loaded.
  get shelf() {
    const card = ({ frag, ...rest }) => rest;
    const all = [...this.loaded.values()];
    const held = [...this.#strip, ...all.filter((s) => !this.installed.includes(s.id))].filter((s) => !s.custom);
    return [...(this.catalog.length ? this.catalog : held.map(card)), ...all.filter((s) => s.custom).map(card)];
  }

  async init() {
    // Storage is outside our control (another tab, an old version, a curious user): take nothing on trust.
    const own = store.get('customScenes', []);
    for (const raw of Array.isArray(own) ? own : []) {
      const scene = raw && typeof raw === 'object' ? normalise({ ...raw, custom: true, group: CUSTOM_GROUP }) : null;
      if (scene && scene.id.startsWith('custom-') && scene.frag.length <= MAX_SOURCE) this.loaded.set(scene.id, scene);
    }
    await this.refreshCatalog();

    const saved = store.get('scenes', null);
    let wanted = saved?.installed;
    if (!Array.isArray(wanted)) {
      // First run with a market: the starter pack, plus whatever scene was showing last time.
      wanted = [...STARTER_PACK];
      const last = store.get('settings', {}).scene;
      if (last) wanted.push(last);
    }
    wanted = [...new Set(wanted)].filter((id) => typeof id === 'string' && ID_RE.test(id) && id !== NOVA.id && !id.startsWith('custom-'));
    if (this.catalog.length) wanted = wanted.filter((id) => this.entry(id));   // a scene that left the market
    const results = await Promise.allSettled(wanted.map((id) => this.load(id, { prompt: false })));
    const ok = wanted.filter((_, i) => results[i].status === 'fulfilled');
    this.#missing = wanted.filter((_, i) => results[i].status !== 'fulfilled');
    results.forEach((r, i) => r.status === 'rejected' && console.warn(`[scenes] ${wanted[i]}:`, r.reason?.message || r.reason));
    this.installed = [NOVA.id, ...ok, ...[...this.loaded.values()].filter((s) => s.custom).map((s) => s.id)];
    this.#sort();
    if (!saved) this.#persist();
  }

  async refreshCatalog() {
    try {
      const res = await fetch(new URL('catalog.json', SCENES_URL), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.catalog = (data.scenes || [])
        .filter((e) => ID_RE.test(e.id || '') && FILE_RE.test(e.file || ''))
        .map((e) => ({
          ...e,
          name: String(e.name || e.id),
          group: String(e.group || 'Lab'),
          blurb: String(e.blurb || ''),
          tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
          energy: Number.isFinite(e.energy) ? e.energy : 0.5,
          thumb: THUMB_RE.test(e.thumb || '') ? e.thumb : null,
        }));
      this.catalogError = null;
    } catch (e) {
      console.warn('[scenes] the market catalogue could not be read:', e.message);
      this.catalogError = e.message;
    }
    this.#sort();
    this.#emit('catalog');
    return !this.catalogError;
  }

  // Fetch a scene's code without putting it on the strip (this is what "Try" does).
  load(id, { prompt = true } = {}) {
    if (this.loaded.has(id)) return Promise.resolve(this.loaded.get(id));
    if (this.#loading.has(id)) return this.#loading.get(id);
    const entry = this.entry(id);
    const file = entry?.file || `${id}.js`;
    if (!FILE_RE.test(file)) return Promise.reject(new Error(`“${id}” is not a scene.`));
    // A module that failed to load stays failed under its URL for the life of the page, so a retry needs a new one.
    const n = this.#attempts.get(id) || 0;
    this.#attempts.set(id, n + 1);
    const job = (async () => {
      if (entry?.requiresAccount) {
        const response = await fetch(`/api/market/access?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!response.ok) {
          if (response.status === 401 && prompt) window.dispatchEvent(new Event('visulaserz:auth-required'));
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'This scene is currently unavailable.');
        }
      }
      return import(new URL(n ? `${file}?retry=${n}` : file, SCENES_URL).href);
    })()
      .then((m) => {
        const scene = normalise({ ...entry, ...m.default, custom: false });
        if (!scene || scene.id !== id) throw new Error(`${file} does not export the “${id}” scene.`);
        this.loaded.set(id, scene);
        return scene;
      })
      .finally(() => this.#loading.delete(id));
    this.#loading.set(id, job);
    return job;
  }

  async install(id) {
    const scene = await this.load(id);
    if (!this.installed.includes(id)) {
      this.installed.push(id);
      this.#removed.delete(id);
      this.#missing = this.#missing.filter((m) => m !== id);
      this.#sort();
      this.#persist();
      this.#emit('install', id);
    }
    return scene;
  }

  // Takes a scene off the strip. A market scene stays one click away; a scene of the user's own
  // exists nowhere else, so removing it deletes it.
  uninstall(id) {
    if (id === NOVA.id || !this.installed.includes(id)) return false;
    this.installed = this.installed.filter((i) => i !== id);
    this.#removed.add(id);
    if (this.loaded.get(id)?.custom) this.loaded.delete(id);
    this.#sort();
    this.#persist();
    this.#emit('uninstall', id);
    return true;
  }

  // Adds (or, with the same name, replaces) one of the user's own scenes. The caller has compiled it.
  addCustom(scene) {
    const replaced = this.loaded.has(scene.id);
    this.#removed.delete(scene.id);
    this.loaded.set(scene.id, scene);
    if (!this.installed.includes(scene.id)) this.installed.push(scene.id);
    this.#sort();
    this.#persist();
    this.#emit(replaced ? 'replace' : 'install', scene.id);
    return replaced;
  }

  #sort() {
    const rank = (id) => { const i = this.catalog.findIndex((e) => e.id === id); return i < 0 ? Infinity : i; };
    const order = new Map(this.installed.map((id, i) => [id, [rank(id), i]]));
    this.installed.sort((a, b) => (order.get(a)[0] - order.get(b)[0]) || (order.get(a)[1] - order.get(b)[1]));
    this.#strip = this.installed.map((id) => this.loaded.get(id)).filter(Boolean);
  }

  // Storage is shared with every other tab of the app, and a stale one would otherwise wipe what
  // was added elsewhere (a custom scene exists nowhere else). So this writes what this tab knows
  // plus what it has never seen, minus what it removed itself. init() validates all of it on the way in.
  #persist() {
    const mine = [...this.installed.filter((id) => !this.loaded.get(id)?.custom), ...this.#missing];
    const theirs = store.get('scenes', null)?.installed;
    const unseen = (Array.isArray(theirs) ? theirs : []).filter((id) => typeof id === 'string' && ID_RE.test(id)
      && !id.startsWith('custom-') && !mine.includes(id) && !this.#removed.has(id));
    store.set('scenes', { v: 1, installed: [...mine, ...unseen] });

    const own = [...this.loaded.values()].filter((s) => s.custom);
    const stored = store.get('customScenes', []);
    const foreign = (Array.isArray(stored) ? stored : []).filter((s) => s && typeof s.id === 'string'
      && !this.loaded.has(s.id) && !this.#removed.has(s.id));
    store.set('customScenes', [...foreign, ...own]);
  }

  #emit(type, id = null) {
    this.dispatchEvent(new CustomEvent('change', { detail: { type, id } }));
  }
}
