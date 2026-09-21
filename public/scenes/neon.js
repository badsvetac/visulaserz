// NEON — the track's name in glass tubes on a brick wall, over wet pavement.
//
// The title texture is the sign: where its ink is solid the tube burns white-hot, and a ring of
// samples around every pixel gives the gas its halo. Under the name runs a rule and eleven short
// tubes, one per band. Treble makes sections stutter the way a tired transformer does, a beat
// kicks the whole sign brighter, and on every eighth beat it drops out for an instant. The
// puddles hold a broken copy of it all.
const frag = `
const float FLOOR = -0.56;
const float SIGN_Y = 0.22;

float ink(vec2 p, float w) {
  vec2 uv = (p - vec2(0.0, SIGN_Y)) / vec2(w, w * 0.25) * 0.5 + 0.5;
  return textureLod(uText, clamp(uv, 0.0, 1.0), 0.0).a * step(abs(uv.x - 0.5), 0.5) * step(abs(uv.y - 0.5), 0.5);
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float tube(float d) { return 0.004 / (d + 0.004) + exp(-d * 16.0) * 0.30; }

// All the light the sign gives off at p.
vec3 signLight(vec2 p, float w) {
  float t = uTime;
  float region = floor((p.x / w * 0.5 + 0.5) * 9.0);
  float stutter = step(0.10 * uHigh, hash11(region * 7.3 + floor(t * 14.0)));        // a section misses a cycle now and then
  float power = (0.80 + 0.20 * sin(t * 53.0 + region * 3.0)) * stutter * (1.0 + 0.7 * uBeat * uPunch);
  if (mod(uBeatCount, 8.0) < 0.5 && uBeatAge < 0.10) power *= 0.12;
  vec3 ca = pal(0.90), cb = pal(0.55);

  float core = ink(p, w), halo = 0.0;
  for (int k = 0; k < 12; k++) {
    float a = float(k) / 12.0 * TAU;
    vec2 o = vec2(cos(a), sin(a));
    halo += ink(p + o * 0.012, w) + 0.6 * ink(p + o * 0.030, w);
  }
  vec3 col = (ca * (halo / 12.0) * 0.9 + mix(ca, vec3(1.0), 0.75) * core * 1.6) * power;

  float uy = SIGN_Y - w * 0.25 - 0.03;
  col += cb * tube(sdSeg(p, vec2(-w * 0.92, uy), vec2(w * 0.92, uy))) * (0.75 + 0.25 * sin(t * 47.0)) * 0.8;
  for (int i = 0; i < 11; i++) {                                                     // the little analyser under the rule
    float fi = float(i);
    float x = (fi - 5.0) * w * 0.15;
    float h = 0.015 + 0.20 * spec(0.03 + fi / 10.0 * 0.75);
    col += mix(cb, ca, fi / 10.0) * tube(sdSeg(p, vec2(x, uy - 0.05 - 0.22), vec2(x, uy - 0.05 - 0.22 + h))) * 0.7;
  }
  return col;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float w = min(aspect * 0.80, 1.55);
  vec3 col;

  if (p.y >= FLOOR) {
    // bricks, lit by the sign
    vec2 bp = vec2(p.x * 5.0, p.y * 11.0);
    float row = floor(bp.y);
    bp.x += 0.5 * mod(row, 2.0);
    vec2 bf = fract(bp);
    float mortar = ss(0.0, 0.05, bf.x) * (1.0 - ss(0.95, 1.0, bf.x)) * ss(0.0, 0.11, bf.y) * (1.0 - ss(0.89, 1.0, bf.y));
    float bh = hash21(floor(bp));
    vec3 brick = mix(vec3(0.11, 0.05, 0.04), vec3(0.17, 0.08, 0.06), bh) * (0.75 + 0.25 * noise(bp * 9.0));
    brick = mix(vec3(0.05, 0.045, 0.04), brick, mortar);
    vec2 dv = (p - vec2(0.0, SIGN_Y - 0.12)) * vec2(0.55, 1.0);
    vec3 wash = (pal(0.90) * 0.7 + pal(0.55) * 0.3) * exp(-dot(dv, dv) * 1.6) * (0.55 + 0.6 * uLevel + 0.5 * uBeat * uPunch);
    col = brick * (0.07 + wash * 1.5);
    col += signLight(p, w);
  } else {
    // wet pavement: puddles mirror the sign, the dry patches only catch its colour
    float dp = FLOOR - p.y;
    float puddle = ss(0.38, 0.58, fbm(vec2(p.x * 1.5, dp * 6.0) + 4.0));
    vec2 rp = vec2(p.x + (noise(vec2(p.x * 28.0, dp * 9.0 + uTime * 0.4)) - 0.5) * 0.035 * (1.0 + dp * 3.0), FLOOR + dp * 1.7);
    vec3 refl = signLight(rp, w);
    vec3 asphalt = vec3(0.012, 0.012, 0.014) * (0.6 + 0.8 * noise(p * vec2(60.0, 140.0)));
    col = asphalt + refl * mix(0.10, 0.62, puddle) * (1.0 - 0.5 * ss(0.0, 0.5, dp));
    col += (pal(0.90) * 0.6 + pal(0.55) * 0.4) * 0.03 * exp(-dp * 3.0) * (0.5 + uLevel);
  }
  col += vec3(0.05, 0.045, 0.04) * (1.0 - ss(0.0, 0.006, abs(p.y - FLOOR)));          // the kerb line

  // a little drizzle in the light
  vec2 rg = vec2(p.x + p.y * 0.08, p.y) * vec2(40.0, 5.0);
  rg.y += uTime * 11.0;
  float drop = step(0.90, hash21(floor(rg))) * (1.0 - ss(0.0, 0.08, abs(fract(rg.x) - 0.5)));
  col += vec3(0.6, 0.65, 0.75) * drop * 0.035 * (0.5 + uLevel);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'neon',
  name: 'Neon',
  group: 'Things',
  blurb: 'Track title as a neon sign on brick over wet pavement, flickering with treble',
  tags: ['city', 'night', 'text', 'retro'],
  energy: 0.55,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
