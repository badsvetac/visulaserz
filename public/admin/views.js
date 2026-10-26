import { el } from '../js/util.js';
import { get, post } from './api.js';
import { columns, ranked, meter, weekHeatmap } from './charts.js';
import { num, compact, bytes, duration, ago, when, day, dayLong, region, language, percent, plural, clock } from './format.js';

// The desk's eight views. Each one fetches what it shows and returns a fresh element; the shell
// (admin.js) swaps it in, keeps the old one dimmed while a refresh is on its way, and gives every
// view the same helpers: ctx.toast(), ctx.confirm(), ctx.go(view) and ctx.reload().

const panel = (title, ...children) => el('section', { class: 'unit' }, el('h2', { class: 'legend' }, title), ...children);
const tile = (label, value, detail = null, extra = {}) => el('div', { class: `tile${extra.tone ? ` tile-${extra.tone}` : ''}` },
  el('p', { class: 'tile-label' }, label), el('p', { class: 'tile-value' }, value), detail ? el('p', { class: 'tile-detail' }, detail) : null);
const lamp = (state, text) => el('span', { class: `lamp lamp-${state}` }, el('span', { class: 'lamp-dot', 'aria-hidden': 'true' }), text);
const delta = (now, before, period = 'yesterday') => {
  if (!before && !now) return `same as ${period}`;
  if (!before) return `first visitors since ${period}`;
  const d = now - before;
  return d === 0 ? `same as ${period}` : `${d > 0 ? '+' : '−'}${num(Math.abs(d))} vs ${period}`;
};
const note = text => el('p', { class: 'note' }, text);

const ACTIONS = {
  setting: 'Changed a setting', 'keep-audio-on': 'Kept songs for', 'keep-audio-off': 'Stopped keeping songs for', 'sign-out': 'Signed out everywhere',
  suspend: 'Suspended', reinstate: 'Reinstated', 'delete-account': 'Deleted the account of', 'youtube-test': 'Tested YouTube', 'clear-cache': 'Cleared a cache',
  'grant-admin': 'Made an admin', 'revoke-admin': 'Removed admin rights from', 'new-desk-address': 'Gave the desk a new address',
  'youtube-proxy-set': 'Changed the YouTube proxy', 'youtube-proxy-reset': 'Restored the server’s YouTube proxy',
};
const SETTING_NAMES = { signupsOpen: 'Sign-ups', youtubeEnabled: 'YouTube', youtubeDailyLimit: 'Daily download limit', notice: 'Notice', noticeKind: 'Notice style' };
const REASONS = {
  'bot-check': 'YouTube asked this server to prove it is not a bot', age: 'Needs sign-in or an age check', private: 'Private video',
  unavailable: 'Unavailable or removed', refused: 'YouTube refused the download', 'too-long': 'Live, or longer than 4 hours',
  timeout: 'Took too long', cancelled: 'Cancelled: the member switched tracks', other: 'Something else',
};
// The traffic breakdowns' raw keys, in words.
const API_NAMES = { 'youtube: import': 'YouTube downloads', 'youtube: search': 'YouTube searches', 'youtube: recommendations': 'Recommendations', lyrics: 'Lyrics looked up',
  library: 'Track lists opened', 'library: remove': 'Tracks removed', 'market scene': 'Member scenes opened', 'account: login': 'Sign-ins', 'account: register': 'Sign-ups',
  'account: logout': 'Sign-outs', 'account: password': 'Password changes', 'account: recover': 'Account recoveries' };
const ACCOUNT_NAMES = { joined: 'Joined', 'signed in': 'Signed in', 'wrong password': 'Wrong password', recovered: 'Recovered with a key' };
const STATUS_NAMES = { 400: 'Bad request (400)', 401: 'Needed an account (401)', 403: 'Not allowed (403)', 404: 'Not found (404)', 405: 'Wrong method (405)', 409: 'Out of date (409)',
  413: 'Too large (413)', 414: 'Address too long (414)', 415: 'Wrong format (415)', 421: 'Unknown host (421)', 429: 'Too many requests (429)', 500: 'Server error (500)',
  502: 'YouTube did not answer (502)', 503: 'Switched off or busy (503)' };
const KINDS = { import: 'Download', search: 'Search', recommendations: 'Recommendations', test: 'Desk test', cache: 'From the server’s copy' };

