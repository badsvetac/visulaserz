import { el } from '../js/util.js';
import { num } from './format.js';

// The desk's charts, drawn by hand in SVG: columns over time, ranked bars, meters, the live strip
// and the week heatmap. One series each, so colour never has to tell two things apart; every chart
// can be read without hovering (direct labels, or its table twin), and every hover works by
// keyboard too. Text is always set with textContent: labels come from requests the site received.

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };

// ── the one tooltip ──────────────────────────────────────────────────────────
let tip = null;
export function showTip(anchor, lines) {
  if (!tip) { tip = el('div', { class: 'tip', role: 'status', 'aria-live': 'polite' }); document.body.append(tip); }
  tip.replaceChildren(...lines.map(([value, label, key]) => el('div', { class: 'tip-row' },
    key ? el('span', { class: `tip-key tip-key-${key}` }) : null, el('strong', {}, String(value)), label ? el('span', {}, String(label)) : null)));
  tip.hidden = false;
  const r = anchor.getBoundingClientRect(), t = tip.getBoundingClientRect();
  const x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8);
  const above = r.top - t.height - 10;
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(above > 8 ? above : r.bottom + 10)}px`;
}
export function hideTip() { if (tip) tip.hidden = true; }
addEventListener('scroll', hideTip, { passive: true, capture: true });

// Clean ticks for counts: 0 / 5 / 10, 0 / 200 / 400 — never 0 / 3.33 / 6.67.
function ticks(max, count = 3) {
  max = Math.max(max, 4);                 // a day with one visitor should look like one, not like a full house
  const rough = max / count, mag = 10 ** Math.floor(Math.log10(rough)), n = rough / mag;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag);
  return { top: Math.ceil(max / step) * step, step };
}
// A column with a 4px rounded data end and a square foot on the baseline.
function column(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// A figure that can swap its drawing for a plain table: the chart's accessible twin.
function figure({ label, table }) {
  const plot = el('div', { class: 'chart-plot' });
  const twin = el('div', { class: 'chart-table', hidden: true });
  const toggle = el('button', { class: 'chart-toggle', type: 'button', 'aria-pressed': 'false', title: 'Show the numbers as a table' }, 'Table');
  toggle.addEventListener('click', () => {
    const on = twin.hidden;
    twin.hidden = !on; plot.hidden = on;
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? 'Chart' : 'Table';
  });
  const node = el('figure', { class: 'chart', 'aria-label': label }, toggle, plot, twin);
  const fill = rows => {
    const head = el('tr', {}, ...table.head.map(h => el('th', { scope: 'col' }, h)));
    twin.replaceChildren(el('table', { class: 'data' }, el('thead', {}, head), el('tbody', {}, ...rows.map(r => el('tr', {}, ...table.row(r).map((c, i) => el(i ? 'td' : 'th', i ? {} : { scope: 'row' }, String(c))))))));
  };
  return { node, plot, fill };
}

// ── columns: one value per day or hour ───────────────────────────────────────
// rows: [{ key, label, value, ... }]; label(r) shows under the axis, tip(r) gives tooltip lines.
export function columns({ label, rows, value = r => r.value, axis = r => r.label, tip: tipLines, table, height = 168, tone = 'series', empty = 'Nothing counted yet.' }) {
  const f = figure({ label, table });
  let data = rows, width = 0, active = -1, hits = [];
  const draw = () => {
    width = f.plot.clientWidth || 640;
    const M = { l: 34, r: 6, t: 20, b: 24 }, W = Math.max(120, width - M.l - M.r), H = height;
    const n = data.length, band = W / Math.max(1, n), bw = Math.max(2, Math.min(24, band * 0.62));
    const max = Math.max(0, ...data.map(value));
    const { top, step } = ticks(max);
    const y = v => M.t + H - (v / top) * H;
    const s = svg('svg', { width, height: M.t + H + M.b, viewBox: `0 0 ${width} ${M.t + H + M.b}`, role: 'img', 'aria-label': label, tabindex: 0, class: `cols tone-${tone}` });
    for (let v = 0; v <= top + 1e-9; v += step) {
      const gy = Math.round(y(v)) + 0.5;
      s.append(svg('line', { x1: M.l, x2: M.l + W, y1: gy, y2: gy, class: v === 0 ? 'baseline' : 'gridline' }));
      const t = svg('text', { x: M.l - 6, y: gy + 3.5, class: 'tick', 'text-anchor': 'end' }); t.textContent = num(v); s.append(t);
    }
    // under the axis: as many labels as fit without touching, always the last one
    const every = Math.max(1, Math.ceil(58 / band));
    hits = [];
    data.forEach((r, i) => {
      const v = value(r), x = M.l + i * band + (band - bw) / 2, h = Math.max(0, y(0) - y(v));
      if (v > 0) s.append(svg('path', { d: column(x, y(v), bw, h), class: 'bar', 'data-i': i }));
      if ((n - 1 - i) % every === 0) { const t = svg('text', { x: x + bw / 2, y: M.t + H + 16, class: 'tick', 'text-anchor': 'middle' }); t.textContent = axis(r); s.append(t); }
      const hit = svg('rect', { x: M.l + i * band, y: M.t, width: band, height: H, class: 'hit', 'data-i': i });
      hits.push(hit); s.append(hit);
    });
    // the peak, labelled at its tip (one number, not one per column)
    if (max > 0) {
      const i = data.findIndex(r => value(r) === max), x = M.l + i * band + band / 2;
      const t = svg('text', { x: Math.min(Math.max(x, M.l + 12), M.l + W - 12), y: y(max) - 6, class: 'peak', 'text-anchor': 'middle' }); t.textContent = num(max); s.append(t);
    } else {
      const t = svg('text', { x: M.l + W / 2, y: M.t + H / 2, class: 'empty', 'text-anchor': 'middle' }); t.textContent = empty; s.append(t);
    }
    const focus = i => {
      active = i;
      s.querySelectorAll('.bar.is-on').forEach(b => b.classList.remove('is-on'));
      if (i < 0) return hideTip();
      s.querySelector(`.bar[data-i="${i}"]`)?.classList.add('is-on');
      showTip(hits[i], tipLines(data[i]));
    };
    s.addEventListener('pointermove', e => { const i = Number(e.target.dataset?.i); if (Number.isInteger(i) && i !== active) focus(i); });
    s.addEventListener('pointerleave', () => focus(-1));
    s.addEventListener('blur', () => focus(-1));
    s.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); focus(Math.min(n - 1, Math.max(0, (active < 0 ? n : active) + (e.key === 'ArrowRight' ? 1 : -1)))); }
      if (e.key === 'Escape') focus(-1);
    });
    f.plot.replaceChildren(s);
    f.fill(data);
  };
  new ResizeObserver(() => { if (f.plot.clientWidth && f.plot.clientWidth !== width) draw(); }).observe(f.plot);
  requestAnimationFrame(draw);
  return { node: f.node, update(next) { data = next; draw(); } };
}

// ── ranked bars: a top-N list with the value printed beside every bar ─────────
export function ranked(rows, { label = r => r.key, value = r => r.n, sub = null, tone = 'series', empty = 'Nothing counted yet.' } = {}) {
  if (!rows.length) return el('p', { class: 'empty-note' }, empty);
  const max = Math.max(...rows.map(value), 1);
  return el('ol', { class: `ranked tone-${tone}` }, ...rows.map(r => el('li', {},
    el('span', { class: 'ranked-label' }, String(label(r))),
    el('span', { class: 'ranked-value' }, num(value(r)), sub ? el('small', {}, sub(r)) : null),
    el('span', { class: 'ranked-track', 'aria-hidden': 'true' }, el('span', { class: 'ranked-fill', style: `width:${Math.max(1.5, (value(r) / max) * 100)}%` })))));
}

// ── meter: one ratio against a limit, its fill turning amber then red near the top ──
export function meter({ value, max, label, text }) {
  const ratio = max ? Math.min(1, value / max) : 0;
  const state = ratio >= 0.9 ? 'critical' : ratio >= 0.75 ? 'warning' : 'ok';
  return el('div', { class: `meter meter-${state}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-label': label },
    el('div', { class: 'meter-head' }, el('span', {}, label), el('strong', {}, text)),
    el('div', { class: 'meter-track' }, el('div', { class: 'meter-fill', style: `width:${Math.max(ratio * 100, value > 0 ? 1 : 0)}%` })),
    state !== 'ok' ? el('p', { class: 'meter-state' }, state === 'critical' ? '▲ Nearly full' : '● Getting full') : null);
}

