import { el } from '../util.js';
import { ROOM_LAYERS } from '../audio/ambience.js';
import { Fader } from './fader.js';

// The Room mixer: six little faders that build the space the track is playing in.
// A scene still brings its own sound (the Rain scene asks for rain), but whatever is set
// here is the user's and outlives scene changes — the Ambience knob beside it sets how
// loud the whole room is, these decide what is in it.
export function buildRoom({ engine, lcdShow, saveSettings }) {
  const faders = {};

  for (const layer of ROOM_LAYERS) {
    faders[layer.id] = new Fader({
      id: layer.id,
      label: layer.name,
      value: engine.roomMix[layer.id] || 0,
      onChange: (v) => {
        // The audio context is created on the first gesture, and moving a fader is one.
        engine.ensureContext();
        engine.setAmbienceLayer(layer.id, v);
        saveSettings?.();
      },
      onTouch: (f) => lcdShow(layer.name, f.value > 0.001 ? `${Math.round(f.value * 100)}%` : 'OFF'),
    });
  }

  return {
    node: el('div', { class: 'room', role: 'group', 'aria-label': 'Room' }, ...Object.values(faders).map((f) => f.el)),
    refresh() {
      for (const [id, f] of Object.entries(faders)) f.setValue(engine.roomMix[id] || 0, { silent: true });
    },
  };
}
