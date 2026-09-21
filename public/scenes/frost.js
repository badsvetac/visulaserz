// FROST — ice taking a cold window, with the city still burning on the other side of it.
//
// Window frost grows as dendrites: a speck of dust catches on the glass and throws out six arms
// 60 degrees apart (the angle water ice is stuck with), and every arm sprouts side branches that
// can only be as long as the run left to the tip — that taper is the whole difference between a
// fern and a star. Here each of the six arms is one band of the spectrum: arm 0 points right and
// takes the bass, the rest go round into the treble, so the crystal leans towards whatever the
// music is doing. The length is driven by slow() rather than spec(), because frost accretes — it
// shoots out and pulls back reluctantly. Every beat drops a fresh seed on the glass and it grows
// in under half a second; the five before it are rebuilt from uBeatCount - k — same place, same
// branches, arms still answering their band — and fade back as newer ones crowd them out. Nothing
// here makes its own light: the ice is only as bright as the window behind it, which is why the
// frost glows over the lit windows and goes to grey over the roofs.
const frag = `
float gBand[6];                 // one spectrum band per arm, read once per pixel

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0));
}

// Where the seed dropped on the beat b landed: xy on the glass, z how far it can reach.
vec3 seedAt(float b) {
  vec2 c = vec2(hash11(b * 1.73 + 0.31), hash11(b * 2.91 + 5.17)) * 2.0 - 1.0;
  c = sign(c) * (0.32 + 0.68 * abs(c));                       // glass is coldest near the frame, so seeds crowd the edges
  // Reach: frost that only spans a twentieth of the pane reads as a scratch, not as weather.
  // At 0.28…0.62 the arms cross a good third of the height and neighbouring crystals interlock,
  // which is what window frost actually does.
  return vec3(c.x * (uRes.x / uRes.y) * 0.78, c.y * 0.80, 0.28 + 0.34 * hash11(b * 4.13 + 2.7));
}

// One arm in its own frame: q.x runs along the spine, q.y is already mirrored, so a branch drawn
// once shows on both sides. Only the few branch roots behind this pixel can win the min.
float armField(vec2 q, float L, float sd) {
  float d = sdSeg(q, vec2(0.0), vec2(L, 0.0)) - 0.0060;
  float sp = 0.038;                                           // branch spacing grows with the crystal, so the ferns stay countable
  float j0 = floor(q.x / sp);
  for (int k = 0; k < 4; k++) {
    float bx = (j0 - float(k)) * sp;                          // roots ahead of the pixel can never win, so start at j0
    float rem = L - bx;
    if (bx > 0.010 && rem > 0.006) {
      float h = hash11(bx * 137.0 + sd * 3.3);
      float bl = rem * (0.38 + 0.30 * h);                     // a branch never outruns the tip
      d = min(d, sdSeg(q, vec2(bx, 0.0), vec2(bx + bl * 0.5, bl * 0.866)) - 0.0030 * (0.6 + h));
    }
  }
  return d;
}

// A whole six-armed crystal. Only the two arms nearest the pixel are evaluated: the others cannot
// win the min, and taking two rather than one stops the 60-degree branches being sliced off at the
// seam between sectors.
float crystal(vec2 p, vec2 c, float R, float sd, float grow) {
  vec2 v = p - c;
  if (dot(v, v) > R * R * 3.6) return 1e3;                    // wide enough that the halo has died before the cull
  float f = atan(v.y, v.x) / (TAU / 6.0);
  float i0 = floor(f + 0.5);
  float d = 1e3;
  for (int k = 0; k < 2; k++) {
    float idx = i0 + (k == 0 ? 0.0 : (f < i0 ? -1.0 : 1.0));
    float ia = mod(idx, 6.0);                                 // +3 and -3 are the same arm, the one at 180 degrees:
    int bi = int(clamp(ia, 0.0, 5.0));                        // seed it identically from either side or it splits down the spine
    // A quiet band should still leave an arm you can see, or the crystal loses its six-fold
    // shape in the gaps between notes; the band decides how far it reaches past that floor.
    float L = max(R * grow * (0.46 + 0.70 * gBand[bi]) * (0.78 + 0.44 * hash11(sd * 5.77 + ia * 1.7)), 0.004);
    vec2 rv = rot(-ia * (TAU / 6.0)) * v;
    d = min(d, armField(vec2(rv.x, abs(rv.y)), L, sd + ia));
  }
  return d;
}

// The street on the far side. Everything is soft: we are looking through cold wet glass.
vec3 city(vec2 p) {
  vec3 col = mix(vec3(0.020, 0.034, 0.056), vec3(0.003, 0.005, 0.014), ss(-0.45, 0.95, p.y));
  col += (pal(0.08) * 0.35 + vec3(0.16, 0.10, 0.04)) * exp(-abs(p.y + 0.22) * 2.4) * (0.35 + 0.55 * uLevel);
  float top = -0.40 + 0.62 * hash11(floor(p.x / 0.31) * 3.71 + 1.3);
  float inside = ss(top + 0.018, top - 0.018, p.y);
  col = mix(col, vec3(0.008, 0.011, 0.020), inside * 0.92);
  vec2 g = p / vec2(0.040, 0.055);
  vec2 gi = floor(g), gf = fract(g) - 0.5;
  float blob = (1.0 - ss(0.10, 0.40, abs(gf.x))) * (1.0 - ss(0.08, 0.36, abs(gf.y)));
  vec3 warm = mix(vec3(1.0, 0.74, 0.40), pal(0.10), 0.30);
  col += warm * blob * step(0.60, hash21(gi + 7.3)) * inside
         * (0.8 + 0.2 * sin(uTime * 0.7 + hash21(gi) * 50.0)) * (0.20 + 0.45 * uLevel);
  return col;
}

void main() {
  vec2 p = centered() * (1.0 + uBeat * 0.006 * uPunch);       // the pane takes a tap on every beat
  float aspect = uRes.x / uRes.y, px = 2.4 / uRes.y;
  for (int i = 0; i < 6; i++) gBand[i] = slow(0.03 + float(i) * 0.17) * 0.80 + spec(0.03 + float(i) * 0.17) * 0.35;

  vec3 back = city(p);
  float lum = dot(back, vec3(0.3, 0.6, 0.1));

  float rough = (fbm(p * 24.0) - 0.48) * 0.012;               // frost edges are furry, never machined
  float ice = 0.0, halo = 0.0, dm = 1e3, wm = 0.0;
  for (int k = 0; k < 9; k++) {
    float fk = float(k);
    float b = uBeatCount - fk;
    vec3 s = seedAt(b);
    float grow = k == 0 ? ss(0.0, 0.40, uBeatAge) : 1.0;      // only the last beat is knowable; the rest finished growing
    float w = (1.0 - fk / 9.0) * (1.0 - fk / 9.0);            // older crystals sink back into the glass
    if (k == 8) w *= 1.0 - ss(0.0, 0.40, uBeatAge);           // the oldest thaws out exactly as the newest comes in
    float d = crystal(p, s.xy, s.z, b, grow) + rough;
    ice = max(ice, (1.0 - ss(0.0, px * 2.0, d)) * w);
    halo = max(halo, exp(-max(d, 0.0) * 60.0) * w);
    if (d < dm) { dm = d; wm = w; }
  }

  // rime creeping in from the frame: needles run inwards, so the noise is stretched across them
  float rim = ss(0.55, 1.02, abs(p.x) / aspect) * ss(0.40, 0.78, fbm(vec2(p.y * 70.0, p.x * 7.0)))
            + ss(0.55, 1.02, abs(p.y)) * ss(0.40, 0.78, fbm(vec2(p.x * 70.0, p.y * 7.0)));
  ice = max(ice, clamp(rim, 0.0, 1.0) * (0.45 + 0.50 * ss(0.05, 0.6, uLevel)));

  vec3 cold = vec3(0.72, 0.84, 0.98);
  vec3 col = back;
  float fog = clamp(0.16 + 0.26 * ss(0.1, 0.9, uLevel) + 0.20 * (fbm(p * 2.2 + vec2(0.0, uTime * 0.01)) - 0.42), 0.0, 0.7);
  col = mix(col, cold * (0.030 + lum * 0.85), fog);           // breath on the glass smears the lights
  col = mix(col, cold * (0.10 + 1.30 * lum) + vec3(0.05, 0.075, 0.105), ice * 0.88);
  col += cold * clamp(halo - ice, 0.0, 1.0) * (0.04 + 0.22 * lum);
  col += vec3(0.85, 0.93, 1.0) * (1.0 - ss(px * 0.6, px * 2.2, abs(dm))) * wm * (0.14 + 0.45 * lum + 0.30 * uHigh);

  // facets catching the light for a frame at a time
  vec2 gq = floor(p * (uRes.y / 3.0));
  col += vec3(0.85, 0.94, 1.0) * step(0.9955, hash21(gq + floor(uTime * 7.0) * 1.7)) * ice * (0.5 + 3.0 * uHigh);

  // the seed itself: a cold shock running out across the glass from where the beat landed
  float r0 = length(p - seedAt(uBeatCount).xy);
  col += cold * (0.0035 / (abs(r0 - uBeatAge * 1.3) + 0.010)) * exp(-uBeatAge * 6.0) * 0.5 * uPunch;

  col *= 0.93 + 0.07 * noise(p * vec2(140.0, 150.0));         // the glass has a grain of its own
  col *= 1.0 - 0.32 * ss(0.5, 1.5, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'frost',
  name: 'Frost',
  group: 'Vibe',
  blurb: 'Dendrites take the window, one arm per band, a new crystal seeded on every beat',
  tags: ['nature', 'city', 'calm'],
  energy: 0.28,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
