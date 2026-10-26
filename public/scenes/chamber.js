// CHAMBER — a bubble chamber photograph, one collision per beat.
//
// In a bubble chamber a charged particle leaves a line of tiny bubbles in superheated liquid, and
// a magnet bends every track into a circle whose radius is the particle's momentum: fast ones are
// nearly straight, slow ones curl tight, and electrons, losing energy as they go, wind inward in
// spirals. Neutral particles leave no trace until they decay into a pair of opposite charges — the
// famous "V". Heavy tracks kick out electrons of their own, the small curls called delta rays.
//
// Here the beam comes in from the left and every beat is a collision somewhere along it: a vertex
// throws out a spray of tracks bending both ways, sometimes a V appears a little way off, an
// electron spirals in. The last six events stay on the film, their bubbles growing as the chamber
// expands and fading as it recompresses. The bass lights the newest event, the treble brings out
// more delta rays, the level makes the beam brighter. Tracks are not lines but chains of bubbles,
// each found analytically — arcs of circles and logarithmic spirals — so nothing is sampled.
const frag = `
const float BUBBLE = 0.0046;          // spacing of bubbles along a track

// Bubbles along a track at arc length s: most places have one, some are missed.
float bubbles(float s, float seed) {
  float i = floor(s / BUBBLE);
  float f = fract(s / BUBBLE) - 0.5 - (hash11(i + seed) - 0.5) * 0.4;
  return step(0.22, hash11(i * 1.7 + seed * 3.1)) * exp(-f * f * 40.0);
}

// Distance to a circular track from vertex v, heading th, signed curvature k (1/radius), length len.
float arcTrack(vec2 p, vec2 v, float th, float k, float len, out float s) {
  vec2 dir = vec2(cos(th), sin(th));
  vec2 n = vec2(-dir.y, dir.x);
  float R = 1.0 / k;
  vec2 c = v + n * R;
  vec2 a = v - c, b = p - c;
  float a0 = atan(a.y, a.x), ap = atan(b.y, b.x);
  float swept = k > 0.0 ? mod(ap - a0 + TAU, TAU) : mod(a0 - ap + TAU, TAU);
  s = swept * abs(R);
  if (s > len) {                                                    // past its end: the end is the nearest bit
    s = 0.0;
    return 1e3;
  }
  return abs(length(b) - abs(R));
}

// Distance to an inward logarithmic spiral: it starts at v, heading th, turning with sign w, and its
// radius shrinks by exp(-b) per radian travelled round its centre.
float spiral(vec2 p, vec2 v, float th, float w, float r0, float b, out float s) {
  vec2 dir = vec2(cos(th), sin(th));
  vec2 n = vec2(-dir.y, dir.x) * w;
  vec2 c = v + n * r0;
  vec2 a = v - c, q = p - c;
  float a0 = atan(a.y, a.x), aq = atan(q.y, q.x);
  float phi0 = w > 0.0 ? mod(aq - a0 + TAU, TAU) : mod(a0 - aq + TAU, TAU);
  float rq = length(q);
  // which turn of the spiral is nearest to this radius
  float m = floor((log(r0 / max(rq, 1e-4)) / b - phi0) / TAU + 0.5);
  m = clamp(m, 0.0, 4.0);
  float phi = phi0 + m * TAU;
  float r = r0 * exp(-b * phi);
  s = (r0 - r) / b;
  return abs(rq - r) + step(r, 0.004) * 1e3;
}

float track(float d, float s, float seed, float width) {
  return (1.0 - ss(width * 0.4, width, d)) * bubbles(s, seed);
}

float beamY(float x, float j) { return -0.52 + j * 0.26 + 0.05 * x * x * (0.6 + 0.4 * j) ; }

void main() {
  vec2 p = centered() * (1.0 + 0.01 * uBeat * uPunch);
  float aspect = uRes.x / uRes.y;
  float rChamber = length(p * vec2(0.62, 1.0));
  vec3 film = vec3(0.012, 0.018, 0.028) + pal(0.6) * 0.012;
  film *= 0.85 + 0.3 * noise(p * 4.0);
  vec3 col = film;
  float ink = 0.0;                                                  // bubble light, before colouring
  vec3 tint = vec3(0.0);

  // the beam: five nearly straight tracks crossing the whole chamber
  for (int j = 0; j < 5; j++) {
    float fj = float(j);
    float y = beamY(p.x, fj);
    float slope = 0.1 * p.x * (0.6 + 0.4 * fj);
    float d = abs(p.y - y) / sqrt(1.0 + slope * slope);
    float t = track(d, p.x + 2.0, fj * 11.0 + 1.0, 0.0028);
    ink += t * (0.45 + 0.6 * uLevel);
    // delta rays: little curls kicked out along the beam, more of them with the treble
    for (int k = 0; k < 3; k++) {
      float h = hash11(fj * 7.0 + float(k) * 3.3 + floor(uBeatCount / 4.0) * 0.37);
      if (h > 0.25 + 0.75 * uHigh) continue;
      float x0 = -1.3 + 2.6 * hash11(h * 13.1 + float(k));
      float sd;
      float dd = spiral(p, vec2(x0, beamY(x0, fj)), 1.2 + h * 1.5, h > 0.5 ? 1.0 : -1.0, 0.018 + 0.03 * h, 0.35, sd);
      ink += track(dd, sd, h * 91.0, 0.0022) * 0.7 * step(sd, 0.2);
    }
  }

  // the collisions: the newest six, older ones fading as the chamber recompresses
  for (int e = 0; e < 6; e++) {
    float fe = float(e);
    float n = uBeatCount - fe;
    if (n < 0.5) break;
    float age = fe * 0.5 + uBeatAge;
    float life = exp(-age * 0.55) * (e == 0 ? 1.0 + 1.2 * uBass : 1.0);
    float grow = 0.0018 + 0.0020 * (1.0 - exp(-age * 5.0));         // bubbles grow as the chamber expands
    float j = floor(hash11(n * 1.3) * 5.0);
    float vx = -0.9 + 1.5 * hash11(n * 2.9);
    vec2 v = vec2(vx, beamY(vx, j));
    float event = 0.0;
    int count = 3 + int(hash11(n * 4.1) * 6.0);
    for (int i = 0; i < 9; i++) {
      if (i >= count) break;
      float fi = float(i);
      float h1 = hash11(n * 5.3 + fi * 1.7), h2 = hash11(n * 7.1 + fi * 2.3), h3 = hash11(n * 9.7 + fi * 3.1);
      float th = (h1 - 0.5) * 2.4 + (h1 > 0.9 ? PI : 0.0);          // mostly forward, now and then backward
      float sgn = h2 > 0.5 ? 1.0 : -1.0;
      float s;
      float d;
      float k = mix(0.25, 7.0, h3 * h3);                            // curvature is 1/momentum: most tracks fast, a few slow
      if (h3 > 0.84 || k > 3.2) {
        // slow ones lose their energy as they go, so they wind inward instead of closing a circle
        d = spiral(p, v, th, sgn, 1.0 / k, 0.14 + 0.12 * h1, s);
      } else {
        d = arcTrack(p, v, th, sgn * k, min(mix(0.4, 2.2, h2), 1.15 * PI / k), s);
      }
      event += track(d, s, n * 3.0 + fi * 17.0, grow * 1.5);
    }
    // a V: something neutral flew off unseen and decayed into a pair of opposite charges
    if (hash11(n * 11.3) > 0.45) {
      float th = (hash11(n * 12.7) - 0.5) * 1.4;
      vec2 dpos = v + vec2(cos(th), sin(th)) * (0.18 + 0.25 * hash11(n * 13.9));
      float open = 0.25 + 0.3 * hash11(n * 15.1);
      float s1, s2;
      float d1 = arcTrack(p, dpos, th + open, 1.4, 0.9, s1);
      float d2 = arcTrack(p, dpos, th - open, -1.6, 0.9, s2);
      event += track(d1, s1, n * 5.0 + 1.0, grow * 1.5) + track(d2, s2, n * 5.0 + 2.0, grow * 1.5);
    }
    // the vertex itself: a knot of bubbles
    event += exp(-dot(p - v, p - v) * 9000.0) * 1.5;
    ink += event * life * 1.25;
    tint += pal(0.5 + hash11(n * 3.7) * 0.3) * event * life;
  }

  vec3 light = mix(vec3(0.85, 0.93, 1.0), tint / max(ink, 1e-3), 0.35);
  col += light * ink * 0.9;

  // fiducial crosses etched in the chamber windows, and the window's edge
  vec2 g = abs(fract(p / 0.4 + 0.5) - 0.5) * 0.4;
  float fiducial = (1.0 - ss(0.0, 0.0018, min(g.x, g.y))) * step(max(g.x, g.y), 0.022);
  col += vec3(0.35, 0.4, 0.45) * fiducial * 0.45;
  float edge = ss(0.93, 0.96, rChamber);
  col = mix(col, vec3(0.006, 0.007, 0.009), edge);
  // the flange: a ring of bolts round the window
  float ang = atan(p.y, p.x * 0.62);
  vec2 bolt = vec2(fract(ang / TAU * 36.0) - 0.5, (rChamber - 1.0) * 6.0);
  col += vec3(0.08, 0.08, 0.09) * (1.0 - ss(0.12, 0.2, length(bolt))) * step(0.96, rChamber);
  // dust and scratches on the film
  col += vec3(0.2) * step(0.9994, hash21(floor(p * 700.0))) * 0.5;
  col += vec3(0.05) * (1.0 - ss(0.0, 0.001, abs(p.x - 0.37 - 0.02 * sin(p.y * 3.0)))) * step(abs(p.y), 0.8);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'chamber',
  name: 'Chamber',
  group: 'Lab',
  blurb: 'A bubble chamber photograph: every beat is a collision, tracks curling in the magnetic field',
  tags: ['science', 'abstract', 'retro'],
  energy: 0.5,
  particles: 0,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
};
