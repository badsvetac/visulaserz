import { el } from '../util.js';
import { ROOM_LAYERS } from '../audio/ambience.js';

// The Room mixer: six little faders that build the space the track is playing in.
// A scene still brings its own sound (the Rain scene asks for rain), but whatever is set
// here is the user's and outlives scene changes — the Ambience knob above sets how loud
// the whole room is, these decide what is in it.
export function buildRoom({ engine, lcdShow, saveSettings }) {
  const faders = {};

  const strip = (layer) => {
    const input = el('input', {
      type: 'range', min: '0', max: '1', step: '0.01', value: String(engine.roomMix[layer.id] || 0),
      class: 'room-fader', orient: 'vertical', 'aria-label': `${layer.name} level`,
    });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      // The context is created on the first gesture; a fader move is one, so this is safe.
      engine.ensureContext();
      engine.setAmbienceLayer(layer.id, v);
      wrap.classList.toggle('is-on', v > 0.001);
      lcdShow(layer.name, v > 0.001 ? `${Math.round(v * 100)}%` : 'OFF');
      saveSettings?.();
    });
    const wrap = el('label', { class: 'room-strip', title: `${layer.name} in the room` },
      input, el('span', { class: 'room-name' }, layer.name));
    wrap.classList.toggle('is-on', Number(input.value) > 0.001);
    faders[layer.id] = { input, wrap };
    return wrap;
  };

  return {
    node: el('div', { class: 'room', role: 'group', 'aria-label': 'Room' }, ...ROOM_LAYERS.map(strip)),
    refresh() {
      for (const [id, f] of Object.entries(faders)) {
        const v = engine.roomMix[id] || 0;
        f.input.value = String(v);
        f.wrap.classList.toggle('is-on', v > 0.001);
      }
    },
  };
}
