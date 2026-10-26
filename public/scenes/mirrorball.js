// MIRRORBALL — a club, a mirror ball, three pin spots and a lit dance floor.
//
// The spots that sweep the walls are worked out the way the light really makes them. A patch of
// wall at direction d from the ball is lit by a spotlight at direction l only if some facet of the
// ball is turned to bounce one into the other — that is, if a facet's normal lies along the half
// vector h = normalize(d + l). The ball is tiled like the real thing, rows of square mirrors whose
// count shrinks toward the poles, so each wall pixel asks which facet is nearest to h and how far
// off it is; within the spotlight's apparent size, the wall is lit. Turning the ball turns the
// whole field of spots, and the same test run through the haze between us and the wall draws the
// thin rays that fan out of the ball.
//
// The three spotlights listen to the bass, the mids and the treble, each in its own colour, so the
// spots of one colour swell with the kick while another colour shivers with the hats; every beat
// flashes them. The ball turns at the music's cruising speed. The floor is a grid of LED tiles
// whose pattern changes every eight beats: rings from the middle, the analyser, sparkle, checks.
const frag = `
const vec3 BALL = vec3(0.0, 2.45, 0.0);
const float BALL_R = 0.34;
const vec3 ROOM = vec3(4.4, 3.5, 4.4);       // walls at ±x, ±z; floor at 0, ceiling at y
const float ROWS = 22.0;
const float DLAT = PI / ROWS;
const float FOCAL = 1.15;

mat3 spinOf(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c); }

vec3 lightPos(int i) {
  if (i == 0) return vec3(-4.1, 3.3, -3.6);
  if (i == 1) return vec3(4.1, 3.2, -1.2);
  return vec3(0.6, 3.4, 4.1);
}
vec3 lightCol(int i) { return i == 0 ? pal(0.02) : (i == 1 ? pal(0.36) : pal(0.70)); }
float lightBand(int i) { return i == 0 ? uBass : (i == 1 ? uMid : uHigh); }
float flash() { return 1.0 + 0.9 * exp(-uBeatAge * 6.0) * uPunch; }

// The facet whose normal is nearest to n (both in the ball's own frame): its centre, and its cell.
vec3 facet(vec3 n, out vec2 cell, out vec2 local) {
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  float i = clamp(floor((lat + PI * 0.5) / DLAT), 0.0, ROWS - 1.0);
  float latC = -PI * 0.5 + (i + 0.5) * DLAT;
  float cols = max(1.0, floor(TAU * cos(latC) / DLAT));
  float w = TAU / cols;
  float j = floor((lon + PI) / w);
  float lonC = -PI + (j + 0.5) * w;
  cell = vec2(i, j);
  local = vec2((lon - lonC) / w, (lat - latC) / DLAT);            // -0.5 … 0.5 across the facet
  return vec3(cos(latC) * cos(lonC), sin(latC), cos(latC) * sin(lonC));
}

// Light the ball throws along direction d, as spots of angular size 'width'.
vec3 spots(vec3 d, float width, mat3 R) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 l = normalize(lightPos(i) - BALL);
    vec3 h = transpose(R) * normalize(d + l);
    vec2 cell, local;
    vec3 c = facet(h, cell, local);
    float ang = acos(clamp(dot(h, c), -1.0, 1.0));
    float s = 1.0 - ss(width * 0.45, width, ang);
    s *= 0.45 + 0.55 * hash21(cell + float(i) * 13.0);             // old mirrors: some throw a dimmer spot
    s *= ss(-0.92, -0.75, dot(d, l)) ;                                  // nothing comes back straight at the light
    col += lightCol(i) * s * (0.25 + 1.5 * lightBand(i));
  }
  return col * flash();
}

vec3 ledFloor(vec2 xz) {
  vec2 g = floor(xz / 0.62);
  vec2 f = fract(xz / 0.62);
  float edge = ss(0.0, 0.07, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float pattern = mod(floor(uBeatCount / 8.0), 4.0);
  float r = length(g + 0.5);
  float lit;
  vec3 c;
  if (pattern < 0.5) {                        // rings leaving the middle on every beat
    lit = exp(-abs(r - uBeatAge * 10.0) * 1.3) * exp(-uBeatAge * 1.2) + 0.08;
    c = pal(0.12 + r * 0.04);
  } else if (pattern < 1.5) {                 // the analyser, one band per column of tiles
    float band = spec(0.03 + clamp((g.x + 7.0) / 14.0, 0.0, 1.0) * 0.75);
    lit = step((-g.y + 1.0) / 8.0, band) * 0.9 + 0.05;
    c = pal(0.4 + (g.x + 7.0) / 14.0 * 0.4);
  } else if (pattern < 2.5) {                 // a scatter of tiles on every beat
    lit = step(0.72, hash21(g + uBeatCount * 7.3)) * (0.3 + 0.7 * exp(-uBeatAge * 2.5)) + 0.05;
    c = pal(hash21(g + uBeatCount) * 0.8);
  } else {                                    // checks that swap on the beat
    lit = mod(g.x + g.y + uBeatCount, 2.0) * (0.35 + 0.65 * exp(-uBeatAge * 4.0)) + 0.04;
    c = pal(0.8);
  }
  vec3 glass = vec3(0.012) + c * lit * edge * 0.75;
  return glass + vec3(0.02) * (1.0 - edge);   // the frames between tiles
}

// The room, seen along a ray from inside it: where it hits, what is there, and the normal.
float room(vec3 ro, vec3 rd, out vec3 n) {
  vec3 wall = vec3(rd.x > 0.0 ? ROOM.x : -ROOM.x, rd.y > 0.0 ? ROOM.y : 0.0, rd.z > 0.0 ? ROOM.z : -ROOM.z);
  vec3 t = (wall - ro) / rd;
  if (t.x < t.y && t.x < t.z) { n = vec3(-sign(rd.x), 0.0, 0.0); return t.x; }
  if (t.y < t.z) { n = vec3(0.0, -sign(rd.y), 0.0); return t.y; }
  n = vec3(0.0, 0.0, -sign(rd.z));
  return t.z;
}

void main() {
  vec2 p = centered();
  float orbit = uTime * 0.05 + uBalance * 0.08;
  vec3 ro = vec3(sin(orbit) * 2.9, 1.45 + 0.1 * sin(uTime * 0.13), -cos(orbit) * 2.9);
  vec3 fw = normalize(vec3(0.0, 2.15, 0.0) - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 rd = normalize(fw * FOCAL + rt * p.x + cross(fw, rt) * p.y);
  mat3 R = spinOf(uCruise * 0.35);

  vec3 n;
  float tw = room(ro, rd, n);
  // the ball, if it is in the way
  vec3 oc = ro - BALL;
  float b = dot(oc, rd);
  float disc = b * b - dot(oc, oc) + BALL_R * BALL_R;
  float tb = disc > 0.0 ? -b - sqrt(disc) : 1e9;
  float tEnd = min(tw, tb);

  vec3 col;
  // the chain the ball hangs from
  vec3 axisO = vec3(0.0, BALL.y + BALL_R, 0.0);
  vec2 w = ro.xz, v = rd.xz;
  float tc = -dot(w, v) / max(dot(v, v), 1e-5);
  float chainY = ro.y + rd.y * tc;
  float chain = (1.0 - ss(0.008, 0.016, length(w + v * tc))) * step(axisO.y, chainY) * step(chainY, ROOM.y) * step(tc, tEnd);
  if (tb < tw) {
    vec3 hp = ro + rd * tb;
    vec3 nb = normalize(hp - BALL);
    vec2 cell, local;
    vec3 c = facet(transpose(R) * nb, cell, local);
    vec3 nf = R * c;
    vec3 r = reflect(rd, nf);
    col = vec3(0.045) + pal(0.6) * 0.03 + vec3(0.06) * max(r.y, 0.0);
    // each facet that happens to point a spotlight at us flashes, and the rest twinkle as they turn
    for (int i = 0; i < 3; i++) {
      float a = acos(clamp(dot(r, normalize(lightPos(i) - hp)), -1.0, 1.0));
      col += lightCol(i) * exp(-a * a * 45.0) * (0.8 + 3.0 * lightBand(i)) * flash();
    }
    float twinkle = hash21(cell + floor(uCruise * 4.0));
    col += vec3(1.0) * pow(twinkle, 24.0) * 1.8 * (0.5 + uHigh);
    col += vec3(0.5, 0.55, 0.6) * pow(1.0 - max(dot(nb, -rd), 0.0), 3.0) * 0.25;   // a rim where the facets turn away
    col += (ledFloor(vec2(0.0)) * 0.6) * ss(0.0, -0.6, r.y);              // the floor's glow, seen in the mirrors
    float grout = min(0.5 - abs(local.x), 0.5 - abs(local.y));
    col *= ss(0.0, 0.08, grout) * 0.85 + 0.15;
  } else {
    vec3 hp = ro + rd * tw;
    vec3 d = normalize(hp - BALL);
    float dist = length(hp - BALL);
    vec3 light = spots(d, 0.020, R) * (3.0 / (1.0 + dist * dist * 0.12));
    if (n.y > 0.5) {
      col = ledFloor(hp.xz) + light * 0.5;
    } else {
      // velvet on the walls, darker panels on the ceiling
      float cloth = 0.7 + 0.3 * sin(dot(hp.xz, vec2(9.0, 9.0)) + hp.y * 0.5) * (1.0 - abs(n.y));
      col = vec3(0.010, 0.008, 0.012) * cloth + light * (n.y < -0.5 ? 0.6 : 0.9) * cloth;
    }
    // the spotlights themselves, where they hang
    for (int i = 0; i < 3; i++) {
      vec3 lp = lightPos(i);
      float dl = length(cross(lp - ro, rd));
      float along = dot(lp - ro, rd);
      col += lightCol(i) * step(0.0, along) * (0.0009 / (dl * dl + 0.0009)) * (0.6 + lightBand(i)) * flash();
    }
  }

  // haze: the rays out of the ball, and the three beams into it
  float jitter = hash21(gl_FragCoord.xy + fract(uTime) * 91.0);
  float stepLen = min(tEnd, 9.0) / 28.0;
  vec3 haze = vec3(0.0);
  for (int k = 0; k < 28; k++) {
    vec3 x = ro + rd * (float(k) + jitter) * stepLen;
    vec3 d = x - BALL;
    float dist = length(d);
    if (dist < BALL_R) continue;
    float dens = 0.55 + 0.45 * noise(x.xz * 0.9 + x.y * 0.7 + vec2(uTime * 0.05, 0.0));
    haze += spots(d / dist, 0.05, R) * dens / (1.0 + dist * dist * 0.35);
    for (int i = 0; i < 3; i++) {
      vec3 lp = lightPos(i);
      vec3 axis = normalize(BALL - lp);
      vec3 v = x - lp;
      float along = dot(v, axis);
      float off = length(v - axis * along);
      float cone = 0.06 + along * 0.05;
      haze += lightCol(i) * (1.0 - ss(cone * 0.6, cone, off)) * step(0.0, along) * step(along, length(BALL - lp)) * dens * 0.25 * (0.4 + lightBand(i)) * flash();
    }
  }
  col += haze * stepLen * 0.35;
  col = mix(col, vec3(0.02), chain * 0.9);
  col *= 1.0 - 0.3 * ss(0.9, 2.0, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'mirrorball',
  name: 'Mirrorball',
  group: 'Show',
  blurb: 'A mirror ball throws hundreds of spots through the haze; each spotlight colour is a band',
  tags: ['night', 'intense', '3d', 'light'],
  energy: 0.75,
  particles: 3,
  trails: 0.35,
  zoom: 1,
  spin: 0,
  frag,
};
