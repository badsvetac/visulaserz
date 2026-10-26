// Numbers, sizes and times the way the desk shows them: English, the viewer's own clock.

const LOCALE = 'en-GB';
const whole = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const languages = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;

export const num = n => whole.format(Math.round(Number(n) || 0));

// 980 · 1.2K · 12K · 1.2M: short enough for a tile, exact in the tooltip and the table.
export function compact(n) {
  const v = Number(n) || 0, a = Math.abs(v);
  if (a < 1000) return whole.format(v);
  const [d, s] = a < 1e6 ? [1e3, 'K'] : a < 1e9 ? [1e6, 'M'] : [1e9, 'B'];
  const x = v / d;
  return `${Math.abs(x) < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.round(x)}${s}`;
}

export function bytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let x = v / 1024, i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x < 10 ? x.toFixed(1) : Math.round(x)} ${units[i]}`;
}

export function duration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 && m < 10 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const full = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

export const clock = t => time.format(new Date(t));
export const when = t => t ? full.format(new Date(t)) : '—';

// "2 min ago", "3 h ago", "yesterday 21:40", "5 Oct": recent things relative, old things dated.
export function ago(t) {
  if (!t) return 'never';
  const diff = Date.now() - t;
  if (diff < 45e3) return 'just now';
  if (diff < 3600e3) return `${Math.round(diff / 60e3)} min ago`;
  if (diff < 864e5 && new Date(t).getDate() === new Date().getDate()) return `${Math.round(diff / 3600e3)} h ago`;
  if (diff < 2 * 864e5) return `yesterday ${clock(t)}`;
  return dayMonth.format(new Date(t));
}

// The server counts in UTC days ("2026-10-05"); shown as "5 Oct", or "Mon 5 Oct" for a tooltip.
export const day = iso => dayMonth.format(new Date(`${iso}T12:00:00Z`));
export const dayLong = iso => weekday.format(new Date(`${iso}T12:00:00Z`));

export function region(code) {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try { return regions?.of(code) || code; } catch { return code; }
}
export function language(code) {
  if (!/^[a-z]{2,3}$/.test(code)) return code === 'unknown' ? 'Not given' : code;
  try { return languages?.of(code) || code; } catch { return code; }
}

export const percent = (part, whole) => whole ? `${Math.round((part / whole) * 100)}%` : '—';
export const plural = (n, one, many = `${one}s`) => `${num(n)} ${Number(n) === 1 ? one : many}`;
