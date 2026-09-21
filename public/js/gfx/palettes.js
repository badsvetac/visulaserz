// Cosine palettes (Inigo Quilez): colour(t) = a + b * cos(2π(c·t + d)).
// Four vec3s describe an endless smooth gradient, which is ideal for shaders:
// any number in, a harmonious colour out.
export const PALETTES = [
  { id: 'laser',   name: 'Laser',   a: [0.5, 0.5, 0.5],    b: [0.5, 0.5, 0.5],    c: [1, 1, 1],   d: [0.0, 0.33, 0.67], accent: '#ff4fd8' },
  { id: 'miami',   name: 'Miami',   a: [0.5, 0.5, 0.5],    b: [0.5, 0.5, 0.5],    c: [2, 1, 0],   d: [0.5, 0.2, 0.25],  accent: '#ff2e93' },
  { id: 'dusk',    name: 'Dusk',    a: [0.6, 0.3, 0.5],    b: [0.4, 0.3, 0.4],    c: [1, 1, 1],   d: [0.0, 0.15, 0.45], accent: '#ff8a3d' },
  { id: 'inferno', name: 'Inferno', a: [0.55, 0.25, 0.08], b: [0.45, 0.25, 0.08], c: [1, 1, 1],   d: [0.0, 0.08, 0.15], accent: '#ff6a1f' },
  { id: 'aurora',  name: 'Aurora',  a: [0.3, 0.55, 0.5],   b: [0.3, 0.45, 0.45],  c: [1, 1, 1],   d: [0.6, 0.15, 0.4],  accent: '#3dffa8' },
  { id: 'ice',     name: 'Ice',     a: [0.35, 0.6, 0.8],   b: [0.35, 0.4, 0.2],   c: [1, 1, 1],   d: [0.0, 0.05, 0.1],  accent: '#8fe9ff' },
  { id: 'acid',    name: 'Acid',    a: [0.6, 0.6, 0.3],    b: [0.4, 0.4, 0.3],    c: [1, 1, 1],   d: [0.35, 0.0, 0.6],  accent: '#c8ff3d' },
  { id: 'gold',    name: 'Gold',    a: [0.55, 0.42, 0.2],  b: [0.45, 0.38, 0.2],  c: [1, 1, 1],   d: [0.0, 0.04, 0.1],  accent: '#ffc95c' },
  { id: 'siren',   name: 'Siren',   a: [0.5, 0.1, 0.35],   b: [0.5, 0.1, 0.35],   c: [1, 1, 1],   d: [0.0, 0.3, 0.55],  accent: '#ff3b5c' },
  // The nine above sweep the whole hue circle, which is what a light rig does. These six are
  // deliberately the opposite: their three d phases sit within about a tenth of a turn of each
  // other, so the channels rise and fall together and the palette becomes the brightness ramp
  // of ONE colour instead of a rainbow. Spreading the phases is what makes a "violet" palette
  // wander through green on its way round.
  { id: 'violet',  name: 'Violet',  a: [0.46, 0.28, 0.62], b: [0.38, 0.22, 0.36], c: [1, 1, 1], d: [0.00, 0.04, 0.09], accent: '#b07dff' },
  { id: 'lagoon',  name: 'Lagoon',  a: [0.18, 0.48, 0.50], b: [0.18, 0.34, 0.34], c: [1, 1, 1], d: [0.10, 0.02, 0.00], accent: '#3fe0cb' },
  { id: 'bone',    name: 'Bone',    a: [0.62, 0.58, 0.52], b: [0.30, 0.30, 0.30], c: [1, 1, 1], d: [0.05, 0.08, 0.14], accent: '#e8dcc6' },
  { id: 'candy',   name: 'Candy',   a: [0.78, 0.62, 0.70], b: [0.16, 0.20, 0.16], c: [1, 1, 1], d: [0.00, 0.08, 0.16], accent: '#ffa8d4' },
  { id: 'copper',  name: 'Copper',  a: [0.46, 0.30, 0.20], b: [0.40, 0.28, 0.16], c: [1, 1, 1], d: [0.00, 0.06, 0.14], accent: '#dc8a4e' },
  { id: 'ultra',   name: 'Ultra',   a: [0.22, 0.10, 0.38], b: [0.30, 0.16, 0.42], c: [1, 1, 1], d: [0.00, 0.06, 0.10], accent: '#8a4cff' },
];

// A palette frozen partway through a glide, so an interrupted change has somewhere to start
// from. The shader crossfades the two palettes' output; this lerps their parameters, which is
// only an approximation of that — but it is exact at both ends, and a glide is only ever
// interrupted in the middle, where both palettes already look alike.
export function blendPalettes(from, to, k) {
  const lerp3 = (x, y) => [0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * k);
  return {
    id: k < 0.5 ? from.id : to.id,
    name: k < 0.5 ? from.name : to.name,
    a: lerp3(from.a, to.a), b: lerp3(from.b, to.b), c: lerp3(from.c, to.c), d: lerp3(from.d, to.d),
    accent: blendHex(from.accent, to.accent, k),
  };
}

const hexRgb = (hex) => hex.slice(1).match(/../g).map((h) => parseInt(h, 16));
export function blendHex(from, to, k) {
  const a = hexRgb(from);
  const b = hexRgb(to);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

export function paletteColor(p, t) {
  const ch = (i) => Math.round(255 * Math.min(1, Math.max(0, p.a[i] + p.b[i] * Math.cos(6.28318 * (p.c[i] * t + p.d[i])))));
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

// CSS gradient preview of a palette, for the swatch buttons.
export function paletteGradient(p, stops = 9) {
  const parts = [];
  for (let i = 0; i < stops; i++) parts.push(`${paletteColor(p, i / (stops - 1))} ${Math.round((i / (stops - 1)) * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
