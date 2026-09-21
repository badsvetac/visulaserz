// BOSPHORUS — Istanbul at night, from the water.
//
// The suspension bridge's light show is the analyser: every hanger between the main cable and the
// deck is lit by its own band (bass at mid-span, treble toward the towers) while a wave of colour
// runs along the span on the travel clock. A ferry crosses with its saloon lights on, the Maiden's
// Tower blinks on the beat, a string of lamps hangs between the minarets, and the crescent has
// its star. The strait mirrors every light with a wobble from the mids.
const frag = `
const float SEA = -0.40;
const float DECK = -0.05;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float cableY(float x, float xt, float top) { return DECK + 0.025 + (top - DECK - 0.025) * (x / xt) * (x / xt); }

// Everything that shines, so the water can show it a second time.
vec3 lights(vec2 p, float aspect) {
  vec3 col = vec3(0.0);
  float xt = aspect * 0.52, top = DECK + 0.42;

  // crescent and star
  vec2 mc = vec2(-aspect * 0.55, 0.66);
  float moon = (1.0 - ss(0.078, 0.082, length(p - mc))) * ss(0.066, 0.070, length(p - mc - vec2(0.030, 0.012)));
  col += vec3(1.0, 0.96, 0.86) * moon * 1.3;
  vec2 sv = p - mc - vec2(0.115, 0.012);
  col += vec3(1.0, 0.96, 0.86) * (0.00010 / (dot(sv, sv) + 0.00006));
  col += vec3(0.6, 0.65, 0.9) * 0.06 * exp(-length(p - mc) * 4.0);

  // the bridge's hangers
  if (abs(p.x) < xt) {
    const float N = 56.0;
    float cell = (p.x / xt * 0.5 + 0.5) * N;
    float hx = ((floor(cell) + 0.5) / N * 2.0 - 1.0) * xt;
    float fa = abs(hx) / xt;
    float band = spec(0.02 + fa * 0.8);
    float yc = cableY(hx, xt, top);
    float on = (1.0 - ss(0.0015, 0.005, abs(p.x - hx))) * step(DECK, p.y) * step(p.y, yc);
    float run = 0.5 + 0.5 * sin(hx * 9.0 - uTravel * 1.2);
    col += pal(fa * 0.6 + run * 0.25 + uTime * 0.02) * on * (0.25 + 2.2 * band) * (0.6 + 0.4 * run);
  }
  // main cable, side spans and deck, strung with lamps
  float cab = abs(p.y - cableY(p.x, xt, top)) + step(xt, abs(p.x)) * 9.0;
  cab = min(cab, min(sdSeg(p, vec2(-xt, top), vec2(-aspect * 1.05, DECK + 0.02)), sdSeg(p, vec2(xt, top), vec2(aspect * 1.05, DECK + 0.02))));
  col += pal(0.55) * (0.0012 / (cab + 0.0016)) * (0.5 + 0.8 * uLevel);
  col += vec3(1.0, 0.85, 0.6) * (0.0010 / (abs(p.y - DECK) + 0.0016)) * (0.6 + 0.4 * step(0.5, fract(p.x * 40.0)));
  for (int s = 0; s < 2; s++) {
    vec2 tv = p - vec2(s == 0 ? -xt : xt, top + 0.012);
    col += vec3(1.0, 0.2, 0.15) * (0.00008 / (dot(tv, tv) + 0.00005)) * (0.3 + exp(-uBeatAge * 4.0) * uPunch);
  }

  // the ferry's saloon windows
  float fx = mod(uCruise * 0.05, 1.0) * aspect * 2.6 - aspect * 1.3;
  vec2 fv = p - vec2(fx, SEA + 0.030);
  float wins = step(abs(fv.x), 0.085) * step(abs(fv.y - 0.012), 0.006) * step(0.35, fract(fv.x * 60.0));
  col += vec3(1.0, 0.85, 0.55) * wins * 1.2;

  // the Maiden's Tower lamp
  vec2 kv = p - vec2(aspect * 0.30, SEA + 0.105);
  col += vec3(1.0, 0.75, 0.4) * (0.00012 / (dot(kv, kv) + 0.00006)) * (0.35 + 1.4 * exp(-uBeatAge * 3.5) * uPunch);

  // the lamps strung between the minarets
  for (int i = 0; i < 9; i++) {
    float u = float(i) / 8.0;
    vec2 lp = vec2(-aspect * 0.86 + u * 0.30, SEA + 0.50 - 0.05 * 4.0 * u * (1.0 - u));
    vec2 lv = p - lp;
    col += pal(0.1 + u * 0.3) * (0.000035 / (dot(lv, lv) + 0.00003)) * (0.2 + 1.6 * spec(0.05 + u * 0.6));
  }
  // windows on the hills
  vec2 g = p * vec2(70.0, 90.0);
  float hh = hash21(floor(g));
  float hill = SEA + 0.06 + 0.16 * ss(aspect * 0.35, aspect * 1.0, abs(p.x)) + 0.05 * fbm(vec2(p.x * 3.0, 2.0));
  col += mix(vec3(1.0, 0.8, 0.5), pal(hh), 0.3) * step(0.80, hh) * step(p.y, hill - 0.01) * step(SEA + 0.01, p.y) * (0.15 + 0.9 * spec(hh * 0.8)) * step(0.3, fract(g.x)) * step(0.3, fract(g.y));
  return col;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float xt = aspect * 0.52, top = DECK + 0.42;
  vec3 col;

  if (p.y >= SEA) {
    col = mix(pal(0.62) * 0.10 + vec3(0.02, 0.025, 0.06), vec3(0.004, 0.006, 0.022), ss(SEA, 0.9, p.y));
    vec2 g = p * 60.0;
    vec2 gc = floor(g);
    float sh = hash21(gc);
    vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
    col += vec3(0.85, 0.9, 1.0) * step(0.95, sh) * (0.0011 / (dot(sf, sf) + 0.002)) * (0.3 + uHigh) * ss(0.0, 0.5, p.y);

    // the two shores
    float hill = SEA + 0.06 + 0.16 * ss(aspect * 0.35, aspect * 1.0, abs(p.x)) + 0.05 * fbm(vec2(p.x * 3.0, 2.0));
    float land = step(p.y, hill);
    // the mosque on the European hill: a great dome, half-domes, four minarets
    vec2 m = p - vec2(-aspect * 0.71, SEA + 0.27);
    float mosque = min(length(m * vec2(1.0, 1.15)) - 0.085, min(length(m - vec2(-0.085, -0.035)) - 0.045, length(m - vec2(0.085, -0.035)) - 0.045));
    mosque = min(mosque, max(abs(m.x) - 0.13, abs(m.y + 0.06) - 0.035));
    for (int i = 0; i < 4; i++) {
      float mx = (float(i) - 1.5) * 0.10;
      float tall = 0.22 - 0.03 * abs(float(i) - 1.5);
      float shaft = max(abs(m.x - mx) - 0.0055, abs(m.y - tall * 0.5 + 0.09) - tall * 0.5);
      float cap = max(abs(m.x - mx) - (tall - 0.09 + 0.035 - m.y) * 0.22, -(m.y - tall + 0.09));
      mosque = min(mosque, min(shaft, max(cap, m.y - tall + 0.09 - 0.035)));
    }
    land = max(land, 1.0 - ss(0.0, 0.003, mosque));
    // bridge towers and the Maiden's Tower are silhouettes too
    float towers = min(max(abs(abs(p.x) - xt) - 0.014, abs(p.y - (SEA + top) * 0.5) - (top - SEA) * 0.5), 1e3);
    vec2 kq = p - vec2(aspect * 0.30, SEA);
    float kiz = min(max(abs(kq.x) - 0.030, abs(kq.y - 0.030) - 0.030), max(abs(kq.x) - 0.011, abs(kq.y - 0.075) - 0.030));
    kiz = min(kiz, max(abs(kq.x) - (0.125 - kq.y) * 0.55, -(kq.y - 0.105)));
    float fxp = mod(uCruise * 0.05, 1.0) * aspect * 2.6 - aspect * 1.3;
    vec2 fq = p - vec2(fxp, SEA);
    float ferry = min(max(abs(fq.x) - 0.105 + fq.y * 0.4, abs(fq.y - 0.014) - 0.014), max(abs(fq.x) - 0.088, abs(fq.y - 0.040) - 0.014));
    ferry = min(ferry, max(abs(fq.x + 0.02) - 0.010, abs(fq.y - 0.068) - 0.016));
    land = max(land, 1.0 - ss(0.0, 0.003, min(min(towers, kiz), ferry)));
    col = mix(col, vec3(0.006, 0.007, 0.012), land);
    col += lights(p, aspect);
  } else {
    float dp = SEA - p.y;
    float wob = (0.006 + 0.010 * uMid) * sin(dp * 120.0 + uTime * 2.0) * (1.0 + dp * 4.0) + 0.012 * (noise(vec2(p.x * 8.0, dp * 60.0 - uTime * 0.7)) - 0.5);
    col = vec3(0.003, 0.006, 0.014) + lights(vec2(p.x + wob, SEA + dp * 1.25), aspect) * (0.62 - 0.35 * ss(0.0, 0.55, dp));
    col *= 0.8 + 0.4 * noise(vec2(p.x * 6.0, dp * 110.0 + uTime * 0.6));
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'bosphorus',
  name: 'Bosphorus',
  group: 'Vibe',
  blurb: 'Istanbul bridge at night; its hanger lights are the spectrum, mirrored in water',
  tags: ['turkish', 'city', 'night', 'water'],
  energy: 0.4,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