function logLine(e) {
  const what = ACTIONS[e.action] || e.action;
  let target = e.target || '';
  let detail = e.detail || '';
  if (e.action === 'setting') {
    target = SETTING_NAMES[e.target] || e.target;
    try { const v = JSON.parse(e.detail); detail = typeof v === 'boolean' ? (v ? 'on' : 'off') : v === '' ? 'cleared' : String(v); } catch { /* keep it as it is */ }
  }
  if (e.action === 'clear-cache') target = e.target === 'magic' ? 'recommendations' : e.target;
  return { what, target, detail };
}
function logList(entries) {
  if (!entries.length) return el('p', { class: 'empty-note' }, 'Nothing has been changed from the desk yet.');
  return el('ol', { class: 'log' }, ...entries.map(e => {
    const { what, target, detail } = logLine(e);
    return el('li', {}, el('time', { datetime: new Date(e.at).toISOString(), title: when(e.at) }, ago(e.at)),
      el('span', { class: 'log-what' }, what, target ? el('b', {}, ` ${target}`) : null, detail ? el('span', { class: 'log-detail' }, ` · ${detail}`) : null),
      el('span', { class: 'log-who' }, e.admin));
  }));
}
const dayColumns = (label, rows, value, tipName, extra = r => []) => columns({
  label, rows, value, axis: r => day(r.day),
  tip: r => [[num(value(r)), tipName(value(r))], ...extra(r), [dayLong(r.day), '']],
  table: { head: ['Day', label], row: r => [dayLong(r.day), num(value(r))] },
});

// ── overview ──────────────────────────────────────────────────────────────────
export async function overview(ctx) {
  const o = await get('overview');
  const yt = o.youtube;
  const hero = el('div', { class: 'hero' },
    el('p', { class: 'tile-label' }, 'Visitors today'),
    el('p', { class: 'hero-value' }, num(o.today.visitors)),
    el('p', { class: 'tile-detail' }, `${delta(o.today.visitors, o.yesterday.visitors)} · ${plural(o.today.views, 'page view')}`));
  const tiles = el('div', { class: 'tiles' },
    tile('Online now', num(o.online.visitors), o.online.members ? `${plural(o.online.members, 'member')} among them` : 'no members right now'),
    tile('Members', num(o.members.total), o.members.newThisWeek ? `+${num(o.members.newThisWeek)} this week` : 'none new this week'),
    tile('YouTube today', yt.today ? num(yt.today.imports) : '0', yt.today?.failed ? `${plural(yt.today.failed, 'failed download')}` : 'downloads, none failed', { tone: yt.today?.failed ? 'warn' : null }),
    tile('Storage', bytes(o.storage.used), `of ${bytes(o.storage.budget)} for audio and data`));
  const states = el('div', { class: 'states' },
    lamp(o.settings.signupsOpen ? 'on' : 'off', o.settings.signupsOpen ? 'Sign-ups open' : 'Sign-ups paused'),
    lamp(!yt.enabled ? 'off' : yt.available ? 'on' : 'fault', !yt.enabled ? 'YouTube switched off' : yt.available ? 'YouTube working' : 'YouTube not available'),
    lamp(o.settings.notice ? 'on' : 'idle', o.settings.notice ? `Notice up: “${o.settings.notice}”` : 'No notice'),
    el('button', { class: 'link', type: 'button', onclick: () => ctx.go('settings') }, 'Change in Settings'));
  const newest = o.members.latest.length ? el('ol', { class: 'people' }, ...o.members.latest.map(m => el('li', {},
    el('span', { class: 'person' }, el('span', { class: m.online ? 'online-dot' : 'online-dot is-off', title: m.online ? 'Online now' : null, 'aria-label': m.online ? 'Online now' : null }), el('b', {}, m.name), el('span', {}, m.email)),
    el('time', { title: when(m.created) }, `joined ${ago(m.created)}`)))) : el('p', { class: 'empty-note' }, 'Nobody has joined yet.');
  return el('div', { class: 'view' },
    el('div', { class: 'lead' }, hero, tiles), states,
    panel('Visitors · last 14 days', dayColumns('Visitors', o.days, r => r.visitors, n => n === 1 ? 'visitor' : 'visitors', r => [[num(r.views), 'page views']]).node,
      note(`Counted since ${day(o.since)}, without cookies or stored addresses: a person counts once a day, and admins not at all.`)),
    el('div', { class: 'pair' },
      panel('Newest members', newest, el('button', { class: 'link', type: 'button', onclick: () => ctx.go('members') }, 'All members')),
      panel('From the desk', logList(o.log), el('button', { class: 'link', type: 'button', onclick: () => ctx.go('log') }, 'Whole log'))));
}

