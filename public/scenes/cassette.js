// CASSETTE — a clear-shell tape, playing.
//
// The reels turn with the real playback rate (the same clock as the turntable), so the speed
// knob and the tape-stop pad show here too, and the tape winds from the left reel to the right
// as the track goes by. The track's title is printed on the label, a little analyser sits beside
// it, and the hubs glow with the bass.
const frag = `
float box(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// One reel: the tape pack, the hub and its six teeth. Returns colour in rgb, coverage in a.
vec4 reel(vec2 q, float pack, float ang, vec3 accent) {
  float r = length(q);
  float a = atan(q.y, q.x) + ang;
  vec4 o = vec4(0.0);
  float tape = 1.0 - ss(pack - 0.004, pack, r);
  float sheen = sin(atan(q.y, q.x) * 0.5 + 0.8);                       // fixed in space: the light does not turn with the reel
  vec3 tapeCol = vec3(0.20, 0.115, 0.075) * (0.7 + 0.9 * exp(-sheen * sheen * 9.0)) * (0.88 + 0.12 * sin(r * 900.0));
  o = mix(o, vec4(tapeCol, 1.0), tape);
  float hub = 1.0 - ss(0.086, 0.090, r);
  vec3 hubCol = vec3(0.62, 0.62, 0.60) * (0.55 + 0.25 * cos(a * 2.0)) + accent * (0.04 + 0.22 * uBass);
  o = mix(o, vec4(hubCol, 1.0), hub);
  float teeth = step(0.5, fract(a / TAU * 6.0 + 0.25)) * step(r, 0.058) * step(0.034, r);
  float hole = 1.0 - ss(0.030, 0.034, r);
  o = mix(o, vec4(vec3(0.015), 1.0), max(teeth, hole) * hub);
  return o;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float sc = min(aspect * 0.74, 1.30);
  vec2 q = rot(0.04 * sin(uTime * 0.3)) * (p - vec2(0.0, 0.015 * sin(uTime * 0.5))) / sc;
  q *= 1.0 - uBeat * 0.012 * uPunch;
  vec3 accent = pal(0.08);

  vec3 col = pal(0.6) * 0.07 * exp(-length(p) * 1.1) * (0.5 + uLevel);
  float body = box(q, vec2(0.80, 0.50), 0.045);
  col *= 1.0 - 0.6 * (1.0 - ss(0.0, 0.10, box(q - vec2(0.03, -0.04), vec2(0.80, 0.50), 0.045)));     // drop shadow

  if (body < 0.0) {
    // clear smoked shell
    vec3 shell = vec3(0.045, 0.048, 0.060) + pal(0.6) * 0.05 + 0.012 * noise(q * 60.0);
    float gl = (q.x + q.y * 0.6 + 0.25) * 5.0;
    shell += vec3(0.10) * exp(-gl * gl) * 0.35;                                                  // a diagonal sheen across the plastic
    col = shell;

    // the tape's path: pack → roller → along the bottom → roller → pack
    float packL = mix(0.245, 0.105, uProgress), packR = mix(0.105, 0.245, uProgress);
    vec2 cl = vec2(-0.30, -0.03), cr = vec2(0.30, -0.03);
    float path = min(min(seg(q, cl + vec2(-packL, 0.0), vec2(-0.66, -0.40)), seg(q, vec2(-0.66, -0.40), vec2(0.66, -0.40))),
                     seg(q, vec2(0.66, -0.40), cr + vec2(packR, 0.0)));
    col = mix(col, vec3(0.20, 0.115, 0.075), 1.0 - ss(0.003, 0.006, path));
    float rollers = min(length(q - vec2(-0.66, -0.40)), length(q - vec2(0.66, -0.40)));
    col = mix(col, vec3(0.55), 1.0 - ss(0.022, 0.026, rollers));

    vec4 rl = reel(q - cl, packL, uSpin * 1.6, accent);
    vec4 rr = reel(q - cr, packR, uSpin * 1.6 * packL / packR, accent);
    col = mix(col, rl.rgb, rl.a);
    col = mix(col, rr.rgb, rr.a);

    // the window frame between the reels
    float win = abs(box(q - vec2(0.0, -0.03), vec2(0.215, 0.085), 0.02));
    col += vec3(0.25) * (1.0 - ss(0.0, 0.005, win));

    // label strip: title on the left, a small analyser on the right, three stripes underneath
    vec2 lq = q - vec2(0.0, 0.345);
    float label = box(lq, vec2(0.72, 0.115), 0.02);
    if (label < 0.0) {
      vec3 paper = vec3(0.86, 0.83, 0.74) * (0.55 + 0.1 * noise(q * 90.0));
      float stripe = floor((lq.y + 0.115) / 0.022);
      if (stripe < 3.0) paper = pal(0.05 + stripe * 0.16) * 0.75;
      vec2 tuv = vec2((lq.x + 0.70) / 0.98, (lq.y + 0.045) / 0.155);
      float ink = textureLod(uText, clamp(tuv, 0.0, 1.0), 0.0).a * step(abs(tuv.x - 0.5), 0.5) * step(abs(tuv.y - 0.5), 0.5);
      paper = mix(paper, vec3(0.05, 0.05, 0.07), ink * 0.9);
      // analyser
      vec2 aq = vec2((lq.x - 0.32) / 0.36, (lq.y + 0.04) / 0.14);
      if (aq.x > 0.0 && aq.x < 1.0 && aq.y > 0.0 && aq.y < 1.0) {
        float cell = aq.x * 18.0;
        float s = spec((floor(cell) + 0.5) / 18.0 * 0.85);
        float on = step(aq.y, s) * ss(0.1, 0.25, fract(cell)) * (1.0 - ss(0.75, 0.9, fract(cell))) * step(0.2, fract(aq.y * 10.0));
        paper = mix(paper * 0.35, pal(0.05 + aq.y * 0.4) * 1.3, on);
      }
      col = paper;
    }

    // the head opening along the bottom, with its holes
    float trap = max(abs(q.x) - (0.52 + (q.y + 0.50) * 0.35), max(q.y + 0.30, -q.y - 0.50));
    col = mix(col, col * 0.55 + vec3(0.02), 1.0 - ss(0.0, 0.005, trap));
    float holes = min(min(length(q - vec2(-0.36, -0.43)), length(q - vec2(0.36, -0.43))), min(length(q - vec2(-0.13, -0.445)), length(q - vec2(0.13, -0.445))));
    col = mix(col, vec3(0.006), 1.0 - ss(0.022, 0.026, holes));

    // five screws
    float scr = 1e3;
    scr = min(scr, length(abs(q) - vec2(0.74, 0.44)));
    scr = min(scr, length(q - vec2(0.0, -0.215)));
    col = mix(col, vec3(0.45, 0.45, 0.48) * (0.7 + 0.3 * cos(atan(q.y, q.x) * 2.0)), 1.0 - ss(0.016, 0.020, scr));

    col += vec3(0.35) * (1.0 - ss(0.0, 0.006, -body)) * (0.4 + 0.6 * ss(-0.3, 0.6, q.y));           // bevel catching the light
  }
  col += accent * 0.04 * uBeat * uPunch;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'cassette',
  name: 'Cassette',
  group: 'Things',
  blurb: 'Clear-shell tape winding reel to reel, title on the label, hubs glow with bass',
  tags: ['retro', 'text', 'calm'],
  energy: 0.3,
  particles: 3,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
