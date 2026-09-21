// STORM — a thunderstorm crossing open country.
//
// Every second beat a bolt comes down somewhere new, with branches and the flicker of its
// re-strikes; the beats in between light the cloud deck from inside without a bolt. The rain
// leans with the bass and thickens with the treble, the lights of a far town are the spectrum,
// and the scene asks for the rain ambience, so it sounds like it looks.
const frag = `
const float HORIZON = -0.34;
const float CEILING = 0.66;

float wander(float y, float seed) {
  return (fbm(vec2(y * 2.2 + seed * 3.1, seed)) - 0.5) * 0.55 + (noise(vec2(y * 17.0, seed * 5.0)) - 0.5) * 0.07;
}
float stroke(float d) { return 0.0016 / (d + 0.0016) + exp(-d * 14.0) * 0.35; }

float bolt(vec2 p, float seed, float x0) {
  float yy = clamp(p.y, HORIZON, CEILING);
  float bx = x0 + wander(yy, seed) - wander(CEILING, seed);
  float v = stroke(length(vec2(p.x - bx, p.y - yy)));
  for (int k = 0; k < 3; k++) {                                       // side branches that die out in mid-air
    float fk = float(k);
    float yb = mix(CEILING, HORIZON, 0.22 + 0.2 * fk + 0.1 * hash11(seed + fk));
    float len = 0.18 + 0.14 * hash11(seed * 1.7 + fk);
    float sgn = hash11(seed * 2.3 + fk * 5.0) < 0.5 ? -1.0 : 1.0;
    float y2 = clamp(p.y, yb - len, yb);
    float along = (yb - y2) / len;
    float xb = x0 + wander(yb, seed) - wander(CEILING, seed) + sgn * (yb - y2) * (0.5 + hash11(seed + fk * 9.0)) + (noise(vec2(y2 * 30.0, seed + fk)) - 0.5) * 0.04 * along;
    v += stroke(length(vec2(p.x - xb, p.y - y2))) * 0.5 * (1.0 - along);
  }
  return v;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  p += (vec2(noise(vec2(uTime * 23.0, 1.0)), noise(vec2(uTime * 19.0, 7.0))) - 0.5) * 0.012 * uBeat * uPunch;   // thunder shakes the camera
  float sy = p.y - HORIZON;
  float seed = floor(uBeatCount);
  float strike = mod(uBeatCount, 2.0) < 0.5 ? 1.0 : 0.0;
  float x0 = (hash11(seed * 1.37 + 5.0) - 0.5) * aspect * 1.3;
  float env = exp(-uBeatAge * 6.0) * (0.55 + 0.45 * step(0.5, noise(vec2(uTime * 30.0, 1.0)))) * uPunch;
  vec3 flashCol = vec3(0.75, 0.8, 1.0) + pal(0.7) * 0.4;
  vec3 col;

  if (sy >= 0.0) {
    // the cloud deck, projected as a ceiling so it rushes overhead
    vec2 cp = vec2(p.x, 1.0) / (sy + 0.22) * 0.55;
    cp += vec2(uTime * 0.01, uTime * 0.05);
    float cl = fbm(cp * 1.3), cl2 = fbm(cp * 3.1 + 7.0);
    float dens = ss(0.25, 0.85, cl * 0.7 + cl2 * 0.3 + 0.12);
    col = mix(vec3(0.05, 0.06, 0.09), vec3(0.012, 0.014, 0.025), dens) + pal(0.6) * 0.03 * (1.0 - dens);
    col += flashCol * env * (0.25 + 0.9 * exp(-abs(p.x - x0) * 1.6)) * (0.35 + 0.65 * cl2) * ss(-0.1, 0.4, sy);
    col = mix(vec3(0.03, 0.035, 0.05), col, ss(0.0, 0.25, sy));
    // a far town strung along the horizon, every lamp on its own band
    float cell = floor(p.x * 46.0);
    float hl = hash11(cell * 1.9 + 4.0);
    vec2 lv = vec2((fract(p.x * 46.0) - 0.5) / 46.0, sy - 0.006);
    col += vec3(1.0, 0.8, 0.5) * step(0.62, hl) * (0.000012 / (dot(lv, lv) + 0.000008)) * (0.25 + 1.2 * spec(hl * 0.8));
  } else {
    float gd = -sy;
    float z = 0.25 / (gd + 0.004);
    float grass = 0.5 + 0.5 * noise(vec2(p.x * z * 6.0, z * 6.0));
    col = vec3(0.006, 0.009, 0.008) * (0.6 + grass);
    col += vec3(0.5, 0.55, 0.7) * env * 0.35 * grass * exp(-z * 0.05) * (0.4 + 0.6 * exp(-abs(p.x - x0) * 1.5));
  }

  if (strike > 0.5) col += flashCol * bolt(p, seed, x0) * env * 1.6 * step(HORIZON, p.y);

  // a lone tree, rim-lit by whatever strikes beside it
  vec2 tc = vec2(aspect * 0.48, HORIZON + 0.19);
  float lean = 0.05 + 0.05 * uBass;                                   // the wind pushes the crown over
  float crown = 1e3;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    vec2 bc = tc + vec2((hash11(fk * 3.1 + 1.0) - 0.5) * 0.16 + lean * (0.5 + fk * 0.2), (hash11(fk * 5.3 + 2.0) - 0.4) * 0.11);
    vec2 bv = (p - bc) * vec2(1.0, 1.25);
    crown = min(crown, length(bv) - (0.055 + 0.03 * hash11(fk * 7.7 + 3.0)) - 0.035 * noise(bv * 26.0 + fk * 9.0));
  }
  vec2 ta = p - vec2(tc.x, HORIZON), tb = vec2(lean * 0.6, 0.16);
  float th = clamp(dot(ta, tb) / dot(tb, tb), 0.0, 1.0);
  float trunk = length(ta - tb * th) - mix(0.013, 0.006, th);
  float tree = 1.0 - ss(0.0, 0.004, min(crown, trunk));
  float facing = ss(-0.2, 0.8, dot(normalize(p - tc + 1e-4), normalize(vec2(x0 - tc.x, 0.35))));
  col = mix(col, vec3(0.004, 0.006, 0.006) + flashCol * env * 0.30 * facing * ss(-0.022, 0.0, crown), tree);

  // telegraph poles marching to the horizon
  vec2 vp = vec2(-0.1, HORIZON);
  float wires = 1e3, poles = 1e3;
  vec2 prevTop = vec2(0.0);
  for (int k = 0; k < 6; k++) {
    float z = 1.0 + float(k) * 0.9;
    vec2 foot = vp + vec2(-1.3, -0.55) / z;
    vec2 top = foot + vec2(0.0, 0.75 / z);
    vec2 pa = p - foot, ba = top - foot;
    poles = min(poles, length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - 0.006 / z);
    poles = min(poles, max(abs(p.x - top.x) - 0.06 / z, abs(p.y - top.y + 0.04 / z) - 0.004 / z));
    if (k > 0) {
      vec2 wa = p - prevTop, wb = top - prevTop;
      float hh = clamp(dot(wa, wb) / dot(wb, wb), 0.0, 1.0);
      float sag = 0.05 / z * 4.0 * hh * (1.0 - hh);
      wires = min(wires, length(wa - wb * hh + vec2(0.0, sag)));
    }
    prevTop = top;
  }
  col = mix(col, vec3(0.003, 0.004, 0.005), max(1.0 - ss(0.0, 0.003, poles), (1.0 - ss(0.0008, 0.0022, wires)) * 0.85));

  // rain: three sheets of stretched cells
  for (int i = 0; i < 3; i++) {
    float fl = float(i);
    float sc = 18.0 + 14.0 * fl;
    vec2 rp = vec2(p.x + p.y * (0.18 + 0.25 * uBass), p.y) * vec2(sc, sc * 0.12);
    rp.y += uTime * (9.0 + 4.0 * fl);
    vec2 f = fract(rp);
    float h = hash21(floor(rp) + fl * 17.0);
    float drop = step(0.74 - 0.3 * uHigh, h) * (1.0 - ss(0.0, 0.07, abs(f.x - 0.5))) * ss(0.0, 0.2, f.y) * (1.0 - ss(0.6, 1.0, f.y));
    col += vec3(0.55, 0.6, 0.7) * drop * (0.05 + 0.12 * env + 0.04 * uLevel);
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'storm',
  name: 'Storm',
  group: 'Vibe',
  blurb: 'Thunderstorm over open country; branching bolts strike every second beat',
  tags: ['weather', 'nature', 'night', 'intense'],
  energy: 0.75,
  particles: 0,
  trails: 0.15,
  zoom: 1,
  spin: 0,
  ambience: 'rain',
  frag,
};
