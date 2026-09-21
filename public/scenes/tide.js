// TIDE — open sea under a full moon.
//
// The swell is the bass, the chop is the mids, and the moon's glitter path sparkles with the
// treble. On every beat the plankton near the boat lights up and fades, the far lighthouse
// flashes, and every eighth beat a meteor crosses the sky. The camera drifts forward at the
// cruise speed, so louder passages sail faster.
const frag = `
const float HORIZON = 0.18;

float swell(vec2 q, float t) {
  float h = 0.0, amp = 1.0, fr = 0.22;
  vec2 d = normalize(vec2(0.35, 1.0));
  for (int i = 0; i < 5; i++) {
    h += amp * sin(dot(q, d) * fr + t * (0.9 + float(i) * 0.37) + float(i) * 1.7);
    d = rot(1.1) * d; amp *= 0.52; fr *= 1.85;
  }
  return h;
}
float water(vec2 q, float t) {
  float big = swell(q, t) * (0.10 + 0.22 * uBass);
  float chop = (noise(q * 1.7 + vec2(0.0, t * 0.8)) + 0.5 * noise(q * 4.1 - vec2(t * 0.6, 0.0))) * (0.05 + 0.10 * uMid);
  return big + chop;
}

vec3 skyCol(vec3 d, vec3 moonDir) {
  float upw = max(d.y, 0.0);
  vec3 col = mix(vec3(0.030, 0.045, 0.085), vec3(0.004, 0.006, 0.018), ss(0.0, 0.55, upw));
  col += pal(0.58) * 0.06 * exp(-upw * 9.0);                                   // haze along the horizon
  float ang = acos(clamp(dot(d, moonDir), -1.0, 1.0));
  float craters = 0.82 + 0.18 * noise(d.xy * 70.0);
  col += vec3(1.0, 0.97, 0.9) * (1.0 - ss(0.040, 0.044, ang)) * 1.6 * craters;
  col += vec3(0.75, 0.82, 1.0) * (0.0009 / (ang * ang + 0.0009)) * 0.10 * (0.7 + 0.6 * uLevel + 0.8 * uBeat * uPunch);
  col += pal(0.6) * exp(-ang * 5.0) * 0.10;
  // thin moonlit cloud streaks low in the sky
  vec2 cp = d.xz / (d.y + 0.10) * 0.30 + vec2(uTime * 0.004, 0.0);
  float cl = ss(0.48, 0.85, fbm(cp * vec2(1.0, 2.4))) * ss(0.015, 0.10, d.y) * (1.0 - ss(0.25, 0.5, d.y));
  col += (vec3(0.10, 0.12, 0.17) + pal(0.6) * 0.06) * cl * (0.35 + 2.2 * exp(-ang * 3.0));
  return col;
}

void main() {
  vec2 p = rot(0.012 * sin(uTime * 0.23)) * centered();
  p.y += 0.015 * sin(uTime * 0.31);
  float aspect = uRes.x / uRes.y;
  vec3 ro = vec3(uBalance * 0.3, 1.35, uCruise * 1.4);
  vec3 rd = normalize(vec3(p.x, p.y - HORIZON, 1.7));
  vec3 moonDir = normalize(vec3(0.12, 0.26, 1.0));
  float tt = uTime * 0.9;
  vec3 col;

  if (rd.y >= 0.0) {
    col = skyCol(rd, moonDir);
    vec2 g = p * 64.0;
    vec2 c = floor(g);
    float h = hash21(c);
    vec2 f = fract(g) - 0.5 - (vec2(hash21(c + 1.1), hash21(c + 2.2)) - 0.5) * 0.8;
    col += vec3(0.85, 0.9, 1.0) * step(0.93, h) * (0.0014 / (dot(f, f) + 0.002)) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0)) * (0.4 + uHigh) * ss(0.0, 0.15, rd.y);
    // a meteor on every eighth beat
    if (mod(uBeatCount, 8.0) < 0.5 && uBeatAge < 0.9) {
      float ev = floor(uBeatCount / 8.0);
      vec2 a = vec2((hash11(ev * 1.7) - 0.5) * aspect * 1.4, 0.55 + 0.35 * hash11(ev * 3.1));
      vec2 dir = normalize(vec2(hash11(ev * 5.3) - 0.5, -0.35));
      vec2 head = a + dir * uBeatAge * 1.3;
      vec2 v = p - head;
      float along = clamp(dot(v, -dir), 0.0, 0.35);
      float dl = length(v + dir * along);
      col += vec3(0.9, 0.95, 1.0) * (0.0012 / (dl * dl + 0.00002)) * 0.02 * (1.0 - along / 0.35) * (1.0 - uBeatAge / 0.9);
    }
  } else {
    float t = ro.y / -rd.y;
    vec3 hp = ro + rd * t;
    t = (ro.y - water(hp.xz, tt)) / -rd.y;               // one refinement against the height field gives near waves parallax
    hp = ro + rd * t;
    float e = 0.02 + t * 0.004;
    vec3 n = normalize(vec3(water(hp.xz - vec2(e, 0.0), tt) - water(hp.xz + vec2(e, 0.0), tt), 2.0 * e,
                            water(hp.xz - vec2(0.0, e), tt) - water(hp.xz + vec2(0.0, e), tt)));
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), ss(15.0, 140.0, t)));
    vec3 rf = reflect(rd, n);
    rf.y = abs(rf.y);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    vec3 deep = vec3(0.003, 0.012, 0.022) + pal(0.55) * 0.012;
    col = mix(deep, skyCol(rf, moonDir), fres);
    col += vec3(1.0, 0.95, 0.85) * pow(max(dot(rf, moonDir), 0.0), 500.0) * 3.0 * (0.5 + 1.6 * uHigh);   // glitter
    // plankton wakes up with the beat, close to the boat
    float bio = ss(0.62, 0.9, noise(hp.xz * 3.2 + 3.0)) * ss(0.55, 0.95, noise(hp.xz * 38.0 + tt));
    col += pal(0.45) * bio * uBeat * uPunch * 2.2 * exp(-t * 0.09);
    col = mix(col, skyCol(normalize(vec3(rd.x, 0.004, rd.z)), moonDir), 1.0 - exp(-t * 0.011));
  }

  // the lighthouse on the horizon: flashes on the beat, its beam swings with the cruise clock
  vec2 lp = vec2(-aspect * 0.62, HORIZON);
  float tower = (1.0 - ss(0.004, 0.006, abs(p.x - lp.x))) * step(lp.y, p.y) * step(p.y, lp.y + 0.075);
  float rx = (p.x - lp.x) * 14.0;
  float rock = 1.0 - ss(0.0, 0.004, p.y - lp.y - 0.025 * exp(-rx * rx));
  col = mix(col, vec3(0.004, 0.005, 0.009), max(tower, rock * step(lp.y, p.y)));
  vec2 lamp = lp + vec2(0.0, 0.080);
  float flash = 0.25 + 1.6 * exp(-uBeatAge * 3.0) * uPunch;
  float dl = length(p - lamp);
  col += vec3(1.0, 0.86, 0.6) * (0.00035 / (dl * dl + 0.00025)) * flash;
  float sweep = cos(uCruise * 0.5);
  float reach = 0.55 * abs(sweep);
  float side = (p.x - lamp.x) * sign(sweep);
  col += vec3(1.0, 0.88, 0.65) * exp(-abs(p.y - lamp.y) * 110.0) * step(0.0, side) * (1.0 - ss(0.0, max(reach, 0.001), side)) * 0.35 * flash;
  col += vec3(1.0, 0.86, 0.6) * exp(-abs(p.x - lp.x) * 55.0) * exp(-max(lp.y - p.y, 0.0) * 7.0) * step(p.y, lp.y) * 0.10 * flash;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'tide',
  name: 'Tide',
  group: 'Vibe',
  blurb: 'Moonlit open sea; bass lifts the swell and plankton glows on every beat',
  tags: ['water', 'nature', 'night', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
