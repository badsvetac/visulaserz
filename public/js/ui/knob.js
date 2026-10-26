import { clamp, el } from '../util.js';

// 270° arc from 7:30 to 4:30 around (32,32), radius 25.
const ARC = 'M 14.32 49.68 A 25 25 0 1 1 49.68 49.68';

// Every knob on the page, by its element: a MIDI controller that has learnt one finds it here.
const byElement = new WeakMap();
export const knobOf = (node) => byElement.get(node);

// A rotary control. Drag up/down, scroll, or use the arrow keys; double-click resets.
export class Knob {
  constructor({ id, label, min, max, def, value = def, curve = 1, origin, fmt = (v) => v.toFixed(2), onChange, onTouch }) {
    Object.assign(this, { id, label, min, max, def, curve, origin, fmt, onChange, onTouch });
    this.value = value;

    this.valueEl = el('span', { class: 'knob-value' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    const ns = (tag, attrs) => {
      const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };
    this.arc = ns('path', { class: 'knob-arc', d: ARC, pathLength: '1' });
    this.cap = ns('g', { class: 'knob-cap' });
    this.cap.append(ns('circle', { cx: 32, cy: 32, r: 19 }), ns('line', { x1: 32, y1: 16, x2: 32, y2: 24 }));
    svg.append(ns('path', { class: 'knob-track', d: ARC, pathLength: '1' }), this.arc, this.cap);

    this.el = el('div', {
      class: 'knob', role: 'slider', tabindex: '0', 'aria-label': label,
      'aria-valuemin': '0', 'aria-valuemax': '100', title: 'Drag, scroll or use arrow keys. Double-click to reset.',
    }, svg, el('span', { class: 'knob-label' }, label), this.valueEl);
    byElement.set(this.el, this);

    this.#bind();
    this.render();
  }

  get norm() { return Math.pow((this.value - this.min) / (this.max - this.min), 1 / this.curve); }
  fromNorm(n) { return this.min + (this.max - this.min) * Math.pow(clamp(n, 0, 1), this.curve); }

  setValue(v, { silent = false } = {}) {
    const next = clamp(v, this.min, this.max);
    if (next === this.value && !silent) return;
    this.value = next;
    this.render();
    if (!silent) this.onChange?.(this.value, this);
  }

  render() {
    const n = this.norm;
    const o = this.origin === undefined ? 0 : Math.pow((this.origin - this.min) / (this.max - this.min), 1 / this.curve);
    const start = Math.min(n, o);
    const len = Math.abs(n - o);
    this.arc.setAttribute('stroke-dasharray', `${len} 1`);
    this.arc.setAttribute('stroke-dashoffset', `${-start}`);
    this.cap.setAttribute('transform', `rotate(${-135 + n * 270} 32 32)`);
    const text = this.fmt(this.value);
    this.valueEl.textContent = text;
    this.el.setAttribute('aria-valuenow', String(Math.round(n * 100)));
    this.el.setAttribute('aria-valuetext', text);
  }

  #nudge(deltaNorm) {
    this.setValue(this.fromNorm(this.norm + deltaNorm));
    this.onTouch?.(this);
  }

  #bind() {
    const node = this.el;
    let dragging = false;
    let lastY = 0;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      lastY = e.clientY;
      node.setPointerCapture(e.pointerId);
      node.classList.add('is-active');
      node.focus({ preventScroll: true });
      this.onTouch?.(this);
      e.preventDefault();
    });
    node.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = lastY - e.clientY;
      lastY = e.clientY;
      this.#nudge(dy / (e.shiftKey ? 1200 : 220));
    });
    const stop = () => { dragging = false; node.classList.remove('is-active'); };
    node.addEventListener('pointerup', stop);
    node.addEventListener('pointercancel', stop);
    node.addEventListener('lostpointercapture', stop);                 // a phone can take the finger away (a call, a gesture)
    node.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.#nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.004 : 0.025));
    }, { passive: false });
    node.addEventListener('dblclick', () => { this.setValue(this.def); this.onTouch?.(this); });
    node.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.002 : 0.02;
      const map = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 0.1, PageDown: -0.1 };
      if (e.key in map) this.#nudge(map[e.key]);
      else if (e.key === 'Home') this.setValue(this.min);
      else if (e.key === 'End') this.setValue(this.max);
      else if (e.key === 'Backspace' || e.key === 'Delete') this.setValue(this.def);
      else return;
      e.preventDefault();
    });
  }
}
