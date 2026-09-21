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
];

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
