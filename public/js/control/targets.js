import { knobOf } from '../ui/knob.js';
import { padOf } from '../ui/pad.js';

// What a controller can move. Any knob, pad, touch surface or button on the page can be learnt,
// and it is found again later by where it lives (a tool's panel, a rack unit, any element with an
// id) and by its place among the controls of its kind in there. So a mapping survives a reload,
// and a tool that is closed and opened again picks its mappings back up.

const surfaces = new WeakMap();   // element → { down(p), move(p), up() }, p = { x, y } in 0..1, y up

// A tool's touch surface (Touch FX's pad, the theremin) offers itself to controllers here.
export function registerSurface(node, api) {
  surfaces.set(node, api);
  node.dataset.surface = '';
  return () => { surfaces.delete(node); delete node.dataset.surface; };
}

const SELECT = { knob: '.knob', pad: '.pad', surface: '[data-surface]', button: 'button' };

export function kindOf(node) {
  if (!(node instanceof Element)) return null;
  if (node.matches('.knob') && knobOf(node)) return 'knob';
  if (node.matches('.pad') && padOf(node)) return 'pad';
  if (surfaces.has(node)) return 'surface';
  if (node.matches('button')) return 'button';
  return null;
}

// The control under a pointer: the nearest learnable thing around what it hit. The Control
// unit's own buttons are left out, or Learn would learn itself, and so is the way around the page
// (the rack's tabs, a drawer's close, a tool's header): those keep working while Learn is on, so
// a control in another rack unit, a drawer or a tool can be reached and learnt.
const NAVIGATION = '#unit-control, .learn-chip, .rack-tabs, #rack-toggle, #btn-rack, #crate-close, #market-close, .market-tabs, .tool-head, #help-close';
export function controlAt(hit) {
  for (let n = hit instanceof Element ? hit : null; n && n !== document.body; n = n.parentElement) {
    if (n.closest(NAVIGATION)) return null;
    if (kindOf(n)) return n;
  }
  return null;
}

function scopeOf(node) {
  const tool = node.closest('.tool-panel[data-tool]');
  if (tool) return { key: `tool:${tool.dataset.tool}`, root: tool };
  const holder = node.closest('[id]');
  if (holder) return { key: `#${holder.id}`, root: holder };
  return { key: 'page', root: document.body };
}
function rootOf(scope) {
  if (scope.startsWith('tool:')) return document.querySelector(`.tool-panel[data-tool="${CSS.escape(scope.slice(5))}"]`);
  if (scope.startsWith('#')) return document.getElementById(scope.slice(1));
  return document.body;
}
function members(root, scope, kind) {
  const list = root.matches(SELECT[kind]) ? [root] : [];
  list.push(...root.querySelectorAll(SELECT[kind]));
  return list.filter((n) => kindOf(n) === kind && scopeOf(n).key === scope);
}

function nameOf(node, kind) {
  if (kind === 'knob') return knobOf(node).label;
  if (kind === 'pad') return node.querySelector('.pad-label')?.textContent || 'Pad';
  if (kind === 'surface') return 'Touch pad';
  const text = node.getAttribute('aria-label') || node.querySelector('.cycle-label, .switch-label')?.textContent || node.textContent || node.title || 'Button';
  return text.trim().replace(/\s+/g, ' ').slice(0, 28);
}
function placeOf(node) {
  const panel = node.closest('.tool-panel');
  if (panel) return panel.querySelector('.tool-name')?.textContent || '';
  const unit = node.closest('.rack-unit');
  if (unit) return document.querySelector(`.rack-tabs .tab[data-unit="${unit.id.replace(/^unit-/, '')}"]`)?.textContent || '';
  return '';
}

// Where a control lives, in a form that can be stored: { scope, kind, index, label }.
export function addressOf(node) {
  const kind = kindOf(node);
  if (!kind) return null;
  const { key, root } = scopeOf(node);
  const index = members(root, key, kind).indexOf(node);
  if (index < 0) return null;
  const place = placeOf(node), name = nameOf(node, kind);
  return { scope: key, kind, index, label: place && place !== name ? `${place} · ${name}` : name };
}

// The element an address points at now, or null when it is not on the page (a closed tool).
export function resolve(addr) {
  const root = rootOf(addr.scope);
  if (!root) return null;
  return members(root, addr.scope, addr.kind)[addr.index] || null;
}

// ── moving a control ─────────────────────────────────────────────────────────
// A knob takes a position (0..1 along its travel); a pad is held while `on`; a button is clicked
// as `on` rises; a surface is touched, moved and let go.
export function setKnob(node, norm) {
  const k = knobOf(node);
  if (!k) return;
  k.setValue(k.fromNorm(Math.min(1, Math.max(0, norm))));
  k.onTouch?.(k);
}
export function nudgeKnob(node, delta) {
  const k = knobOf(node);
  if (!k || !delta) return;
  setKnob(node, k.norm + delta);
}
export function holdPad(node, on) {
  const p = padOf(node);
  if (!p) return;
  if (on) p.press(); else p.release();
}
export function pressButton(node) { node.click(); }
export function surfaceOf(node) { return surfaces.get(node) || null; }
