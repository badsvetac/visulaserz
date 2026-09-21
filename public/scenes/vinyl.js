// A record on a turntable. The label is the album art (YouTube thumbnail) and the platter
// spins at 33⅓ rpm times the real playback rate, so the speed knob and the tape-stop pad show.
const frag = `
void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  vec2 c = vec2(-0.14 * ss(1.1, 1.5, aspect), -0.02);
  vec2 q = p - c;
  float r = length(q);
  float a = atan(q.y, q.x);
  const float R = 0.80;
  const float LABEL = 0.29;

  vec3 col = pal(0.55) * 0.06 * exp(-length(p) * 1.1) * (0.4 + uLevel);

  // the platter: groove brightness follows the spectrum, outer grooves = bass
  float ar = clamp((R - r) / (R - LABEL), 0.0, 1.0);
  float groove = 0.5 + 0.5 * sin(r * 640.0 + wave(fract((a - uSpin) / TAU)) * 0.9);
  float gl = spec(ar * 0.9);
  vec3 vinyl = vec3(0.02, 0.02, 0.028) + vec3(0.09) * groove * (0.3 + 1.6 * gl);
  // a soft spotlight from the top right gives the platter its shape
  vinyl += pal(0.45) * 0.10 * ss(-0.8, 1.2, dot(q, normalize(vec2(0.6, 0.8))));
  // vinyl's anisotropic sheen: light streaks across the grooves, nudged by beats
  float la = uTime * 0.12 + uBeat * 0.4 * uPunch;
  float s1 = sin(a - la), s2 = sin(a - la + 0.8);                     // pow() of a negative base is undefined in GLSL
  float sheen = exp(-s1 * s1 * 22.0) * 0.7 + exp(-s2 * s2 * 70.0) * 0.45;
  vinyl += pal(0.3 + uTime * 0.02) * sheen * (0.5 + 0.5 * groove) * ss(LABEL, LABEL + 0.06, r);
  vinyl += pal(0.7) * (1.0 - ss(0.0, 0.025, R - r)) * (0.5 + uBass * 1.2);
  col = mix(col, vinyl, 1.0 - ss(R, R + 0.006, r));

  // the label: album art when we have it, otherwise a palette label
  float lab = 1.0 - ss(LABEL - 0.004, LABEL + 0.004, r);
  vec2 luv = rot(-uSpin) * q / LABEL * 0.5 + 0.5;
  luv.x = 0.5 + (luv.x - 0.5) / max(uArtAspect, 0.01);      // square crop out of a wide thumbnail
  vec3 labelCol = uHasArt > 0.5
    ? texture(uArt, luv).rgb
    : mix(pal(0.05), pal(0.35), 0.5 + 0.5 * sin(r * 45.0 - uTime * 0.5)) * (0.45 + 0.6 * spec(r / LABEL * 0.8));
  col = mix(col, labelCol * (0.8 + 0.35 * uBass), lab);
  col *= ss(0.0, 0.014, r) * 0.95 + 0.05;                     // spindle

  // tonearm: a fixed pivot top right; the needle walks inward as the track plays
  vec2 pivot = c + vec2(R + 0.26, R * 0.58);
  vec2 needle = c + normalize(vec2(0.62, 0.78)) * mix(R - 0.03, LABEL + 0.03, uProgress);
  vec2 pa = p - pivot, ba = needle - pivot;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float arm = 1.0 - ss(0.009, 0.014, length(pa - ba * h));
  col = mix(col, vec3(0.72, 0.74, 0.8) * (0.55 + 0.45 * (1.0 - h)), arm);
  col += vec3(0.9, 0.9, 1.0) * (1.0 - ss(0.028, 0.042, length(p - pivot)));
  col += vec3(1.0) * 0.005 / (length(p - needle) + 0.008) * (0.4 + uHigh * 1.5);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'vinyl',
  name: 'Vinyl',
  group: 'Things',
  blurb: 'Spinning record whose grooves glow with the spectrum; sheen jumps on beats',
  tags: ['retro', 'artwork', 'calm'],
  energy: 0.3,
  particles: 3,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
