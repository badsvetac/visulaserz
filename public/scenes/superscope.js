// SUPERSCOPE — Winamp's AVS, the Advanced Visualization Studio, the other visualiser of those years.
//
// AVS (Justin Frankel, Nullsoft, 1999) was a box of parts stacked into a preset. Render parts drew
// onto the frame: Superscope, a curve whose points you wrote as small equations of the sample value
// v and the position i along it; Bass Spin, two triangles whirling with the bass; Oscilloscope Star;
// Ring; Moving Particle; Simple Spectrum. Trans parts then worked on the whole frame: Movement (fixed
// maps with names like "big swirl out", "tunneling", "sunburster"), Blur, Fadeout, Mirror, and on the
// way out Bump, Mosaic, Channel Shift, Interleave. The look was thin, hard, bright lines on black with
// short crisp trails, and presets did not melt into each other the way MilkDrop's did: AVS cut, with
// a transition such as a wipe or a block dissolve.
//
// Six presets built from those parts take turns every 16 beats. Each change is an AVS transition
// (a wipe across or down, nine random blocks, a dot dissolve, or out from the middle) in which every
// pixel belongs to either the old preset or the new one, movement and all, until the new one owns the
// screen. The frame is kept in the scene's memory, so Movement, Blur and Fadeout act on it every step
// exactly as they did in AVS; the picture pass adds the finishing trans effects.
//   Spin     — Bass Spin and a Ring, in a big swirl out.
//   Star     — an Oscilloscope Star; sparks thrown on the frame are streaked into a starfield by tunneling.
//   Spiral   — a Superscope spiral with its colour running along the curve, lit by Bump.
//   Particle — a Moving Particle that springs to a new spot on every beat, two bouncing scopes, Mosaic on the beat.
//   Mirror   — a Simple Spectrum mirrored four ways, beaming outward, Channel Shift on alternate beats.
//   Knot     — a Superscope torus knot turning in 3D, over a sunburster, through Interleave.
const shared = `
vec3 vivid3(vec3 c) { return c / max(max(c.r, c.g), max(c.b, 0.05)); }

const float SLOT = 16.0;
int presetOf(float slot) { return int(mod(slot * 5.0, 6.0) + 0.5) % 6; }   // steps of 5 visit all six

// Which preset owns this pixel. The new one takes the screen along its transition's pattern in a beat
// and a half; until then the rest still belongs to the old one.
int presetHere(vec2 uv) {
  float slot = floor(uBeatCount / SLOT);
  int now = presetOf(slot);
  if (slot < 0.5) return now;
  float into = mod(uBeatCount, SLOT) + min(uBeatAge / 0.5, 1.0);
  float progress = clamp(into / 1.5, 0.0, 1.0) * 1.01;
  float kind = floor(hash11(slot * 7.7 + 1.3) * 5.0);
  float pat = kind < 0.5 ? uv.x                                                      // wipe, left to right
            : kind < 1.5 ? 1.0 - uv.y                                                // wipe, top to bottom
            : kind < 2.5 ? hash21(floor(uv * 3.0) + slot)                            // nine random blocks
            : kind < 3.5 ? hash21(floor(uv * vec2(240.0, 135.0)) + slot * 13.0)     // dot dissolve
            : abs(uv.x - 0.5) * 2.0;                                                 // out from the middle
  return pat < progress ? now : presetOf(slot - 1.0);
}
`;