// ── the live strip: ten minutes of requests in ten-second columns, on the LCD ──
export function liveStrip() {
  const node = el('div', { class: 'live-strip', role: 'img', 'aria-label': 'Requests in the last ten minutes' });
  let series = [], width = 0;
  const draw = () => {
    width = node.clientWidth || 600;
    const H = node.clientHeight || 44, n = series.length || 60, band = width / n, bw = Math.max(1, band - 2);
    const max = Math.max(4, ...series.map(b => b.requests));
    const s = svg('svg', { width, height: H, viewBox: `0 0 ${width} ${H}` });
    series.forEach((b, i) => {
      const h = b.requests ? Math.max(2, (b.requests / max) * (H - 4)) : 0;
      const x = i * band + 1;
      s.append(svg('rect', { x, y: H - 1, width: bw, height: 1, class: 'floor' }));
      if (h) s.append(svg('rect', { x, y: H - h, width: bw, height: h, rx: Math.min(2, bw / 2), class: i === n - 1 ? 'col now' : b.views ? 'col view' : 'col' }));
      const hit = svg('rect', { x: i * band, y: 0, width: band, height: H, class: 'hit' });
      hit.addEventListener('pointerenter', () => showTip(hit, [[num(b.requests), b.requests === 1 ? 'request' : 'requests'], ...(b.views ? [[num(b.views), b.views === 1 ? 'page opened' : 'pages opened']] : []), [new Date(b.t).toLocaleTimeString('en-GB'), '']]));
      hit.addEventListener('pointerleave', hideTip);
      s.append(hit);
    });
    node.replaceChildren(s);
  };
  new ResizeObserver(() => { if (node.clientWidth !== width) draw(); }).observe(node);
  return { node, update(next) { series = next; draw(); } };
}

