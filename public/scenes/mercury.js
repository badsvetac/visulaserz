// MERCURY — liquid metal in a photo studio.
//
// Six blobs of chrome, one band each, orbiting on the travel clock and melting into each other
// through a smooth minimum. There is nothing to see on chrome except what it reflects, so the
// "room" is a handful of softboxes in the palette's colours; the blobs swell with their bands and
// a beat throws them apart for a moment before surface tension pulls them back.
const frag = `
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

vec4 gBalls[6];                                  // centre + radius, worked out once per pixel instead of once per march step

void placeBalls() {
  float fling = 0.55 * exp(-uBeatAge * 3.5) * uPunch;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a = uTravel * (0.10 + 0.035 * fi) + fi * 1.9;
    float b = uTravel * 0.07 + fi * 2.7;
    vec3 c = vec3(cos(a) * cos(b * 0.7), sin(b) * 0.55, sin(a) * cos(b * 0.7)) * (0.55 + 0.25 * sin(fi * 3.0 + uTime * 0.3) + fling);
    gBalls[i] = vec4(c, 0.26 + 0.30 * spec(0.03 + fi / 5.0 * 0.75) + 0.05 * sin(uTime * 1.3 + fi));
  }
}

float map(vec3 q) {
  float d = 1e3;
  for (int i = 0; i < 6; i++) d = smin(d, length(q - gBalls[i].xyz) - gBalls[i].w, 0.45);
  return d;
}

// What the chrome sees: a dark studio with softboxes.
vec3 studio(vec3 d) {
  vec3 col = mix(vec3(0.010, 0.010, 0.014), vec3(0.06, 0.06, 0.08), ss(-0.4, 1.0, d.y));
  col += vec3(1.0, 0.98, 0.95) * ss(0.78, 0.86, d.y) * 2.2;                                            // the overhead bank
  col += pal(0.08) * ss(0.80, 0.90, d.x) * ss(-0.5, 0.0, d.y) * (1.0 - ss(0.3, 0.6, d.y)) * 2.6;      // a strip light either side
  col += pal(0.58) * ss(0.80, 0.90, -d.x) * ss(-0.5, 0.0, d.y) * (1.0 - ss(0.3, 0.6, d.y)) * 2.6;
  col += pal(0.85) * ss(0.90, 0.97, -d.z) * ss(-0.2, 0.2, d.y) * 1.4 * (0.4 + uLevel);                 // a kicker from behind
  col += vec3(0.05, 0.05, 0.06) * ss(0.0, -0.6, d.y);
  return col;
}

void main() {
  vec2 p = centered() * (1.0 - uBeat * 0.03 * uPunch);
  placeBalls();
  float ca = uTime * 0.12 + uBalance * 0.3;
  vec3 ro = vec3(sin(ca) * 3.4, 0.5 + 0.3 * sin(uTime * 0.17), -cos(ca) * 3.4);
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.7 + rt * p.x + up * p.y);

  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 64; i++) {
    float d = map(ro + rd * t);
    if (d < 0.002) { hit = true; break; }
    t += d * 0.9;
    if (t > 8.0) break;
  }

  vec3 col = studio(rd) * 0.35;
  col = mix(col, vec3(0.006, 0.006, 0.009), 0.55);                                   // the backdrop stays darker than the reflections
  if (hit) {
    vec3 q = ro + rd * t;
    vec2 e = vec2(0.004, 0.0);
    vec3 n = normalize(vec3(map(q + e.xyy) - map(q - e.xyy), map(q + e.yxy) - map(q - e.yxy), map(q + e.yyx) - map(q - e.yyx)));
    vec3 rf = reflect(rd, n);
    float fres = 0.55 + 0.45 * pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col = studio(rf) * fres * (0.9 + 0.4 * uLevel);
    col += pal(0.1) * 0.04;
  } else {
    // a soft shadow pooled on the floor under the metal
    float fy = -1.25;
    if (rd.y < 0.0) {
      vec3 fp = ro + rd * ((fy - ro.y) / rd.y);
      col *= 1.0 - 0.6 * exp(-dot(fp.xz, fp.xz) * 0.9);
      col += (pal(0.08) + pal(0.58)) * 0.015 * exp(-dot(fp.xz, fp.xz) * 0.25) * (0.5 + uLevel);
    }
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'mercury',
  name: 'Mercury',
  group: 'Things',
  blurb: 'Six blobs of chrome melting together; a beat throws them apart',
  tags: ['abstract', 'organic', '3d'],
  energy: 0.55,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
