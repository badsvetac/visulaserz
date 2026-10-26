import { part, ROOT, patternOf } from './model.js';

// DRUM PADS: the first sixteen channels on pads, pad 1 at the bottom left as on FL's FPC and an
// MPC. Finger-drum on them with the mouse or the keys; with REC on while a pattern plays, every
// hit is written onto the step it lands nearest to, so a beat can be played in.

export const PAD_KEYS = ['z', 'x', 'c', 'v', 'a', 's', 'd', 'f', 'q', 'w', 'e', 'r', '1', '2', '3', '4'];

export function buildPads(S) {
  const { el } = S;
  const grid = el('div', { class: 'st2-pads' });
  const node = el('div', { class: 'st2-roll' }, grid,
    el('p', { class: 'st2-note', style: 'padding:0 8px 8px' }, 'Keys Z X C V · A S D F · Q W E R · 1 2 3 4 while this window is the one in front. REC on while the pattern plays records the hits.'));
  let pads = [];
  let built = '';
  function hit(i, vel = 0.9) {
    const ch = S.project.channels[i];
    if (!ch) return;
    S.wake()?.noteOn(ch, ROOT, vel);                     // the first hit wakes the sound and is heard
    setTimeout(() => S.engine?.noteOff(ch, ROOT), 200);
    flash(ch.id);
    if (!S.rec || !S.engine?.playing) return;
    const at = S.engine.position();
    if (!at || at.mode === 'song') return;
    const pat = patternOf(S.project, at.pattern);
    if (!pat) return;
    const step = Math.round(at.step) % pat.len, q = part(pat, ch.id);
    if (q.notes.length) q.notes.push({ s: step, l: 1, k: ROOT, v: Math.round(vel * 127) });
    else q.steps[step] = Math.round(vel * 127);
    S.changed('steps');
  }
  function flash(id) {
    const p = pads.find((x) => x.dataset.ch === id);
    if (!p) return;
    p.classList.remove('is-hit');
    void p.offsetWidth;
    p.classList.add('is-hit');
  }
  return {
    node,
    render() {
      const shape = S.project.channels.slice(0, 16).map((c) => `${c.id}:${c.name}:${c.color}`).join(',');
      if (shape === built) return;
      built = shape;
      const order = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
      pads = order.map((i) => {
        const ch = S.project.channels[i];
        const b = el('button', { class: 'st2-pad', type: 'button', style: ch ? `--c:${ch.color}` : '', dataset: { ch: ch?.id || '' }, disabled: !ch, 'data-hint': ch ? `${ch.name}: key ${PAD_KEYS[i].toUpperCase()}. Higher on the pad hits harder` : 'Add more channels to fill this pad' },
          el('span', {}, ch ? ch.name : '·'), el('span', {}, PAD_KEYS[i].toUpperCase()));
        b.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || !ch) return;
          e.preventDefault();
          const r = b.getBoundingClientRect();
          hit(i, Math.max(0.35, Math.min(1, 1.15 - ((e.clientY - r.top) / r.height) * 0.7)));
        });
        return b;
      });
      grid.replaceChildren(...pads);
    },
    key(e) {
      if (e.ctrlKey || e.metaKey) return false;
      const i = PAD_KEYS.indexOf(e.key.toLowerCase());
      if (i < 0) return false;
      if (!e.repeat) hit(i, e.shiftKey ? 0.55 : 0.9);
      return true;
    },
    flash,
  };
}