// ── heatmap: when in the week people come, from hourly visitors, in the viewer's clock ──
export function weekHeatmap(hours, { label = 'Visitors by hour of the week' } = {}) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const h of hours) { const d = new Date(h.t); grid[(d.getDay() + 6) % 7][d.getHours()] += h.visitors; }
  const max = Math.max(0, ...grid.flat());
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const step = v => v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999));
  const f = figure({ label, table: { head: ['Day', ...Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))], row: r => [r.day, ...r.cells] } });
  const wrap = el('div', { class: 'heat', role: 'img', 'aria-label': label });
  wrap.append(el('span', {}), ...Array.from({ length: 24 }, (_, h) => el('span', { class: 'heat-hour' }, h % 3 ? '' : String(h).padStart(2, '0'))));
  grid.forEach((row, d) => {
    wrap.append(el('span', { class: 'heat-day' }, days[d]));
    row.forEach((v, h) => {
      const cell = el('span', { class: `heat-cell s${step(v)}`, tabindex: v ? 0 : -1 });
      const lines = () => [[num(v), v === 1 ? 'visitor' : 'visitors'], [`${days[d]} ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`, '']];
      cell.addEventListener('pointerenter', () => showTip(cell, lines()));
      cell.addEventListener('focus', () => showTip(cell, lines()));
      cell.addEventListener('pointerleave', hideTip);
      cell.addEventListener('blur', hideTip);
      wrap.append(cell);
    });
  });
  const legend = el('div', { class: 'heat-legend', 'aria-hidden': 'true' }, el('span', {}, 'Fewer'), ...[1, 2, 3, 4, 5].map(i => el('span', { class: `heat-cell s${i}` })), el('span', {}, 'More'));
  f.plot.append(wrap, legend);
  f.fill(grid.map((cells, d) => ({ day: days[d], cells })));
  return f.node;
}