// ── traffic ───────────────────────────────────────────────────────────────────
let range = 30;
export async function traffic(ctx) {
  const t = await get(`traffic?days=${range}`);
  const days = t.days.slice(-range);
  const sum = days.reduce((a, d) => { for (const k of ['views', 'visitors', 'bots', 'errors', 'seconds', 'short']) a[k] += d[k]; return a; }, { views: 0, visitors: 0, bots: 0, errors: 0, seconds: 0, short: 0 });
  const chips = el('div', { class: 'filters', role: 'group', 'aria-label': 'Period' }, ...[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(([n, text]) =>
    el('button', { class: `chip${n === range ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(n === range), onclick: () => { range = n; ctx.reload(); } }, text)));
  const b = t.breakdown;
  const pageName = r => r.key === '/' ? '/ · the app' : r.key;
  const NAMES = { page: pageName, crawled: pageName, country: r => r.key === 'Unknown' || r.key === 'Tor' ? r.key : `${region(r.key)} · ${r.key}`, language: r => language(r.key),
    api: r => API_NAMES[r.key] || r.key, account: r => ACCOUNT_NAMES[r.key] || (r.key.startsWith('refused') ? 'Refused (suspended)' : r.key), status: r => STATUS_NAMES[r.key] || r.key };
  const lists = [
    ['Most visited pages', 'page'], ['Countries', 'country'], ['Where they came from', 'referrer'], ['Campaign links', 'campaign'],
    ['Devices', 'device'], ['Browsers', 'browser'], ['Systems', 'os'], ['Languages', 'language'],
    ['What people used', 'api'], ['Accounts', 'account'], ['Turned away or failed', 'status'], ['Bots and scripts', 'bot'], ['Pages search engines read', 'crawled'],
  ].map(([title, kind]) => panel(title, ranked(b[kind] || [], { label: NAMES[kind] || (r => r.key), tone: kind === 'status' ? 'critical' : kind === 'bot' || kind === 'crawled' ? 'quiet' : 'series' })));
  const hours = t.hours.slice(-48);
  return el('div', { class: 'view' },
    chips,
    el('div', { class: 'tiles' },
      tile('Visitors', num(sum.visitors), 'each person once a day'), tile('Page views', num(sum.views)),
      tile('Average visit', sum.visitors ? duration(sum.seconds / sum.visitors) : '—', 'from the first page to the last sign of life'),
      tile('Quick exits', percent(sum.short, sum.visitors), 'left within 10 seconds'),
      tile('Bots', compact(sum.bots), 'requests, kept out of the visitor count'),
      tile('Server errors', num(sum.errors), sum.errors ? 'requests the server could not finish' : 'none', { tone: sum.errors ? 'warn' : null })),
    panel(`Visitors per day · last ${range} days`, dayColumns('Visitors', days, r => r.visitors, n => n === 1 ? 'visitor' : 'visitors', r => [[num(r.views), 'page views'], [r.visitors ? duration(r.seconds / r.visitors) : '—', 'average visit']]).node),
    panel('Last 48 hours', columns({ label: 'Visitors per hour', rows: hours, value: r => r.visitors, axis: r => clock(r.t),
      tip: r => [[num(r.visitors), r.visitors === 1 ? 'visitor' : 'visitors'], [num(r.views), 'page views'], [`${dayLong(new Date(r.t).toISOString().slice(0, 10))} ${clock(r.t)}`, '']],
      table: { head: ['Hour', 'Visitors', 'Page views'], row: r => [`${dayLong(new Date(r.t).toISOString().slice(0, 10))} ${clock(r.t)}`, num(r.visitors), num(r.views)] } }).node),
    panel('When in the week · last 4 weeks, your clock', weekHeatmap(t.hours)),
    el('div', { class: 'grid' }, ...lists),
    note(`Counting started on ${day(t.since)}. A visitor is a hash of their address and browser with a salt that changes every day, so nobody can be followed from one day to the next. Countries come from Cloudflare.`));
}

// ── members ───────────────────────────────────────────────────────────────────
let query = '';
export async function members(ctx) {
  const { members: list } = await get('members');
  const online = list.filter(m => m.online).length;
  const body = el('tbody');
  const search = el('input', { type: 'search', class: 'search', placeholder: 'Search by name or email', value: query, 'aria-label': 'Search members', autocomplete: 'off', spellcheck: 'false' });
  const count = el('span', { class: 'count' });
  const fill = () => {
    const q = query.trim().toLowerCase();
    const shown = list.filter(m => !q || m.email.includes(q) || m.name.toLowerCase().includes(q));
    count.textContent = `${plural(shown.length, 'member')}${q ? ` of ${num(list.length)}` : ''} · ${num(online)} online`;
    body.replaceChildren(...(shown.length ? shown.map(m => row(m)) : [el('tr', {}, el('td', { colspan: 8, class: 'empty-note' }, q ? 'Nobody matches that.' : 'Nobody has joined yet.'))]));
  };
  search.addEventListener('input', () => { query = search.value; fill(); });
  const act = async (m, data, done) => {
    try { await post('members/action', { id: m.id, ...data }); ctx.toast(done); ctx.reload(); }
    catch (error) { ctx.toast(error.message, 'error'); }
  };
  function menu(m) {
    const items = [
      el('button', { type: 'button', role: 'menuitem', onclick: () => act(m, { action: 'keepAudio', value: !m.keepAudio }, m.keepAudio ? `${m.name}'s songs are temporary again.` : `${m.name}'s songs are kept from now on.`) },
        m.keepAudio ? 'Stop keeping their songs' : 'Keep their songs', el('small', {}, m.keepAudio ? 'Their audio is cleared again when they stop playing it' : 'Downloaded audio stays until they remove it')),
      el('button', { type: 'button', role: 'menuitem', disabled: !m.sessions, onclick: () => act(m, { action: 'signOut' }, `${m.name} is signed out everywhere.`) }, 'Sign out everywhere',
        el('small', {}, m.sessions ? `${plural(m.sessions, 'device')} signed in` : 'Not signed in anywhere')),
    ];
    if (!m.admin) {
      items.push(m.suspended
        ? el('button', { type: 'button', role: 'menuitem', onclick: () => act(m, { action: 'reinstate' }, `${m.name} can sign in again.`) }, 'Reinstate', el('small', {}, 'Let them sign in again'))
        : el('button', { type: 'button', role: 'menuitem', onclick: async () => {
          if (await ctx.confirm({ title: `Suspend ${m.name}?`, text: 'They are signed out everywhere and cannot sign in until you reinstate them. Nothing is deleted.', action: 'Suspend' })) act(m, { action: 'suspend' }, `${m.name} is suspended.`);
        } }, 'Suspend…', el('small', {}, 'Sign them out and keep them out')));
      items.push(el('button', { type: 'button', role: 'menuitem', class: 'danger', onclick: async () => {
        const typed = await ctx.confirm({ title: `Delete ${m.name}'s account?`, text: 'Their account, track list and any audio kept for them are removed for good. This cannot be undone.', action: 'Delete account', danger: true, typeToConfirm: m.email });
        if (typed) act(m, { action: 'delete', confirm: typed }, `${m.email} is deleted.`);
      } }, 'Delete account…', el('small', {}, 'Removes everything of theirs')));
    }
    const list = el('div', { class: 'menu', role: 'menu', hidden: true }, ...items);
    const button = el('button', { class: 'btn btn-small', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, 'Manage');
    const close = () => { list.hidden = true; button.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside); };
    const outside = e => { if (!list.contains(e.target) && e.target !== button) close(); };
    button.addEventListener('click', () => {
      const open = list.hidden;
      document.querySelectorAll('.menu').forEach(x => { x.hidden = true; });
      list.hidden = !open; button.setAttribute('aria-expanded', String(open));
      if (open) { document.addEventListener('pointerdown', outside); list.querySelector('button:not(:disabled)')?.focus(); }
    });
    list.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); button.focus(); } });
    list.addEventListener('click', e => { if (e.target.closest('button')) close(); });
    return el('div', { class: 'menu-wrap' }, button, list);
  }
  function row(m) {
    const badges = [m.admin && el('span', { class: 'badge' }, 'Admin'), m.keepAudio && el('span', { class: 'badge' }, 'Keeps songs'), m.suspended && el('span', { class: 'badge badge-critical' }, 'Suspended')];
    return el('tr', { class: m.suspended ? 'is-suspended' : '' },
      el('th', { scope: 'row', 'data-label': 'Member' }, el('span', { class: 'person' }, el('span', { class: m.online ? 'online-dot' : 'online-dot is-off', title: m.online ? 'Online now' : null, 'aria-label': m.online ? 'Online now' : null }), el('b', {}, m.name), el('span', {}, m.email)), el('span', { class: 'badges' }, ...badges)),
      el('td', { 'data-label': 'Joined' }, el('time', { title: when(m.created) }, ago(m.created))),
      el('td', { 'data-label': 'Last sign-in' }, m.lastSignIn ? el('time', { title: when(m.lastSignIn) }, ago(m.lastSignIn)) : '—'),
      el('td', { 'data-label': 'Signed in on', class: 'n' }, num(m.sessions)),
      el('td', { 'data-label': 'Track list', class: 'n' }, num(m.tracks)),
      el('td', { 'data-label': 'Audio stored', class: 'n' }, m.bytes ? bytes(m.bytes) : '—'),
      el('td', { 'data-label': 'Downloads, 7 days', class: 'n' }, num(m.imports7d)),
      el('td', { class: 'actions' }, menu(m)));
  }
  fill();
  const signups = new Map();
  for (const m of list) { const d = new Date(m.created).toISOString().slice(0, 10); signups.set(d, (signups.get(d) || 0) + 1); }
  const last30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10); return { day: d, joined: signups.get(d) || 0 }; });
  return el('div', { class: 'view' },
    el('div', { class: 'toolbar' }, search, count),
    el('div', { class: 'table-wrap' }, el('table', { class: 'data members' },
      el('thead', {}, el('tr', {}, ...['Member', 'Joined', 'Last sign-in', 'Signed in on', 'Track list', 'Audio stored', 'Downloads, 7 days', ''].map((h, i) => el('th', { scope: 'col', class: i >= 3 && i <= 6 ? 'n' : '' }, h)))), body)),
    panel('New members · last 30 days', dayColumns('New members', last30, r => r.joined, n => n === 1 ? 'new member' : 'new members').node),
    note('Admins are made on the server only (lib/admin-cli.js), so they cannot be suspended or deleted from here. Passwords and recovery keys are never shown to anyone, admins included.'));
}

