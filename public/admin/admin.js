import { el } from '../js/util.js';
import { get, SignedOut } from './api.js';
import { liveStrip, hideTip } from './charts.js';
import { num, duration } from './format.js';
import * as views from './views.js';

// The admin desk: the room behind the rack. A faceplate with an LCD and a live strip of the
// site's requests on top, the views underneath. Read-only views refresh themselves while they
// are open; the ones you type into wait for you.

const VIEWS = [['overview', 'Overview'], ['traffic', 'Traffic'], ['members', 'Members'], ['youtube', 'YouTube'], ['storage', 'Storage'], ['system', 'System'], ['settings', 'Settings'], ['log', 'Log']];
const AUTO = { overview: 30e3, traffic: 60e3, youtube: 30e3, system: 10e3 };

// ── faceplate ─────────────────────────────────────────────────────────────────
const lcdMain = el('span', { class: 'lcd-main' }, 'Connecting…');
const lcdSub = el('span', { class: 'lcd-sub' });
const strip = liveStrip();
const tabs = VIEWS.map(([id, label]) => el('button', { class: 'tab', type: 'button', role: 'tab', 'data-view': id, 'aria-selected': 'false', onclick: () => go(id) }, label));
const main = el('main', { id: 'main', tabindex: -1 });
const toasts = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
document.body.append(
  el('header', { class: 'top' },
    el('a', { class: 'brand', href: '#overview' }, el('span', { class: 'wordmark' }, 'Visulaserz'), el('span', { class: 'legend' }, 'Admin desk')),
    el('div', { class: 'lcd', role: 'status' }, lcdMain, lcdSub),
    el('a', { class: 'btn btn-small', href: '/' }, 'Open the site')),
  el('div', { class: 'strip' }, el('span', { class: 'legend strip-legend' }, 'Requests · last 10 min'), strip.node),
  el('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Desk views' }, ...tabs),
  main, toasts);

// ── helpers every view gets ───────────────────────────────────────────────────
function toast(message, kind = 'info') {
  const node = el('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  toasts.append(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  setTimeout(() => { node.classList.remove('is-in'); setTimeout(() => node.remove(), 300); }, kind === 'error' ? 7000 : 4200);
}

// A question that needs an answer before something drastic; with typeToConfirm the button only
// wakes once the exact text has been typed, and the typed text is what comes back.
const dialog = el('dialog', { class: 'confirm' });
document.body.append(dialog);
function confirm({ title, text, action, danger = false, typeToConfirm = null }) {
  return new Promise(resolve => {
    const field = typeToConfirm ? el('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': `Type ${typeToConfirm} to confirm` }) : null;
    const yes = el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'submit', disabled: !!field }, action);
    const no = el('button', { class: 'btn', type: 'button' }, 'Cancel');
    const form = el('form', { method: 'dialog' }, el('h2', {}, title), el('p', {}, text),
      field ? el('label', { class: 'confirm-type' }, el('span', {}, 'Type ', el('b', {}, typeToConfirm), ' to confirm'), field) : null,
      el('div', { class: 'row row-end' }, no, yes));
    const matches = () => !field || field.value.trim().toLowerCase() === typeToConfirm.toLowerCase();
    field?.addEventListener('input', () => { yes.disabled = !matches(); });
    let answer = false;
    form.addEventListener('submit', e => { if (!matches()) { e.preventDefault(); return; } answer = field ? field.value : true; });
    no.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => resolve(answer), { once: true });
    dialog.replaceChildren(form);
    dialog.showModal();
    (field || no).focus();
  });
}

// ── views ─────────────────────────────────────────────────────────────────────
let current = null, timer = 0, ticket = 0;
const ctx = { toast, confirm, go: id => go(id), reload: () => show(current, { quiet: true }) };

function go(id) {
  if (!VIEWS.some(([v]) => v === id)) id = 'overview';
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  show(id);
}
async function show(id, { quiet = false } = {}) {
  clearTimeout(timer);
  hideTip();
  const mine = ++ticket;
  if (!quiet) {
    current = id;
    tabs.forEach(t => { const on = t.dataset.view === id; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', String(on)); });
    document.title = `${VIEWS.find(([v]) => v === id)[1]} · Admin desk · Visulaserz`;
  }
  main.classList.add('is-loading');                       // the old view stays, dimmed, until the new one is ready
  try {
    const node = await views[id](ctx);
    if (mine !== ticket) return;                          // another view was asked for meanwhile
    main.replaceChildren(node);
    if (!quiet) main.focus({ preventScroll: true });
  } catch (error) {
    if (mine !== ticket) return;
    if (error instanceof SignedOut) return signedOut();
    main.replaceChildren(el('div', { class: 'view' }, el('section', { class: 'unit unit-fault' }, el('h2', { class: 'legend' }, 'Could not load this view'),
      el('p', {}, error.message), el('button', { class: 'btn', type: 'button', onclick: () => show(id) }, 'Try again'))));
  } finally { if (mine === ticket) main.classList.remove('is-loading'); }
  if (AUTO[id]) timer = setTimeout(function again() { if (document.hidden) { timer = setTimeout(again, 5e3); return; } show(id, { quiet: true }); }, AUTO[id]);
}

// Not (or no longer) an admin: the same answer whatever the reason, and a way back.
let gone = false;
function signedOut() {
  if (gone) return;
  gone = true;
  clearTimeout(timer); clearInterval(live);
  document.body.replaceChildren(el('div', { class: 'gate' }, el('section', { class: 'unit' },
    el('span', { class: 'wordmark' }, 'Visulaserz'), el('h1', {}, 'Sign in as an admin'),
    el('p', {}, 'This desk only opens for an admin who is signed in. Sign in on the site, then come back here.'),
    el('a', { class: 'btn btn-primary', href: '/' }, 'Open the site'))));
}

// ── the LCD and the live strip, every five seconds ────────────────────────────
async function tick() {
  if (document.hidden) return;
  try {
    const l = await get('live');
    const perMinute = l.series.slice(-6).reduce((a, b) => a + b.requests, 0);
    lcdMain.textContent = `● ${num(l.visitors)} online${l.members ? ` · ${num(l.members)} ${l.members === 1 ? 'member' : 'members'}` : ''}`;
    lcdSub.textContent = `${num(perMinute)} req/min${l.downloading ? ` · ↓ ${num(l.downloading)} downloading` : ''} · up ${duration(l.uptime)}`;
    strip.update(l.series);
  } catch (error) {
    if (error instanceof SignedOut) return signedOut();
    lcdMain.textContent = '▲ No answer from the server';
    lcdSub.textContent = '';
  }
}
const live = setInterval(tick, 5e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
tick();
addEventListener('hashchange', () => go(location.hash.slice(1)));
go(location.hash.slice(1) || 'overview');
