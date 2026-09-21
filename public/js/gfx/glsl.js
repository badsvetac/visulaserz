// Shared GLSL: the fullscreen vertex shader, the header every scene gets, and the post chain.

// One oversized triangle covers the screen; positions come from gl_VertexID so no buffers are needed.
export const FULLSCREEN_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SCENE_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;       // seconds
uniform float uTravel;     // time that runs faster when the music is louder
uniform float uCruise;     // the same, eased over ~1 s: vehicles glide instead of lurching
uniform float uCruiseRate; // current cruise speed factor (~0.45 quiet … ~1.55 loud)
uniform float uBass, uMid, uHigh, uLevel, uEnergy;
uniform float uBeat;       // 1 on a beat, decays to 0
uniform float uBeatAge;    // seconds since the last beat
uniform float uBeatCount;
uniform float uBalance;    // stereo balance, -1 left .. +1 right
uniform float uPunch;      // how hard beats may hit the picture (lowered by "reduce flashing")
uniform float uHue;
uniform float uHistFrac;
uniform vec3  uPalA, uPalB, uPalC, uPalD;
uniform vec3  uPalA2, uPalB2, uPalC2, uPalD2;
uniform float uPalMix;     // 0 = the first set, 1 = the second; a palette change glides across
uniform sampler2D uAudio;  // 512x6: spectrum / waveform / peak caps / slow spectrum / left wave / right wave
uniform sampler2D uHist;   // 128x128 scrolling spectrogram, row 0 = now
uniform sampler2D uArt;    // album art, valid when uHasArt > 0.5
uniform sampler2D uText;   // the track title rendered to a 1024x256 canvas (alpha = ink)
uniform sampler2D uBackdrop; // a photo the user dropped in, valid when uHasBackdrop > 0.5
uniform float uHasArt, uArtAspect, uHasBackdrop, uBackdropAspect;
uniform float uSpin;       // record angle in radians, follows the real playback rate
uniform float uProgress;   // 0..1 through the track

#define PI 3.14159265359
#define TAU 6.28318530718
#define ROW(r) ((r + 0.5) / 6.0)

