// MILK — the Winamp years' MilkDrop, rebuilt on this engine's memory.
//
// MilkDrop (Ryan Geiss, 2001) drew the waveform into a picture and then, every frame, pulled that
// whole picture a little through a warp: zoomed it, turned it, wobbled it with four sine waves, faded
// it by a hair. Whatever had been drawn kept flowing along the warp for seconds, so a thin line of
// sound turned into smoke, tunnels and flowers. A "preset" was only a handful of equations for that
// warp and for how to draw the wave; a new one faded in every so often, and on a big beat MilkDrop
// could cut straight to it.
//
// The same machine runs here on the scene's own memory (the sim pass). Each step fetches the last
// picture from where the warp says, fades it, and draws on top what the preset asks for: the wave as
// a circle, a stereo scope, a line or two lines; borders that the zoom drags into tunnels; a grid of
// motion vectors combing the flow; hexagons that each hold the whole last picture, so they hold each
// other, smaller and smaller. Eight presets in that manner take turns every 32 beats. A change blends
// across the screen in a pattern of its own (a ring, a sweep, blotches), as MilkDrop 2 did, and one
// change in four is a hard cut. The picture pass is MilkDrop's composite: video echo (a zoomed,
// flipped second copy), gamma, and the old brighten / darken / solarise filters. When a track starts,
// its title is drawn into the picture for a few seconds and melts into the warp, like MilkDrop's
// song-title animation.
const shared = `
struct Preset {
  float zoom, zoomExp, turn, warp, warpSpeed, warpScale, decay, darken;
  vec2 c, d, s;
  int mode; float waveScale, waveAngle, waveAlpha; vec3 waveCol; vec2 wavePos; bool dots, thick;
  float ob, obA, ib, ibA; vec3 obCol, ibCol;
  float mvA; vec2 mvN; vec3 mvCol;
  int shapes; float shapeR, shapeA, shapeZoom, shapeSpin;
  float echoZoom, echoA; int echoOrient; float gamma; int look;
};

vec3 vivid(vec3 c) { return c / max(max(c.r, c.g), max(c.b, 0.05)); }

// One preset's "per-frame equations": what the warp and the drawing do this moment.
Preset preset(int id) {
  Preset P;
  P.zoom = 1.0; P.zoomExp = 1.0; P.turn = 0.0; P.warp = 1.0; P.warpSpeed = 1.0; P.warpScale = 1.0;
  P.decay = 0.98; P.darken = 0.0;
  P.c = vec2(0.0); P.d = vec2(0.0); P.s = vec2(1.0);
  P.mode = 0; P.waveScale = 1.0; P.waveAngle = 0.0; P.waveAlpha = 0.8; P.waveCol = vec3(1.0);
  P.wavePos = vec2(0.0); P.dots = false; P.thick = false;
  P.ob = 0.0; P.obA = 0.0; P.ib = 0.0; P.ibA = 0.0; P.obCol = vec3(0.0); P.ibCol = vec3(0.0);
  P.mvA = 0.0; P.mvN = vec2(28.0, 16.0); P.mvCol = vec3(1.0);
  P.shapes = 0; P.shapeR = 0.3; P.shapeA = 0.0; P.shapeZoom = 1.0; P.shapeSpin = 0.0;
  P.echoZoom = 1.0; P.echoA = 0.0; P.echoOrient = 0; P.gamma = 1.6; P.look = 0;
  float t = uTime, bass = uBass * 2.0, mid = uMid * 2.0, treb = uHigh * 2.0;
  if (id == 0) {
    // Cauldron: rings of zoom bubble outward from a circle of sound
    P.zoom = 1.010 + 0.012 * bass; P.turn = 0.003 * sin(t * 0.37);
    P.warp = 1.1 + 0.6 * mid; P.warpScale = 1.3; P.decay = 0.962; P.darken = 0.25;
    P.mode = 0; P.waveScale = 0.8 + 0.25 * bass; P.waveCol = vivid(pal(t * 0.12));
    P.waveAlpha = 0.6; P.thick = true; P.gamma = 1.25;
  } else if (id == 1) {
    // Frames: a border drawn every frame, shrunk by the zoom into a tunnel of frames
    P.zoom = 0.972 - 0.012 * bass; P.turn = 0.008 * sin(t * 0.21);
    P.warp = 0.25; P.decay = 0.962; P.darken = 0.3;
    P.ob = 0.022; P.obA = 0.8; P.obCol = vivid(pal(0.5 + t * 0.09));
    P.ib = 0.014; P.ibA = 0.55; P.ibCol = vivid(pal(0.15 + t * 0.09)) * 0.8;
    P.mode = 2; P.waveScale = 0.9; P.waveAngle = 0.2 * sin(t * 0.3); P.waveCol = vec3(1.0, 0.96, 0.9);
    P.waveAlpha = 0.7; P.gamma = 1.2;
  } else if (id == 2) {
    // Mirror: a spinning stereo scope, doubled and flipped by video echo into a kaleidoscope
    P.zoom = 0.995; P.turn = 0.012 + 0.01 * sin(t * 0.13); P.warp = 2.2; P.warpSpeed = 0.8; P.decay = 0.955;
    P.mode = 1; P.waveScale = 1.6 + 0.5 * treb; P.waveAngle = t * 0.4; P.waveCol = vivid(pal(0.3 + t * 0.1)); P.waveAlpha = 0.6;
    P.thick = true;
    P.echoZoom = 1.04 + 0.06 * sin(t * 0.17); P.echoA = 0.5; P.echoOrient = 3;
    P.look = 1; P.gamma = 1.1;
  } else if (id == 3) {
    // Spiral: the middle turns faster than the rim, so everything winds into arms
    P.zoom = 0.990 - 0.006 * bass; P.turn = 0.006; P.warp = 0.4; P.decay = 0.975; P.darken = 0.35;
    P.mode = 0; P.dots = true; P.waveScale = 1.25; P.waveCol = vivid(pal(0.75 + t * 0.06)); P.waveAlpha = 1.0;
    P.gamma = 1.4;
  } else if (id == 4) {
    // Shapes: three hexagons each hold the whole last picture, so they hold each other, forever smaller
    P.warp = 0.6; P.decay = 0.955;
    P.shapes = 3; P.shapeR = 0.30; P.shapeA = 0.8; P.shapeZoom = 0.85; P.shapeSpin = 0.12;
    P.mode = 2; P.waveAngle = t * 0.11; P.waveScale = 0.8; P.waveCol = vivid(pal(0.1 + t * 0.07));
    P.waveAlpha = 0.8; P.thick = true; P.gamma = 1.2;
  } else if (id == 5) {
    // Flame: the picture rises and widens like heat, the two channels burning along the bottom
    P.d = vec2(0.0, 0.011); P.s = vec2(1.012, 1.0); P.warp = 2.8; P.warpSpeed = 1.6; P.warpScale = 0.7;
    P.decay = 0.958;
    P.mode = 3; P.wavePos = vec2(0.0, -0.72); P.waveScale = 0.8; P.waveCol = vivid(pal(0.02 + 0.06 * sin(t * 0.3)));
    P.waveAlpha = 0.9; P.thick = true; P.gamma = 1.25;
  } else if (id == 6) {
    // Bloom: the zoom swells in six petals, motion vectors comb the flow, an echo mirrors it
    P.zoom = 1.018; P.turn = 0.01; P.warp = 0.8; P.decay = 0.962;
    P.mode = 0; P.waveScale = 0.65 + 0.3 * bass; P.waveCol = vivid(pal(t * 0.15)); P.waveAlpha = 0.6; P.thick = true;
    P.mvA = 0.2; P.mvN = vec2(32.0, 18.0); P.mvCol = vivid(pal(0.55 + t * 0.02));
    P.echoZoom = 1.25; P.echoA = 0.3; P.echoOrient = 1;
    P.gamma = 1.25;
  } else {
    // Kaleido: every step folds the picture into six mirrored wedges, so the scope grows into a snowflake
    P.zoom = 1.012 + 0.01 * bass; P.turn = 0.004; P.warp = 0.5; P.decay = 0.965;
    P.mode = 1; P.waveScale = 1.3 + 0.4 * treb; P.waveAngle = t * 0.25; P.waveCol = vivid(pal(0.8 + t * 0.1));
    P.waveAlpha = 0.7; P.thick = true; P.gamma = 1.3;
  }
  return P;
}

// Which two presets are on, and how far the change from the first to the second has come here.
const float SLOT = 32.0;
int presetOf(float slot) { return int(mod(slot * 3.0, 8.0) + 0.5) % 8; }   // steps of 3 visit all eight
void schedule(vec2 q, float aspect, out int ia, out int ib, out float b) {
  float slot = floor(uBeatCount / SLOT);
  float into = mod(uBeatCount, SLOT) + min(uBeatAge / 0.5, 1.0);
  ia = presetOf(slot - 1.0);
  ib = presetOf(slot);
  bool hard = hash11(slot * 3.71 + 0.3) < 0.25;
  float progress = (slot < 0.5 || hard) ? 1.0 : clamp(into / 5.0, 0.0, 1.0);
  // the change sweeps the screen in a pattern: a ring from the middle, blotches, or a turning sweep
  float kind = hash11(slot * 5.13 + 2.0);
  float pat = kind < 0.33 ? length(q) / length(vec2(aspect, 1.0))
            : kind < 0.66 ? noise(q * 2.5 + slot)
            : fract(atan(q.y, q.x) / TAU + 0.5 + slot * 0.37);
  b = ss(0.0, 1.0, progress * 1.7 - 0.7 * pat);
}
`;