const sim = `${shared}
float sampleV(float i) { return texelFetch(uAudio, ivec2(int(i * 511.0), 1), 0).r * 2.0 - 1.0; }

float sdTri(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 e0 = b - a, e1 = c - b, e2 = a - c;
  vec2 v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

// Trans / Movement: where each pixel of the new frame is taken from in the last one (distance d,
// angle r, as AVS wrote them). Taking from nearer the middle makes the picture flow outward.
vec2 movement(int m, vec2 q) {
  float d = length(q), r = atan(q.y, q.x), t = uTime;
  if (m == 0) { r += 0.1 - 0.2 * d / 1.6; d *= 0.965; }                           // big swirl out
  else if (m == 1) { d *= 0.935 + 0.02 * sin(r * 5.0 + t * 1.3); }               // tunneling
  else if (m == 2) { d *= 0.955 + 0.035 * cos(r * 12.0 + t * 0.8); }             // sunburster
  else if (m == 3) { d = d * 0.975 - 0.002 * (1.0 + sin(d * 18.0 - t * 3.0)); }  // bubbling outward
  else if (m == 4) { d *= 0.97 + 0.025 * sin(d * 28.0 - t * 5.0); r += 0.004; } // psychotic beaming outward
  else { r += 0.022; d *= 0.99; }                                                 // rotate, sinking in
  return d * vec2(cos(r), sin(r));
}

// Superscope: a curve of 80 points, point i drawn from the sample v at i.
vec2 scopePoint(int kind, float i, float v, mat2 ra, mat2 rb) {
  if (kind == 0) {                                   // a spiral, three turns, breathing with the wave
    float rr = 0.06 + 0.86 * i + v * 0.09;
    float a = i * TAU * 3.0 + uTime * 0.9;
    return rr * vec2(cos(a), sin(a));
  }
  if (kind == 1) {                                   // a torus knot turning in 3D, its tube swollen by the wave
    float phi = i * TAU;
    float rr = 2.0 + cos(3.0 * phi) + v * 0.6;
    vec3 p = vec3(rr * cos(2.0 * phi), rr * sin(2.0 * phi), sin(3.0 * phi) * 1.4) * 0.3;
    p.xz = ra * p.xz;
    p.yz = rb * p.yz;
    return p.xy * (2.4 / (3.0 + p.z));
  }
  return vec2(0.35 + 0.3 * sin(uTime * 1.3) + v * 0.3, i * 2.1 - 1.05);   // a scope standing upright, bouncing
}
float superscope(int kind, vec2 q, float px, out float at) {
  mat2 ra = rot(uTime * 0.7), rb = rot(uTime * 0.43);
  float best = 1e9;
  at = 0.0;
  vec2 prev = scopePoint(kind, 0.0, sampleV(0.0), ra, rb);
  for (int k = 1; k <= 80; k++) {
    float i = float(k) / 80.0;
    vec2 cur = scopePoint(kind, i, sampleV(i), ra, rb);
    vec2 pa = q - prev, ba = cur - prev;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float d = length(pa - ba * h);
    if (d < best) { best = d; at = i - (1.0 - h) / 80.0; }
    prev = cur;
  }
  return 1.0 - ss(0.5 * px, 1.3 * px, best);
}

// Bass Spin: two triangles whirling round the middle, the left channel's and the right's, each as long
// as its bass. They turn on the travel clock, so they spin faster when the music is louder.
vec3 bassSpin(vec2 q, float px) {
  vec3 col = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float side = k == 0 ? -1.0 : 1.0;
    float a = uTravel * 2.2 + float(k) * PI;
    float len = 0.15 + 0.75 * uBass * (1.0 + 0.5 * side * uBalance);
    vec2 p1 = len * vec2(cos(a), sin(a)), p2 = len * vec2(cos(a + 0.3), sin(a + 0.3));
    float d = sdTri(q, vec2(0.0), p1, p2);
    vec3 c = vivid3(pal(0.05 + float(k) * 0.5 + uTime * 0.05));
    // drawn as AVS drew it in line mode: a hard outline, with a faint fill
    col = max(col, c * ((1.0 - ss(0.4 * px, 1.3 * px, abs(d))) + 0.18 * step(d, 0.0)));
  }
  return col;
}

// Oscilloscope Star: five arms, the waveform drawn across each, the star turning.
float scopeStar(vec2 q, float px) {
  float a = atan(q.y, q.x) - uTime * 0.6;
  float seg = TAU / 5.0;
  float k = floor(a / seg + 0.5);
  float la = a - k * seg;
  vec2 l = length(q) * vec2(cos(la), sin(la));
  float size = 0.95;
  if (l.x < 0.0 || l.x > size) return 0.0;
  float x = l.x / size;
  float w = sampleV(fract((k + 5.0) * 0.2 + x * 0.2)) * 0.32 * (0.25 + x);
  return 1.0 - ss(0.5 * px, 1.3 * px, abs(l.y - w));
}

// Ring: the waveform wrapped round a circle.
float ring(vec2 q, float px) {
  float t = atan(q.y, q.x) / TAU + 0.5;
  float w = (1.0 - t) * sampleV(0.5 + 0.45 * t) + t * sampleV(0.05 + 0.45 * t);
  return 1.0 - ss(0.5 * px, 1.3 * px, abs(length(q) - (0.32 + 0.12 * w)));
}

// Moving Particle: springs to a new spot on each beat, overshoots, settles.
vec2 particleAt(float aspect) {
  vec2 lim = vec2(0.7 * aspect, 0.7);
  vec2 to = (vec2(hash11(uBeatCount * 1.71 + 0.3), hash11(uBeatCount * 2.37 + 0.9)) * 2.0 - 1.0) * lim;
  vec2 from = (vec2(hash11((uBeatCount - 1.0) * 1.71 + 0.3), hash11((uBeatCount - 1.0) * 2.37 + 0.9)) * 2.0 - 1.0) * lim;
  return mix(from, to, 1.0 - exp(-uBeatAge * 6.0) * cos(uBeatAge * 14.0));
}

void main() {
  vec2 q = centered();
  float aspect = uStateRes.x / uStateRes.y;
  float px = 2.0 / uStateRes.y;
  int id = presetHere(vUv);

  // 1. the trans parts, on last frame: (Mirror,) Movement, Blur, Fadeout
  vec2 from = id == 4 ? abs(q) : q;
  int mov = id == 0 ? 0 : id == 1 ? 1 : id == 2 ? 5 : id == 3 ? 3 : id == 4 ? 4 : 2;
  vec2 uv = movement(mov, from) / vec2(2.0 * aspect, 2.0) + 0.5;
  vec2 tx = 1.0 / uStateRes;
  vec3 col = texture(uState, uv).rgb;
  vec3 around = (texture(uState, uv + vec2(tx.x, 0.0)).rgb + texture(uState, uv - vec2(tx.x, 0.0)).rgb
               + texture(uState, uv + vec2(0.0, tx.y)).rgb + texture(uState, uv - vec2(0.0, tx.y)).rgb) * 0.25;
  float blur = id == 0 || id == 3 ? 0.5 : id == 4 ? 0.15 : id == 5 ? 0.35 : 0.25;
  float fade = id == 1 ? 0.03 : id == 4 ? 0.05 : id == 3 ? 0.025 : id == 2 ? 0.015 : 0.02;
  col = max(mix(col, around, blur) * 0.985 - fade, 0.0);
  if (uv != clamp(uv, 0.0, 1.0)) col = vec3(0.0);

  // 2. the render parts, drawn over it
  float loud = 0.6 + 0.8 * uLevel;
  if (id == 0) {
    col = max(col, bassSpin(q, px));
    col = max(col, vivid3(pal(0.3 + uTime * 0.07)) * ring(q, px) * loud);
  } else if (id == 1) {
    col = max(col, vivid3(pal(uTime * 0.07)) * scopeStar(q, px) * loud);
    vec2 cell = floor(gl_FragCoord.xy / 3.0);
    col += vec3(1.0) * step(0.9972 - 0.002 * uHigh, hash21(cell + floor(uSimFrame * 0.5) * vec2(17.0, 31.0)));
  } else if (id == 2) {
    float at;
    float c = length(q) < 1.15 ? superscope(0, q, px, at) : 0.0;
    col = max(col, vivid3(pal(at * 0.8 + uTime * 0.1)) * c * loud);
  } else if (id == 3) {
    float at;
    float c = superscope(2, vec2(abs(q.x), q.y), px, at);
    col = max(col, vivid3(pal(0.6 + uTime * 0.05)) * c * loud);
    vec2 pp = particleAt(aspect);
    float size = 0.035 + 0.05 * exp(-uBeatAge * 8.0) * uPunch;
    float d = length(q - pp);
    col = max(col, mix(vivid3(pal(0.1 + uBeatCount * 0.13)), vec3(1.0), ss(size, 0.0, d)) * (1.0 - ss(size - px, size, d)));
  } else if (id == 4) {
    // Simple Spectrum, solid, standing on the middle line and mirrored four ways
    vec2 m = abs(q);
    float x = m.x / aspect;
    float bars = 44.0;
    float bar = floor(x * bars);
    float inBar = step(fract(x * bars), 0.78);
    float h = spec(0.04 + 0.9 * (bar + 0.5) / bars) * 0.85;
    // the bar's cap drawn hard, its body only as a faint fill, so the echoes stay lines
    float cap = 1.0 - ss(0.6 * px, 1.6 * px, abs(m.y - h));
    float body = step(m.y, h) * 0.16;
    if (x < 1.0) col = max(col, vivid3(pal(0.3 + 0.6 * m.y / max(h, 0.05) + uTime * 0.03)) * inBar * max(cap, body));
  } else {
    float at;
    float c = length(q) < 1.25 ? superscope(1, q, px, at) : 0.0;
    col = max(col, vivid3(pal(at + uTime * 0.07)) * c * loud);
  }
  outColor = vec4(min(col, vec3(3.0)), 1.0);
}`;

