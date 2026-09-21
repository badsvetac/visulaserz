// CABIN — snowed in, with the fire going.
//
// The string of bulbs along the eaves is the analyser, one band per bulb, bass at the left. The
// windows flicker with the fire, which is the bass; the snow falls in three depths, leans with
// the wind (the bass again) and swirls when a beat lands; the chimney smoke climbs on the travel
// clock; the snow crust glitters with the treble.
const frag = `
const float GROUND = -0.50;

float box(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return max(d.x, d.y); }

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uTime;
  float fire = 0.65 + 0.2 * noise(vec2(t * 6.0, 2.0)) + 0.6 * uBass;

  // sky, stars, moon
  vec3 col = mix(vec3(0.030, 0.045, 0.095), vec3(0.004, 0.006, 0.022), ss(GROUND, 0.9, p.y));
  vec2 g = p * 60.0;
  vec2 gc = floor(g);
  float sh = hash21(gc);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
  col += vec3(0.85, 0.9, 1.0) * step(0.93, sh) * (0.0013 / (dot(sf, sf) + 0.002)) * (0.4 + uHigh);
  vec2 mv = p - vec2(aspect * 0.55, 0.60);
  col += vec3(1.0, 0.97, 0.9) * (1.0 - ss(0.095, 0.10, length(mv))) * (0.85 + 0.15 * noise(mv * 30.0)) + vec3(0.5, 0.6, 0.9) * 0.10 * exp(-length(mv) * 3.0);

  // mountains, then two rows of snow-laden pines
  float mh = GROUND + 0.30 + 0.30 * fbm(vec2(p.x * 0.9 + 5.0, 1.0));
  if (p.y < mh) col = mix(vec3(0.030, 0.040, 0.075), vec3(0.16, 0.19, 0.28), ss(mh - 0.12, mh, p.y) * (0.5 + 0.5 * noise(p * vec2(30.0, 10.0))));
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float pa = p.x * (10.0 - fk * 3.5) + fk * 4.3;
    float hgt = (0.16 + 0.20 * hash11(floor(pa) + fk * 20.0)) * (1.0 + fk * 0.35);
    float tri = 1.0 - abs(fract(pa) - 0.5) * 2.0;
    float top = GROUND + 0.04 + hgt * tri - fk * 0.03;
    if (p.y < top) {
      float snowCap = ss(0.55, 0.85, fract((top - p.y) * 22.0 + tri * 2.0)) * ss(0.0, 0.10, tri);
      col = mix(vec3(0.010, 0.020, 0.022), vec3(0.30, 0.35, 0.46), snowCap * 0.55) * (0.7 + 0.5 * fk);
    }
  }

  // the snowfield
  float drift = GROUND + 0.03 * fbm(vec2(p.x * 2.0, 4.0)) ;
  vec2 cab = vec2(-aspect * 0.22, GROUND + 0.17);
  if (p.y < drift) {
    float dpt = drift - p.y;
    vec3 snow = mix(vec3(0.22, 0.27, 0.40), vec3(0.10, 0.13, 0.22), ss(0.0, 0.5, dpt)) * (0.85 + 0.15 * fbm(p * vec2(3.0, 9.0)));
    vec2 wv = (p - vec2(cab.x, GROUND - 0.06)) * vec2(1.0, 2.6);
    snow += vec3(1.0, 0.62, 0.25) * 0.30 * fire * exp(-dot(wv, wv) * 6.0);              // window light spilling on the snow
    float glint = step(0.992, hash21(floor(p * uRes.y * 0.25))) * (0.3 + 2.0 * uHigh) * (0.5 + 0.5 * sin(t * 4.0 + p.x * 90.0));
    col = snow + vec3(0.8, 0.9, 1.0) * glint;
    // footprints leading to the door
    float fx = p.x - (cab.x + 0.02) - dpt * 0.9;
    col *= 1.0 - 0.35 * step(abs(fx + 0.012 * sign(sin(dpt * 60.0))), 0.010) * step(0.5, fract(dpt * 9.5)) * step(dpt, 0.42);
  }

  // the cabin
  float walls = box(p, cab, vec2(0.30, 0.17));
  if (walls < 0.0) {
    float logs = 0.55 + 0.45 * sin((p.y - cab.y) * 110.0);
    col = vec3(0.060, 0.034, 0.020) * (0.5 + 0.5 * logs) * (0.8 + 0.4 * noise(p * vec2(12.0, 80.0)));
    col += vec3(0.05, 0.06, 0.10) * 0.5;
    // two windows and a door
    for (int k = 0; k < 2; k++) {
      vec2 wc = cab + vec2(k == 0 ? -0.17 : 0.13, 0.02);
      float wd = box(p, wc, vec2(0.065, 0.060));
      if (wd < 0.0) {
        float bars = step(0.006, abs(p.x - wc.x)) * step(0.006, abs(p.y - wc.y));
        col = mix(vec3(0.03, 0.02, 0.01), mix(vec3(1.0, 0.62, 0.22), pal(0.08), 0.25) * fire * (0.8 + 0.3 * noise(p * 40.0 + t)), bars);
      }
      col += vec3(1.0, 0.6, 0.25) * 0.06 * fire * exp(-max(wd, 0.0) * 22.0);
    }
    float door = box(p, cab + vec2(-0.02, -0.055), vec2(0.045, 0.115));
    if (door < 0.0) col = vec3(0.035, 0.020, 0.012) * (0.7 + 0.3 * sin(p.x * 260.0));
  }
  // roof under a thick quilt of snow, and the chimney
  float rx = p.x - cab.x;
  float roofY = cab.y + 0.17 + (0.36 - abs(rx)) * 0.52;
  float roof = step(abs(rx), 0.36) * step(cab.y + 0.17, p.y) * step(p.y, roofY);
  col = mix(col, vec3(0.045, 0.028, 0.020), roof);
  float quilt = step(abs(rx), 0.38) * step(roofY - 0.012 - 0.01 * noise(vec2(p.x * 40.0, 1.0)), p.y) * step(p.y, roofY + 0.045 + 0.012 * noise(vec2(p.x * 9.0, 3.0)));
  col = mix(col, vec3(0.42, 0.48, 0.62) * (0.8 + 0.2 * noise(p * 30.0)), quilt);
  vec2 ch = cab + vec2(0.17, 0.33);
  float chim = box(p, ch, vec2(0.030, 0.07));
  col = mix(col, vec3(0.05, 0.035, 0.03) * (0.7 + 0.3 * step(0.5, fract(p.y * 40.0))), step(chim, 0.0) * (1.0 - quilt));
  col = mix(col, vec3(0.42, 0.48, 0.62), step(box(p, ch + vec2(0.0, 0.078), vec2(0.036, 0.012)), 0.0));

  // smoke
  float sy = p.y - (ch.y + 0.09);
  float sx = (p.x - ch.x - sy * (0.12 + 0.3 * uBass)) / (0.03 + sy * 0.22);
  float sm = fbm(vec2(sx * 1.2, sy * 3.0 - uTravel * 0.05) + 2.0);
  col += vec3(0.20, 0.22, 0.28) * ss(0.35, 0.75, sm) * exp(-sx * sx) * step(0.0, sy) * (1.0 - ss(0.2, 0.75, sy)) * 0.6;

  // the bulbs along the eaves: one band each
  for (int i = 0; i < 13; i++) {
    float fi = float(i);
    float u = fi / 12.0;
    float bx = cab.x + (u * 2.0 - 1.0) * 0.36;
    vec2 bp = vec2(bx, cab.y + 0.17 + (0.36 - abs(bx - cab.x)) * 0.52 - 0.022 - 0.006 * sin(u * 40.0));
    float band = spec(0.03 + u * 0.75);
    vec2 bv = p - bp;
    col += pal(u * 0.9 + 0.05) * (0.00010 / (dot(bv, bv) + 0.00006)) * (0.15 + 1.8 * band);
  }

  // a snowman keeps watch
  vec2 sn = vec2(aspect * 0.30, GROUND + 0.035);
  float sman = min(min(length(p - sn) - 0.055, length(p - sn - vec2(0.0, 0.075)) - 0.040), length(p - sn - vec2(0.0, 0.130)) - 0.028);
  if (sman < 0.0) {
    col = vec3(0.34, 0.40, 0.55) * (0.6 + 0.4 * ss(-0.06, 0.06, (p.x - sn.x) * 0.6 + (p.y - sn.y - 0.06)));
    col = mix(col, vec3(0.9, 0.4, 0.1), step(box(p, sn + vec2(0.018, 0.128), vec2(0.016, 0.004)), 0.0));
    col = mix(col, vec3(0.01), step(min(length(p - sn - vec2(-0.010, 0.138)), length(p - sn - vec2(0.010, 0.138))), 0.004));
  }

  // snowfall in three depths
  float gust = uBeat * uPunch;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float sc = 7.0 + fk * 7.0;
    vec2 q = vec2(p.x + (0.10 + 0.35 * uBass) * (p.y + t * 0.3) + 0.04 * gust * sin(p.y * 6.0 + fk), p.y + t * (0.16 - 0.035 * fk)) * sc;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5 - (vec2(hash21(id + fk), hash21(id + 7.0 + fk)) - 0.5) * 0.7;
    f.x += 0.12 * sin(t * (1.0 + hash21(id + 3.0)) + id.y);
    float flake = (1.0 - ss(0.02, 0.085 - 0.015 * fk, length(f))) * step(0.35, hash21(id + 11.0));
    col += vec3(0.85, 0.9, 1.0) * flake * (0.55 - 0.13 * fk);
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'cabin',
  name: 'Cabin',
  group: 'Vibe',
  blurb: 'Snowed-in cabin at night; eave bulbs show the spectrum, fire glows with bass',
  tags: ['nature', 'weather', 'night', 'calm'],
  energy: 0.15,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
