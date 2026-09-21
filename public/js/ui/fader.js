import { clamp, el } from '../util.js';

// A vertical fader drawn by hand.
//
// <input type="range"> is not an option here: the vertical form used to need
// -webkit-appearance: slider-vertical, which current Chrome ignores in favour of
// writing-mode, and once the element renders natively the ::-webkit-slider-thumb rules
// stop applying — you get the browser's round thumb sitting in a styled slot. Drawing it
// is both more predictable and the only way it matches the knobs next to it.
export class Fader {
  constructor({ id, label, value = 0, def = 0, fmt = (v) => `${Math.round(v * 100)}%`, onChange, onTouch }) {
    Object.assign(this, { id, label, def, fmt, onChange, onTouch });
    this.value = clamp(value, 0, 1);

    this.fill = el('span', { class: 'fader-fill' });
    this.cap = el('span', { class: 'fader-cap' });
    this.slot = el('span', { class: 'fader-slot' }, this.fill, this.cap);
    this.el = el('div', {
      class: 'fader', role: 'slider', tabindex: '0',
      'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100',
      title: `${label}: drag, scroll or use the arrow keys. Double-click to clear.`,
    }, this.slot, el('span', { class: 'fader-name' }, label));

    this.#bind();
    this.render();
  }

  setValue(v, { silent = false } = {}) {
    const next = clamp(v, 0, 1);
    if (next === this.value && !silent) return;
    this.value = next;
    this.render();
    if (!silent) this.onChange?.(this.value, this);
  }

  render() {
    const pct = this.value * 100;
    this.fill.style.height = `${pct}%`;
    this.cap.style.bottom = `${pct}%`;
    this.el.classList.toggle('is-on', this.value > 0.001);
    this.el.setAttribute('aria-valuenow', String(Math.round(pct)));
    this.el.setAttribute('aria-valuetext', this.fmt(this.value));
  }

  #nudge(delta) {
    this.setValue(this.value + delta);
    this.onTouch?.(this);
  }

  #bind() {
    const node = this.el;
    let dragging = false;

    // Dragging sets the level from where the pointer is in the slot, so tapping near the
    // top jumps there instead of making you drag all the way up from zero.
    const fromPointer = (e) => {
      const r = this.slot.getBoundingClientRect();
      this.setValue(1 - (e.clientY - r.top) / r.height);
      this.onTouch?.(this);
    };

    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      node.setPointerCapture(e.pointerId);
      node.classList.add('is-active');
      node.focus({ preventScroll: true });
      fromPointer(e);
      e.preventDefault();
    });
    node.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
    const stop = () => { dragging = false; node.classList.remove('is-active'); };
    node.addEventListener('pointerup', stop);
    node.addEventListener('pointercancel', stop);
    node.addEventListener('lostpointercapture', stop);
    node.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.#nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.01 : 0.06));
    }, { passive: false });
    node.addEventListener('dblclick', () => { this.setValue(this.def); this.onTouch?.(this); });
    node.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.01 : 0.05;
      const map = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 0.25, PageDown: -0.25 };
      if (e.key in map) this.#nudge(map[e.key]);
      else if (e.key === 'Home') this.setValue(0);
      else if (e.key === 'End') this.setValue(1);
      else if (e.key === 'Backspace' || e.key === 'Delete') this.setValue(this.def);
      else return;
      e.preventDefault();
    });
  }
}
