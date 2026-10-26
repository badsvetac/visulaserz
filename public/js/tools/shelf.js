import { el } from '../util.js';
import { toolUrl } from './registry.js';

// The market's Tools shelf: the same drawer as the scenes, other cards. A card's picture opens the
// tool on the stage (and puts it on the desk, so it is in the Perform rack from then on); the round
// button adds it to the desk without opening it, or takes it off again.
export function createToolShelf({ registry, desk, toast, icon }) {
  let filter = 'all';
  let repaint = () => {};
  const chips = new Map();
  const cards = new Map();
  const busy = new Set();

  function chip(value, label, n) {
    let c = chips.get(value);
    if (!c) {
      const num = el('span', { class: 'chip-n' });
      c = { num, node: el('button', { class: 'chip', type: 'button', onclick: () => { filter = value; repaint(); } }, label, num) };
      chips.set(value, c);
    }
    const on = filter === value;
    c.node.classList.toggle('is-active', on);
    c.node.setAttribute('aria-pressed', String(on));
    c.num.textContent = n ?? '';
    c.num.hidden = n === undefined;
    return c.node;
  }

  async function openOnStage(id) {
    if (busy.has(id)) return;
    busy.add(id);
    repaint();
    try { await desk.open(id); } finally { busy.delete(id); repaint(); }
  }

  function card(e) {
    const key = `${e.name}|${e.group}|${e.blurb}|${e.thumb}`;
    let c = cards.get(e.id);
    if (!c || c.key !== key) {
      const state = el('span', { class: 'card-state' });
      const shot = el('button', { class: 'card-shot card-shot-tool', type: 'button', onclick: () => openOnStage(e.id) },
        e.thumb ? el('img', { src: toolUrl(e.thumb), alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'card-blank' }, e.name.slice(0, 2)),
        state,
        el('span', { class: 'card-name' }, el('span', { class: 'card-title' }, e.name), el('span', { class: 'card-group' }, e.group)));
      const idle = el('span', { class: 'when-idle' });
      const hover = el('span', { class: 'when-hover' });
      const action = el('button', { class: 'card-add', type: 'button', onclick: (ev) => {
        if (ev.detail > 1) return;                                      // the second click of a double-click must not undo the first
        if (registry.isInstalled(e.id)) registry.uninstall(e.id);
        else { registry.install(e.id); toast(`${e.name} is on your desk: Perform rack → Tools.`); }
      } }, idle, hover);
      c = { key, shot, state, action, idle, hover, installed: null, node: el('li', {}, shot, action, e.blurb ? el('p', { class: 'card-blurb' }, e.blurb) : null) };
      cards.set(e.id, c);
    }
    const installed = registry.isInstalled(e.id);
    const live = desk.isOpen(e.id);
    const loading = busy.has(e.id);
    c.node.className = `card card-tool ${installed ? 'is-installed' : ''} ${live ? 'is-live' : ''} ${loading ? 'is-busy' : ''}`;
    c.state.textContent = loading ? 'Loading…' : live ? 'On stage' : 'Open';
    c.shot.title = live ? `${e.name} is on the stage: bring it to the front` : `Open ${e.name} on the stage`;
    c.action.setAttribute('aria-pressed', String(installed));
    c.action.setAttribute('aria-label', installed ? `Take ${e.name} off your desk` : `Add ${e.name} to your desk`);
    c.action.title = installed ? 'Take it off your desk' : 'Add it to your desk (Perform rack → Tools)';
    if (c.installed !== installed) {
      c.installed = installed;
      c.idle.replaceChildren(icon(installed ? 'check' : 'add'));
      c.hover.replaceChildren(icon(installed ? 'close' : 'add'));
    }
    return c.node;
  }

  function visible(query) {
    const q = query.toLowerCase();
    let items = registry.catalog;
    if (filter === 'mine') items = items.filter((e) => registry.isInstalled(e.id));
    else if (filter !== 'all') items = items.filter((e) => e.group === filter);
    if (q) items = items.filter((e) => `${e.name} ${e.group} ${e.blurb} ${e.tags.join(' ')}`.toLowerCase().includes(q));
    return items;
  }

  registry.addEventListener('change', () => repaint());
  registry.addEventListener('desk', () => repaint());
  registry.addEventListener('catalog', () => repaint());

  return {
    set onChange(fn) { repaint = fn; },
    // Paints into the market's own filter row and grid (`place` swaps children without losing focus).
    paint({ filters, grid, count, empty, place, query }) {
      const all = registry.catalog;
      const groups = [...new Set(all.map((e) => e.group))];
      if (filter !== 'all' && filter !== 'mine' && !groups.includes(filter)) filter = 'all';
      place(filters, [chip('all', 'All', all.length), chip('mine', 'On my desk', registry.installed.length), ...groups.map((g) => chip(g, g))]);
      const items = visible(query);
      place(grid, items.map(card));
      empty.hidden = items.length > 0;
      empty.textContent = registry.catalogError && !all.length ? 'The tool shelf could not be reached. Close the drawer and open it again to retry.' : 'No tool matches that.';
      count.textContent = `${registry.installed.length} on the desk · ${all.length} in all`;
    },
    // the drawer was opened on this shelf: try the catalogue again if it failed last time
    refresh() { if (registry.catalogError) registry.refreshCatalog(); },
  };
}