vec3 palOf(vec3 a, vec3 b, vec3 c, vec3 d, float t) { return clamp(a + b * cos(TAU * (c * t + d + uHue)), 0.0, 1.0); }
// Two palettes, crossfaded by their OUTPUT. Interpolating a, b, c, d instead would be one
// cosine cheaper but wrong: with different frequencies (Miami is c = [2,1,0], Laser [1,1,1])
// the halfway parameters describe a palette that is nobody's, and it goes muddy on the way.
vec3 pal(float t) {
  return mix(palOf(uPalA, uPalB, uPalC, uPalD, t), palOf(uPalA2, uPalB2, uPalC2, uPalD2, t), uPalMix);
}
float spec(float x)  { return texture(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(0.0))).r; }
float wave(float x)  { return texture(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(1.0))).r * 2.0 - 1.0; }
float peak(float x)  { return texture(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(2.0))).r; }
float slow(float x)  { return texture(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(3.0))).r; }
float waveL(float x) { return texture(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(4.0))).r * 2.0 - 1.0; }
float waveR(float x) { return texture(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(5.0))).r * 2.0 - 1.0; }
float hist(float x, float age) {
  float v = (clamp(age, 0.0, 1.0) * 126.0 + 0.5 - uHistFrac) / 128.0;
  return texture(uHist, vec2(clamp(x, 0.004, 0.996), max(v, 0.5 / 128.0))).r;
}
// smoothstep is undefined in GLSL when edge0 > edge1; this version is safe either way round.
float ss(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = rot(0.5) * p * 2.03 + vec2(13.7, 7.1); a *= 0.5; }
  return s;
}
vec2 centered() { return (vUv * 2.0 - 1.0) * vec2(uRes.x / uRes.y, 1.0); }
`;

// Stateless particles: every position is a pure function of (particle id, time), so there is
// nothing to simulate or store. Beats are felt through uTravel jumping forward.
export const PARTICLE_VERT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uTravel, uBass, uHigh, uLevel, uBeat, uHue;
uniform int uMode;   // 1 starfield, 2 embers, 3 dust, 4 vectorscope trace
uniform vec3 uPalA, uPalB, uPalC, uPalD;
uniform vec3 uPalA2, uPalB2, uPalC2, uPalD2;
uniform float uPalMix;
uniform sampler2D uAudio;
uniform float uXYGain;
out vec4 vColor;
#define TAU 6.28318530718
float h(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
vec3 palOf(vec3 a, vec3 b, vec3 c, vec3 d, float t) { return clamp(a + b * cos(TAU * (c * t + d + uHue)), 0.0, 1.0); }
vec3 pal(float t) {
  return mix(palOf(uPalA, uPalB, uPalC, uPalD, t), palOf(uPalA2, uPalB2, uPalC2, uPalD2, t), uPalMix);
}
void main() {
  float id = float(gl_VertexID);
  float r1 = h(id), r2 = h(id * 1.7 + 3.1), r3 = h(id * 2.3 + 7.7), r4 = h(id * 3.1 + 1.9);
  float aspect = uRes.x / uRes.y;
  float px = uRes.y / 1080.0;
  vec2 pos; float size; float alpha; vec3 col;
  if (uMode == 1) {
    float d = 1.0 - fract(r3 + uTravel * 0.10 * (0.6 + 0.8 * r4));
    vec2 dir = vec2(r1 * 2.0 - 1.0, r2 * 2.0 - 1.0);
    pos = dir * 0.30 / d;
    size = (1.2 + 2.6 * r4) / d * (0.7 + uHigh);
    alpha = (1.0 - smoothstep(0.8, 1.0, d)) * smoothstep(0.03, 0.22, d) * 0.9;
    col = mix(vec3(1.0), pal(r4), 0.55);
  } else if (uMode == 2) {
    float life = fract(r2 + uTravel * 0.045 * (0.5 + r3));
    pos = vec2((r1 * 2.0 - 1.0) * aspect + 0.06 * sin(uTime * (0.4 + r4) + id), -1.1 + 2.3 * life);
    size = (2.0 + 5.0 * r4) * (0.6 + uBass * 1.2);
    alpha = smoothstep(0.0, 0.1, life) * (1.0 - life) * (0.35 + 0.65 * uLevel);
    col = pal(0.05 + r3 * 0.25);
  } else if (uMode == 4) {
    // Vectorscope: one dot per audio sample. x = side (L-R), y = mid (L+R): mono is a vertical
    // line, wide stereo fills the circle, and the 8D orbit swings the figure left and right.
    int i = int(mod(id, 512.0));
    float L = texelFetch(uAudio, ivec2(i, 4), 0).r * 2.0 - 1.0;
    float R = texelFetch(uAudio, ivec2(i, 5), 0).r * 2.0 - 1.0;
    vec2 v = vec2(L - R, L + R) * 0.7071;
    pos = tanh(v * uXYGain) * 0.78;
    size = 5.0;
    alpha = 0.9;
    col = pal(float(i) / 512.0 * 0.3 + uTime * 0.05);
  } else {
    vec2 drift = vec2(sin(uTime * 0.05 * (0.5 + r3) + id), cos(uTime * 0.04 * (0.5 + r4) + id * 1.3));
    pos = vec2((r1 * 2.0 - 1.0) * aspect, r2 * 2.0 - 1.0) + drift * 0.25;
    size = (3.0 + 22.0 * r4 * r4) * (0.8 + uBeat * 0.5);
    alpha = (0.05 + 0.22 * (1.0 - r4)) * (0.5 + 0.5 * sin(uTime * (0.6 + r3 * 2.0) + id)) * (0.4 + uHigh * 1.4);
    col = pal(r3);
  }
  gl_Position = vec4(pos.x / aspect, pos.y, 0.0, 1.0);
  gl_PointSize = clamp(size * px, 1.0, 96.0);
  vColor = vec4(col, alpha);
}`;

export const PARTICLE_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = clamp(1.0 - d, 0.0, 1.0);
  outColor = vec4(vColor.rgb * a * a * vColor.a, 1.0);
}`;

// Trails: the new scene frame is merged with last frame's result, zoomed and rotated a touch.
// max() instead of add keeps a static picture from slowly burning out to white.
export const FEEDBACK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene, uPrev;
uniform vec2 uRes;
uniform float uDecay, uZoom, uSpin;
void main() {
  vec3 s = texture(uScene, vUv).rgb;
  float aspect = uRes.x / uRes.y;
  vec2 c = vUv - 0.5;
  c.x *= aspect;
  float cs = cos(uSpin), sn = sin(uSpin);
  c = mat2(cs, -sn, sn, cs) * c / uZoom;
  c.x /= aspect;
  vec2 q = c + 0.5;
  vec3 prev = texture(uPrev, q).rgb;
  vec2 inside = step(vec2(0.0), q) * step(q, vec2(1.0));
  prev = max(prev * uDecay - 0.0015, 0.0) * inside.x * inside.y;
  outColor = vec4(max(s, prev), 1.0);
}`;

