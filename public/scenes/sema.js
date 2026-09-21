// SEMA — whirling dervishes.
//
// Five semazens turn on the travel clock, so the ceremony gathers speed with the music. A skirt
// opens as it spins faster: here its flare is the level of the music, its hem ripples with the
// live waveform, and the folds sliding across it are the turning itself. The right hand is raised
// to receive, the left turned down to give. The lamps hanging in the hall are the bands, and the
// polished floor keeps a faint copy of everyone.
const frag = `
const float FLOORY = -0.50;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// One semazen standing at 'foot', scale s, turned by phase. rgb + coverage.
vec4 semazen(vec2 p, vec2 foot, float s, float phase, float flare) {
  vec2 q = (p - foot) / s;
  if (abs(q.x) > 0.75 || q.y < -0.05 || q.y > 1.1) return vec4(0.0);
  vec4 o = vec4(0.0);
  vec3 cloth = vec3(0.90, 0.89, 0.85);
  float cs = cos(phase);

  // the skirt: narrow at the waist, a wide rippling hem near the floor
  float waistY = 0.52, hemY = 0.08;
  float k = clamp((waistY - q.y) / (waistY - hemY), 0.0, 1.0);
  float halfW = mix(0.055, 0.22 + 0.36 * flare, k * k * (0.55 + 0.45 * k));
  float xr = q.x / max(halfW, 1e-3);
  float hem = hemY + (0.035 + 0.03 * flare) * sin(xr * 5.0 + phase * 2.0) + 0.05 * wave(fract(xr * 0.25 + 0.5)) * flare;
  float skirt = step(abs(xr), 1.0) * step(hem * k, q.y - hemY * (1.0 - k)) * step(q.y, waistY);
  float folds = 0.5 + 0.5 * sin(asin(clamp(xr, -1.0, 1.0)) * 7.0 + phase * 2.0);      // folds cross the front as it turns
  vec3 skirtC = cloth * (0.45 + 0.55 * folds) * (0.55 + 0.45 * sqrt(max(1.0 - xr * xr, 0.0))) * (0.75 + 0.25 * k);
  o = mix(o, vec4(skirtC, 1.0), skirt);

  // jacket, head, and the tall felt hat
  float torso = step(abs(q.x), mix(0.085, 0.060, (q.y - waistY) / 0.26)) * step(waistY, q.y) * step(q.y, 0.78);
  o = mix(o, vec4(cloth * (0.55 + 0.35 * (0.5 + 0.5 * cs)), 1.0), torso);
  o = mix(o, vec4(0.05, 0.04, 0.04, 1.0), step(abs(q.x), 0.075) * step(abs(q.y - waistY - 0.01), 0.012));     // the sash
  vec2 hv = q - vec2(0.018 * cs, 0.835);
  o = mix(o, vec4(vec3(0.62, 0.45, 0.36) * (0.6 + 0.4 * (0.5 + 0.5 * cs)), 1.0), 1.0 - ss(0.046, 0.052, length(hv * vec2(1.0, 0.9))));
  float hat = max(abs(hv.x - 0.004) - 0.040, abs(hv.y - 0.115) - 0.085);
  o = mix(o, vec4(vec3(0.50, 0.36, 0.22) * (0.65 + 0.35 * ss(-0.04, 0.04, -hv.x)), 1.0), 1.0 - ss(0.0, 0.006, hat));

  // arms: foreshortened by the turn
  float reach = 0.30 * cs;
  float armR = sdSeg(q, vec2(0.06 * sign(cs + 1e-4), 0.74), vec2(0.06 * sign(cs + 1e-4) + reach, 0.96)) - 0.020;
  float armL = sdSeg(q, vec2(-0.06 * sign(cs + 1e-4), 0.74), vec2(-0.06 * sign(cs + 1e-4) - reach, 0.60)) - 0.020;
  o = mix(o, vec4(cloth * 0.8, 1.0), 1.0 - ss(0.0, 0.006, min(armR, armL)));
  return o;
}

vec3 hall(vec2 p, float aspect, float spinT, float flare) {
  // the dim hall and its hanging lamps
  vec3 col = mix(vec3(0.030, 0.022, 0.018), vec3(0.008, 0.007, 0.010), ss(FLOORY, 0.9, p.y)) + pal(0.08) * 0.02;
  // a lattice of stars on the far wall
  vec2 w = p * 5.0;
  vec2 wf = abs(fract(w) - 0.5);
  float girih = min(min(abs(wf.x - wf.y), abs(wf.x + wf.y - 0.5)), min(wf.x, wf.y));
  col += vec3(0.20, 0.15, 0.10) * (1.0 - ss(0.0, 0.02, girih)) * 0.10 * ss(FLOORY + 0.2, 0.8, p.y);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 lp = vec2((fi / 6.0 - 0.5) * aspect * 1.7, 0.72 - 0.10 * abs(fi - 3.0) / 3.0 + 0.005 * sin(uTime + fi));
    float band = spec(0.03 + fi / 6.0 * 0.75);
    vec2 lv = (p - lp) * vec2(1.0, 0.8);
    col += mix(vec3(1.0, 0.70, 0.35), pal(0.08 + fi * 0.04), 0.3) * ((0.0009 / (dot(lv, lv) + 0.0012)) * (0.25 + 1.6 * band) + (1.0 - ss(0.020, 0.026, length(lv))) * (0.4 + band));
    col = mix(col, vec3(0.01), (1.0 - ss(0.0008, 0.002, abs(p.x - lp.x))) * step(lp.y + 0.02, p.y) * 0.8);
  }
  // the semazens: four in an arc behind, one in front
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    bool lead = i == 4;
    float ang = (fi / 3.0 - 0.5) * 2.0;
    vec2 foot = lead ? vec2(0.0, FLOORY - 0.16) : vec2(sin(ang) * aspect * 0.62, FLOORY + 0.06 - 0.05 * cos(ang));
    float s = lead ? 1.05 : 0.62;
    vec4 d = semazen(p, foot, s, spinT * (0.9 + 0.07 * fi) + fi * 1.3, flare);
    d.rgb *= (lead ? 1.0 : 0.62) * (0.55 + 0.6 * uLevel + 0.2 * uBeat * uPunch);
    d.rgb *= mix(vec3(1.0, 0.86, 0.68), vec3(1.0), 0.4);                          // lamp light is warm
    col = mix(col, d.rgb, d.a);
  }
  return col;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float spinT = uTravel * 0.55;
  float flare = clamp(0.25 + 1.1 * uLevel, 0.0, 1.0);
  vec3 col;
  if (p.y >= FLOORY) {
    col = hall(p, aspect, spinT, flare);
  } else {
    // the floor: boards, a soft mirror, and a ring of light from the beat
    float dp = FLOORY - p.y;
    vec3 boards = vec3(0.055, 0.035, 0.022) * (0.7 + 0.3 * noise(vec2(p.x * 3.0, dp * 60.0))) * (0.8 + 0.2 * step(0.04, fract(p.x * 2.2 / (0.6 + dp))));
    vec3 refl = hall(vec2(p.x, FLOORY + dp * 0.9), aspect, spinT, flare);
    vec3 fl = boards + refl * 0.22 * (1.0 - ss(0.0, 0.5, dp));
    float ring = length(vec2(p.x, (p.y - (FLOORY - 0.16)) * 3.2)) - uBeatAge * 1.2;
    fl += pal(0.08) * exp(-ring * ring * 60.0) * exp(-uBeatAge * 2.2) * 0.25 * uPunch;
    // the lead semazen stands on the floor, so he is drawn over it
    vec4 d = semazen(p, vec2(0.0, FLOORY - 0.16), 1.05, spinT * (0.9 + 0.28) + 4.0 * 1.3, flare);
    d.rgb *= (0.55 + 0.6 * uLevel + 0.2 * uBeat * uPunch) * mix(vec3(1.0, 0.86, 0.68), vec3(1.0), 0.4);
    col = mix(fl, d.rgb, d.a);
  }
  col *= 1.0 - 0.4 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'sema',
  name: 'Sema',
  group: 'Vibe',
  blurb: 'Five whirling dervishes; skirts flare with the level, hall lamps show the bands',
  tags: ['turkish', 'calm', 'organic'],
  energy: 0.35,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
