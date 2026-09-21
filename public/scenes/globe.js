// GLOBE — a holographic planet on a mission-control display.
//
// The continents are a dot matrix and every dot is a city listening to its own band, so the
// land glitters with the mix. A ring of spectrum bars circles the equator like Saturn's, each
// beat pings a new place on the surface, three satellites keep their orbits, and the globe is
// see-through: the far side shows faintly behind the near one.
const frag = `
const float R = 0.78;

float landNoise(vec3 q) {
  return (noise(q.xy * 2.3 + 1.7) + noise(q.yz * 2.3 + 5.1) + noise(q.zx * 2.3 + 9.3)) / 3.0
       + 0.5 * ((noise(q.xy * 5.7) + noise(q.yz * 5.7 + 3.0) + noise(q.zx * 5.7 + 6.0)) / 3.0 - 0.5);
}

vec3 toGlobe(vec3 v, float spin) {
  v.yz = rot(-0.34) * v.yz;                 // the north pole leans toward the viewer, so the ring shows as an ellipse
  v.xy = rot(-0.41) * v.xy;                 // axial tilt
  v.xz = rot(spin) * v.xz;
  return v;
}
vec3 globeAxis() {
  vec3 v = vec3(0.0, 1.0, 0.0);
  v.xy = rot(0.41) * v.xy;
  v.yz = rot(0.34) * v.yz;
  return v;
}

// Light from one point of the surface. n: unit normal in the globe's own frame.
vec3 surface(vec3 n) {
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  float step15 = PI / 12.0;
  float gl = abs(fract(lat / step15 + 0.5) - 0.5) * step15;
  float gm = abs(fract(lon / step15 + 0.5) - 0.5) * step15 * cos(lat);
  vec3 col = pal(0.55) * ((1.0 - ss(0.0, 0.006, gl)) + (1.0 - ss(0.0, 0.006, gm))) * 0.20;

  float land = ss(0.50, 0.56, landNoise(n));
  vec2 dg = vec2(lon, lat) * 30.0;
  vec2 df = (fract(dg) - 0.5) * vec2(cos(lat), 1.0);
  float dots = 1.0 - ss(0.10, 0.26, length(df));
  float band = spec(fract(hash21(floor(dg)) * 5.3) * 0.8);
  col += pal(0.35 + band * 0.3) * dots * land * (0.22 + 1.7 * band);

  // the ping of the last beat spreads from a new place each time
  vec3 c1 = normalize(vec3(hash11(uBeatCount * 1.3 + 1.0), hash11(uBeatCount * 2.1 + 2.0), hash11(uBeatCount * 3.7 + 3.0)) * 2.0 - 1.0);
  float ad = acos(clamp(dot(n, c1), -1.0, 1.0)) - uBeatAge * 0.9;
  col += pal(0.1) * exp(-ad * ad * 900.0) * exp(-uBeatAge * 1.5) * 1.6 * uPunch;
  // a scanner sweeps the latitudes
  float sl = lat - sin(uTime * 0.5) * 1.2;
  col += pal(0.6) * exp(-sl * sl * 500.0) * 0.5;
  return col;
}

void main() {
  vec2 p = centered() * (1.0 + uBeat * 0.02 * uPunch);
  p.x -= uBalance * 0.06;
  vec3 ro = vec3(0.0, 0.0, -3.0);
  vec3 rd = normalize(vec3(p, 2.2));
  float spin = uTime * 0.12 + uTravel * 0.02;
  float len = length(p);
  float ang = atan(p.y, p.x);

  // backdrop: stars and the console's faint grid
  vec2 g = p * 50.0;
  vec2 gc = floor(g);
  float sh = hash21(gc);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
  vec3 col = vec3(0.8, 0.9, 1.0) * step(0.94, sh) * (0.0012 / (dot(sf, sf) + 0.002)) * (0.3 + uHigh);
  vec2 cg = abs(fract(p * 4.0) - 0.5);
  col += pal(0.55) * 0.035 * (1.0 - ss(0.0, 0.012, 0.5 - max(cg.x, cg.y)));

  float b = dot(ro, rd);
  float disc = b * b - (dot(ro, ro) - R * R);
  float t0 = 1e3;
  if (disc > 0.0) {
    float sq = sqrt(disc);
    t0 = -b - sq;
    vec3 nf = (ro + rd * t0) / R;
    vec3 nb = (ro + rd * (-b + sq)) / R;
    col += surface(toGlobe(nb, spin)) * 0.28 + surface(toGlobe(nf, spin));
    col += pal(0.55) * pow(1.0 - max(dot(nf, -rd), 0.0), 3.0) * (0.5 + uBass);       // atmosphere
    col += vec3(0.0, 0.01, 0.02);
  }
  col += pal(0.55) * exp(-max(len - R * 2.2 / 3.0, 0.0) * 9.0) * 0.10 * (0.5 + uLevel) * step(disc, 0.0);

  // the equatorial ring of spectrum bars
  vec3 axis = globeAxis();
  float denom = dot(rd, axis);
  if (abs(denom) > 1e-4) {
    float tp = -dot(ro, axis) / denom;
    vec3 hp = toGlobe(ro + rd * tp, spin * 0.5);
    float rr = length(hp.xz);
    float cell = (atan(hp.z, hp.x) / TAU + 0.5) * 96.0;
    float fa = abs(fract(cell / 96.0 * 2.0) * 2.0 - 1.0);             // mirrored so the ring closes without a seam
    float s = spec(0.02 + fa * 0.8);
    float bar = step(R * 1.22, rr) * step(rr, R * 1.22 + 0.03 + s * 0.42) * ss(0.12, 0.25, fract(cell)) * (1.0 - ss(0.75, 0.88, fract(cell)));
    float seen = (disc > 0.0 && tp > t0) ? 0.3 : 1.0;
    col += pal(0.05 + fa * 0.5) * bar * (0.35 + 1.3 * s) * seen * step(0.0, tp);
  }

  // satellites, each on its own inclined orbit with a short trail
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    for (int j = 0; j < 5; j++) {
      float a = uTime * (0.5 + 0.17 * fk) + fk * 2.1 - float(j) * 0.05;
      vec3 s = vec3(cos(a), 0.0, sin(a)) * (1.0 + 0.09 * fk);
      s.xy = rot(0.5 + fk * 0.9) * s.xy;
      if (s.z > 0.0 && length(s.xy) < R) continue;
      vec2 sv = p - s.xy * 2.2 / (s.z + 3.0);
      col += pal(0.1 + fk * 0.3) * (0.00005 / (dot(sv, sv) + 0.00003)) * (1.0 - float(j) / 5.0) * 0.6;
    }
  }

  // bezel: a ring, ticks every five degrees, and a level arc
  col += pal(0.55) * (1.0 - ss(0.0, 0.003, abs(len - 0.98))) * 0.5;
  col += pal(0.55) * ss(0.88, 0.96, abs(fract(ang / TAU * 72.0) - 0.5) * 2.0) * step(0.945, len) * step(len, 0.975) * 0.45;
  float arc = step(abs(mod(ang - PI * 0.5 + PI, TAU) - PI), PI * clamp(uLevel, 0.0, 1.0));   // grows from the top, both ways, with the level
  col += pal(0.1) * (1.0 - ss(0.0, 0.004, abs(len - 1.03))) * arc * 0.8;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'globe',
  name: 'Globe',
  group: 'Things',
  blurb: 'Holographic dot-matrix planet; cities glitter per band, beats ping the map',
  tags: ['space', '3d', 'science'],
  energy: 0.5,
  particles: 0,
  trails: 0.4,
  zoom: 1,
  spin: 0,
  frag,
};
