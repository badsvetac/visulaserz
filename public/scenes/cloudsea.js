// CLOUDSEA — flying above the clouds at the end of the day.
//
// The cloud deck is a height field, marched with cheap three-octave noise and shaded with the
// full five, lit from a sun sitting on the horizon: warm on the sunward slopes, violet in the
// hollows, silver on the rims when you look toward the light. The bass makes the deck billow,
// the cruise clock sets the airspeed, a beat lights one of the cells from inside, and a skein of
// birds beats its wings in time.
const frag = `
float coarse(vec2 xz) {
  vec2 q = xz * 0.16;
  float s = 0.5 * noise(q); q = rot(0.5) * q * 2.03 + vec2(13.7, 7.1);
  s += 0.25 * noise(q);     q = rot(0.5) * q * 2.03 + vec2(13.7, 7.1);
  s += 0.125 * noise(q);
  return s;
}
float deckCoarse(vec2 xz) { return (coarse(xz) - 0.45) * (3.4 + 2.0 * uBass); }
float deckFine(vec2 xz) { return (fbm(xz * 0.16) * 0.92 + 0.10 * fbm(xz * 0.9 + 9.0) - 0.47) * (3.4 + 2.0 * uBass); }

vec3 sky(vec3 rd, vec3 sunDir) {
  float upw = max(rd.y, 0.0);
  vec3 warm = mix(vec3(1.0, 0.55, 0.25), pal(0.06), 0.35);
  vec3 col = mix(warm * 0.75, mix(vec3(0.10, 0.16, 0.38), pal(0.62) * 0.4, 0.3), ss(0.0, 0.45, upw));
  col = mix(col, vec3(0.02, 0.03, 0.10), ss(0.35, 1.0, upw));
  float sd = max(dot(rd, sunDir), 0.0);
  col += warm * (pow(sd, 6.0) * 0.5 + pow(sd, 60.0) * 1.2) * (0.8 + 0.4 * uLevel);
  col += vec3(1.0, 0.95, 0.85) * ss(0.9994, 0.9998, sd) * 3.0;
  // mares' tails high above
  vec2 cp = rd.xz / (rd.y + 0.15) * 0.5;
  float ci = ss(0.5, 0.9, fbm(cp * vec2(1.0, 3.0) + vec2(uTime * 0.005, 0.0))) * ss(0.05, 0.3, rd.y);
  col += mix(warm, vec3(1.0), 0.4) * ci * 0.18;
  return col;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  p = rot(0.03 * sin(uTime * 0.17) + uBalance * 0.03) * p;
  vec3 ro = vec3(0.0, 3.1, uCruise * 2.0);
  vec3 rd = normalize(vec3(p.x, p.y - 0.10, 1.6));
  vec3 sunDir = normalize(vec3(-0.30, 0.10, 1.0));
  vec3 col = sky(rd, sunDir);

  if (rd.y < 0.12) {
    float t0 = 0.5, t1 = 0.5;
    bool hit = false;
    for (int i = 0; i < 60; i++) {
      t1 = t0 * 1.075 + 0.08;
      vec3 q = ro + rd * t1;
      if (q.y < deckCoarse(q.xz)) { hit = true; break; }
      if (t1 > 170.0) break;
      t0 = t1;
    }
    if (hit) {
      for (int i = 0; i < 6; i++) {
        float tm = 0.5 * (t0 + t1);
        vec3 q = ro + rd * tm;
        if (q.y < deckCoarse(q.xz)) t1 = tm; else t0 = tm;
      }
      vec3 pos = ro + rd * t1;
      float e = 0.10 + t1 * 0.012;
      float h = deckFine(pos.xz);
      vec3 n = normalize(vec3(deckFine(pos.xz - vec2(e, 0.0)) - deckFine(pos.xz + vec2(e, 0.0)), 2.0 * e, deckFine(pos.xz - vec2(0.0, e)) - deckFine(pos.xz + vec2(0.0, e))));
      float lit = clamp(dot(n, sunDir) * 0.75 + 0.35, 0.0, 1.0);
      float tall = ss(-1.6, 1.8, h);                                     // hollows stay in shadow, crests catch the sun
      vec3 warm = mix(vec3(1.0, 0.70, 0.42), pal(0.08), 0.30);
      vec3 shade = mix(vec3(0.20, 0.17, 0.32), pal(0.62) * 0.35, 0.35);
      vec3 cc = mix(shade, warm, lit * (0.35 + 0.65 * tall));
      cc += warm * pow(max(dot(rd, sunDir), 0.0), 5.0) * pow(1.0 - max(dot(n, -rd), 0.0), 2.0) * 1.2 * tall;   // silver lining
      // a cell lit from inside on the beat
      vec2 lp = ro.xz + vec2((hash11(uBeatCount * 1.3 + 2.0) - 0.5) * 60.0, 25.0 + 50.0 * hash11(uBeatCount * 2.9 + 1.0));
      cc += (vec3(0.8, 0.85, 1.0) + pal(0.7) * 0.4) * exp(-length(pos.xz - lp) * 0.10) * exp(-uBeatAge * 5.0) * 1.6 * uPunch;
      col = mix(cc, sky(normalize(vec3(rd.x, 0.02, rd.z)), sunDir), 1.0 - exp(-t1 * 0.013));
    }
  }

  // birds
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 bc = vec2(mod(uTime * 0.03 + fi * 0.021, 1.0) * aspect * 2.6 - aspect * 1.3 + (fi - 3.0) * 0.06, 0.42 + abs(fi - 3.0) * 0.035 + 0.01 * sin(uTime + fi));
    vec2 bv = (p - bc) / 0.028;
    float flap = 0.35 + 0.45 * sin(uBeatAge * 9.0 + fi * 0.6) * exp(-uBeatAge * 1.5) + 0.2 * sin(uTime * 5.0 + fi);
    float wing = abs(bv.y - abs(bv.x) * flap + 0.0) ;
    float bird = (1.0 - ss(0.06, 0.16, wing)) * step(abs(bv.x), 1.0);
    col = mix(col, vec3(0.02, 0.02, 0.04), bird * 0.85);
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'cloudsea',
  name: 'Cloudsea',
  group: 'Journey',
  blurb: 'Sunset flight over a cloud deck that billows with bass; birds flap in time',
  tags: ['weather', 'nature', '3d', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0.15,
  zoom: 1,
  spin: 0,
  frag,
};