// ── YouTube ───────────────────────────────────────────────────────────────────
export async function youtube(ctx) {
  const y = await get('youtube');
  const s = y.status;
  const state = !s.enabled ? lamp('off', 'Switched off for members') : s.available ? lamp('on', 'Working') : lamp('fault', `Not available: ${s.reason}`);
  const result = el('p', { class: 'test-result', role: 'status' });
  const test = el('button', { class: 'btn', type: 'button' }, 'Test YouTube now');
  test.addEventListener('click', async () => {
    test.disabled = true; result.textContent = 'Asking YouTube from the server…'; result.className = 'test-result';
    try {
      const r = await post('youtube/test', {});
      result.textContent = r.ok ? `● Answered in ${(r.ms / 1000).toFixed(1)} s through the same connection members use.` : `▲ Failed after ${(r.ms / 1000).toFixed(1)} s: ${r.reason}`;
      result.className = `test-result ${r.ok ? 'is-ok' : 'is-bad'}`;
    } catch (error) { result.textContent = `▲ ${error.message}`; result.className = 'test-result is-bad'; }
    finally { test.disabled = false; }
  });
  const toggle = el('button', { class: 'btn', type: 'button', onclick: async () => {
    const on = !s.enabled;
    if (!on && !await ctx.confirm({ title: 'Switch YouTube off?', text: 'Members can no longer search, download or get recommendations until you switch it back on. Their track lists and local files keep working.', action: 'Switch off' })) return;
    try { await post('settings', { changes: { youtubeEnabled: on } }); ctx.toast(on ? 'YouTube is on for members.' : 'YouTube is switched off.'); ctx.reload(); }
    catch (error) { ctx.toast(error.message, 'error'); }
  } }, s.enabled ? 'Switch off for members' : 'Switch on for members');
  const days = y.days;
  const totals = days.reduce((a, d) => { for (const k of ['imports', 'failed', 'cancelled', 'searches', 'searchFailed', 'recommendations', 'cache', 'bytes', 'ms', 'timed']) a[k] += d[k]; return a; },
    { imports: 0, failed: 0, cancelled: 0, searches: 0, searchFailed: 0, recommendations: 0, cache: 0, bytes: 0, ms: 0, timed: 0 });
  const failures = y.failures.length ? el('ol', { class: 'log' }, ...y.failures.map(f => el('li', {},
    el('time', { title: when(f.at) }, ago(f.at)), el('span', { class: 'log-what' }, KINDS[f.kind] || f.kind, el('span', { class: 'log-detail' }, ` · ${REASONS[f.reason] || f.reason || 'unknown'}`)),
    el('span', { class: 'log-who' }, f.ms ? `${(f.ms / 1000).toFixed(1)} s` : '')))) : el('p', { class: 'empty-note' }, 'Nothing has failed.');
  return el('div', { class: 'view' },
    el('div', { class: 'pair pair-wide' },
      panel('Connection', el('div', { class: 'status-big' }, state),
        el('dl', { class: 'facts' },
          el('dt', {}, 'yt-dlp'), el('dd', {}, s.ytdlp ? `${s.ytdlp.version} (${s.ytdlp.via})${s.ytdlp.jsRuntimes ? ', JavaScript runtime on' : ''}` : 'not found'),
          el('dt', {}, 'ffmpeg'), el('dd', {}, s.ffmpeg ? 'ready' : 'missing'),
          el('dt', {}, 'YouTube proxy'), el('dd', {}, s.proxySource === 'custom' ? 'custom proxy saved in Settings' : s.proxy ? 'server default' : 'no server proxy configured'),
          el('dt', {}, 'Downloading now'), el('dd', {}, `${num(s.downloading)} of ${num(s.maxDownloads)} at a time${y.jobs.length ? ` · ${y.jobs.map(j => `${j.state} ${Math.round(j.progress * 100)}%`).join(', ')}` : ''}`),
          el('dt', {}, 'Daily limit'), el('dd', {}, s.dailyLimit ? `${plural(s.dailyLimit, 'download')} per member in 24 hours` : 'none')),
        el('div', { class: 'row' }, test, toggle, el('button', { class: 'link', type: 'button', onclick: () => ctx.go('settings') }, 'Change proxy in Settings')), result),
      panel('Why downloads failed · last 7 days', ranked(y.reasons.filter(r => r.kind === 'import'), { label: r => REASONS[r.reason] || r.reason, tone: 'critical', empty: 'No download has failed this week.' }))),
    el('div', { class: 'tiles' },
      tile('Downloads, 30 days', num(totals.imports), `${totals.failed ? `${num(totals.failed)} failed (${percent(totals.failed, totals.imports + totals.failed)})` : 'none failed'}${totals.cancelled ? ` · ${num(totals.cancelled)} cancelled by switching tracks` : ''}`, { tone: totals.failed ? 'warn' : null }),
      tile('Average download', totals.timed ? `${(totals.ms / totals.timed / 1000).toFixed(1)} s` : '—', 'from asking to a playable MP3'),
      tile('Audio fetched', bytes(totals.bytes), 'through the proxy, 30 days'),
      tile('Searches', num(totals.searches), totals.searchFailed ? `${num(totals.searchFailed)} failed` : 'none failed'),
      tile('Recommendations', num(totals.recommendations), 'mixes fetched, 30 days'),
      tile('Played from the server’s copy', num(totals.cache), 'no new download needed')),
    panel('Downloads that worked · last 30 days', dayColumns('Downloads that worked', days, r => r.imports, n => n === 1 ? 'download' : 'downloads').node),
    panel('▲ Downloads that failed · last 30 days', columns({ label: 'Downloads that failed', rows: days, value: r => r.failed, axis: r => day(r.day), tone: 'critical',
      tip: r => [[num(r.failed), r.failed === 1 ? 'failed download' : 'failed downloads'], [dayLong(r.day), '']], table: { head: ['Day', 'Failed'], row: r => [dayLong(r.day), num(r.failed)] }, empty: 'No failures.' }).node),
    el('div', { class: 'pair' },
      panel('Latest failures', failures),
      panel('Most downloads · last 7 days', ranked(y.top, { label: r => r.email, value: r => r.imports, sub: r => ` · ${bytes(r.bytes)}`, empty: 'Nobody downloaded anything this week.' }))),
    note('The desk counts what YouTube was asked to do and why it failed. It never records which videos members chose.'));
}

