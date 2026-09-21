// PAMUKKALE — the cotton castle: hot calcium water stepping down a hillside in white terraces.
//
// Spring water saturated with calcium bicarbonate runs down the slope, loses its CO2 to the air and
// drops the calcium back out as travertine, so every pool slowly builds its own dam. The picture is
// nine of those terraces on a perspective ladder, one per band: x = 0.04 + i/8 * 0.86, the big
// foreground pool on the bass and the thin far ones crowding into the treble. The band (read from
// the long-release spectrum, because water has inertia) sets how high that pool stands in its basin
// and how hard it sheets over its own rim onto the terrace below. A beat tips a wave over the crest
// and it arrives one terrace at a time, 42 ms apart, so the whole cascade runs downhill and is spent
// well inside half a second. Low sun, blinding calcium, steam drifting off the hot water.
const frag = `
const float NT = 9.0;
float LEV[10];   // pool levels: 0 = the near foreground basin … 8 = the far one, 9 = the spring at the crest

// Each step up the hill is smaller on screen than the last, so the far terraces crowd together
// the way they do when you look up the slope from the valley.
float terraceY(float f) { return -1.15 + 2.05 * (1.0 - exp(-f * 0.30)); }

// A travertine lip is never straight — it bulges out in scallops. The lobes are measured in terrace
// units rather than pixels, so perspective shrinks them for free as the rim recedes. The nearest rim
// keeps none of them: it has to stay off the bottom of the frame or the pool in front leaks sky.
float rimY(float fi, float x) {
  float wx = x * (1.0 + fi * 0.55) + fi * 2.9;
  float lob = 0.30 * sin(wx * 2.6 + 0.7 * sin(wx * 1.3 + fi)) + 0.14 * noise(vec2(wx * 2.2, fi * 4.0));
  return terraceY(fi + lob * ss(0.0, 1.0, fi));
}

// The beat's surge starts at the crest and reaches terrace fi a little later; rebuilt from uBeatAge
// alone so it never needs memory, and the last terrace is done before the next beat can land.
float surgeAt(float fi) {
  float a = uBeatAge - (NT - fi) * 0.042;
  return step(0.0, a) * ss(0.0, 0.03, a) * exp(-max(a, 0.0) * 6.5);
}

void main() {
  vec2 p = centered() * (1.0 + uBeat * 0.008 * uPunch);
  float aspect = uRes.x / uRes.y;
  float t = uTime;

  // read the nine bands once, up front — nothing samples audio inside the terrace loop
  for (int b = 0; b < 9; b++) LEV[b] = ss(0.04, 0.72, slow(0.04 + float(b) / 8.0 * 0.86));
  LEV[9] = 0.45 + 0.50 * uLevel;                                    // the spring at the top never runs dry

  // low sun over the crest, sky bleached almost out of existence near the white
  vec3 warm = mix(vec3(1.00, 0.88, 0.70), pal(0.08), 0.22);
  vec3 col = mix(warm, mix(vec3(0.44, 0.68, 0.92), pal(0.60), 0.25), ss(0.60, 1.30, p.y));
  vec2 sv = (p - vec2(aspect * 0.42, 0.90)) * vec2(1.0, 1.15);
  col += warm * exp(-length(sv) * 3.0) * 0.60;
  col += vec3(1.0, 0.97, 0.90) * (1.0 - ss(0.055, 0.064, length(sv))) * 1.1;
  col = mix(col, vec3(1.0, 0.97, 0.93), ss(rimY(9.0, p.x) + 0.30, rimY(9.0, p.x), p.y) * 0.45);

  for (int k = 0; k < 9; k++) {
    int idx = 8 - k;                                                // paint far to near; nearer rims overdraw
    float fi = float(idx);
    float yBack = rimY(fi + 1.0, p.x);
    if (p.y > yBack) continue;
    float yFront = rimY(fi, p.x);
    float tt = clamp((p.y - yFront) / max(yBack - yFront, 1e-3), 0.0, 1.0);   // 0 at this pool's own lip, 1 at the wall behind
    float wx = p.x * (1.0 + fi * 0.55) + fi * 2.9;
    float surge = surgeAt(fi) * uPunch;
    float wEnd = mix(0.18, 0.68, LEV[idx]) + 0.12 * surge;          // how far up the basin the water stands
    float WALL = 0.72;                                              // where the drape of the terrace above begins

    // the sheet falling from the rim above: its band decides the flow, the beat's surge floods it
    float sp = ss(0.52, 1.0, LEV[idx + 1]) + 1.3 * surgeAt(fi + 1.0) * uPunch;
    sp *= 1.0 + 0.45 * uBalance * p.x / max(aspect, 1e-3);          // the falls lean the way the mix leans
    float chan = ss(0.40, 0.90, noise(vec2(wx * 4.0 + 9.0 * fi, 1.0)));   // water picks a few channels, not the whole wall
    float sheet = clamp(sp, 0.0, 2.0) * chan;

    // bone-white basin, cooled to blue only where it lies in its own shadow
    float grain = 0.86 + 0.28 * noise(vec2(wx * 11.0, tt * 7.0 + fi));
    vec3 c = vec3(0.90, 0.885, 0.86) * grain * mix(vec3(0.72, 0.80, 0.97), vec3(1.02, 1.00, 0.97), ss(0.0, 0.55, tt));

    // the pool — deepest against the rim that dams it, milky where it shallows out
    if (tt < wEnd) {
      float f = tt / max(wEnd, 1e-3);
      vec3 w = mix(mix(vec3(0.10, 0.60, 0.70), pal(0.56), 0.25), vec3(0.74, 0.95, 0.95), ss(0.05, 0.95, f));
      float rip = sin(wx * 22.0 - t * 1.8 + 2.0 * sin(wx * 7.0 + t * 0.6) + fi);
      w *= 0.93 + 0.12 * rip;
      w = mix(w, vec3(1.0, 0.98, 0.93), ss(0.55, 1.0, f) * 0.45);   // sky reflects hardest at the grazing far edge
      w += vec3(1.0, 0.98, 0.92) * ss(0.88, 1.0, rip) * (0.25 + 0.8 * uHigh) * (0.4 + 0.6 * LEV[idx]);
      c = w;
    }
    c = mix(c, vec3(1.0, 0.99, 0.95), ss(0.045, 0.0, abs(tt - wEnd)) * 0.5 * (1.0 - ss(WALL, WALL + 0.03, tt)));

    // the drape of the terrace above, hanging into this pool
    if (tt > WALL) {
      float u = (tt - WALL) / (1.0 - WALL);
      float flute = 0.5 + 0.5 * sin(wx * 13.0 + 3.0 * noise(vec2(wx * 3.0, fi)));   // calcium builds ribs where the water runs
      c = vec3(1.0, 0.985, 0.95) * (0.62 + 0.30 * flute) * (0.78 + 0.45 * ss(0.10, 1.0, u));
      c += vec3(1.0, 0.99, 0.96) * sheet * (0.30 + 0.22 * sin(u * 26.0 - t * 11.0 - wx * 3.0));
      c += vec3(1.0) * sheet * ss(0.28, 0.0, u) * 0.40;             // foam where the sheet lands
    }
    c += vec3(1.0, 0.97, 0.90) * ss(0.955, 1.0, tt) * (0.45 + 0.45 * sheet);   // the lit lip, brightest thing here
    c = mix(c, vec3(1.0, 0.975, 0.94), ss(2.0, 8.5, fi) * 0.55);     // the far terraces bleach into the haze
    col = c;
  }

  // steam off the hot water, drifting on the cruise clock
  float sm = fbm(vec2(p.x * 2.1 + uCruise * 0.05, p.y * 2.6 - uCruise * 0.10));
  float steam = ss(0.42, 0.95, sm) * ss(-0.85, 0.25, p.y) * (1.0 - ss(0.72, 1.05, p.y));
  col = mix(col, vec3(1.0, 0.985, 0.96), clamp(steam * (0.35 + 0.55 * uEnergy + 0.5 * uBeat * uPunch), 0.0, 0.75) * 0.55);

  col += vec3(1.0, 0.96, 0.88) * ss(0.88, 1.40, dot(col, vec3(0.33))) * 0.35;   // the white really is blinding
  col *= 0.94 + 0.12 * uLevel;
  col *= 1.0 - 0.18 * ss(0.55, 1.50, length(p * vec2(0.62, 0.90)));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'pamukkale',
  name: 'Pamukkale',
  group: 'Journey',
  blurb: 'Travertine terraces stepping downhill; each pool rides its own band, beats send a spill cascading',
  tags: ['turkish', 'water', 'nature', 'light'],
  energy: 0.35,
  particles: 0,
  trails: 0.1,
  zoom: 1,
  spin: 0,
  frag,
};
