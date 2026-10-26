import { FX, fxDef } from './effects.js';
import { INSERTS, FX_SLOTS, newFx } from './model.js';
import { DRAG_TYPE } from './browser.js';

// The MIXER, laid out as FL Studio's: a narrow strip for the master and every insert (its level
// meter, its fader, its pan, its mute light), and at the right the effect slots of the insert
// that is picked. Click an empty slot for the list of effects, click a full one for its window;
// its light switches it off and on, and the right button moves it or takes it out. Effects can
// also be dragged in from the browser. The master's SONG DUCK pumps the song itself with the kick.

export function buildMixer(S, kit) {
  const { el } = S;
  const strips = el('div', { class: 'st2-strips' });
  const panel = el('div', { class: 'st2-fxpanel' });
  const node = el('div', { class: 'st2-mixer' }, strips, panel);
  const meters = [];
  let built = '';

  function fader(get, set) {
    const thumb = el('b');
    const f = el('div', { class: 'st2-fader', 'data-hint': 'Volume: drag, scroll, double-click to reset' }, thumb);
    const show = () => { thumb.style.bottom = `calc(${(get() * 100).toFixed(1)}% - 7px)`; };
    let d = null;
    f.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); S.host.capture(f, e); d = { y: e.clientY, v: get() }; });
    f.addEventListener('pointermove', (e) => { if (!d) return; set(Math.max(0, Math.min(1, d.v + (d.y - e.clientY) / (f.clientHeight * (e.shiftKey ? 4 : 1))))); show(); S.hint(`Volume: ${Math.round(get() * 100)}%`, true); });
    const end = () => { if (d) { d = null; S.changed('mix'); } };
    f.addEventListener('pointerup', end);
    f.addEventListener('pointercancel', end);
    f.addEventListener('lostpointercapture', end);
    f.addEventListener('dblclick', () => { set(0.8); show(); S.changed('mix'); });
    f.addEventListener('wheel', (e) => { e.preventDefault(); set(Math.max(0, Math.min(1, get() - Math.sign(e.deltaY) * 0.03))); show(); S.changed('mix', true); }, { passive: false });
    show();
    return f;
  }
  function strip(i) {
    const ins = S.project.mixer.inserts[i];
    const fed = S.project.channels.filter((c) => c.insert === i).map((c) => c.name);
    const vu = el('i');
    meters[i] = { vu, peak: 0 };
    const name = el('div', { class: 'st2-strip-name', 'data-hint': `${ins.name}${fed.length ? `: fed by ${fed.join(', ')}` : ''}. Double-click to rename` }, ins.name);
    name.addEventListener('dblclick', (e) => { e.stopPropagation(); kit.rename(name, ins.name, (v) => { ins.name = v; built = ''; S.changed('mixer'); }); });
    const pan = kit.knob({ label: 'Pan', value: ins.pan, min: -1, max: 1, def: 0, origin: 0, fmt: (v) => (Math.abs(v) < 0.02 ? 'Centred' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'left' : 'right'}`), onChange: (v) => { ins.pan = v; S.engine?.chain(i); S.changed('mix', true); } });
    const mute = el('button', { class: `st2-mute ${ins.mute ? 'is-off' : ''}`, type: 'button', 'data-hint': `${ins.name}: click to mute` });
    mute.addEventListener('click', (e) => { e.stopPropagation(); ins.mute = !ins.mute; mute.classList.toggle('is-off', ins.mute); S.engine?.chain(i); S.changed('mix'); });
    const s = el('div', { class: `st2-strip ${i === 0 ? 'is-master' : ''} ${i === S.mixerInsert ? 'is-on' : ''}`, dataset: { ins: String(i) } },
      name, el('span', { class: 'st2-strip-num' }, i === 0 ? 'M' : String(i)), pan.el,
      el('div', { class: 'st2-level' }, el('div', { class: 'st2-vu' }, vu), fader(() => ins.vol, (v) => { ins.vol = v; S.engine?.chain(i); })),
      mute);
    s.addEventListener('click', () => { S.mixerInsert = i; built = ''; render(); });
    // an effect from the browser dropped on a strip goes into its first free slot
    s.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); });
    s.addEventListener('drop', (e) => { const spec = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '{}'); if (spec.fx) { e.preventDefault(); S.mixerInsert = i; S.addFx(i, spec.fx); } });
    return s;
  }

  function slots() {
    const i = S.mixerInsert, ins = S.project.mixer.inserts[i];
    const list = [];
    for (let k = 0; k < FX_SLOTS; k++) {
      const f = ins.fx[k];
      const led = el('span', { class: `led ${f?.on ? 'is-on' : ''}` });
      const slot = el('div', { class: `st2-slot ${f ? '' : 'is-empty'}`, 'data-hint': f ? `${fxDef(f.type)?.name}: click for its window, the light switches it, right-click for more` : 'An empty slot: click to put an effect in it' },
        led, el('span', { class: 'nm' }, f ? fxDef(f.type)?.name || f.type : `Slot ${k + 1}`));
      led.addEventListener('click', (e) => { e.stopPropagation(); if (!f) return; f.on = !f.on; S.engine?.chain(i); S.changed('fx'); render(); });
      slot.addEventListener('click', () => {
        if (f) { S.openFx(i, f.id); return; }
        kit.menu(slot, [{ head: 'Effects' }, ...FX.map((d) => ({ label: d.name, fn: () => { ins.fx[k] = newFx(S.project, d.id); S.engine?.chain(i); S.changed('fx'); render(); S.openFx(i, ins.fx[k].id); } }))]);
      });
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!f) return;
        kit.menu(null, [
          { head: fxDef(f.type)?.name || 'Effect' },
          { label: 'Open', fn: () => S.openFx(i, f.id) },
          { label: f.on ? 'Switch off' : 'Switch on', fn: () => { f.on = !f.on; S.engine?.chain(i); S.changed('fx'); render(); } },
          k > 0 ? { label: 'Move up', fn: () => { [ins.fx[k - 1], ins.fx[k]] = [ins.fx[k], ins.fx[k - 1]]; S.engine?.chain(i); S.changed('fx'); render(); } } : null,
          k < FX_SLOTS - 1 ? { label: 'Move down', fn: () => { [ins.fx[k + 1], ins.fx[k]] = [ins.fx[k], ins.fx[k + 1]]; S.engine?.chain(i); S.changed('fx'); render(); } } : null,
          { sep: true },
          { label: 'Take it out', danger: true, fn: () => { S.windows.drop(`fx:${f.id}`); ins.fx[k] = null; S.engine?.chain(i); S.changed('fx'); render(); } },
        ], { x: e.clientX, y: e.clientY });
      });
      slot.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); });
      slot.addEventListener('drop', (e) => {
        const spec = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '{}');
        if (!spec.fx) return;
        e.preventDefault();
        if (f) S.windows.drop(`fx:${f.id}`);
        ins.fx[k] = newFx(S.project, spec.fx);
        S.engine?.chain(i);
        S.changed('fx');
        render();
      });
      list.push(slot);
    }
    const parts = [el('div', { class: 'st2-fxtitle' }, i === 0 ? 'Master' : `Insert ${i}: ${ins.name}`), ...list];
    if (i === 0) {
      const duck = kit.knob({ label: 'Song duck', value: S.project.mixer.songDuck, def: 0, show: true, onChange: (v) => { S.project.mixer.songDuck = v; S.changed('mix', true); }, hint: 'Song duck: the song itself dips under the Studio’s kick, as deep as this' });
      parts.push(el('div', { class: 'st2-songduck' }, duck.el, el('p', { class: 'st2-note' }, 'Pumps the song that is playing with your kick.')));
    } else {
      const fed = S.project.channels.filter((c) => c.insert === i);
      parts.push(el('p', { class: 'st2-note' }, fed.length ? `Fed by ${fed.map((c) => c.name).join(', ')}.` : 'Nothing goes here yet: route a channel to it with its insert box in the channel rack.'));
    }
    panel.replaceChildren(...parts);
  }

  function render() {
    const shape = `${S.mixerInsert}|${S.project.mixer.inserts.map((x) => `${x.name}:${x.mute}`).join(',')}|${S.project.channels.map((c) => `${c.insert}:${c.name}`).join(',')}`;
    if (shape !== built) {
      built = shape;
      strips.replaceChildren(...Array.from({ length: INSERTS + 1 }, (_, i) => strip(i)));
    }
    slots();
  }
  return {
    node,
    render,
    tick(dt) {
      if (!S.engine) return;
      for (let i = 0; i <= INSERTS; i++) {
        const m = meters[i];
        if (!m) continue;
        const v = S.engine.level(i);
        m.peak = Math.max(v, m.peak - dt * 1.3);
        const h = `${Math.max(0, Math.min(100, ((20 * Math.log10(m.peak + 1e-6) + 48) / 48) * 100)).toFixed(1)}%`;
        if (m.h !== h) { m.h = h; m.vu.style.height = h; }       // a still meter costs no style work
      }
    },
    invalidate() { built = ''; },
  };
}
