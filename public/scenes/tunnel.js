// TUNNEL — a flight down a sci-fi service tunnel: an octagonal tube of brushed gunmetal, every panel
// carrying a raised plate with bevelled edges and a domed bolt in each corner, some of them grilles
// lit from behind, a status lamp blinking here and there; a ring-frame standing out of the walls
// every twelve panels and a deep gate every fourth frame; a dark polished floor with runway lamps
// down its middle; and no light at all but the strips set into the eight seams and the glow at the
// far end. The tube is intersected exactly (eight planes; two Newton steps bend it through slow
// curves; frames and gates are found from where the ray crosses their inner faces), so the
// perspective is real, the camera banks into each curve, the metal mirrors the strips (a second ray
// across the tube, blurred by each panel's roughness) and the far end sinks into a deep-coloured
// fog. No ray march, no trails. The vanishing point stays in the middle, so a phone held upright
// sees the same tunnel, only taller.
//
// Music:
//  · the eight seam strips are an equaliser laid along the tunnel, mirrored left and right: the two
//    floor seams are the bass, the lower walls the low mids, the upper walls the high mids, the
//    ceiling seams the highs. Each strip burns from the camera out towards the far end, as far as
//    its band is loud (the screen distance of the tip follows the level), and a white peak mark
//    hangs where the band last peaked;
//  · bass: the panels breathe — light presses out through every panel joint and every grille, the
//    band inside each gate swells, and so does the tube;
//  · mids: the lamps on the face of each ring-frame and gate, every frame listening to its own slice
//    of the mids, and the glow at the far end;
//  · highs: sparks and dust streaking past the lens;
//  · each beat: the far end flares and streaks across the lens, the lens opens for a moment like a
//    burst of speed, and a hoop of white light comes racing up the tunnel at you, flaring the strips
//    and lighting the panels as it passes, gone past your shoulders within 0.42 s.
// Louder music flies faster (the engine's eased cruise clock, which never jumps). Every 32 beats the
// livery turns on the downbeat, through a breath of white: cyan strips on gunmetal, then amber on
// graphite, each with status lamps in the other's colour. With nothing playing the tunnel flies on
// through its curves in cyan, the strips at a steady glow, and nothing pulses.
const frag = `
const float HW = 0.41421356;        // half a face's width for an apothem of 1 (tan 22.5 degrees)
const float PL = 0.625;             // panel length along the tunnel (two panels across each face)
const float RIB = 7.5;              // a ring-frame every twelve panels
const float RIBW = 0.42;            // its thickness along the tunnel
const float RIBH = 0.12;            // how far it stands out of the wall
const float GATE = 30.0;            // every fourth frame is a gate: deeper and thicker
const float GATEW = 0.9;
const float GATEH = 0.27;
const float SW = 0.013;             // half width of the light strip in each seam
const float FOG = 0.04;
const float LOOP = 600.0;           // everything (curves, panels, frames) repeats every 600 units
const vec2 NRM[8] = vec2[8](vec2(0.0, -1.0), vec2(0.70710678, -0.70710678), vec2(1.0, 0.0), vec2(0.70710678, 0.70710678),
  vec2(0.0, 1.0), vec2(-0.70710678, 0.70710678), vec2(-1.0, 0.0), vec2(-0.70710678, -0.70710678));
const vec2 TAN[8] = vec2[8](vec2(1.0, 0.0), vec2(0.70710678, 0.70710678), vec2(0.0, 1.0), vec2(-0.70710678, 0.70710678),
  vec2(-1.0, 0.0), vec2(-0.70710678, -0.70710678), vec2(0.0, -1.0), vec2(0.70710678, -0.70710678));
// the seams (corner c lies between face c and face c + 1), for an apothem of 1
const vec2 CRN[8] = vec2[8](vec2(0.41421356, -1.0), vec2(1.0, -0.41421356), vec2(1.0, 0.41421356), vec2(0.41421356, 1.0),
  vec2(-0.41421356, 1.0), vec2(-1.0, 0.41421356), vec2(-1.0, -0.41421356), vec2(-0.41421356, -1.0));
// the slices of the spectrum each pair of seams listens to: floor, lower walls, upper walls, ceiling
const vec3 BANDX[4] = vec3[4](vec3(0.025, 0.055, 0.09), vec3(0.17, 0.22, 0.27), vec3(0.34, 0.41, 0.48), vec3(0.62, 0.72, 0.82));
const float K1 = 0.041887902, K2 = 0.073303829, K3 = 0.052359878;   // 4, 7 and 5 turns per loop

float gZc, gLens, gPx, gR, gDR, gRingA, gRingW, gFlare, gBreath, gMid, gHigh, gSpeed, gAct, gEdge;
float gLvl[4], gPk[4];
vec2 gAx0, gAx1, gFar;
vec3 gStrip, gHot, gFog, gMetal, gTell;

float specL(float x) { return textureLod(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(0.0)), 0.0).r; }
float peakL(float x) { return textureLod(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(2.0)), 0.0).r; }

// the tunnel's axis winds slowly through the rock
vec2 axisAt(float z) { return vec2(1.5 * sin(z * K1 + 0.6) + 0.55 * sin(z * K2 + 2.1), 0.8 * sin(z * K3 + 1.7)); }
vec2 axisSlope(float z) { return vec2(1.5 * K1 * cos(z * K1 + 0.6) + 0.55 * K2 * cos(z * K2 + 2.1), 0.8 * K3 * cos(z * K3 + 1.7)); }
vec2 axisCurve(float z) { return -vec2(1.5 * K1 * K1 * sin(z * K1 + 0.6) + 0.55 * K2 * K2 * sin(z * K2 + 2.1), 0.8 * K3 * K3 * sin(z * K3 + 1.7)); }
// how far the axis at depth d has drifted off the line the camera looks along
vec2 bend(float d) { return axisAt(gZc + d) - gAx0 - gAx1 * d; }
vec2 bendSlope(float d) { return axisSlope(gZc + d) - gAx1; }

// where the straight ray o + d t (in the cross-section) leaves the octagon of apothem r, and through which face
float exitOct(vec2 o, vec2 d, float r, out int face) {
  float best = 400.0;
  face = 0;
  for (int i = 0; i < 8; i++) {
    float b = dot(d, NRM[i]);
    if (b > 1e-5) {
      float t = (r - dot(o, NRM[i])) / b;
      if (t < best) { best = t; face = i; }
    }
  }
  return best;
}
// the octagon's "radius" through q: its apothem if q lies on it
float rho(vec2 q) {
  float m = -1e4;
  for (int i = 0; i < 8; i++) m = max(m, dot(q, NRM[i]));
  return m;
}

// the light strip in seam c, at depth d: its band's bar burns out to a depth set by the level (the
// tip's distance from the middle of the screen follows the level), the rest glows faintly, and a
// white mark hangs where the band last peaked
vec3 stripColor(int c, float d, float soft) {
  int b = c < 4 ? c : 7 - c;
  float s = 1.0 / max(d, 0.05);
  float lv = gLvl[b];
  float tip = mix(0.8, 0.022, lv);
  float lit = ss(tip - 0.012 - soft, tip + 0.012 + soft, s);
  float cap = exp(-abs(s - mix(0.8, 0.022, gPk[b])) * 320.0 / (1.0 + soft * 60.0)) * ss(0.02, 0.1, gPk[b]);
  float run = gRingA * exp(-abs(d - gDR) * 2.5);    // the beat's ring flares the strips as it runs past
  return gStrip * (0.2 + lit * (0.65 + 0.7 * lv) + run * 0.8) + gHot * (cap * 0.8 + run * 0.25);
}
// the light the beat's hoop throws on the walls around it, at depth d (blur: a glossy reflection)
float ringBand(float d, float blur) {
  float w = 0.16 + gRingW + blur;
  float x = d - gDR;
  return gRingA * exp(-x * x / (w * w));
}
// the light given off by the wall of face f at u across it (0 = its middle), depth d, place zw along
// the tunnel; blur widens it (a glossy reflection), fpZ / fpU are a pixel's size there
vec3 glowAt(int f, float u, float d, float zw, float blur, float fpZ, float fpU) {
  float hw = gR * HW;
  int c = u > 0.0 ? f : (f + 7) % 8;
  float dc = max(hw - abs(u), 0.0);
  float w = SW + blur + fpU * 0.6;
  float prof = (SW / w) * exp(-dc * dc / (w * w));
  float wc = SW * 0.4 + blur + fpU * 0.6;
  float core = (SW * 0.4 / wc) * exp(-dc * dc / (wc * wc));
  // the strip is broken where every other panel meets the next
  float jd = (0.5 - abs(fract(zw / (PL * 2.0)) - 0.5)) * PL * 2.0;
  float bz = fpZ + blur;
  float dash = mix(ss(0.025, 0.035 + bz, jd), 0.95, ss(0.05, 0.3, bz));
  vec3 sc = stripColor(c, d, blur * 0.5);
  vec3 e = (sc * prof * 2.0 + vec3(max(sc.r, max(sc.g, sc.b))) * core * 0.9) * dash;
  e += mix(gStrip, gHot, 0.4) * ringBand(d, blur) * 0.03;
  // the runway lamps down the middle of the floor, a chaser racing on ahead
  if (f == 0) {
    float lz = (fract(zw / PL) - 0.5) * PL;
    float lw = 0.02 + blur + fpU * 0.5;
    float lamp = (0.02 / lw) * exp(-(u * u + lz * lz * 0.25) / (lw * lw));
    float chase = 0.18 + 0.82 * pow(ss(0.55, 1.0, fract(zw / (PL * 8.0) - uTime * 1.3)), 3.0);
    e += mix(gStrip, gHot, 0.6) * lamp * chase * 1.6;
  }
  return e;
}
// the fog down the tube, brightest towards the far end (far: where the end lies, seen along r)
vec3 fogColor(vec3 r, vec2 far) {
  float ahead = step(0.0, r.z);
  vec2 e = r.xy / max(abs(r.z), 0.03) - far * ahead;
  float a = length(e);
  vec3 g = mix(gStrip, gHot, 0.4);
  float glow = 0.05 * exp(-a * 1.6) + 0.07 * exp(-a * 9.0) + 0.3 * exp(-a * 45.0);
  return gFog + g * (glow + 0.5 * gFlare * exp(-a * 14.0)) * mix(0.2, 1.0, ahead) * (1.0 + 0.8 * gMid + 1.5 * gFlare);
}
// a rounded rectangle centred on 0: x the distance to it, yz the way out of it
vec3 rrect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  vec2 g = max(q.x, q.y) > 0.0 ? normalize(max(q, 1e-5)) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  return vec3(d, g * sign(p));
}
// which face of the octagon the point q lies against
int faceOf(vec2 q) {
  int f = 0;
  float m = -1e4;
  for (int i = 0; i < 8; i++) { float k = dot(q, NRM[i]); if (k > m) { m = k; f = i; } }
  return f;
}
// the light from the strips falling on a wall point q (inward normal nIn) at depth d
vec3 stripLight(vec2 q, vec2 nIn, float d, int f, float u) {
  vec3 L = vec3(0.0);
  for (int c = 0; c < 8; c++) {
    vec2 v = CRN[c] * gR - q;
    float dist = max(length(v), 1e-3);
    float ndl = max(dot(nIn, v) / dist, 0.0);
    L += stripColor(c, d, 0.12) * ndl / (0.25 + 1.4 * dist);
  }
  // the two strips at this face's own edges light it at a grazing angle, a soft spill beside them
  float hw = gR * HW;
  L += stripColor(f, d, 0.05) * 0.7 * exp(-max(hw - u, 0.0) / 0.05);
  L += stripColor((f + 7) % 8, d, 0.05) * 0.7 * exp(-max(hw + u, 0.0) / 0.05);
  return L;
}
// what a panel mirrors: the reflected ray crosses the tube to the opposite wall, whose strips and
// lamps it sees blurred by the panel's roughness over the distance travelled
vec3 reflection(vec2 q, float d, vec3 r, float rough) {
  int fj;
  float tr = min(exitOct(q, r.xy, gR, fj), 80.0);
  vec2 h = q + r.xy * tr;
  float dh = d + r.z * tr;
  vec3 e = glowAt(fj, dot(h, TAN[fj]), dh, gZc + dh, rough * tr + 0.002 + gEdge, 0.0, 0.0);
  e += mix(gStrip, gHot, 0.3) * gRingA * 0.035 * exp(-abs(dh - gDR) * 3.0);
  float tf = exp(-tr * FOG);
  return e * tf + fogColor(r, vec2(0.0)) * (1.0 - tf);
}

// kind 0: the wall · 1: the inner face of a ring-frame · 2: a ring-frame's face, turned to the camera
// · 3: the inner face of a gate · 4: a gate's face
vec3 surface(int kind, int f, vec2 q, float d, vec3 v, float t) {
  gEdge = 0.0;
  float zw = gZc + d;
  vec2 n2 = NRM[f], t2 = TAN[f];
  float u = dot(q, t2);
  float hw = gR * HW;
  float fpW = t * gPx / gLens;
  bool front = kind == 2 || kind == 4;
  bool gate = kind >= 3;
  vec3 N = front ? vec3(0.0, 0.0, -1.0) : vec3(-n2, 0.0);
  float vn = dot(v, N);
  float cosT = max(abs(vn), 0.04);
  vec3 vp = v - N * vn;
  vp /= max(length(vp), 1e-4);
  float az = vp.z, au = dot(vp.xy, t2);
  // a pixel's size on the surface, along the tunnel and round it
  float fpZ = fpW * sqrt(az * az / (cosT * cosT) + 1.0 - az * az);
  float fpU = fpW * sqrt(au * au / (cosT * cosT) + 1.0 - au * au);

  float pz = zw / PL;
  float pid = mod(floor(pz), LOOP / PL);
  float lz = fract(pz);
  float jd = (0.5 - abs(lz - 0.5)) * PL;
  vec2 pk = vec2(pid, float(f) * 2.0 + step(0.0, u) + float(kind) * 16.0);
  float h1 = hash21(pk + 0.37), h2 = hash21(pk + 5.1);
  float dc = hw - abs(u);                          // to the seam at the corner
  float dm = abs(u);                               // to the joint down the middle of the face

  // brushed metal: fine streaks along the tunnel, gone where a pixel covers several
  float fine = ss(0.012, 0.004, fpU);
  float brush = (noise(vec2(u * 140.0 + h1 * 50.0, zw * 6.0)) - 0.5) * fine * 0.5;
  float rough = (f == 0 ? mix(0.004, 0.012, h2) : mix(0.016, 0.04, h2)) * (kind == 0 ? 1.0 : 1.8) * (1.0 + 0.6 * brush);
  bool floor0 = kind == 0 && f == 0;               // the floor: darker, polished, a mirror of the tube
  vec3 alb = gMetal * (0.8 + 0.4 * h1) * (1.0 + 0.5 * brush) * (floor0 ? 0.55 : 1.0);

  vec3 Nb = N;
  float groove = 0.0, joint = 0.0, vent = 0.0, plateDark = 0.0, led = 0.0;
  if (kind == 0) {
    // bevelled panel edges: the near one turned to the camera, the far one down the tunnel
    float tz = ss(0.045, 0.012, jd) * sign(lz - 0.5) * 0.6 * ss(0.08, 0.02, fpZ);
    float tu = (ss(0.05, 0.025, dc) - ss(0.04, 0.008, dm)) * sign(u) * 0.5 * ss(0.08, 0.02, fpU);
    Nb = normalize(N + vec3(t2 * tu, tz));
    joint = ss(0.01 + fpZ * 0.5, 0.003, jd) * ss(0.2, 0.04, fpZ);
    groove = max(joint, ss(0.008 + fpU * 0.5, 0.002, dm) * ss(0.2, 0.04, fpU));
    // a raised plate on every panel, its edge bevelled, a domed bolt in each corner of the border
    // round it; on some wall panels a grille of slots, lit from behind. All of it fades into the
    // plain metal where a pixel grows too large to hold it
    float fpI = max(fpU, fpZ);
    float near = ss(0.016, 0.006, fpI);
    vec2 pp = vec2(dm - hw * 0.5, (lz - 0.5) * PL);
    vec2 pb = vec2(hw * 0.5, PL * 0.5);
    vec3 rr = rrect(pp, pb - 0.042, 0.03);
    vec3 gd = vec3(t2 * sign(u) * rr.y, rr.z);
    float bev = ss(-0.016 - fpI, -0.011, rr.x) * (1.0 - ss(-0.003, fpI, rr.x)) * near;
    Nb = normalize(Nb + gd * bev * 0.9);
    groove = max(groove, ss(0.0035 + fpI, 0.0015, abs(rr.x - 0.002)) * near * 0.75);
    vec2 bq = abs(pp) - (pb - 0.021);
    float bd = length(bq);
    float bolt = ss(0.0075 + fpI * 0.7, 0.0075 - fpI * 0.7, bd) * near;
    Nb = normalize(Nb + vec3(t2 * sign(u) * sign(pp.x) * bq.x, sign(pp.y) * bq.y) / 0.0075 * bolt * 0.8);
    plateDark = 0.18 * bolt * ss(0.004, 0.0075, bd);
    // a turning edge mirrors a blur, not a glint thinner than a pixel
    gEdge = (abs(tz) + abs(tu) + bev + bolt) * 0.035 * ss(0.0, 0.006, fpI);
    if (f != 0 && hash21(pk + 23.7) < 0.24) {
      float inV = ss(fpI, -fpI, max(abs(pp.x) - (pb.x - 0.085), abs(pp.y) - (pb.y - 0.09)));
      float sl = abs(fract(pp.x / 0.028) - 0.5) * 0.028;          // to the middle of the nearest slot
      float slot = mix(ss(0.0065 + fpU * 0.6, 0.0065 - fpU * 0.6, sl), 0.46, ss(0.005, 0.011, fpU));
      vent = inV * slot * ss(0.06, 0.03, fpI);
    }
    // here and there a status lamp on a plate, blinking to itself, in the livery's opposite colour:
    // a capsule in a dark bezel, shrinking to a point of light far off
    float h3 = hash21(pk + 11.3);
    if (f != 0 && h3 > 0.9) {
      float cd = length(vec2(max(abs(pp.x) - 0.022, 0.0), pp.y - 0.235));
      float lit = step(0.35, fract(uTime * (0.15 + 0.3 * fract(h3 * 37.0)) + h3 * 9.0));
      plateDark = max(plateDark, 0.65 * ss(0.0125 + fpI, 0.0125, cd) * near);
      led = lit * (ss(0.0065 + fpI, 0.0065 - fpI * 0.5, cd) * 0.0065 / max(0.0065, fpI) + 0.1 * exp(-cd / 0.018));
    }
  }

  vec3 light;
  if (front) {
    // a frame's face: lit by the strips running up to it from the camera's side
    float da = length(CRN[f] * gR - q), db = length(CRN[(f + 7) % 8] * gR - q);
    light = stripColor(f, d - 0.3, 0.05) * 0.12 / (0.02 + da * da * 3.0) + stripColor((f + 7) % 8, d - 0.3, 0.05) * 0.12 / (0.02 + db * db * 3.0);
  } else {
    light = stripLight(q, kind == 0 ? normalize(Nb.xy) : -n2, d, f, u) + mix(gStrip, gHot, 0.4) * 0.6 * max(Nb.z, 0.0);
  }
  // the ring washes everything it passes (a frame's face only once it is in front of it)
  float wash = ringBand(d, 0.0) * (front ? step(gDR, d) : 1.0);
  light = light * 0.3 + mix(gStrip, gHot, 0.5) * wash * 0.8 + gFog * 3.0;
  vec3 col = alb * light;

  // what the metal mirrors
  vec3 rv = reflect(v, Nb);
  rv = normalize(rv - N * min(dot(rv, N) - 0.02, 0.0));   // a tilted edge seen edge-on must not mirror into the wall
  float cv = max(dot(-v, Nb), 0.0);
  float F = (floor0 ? 0.62 : 0.3) + (floor0 ? 0.38 : 0.7) * pow(1.0 - cv, 5.0);
  vec3 tint = mix(vec3(1.0), gMetal / max(max(gMetal.r, gMetal.g), gMetal.b), 0.4);
  col += reflection(q, d, rv, rough) * F * tint;

  if (kind == 0) {
    col += glowAt(f, u, d, zw, 0.0, fpZ, fpU);
    // shadowed in the corner where a frame meets the wall
    float rp = abs(zw - RIB * floor(zw / RIB + 0.5)) - RIBW * 0.5;
    float gp = abs(zw - GATE * floor(zw / GATE + 0.5)) - GATEW * 0.5;
    col *= (1.0 - 0.5 * exp(-max(rp, 0.0) / 0.12)) * (1.0 - 0.6 * exp(-max(gp, 0.0) / 0.3));
  } else {
    col += mix(gStrip, gHot, 0.4) * ringBand(d, 0.0) * 0.03;
  }
  // the panels breathe with the bass: light presses out through every joint and every grille
  col *= (1.0 - 0.8 * groove) * (1.0 - 0.85 * vent) * (1.0 - plateDark);
  col += gStrip * gBreath * (joint * 0.6 + 0.07 * exp(-jd / 0.04) * ss(0.4, 0.1, fpZ) + 0.025 * ss(0.1, 0.4, fpZ));
  col += gStrip * vent * (0.025 + 0.9 * gBreath);
  col += gTell * led * 1.3;

  if (front) {
    // the lamps round a frame's face, every frame its own slice of the mids (a gate has two rows)
    float fh = gate ? GATEH : RIBH;
    float e = rho(q) - (gR - fh);                      // 0 at its inner edge, fh at the wall
    float rid = mod(floor((zw + RIBW) / RIB), LOOP / RIB);
    float m = gAct * clamp(specL(0.16 + 0.36 * hash11(rid * 3.7 + 0.2)) * 1.6, 0.0, 1.0);
    float cell = abs(fract(u / (hw * 0.4) + 0.5) - 0.5) * hw * 0.4;
    float soft = fpW + 0.002;
    float row = gate ? min(abs(e - 0.09), abs(e - 0.19)) : abs(e - RIBH * 0.5);
    float lamp = ss(0.05 + soft, 0.05 - soft, cell) * ss(0.011 + soft, 0.011 - soft, row);
    lamp = mix(0.55 * 0.22 * ss(0.03, 0.0, row), lamp, ss(0.012, 0.004, fpW));   // far off, a band
    col += mix(gStrip, gHot, 0.5) * lamp * (0.25 + 2.6 * m);
    col += mix(gStrip, gHot, 0.5) * 0.1 * m * exp(-row / 0.03);
    // a gate's rim is a strip of its own
    if (gate) col += gStrip * 0.9 * ss(0.016 + soft, 0.008, e);
  } else if (kind == 3) {
    // a band of light round the inside of a gate, breathing with the bass
    float gq = abs(zw - GATE * floor(zw / GATE + 0.5));
    float bw = 0.06 + fpZ;
    col += gStrip * (0.35 + 1.6 * gBreath) * (0.06 / bw) * ss(bw, bw * 0.5, gq);
  }
  return col;
}

// sparks and dust streaking past the lens, in rings of cells round the view
vec3 sparks(vec3 rd) {
  vec2 sp = rd.xy / rd.z;
  float r = length(sp);
  if (r < 0.002) return vec3(0.0);
  float a = atan(sp.y, sp.x);
  vec3 acc = vec3(0.0);
  float span = 12.5;                               // (48, 60 and 72 cycles per loop of the world)
  float len = 0.05 + gSpeed * 0.03;                // how far a speck flies while the shutter is open
  float px = gPx / gLens;
  float dens = 0.18 + 0.55 * gHigh;
  vec3 tone = mix(gHot, gStrip, 0.35);
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float N = 46.0 + 30.0 * fl;
    float cell = floor((a / TAU + 0.5) * N);
    float ph = hash21(vec2(cell, fl) + 0.5) * span + gZc * (1.0 + 0.25 * fl);
    float cyc = floor(ph / span);
    float dz = span - (ph - cyc * span);           // how far ahead of the camera it is
    float hv = hash21(vec2(cell * 1.7 + fl * 31.0, mod(cyc, LOOP / span * (1.0 + 0.25 * fl))));
    if (hv > dens) continue;
    float rad = 0.15 + 0.75 * fract(hv * 13.7 + 0.3);
    float ang = ((cell + 0.2 + 0.6 * fract(hv * 7.3)) / N - 0.5) * TAU;
    float rh = rad / max(dz, 0.05), rt = rad / (dz + len);
    float w = px * (0.8 + 0.5 / max(dz, 0.3));
    float da = abs(a - ang) * r;
    float along = ss(rt - w, rt + w, r) * ss(rh + w, rh - w, r) * mix(0.35, 1.0, ss(rt, rh, r));
    float fade = ss(span, span * 0.55, dz) * ss(0.2, 0.7, dz);
    acc += tone * exp(-da * da / (w * w)) * along * fade * (0.5 + 2.2 * gHigh) * (px / w);
  }
  return acc;
}

void main() {
  vec2 uv = centered();
  float asp = uRes.x / uRes.y;
  float pf = ss(1.15, 0.7, asp);                   // 1 for a phone held upright
  gLens = mix(1.7, 1.4, pf);
  gPx = 2.0 / uRes.y;
  gAct = uAudioActive;
  float age = uBeatAge;
  gMid = gAct * clamp(uMid * 1.4, 0.0, 1.0);
  gHigh = gAct * clamp(uHigh * 1.6, 0.0, 1.0);
  gBreath = gAct * ss(0.3, 0.95, uBass);
  for (int b = 0; b < 4; b++) {
    vec3 x = BANDX[b];
    float l = (specL(x.x) + specL(x.y) + specL(x.z)) / 3.0;
    float p = max(peakL(x.x), max(peakL(x.y), peakL(x.z)));
    float idle = 0.78 + 0.06 * sin(uTime * 0.35 + float(b) * 1.9);
    gLvl[b] = mix(idle, gAct * clamp(l * 1.35, 0.0, 1.0), gAct);
    gPk[b] = gAct * clamp(p * 1.35, 0.0, 1.0);
  }
  // the livery: cyan on gunmetal, amber on graphite, turning every 32 beats on the downbeat
  float sec = gAct * floor(uBeatCount / 32.0);
  float turn = gAct * step(0.5, sec) * step(mod(uBeatCount, 32.0), 0.5) * (1.0 - ss(0.0, 0.35, age));
  float liv = abs(mod(sec, 2.0) - turn);
  gStrip = mix(vec3(0.16, 0.92, 1.5), vec3(2.0, 0.74, 0.14), liv);
  gHot = mix(vec3(1.5, 2.2, 2.6), vec3(2.6, 1.9, 1.15), liv);
  gFog = mix(vec3(0.004, 0.016, 0.034), vec3(0.03, 0.009, 0.004), liv);
  gMetal = mix(vec3(0.10, 0.115, 0.13), vec3(0.10, 0.094, 0.088), liv);
  gTell = mix(vec3(2.2, 0.55, 0.12), vec3(0.2, 1.1, 1.6), liv);

  // the beat: the far end flares and a ring of light races up the tunnel and past the camera
  float hit = gAct * uPunch;
  float ra = clamp(age / 0.42, 0.0, 1.0);
  gDR = 40.0 * exp(-4.4 * ra) - 0.5;              // it grows on screen at a steady rate and is past you at 0.42 s
  gRingW = 0.04 + 0.12 * ss(0.4, 1.0, ra);         // (smeared by its own speed as it comes close)
  gRingA = hit * ss(0.0, 0.05, age) * (1.0 - ss(0.36, 0.42, age));
  gFlare = hit * exp(-age * 9.0);
  gR = 1.0 + 0.03 * gBreath;

  // the flight: cruising, faster when the music is louder (the engine's eased clock, so it never
  // jumps, not even when the music stops), and every kick opens the lens for a moment, the way a
  // burst of speed feels
  float kick = hit * ss(0.0, 0.035, age) * exp(-age * 7.0);
  gLens *= 1.0 - 0.075 * kick;
  gZc = mod(uCruise * 3.6, LOOP);
  gSpeed = uCruiseRate * 3.6 * (1.0 + 2.5 * kick);
  gAx0 = axisAt(gZc);
  gAx1 = axisSlope(gZc);
  gFar = bend(45.0) / 45.0;

  // the camera banks into the curve, and sways a little
  float roll = clamp(axisCurve(gZc).x * 40.0, -0.22, 0.22) + 0.03 * sin(uTime * 0.21);
  vec3 rd = normalize(vec3(uv, gLens));
  float cr = cos(roll), sr = sin(roll);
  rd.xy = vec2(cr * rd.x + sr * rd.y, -sr * rd.x + cr * rd.y);

  // the tube, bent: each step straightens it around the depth the last one reached
  // (far down the tube the straightened tube may no longer contain the camera: then the last good
  // answer stands, and beyond 150 units there is only fog)
  vec2 oo = vec2(0.0), dd = rd.xy;
  int face = 0;
  float t = exitOct(oo, dd, gR, face);
  float dz = t * rd.z;
  for (int k = 0; k < 2; k++) {
    float zk = min(dz, 70.0);
    vec2 B = bend(zk), Bd = bendSlope(zk);
    vec2 o2 = -B + Bd * zk, d2 = rd.xy - Bd * rd.z;
    if (rho(o2) > gR - GATEH - 0.02) break;
    int f2;
    float t2 = exitOct(o2, d2, gR, f2);
    if (t2 <= 0.0) break;
    oo = o2; dd = d2; t = t2; face = f2;
    dz = t * rd.z;
  }
  // the ring-frames: the ray reaches the frames' inner faces before the wall
  int faceH;
  float tH = exitOct(oo, dd, gR - RIBH, faceH);
  float zH = tH * rd.z;
  float zHw = gZc + zH;
  float ph = zHw - RIB * floor(zHw / RIB + 0.5);
  int kind = 0;
  float th = t;
  if (abs(ph) < RIBW * 0.5) { kind = 1; th = tH; face = faceH; }
  else {
    float zs = (floor((zHw + RIBW * 0.5) / RIB) + 1.0) * RIB - RIBW * 0.5 - gZc;   // the next frame's face
    if (zs < dz) { kind = 2; th = zs / rd.z; }
  }
  // the gates, deeper: the ray may reach one before any frame
  int faceG;
  float tG = exitOct(oo, dd, gR - GATEH, faceG);
  float zGw = gZc + tG * rd.z;
  float phG = zGw - GATE * floor(zGw / GATE + 0.5);
  if (abs(phG) < GATEW * 0.5) { if (tG < th) { kind = 3; th = tG; face = faceG; } }
  else {
    float tsG = ((floor((zGw + GATEW * 0.5) / GATE) + 1.0) * GATE - GATEW * 0.5 - gZc) / rd.z;   // the next gate's face
    if (tsG < th) { kind = 4; th = tsG; }
  }
  vec2 q = oo + dd * th;
  if (kind == 2 || kind == 4) face = faceOf(q);
  vec3 v = normalize(vec3(dd, rd.z));
  float d = th * rd.z;
  vec3 col = fogColor(rd, gFar);
  if (th < 150.0) {
    float tf = exp(-max(th, 0.0) * FOG);
    col = surface(kind, face, q, d, v, th) * tf + col * (1.0 - tf);
  }

  // the lit lip of the frame nearest to where the ray grazes them, drawn across its edge
  {
    float ks = floor((zHw + RIBW * 0.5) / RIB + 0.5);
    float zs = ks * RIB - RIBW * 0.5 - gZc;
    if (zs > 0.05 && zs < d + 0.3) {
      float ts = zs / rd.z;
      float e = rho(rd.xy * ts - bend(zs)) - (gR - RIBH);
      float w = 0.004 + ts * gPx / gLens;
      col += mix(gStrip, gHot, 0.3) * 0.7 * (0.004 / w) * exp(-e * e / (w * w)) * exp(-ts * FOG);
    }
  }
  {
    float kg = floor((zGw + GATEW * 0.5) / GATE + 0.5);
    float zs = kg * GATE - GATEW * 0.5 - gZc;
    if (zs > 0.05 && zs < d + 0.3) {
      float ts = zs / rd.z;
      float e = rho(rd.xy * ts - bend(zs)) - (gR - GATEH);
      float w = 0.005 + ts * gPx / gLens;
      col += gStrip * 0.9 * (0.005 / w) * exp(-e * e / (w * w)) * exp(-ts * FOG);
    }
  }
  // the ring itself, a hoop of light just inside the walls, and its halo
  // (it runs just inside the gates' inner edge, so nothing in the tube ever cuts it)
  if (gRingA > 0.0 && gDR > 0.05 && gDR < d + 0.2) {
    float tr = gDR / rd.z;
    float x = rho(rd.xy * tr - bend(gDR)) - (gR - GATEH - 0.05);
    float pw = tr * gPx / gLens;                   // a pixel, out there
    float cw = 0.005 + pw;
    float core = (0.005 + pw * 0.5) / cw * exp(-x * x / (cw * cw));
    float halo = exp(-abs(x) / (0.03 + 3.0 * pw)) * 0.35 + exp(-abs(x) / (0.12 + 6.0 * pw)) * 0.12;
    col += (vec3(1.6) * core + gHot * halo + gStrip * 0.05 * exp(-max(-x, 0.0) / 0.4)) * gRingA * exp(-gDR * FOG);
  }
  col += sparks(rd);
  // the lens streaks the glow at the far end across the frame, and flares it on the beat
  {
    vec2 fe = uv - vec2(cr * gFar.x - sr * gFar.y, sr * gFar.x + cr * gFar.y) * gLens;
    float streak = exp(-abs(fe.y) * 140.0) + 0.2 * exp(-abs(fe.y) * 30.0);
    col += mix(gStrip, gHot, 0.5) * streak * exp(-abs(fe.x) * 1.3) * (0.025 + 0.4 * gFlare);
  }
  col += (hash21(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

export default {
  id: 'tunnel',
  name: 'Tunnel',
  group: 'Show',
  blurb: 'Fly down a gunmetal tunnel whose seam lights are an equaliser; each beat sends a ring of light racing at you',
  tags: ['3d', 'geometric', 'intense', 'sci-fi'],
  energy: 0.8,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