// ── storage ───────────────────────────────────────────────────────────────────
export async function storage(ctx) {
  const s = await get('storage?fresh=1');
  const clear = (what, name) => el('button', { class: 'btn', type: 'button', onclick: async () => {
    if (!await ctx.confirm({ title: `Clear the ${name} cache?`, text: 'It fills up again by itself as people use the site; nothing members saved is touched.', action: 'Clear' })) return;
    try { await post('storage/clear', { what }); ctx.toast(`The ${name} cache is cleared.`); ctx.reload(); } catch (error) { ctx.toast(error.message, 'error'); }
  } }, `Clear ${name}`);
  return el('div', { class: 'view' },
    el('div', { class: 'pair' },
      panel('Server data', meter({ value: s.used, max: s.budget, label: 'Data on the server', text: `${bytes(s.used)} of ${bytes(s.budget)}` }),
        note('New downloads are refused when audio would pass 20 GB, so the site never fills the disk.')),
      panel('Disk', s.disk ? meter({ value: s.disk - s.free, max: s.disk, label: 'Disk in use', text: `${bytes(s.free)} free of ${bytes(s.disk)}` }) : el('p', { class: 'empty-note' }, 'The disk size could not be read.'),
        note('Downloads also stop when less than 2 GB is free.'))),
    el('div', { class: 'tiles' },
      tile('Member audio', bytes(s.audio.bytes), `${plural(s.audio.audio, 'MP3')} on the server now`),
      tile('Track lists', num(s.audio.tracks), 'saved tracks, as bookmarks'),
      tile('Lyrics cache', bytes(s.lyrics.bytes), plural(s.lyrics.files, 'file')),
      tile('Recommendations cache', bytes(s.magic.bytes), plural(s.magic.files, 'file')),
      tile('Database', bytes(s.database), 'members, sessions, traffic and this desk')),
    panel('Members by storage',
      s.members.length ? el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ...['Member', 'Keeps songs', 'Track list', 'MP3s now', 'Stored'].map((h, i) => el('th', { scope: 'col', class: i >= 2 ? 'n' : '' }, h)))),
        el('tbody', {}, ...s.members.map(m => el('tr', {}, el('th', { scope: 'row' }, m.email), el('td', {}, m.keepAudio ? 'yes' : 'no'), el('td', { class: 'n' }, num(m.tracks)), el('td', { class: 'n' }, num(m.audio)), el('td', { class: 'n' }, bytes(m.bytes))))))) : el('p', { class: 'empty-note' }, 'No member has anything stored.'),
      note('Most members’ audio is temporary: it is removed when they stop playing it. Members you set to keep songs hold on to theirs.')),
    panel('Caches', el('div', { class: 'row' }, clear('lyrics', 'lyrics'), clear('magic', 'recommendations'))));
}

