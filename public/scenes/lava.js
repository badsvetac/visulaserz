// LAVA — three lava lamps in a dark room.
//
// The wax is a 2-D metaball field: every blob adds r²/d² and the surface is where the sum passes
// one, which is why blobs bulge toward each other and merge the way hot wax does. The field's
// gradient doubles as a surface normal, so the flat field is lit like a round thing. Each blob
// swells with its own band, the convection runs on the travel clock (louder is faster), and the
// wall behind glows with the level.
const frag = `
const int N = 9;
float lampHalf(float y) { return mix(0.33, 0.17, clamp((y + 0.62) / 1.30, 0.0, 1.0)); }     // the vessel tapers toward the cap

void main() {
  vec2 p = centered();
  float li = clamp(floor(p.x / 1.12 + 0.5), -1.0, 1.0);                 // which of the three lamps this pixel belongs to
  float sc = li == 0.0 ? 1.0 : 0.82;
  vec2 q = vec2(p.x - li * 1.12, p.y + (1.0 - sc) * 0.98) / sc;
  float seed = li * 17.0 + 3.0;
  float hue = li * 0.27;

  // the room
  vec3 col = pal(0.1 + hue) * 0.10 * exp(-length(q * vec2(0.9, 0.6)) * 1.3) * (0.5 + uLevel);
  col += pal(0.1 + hue) * 0.05 * exp(-abs(p.y + 0.98) * 14.0) * exp(-abs(q.x) * 2.0);                 // glow on the table

  float inY = step(-0.62, q.y) * step(q.y, 0.68);
  float hw = lampHalf(q.y);
  if (inY > 0.5 && abs(q.x) < hw) {
    float f = 0.0;
    vec2 grad = vec2(0.0);
    for (int i = 0; i < N; i++) {
      float fi = float(i);
      float h1 = hash11(fi * 3.1 + seed), h2 = hash11(fi * 5.7 + seed * 1.3);
      float cyc = uTravel * 0.02 * (0.5 + h1) + h2 * TAU;
      float y = 0.02 + 0.58 * sin(cyc);
      float x = (h2 - 0.5) * 0.9 * lampHalf(y) + 0.04 * sin(cyc * 1.7 + fi);
      float r = (0.042 + 0.034 * h1) * (1.0 + 0.55 * spec(0.03 + h2 * 0.6)) * (1.0 + 0.10 * uBeat * uPunch);
      vec2 d = q - vec2(x, y);
      d.y *= 1.0 - 0.2 * abs(cos(cyc));                                    // stretched while it is moving fastest
      float d2 = dot(d, d) + 1e-4;
      f += r * r / d2;
      grad -= 2.0 * r * r * d / (d2 * d2);
    }
    float yb = q.y + 0.66, yt = q.y - 0.72;                              // wax pooled at the bottom, a little stuck under the cap
    f += 0.010 / (yb * yb + 0.004) + 0.003 / (yt * yt + 0.004);
    grad.y -= 2.0 * 0.010 * yb / ((yb * yb + 0.004) * (yb * yb + 0.004)) + 2.0 * 0.003 * yt / ((yt * yt + 0.004) * (yt * yt + 0.004));

    float hgt = (q.y + 0.62) / 1.30;
    vec3 liquid = pal(0.62 + hue) * (0.025 + 0.07 * (1.0 - hgt)) + pal(0.1 + hue) * ss(0.35, 1.0, f) * 0.14;
    float bulge = clamp((f - 1.0) / f, 0.0, 1.0);
    vec3 n = normalize(vec3(-normalize(grad + 1e-5) * (1.0 - bulge), bulge + 0.25));
    vec3 wax = mix(pal(0.04 + hue), pal(0.30 + hue), hgt);
    float diff = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.35, -0.55, 0.75))), 0.0);             // the bulb is underneath
    vec3 waxCol = wax * diff * (0.75 + 0.6 * uLevel) + vec3(1.0) * pow(max(n.z, 0.0), 24.0) * 0.12 + wax * pow(1.0 - n.z, 2.0) * 0.5;
    col = mix(liquid, waxCol, ss(0.97, 1.03, f));

    // glass: edges, and a tall reflection down the left
    float ex = abs(q.x) / hw;
    col += vec3(0.5, 0.55, 0.6) * ss(0.93, 1.0, ex) * 0.35;
    float rx = (q.x + 0.62 * hw) / 0.02;
    col += vec3(1.0) * exp(-rx * rx) * 0.10 * ss(-0.55, -0.3, q.y) * (1.0 - ss(0.4, 0.62, q.y));
  }

  // cap and base, spun aluminium
  float capHalf = mix(0.17, 0.11, clamp((q.y - 0.68) / 0.20, 0.0, 1.0));
  float capM = step(0.68, q.y) * step(q.y, 0.88) * step(abs(q.x), capHalf);
  float by = clamp((q.y + 0.98) / 0.36, 0.0, 1.0);
  float baseHalf = mix(0.30, 0.20, ss(0.0, 0.5, by)) + (0.33 - 0.20) * ss(0.5, 1.0, by);
  float baseM = step(-0.98, q.y) * step(q.y, -0.62) * step(abs(q.x), baseHalf);
  float mh = capM > 0.5 ? capHalf : baseHalf;
  float mx = q.x / max(mh, 0.01);
  vec3 metal = vec3(0.10, 0.10, 0.12) + vec3(0.55) * exp(-(mx + 0.35) * (mx + 0.35) * 9.0) + pal(0.1 + hue) * 0.12 * (1.0 - abs(mx));
  col = mix(col, metal * (0.7 + 0.3 * sin(q.y * 160.0) * 0.2), max(capM, baseM));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'lava',
  name: 'Lava',
  group: 'Things',
  blurb: 'Three lava lamps in a dark room; wax blobs swell per band and rise faster loud',
  tags: ['retro', 'organic', 'calm'],
  energy: 0.2,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