const frag = `${shared}
float lum(vec2 uv) { return dot(texture(uState, uv).rgb, vec3(0.3, 0.5, 0.2)); }

void main() {
  int id = presetHere(vUv);
  vec2 uv = vUv;
  // Mosaic: for a moment after each beat the frame turns to blocks
  if (id == 3) {
    float m = exp(-uBeatAge * 7.0) * uPunch;
    if (m > 0.05) {
      vec2 cells = vec2(uRes.x / uRes.y, 1.0) * mix(170.0, 24.0, m);
      uv = (floor(uv * cells) + 0.5) / cells;
    }
  }
  vec3 col = texture(uState, uv).rgb;
  if (id == 2) {
    // Bump: brightness read as height, lit by a light that circles the screen
    vec2 tx = 1.0 / uStateRes;
    vec3 n = normalize(vec3(lum(uv - vec2(tx.x, 0.0)) - lum(uv + vec2(tx.x, 0.0)),
                            lum(uv - vec2(0.0, tx.y)) - lum(uv + vec2(0.0, tx.y)), 0.12));
    vec3 L = normalize(vec3(cos(uTime * 0.7), sin(uTime * 0.7), 0.7));
    float spec_ = pow(max(reflect(-L, n).z, 0.0), 24.0);
    col = col * (0.35 + 1.1 * max(dot(n, L), 0.0)) + vec3(0.9) * spec_ * ss(0.02, 0.2, lum(uv));
  }
  // Channel Shift on alternate beats (left alone when flashing is to be reduced)
  if (id == 4 && uPunch > 0.5 && mod(uBeatCount, 2.0) > 0.5) col = col.gbr;
  // Interleave: every other pair of lines dimmed
  if (id == 5) col *= mod(floor(gl_FragCoord.y / 2.0), 2.0) < 0.5 ? 1.0 : 0.4;
  outColor = vec4(col * 1.15, 1.0);
}`;

export default {
  id: 'superscope',
  name: 'Superscope',
  group: 'Show',
  blurb: 'Winamp’s AVS: Bass Spin, Oscilloscope Star, superscopes and hard wipes between presets, sharp lines on black',
  tags: ['winamp', 'retro', 'geometric', 'abstract', 'intense'],
  energy: 0.75,
  particles: 0,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
  sim: { height: 540, steps: 1, frag: sim },
};