export const BLOOM_PREFILTER_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex, uOverlay;
uniform vec2 uTexel;
uniform float uThreshold, uKnee;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, -0.5)).rgb
         + texture(uTex, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture(uTex, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  vec4 ov = texture(uOverlay, vUv);                    // lyrics sit on top and bloom like anything bright
  c = c * (1.0 - ov.a) + ov.rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  outColor = vec4(c * max(soft, br - uThreshold) / max(br, 1e-4), 1.0);
}`;

// Dual-filter ("Kawase") blur: a cheap down/up pyramid that gives a very wide, smooth glow.
export const BLOOM_DOWN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec2 hp = uTexel * 0.5;
  vec3 sum = texture(uTex, vUv).rgb * 4.0;
  sum += texture(uTex, vUv - hp).rgb + texture(uTex, vUv + hp).rgb;
  sum += texture(uTex, vUv + vec2(hp.x, -hp.y)).rgb + texture(uTex, vUv - vec2(hp.x, -hp.y)).rgb;
  outColor = vec4(sum / 8.0, 1.0);
}`;

export const BLOOM_UP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec2 hp = uTexel * 0.5;
  vec3 sum = texture(uTex, vUv + vec2(-hp.x * 2.0, 0.0)).rgb + texture(uTex, vUv + vec2(hp.x * 2.0, 0.0)).rgb
           + texture(uTex, vUv + vec2(0.0, hp.y * 2.0)).rgb + texture(uTex, vUv + vec2(0.0, -hp.y * 2.0)).rgb;
  sum += (texture(uTex, vUv + vec2(-hp.x, hp.y)).rgb + texture(uTex, vUv + vec2(hp.x, hp.y)).rgb
        + texture(uTex, vUv + vec2(hp.x, -hp.y)).rgb + texture(uTex, vUv + vec2(-hp.x, -hp.y)).rgb) * 2.0;
  outColor = vec4(sum / 12.0, 1.0);
}`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene, uBloom, uOverlay;
uniform vec2 uRes;
uniform float uTime, uBloomAmt, uAberration, uGrain, uBeat, uPunch, uFade, uScanlines, uGlitch, uStrobe;
uniform int uSymmetry;   // 0 off, 1 mirror, 2 quad, 3 kaleido x6, 4 kaleido x12
#define TAU 6.28318530718
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

vec2 symmetry(vec2 uv) {
  if (uSymmetry == 0) return uv;
  vec2 c = uv - 0.5;
  if (uSymmetry == 1) { c.x = abs(c.x); return c + 0.5; }
  if (uSymmetry == 2) { return abs(c) + 0.5; }
  float aspect = uRes.x / uRes.y;
  c.x *= aspect;
  float seg = TAU / (uSymmetry == 3 ? 6.0 : 12.0);
  float a = mod(atan(c.y, c.x) + uTime * 0.03, seg);
  a = abs(a - seg * 0.5);
  c = length(c) * vec2(cos(a), sin(a));
  c.x /= aspect;
  return c + 0.5;
}

void main() {
  vec2 uv = vUv;
  if (uGlitch > 0.0) {
    float band = floor(uv.y * 28.0);
    float on = step(0.82, hash(vec2(band, floor(uTime * 24.0)))) * uGlitch * uBeat;
    uv.x += (hash(vec2(band * 1.7, 3.0)) - 0.5) * 0.09 * on;
  }
  uv = symmetry(uv);
  vec2 dir = uv - 0.5;
  float amt = uAberration * (0.0015 + 0.012 * uBeat * uPunch) * (0.4 + 2.0 * dot(dir, dir));
  vec3 col = vec3(texture(uScene, uv + dir * amt).r, texture(uScene, uv).g, texture(uScene, uv - dir * amt).b);
  col += texture(uBloom, uv).rgb * uBloomAmt;
  vec4 ov = texture(uOverlay, vUv);                    // lyrics: unwarped, over everything, before the tone curve
  col = col * (1.0 - ov.a) + ov.rgb;

  col = 1.0 - exp(-col * 1.35);                       // filmic-ish shoulder: bright stays coloured instead of clipping
  col = pow(col, vec3(0.92));
  vec2 v = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  col *= 1.0 - 0.42 * smoothstep(0.45, 1.25, length(v));
  col *= 1.0 - uScanlines * 0.22 * (0.5 + 0.5 * sin(vUv.y * uRes.y * 3.14159));
  col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain * 0.09;
  col = mix(col, vec3(1.0), uStrobe * step(0.5, fract(uTime * 11.0)));
  outColor = vec4(max(col, 0.0) * uFade, 1.0);
}`;
