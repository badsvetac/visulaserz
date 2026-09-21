// VOYAGE — a flight through deep space, seen from the cockpit.
//
// Near stars live in log-polar space, where flying forward is a plain translation, so they
// streak outward and stretch with the bass. Cloud planes slide toward the ship and fade as we
// pass through them. Planets come from hashing the path segment index (six segments are
// evaluated: one behind that may still be passing us, five ahead so they fade in from the haze
// instead of popping). Beats launch shooting stars and a shockwave off the planet ahead; every
// 16th beat is a hyperspace jump. The cockpit is drawn last in ship space: the world banks
// inside a fixed frame, and the console's instruments read the music.
const frag = `
const float SEG = 70.0;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float starLayer(vec2 p, float speed, float scale, float len, float seed) {
  float r = length(p);
  float a = atan(p.y, p.x);
  vec2 lp = vec2(a / TAU * 48.0 + seed, log(r + 0.02) * scale - uTravel * speed);
  vec2 cell = floor(lp);
  vec2 f = fract(lp);
  float h = hash21(cell);
  vec2 sp = vec2(hash21(cell + 1.7), hash21(cell + 3.1)) * 0.7 + 0.15;
  float du = f.x - sp.x;
  float dv = f.y - sp.y;                       // stars move toward +v, so the tail is on the -dv side
  float tail = exp(-max(-dv, 0.0) * max(-dv, 0.0) / (len * len + 0.0004));
  float head = exp(-max(dv, 0.0) * max(dv, 0.0) * 600.0);
  float streak = exp(-du * du * 260.0) * tail * head;
  float bright = step(0.7, h) * (0.35 + 0.65 * hash21(cell + 9.2));
  return streak * bright * ss(0.0, 0.12, r);
}

vec3 nebula(vec2 p) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float z = fract(fi * 0.25 - uTravel * 0.02);          // 0 = at the ship, 1 = far ahead
    float depth = 0.3 + z * 6.0;
    vec2 uv = p * depth * 0.35 + vec2(fi * 7.3, fi * 3.1) + vec2(0.0, uTime * 0.01);
    float d = fbm(uv);
    float cloud = ss(0.4, 0.85, d);
    float fade = ss(0.0, 0.25, z) * (1.0 - ss(0.75, 1.0, z));
    col += pal(fi * 0.22 + d * 0.5 + uTime * 0.005) * cloud * fade * (0.16 + 0.35 * uMid);
  }
  return col;
}

// A shooting star for beat number n, alive for about a second after the beat lands.
vec3 meteor(vec2 p, float n, float age, float aspect) {
  if (age > 1.1) return vec3(0.0);
  float h1 = hash11(n * 3.7 + 0.3), h2 = hash11(n * 5.1 + 0.9), h3 = hash11(n * 7.9 + 0.1);
  vec2 start = vec2((h1 * 2.0 - 1.0) * aspect * 0.9, 0.25 + h2 * 0.75);
  vec2 dir = normalize(vec2(h3 > 0.5 ? 1.0 : -1.0, -0.3 - h2 * 0.5));
  vec2 head = start + dir * age * (1.6 + h1 * 1.4);
  vec2 tail = head - dir * (0.18 + 0.3 * min(age, 0.5));
  float d = sdSeg(p, tail, head);
  float along = clamp(dot(p - tail, dir) / length(head - tail), 0.0, 1.0);
  float fade = 1.0 - ss(0.5, 1.1, age);
  float glow = (0.0022 / (d + 0.0018)) * (0.15 + 0.85 * along) * fade + (0.004 / (length(p - head) + 0.004)) * fade;
  return mix(vec3(1.0), pal(0.9), 0.35) * glow;
}

// A round instrument: 270° dial, ten ticks, one needle.
float gauge(vec2 q, float value) {
  float r = length(q);
  float a2 = atan(q.x, q.y);
  float dial = (1.0 - ss(0.0, 0.004, abs(r - 0.11))) * 0.5 * step(abs(a2), 2.5);
  float tk = fract((a2 + 2.356) / 4.712 * 10.0);
  float ticks = (step(0.93, tk) + step(tk, 0.07)) * step(0.085, r) * step(r, 0.11) * step(abs(a2), 2.4) * 0.6;
  float na = -2.356 + clamp(value, 0.0, 1.0) * 4.712;
  float needle = 1.0 - ss(0.0, 0.0045, sdSeg(q, vec2(0.0), vec2(sin(na), cos(na)) * 0.095));
  return dial + ticks + needle;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float bank = sin(uTime * 0.17) * 0.06 + uBalance * 0.08;
  vec2 pw = rot(bank) * p * (1.0 - uBeat * 0.03 * uPunch);    // the world seen through the canopy
  vec3 ro = vec3(sin(uTime * 0.11) * 1.5, cos(uTime * 0.09) * 1.0, uTravel * 9.0);
  vec3 rd = normalize(vec3(pw, 1.6));
  // The sun sits just outside the frame, ahead-right, so planets we pass are three-quarter lit.
  vec3 sunDir = normalize(vec3(0.78, 0.36, 0.5));
  float sd = max(dot(rd, sunDir), 0.0);
  float jump = exp(-uBeatAge * 1.5) * (1.0 - step(0.5, mod(uBeatCount, 16.0))) * uPunch;

  vec3 col = vec3(0.004, 0.005, 0.012) + pal(0.62) * 0.03 * pow(sd, 3.0);
  col += nebula(pw);

  // distant stars: fixed in direction, twinkling with the highs
  vec2 sg = rd.xy / rd.z * 40.0;
  vec2 sc = floor(sg);
  float sh = hash21(sc);
  vec2 sf = fract(sg) - 0.5 - (vec2(hash21(sc + 2.2), hash21(sc + 4.4)) - 0.5) * 0.8;
  col += vec3(0.9, 0.95, 1.0) * step(0.93, sh) * (0.0012 / (dot(sf, sf) + 0.002)) * (0.5 + 0.5 * sin(uTime * 3.0 + sh * 70.0)) * (0.6 + uHigh * 0.9);

  // near stars streak past; bass, beats and the jump stretch them
  float len = 0.05 + uBass * 0.25 + uBeat * 0.35 * uPunch + jump * 0.6;
  float streaks = starLayer(pw, 2.2, 3.0, len, 0.0) + starLayer(pw, 1.4, 2.4, len * 0.7, 5.0) * 0.7;
  col += mix(vec3(1.0), pal(0.8), 0.35) * streaks * (0.7 + uHigh * 0.8 + jump * 1.5);

  // shooting stars on beats
  col += meteor(pw, uBeatCount, uBeatAge, aspect);
  if (hash11(uBeatCount * 1.7 + 0.2) > 0.45) col += meteor(pw, uBeatCount + 0.5, uBeatAge * 0.9, aspect);

  // planets: one segment behind (still passing us) to four ahead
  float k0 = floor(ro.z / SEG);
  float tBest = 1e9, bestRad = 1.0, bestSeed = 0.0;
  vec3 bestCenter = vec3(0.0);
  float tRing = 1e9, ringSeed = 0.0, ringRad = 1.0;
  vec3 ringCenter = vec3(0.0);
  float focusDist = 1e9, focusRad = 1.0;
  vec3 focusCenter = vec3(0.0);
  for (int i = -1; i < 5; i++) {
    float k = k0 + float(i);
    if (hash11(k * 1.31 + 0.7) < 0.3) continue;
    float rad = 2.0 + hash11(k * 7.1) * 7.0;
    vec2 dir2 = normalize(vec2(hash11(k * 2.1) - 0.5, hash11(k * 3.7) - 0.5) + 0.001);
    vec3 center = vec3(dir2 * (rad + 4.0 + hash11(k * 4.9) * 14.0), k * SEG + hash11(k * 5.3) * SEG);
    float ahead = center.z - ro.z;
    if (ahead > rad + 2.0 && ahead < focusDist) { focusDist = ahead; focusCenter = center; focusRad = rad; }
    vec3 oc = ro - center;
    float b = dot(oc, rd);
    float disc = b * b - (dot(oc, oc) - rad * rad);
    if (disc > 0.0) {
      float t = -b - sqrt(disc);
      if (t > 0.0 && t < tBest) { tBest = t; bestCenter = center; bestRad = rad; bestSeed = k; }
    }
    if (hash11(k * 9.3) > 0.55) {
      vec3 rn = normalize(vec3(0.2, 1.0, 0.15 + hash11(k * 6.1) * 0.4));
      float denom = dot(rd, rn);
      if (abs(denom) > 1e-4) {
        float t = dot(center - ro, rn) / denom;
        float rr = length(ro + rd * t - center);
        if (t > 0.0 && t < tRing && rr > rad * 1.35 && rr < rad * 2.4) { tRing = t; ringSeed = k; ringCenter = center; ringRad = rad; }
      }
    }
  }

  bool hit = tBest < 1e8;
  vec3 outCol = col;
  if (hit) {
    vec3 pos = ro + rd * tBest;
    vec3 n = normalize(pos - bestCenter);
    vec3 tint = pal(hash11(bestSeed * 11.7) * 0.9);
    float bands = fbm(vec2(atan(n.z, n.x) * 1.5 + uTravel * 0.12, n.y * 5.0 + bestSeed * 3.0));   // the planet turns with the music
    vec3 albedo = mix(tint * 0.45, tint * 1.25, bands);
    float ndl = dot(n, sunDir);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 body = albedo * (max(ndl, 0.0) * 1.3 + 0.1);
    body += tint * fres * (0.5 + uBass * 1.2 + uBeat * 0.8 * uPunch) * ss(-0.35, 0.2, ndl);      // the atmosphere breathes with the bass
    body += tint * pow(bands, 6.0) * (1.0 - ss(-0.2, 0.1, ndl)) * uMid * 0.6;                       // night-side lights flicker with the mids
    outCol = mix(body, col, 1.0 - exp(-tBest * 0.006));
    outCol = mix(col, outCol, 1.0 - ss(180.0, 320.0, tBest));                                        // fade in from the haze, never pop
  }
  if (tRing < tBest) {
    vec3 q = ro + rd * tRing;
    float rr = length(q - ringCenter) / ringRad;
    float band = 0.5 + 0.5 * sin(rr * 30.0 + ringSeed);
    float sparkle = noise(vec2(rr * 60.0 + uTime * 1.5, ringSeed + atan(q.x - ringCenter.x, q.z - ringCenter.z) * 6.0));
    float ringA = ss(1.35, 1.45, rr) * (1.0 - ss(2.25, 2.4, rr)) * (0.35 + 0.5 * band) * (0.45 + 0.55 * sparkle) * (0.7 + uHigh * 0.7);
    vec3 ringCol = pal(hash11(ringSeed * 11.7) * 0.9 + 0.1) * 0.9;
    outCol = mix(outCol, ringCol, ringA * exp(-tRing * 0.006) * (1.0 - ss(180.0, 320.0, tRing)));
  }
  if (!hit) {
    vec3 sunCol = mix(vec3(1.0, 0.95, 0.85), pal(0.05), 0.3);
    outCol += sunCol * (pow(sd, 1200.0) * 4.0 + pow(sd, 60.0) * 0.35 + pow(sd, 8.0) * 0.06) * (0.8 + uBass * 0.6);
  }

  // a shockwave rolls out of the planet ahead on every beat
  bool hasFocus = focusDist < 1e8;
  vec2 focusS = vec2(0.0);
  float focusPr = 0.0;
  if (hasFocus) {
    vec3 rel = focusCenter - ro;
    focusS = rel.xy / rel.z * 1.6;
    focusPr = focusRad / rel.z * 1.6;
    float ringR = focusPr * (1.1 + uBeatAge * 3.0);
    float ripple = exp(-uBeatAge * 2.2) * (0.004 / (abs(length(pw - focusS) - ringR) + 0.004));
    outCol += pal(0.2) * ripple * uPunch * (1.0 - ss(180.0, 320.0, focusDist));
  }
  outCol *= 1.0 + jump * 0.6;

  // ── cockpit, drawn in ship space so the world banks inside a steady frame ──
  vec3 hudCol = pal(0.5) * 0.6 + 0.3;
  float r = length(p);
  float ret = (1.0 - ss(0.0, 0.003, abs(r - 0.10))) * 0.35 + (1.0 - ss(0.0, 0.003, abs(r - 0.022))) * 0.3;
  float ang = atan(p.y, p.x);
  ret += step(abs(fract(ang / TAU * 8.0) - 0.5), 0.02) * step(0.10, r) * step(r, 0.13) * 0.4;
  vec2 hp = rot(bank) * p;
  float horizon = (1.0 - ss(0.0, 0.0025, abs(hp.y))) * step(0.14, abs(hp.x)) * step(abs(hp.x), 0.42) * 0.3;
  outCol += hudCol * (ret + horizon) * (0.7 + uBeat * 0.5);
  if (hasFocus) {
    vec2 d = abs(pw - focusS);
    float s = max(focusPr * 1.35, 0.05);
    float edge = max(d.x, d.y);
    float brk = (1.0 - ss(0.0, 0.003, abs(edge - s))) * step(s * 0.6, min(d.x, d.y)) * step(s, 0.9);
    outCol += hudCol * brk * (0.5 + 0.4 * sin(uTime * 5.0)) * (1.0 - ss(180.0, 320.0, focusDist));
  }

  // canopy: cabin walls outside the window, struts along its edge, glass darkening toward it
  float xe = aspect * (0.94 - 0.24 * (p.y + 0.5));
  float ax = abs(p.x);
  float wall = ss(xe, xe + 0.015, ax);
  float strut = 1.0 - ss(0.0, 0.024, abs(ax - xe));
  vec3 wallCol = vec3(0.012, 0.012, 0.018) + pal(0.5) * 0.05 * exp(-(ax - xe) * 6.0) * (0.5 + uLevel);
  vec3 strutCol = vec3(0.09, 0.09, 0.11) * (0.8 + 0.2 * (p.y + 1.0)) + pal(0.5) * 0.15 * (1.0 - ss(0.0, 0.008, abs(ax - xe + 0.01)));
  outCol *= 1.0 - 0.18 * ss(xe - 0.45, xe, ax);
  outCol = mix(outCol, wallCol, wall);
  outCol = mix(outCol, strutCol, strut);

  // console: spectrum strip, two gauges (speed, level) and beat lamps
  float dashY = -0.56 + 0.05 * cos(p.x * 2.0);
  float dash = ss(-0.006, 0.006, dashY - p.y);
  vec3 dashCol = vec3(0.018, 0.018, 0.024);
  dashCol += vec3(0.03) * (1.0 - ss(0.0, 0.004, abs(p.y - (dashY - 0.05))));
  dashCol += pal(0.5) * 0.04 * (1.0 - ss(0.0, 0.03, abs(p.y - dashY)));
  vec2 sp = vec2((p.x + 0.55) / 1.10, (p.y - (dashY - 0.34)) / 0.22);
  float inStrip = step(0.0, sp.x) * step(sp.x, 1.0) * step(0.0, sp.y) * step(sp.y, 1.0);
  float cell = floor(sp.x * 32.0);
  float fx = fract(sp.x * 32.0);
  float on = step(sp.y, spec((cell + 0.5) / 32.0 * 0.9)) * step(0.15, fx) * step(fx, 0.85) * step(0.12, fract(sp.y * 11.0)) * inStrip;
  dashCol += pal(0.05 + sp.y * 0.5) * on * 0.9 + pal(0.3) * 0.025 * inStrip;
  float gx = 0.64 + (aspect - 1.0) * 0.36;
  dashCol += hudCol * gauge(p - vec2(-gx, dashY - 0.2), 0.12 + uBass * 0.7 + jump * 0.3) * 0.8;
  dashCol += hudCol * gauge(p - vec2(gx, dashY - 0.2), uLevel) * 0.8;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float lamp = clamp(step(0.55 - fi * 0.1, spec(0.1 + fi * 0.2)) + uBeat * step(0.5, hash11(fi + uBeatCount)), 0.0, 1.0);
    float dl = 0.0035 / (length(p - vec2(-0.60 - fi * 0.045, dashY - 0.075)) + 0.004) + 0.0035 / (length(p - vec2(0.60 + fi * 0.045, dashY - 0.075)) + 0.004);
    dashCol += pal(0.1 + fi * 0.15) * dl * lamp * 0.8;
  }
  outCol = mix(outCol, dashCol, dash);
  outColor = vec4(outCol, 1.0);
}`;

export default {
  id: 'voyage',
  name: 'Voyage',
  group: 'Journey',
  blurb: 'Cockpit view of deep space; stars streak with the bass, hyperspace every 16 beats',
  tags: ['space', 'vehicle', '3d'],
  energy: 0.6,
  particles: 1,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
