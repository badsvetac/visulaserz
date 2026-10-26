// Magic: two lists of recommendations in the crate.
//   "More like this"  — what goes with the track that is playing (YouTube's radio mix for it)
//   "For you"         — the mixes of your strongest recent listens, blended (see lib/reco.js)
// A pick is fetched from YouTube like any search result. Auto-DJ queues the top pick before the
// current track ends, so the music never stops.
import { el, store, formatTime, debounce } from '../util.js';
import { ListeningHistory } from './history.js';

const FIRST = 6;          // rows shown before "Show more"
const AUTO_DJ_AT = 0.55;  // queue the next pick once this share of the track has played

const plusIcon = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 5v14M5 12h14');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
};

export function buildMagic({ engine, crate, toast }) {
  const history = new ListeningHistory(engine);
  const prefs = { autoDj: false, ...store.get('magic', {}) };

  // ── the two sections, placed under the search results ─────────────────────
  const trackNote = el('p', { class: 'note' });
  const trackList = el('ul', { class: 'list' });
  const trackMore = el('button', { class: 'link magic-more', type: 'button', hidden: true }, 'Show more');
  const autoBtn = el('button', { class: `key ${prefs.autoDj ? 'is-active' : ''}`, type: 'button', 'aria-pressed': String(prefs.autoDj), title: 'Queue the top pick before this track ends, so the music never stops' },
    el('span', { class: 'led' }), el('span', {}, 'Auto-DJ'));
  const trackSection = el('section', { class: 'crate-section magic', id: 'magic-track', hidden: true },
    el('div', { class: 'magic-head' }, el('h3', { class: 'legend' }, '✦ Magic · more like this'), autoBtn), trackNote, trackList, trackMore);

  const youNote = el('p', { class: 'note' });
  const youList = el('ul', { class: 'list' });
  const youMore = el('button', { class: 'link magic-more', type: 'button', hidden: true }, 'Show more');
  const forgetBtn = el('button', { class: 'link magic-more', type: 'button', hidden: true, title: 'Clears the listening history kept in this browser' }, 'Forget what I played');
  const youSection = el('section', { class: 'crate-section magic', id: 'magic-you', hidden: true },
    el('div', { class: 'magic-head' }, el('h3', { class: 'legend' }, '✦ Magic · for you')), youNote, youList, el('div', { class: 'magic-foot' }, youMore, forgetBtn));

  document.getElementById('results-section').after(trackSection, youSection);

  const track = { token: 0, seedTitle: '', items: [], status: 'idle', expanded: false };
  const you = { token: 0, items: store.get('magic-you', []), status: 'idle', expanded: false };
  let prefetching = false;
  const refused = new Set();   // picks that would not download: Auto-DJ does not ask for them twice
  let clock = 0;

  const available = () => crate.youtube.available && !crate.hosted;
  const queued = (id) => crate.tracks.some((t) => t.source === 'youtube' && t.id === id);

  async function pick(item, li, play) {
    engine.ensureContext();
    li?.classList.add('is-busy');
    try {
      await crate.loadYouTube(item.id, { play, metadata: item });
      if (!play) toast(`Queued “${item.title}”.`);
    } catch (err) {
      toast(err.message, { kind: 'error', timeout: 8000 });
    } finally {
      li?.classList.remove('is-busy');
    }
  }

  function row(item, meta) {
    const li = el('li', { class: `row ${item.saved ? 'row-saved' : ''}` });
    const why = item.because ? `Because you played “${item.because.title}”. ` : '';
    li.append(
      el('button', { class: 'row-main', type: 'button', title: `${why}${item.saved ? 'Already saved: plays at once.' : 'Fetches it from YouTube and plays it.'}`, onclick: () => pick(item, li, true) },
        el('img', { class: 'row-art', src: item.thumb, alt: '', loading: 'lazy' }),
        el('span', { class: 'row-text' }, el('span', { class: 'row-title' }, item.title), el('span', { class: 'row-meta' }, meta))),
      el('button', { class: 'icon-btn row-remove', type: 'button', 'aria-label': `Add “${item.title}” to the queue`, title: 'Add to the queue', onclick: () => pick(item, li, false) }, plusIcon()),
    );
    return li;
  }

  const skeleton = (n) => Array.from({ length: n }, () => el('li', { class: 'row-skeleton', 'aria-hidden': 'true' }));

  function paint(state, list, more, metaOf) {
    if (state.status === 'loading' && !state.items.length) { list.replaceChildren(...skeleton(4)); more.hidden = true; return; }
    const items = state.items.filter((it) => !queued(it.id));
    list.replaceChildren(...items.slice(0, state.expanded ? items.length : FIRST).map((it) => row(it, metaOf(it))));
    more.hidden = state.expanded || items.length <= FIRST;
  }

  function render() {
    const on = available();
    const playing = engine.track && engine.track.source !== 'demo' && !engine.live;
    trackSection.hidden = !on || !playing || (track.status !== 'loading' && !track.items.length);
    trackNote.textContent = track.seedTitle ? `If “${track.seedTitle}” is your thing, try these.` : 'Looking for tracks that go with this one…';
    paint(track, trackList, trackMore, (it) => [it.artist, it.duration ? formatTime(it.duration) : ''].filter(Boolean).join(' · '));

    youSection.hidden = !on;
    const known = history.plays.length > 0;
    youNote.textContent = !known && !crate.saved.length ? 'Play a few tracks and this fills with things you have not heard yet.'
      : you.status === 'error' && !you.items.length ? 'YouTube did not answer just now. It will try again with your next track.'
        : !you.items.length ? 'Reading your taste…'
          : known ? 'New to you, picked from what you have been playing lately.'
            : 'New to you, picked from the tracks you have saved. It sharpens as you listen.';
    // the reason goes first: the line is cut short in a narrow crate, and the reason is the magic
    paint(you, youList, youMore, (it) => [it.because ? `↳ ${it.because.title}` : '', it.artist].filter(Boolean).join(' · '));
    forgetBtn.hidden = !known;
  }

  // ── fetching ───────────────────────────────────────────────────────────────
  const refreshTrack = debounce(async () => {
    const t = engine.track;
    const my = ++track.token;
    Object.assign(track, { items: [], seedTitle: '', expanded: false, status: 'idle' });
    if (!available() || !t || t.source === 'demo' || engine.live) return render();
    track.status = 'loading';
    render();
    try {
      const q = new URLSearchParams({ id: t.source === 'youtube' ? t.id : '', title: t.title || '', artist: t.artist || '' });
      const res = await fetch(`/api/magic/track?${q}`);
      const data = await res.json();
      if (my !== track.token) return;
      if (!res.ok) throw new Error(data.error);
      Object.assign(track, { items: data.items || [], seedTitle: t.title, status: 'ready' });
    } catch {
      if (my !== track.token) return;
      track.status = 'error';
    }
    render();
  }, 700);

  // What the "for you" list grows from: what was really listened to, or — before there is any
  // history — the tracks saved from YouTube, newest first, as the best guess at the listener's taste.
  function tasteSeeds() {
    const own = history.seeds(5);
    if (own.length) return own;
    return crate.saved.slice(0, 5).map((t, i) => ({ id: t.id, title: t.title, artist: t.artist || '', weight: 1 / (1 + i * 0.5) }));
  }

  const refreshYou = debounce(async () => {
    const my = ++you.token;
    const seeds = tasteSeeds();
    if (!seeds.length) Object.assign(you, { items: [], status: 'idle' });   // nothing heard, nothing saved: nothing to go on
    if (!available() || !seeds.length) return render();
    you.status = 'loading';
    render();
    try {
      // saved tracks count as known too: a recommendation should be something new
      const played = [...history.played(), ...crate.saved.map((t) => ({ id: t.id, title: t.title, artist: t.artist || '' }))];
      const res = await fetch('/api/magic/foryou', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seeds, played }) });
      const data = await res.json();
      if (my !== you.token) return;
      if (!res.ok) throw new Error(data.error);
      Object.assign(you, { items: data.items || [], status: 'ready' });
      store.set('magic-you', you.items);
    } catch {
      if (my !== you.token) return;
      you.status = 'error';
    }
    render();
  }, 1500);

  // ── wiring ─────────────────────────────────────────────────────────────────
  engine.addEventListener('trackchange', refreshTrack);
  engine.addEventListener('live', () => { refreshTrack(); });
  history.addEventListener('change', refreshYou);
  crate.addEventListener('queue', render);
  crate.addEventListener('saved', () => { if (!history.plays.length && !you.items.length) refreshYou(); else render(); });
  crate.addEventListener('youtube', () => { render(); if (available()) { refreshYou(); if (engine.track) refreshTrack(); } });
  trackMore.addEventListener('click', () => { track.expanded = true; render(); });
  youMore.addEventListener('click', () => { you.expanded = true; render(); });
  forgetBtn.addEventListener('click', () => {
    history.forget();
    Object.assign(you, { items: [], status: 'idle' });
    store.set('magic-you', []);
    toast('Listening history cleared.');
    render();
  });
  autoBtn.addEventListener('click', () => {
    prefs.autoDj = !prefs.autoDj;
    store.set('magic', prefs);
    autoBtn.classList.toggle('is-active', prefs.autoDj);
    autoBtn.setAttribute('aria-pressed', String(prefs.autoDj));
    toast(prefs.autoDj ? 'Auto-DJ is on: the top pick is queued before each track ends.' : 'Auto-DJ is off.');
  });
  render();

  // Auto-DJ: when the last track in the queue is past its middle, fetch the best pick nobody has heard yet.
  function autoDj() {
    if (!prefs.autoDj || prefetching || !available() || !engine.playing || engine.live || engine.decks) return;
    const d = engine.duration;
    if (!d || engine.currentTime / d < AUTO_DJ_AT || crate.index !== crate.tracks.length - 1) return;
    const heard = new Set(history.plays.map((p) => p.id));
    const next = [...track.items, ...you.items].find((it) => !queued(it.id) && !heard.has(it.id) && !refused.has(it.id));
    if (!next) return;
    prefetching = true;
    crate.loadYouTube(next.id, { play: false, metadata: next })
      .then(() => toast(`Auto-DJ queued “${next.title}”.`))
      .catch((err) => { refused.add(next.id); toast(`Auto-DJ: ${err.message}`, { kind: 'error' }); })   // try a different pick next time
      .finally(() => { prefetching = false; });
  }

  return {
    history,
    state: { track, you },
    refreshTrack,
    refreshYou,
    tick(dt) {
      history.tick(dt);
      clock += dt;
      if (clock > 1) { clock = 0; autoDj(); }
    },
  };
}
