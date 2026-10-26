import { clamp, store } from '../util.js';

// The tool registry: the market's second shelf. A tool is a plugin, one module in /tools that
// default-exports { id, name, group, blurb, tags, size, resizable, create(host, mount) }. The
// market reads catalog.json (the same fields without the code), and a tool's module is only
// fetched when it is opened. Which tools are on the desk is the user's to keep.

const TOOLS_URL = typeof __VZ_TOOLS_URL__ === 'string'
  ? new URL(__VZ_TOOLS_URL__, location.href) : new URL('../../tools/', import.meta.url);
const ID_RE = /^[a-z0-9-]{1,40}$/;
const FILE_RE = /^[a-z0-9-]+\.js$/;
const THUMB_RE = /^thumbs\/[a-z0-9-]+\.svg$/;
export const toolUrl = (relative) => new URL(relative, TOOLS_URL).href;
export const TOOL_GROUPS = ['Studio', 'Pads', 'Rhythm', 'Instruments', 'FX'];

// What someone finds on their desk the first time: the Studio, one click away.
const STARTER = ['studio'];

const num = (v, lo, hi, def) => (Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : def);

// Every tool passes through here, so the desk never meets a size it cannot lay out.
export function normaliseTool(raw, entry = {}) {
  if (!raw || typeof raw.create !== 'function' || !ID_RE.test(raw.id || '')) return null;
  const w = Math.round(num(raw.size?.w, 160, 1200, 300));
  const h = Math.round(num(raw.size?.h, 110, 800, 240));
  const r = raw.resizable;
  return {
    id: raw.id,
    name: String(raw.name || entry.name || raw.id).slice(0, 24),
    group: TOOL_GROUPS.includes(raw.group) ? raw.group : 'FX',
    blurb: String(raw.blurb || entry.blurb || '').slice(0, 160),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 6) : [],
    size: { w, h },
    resizable: r ? {
      minW: Math.round(num(r.minW, 160, w, Math.min(w, 220))), minH: Math.round(num(r.minH, 110, h, Math.min(h, 180))),
      maxW: Math.round(num(r.maxW, w, 1800, 760)), maxH: Math.round(num(r.maxH, h, 1100, 680)),
    } : null,
    create: raw.create,
  };
}

export class ToolRegistry extends EventTarget {
  #loading = new Map();
  #attempts = new Map();

  constructor() {
    super();
    this.catalog = [];                             // market entries: no code in here
    this.catalogError = null;
    this.loaded = new Map();                       // id → tool with its create()
    const saved = store.get('tools', null);
    this.installed = Array.isArray(saved?.installed)
      ? [...new Set(saved.installed.filter((id) => typeof id === 'string' && ID_RE.test(id)))]
      : [...STARTER];
    if (!saved) this.#persist();
  }

  get(id) { return this.loaded.get(id); }
  entry(id) { return this.catalog.find((e) => e.id === id); }
  isInstalled(id) { return this.installed.includes(id); }
  // Installed tools in shelf order, for the Perform rack's tray.
  get desk() { return this.catalog.filter((e) => this.installed.includes(e.id)); }

  async init() {
    await this.refreshCatalog();
    // a tool that left the market leaves the desk too
    if (this.catalog.length) {
      const kept = this.installed.filter((id) => this.entry(id));
      if (kept.length !== this.installed.length) { this.installed = kept; this.#persist(); }
    }
    // the Studio arrived after the first tools: a desk set up before it gets it once, at the front
    if (this.entry('studio') && !store.get('studioOffered', false)) {
      store.set('studioOffered', true);
      if (!this.installed.includes('studio')) { this.installed.unshift('studio'); this.#persist(); }
    }
    // Eight tools were out of the market for an hour on 2026-10-05, and a desk opened then lost
    // them. The ones it had used (the desk still remembers where their panels were) come back.
    if (this.catalog.length && !store.get('toolsBack', false)) {
      store.set('toolsBack', true);
      const used = Object.keys(store.get('toolDesk', null)?.at || {});
      const back = ['touchfx', 'roll', 'stepgate', 'drums', 'chop', 'chords', 'pump', 'lofi']
        .filter((id) => used.includes(id) && this.entry(id) && !this.installed.includes(id));
      if (back.length) { this.installed.push(...back); this.#persist(); }
    }
  }

  async refreshCatalog() {
    try {
      const res = await fetch(new URL('catalog.json', TOOLS_URL), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.catalog = (data.tools || [])
        .filter((e) => ID_RE.test(e.id || '') && FILE_RE.test(e.file || ''))
        .map((e) => ({
          id: e.id,
          file: e.file,
          name: String(e.name || e.id),
          group: TOOL_GROUPS.includes(e.group) ? e.group : 'FX',
          blurb: String(e.blurb || ''),
          tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
          thumb: THUMB_RE.test(e.thumb || '') || /^thumbs\/[a-z0-9-]+-[0-9a-f]{12}\.svg$/.test(e.thumb || '') ? e.thumb : null,
        }));
      this.catalogError = null;
    } catch (e) {
      console.warn('[tools] the tool catalogue could not be read:', e.message);
      this.catalogError = e.message;
    }
    this.#emit('catalog');
    return !this.catalogError;
  }

  // Fetch a tool's code. Opening a tool does this; adding one to the desk does not need it.
  load(id) {
    if (this.loaded.has(id)) return Promise.resolve(this.loaded.get(id));
    if (this.#loading.has(id)) return this.#loading.get(id);
    const entry = this.entry(id);
    const file = entry?.file || `${id}.js`;
    if (!FILE_RE.test(file)) return Promise.reject(new Error(`“${id}” is not a tool.`));
    // a module that failed to load stays failed under its URL, so a retry needs a new one
    const n = this.#attempts.get(id) || 0;
    this.#attempts.set(id, n + 1);
    const job = import(toolUrl(n ? `${file}?retry=${n}` : file))
      .then((m) => {
        const tool = normaliseTool(m.default, entry);
        if (!tool || tool.id !== id) throw new Error(`${file} does not export the “${id}” tool.`);
        this.loaded.set(id, tool);
        return tool;
      })
      .finally(() => this.#loading.delete(id));
    this.#loading.set(id, job);
    return job;
  }

  install(id) {
    if (!ID_RE.test(id) || this.installed.includes(id)) return;
    this.installed.push(id);
    this.#persist();
    this.#emit('install', id);
  }

  uninstall(id) {
    if (!this.installed.includes(id)) return false;
    this.installed = this.installed.filter((i) => i !== id);
    this.#persist();
    this.#emit('uninstall', id);
    return true;
  }

  #persist() { store.set('tools', { v: 1, installed: this.installed }); }
  #emit(type, id = null) { this.dispatchEvent(new CustomEvent('change', { detail: { type, id } })); }
}