// ── system ────────────────────────────────────────────────────────────────────
export async function system() {
  const s = await get('system');
  const c = s.container;
  return el('div', { class: 'view' },
    el('div', { class: 'tiles' },
      tile('Running for', duration(s.uptime), `since ${when(s.startedAt)}`),
      tile('Memory', c.memoryUsed ? bytes(c.memoryUsed) : bytes(s.memory.rss), c.memoryLimit ? `of ${bytes(c.memoryLimit)} for the container` : `app ${bytes(s.memory.rss)}`),
      tile('CPU', `${Math.round(s.cpu * 100)}%`, `of one core, since the last look · ${s.cpus} cores`),
      tile('Responsiveness', `${s.loop.p99.toFixed(1)} ms`, `slowest 1% of waits · typical ${s.loop.p50.toFixed(1)} ms`, { tone: s.loop.p99 > 100 ? 'warn' : null }),
      tile('Server load', s.load.map(v => v.toFixed(2)).join(' · '), 'last 1, 5 and 15 minutes')),
    el('div', { class: 'pair' },
      panel('This build', s.build ? el('dl', { class: 'facts' },
        el('dt', {}, 'Build'), el('dd', {}, s.build.id),
        el('dt', {}, 'Scenes'), el('dd', {}, `${num(s.build.scenes)} (${num(s.build.memberScenes)} for members)`),
        el('dt', {}, 'Tools'), el('dd', {}, num(s.build.tools)),
        el('dt', {}, 'Published files'), el('dd', {}, num(s.build.files))) : el('p', { class: 'empty-note' }, 'Running from source files (not a production build).')),
      panel('Software', el('dl', { class: 'facts' },
        el('dt', {}, 'Node.js'), el('dd', {}, s.node),
        el('dt', {}, 'System'), el('dd', {}, s.platform),
        el('dt', {}, 'yt-dlp'), el('dd', {}, s.youtube.ytdlp?.version || 'not found'),
        el('dt', {}, 'ffmpeg'), el('dd', {}, s.youtube.ffmpeg ? 'ready' : 'missing')))),
    note('This view refreshes every 10 seconds while it is open.'));
}