const sim = `${shared}
// The per-pixel equations: where the picture at q comes from, one step ago.
vec2 warpFrom(int id, Preset P, vec2 q, float aspect) {
  float rad = length(q) / length(vec2(aspect, 1.0));
  float ang = atan(q.y, q.x);
  float t = uTime;
  float zoom = P.zoom, turn = P.turn;
  vec2 d = P.d;
  if (id == 0) zoom += 0.03 * sin(rad * 12.0 - t * 1.7) * (0.3 + uBass);
  else if (id == 1) turn += 0.018 * rad;
  else if (id == 3) turn += 0.1 * (1.0 - rad) * (1.0 - rad);
  else if (id == 5) d.x += 0.004 * sin(q.y * 6.0 + t * 2.0);
  else if (id == 6) zoom += 0.05 * cos(ang * 6.0 + t * 0.7) * (0.4 + uLevel);
  // MilkDrop's order: zoom (shaped over the radius by zoomExp), stretch, warp, rotate, translate
  float z = pow(max(zoom, 0.01), pow(P.zoomExp, rad * 2.0 - 1.0));
  vec2 s = P.c + (q - P.c) / (z * P.s);
  float wt = t * P.warpSpeed, ws = 1.0 / P.warpScale;
  vec4 f = vec4(11.68 + 4.0 * cos(wt * 1.413 + 10.0), 8.77 + 3.0 * cos(wt * 1.113 + 7.0),
                10.54 + 3.0 * cos(wt * 1.233 + 3.0), 11.49 + 4.0 * cos(wt * 0.933 + 5.0));
  vec2 u = q * 0.5;
  float w = P.warp * 0.007;
  s.x += w * sin(wt * 0.333 + ws * (u.x * f.x - u.y * f.w));
  s.y += w * cos(wt * 0.375 - ws * (u.x * f.z + u.y * f.y));
  s.x += w * cos(wt * 0.753 - ws * (u.x * f.y - u.y * f.z));
  s.y += w * sin(wt * 0.825 + ws * (u.x * f.x + u.y * f.w));
  s = P.c + rot(turn) * (s - P.c);
  if (id == 7) {
    float seg = TAU / 6.0, a = atan(s.y, s.x);
    a = abs(mod(a, seg) - seg * 0.5);                     // fold into one wedge, mirrored
    s = length(s) * vec2(cos(a), sin(a));
  }
  return s - d;
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0));
}
// the waveform bent into a loop: two stretches of it crossfaded so the ends meet
float loopWave(float t) { return (1.0 - t) * wave(0.5 + 0.45 * t) + t * wave(0.05 + 0.45 * t); }
// the stereo scope, turned so a mono signal stands upright; read straight from the texels, every 8th sample
vec2 scopeAt(int i) {
  float l = texelFetch(uAudio, ivec2(i * 8, 4), 0).r * 2.0 - 1.0;
  float r = texelFetch(uAudio, ivec2(i * 8, 5), 0).r * 2.0 - 1.0;
  return vec2(l - r, l + r) * 0.7;
}

// How much of this pixel the preset's wave covers.
float waveCover(Preset P, vec2 q, float aspect, float px) {
  float width = (P.thick ? 1.8 : 1.0) * px;
  vec2 v = q - P.wavePos;
  if (P.mode == 0) {
    float t = atan(v.y, v.x) / TAU + 0.5;
    if (P.dots) {
      float tq = (floor(t * 96.0) + 0.5) / 96.0;
      float rr = P.waveScale * (0.42 + 0.2 * loopWave(tq));
      float a = (tq - 0.5) * TAU;
      return 1.0 - ss(width * 0.6, width * 1.4, length(v - rr * vec2(cos(a), sin(a))));
    }
    float rr = P.waveScale * (0.42 + 0.2 * loopWave(t));
    return 1.0 - ss(width * 0.5, width, abs(length(v) - rr));
  }
  if (P.mode == 1) {
    vec2 w = rot(P.waveAngle) * v / P.waveScale;
    if (dot(w, w) > 2.2) return 0.0;
    float best = 1e9;
    vec2 prev = scopeAt(0);
    for (int i = 1; i < 64; i++) {
      vec2 cur = scopeAt(i);
      best = min(best, P.dots ? length(w - cur) : segDist(w, prev, cur));
      prev = cur;
    }
    return 1.0 - ss(width * 0.5, width * (P.dots ? 1.6 : 1.0), best * P.waveScale);
  }
  // a line across the screen (mode 2), or the two channels as two lines (mode 3)
  vec2 l = rot(P.waveAngle) * v;
  float x = l.x / (2.0 * aspect) + 0.5;
  if (x < 0.0 || x > 1.0) return 0.0;
  float amp = 0.3 * P.waveScale;
  if (P.mode == 2) {
    float y = amp * wave(x);
    float dy = amp * (wave(x + 0.002) - wave(x - 0.002)) / (0.008 * aspect);
    return 1.0 - ss(width * 0.5, width, abs(l.y - y) / sqrt(1.0 + dy * dy));
  }
  float yl = 0.14 + amp * 0.6 * waveL(x), yr = -0.14 + amp * 0.6 * waveR(x);
  return max(1.0 - ss(width * 0.5, width, abs(l.y - yl)), 1.0 - ss(width * 0.5, width, abs(l.y - yr)));
}

float sdHex(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

// Textured shapes: inside each one, the whole last picture, shrunk and turned.
vec3 shapesOver(Preset P, vec2 q, vec3 col, float aspect, float w) {
  if (P.shapes == 0 || w <= 0.001) return col;
  for (int k = 0; k < 3; k++) {
    if (k >= P.shapes) break;
    float a = uTime * P.shapeSpin + float(k) * TAU / float(P.shapes);
    vec2 cen = P.shapes == 1 ? vec2(0.0) : vec2(cos(a), sin(a)) * 0.52;
    vec2 v = rot(a * 1.5) * (q - cen);
    float h = sdHex(v, P.shapeR);
    if (h < 0.0) {
      vec2 src = v / P.shapeR * P.shapeZoom;
      col = mix(col, texture(uState, src / vec2(2.0 * aspect, 2.0) + 0.5).rgb, P.shapeA * w);
    }
    col = mix(col, vec3(1.0), (1.0 - ss(0.0, 0.008, abs(h))) * 0.35 * w);
  }
  return col;
}

// Motion vectors: short strokes on a grid, each pointing the way the picture flows there.
vec3 motionOver(int id, Preset P, vec2 q, vec3 col, float aspect, float w, float px) {
  if (P.mvA <= 0.0 || w <= 0.001) return col;
  vec2 uv = q / vec2(2.0 * aspect, 2.0) + 0.5;
  vec2 base = floor(uv * P.mvN - 0.5);
  float dist = 1e9;
  for (int j = 0; j < 4; j++) {
    vec2 cell = base + vec2(float(j & 1), float(j >> 1));
    vec2 g = ((cell + 0.5) / P.mvN - 0.5) * vec2(2.0 * aspect, 2.0);
    vec2 v = g - warpFrom(id, P, g, aspect);
    dist = min(dist, segDist(q, g - v * 5.0, g));
  }
  return mix(col, P.mvCol, (1.0 - ss(0.5 * px, 1.4 * px, dist)) * P.mvA * w);
}

vec3 bordersOver(Preset P, float edge, vec3 col, float w) {
  if (w <= 0.001) return col;
  if (edge < P.ob) return mix(col, P.obCol, P.obA * w);
  if (edge < P.ob + P.ib) return mix(col, P.ibCol, P.ibA * w);
  return col;
}

void main() {
  vec2 q = centered();
  float aspect = uStateRes.x / uStateRes.y;
  float px = 2.0 / uStateRes.y;
  int ia, ib; float b;
  schedule(q, aspect, ia, ib, b);
  Preset A = preset(ia), B = preset(ib);

  // 1. the warp: fetch the last picture from where the flow brings it
  vec2 sa = b < 0.999 ? warpFrom(ia, A, q, aspect) : vec2(0.0);
  vec2 sb = b > 0.001 ? warpFrom(ib, B, q, aspect) : vec2(0.0);
  vec2 uv = mix(sa, sb, b) / vec2(2.0 * aspect, 2.0) + 0.5;
  vec3 col = uv == clamp(uv, 0.0, 1.0) ? texture(uState, uv).rgb : vec3(0.0);
  col = max(col * mix(A.decay, B.decay, b) - 0.0025, 0.0);
  col *= 1.0 - mix(A.darken, B.darken, b) * 0.12 * exp(-dot(q, q) * 40.0);

  // 2. what the presets draw into the picture, each weighted by how far the change has come
  col = shapesOver(A, q, col, aspect, 1.0 - b);
  col = shapesOver(B, q, col, aspect, b);
  col = motionOver(ia, A, q, col, aspect, 1.0 - b, px);
  col = motionOver(ib, B, q, col, aspect, b, px);
  vec2 e2 = min(vUv, 1.0 - vUv) * vec2(2.0 * aspect, 2.0);
  float edge = min(e2.x, e2.y);
  col = bordersOver(A, edge, col, 1.0 - b);
  col = bordersOver(B, edge, col, b);
  float loud = 0.55 + 0.9 * uLevel;                       // the wave is as bright as the music is loud
  if (b < 0.999) col = mix(col, A.waveCol, clamp(waveCover(A, q, aspect, px) * A.waveAlpha * loud, 0.0, 1.0) * (1.0 - b));
  if (b > 0.001) col = mix(col, B.waveCol, clamp(waveCover(B, q, aspect, px) * B.waveAlpha * loud, 0.0, 1.0) * b);

  // 3. a new track's title, drawn in for a few seconds so the warp can melt it
  if (uDuration > 0.5 && uElapsed < 6.0) {
    float grow = mix(0.5, 1.15, ss(0.0, 4.5, uElapsed));   // it flies toward you
    vec2 tq = q / grow;
    vec2 tuv = vec2(tq.x / 3.4 + 0.5, tq.y / 0.85 + 0.5);
    if (tuv == clamp(tuv, 0.0, 1.0)) {
      float env = ss(0.2, 0.8, uElapsed) * (1.0 - ss(3.0, 5.5, uElapsed));
      col = mix(col, vec3(1.0, 0.97, 0.92), texture(uText, tuv).a * env * 0.4);
    }
  }
  outColor = vec4(min(col, vec3(4.0)), 1.0);
}`;

