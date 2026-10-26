import { el } from '../util.js';

// A momentary pad: it is on while you hold it and off the moment you let go, whether you
// used the mouse, a finger, or the keyboard. Getting the release right is most of the work —
// a pad that sticks down because the pointer left the button is a stuck kill on a live show,
// so blur, pointercancel and lost capture all count as "let go".
// Every pad on the page, by its element: a MIDI controller that has learnt one finds it here.
const byElement = new WeakMap();
export const padOf = (node) => byElement.get(node);

export function makePad({ label, key, keyLabel = key, hint, start, stop = () => {}, cls = '', toggle = false }) {
  const node = el('button', { class: `pad ${cls}`, type: 'button', title: hint, 'aria-pressed': 'false' },
    el('span', { class: 'led' }), el('span', { class: 'pad-label' }, label), el('span', { class: 'pad-key' }, keyLabel));
  let down = false;

  const press = () => {
    if (toggle) {
      down = !down;
      node.classList.toggle('is-down', down);
      node.setAttribute('aria-pressed', String(down));
      (down ? start : stop)();
      return;
    }
    if (down) return;
    down = true;
    node.classList.add('is-down');
    node.setAttribute('aria-pressed', 'true');
    start();
  };
  const release = () => {
    if (toggle || !down) return;
    down = false;
    node.classList.remove('is-down');
    node.setAttribute('aria-pressed', 'false');
    stop();
  };

  node.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); node.setPointerCapture(e.pointerId); press(); });
  node.addEventListener('pointerup', release);
  node.addEventListener('pointercancel', release);
  node.addEventListener('lostpointercapture', release);
  node.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
  node.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
  node.addEventListener('blur', release);

  const pad = {
    node,
    key,
    press,
    release,
    get isDown() { return down; },
    reset() {
      if (!down) return;
      down = false;
      node.classList.remove('is-down');
      node.setAttribute('aria-pressed', 'false');
      stop();
    },
  };
  byElement.set(node, pad);
  return pad;
}
