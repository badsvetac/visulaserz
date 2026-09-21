// FLYBY — threading between planets at arm's length.
//
// The ship follows a winding path; two planets per 16-unit path segment are scattered around
// it and, when one would sit on the route, pushed out to exactly "rad + a little" so every pass
// is close but never a collision. The camera looks along the path tangent and leans into the
// turns. Near misses light up a bass-driven atmospheric halo; the sun is in frame with ghosts
// and an anamorphic streak; beats punch the lens.
const frag = `
const float SEG = 16.0;

vec3 pathAt(float z) {
  return vec3(6.0 * sin(z * 0.05) + 3.0 * sin(z * 0.013 + 2.0), 4.0 * cos(z * 0.037 + 1.0), z);
}

void planetOf(float k, float j, out vec3 center, out float rad, out float seed) {
  seed = k * 3.1 + j * 17.7;
  rad = 1.5 + hash11(seed + 0.3) * 3.5;
  float z = k * SEG + hash11(seed + 0.7) * SEG;
  vec2 lat = (vec2(hash11(seed + 1.1), hash11(seed + 1.9)) - 0.5) * 26.0;
  vec3 pp = pathAt(z);
  vec2 d = lat - pp.xy;
  float margin = rad + 1.3 + hash11(seed + 2.3) * 2.5;
  if (length(d) < margin) lat = pp.xy + normalize(d + vec2(0.01, 0.02)) * margin;
  center = vec3(lat, z);
}

void main() {
  vec2 p = centered();
  p *= 1.0 - uBeat * 0.04 * uPunch;
  float z0 = uTravel * 7.0;
  vec3 ro = pathAt(z0);
  vec3 fwd = normalize(pathAt(z0 + 4.0) - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  float bank = -(pathAt(z0 + 6.0).x - pathAt(z0 - 6.0).x) * 0.03 + uBalance * 0.1;
  vec2 pb = rot(bank) * p;
  vec3 rd = normalize(fwd * 1.25 + right * pb.x + up * pb.y);      // wide lens
  // The sun sits well off to the left so the planets we thread between are side-lit, not
  // silhouettes; it swings into the frame only when the route bends toward it.
  vec3 sunDir = normalize(vec3(-0.8, 0.4, 0.35));
  float sd = max(dot(rd, sunDir), 0.0);

  // background: drifting gas in direction space, distant stars
  float az = atan(rd.x, rd.z);
  vec3 col = vec3(0.003, 0.004, 0.01);
  float n1 = fbm(vec2(az * 1.6, rd.y * 2.2) + vec2(uTime * 0.01, 0.0));
  float n2 = fbm(vec2(az * 3.5 + 7.0, rd.y * 4.0) - vec2(0.0, uTime * 0.008));
  col += pal(0.7 + n1 * 0.4) * ss(0.45, 0.8, n1) * 0.14 * (0.5 + uMid);
  col += pal(0.2 + n2 * 0.3) * ss(0.55, 0.85, n2) * 0.08 * (0.5 + uMid);
  vec2 sg = vec2(az * 80.0, rd.y * 160.0);
  vec2 sc = floor(sg);
  float sh = hash21(sc);
  vec2 sf = fract(sg) - 0.5 - (vec2(hash21(sc + 2.2), hash21(sc + 4.4)) - 0.5) * 0.8;
  col += vec3(0.9, 0.95, 1.0) * step(0.94, sh) * (0.0012 / (dot(sf, sf) + 0.002)) * (0.5 + 0.5 * sin(uTime * 2.5 + sh * 70.0)) * (0.6 + uHigh * 0.9);

  // planets: one segment behind, eleven ahead (so they fade in from the dark, never pop), two per segment
  float k0 = floor(z0 / SEG);
  float tBest = 1e9, bestRad = 1.0, bestSeed = 0.0;
  vec3 bestCenter = vec3(0.0);
  vec3 halo = vec3(0.0);
  for (int i = -1; i < 12; i++) {
    for (int j = 0; j < 2; j++) {
      vec3 c;
      float rad, seed;
      planetOf(k0 + float(i), float(j), c, rad, seed);
      vec3 oc = ro - c;
      float b = dot(oc, rd);
      float perp2 = dot(oc, oc) - b * b;
      if (perp2 < rad * rad) {
        float t = -b - sqrt(rad * rad - perp2);
        if (t > 0.0 && t < tBest) { tBest = t; bestCenter = c; bestRad = rad; bestSeed = seed; }
      } else if (b < 0.0) {
        // a near miss: the atmosphere we skim past glows, and breathes with the bass
        float miss = sqrt(perp2) - rad;
        halo += pal(hash11(seed + 6.6) * 0.9) * exp(-miss / (rad * 0.35)) * (0.25 + uBass * 0.6) * exp(b * 0.02) * (1.0 - ss(110.0, 175.0, -b));
      }
    }
  }

  bool hit = tBest < 1e8;
  if (hit) {
    vec3 pos = ro + rd * tBest;
    vec3 n = normalize(pos - bestCenter);
    float type = hash11(bestSeed + 5.5);
    vec3 tint = pal(hash11(bestSeed + 6.6) * 0.9);
    vec2 uv = vec2(atan(n.z, n.x) * 2.0, n.y * 3.0);
    vec3 albedo;
    float shine;
    if (type < 0.55) {
      // rocky moon: broad terrain plus crater floors
      float f1 = fbm(uv * 1.5 + bestSeed);
      float f2 = fbm(uv * 5.0 + bestSeed * 0.7);
      float craters = ss(0.58, 0.78, f2) * 0.55;
      albedo = mix(vec3(0.36, 0.34, 0.31), tint, 0.35) * (0.45 + 0.7 * f1) * (1.0 - craters);
      shine = 0.2;
    } else {
      // gas giant: bands that drift with the music
      float bands = fbm(vec2(uv.x * 0.5 + uTravel * 0.05, uv.y * 3.0) + bestSeed);
      albedo = mix(tint * 0.5, tint * 1.3, bands);
      shine = 0.6;
    }
    float ndl = dot(n, sunDir);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    float spec = pow(max(dot(reflect(rd, n), sunDir), 0.0), 30.0) * shine * (0.4 + uHigh);
    vec3 body = albedo * (max(ndl, 0.0) * 1.4 + 0.12) + vec3(spec);
    body += albedo * pal(0.6) * max(dot(n, -sunDir), 0.0) * 0.25;                       // fill light from the gas behind us
    body += tint * fres * (0.35 + uMid * 0.8 + uBeat * 0.6 * uPunch) * ss(-0.4, 0.2, ndl);
    col = mix(body, col, max(1.0 - exp(-tBest * 0.012), ss(110.0, 175.0, tBest)));
  } else {
    col += vec3(1.0, 0.96, 0.9) * (pow(sd, 2500.0) * 6.0 + pow(sd, 40.0) * 0.5 + pow(sd, 5.0) * 0.07) * (0.8 + uBass * 0.5);
  }
  col += halo;

  // lens: ghosts on the line through the centre, plus an anamorphic streak
  vec3 sv = vec3(dot(sunDir, right), dot(sunDir, up), dot(sunDir, fwd));
  if (sv.z > 0.2) {
    vec2 sunS = sv.xy / sv.z * 1.25;
    float inView = 1.0 - ss(1.6, 3.2, length(sunS));
    for (int g = 1; g <= 3; g++) {
      float fg = float(g);
      vec2 gp = -sunS * (0.3 * fg);
      float gr = 0.03 + 0.045 * fg;
      col += pal(0.15 + fg * 0.25) * (1.0 - ss(gr - 0.012, gr + 0.012, length(pb - gp))) * 0.06 * inView * (0.6 + uBeat * 0.6 * uPunch);
    }
    float dy = pb.y - sunS.y;
    col += vec3(0.7, 0.8, 1.0) * exp(-dy * dy * 400.0) * exp(-abs(pb.x - sunS.x) * 1.5) * 0.12 * inView;
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'flyby',
  name: 'Flyby',
  group: 'Journey',
  blurb: 'Threading close between sunlit planets, bass lighting their atmospheric halos',
  tags: ['space', '3d'],
  energy: 0.5,
  particles: 1,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
