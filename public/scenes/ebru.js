// EBRU — paper marbling, the Turkish way: colour dropped on a bath and pushed around.
//
// The mathematics is the real one. A drop of radius r landing at c pushes every bit of paint
// already on the bath outward while keeping its area:  p' = c + (p − c)·√(1 + r²/|p − c|²).
// To colour a pixel we run that backwards through the last seven drops, newest first: inside a
// drop's circle the pixel is that drop's paint, otherwise we ask where its paint was before the
// drop landed. Every beat is a drop (its size is the bass), so the sheet fills with stones
// (battal) over a raked gel-git ground that sways with the mids.
const frag = `
vec2 undrop(vec2 p, vec2 c, float r, out float inside) {
  vec2 d = p - c;
  float d2 = dot(d, d);
  inside = step(d2, r * r);
  return c + d * sqrt(max(1.0 - r * r / max(d2, 1e-6), 0.0));
}

void main() {
  vec2 p = rot(uTime * 0.01) * centered();
  float aspect = uRes.x / uRes.y;
  vec2 q = p;
  float tone = -1.0, seam = 1e3, ringed = 0.0;

  for (int k = 0; k < 7; k++) {
    float id = uBeatCount - float(k);
    vec2 c = (vec2(hash11(id * 1.7 + 3.0), hash11(id * 2.9 + 8.0)) - 0.5) * vec2(aspect, 1.0) * 1.6;
    float full = 0.15 + 0.20 * hash11(id * 4.3 + 1.0);
    float r = k == 0 ? full * (0.75 + 0.5 * uBass) * (1.0 - exp(-uBeatAge * 5.0)) : full;   // the newest drop is still spreading
    float dist = length(q - c);
    float ins;
    vec2 before = undrop(q, c, r, ins);
    seam = min(seam, abs(dist - r));
    if (ins > 0.5) {
      tone = hash11(id * 6.1 + 2.0);
      ringed = floor(dist / max(r, 1e-4) * 3.0);                       // drops laid into drops: concentric stones
      break;
    }
    q = before;
  }

  vec3 col;
  if (tone >= 0.0) {
    col = pal(tone * 0.9 + ringed * 0.13);
    col = mix(col, vec3(0.95, 0.91, 0.82), mod(ringed, 2.0) * 0.45);
  } else {
    // the ground: bands of colour raked back and forth
    vec2 b = q;
    b.y += (0.10 + 0.06 * uMid) * sin(b.x * 9.0);
    b.x += 0.08 * sin(b.y * 7.0 + uTime * 0.05);
    b.y += 0.05 * sin(b.x * 21.0);
    b += 0.05 * vec2(fbm(b * 2.0 + uTime * 0.02), fbm(b * 2.0 + 7.0 - uTime * 0.02));
    float band = b.y * 5.0 + fbm(b * 1.5) * 1.6;
    col = pal(hash11(floor(band) * 3.7 + 1.0) * 0.9 + 0.05);
    col = mix(col, vec3(0.95, 0.91, 0.82), 0.25 + 0.2 * hash11(floor(band) * 5.1));
    seam = min(seam, (0.5 - abs(fract(band) - 0.5)) * 0.2);
  }
  col *= 0.80 + 0.20 * ss(0.0, 0.006, seam);                             // where two paints meet, a hairline
  col *= 0.55 + 0.35 * uLevel + 0.10 * uBeat * uPunch;
  col *= 0.90 + 0.10 * noise(p * vec2(240.0, 60.0));                     // the tooth of the paper
  col *= 1.0 - 0.35 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'ebru',
  name: 'Ebru',
  group: 'Lab',
  blurb: 'Turkish paper marbling; every beat drops a paint stone on the combed bath',
  tags: ['turkish', 'artwork', 'organic', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