const frag = `${shared}
// MilkDrop's composite: video echo, gamma, and one of the old filters.
vec3 composite(Preset P, vec2 uv) {
  vec3 img = texture(uState, uv).rgb;
  if (P.echoA > 0.0) {
    vec2 e = (uv - 0.5) / P.echoZoom;
    if (P.echoOrient == 1 || P.echoOrient == 3) e.x = -e.x;
    if (P.echoOrient >= 2) e.y = -e.y;
    e += 0.5;
    vec3 echo = e == clamp(e, 0.0, 1.0) ? texture(uState, e).rgb : vec3(0.0);
    img = mix(img, echo, P.echoA);
  }
  img *= P.gamma;
  vec3 c = clamp(img, 0.0, 1.0);
  if (P.look == 1) img = 1.0 - (1.0 - c) * (1.0 - c);            // brighten
  else if (P.look == 2) img = img * c;                            // darken
  else if (P.look == 3) img = c * (1.0 - c) * 4.0 * (0.35 + 0.65 * c) + img * 0.25;   // solarise
  return img;
}

void main() {
  vec2 q = centered();
  float aspect = uRes.x / uRes.y;
  int ia, ib; float b;
  schedule(q, aspect, ia, ib, b);
  vec3 col;
  if (b > 0.999) col = composite(preset(ib), vUv);
  else if (b < 0.001) col = composite(preset(ia), vUv);
  else col = mix(composite(preset(ia), vUv), composite(preset(ib), vUv), b);
  // the title, crisp over the picture for its first moments
  if (uDuration > 0.5 && uElapsed < 3.2) {
    float grow = mix(0.5, 1.15, ss(0.0, 4.5, uElapsed));   // it flies toward you
    vec2 tuv = vec2(q.x / grow / 3.4 + 0.5, q.y / grow / 0.85 + 0.5);
    if (tuv == clamp(tuv, 0.0, 1.0)) {
      float env = ss(0.2, 0.8, uElapsed) * (1.0 - ss(1.8, 3.2, uElapsed));
      col = mix(col, vec3(1.0, 0.98, 0.95), texture(uText, tuv).a * env * 0.85);
    }
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'milk',
  name: 'Milk',
  group: 'Show',
  blurb: 'Winamp’s MilkDrop feel: the wave warped into smoke, tunnels and flowers; eight presets melt into each other',
  tags: ['winamp', 'retro', 'psychedelic', 'abstract', 'intense'],
  energy: 0.7,
  particles: 0,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
  sim: { height: 540, steps: 1, frag: sim },
};