// ── settings ──────────────────────────────────────────────────────────────────
function proxySettings(initial, ctx) {
  let state = initial;
  const status = el('p', { class: 'note', role: 'status' });
  const result = el('p', { class: 'test-result', role: 'status' });
  const field = el('input', { id: 'set-youtube-proxy', type: 'password', autocomplete: 'new-password', spellcheck: 'false',
    autocapitalize: 'none', maxlength: 4096, required: true, placeholder: 'host:port:username:password', 'aria-describedby': 'proxy-help' });
  const reveal = el('button', { class: 'btn', type: 'button', 'aria-controls': 'set-youtube-proxy', 'aria-pressed': 'false', onclick: () => {
    const show = field.type === 'password'; field.type = show ? 'text' : 'password';
    reveal.textContent = show ? 'Hide' : 'Show'; reveal.setAttribute('aria-pressed', String(show));
  } }, 'Show');
  const save = el('button', { class: 'btn btn-primary', type: 'submit' }, 'Save proxy');
  const reset = el('button', { class: 'btn', type: 'button' }, 'Use server default');
  const test = el('button', { class: 'btn', type: 'button' }, 'Test saved connection');
  const controls = [field, reveal, save, reset, test];
  const update = () => {
    status.textContent = state.source === 'custom' ? `Custom proxy active · saved ${when(state.updatedAt)}.`
      : state.source === 'server' ? 'Using the server’s default proxy.' : 'No server proxy is configured.';
    reset.disabled = state.source !== 'custom';
  };
  const busy = on => { controls.forEach(node => { node.disabled = on; }); if (!on) update(); };
  const change = async input => {
    busy(true); result.textContent = ''; result.className = 'test-result';
    try {
      const response = await post('youtube/proxy', input);
      state = response.youtubeProxy;
      field.value = ''; field.type = 'password'; reveal.textContent = 'Show'; reveal.setAttribute('aria-pressed', 'false');
      ctx.toast(input.action === 'set' ? 'Proxy saved. New YouTube requests use it now.' : 'The server default is restored.');
    } catch (error) { result.textContent = error.message; result.className = 'test-result is-bad'; }
    finally { busy(false); }
  };
  const form = el('form', {},
    el('div', { class: 'setting setting-stack' },
      el('label', { for: 'set-youtube-proxy' }, el('b', {}, 'New proxy URL'),
        el('span', { id: 'proxy-help' }, 'Paste host:port:username:password or a full proxy URL. The short format uses HTTP. For HTTPS or SOCKS, include the protocol in the URL.')),
      el('div', { class: 'row proxy-input' }, field, reveal)),
    el('div', { class: 'row' }, save, reset, test));
  form.addEventListener('submit', event => { event.preventDefault(); change({ action: 'set', url: field.value }); });
  reset.addEventListener('click', () => change({ action: 'reset' }));
  test.addEventListener('click', async () => {
    busy(true); result.textContent = 'Testing the saved connection with YouTube…'; result.className = 'test-result';
    try {
      const r = await post('youtube/test', {});
      result.textContent = r.ok ? `● YouTube search answered in ${(r.ms / 1000).toFixed(1)} s. Audio downloads may still be restricted by YouTube.`
        : `▲ Connection test failed: ${r.reason}`;
      result.className = `test-result ${r.ok ? 'is-ok' : 'is-bad'}`;
    } catch (error) { result.textContent = error.message; result.className = 'test-result is-bad'; }
    finally { busy(false); }
  });
  update();
  return panel('YouTube proxy', status, form, result,
    note('Saved credentials are never shown again. Changes apply to new searches, recommendations and downloads; requests already running finish with their current connection.'));
}

