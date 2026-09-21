const frag = `
float beam(vec2 p, vec2 o, float ang, float width) {
  vec2 dir = vec2(sin(ang), cos(ang));
  vec2 v = p - o;
  float along = dot(v, dir);
  float perp = abs(v.x * dir.y - v.y * dir.x);
  float core = width / (perp + width);
  float glow = exp(-perp * perp * 300.0) * 0.35 + exp(-perp * 6.0) * 0.08;
  return (core * core * 2.2 + glow) * step(0.0, along) * exp(-along * 0.22);
}
void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  // beams are only visible where they cross smoke, so modulate everything by drifting haze
  float haze = 0.45 + 0.75 * fbm(p * 1.6 + vec2(uTime * 0.05, -uTime * 0.03));
  vec3 col = vec3(0.0);
  float pattern = mod(floor(uBeatCount / 8.0), 4.0);      // the rig changes its look every 8 beats
  const int EMIT = 5;
  const int BEAMS = 5;
  for (int e = 0; e < EMIT; e++) {
    float fe = float(e) / float(EMIT - 1);
    vec2 o = vec2((fe * 2.0 - 1.0) * aspect * 0.82, -1.02);
    for (int b = 0; b < BEAMS; b++) {
      float fb = float(b) / float(BEAMS - 1) - 0.5;
      float k = float(e * BEAMS + b);
      float s = spec(0.04 + 0.8 * fract(k * 0.618));       // every beam listens to its own frequency band
      float gate = ss(0.16, 0.38, s);
      float ang;
      if (pattern < 0.5)      ang = fb * (0.5 + 1.6 * uBass);
      else if (pattern < 1.5) ang = fb * 0.5 + sin(uTime * 0.9 + fe * PI) * 0.7;
      else if (pattern < 2.5) ang = sin(uTime * 1.3 + k * 0.7) * 0.9;
      else                    ang = (hash11(k + floor(uBeatCount) * 7.0) - 0.5) * 1.8;
      ang += (0.5 - fe) * 0.5 - uBalance * 0.2;
      col += pal(fe * 0.6 + float(b) * 0.07 + uTime * 0.02) * beam(p, o, ang, 0.005) * gate * (0.8 + 1.6 * s) * 1.6;
    }
    col += vec3(1.0) * 0.012 / (length(p - o) + 0.03);        // hot spot on the emitter itself
  }
  // two moving heads in the top corners sweep across the floor
  for (int e = 0; e < 2; e++) {
    float side = e == 0 ? -1.0 : 1.0;
    vec2 o = vec2(side * aspect * 0.92, 1.05);
    for (int b = 0; b < 3; b++) {
      float k = float(30 + e * 3 + b);
      float s = spec(0.5 + 0.45 * fract(k * 0.618));
      float gate = ss(0.12, 0.3, s);
      float ang = PI - side * (0.55 + 0.35 * sin(uTime * 0.7 + float(b) * 1.1 + float(e) * 2.0) + uBass * 0.25);
      col += pal(0.3 + float(b) * 0.1 + uTime * 0.02) * beam(p, o, ang, 0.004) * gate * (0.8 + 1.6 * s) * 1.4;
    }
  }
  col *= haze;
  col += pal(0.5) * 0.10 * exp(-(p.y + 1.0) * 2.2) * (0.4 + uBass);
  col *= 1.0 + uBeat * 0.4 * uPunch;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'lasers',
  name: 'Lasers',
  group: 'Show',
  blurb: 'Club laser rig in drifting haze; the beam pattern switches every 8 beats',
  tags: ['night', 'intense', 'abstract'],
  energy: 0.92,
  particles: 3,
  trails: 0.62,
  zoom: 1,
  spin: 0,
  frag,
};
