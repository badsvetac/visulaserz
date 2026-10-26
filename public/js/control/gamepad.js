// Gamepads, read once a frame (the Gamepad API has no events for buttons or sticks). A button
// comes out as { src, kind: 'button', on, value } when it is pressed or let go, and again with
// `analog` while a trigger is squeezed; a stick axis as { src, kind: 'axis', value (−1..1) } when it
// moves. The first frame a pad is seen only learns where everything rests, so a trigger that
// rests half-pressed on some pads does not fire on its own.

export function createGamepads({ onInput, onChange }) {
  const seen = new Map();          // pad index → { buttons, axes } as they were last frame
  let names = [];
  addEventListener('gamepadconnected', () => onChange?.());
  addEventListener('gamepaddisconnected', (e) => { seen.delete(e.gamepad.index); onChange?.(); });

  return {
    get devices() { return names; },
    poll(dt) {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      const now = pads.map((p) => p.id.replace(/\s*\(.*$/, '').trim() || 'Gamepad');
      if (now.join('|') !== names.join('|')) { names = now; onChange?.(); }
      for (const p of pads) {
        const last = seen.get(p.index);
        const buttons = p.buttons.map((b) => b.value), axes = [...p.axes];
        seen.set(p.index, { buttons, axes });
        if (!last) continue;
        buttons.forEach((v, i) => {
          const was = last.buttons[i] ?? 0;
          const on = v > 0.5, wasOn = was > 0.5;
          if (on !== wasOn) onInput({ src: `pad:button:${i}`, kind: 'button', num: i, on, value: v, dt });
          else if (Math.abs(v - was) > 0.01 && v > 0 && v < 1) onInput({ src: `pad:button:${i}`, kind: 'button', num: i, analog: true, on, value: v, dt });
        });
        axes.forEach((v, i) => {
          // a stick held off-centre keeps reporting, so a knob it nudges keeps moving
          if (Math.abs(v) > 0.12 || Math.abs(v - (last.axes[i] ?? 0)) > 0.01) onInput({ src: `pad:axis:${i}`, kind: 'axis', num: i, value: v, dt });
        });
      }
    },
    describe(src) {
      const [, kind, num] = src.split(':');
      if (kind === 'axis') return ['Left stick ↔', 'Left stick ↕', 'Right stick ↔', 'Right stick ↕'][num] || `Axis ${num}`;
      return BUTTONS[num] || `Button ${num}`;
    },
  };
}

// the standard layout every browser maps pads to
const BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'Left stick', 'Right stick', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'];