export async function settings(ctx) {
  const { settings: s, youtubeProxy } = await get('settings');
  const save = async (changes, done) => {
    try { await post('settings', { changes }); ctx.toast(done); ctx.reload(); return true; }
    catch (error) { ctx.toast(error.message, 'error'); return false; }
  };
  const swtch = (key, label, help, onText, offText) => {
    const input = el('input', { type: 'checkbox', role: 'switch', checked: s[key], id: `set-${key}` });
    input.addEventListener('change', async () => { input.disabled = true; if (!await save({ [key]: input.checked }, input.checked ? onText : offText)) input.checked = !input.checked; input.disabled = false; });
    return el('div', { class: 'setting' }, el('label', { for: `set-${key}` }, el('b', {}, label), el('span', {}, help)), el('span', { class: 'switch' }, input, el('span', { class: 'switch-track', 'aria-hidden': 'true' })));
  };
  const limit = el('input', { type: 'number', min: 0, max: 1000, step: 1, value: s.youtubeDailyLimit, id: 'set-limit', inputmode: 'numeric' });
  const limitSave = el('button', { class: 'btn', type: 'button', onclick: () => {
    const v = Number(limit.value);
    if (!Number.isInteger(v) || v < 0 || v > 1000) return ctx.toast('Use a whole number from 0 to 1000.', 'error');
    save({ youtubeDailyLimit: v }, v ? `Members can start ${plural(v, 'download')} a day.` : 'No daily limit.');
  } }, 'Save limit');
  const text = el('textarea', { id: 'set-notice', rows: 2, maxlength: 240, placeholder: 'For example: New scenes tonight. Everything may pause for a minute around 22:00.' });
  text.value = s.notice;
  const kind = el('select', { id: 'set-kind', 'aria-label': 'Notice style' }, el('option', { value: 'info' }, 'Information'), el('option', { value: 'warn' }, 'Warning'));
  kind.value = s.noticeKind;
  const left = el('span', { class: 'count' });
  const counter = () => { left.textContent = `${240 - text.value.length} characters left`; };
  text.addEventListener('input', counter); counter();
  return el('div', { class: 'view narrow' },
    panel('Site',
      swtch('signupsOpen', 'Sign-ups', 'New people can create an account. Members who have one can always sign in.', 'Sign-ups are open.', 'Sign-ups are paused.'),
      swtch('youtubeEnabled', 'YouTube', 'Members can search YouTube, download audio and get recommendations.', 'YouTube is on for members.', 'YouTube is switched off.')),
    proxySettings(youtubeProxy, ctx),
    panel('Daily YouTube downloads per member',
      el('div', { class: 'setting setting-stack' }, el('label', { for: 'set-limit' }, el('b', {}, 'Limit'), el('span', {}, 'Counts every download a member starts in 24 hours, a track loaded again after its audio was cleared included. 0 means no limit. Admins are never limited.')),
        el('div', { class: 'row' }, limit, limitSave))),
    panel('Notice to visitors',
      el('div', { class: 'setting setting-stack' }, el('label', { for: 'set-notice' }, el('b', {}, 'Message'), el('span', {}, 'Shown once to everyone who opens the site, as a short message at the top of the stage.')),
        text, el('div', { class: 'row' }, kind, left)),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { if (!text.value.trim()) return ctx.toast('Write the message first.', 'error'); save({ notice: text.value.trim(), noticeKind: kind.value }, 'The notice is up.'); } }, s.notice ? 'Update notice' : 'Put the notice up'),
        s.notice ? el('button', { class: 'btn', type: 'button', onclick: () => save({ notice: '' }, 'The notice is down.') }, 'Take it down') : null)),
    panel('Desk address',
      el('div', { class: 'setting setting-stack' }, el('label', { for: 'desk-address' }, el('b', {}, 'This desk opens only here'),
        el('span', {}, 'Bookmark it. Without this address the desk does not exist, even for an admin who is signed in: /admin is an ordinary missing page.')),
        el('div', { class: 'row' }, el('input', { id: 'desk-address', type: 'text', readonly: true, value: location.origin + location.pathname, class: 'address', spellcheck: 'false' }),
          el('button', { class: 'btn', type: 'button', onclick: async () => {
            try { await navigator.clipboard.writeText(location.origin + location.pathname); ctx.toast('The address is copied.'); } catch { document.getElementById('desk-address').select(); ctx.toast('Press Ctrl+C to copy it.'); }
          } }, 'Copy'))),
      el('div', { class: 'row' }, el('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!await ctx.confirm({ title: 'Give the desk a new address?', text: 'The current address stops working at once, here and in any bookmark. This page moves to the new one; bookmark it again.', action: 'New address' })) return;
        try { const { path } = await post('desk/new', {}); location.replace(path + location.hash); } catch (error) { ctx.toast(error.message, 'error'); }
      } }, 'Make a new address'))),
    note('Every change applies at once and goes into the log with your name.'));
}

// ── log ───────────────────────────────────────────────────────────────────────
export async function log() {
  const { log: entries } = await get('log?limit=300');
  if (!entries.length) return el('div', { class: 'view' }, panel('Log', el('p', { class: 'empty-note' }, 'Nothing has been changed from the desk yet.')));
  return el('div', { class: 'view' },
    el('div', { class: 'table-wrap' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ...['When', 'What', 'Member or setting', 'Details', 'Who'].map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, ...entries.map(e => { const l = logLine(e); return el('tr', {}, el('th', { scope: 'row' }, el('time', { datetime: new Date(e.at).toISOString() }, when(e.at))), el('td', {}, l.what), el('td', {}, l.target || '—'), el('td', {}, l.detail || '—'), el('td', {}, e.admin)); })))),
    note('The latest 300 changes. The server keeps the last 5,000.'));
}
