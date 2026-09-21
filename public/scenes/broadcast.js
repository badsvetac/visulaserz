// BROADCAST — a worn VHS tape on a tube television.
//
// With artwork loaded, the cover is the programme; without it the set shows colour bars, seven
// of them, each driven by its own band. The tape is tired: every scanline jitters, a tracking band
// rolls up the picture, chroma bleeds sideways, the bottom lines tear where the heads switch.
// A beat yanks the picture sideways for a few frames, and every sixteenth beat the channel
// changes through a burst of snow. The title is the on-screen display.
const frag = `
float box(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

vec3 bars(vec2 uv) {
  float i = floor(clamp(uv.x, 0.0, 0.999) * 7.0);
  // white, yellow, cyan, green, magenta, red, blue: each channel is a square wave across the seven bars
  vec3 c = vec3(mod(i, 4.0) < 2.0 ? 1.0 : 0.0, i < 4.0 ? 1.0 : 0.0, mod(i, 2.0) < 1.0 ? 1.0 : 0.0);
  float band = spec(0.03 + i / 6.0 * 0.75);
  float lvl = step(1.0 - uv.y, 0.18 + 0.82 * band);                     // each bar rises with its band
  vec3 top = c * 0.75 * (0.25 + 0.75 * lvl);
  // the strip of grey steps under the bars
  vec3 low = vec3(floor(uv.x * 10.0) / 10.0) * 0.6;
  return uv.y > 0.80 ? low : top;
}

vec3 programme(vec2 uv) {
  vec3 c = bars(uv);
  if (uHasArt > 0.5) {
    vec2 a = (uv - 0.5) * vec2(4.0 / 3.0, 1.0) / 0.86 + 0.5;            // a square in the middle of the 4:3 picture
    a.x = 0.5 + (a.x - 0.5) / max(uArtAspect, 0.01);
    float inside = step(abs(uv.x - 0.5) * (4.0 / 3.0), 0.43) * step(abs(uv.y - 0.5), 0.43);
    c = mix(c * 0.35, textureLod(uArt, clamp(vec2(a.x, 1.0 - a.y), 0.0, 1.0), 0.0).rgb, inside);
  }
  return c;
}

void main() {
  vec2 p = centered();
  float t = uTime;
  vec2 sb = vec2(1.16, 0.87);                                           // the tube, 4:3
  float scr = box(p, sb, 0.12);
  vec3 col;

  if (scr < 0.0) {
    vec2 uv = p / sb * 0.5 + 0.5;
    vec2 cv = uv * 2.0 - 1.0;
    uv = (cv * (1.0 + 0.06 * dot(cv, cv)) / 1.06) * 0.5 + 0.5;          // the glass bulges
    uv.y = 1.0 - uv.y;

    float glitch = exp(-uBeatAge * 12.0) * uPunch;
    float ln = floor(uv.y * 240.0);
    float track = fract(uv.y - t * 0.11);                                // the tracking band rolls up the screen
    float inBand = ss(0.0, 0.03, track) * (1.0 - ss(0.05, 0.09, track));
    float jitter = (noise(vec2(ln * 0.37, t * 22.0)) - 0.5) * (0.003 + 0.05 * inBand + 0.06 * glitch * step(0.6, noise(vec2(ln * 0.05, t * 9.0))));
    jitter += ss(0.955, 1.0, uv.y) * 0.05 * sin(t * 31.0 + uv.y * 90.0);  // head-switching tear along the bottom
    vec2 q = vec2(uv.x + jitter, uv.y);
    float bleed = 0.004 + 0.010 * uBass;
    col = vec3(programme(q + vec2(bleed, 0.0)).r, programme(q).g, programme(q - vec2(bleed, 0.0)).b);
    col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), 0.18);    // tired colour

    // on-screen display: a play arrow and the title, in the corner
    vec2 o = (uv - vec2(0.07, 0.08)) / vec2(0.035, 0.05);
    float arrow = step(0.0, o.x) * step(o.x, 1.0) * step(abs(o.y - 0.5), 0.5 * (1.0 - o.x));
    vec2 tuv = (uv - vec2(0.13, 0.055)) / vec2(0.46, 0.115);
    float osd = textureLod(uText, clamp(vec2(tuv.x, 1.0 - tuv.y), 0.0, 1.0), 0.0).a * step(abs(tuv.x - 0.5), 0.5) * step(abs(tuv.y - 0.5), 0.5);
    col = mix(col, vec3(0.85, 1.0, 0.85), max(arrow, osd) * 0.9);

    float snow = hash21(vec2(ln, floor(uv.x * 320.0)) + floor(t * 60.0));
    col += (snow - 0.5) * (0.07 + 0.5 * inBand + 0.25 * glitch);
    float change = (mod(uBeatCount, 16.0) < 0.5 && uBeatAge < 0.28) ? 1.0 : 0.0;
    col = mix(col, vec3(snow), change);                                  // between channels
    col *= 0.78 + 0.22 * sin(uv.y * 240.0 * PI);                         // scanlines
    col *= 1.0 - 0.45 * dot(cv, cv) * 0.5;
    col *= 0.9 + 0.2 * uLevel;
    col += vec3(0.10, 0.11, 0.13) * exp(-length(p - vec2(-0.55, 0.45)) * 3.0) * 0.35;   // the room's lamp on the glass
  } else {
    // the set and the wall it lights
    float cab = box(p, sb + vec2(0.10, 0.10), 0.10);
    vec3 glow = pal(0.6) * 0.5 + vec3(0.25, 0.3, 0.4);
    col = glow * 0.05 * exp(-max(cab, 0.0) * 2.2) * (0.5 + uLevel + 0.8 * exp(-uBeatAge * 8.0) * uPunch);
    if (cab < 0.0) {
      col = vec3(0.030, 0.028, 0.026) * (0.8 + 0.2 * noise(p * 80.0)) + vec3(0.10) * ss(0.02, 0.0, -cab) * ss(-0.5, 0.9, p.y);
      col += glow * 0.04 * ss(0.10, 0.0, scr);
    }
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'broadcast',
  name: 'Broadcast',
  group: 'Things',
  blurb: 'Worn VHS on a tube TV: cover or colour bars, beats yank the picture sideways',
  tags: ['retro', 'artwork', 'text', 'intense'],
  energy: 0.7,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
