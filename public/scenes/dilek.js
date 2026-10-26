import { SCULPT } from '../js/gfx/scene-kit.js';

// DİLEK FENERLERİ — a night sky full of wish lanterns, as on Hıdrellez night: hundreds of paper
// lanterns rising slowly in four depths, the near ones big and close, the far ones points of light
// high up, swaying in the wind as they go; each one a bag of thin paper on bamboo ribs, glowing
// gold where its flame burns at the open bottom and deepening to orange towards its top; a warm
// glow low in the sky where they come from, a thin moon, a few stars.
//
// Music: every lantern's flame flickers with its own band of the spectrum; the bass swells the glow
// round each lantern; the mids warm the haze low in the sky; the highs make the stars twinkle and
// the flames dance faster; on every beat a wave of light rises through all the lanterns, from the
// bottom of the sky to the top, gone within the beat.
const frag = `${SCULPT}
float gPx, gAsp;
// one lantern, centred at c, h tall, leaning a little; returns its colour (rgb) and cover (a)
vec4 lantern(vec2 uv, vec2 c, float h, float lean, float flame, float paper) {
  vec2 p = rot(lean) * (uv - c) / h;               // its own units: bottom at y = -0.5, top at 0.5
  float halfW = mix(0.25, 0.33, clamp(p.y + 0.5, 0.0, 1.0));
  vec2 q = vec2(abs(p.x) - halfW + 0.07, abs(p.y) - 0.5 + 0.07);
  float d = (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.07) * h;   // a rounded, tapering bag
  float aa = gPx * 0.9;
  float cover = ss(aa, -aa, d);
  // light through the paper: gold over the flame, orange towards the top and the sides
  float hot = exp(-(p.x * p.x * 7.0 + (p.y + 0.22) * (p.y + 0.22) * 5.0));
  vec3 c0 = mix(vec3(0.85, 0.24, 0.04), vec3(1.0, 0.7, 0.3), hot) * paper;
  c0 *= 0.72 + 0.28 * ss(halfW, halfW * 0.2, abs(p.x));                  // the paper curving away at the sides
  float ribs = abs(fract(p.x / (2.0 * halfW) * 4.0 + 0.5) - 0.5);
  c0 *= 1.0 - 0.18 * ss(0.05, 0.0, ribs) * ss(0.02, 0.04, h);             // bamboo ribs, where there is room
  c0 *= 1.0 - 0.5 * ss(0.03, 0.0, abs(p.y + 0.5)) * ss(0.02, 0.04, h);    // the wire ring at the mouth
  // the flame in the mouth, seen through the paper
  vec2 fp = p - vec2(0.0, -0.4);
  c0 += vec3(1.0, 0.9, 0.6) * exp(-(fp.x * fp.x * 260.0 + fp.y * fp.y * 140.0)) * flame * 1.8 * ss(0.012, 0.03, h);
  return vec4(c0, cover);
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  float up = uv.y + 1.0;
  // the night: deep blue above, warm low down where the lanterns come from
  vec3 col = mix(vec3(0.35, 0.16, 0.12), vec3(0.09, 0.07, 0.18), ss(0.0, 0.9, up));
  col = mix(col, vec3(0.012, 0.016, 0.05), ss(0.8, 2.0, up));
  col += vec3(0.6, 0.28, 0.1) * exp(-up * 3.5) * (0.25 + 0.4 * gMid);       // the haze where they rise from
  // a few stars and a thin moon
  for (int layer = 0; layer < 2; layer++) {
    float scale = 66.0 + float(layer) * 90.0;
    vec2 g = uv * scale + float(layer) * 51.3;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 61.0);
    if (h > 0.045) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float tw = 0.75 + 0.25 * sin(uTime * (1.4 + h * 25.0) + h * 50.0) + gHigh * 0.6 * sin(uTime * 12.0 + h * 90.0);
    col += vec3(0.9, 0.92, 1.0) * (0.12 + pow(hash21(cell + 1.3), 5.0) * 1.4) * tw * exp(-r * r / (gPx * gPx * 0.5)) * ss(0.7, 1.4, up);
  }
  vec2 mp = uv - vec2(-min(1.15, gAsp * 0.7), 0.7);
  float moon = ss(0.052, 0.047, length(mp)) * ss(0.036, 0.043, length(mp - vec2(0.022, 0.014)));
  col += vec3(1.0, 0.95, 0.82) * moon * 1.3 + vec3(0.4, 0.42, 0.6) * exp(-length(mp) * 7.0) * 0.08;

  // the wave of the beat, rising from the bottom of the sky to the top
  float front = -2.0, wave = 0.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.5) { front = -1.15 + uBeatAge / 0.45 * 2.4; wave = (1.0 - uBeatAge / 0.5) * uPunch; }
  // four depths of lanterns, far to near; each rises in its own frame, cell by cell
  for (int L = 0; L < 4; L++) {
    float fl = float(L);
    float cs = L == 0 ? 0.075 : L == 1 ? 0.13 : L == 2 ? 0.24 : 0.42;     // cell size
    float size = cs * 0.34;
    float speed = L == 0 ? 0.012 : L == 1 ? 0.02 : L == 2 ? 0.034 : 0.055;
    float wind = sin(uTime * 0.07 + fl) * 0.06 * (fl + 1.0);
    vec2 q = vec2(uv.x - wind, uv.y - uTime * speed) / cs;
    vec2 cell = floor(q);
    // the far ones gather high up, the near ones lower down
    float wantY = mix(0.55, -0.45, fl / 3.0);
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 id = cell + vec2(float(dx), float(dy));
        float h1 = hash21(id + fl * 17.0), h2 = hash21(id + fl * 17.0 + 3.7), h3 = hash21(id + fl * 17.0 + 9.1);
        vec2 c = (id + 0.5 + (vec2(h1, h2) - 0.5) * 0.55) * cs + vec2(wind, uTime * speed);
        c.x += sin(uTime * (0.4 + h3) + h1 * 20.0) * cs * 0.06;             // its own sway
        float dens = (L == 3 ? 0.42 : L == 0 ? 0.5 : 0.58) * ss(1.3, 0.2, abs(c.y - wantY));
        if (h3 > dens) continue;
        float hgt = size * (0.75 + 0.5 * h2);
        float far = length(uv - c);
        if (far > hgt * 3.5) continue;
        float b = band(0.04 + 0.82 * h1);                                   // this lantern's band
        float flame = 0.75 + 0.15 * sin(uTime * (7.0 + h2 * 5.0 + gHigh * 6.0) + h1 * 30.0) + 0.9 * b;
        float lift = 1.0 + 1.3 * wave * exp(-(c.y - front) * (c.y - front) / 0.03);
        vec4 lan = lantern(uv, c, hgt, sin(uTime * 0.5 + h3 * 9.0) * 0.08, flame * lift, (0.55 + 0.25 * b) * lift);
        float depthFade = L == 0 ? 0.75 : 1.0;
        col = mix(col, lan.rgb, lan.a * depthFade);
        // the glow in the air round it, more with the bass
        col += vec3(1.0, 0.55, 0.2) * exp(-far / (hgt * (0.55 + 0.4 * gBass))) * 0.11 * flame * lift * depthFade * (1.0 - lan.a);
      }
    }
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'dilek', name: 'Dilek Fenerleri', group: 'Vibe',
  blurb: 'Hundreds of wish lanterns rising into the night: every flame flickers with its own band, the bass swells their glow, and each beat sends a wave of light up through them',
  tags: ['sky', 'night', 'lanterns', 'light', 'warm', 'calm'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
