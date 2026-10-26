import { $, el, debounce, store } from '../util.js';
import { BUILT_IN, CUSTOM_GROUP, parseSceneSource, sceneUrl } from '../gfx/registry.js';
import { paletteGradient } from '../gfx/palettes.js';
import { matchScore } from './match.js';

// The market: a drawer on the right where every scene lives until it is wanted. The Vision strip
// only carries what has been added here, so the rack stays short however large the shelf grows.
// A card's picture is a "try" button: the scene plays on the stage behind the drawer without
// joining the strip, and closing the drawer puts the old scene back unless it was added.

const SORTS = ['Shelf', 'A–Z', 'Match'];
const SCENE_FILE = /\.(glsl|frag|fs)$/i;
export const isSceneFile = (file) => SCENE_FILE.test(file.name);

export function buildMarket({ registry, renderer, analysis, director, selectScene, toast, lcdShow, icon, toolShelf }) {
  const root = $('#market');
  const grid = $('#market-grid');
  const filters = $('#market-filters');
  const search = $('#market-search');
  const count = $('#market-count');
  const empty = $('#market-empty');
  const offline = $('#market-offline');
  const own = root.querySelector('.market-own');
  const tabs = [...root.querySelectorAll('.market-tab')];

  const prefs = store.get('market', {});
  let filter = 'all';
  let sort = SORTS.includes(prefs.sort) ? prefs.sort : 'Shelf';
  // Two shelves in one drawer: scenes for the picture, tools for playing with the sound.
  let aisle = toolShelf && prefs.shelf === 'tools' ? 'tools' : 'scenes';
  const savePrefs = () => store.set('market', { sort, shelf: aisle });
  let query = '';
  let preview = null;                    // { id, returnTo } while a scene that is not on the strip is playing
  let shown = null;                      // the scene the cards were last painted for
  let dirty = true;
  const busy = new Set();
  const isOpen = () => root.classList.contains('is-open');

  // ── try / add / remove ────────────────────────────────────────────────────
  // A scene that was only tried should not keep its shader on the GPU once the show has moved on.
  const release = (id) => { if (id && !registry.isInstalled(id) && renderer.sceneId !== id) renderer.forget(id); };
  const leavePreview = () => { const id = preview?.id; preview = null; return id; };

  // A Try takes a moment (download, then a background compile). Whatever the user picks in the
  // meantime wins: another card, a key on the strip, a number key, a dropped file, closing the drawer.
  let trying = 0;
  async function tryScene(id) {
    if (busy.has(id)) return;
    const my = ++trying;
    if (registry.isInstalled(id)) {
      const old = leavePreview();
      selectScene(id);
      release(old);
      return paint();
    }
    busy.add(id);
    paint();
    try {
      const scene = await registry.load(id);
      const knownBad = renderer.failed.has(id);
      const ok = await renderer.ready(scene);                          // compiled off the main thread: no hitch on the cut
      if (my !== trying || !isOpen()) return release(id);
      if (!ok) { if (knownBad) toast(`${scene.name} cannot run on this graphics card.`, { kind: 'error' }); return; }   // the first failure is reported by the renderer
      const before = preview?.id;
      preview = { id, returnTo: preview ? preview.returnTo : renderer.sceneId };
      renderer.setScene(id);
      if (before !== id) release(before);
      lcdShow('trying', scene.name);
    } catch (e) {
      toast(`That scene could not be fetched: ${e.message}`, { kind: 'error' });
    } finally {
      busy.delete(id);
      paint();
    }
  }

  function endPreview() {
    trying++;                                                          // a Try still in flight belongs to the drawer that was just closed
    const p = preview;
    preview = null;
    if (!p || renderer.sceneId !== p.id || registry.isInstalled(p.id)) return;
    selectScene(registry.isInstalled(p.returnTo) ? p.returnTo : registry.scenes[0].id);
    release(p.id);
  }

  async function add(id) {
    if (busy.has(id)) return;
    busy.add(id);
    paint();
    try {
      const scene = await registry.install(id);
      renderer.warmUp([scene], 0);
      if (preview?.id === id) { preview = null; selectScene(id); }     // it was on trial and now it stays
      lcdShow('added', scene.name);
      // The pointer is still on the button, which now means "remove": hold the red cross back until it has left.
      const btn = cards.get(id)?.action;
      if (btn?.matches(':hover')) {
        btn.classList.add('just-added');
        btn.addEventListener('pointerleave', () => btn.classList.remove('just-added'), { once: true });
      }
    } catch (e) {
      toast(`That scene could not be added: ${e.message}`, { kind: 'error' });
    } finally {
      busy.delete(id);
      paint();
    }
  }

  function remove(id) {
    const scene = registry.get(id);
    if (!scene || id === BUILT_IN) return;
    if (renderer.sceneId === id) {
      const strip = registry.scenes;
      const i = strip.findIndex((s) => s.id === id);
      selectScene((strip[i + 1] || strip[i - 1] || strip[0]).id);      // step aside before the shader is freed
    }
    if (!registry.uninstall(id)) return;
    renderer.forget(id);
    lcdShow('removed', scene.name);
    if (scene.custom) {
      cards.delete(id);
      delete renderer.trailOverrides[id];                              // a later scene with the same name starts from its own file
      toast(`“${scene.name}” is gone. Drop its file again to bring it back.`);
    }
  }

  // ── the user's own scenes ─────────────────────────────────────────────────
  async function importFiles(files) {
    for (const file of files) {
      try {
        const scene = parseSceneSource(await file.text(), file.name);
        if (!scene) throw new Error('The scene needs a name made of letters or digits.');
        const wasShowing = renderer.sceneId === scene.id;
        const problem = renderer.check(scene);
        if (problem) { toast(`${file.name} does not compile — ${problem}`, { kind: 'error', timeout: 9000 }); continue; }
        // A knob that was turned overrides the file's own value; when the author edits that value, the file wins again.
        const old = registry.get(scene.id);
        const knobs = renderer.trailOverrides[scene.id];
        if (knobs) for (const k of ['trails', 'zoom', 'spin']) if (!old || old[k] !== scene[k]) delete knobs[k];
        const replaced = registry.addCustom(scene);
        const left = leavePreview();
        if (wasShowing) renderer.scene = null;                          // same id, new picture: let setScene take it
        selectScene(scene.id);
        release(left);
        toast(replaced ? `“${scene.name}” updated.` : `“${scene.name}” is on your strip, under ${CUSTOM_GROUP}.`);
      } catch (e) {
        toast(`${file.name}: ${e.message}`, { kind: 'error', timeout: 7000 });
      }
    }
  }
  const fileInput = el('input', { type: 'file', accept: '.glsl,.frag,.fs,text/plain', multiple: true, hidden: true });
  fileInput.addEventListener('change', () => { importFiles([...fileInput.files]); fileInput.value = ''; });
  root.append(fileInput);
  $('#market-import').addEventListener('click', () => fileInput.click());
  $('#market-retry').addEventListener('click', async () => { if (!(await registry.refreshCatalog())) toast('Still no answer from the market.', { kind: 'error' }); });

  // ── painting ──────────────────────────────────────────────────────────────
  function visible() {
    const q = query.toLowerCase();
    let items = registry.shelf.map((e) => ({ ...e, installed: registry.isInstalled(e.id) }));
    if (filter === 'mine') items = items.filter((e) => e.installed);
    else if (filter !== 'all') items = items.filter((e) => e.group === filter);
    if (q) items = items.filter((e) => `${e.name} ${e.group} ${e.blurb} ${(e.tags || []).join(' ')} ${e.author?.name || ''}`.toLowerCase().includes(q));
    if (sort === 'A–Z') items.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'Match') {
      const music = { energy: analysis.energy, energyAvg: director.energyAvg, bpm: analysis.bpm, bass: analysis.bass, mid: analysis.mid, high: analysis.high };
      const score = new Map(items.map((e) => [e.id, Number(matchScore(e, music)) || 0]));
      items.sort((a, b) => score.get(b.id) - score.get(a.id));
    }
    return items;
  }

  // Chips and cards are built once and refreshed after that. Rebuilding them on every repaint
  // would fetch the pictures again and, worse, take the keyboard focus away from whatever was
  // just pressed (and a lost focus sends the next Enter to the Stage rack's DROP pad).
  const chips = new Map();
  function chip(value, label, n) {
    let c = chips.get(value);
    if (!c) {
      const num = el('span', { class: 'chip-n' });
      c = { num, node: el('button', { class: 'chip', type: 'button', onclick: () => { filter = value; paint(); } }, label, num) };
      chips.set(value, c);
    }
    const on = filter === value;
    c.node.classList.toggle('is-active', on);
    c.node.setAttribute('aria-pressed', String(on));
    c.num.textContent = n ?? '';
    c.num.hidden = n === undefined;
    return c.node;
  }
  const sortBtn = el('button', { class: 'chip chip-sort', type: 'button', title: 'Order: the shelf, the alphabet, or what suits the music playing now',
    onclick: () => { sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]; savePrefs(); paint(); } });

  const cards = new Map();
  function card(e) {
    const builtIn = e.id === BUILT_IN;
    const key = `${e.name}|${e.group}|${e.blurb}|${e.thumb}|${e.requiresAccount}|${e.author?.name}|${e.author?.url}`;
    let c = cards.get(e.id);
    if (!c || c.key !== key) {
      const state = el('span', { class: 'card-state' });
      const shot = el('button', { class: 'card-shot', type: 'button', onclick: () => tryScene(e.id) },
        e.thumb
          ? el('img', { src: sceneUrl(e.thumb), alt: '', loading: 'lazy', decoding: 'async' })
          : el('span', { class: 'card-blank', style: `background:${paletteGradient(renderer.palette)}` }, e.name.slice(0, 2)),
        state,
        el('span', { class: 'card-name' }, e.name, el('span', { class: 'card-group' }, `${e.group}${e.requiresAccount ? ' · Members' : ''}`)),
      );
      const idle = el('span', { class: 'when-idle' });
      const hover = el('span', { class: 'when-hover' });
      // One button that toggles: the second click of a double-click must not undo the first.
      const action = builtIn
        ? el('span', { class: 'card-add is-fixed', title: 'Built in: always on the strip' }, icon('check'))
        : el('button', { class: 'card-add', type: 'button', onclick: (ev) => { if (ev.detail > 1) return; if (registry.isInstalled(e.id)) remove(e.id); else add(e.id); } }, idle, hover);
      // Community scenes credit their maker; the catalogue only lets https links through.
      const credit = e.author?.name ? el('p', { class: 'card-author' }, 'by ',
        /^https:\/\//.test(e.author.url || '') ? el('a', { href: e.author.url, target: '_blank', rel: 'noopener noreferrer' }, e.author.name) : e.author.name) : null;
      c = { key, shot, state, action, idle, hover, installed: null, node: el('li', {}, shot, action, e.blurb ? el('p', { class: 'card-blurb' }, e.blurb) : null, credit) };
      cards.set(e.id, c);
    }
    const live = renderer.sceneId === e.id;
    const loading = busy.has(e.id);
    c.node.className = `card ${e.installed ? 'is-installed' : ''} ${live ? 'is-live' : ''} ${loading ? 'is-busy' : ''}`;
    c.state.textContent = loading ? 'Loading…' : live ? (e.installed ? 'On stage' : 'Trying') : e.installed ? 'Play' : 'Try';
    c.shot.title = e.installed ? `Play ${e.name}` : `Try ${e.name} on the stage`;
    if (!builtIn) {
      c.action.setAttribute('aria-disabled', String(loading));         // not `disabled`: that would drop the focus; add() ignores clicks while busy
      c.action.setAttribute('aria-pressed', String(e.installed));
      c.action.setAttribute('aria-label', e.installed ? `Take ${e.name} off the strip` : `Add ${e.name} to the strip`);
      c.action.title = e.installed ? (e.custom ? 'Delete this scene' : 'Take it off the strip') : 'Add to the strip';
      if (c.installed !== e.installed) {
        c.installed = e.installed;
        c.idle.replaceChildren(icon(e.installed ? 'check' : 'add'));
        c.hover.replaceChildren(icon(e.installed ? 'close' : 'add'));
      }
    }
    return c.node;
  }

  // Swap a container's children only when the list really changed, and hand the focus back if it was inside.
  function place(container, nodes) {
    if (nodes.length === container.children.length && nodes.every((n, i) => container.children[i] === n)) return;
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    container.replaceChildren(...nodes);
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }

  function setShelf(next) {
    if (!toolShelf || next === aisle) return;
    aisle = next;
    savePrefs();
    if (aisle === 'tools') toolShelf.refresh();
    const scroller = root.querySelector('.market-scroll');
    if (scroller) scroller.scrollTop = 0;
    paint();
  }
  tabs.forEach((tab) => tab.addEventListener('click', () => setShelf(tab.dataset.shelf)));
  if (toolShelf) toolShelf.onChange = () => paint();
  else tabs.forEach((tab) => { tab.hidden = true; });

  function paint() {
    if (!isOpen()) { dirty = true; return; }
    dirty = false;
    tabs.forEach((tab) => {
      const on = tab.dataset.shelf === aisle;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    search.placeholder = aisle === 'tools' ? 'Search tools: pad, drums, scratch…' : 'Search scenes: space, rain, retro…';
    search.setAttribute('aria-label', aisle === 'tools' ? 'Search tools' : 'Search scenes');
    if (own) own.hidden = aisle === 'tools';
    if (aisle === 'tools') {
      offline.hidden = true;
      toolShelf.paint({ filters, grid, count, empty, place, query });
      return;
    }
    empty.textContent = 'No scene matches that.';
    shown = renderer.sceneId;
    const shelf = registry.shelf;
    const groups = [...new Set(shelf.map((e) => e.group))];
    if (filter !== 'all' && filter !== 'mine' && !groups.includes(filter)) filter = 'all';
    sortBtn.textContent = `Sort · ${sort}`;
    place(filters, [chip('all', 'All', shelf.length), chip('mine', 'On my strip', registry.installed.length), ...groups.map((g) => chip(g, g)), sortBtn]);
    const items = visible();
    place(grid, items.map(card));
    empty.hidden = items.length > 0;
    offline.hidden = !registry.catalogError;
    count.textContent = `${registry.installed.length} on the strip · ${shelf.length} in all`;
  }

  function open(v) {
    if (v === isOpen()) return;
    root.classList.toggle('is-open', v);
    root.setAttribute('aria-hidden', String(!v));
    document.body.classList.toggle('has-market', v);
    if (v) {
      if (dirty || shown !== renderer.sceneId) paint();
      // a touch tablet is wide too, but there the caret would pop up its keyboard over the shelf
      if (matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches) search.focus({ preventScroll: true });
    } else {
      endPreview();
      if (root.contains(document.activeElement)) document.activeElement.blur();
    }
  }

  search.addEventListener('input', debounce(() => { query = search.value.trim(); paint(); }, 120));
  search.addEventListener('keydown', (e) => {
    // The drawer opens with the cursor in this box, so the keys that close it have to work from here too.
    const closes = e.key === 'Escape' || ((e.key === 'k' || e.key === 'K') && !search.value && !e.ctrlKey && !e.metaKey && !e.altKey);
    if (!closes) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && search.value) { search.value = ''; query = ''; paint(); } else open(false);
  });
  $('#market-close').addEventListener('click', () => open(false));
  registry.addEventListener('change', paint);

  return {
    open,
    toggle: () => open(!isOpen()),
    // open the drawer on one shelf, 'scenes' or 'tools'
    openShelf(which) { setShelf(which); if (!isOpen()) open(true); else paint(); },
    get shelf() { return aisle; },
    get isOpen() { return isOpen(); },
    // What to remember as "the current scene" while a trial is on: the one it will go back to.
    get settledScene() { return preview && !registry.isInstalled(renderer.sceneId) ? preview.returnTo : renderer.sceneId; },
    // The user picked a scene some other way: a Try that is still loading must not take the stage afterwards.
    cancelTry() { trying++; },
    importFiles,
    tick() {
      if (preview && renderer.sceneId !== preview.id) release(leavePreview());   // the director moved on
      if (isOpen() && shown !== renderer.sceneId) paint();
    },
  };
}
