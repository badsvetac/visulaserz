// A Visulaserz scene. Edit it, then drop the file anywhere on the app: it is compiled on the spot
// and, if your graphics card accepts it, it joins your strip under "Custom". Drop it again after
// every change; a scene with the same @name replaces the old one.
//
// @name      My Scene
// @blurb     Rings that breathe with the bass and ripple on the beat
// @tags      abstract geometric
// @energy    0.5      how busy it gets, 0 calm … 1 rave (the market's "Match" sort reads this)
// @particles 1        0 none · 1 starfield · 2 embers · 3 dust
// @trails    0.5      0 … 0.985: how long the previous frames linger
// @zoom      1.01     0.97 … 1.06: the trails drift inwards (<1) or outwards (>1)
// @spin      0.0      -0.02 … 0.02: the trails turn
//
// Everything below is a WebGL2 fragment shader body. This header is already in front of it:
//
//   in  vec2 vUv;            0..1 across the screen          out vec4 outColor;
//   uniform vec2  uRes;      pixels
//   uniform float uTime;     seconds
//   uniform float uTravel;   a clock that runs faster when the music is louder
//   uniform float uCruise;   the same, eased: for things that should glide
//   uniform float uBass, uMid, uHigh, uLevel, uEnergy;      0..1
//   uniform float uBeat;     1 on a beat, decays to 0        uBeatAge: seconds since it
//   uniform float uBeatCount, uBalance (-1 left … +1 right), uProgress (0..1 through the track)
//   uniform float uPunch;    multiply beat flashes by this: "Reduce flashing" lowers it
//   uniform sampler2D uArt (album art, when uHasArt > 0.5), uText (the track title, alpha = ink)
//
//   vec2  centered()         -1..1 vertically, aspect-corrected: start every scene with this
//   vec3  pal(t)             the active palette, t wraps around
//   float spec(x)            spectrum, x: 0 bass … 1 treble      peak(x): falling caps   slow(x): lazy
//   float wave(x)            waveform, -1..1                     waveL(x), waveR(x)
//   float hist(x, age)       the spectrum `age` (0 now … 1 a few seconds) ago
//   ss(a, b, x)  rot(a)  hash11(x)  hash21(p)  noise(p)  fbm(p)     PI  TAU

void main() {
  vec2 p = centered();
  p *= 1.0 - uBeat * 0.05 * uPunch;                       // the whole picture kicks on a beat
  float r = length(p);
  float a = atan(p.y, p.x);

  vec3 col = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i) / 5.0;
    float band = spec(0.04 + fi * 0.7);                   // each ring listens to its own band
    float radius = 0.18 + fi * 0.62 + band * 0.10 + wave(fract(a / TAU + fi)) * 0.015;
    float line = 0.004 / (abs(r - radius) + 0.003);
    col += pal(fi * 0.6 + uTime * 0.03) * line * (0.25 + 1.6 * band);
  }

  // a shockwave leaves the centre on every beat
  col += pal(0.85) * exp(-uBeatAge * 3.0) * (0.004 / (abs(r - uBeatAge * 1.4) + 0.004)) * uPunch;
  col += pal(0.1) * (0.02 / (r + 0.05)) * (0.3 + uBass * 1.5);
  outColor = vec4(col, 1.0);
}
