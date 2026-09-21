// LORENZ — the butterfly attractor, integrated live inside every pixel.
//
// Lorenz's 1963 weather toy:  x' = σ(y−x),  y' = x(ρ−z) − y,  z' = xy − βz.  It has two unstable
// fixed points — the eyes of the two wings — and a trajectory spirals outward around one until it
// is thrown across to the other, forever, never repeating. Nothing stores the curve between
// frames, so every pixel re-integrates six trajectories from scratch (RK2: plain Euler inflates
// the spiral) and accumulates glow where they pass nearby; the phosphor trails keep what the
// earlier frames drew. One filament per band — filament k's seed orbits its fixed point at a
// radius set by spec() at a fixed x, so the bass filaments hug the core of a wing while the treble
// ones ride the rim where the crossings happen. Bass bends ρ (how far the wings open), mid bends
// σ (how hard the beam is dragged between them), and on every beat the four low filaments and the
// two high ones swap fixed points, throwing the picture to the other lobe. Brightness follows the
// real oscilloscope law — energy per unit length — so the phosphor burns where the beam crawls and
// only streaks across the fast jumps. The view is normalised by the fixed points, so ρ reshapes
// the butterfly without resizing it.
const frag = `
const float BETA = 2.6666667;

vec3 flow(vec3 st, float sg, float rh) {
  return vec3(sg * (st.y - st.x), st.x * (rh - st.z) - st.y, st.x * st.y - BETA * st.z);
}
// x across, z up: the classic mask view. .z of the result is depth, for the haze and the thickness.
vec3 screenPos(vec3 st, float X0, float zc, float ca, float sa) {
  return vec3((st.x * ca - st.y * sa) / X0 * 0.52,
              (st.z - zc) / zc * 0.86 - 0.04,
              (st.x * sa + st.y * ca) / (2.6 * X0));
}

void main() {
  vec2 p = centered() * (1.0 - uBeat * 0.008 * uPunch);

  float rho = 26.0 + 15.0 * uBass;     // below ~24.74 the attractor collapses into a fixed point
  float sig = 8.0 + 6.0 * uMid;
  float zc  = rho - 1.0;
  float X0  = sqrt(BETA * zc);         // the fixed points sit at (±X0, ±X0, zc)
  float yaw = 0.20 * sin(uTime * 0.07) + 0.13 * uBalance;   // stereo turns the tube a little
  float ca = cos(yaw), sa = sin(yaw);

  // the six bands, read once up here: a texture fetch has no business inside the march
  float band[6];
  band[0] = spec(0.05); band[1] = spec(0.16); band[2] = spec(0.30);
  band[3] = spec(0.46); band[4] = spec(0.64); band[5] = spec(0.86);

  const int FIL = 6, STEPS = 38;
  const float DT = 0.016;              // 38 steps ≈ 0.61 s of model time ≈ one turn around a wing
  vec3 phos = pal(0.42);
  vec3 col = vec3(0.0);

  for (int i = 0; i < FIL; i++) {
    float fi = float(i);
    float bnd = band[i];

    // Lorenz is symmetric under (x, y) -> (-x, -y): reflecting the seed lands it on the other wing
    float grp = fi < 3.5 ? 0.0 : 1.0;
    float lobe = mod(uBeatCount + grp, 2.0) < 0.5 ? 1.0 : -1.0;
    lobe = mix(-lobe, lobe, ss(0.0, 0.17, uBeatAge));        // the swing over, done inside 0.17 s

    // the seed creeps around its fixed point, so consecutive frames start close and then diverge —
    // the near end of the trace holds still while the far end whips across the attractor
    float ph  = uCruise * 1.6 + fi * 2.39 + hash11(fi * 3.7 + 0.4) * TAU;
    float rad = 1.6 + fi * 1.35 + bnd * 3.2 + uLevel;
    vec3 st = vec3(lobe * X0, lobe * X0, zc)
            + rad * vec3(cos(ph), 0.7 * sin(ph), 1.3 * sin(ph * 0.73 + fi));

    vec3 ink = pal(0.06 + fi * 0.115 + uTime * 0.01);
    vec3 q0 = screenPos(st, X0, zc, ca, sa);
    for (int k = 0; k < STEPS; k++) {
      vec3 stm = st + flow(st, sig, rho) * (DT * 0.5);
      st += flow(stm, sig, rho) * DT;
      vec3 q1 = screenPos(st, X0, zc, ca, sa);

      vec2 pa = p - q0.xy, ba = q1.xy - q0.xy;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0);
      float d = length(pa - ba * h);
      float dep = clamp(0.5 + 0.5 * mix(q0.z, q1.z, h), 0.0, 1.0);
      float w = (0.0035 + 0.006 * bnd) * (0.8 + 0.4 * dep);
      float crawl = 0.04 / (length(ba) + 0.022);             // the scope's own brightness law
      col += ink * (w * w / (d * d + w * w)) * crawl * (0.3 + 1.7 * bnd) * (0.55 + 0.45 * dep);
      q0 = q1;
    }
  }

  // the two fixed points themselves, breathing with the bass that moves them
  vec3 cp = screenPos(vec3(X0, X0, zc), X0, zc, ca, sa);
  float dc = min(length(p - cp.xy), length(p - vec2(-cp.x, cp.y)));
  col += phos * (0.0007 / (dc * dc + 0.0007)) * (0.2 + 0.7 * uBass);

  // the graticule etched on the glass
  float lw = 1.2 / uRes.y;
  vec2 g = abs(fract(p * 4.0 + 0.5) - 0.5) * 0.25;
  col += phos * (1.0 - ss(0.0, lw * 2.0, min(g.x, g.y))) * (0.018 + 0.03 * uLevel);
  col += phos * (1.0 - ss(0.0, lw * 3.0, min(abs(p.x), abs(p.y + 0.04)))) * 0.05;

  float r = length(p * vec2(0.62, 1.0));
  col += phos * 0.05 * exp(-uBeatAge * 9.0) * uPunch;        // the tube blooms as the beam jumps
  col += phos * 0.014 * exp(-r * 1.6) * (0.3 + uLevel);
  col *= 1.0 - 0.35 * ss(0.4, 1.15, r);
  col *= 0.95 + 0.05 * sin(vUv.y * uRes.y * PI);             // scan
  col += vec3(0.010, 0.013, 0.012);                          // unlit phosphor is never quite black
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'lorenz',
  name: 'Lorenz',
  group: 'Lab',
  blurb: 'Butterfly attractor traced live; bass bends rho, mids sigma, beats throw the beam to the other lobe',
  tags: ['science', 'abstract', 'light'],
  energy: 0.55,
  particles: 0,
  trails: 0.85,
  zoom: 1,
  spin: 0,
  frag,
};
