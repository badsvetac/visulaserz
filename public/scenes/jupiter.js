// JUPITER — a gas giant close enough to fill the window.
//
// A gas giant has no surface, so its atmosphere is free to run in zonal jets: neighbouring
// latitudes circle the planet at different speeds and in opposite directions, and the shear
// between them is what draws the clouds out into ribbons. Eleven jets are stacked pole to pole
// and each one takes a slice of the spectrum — 30 Hz at the southern limb, 16 kHz in the north —
// which sets how fast that belt runs, how hard its noise is warped and how bright it burns.
// One anticyclone rides the southern belt, turning against the jets and swelling with the bass.
// Beats fire lightning inside the clouds, and only the night side of the terminator shows it.
const frag = `
const float R = 1.9;     // the camera sits close: the limb only just clears the sides of the frame
const float NB = 11.0;   // zonal jets, one per frequency band

float beltBand(float bi) { return spec(clamp((bi + 0.5) / NB, 0.0, 1.0) * 0.9 + 0.03); }
// Neighbouring jets run opposite ways — that counter-flow is what shears the ribbons.
float beltDrift(float bi) { return (mod(bi, 2.0) < 0.5 ? -1.0 : 1.0) * (0.09 + 0.12 * hash11(bi * 1.7 + 0.3)); }

void main() {
  vec2 p = centered() * (1.0 - uBeat * 0.008 * uPunch);
  p.x -= uBalance * 0.05;
  vec3 ro = vec3(0.0, 0.0, -3.4);
  vec3 rd = normalize(vec3(p, 2.0));
  vec3 sunDir = normalize(vec3(-0.90, 0.34, -0.26));       // sun off to our left and well behind, so the right third of the disc is night
  vec3 haze = mix(vec3(0.70, 0.80, 1.0), pal(0.55), 0.45);

  vec2 g = p * 46.0;
  vec2 gc = floor(g);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.7;
  vec3 col = vec3(0.70, 0.80, 1.0) * step(0.965, hash21(gc)) * (0.0009 / (dot(sf, sf) + 0.0018)) * (0.35 + 0.8 * uHigh);

  float b = dot(ro, rd);
  float disc = b * b - (dot(ro, ro) - R * R);
  vec3 limbN = normalize(ro + rd * (-b));
  float miss = sqrt(max(dot(ro, ro) - b * b, 0.0)) - R;
  col += haze * exp(-max(miss, 0.0) * 24.0) * (0.30 + 0.5 * uLevel) * ss(-0.25, 0.45, dot(limbN, sunDir)) * step(disc, 0.0);

  if (disc > 0.0) {
    vec3 n = (ro + rd * (-b - sqrt(disc))) / R;
    vec3 nn = n; nn.yz = rot(0.22) * nn.yz;                // a little axial tilt, so the belts arc across the disc
    float lat = asin(clamp(nn.y, -1.0, 1.0));
    float lon = atan(nn.x, -nn.z);                         // measured from the sub-viewer point: the seam stays on the far side
    float mu = max(dot(n, -rd), 1e-4);                     // 1 face-on, 0 at the limb
    float detail = ss(0.05, 0.45, mu);                     // the limb is too foreshortened to hold fine noise

    float bf = (lat / PI + 0.5) * NB;
    float bi = floor(bf);
    float f = ss(0.3, 0.7, fract(bf));                     // belts stay distinct, but their shear is continuous
    float band = mix(beltBand(bi), beltBand(bi + 1.0), f);
    float drift = mix(beltDrift(bi), beltDrift(bi + 1.0), f);

    // Clouds live in longitude/latitude and are stretched ~6:1 along the jets.
    vec2 q = vec2(lon * 0.70 + uCruise * drift * (0.5 + 1.3 * band), lat * 4.2);
    float w1 = fbm(q * vec2(1.0, 0.50) + vec2(0.0, 4.3));
    float w2 = fbm(q * vec2(0.8, 0.60) + vec2(5.1, 1.7));
    vec2 qw = q + (vec2(w1, w2) - 0.5) * (0.55 + 1.6 * band);   // a loud belt curdles, a quiet one lies flat
    float cl = fbm(qw) + (fbm(qw * 2.7 + 3.1) - 0.5) * 0.45 * detail;
    cl = mix(0.5, cl, 0.35 + 0.65 * detail);

    vec3 cream = mix(vec3(0.95, 0.88, 0.72), pal(0.13), 0.28);
    vec3 ochre = mix(vec3(0.62, 0.40, 0.24), pal(0.03), 0.30);
    vec3 deep  = mix(vec3(0.26, 0.15, 0.11), pal(0.93), 0.22);
    float zone = mix(mod(bi, 2.0), mod(bi + 1.0, 2.0), f);  // pale zones alternate with dark belts
    vec3 cloud = mix(mix(ochre, cream, ss(0.38, 0.78, cl)), mix(deep, ochre, ss(0.30, 0.62, cl)), zone);
    cloud *= 0.72 + 0.75 * band;
    cloud += cream * ss(0.74, 0.96, cl) * band * 1.1;       // white plumes pop in whichever belt is loudest

    // The Great Red Spot: an anticyclone turning against its jet, faster at the core than the edge.
    float sw = 1.0 + 0.38 * uBass + 0.30 * uBeat * uPunch;  // it breathes with the bass
    float lon0 = -0.10 + 0.32 * sin(uTime * 0.017);         // it drifts along its belt, never far enough to leave the daylight
    vec2 e = vec2((lon - lon0) / (0.40 * sw), (lat + 0.36) / (0.165 * sw));
    float rs = length(e);
    vec2 ew = rot(-(uTime * 0.30 + (1.0 - clamp(rs, 0.0, 1.0)) * 2.6)) * e;
    float swirl = fbm(ew * 1.8 + vec2(7.3, 2.1));
    vec3 spotCol = mix(vec3(0.74, 0.25, 0.14), pal(0.0), 0.30) * (0.55 + 0.9 * swirl) * (0.8 + 0.9 * uBass);
    cloud = mix(cloud, deep * 0.75, (1.0 - ss(0.0, 0.12, abs(rs - 1.08))) * 0.45);   // the collar the storm sweeps clear
    cloud = mix(cloud, spotCol, (1.0 - ss(0.72, 1.02, rs)) * 0.92);

    float lit = dot(n, sunDir);
    float day = ss(-0.12, 0.30, lit);                       // the haze carries daylight a little past the terminator
    float limb = 0.30 + 0.70 * pow(mu, 0.42);               // limb darkening: we look through more air at the edge
    vec3 shade = cloud * (day * limb * (0.85 + 0.35 * uLevel) + 0.03) + vec3(0.012, 0.016, 0.030) * (1.0 - day);

    // Three storms flash on every beat and are dark again within half a second.
    float flash = 0.0, halo = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 lp = vec2(0.55 + hash11(uBeatCount * 1.7 + fi * 3.1) * 0.95, (hash11(uBeatCount * 2.9 + fi * 5.3) - 0.5) * 1.3);
      vec2 dl = vec2(lon, lat) - lp;
      float age = uBeatAge * (1.0 + 0.5 * fi);
      float strobe = exp(-age * 11.0) * (0.55 + 0.45 * sin(age * 80.0 + fi));
      flash += exp(-dot(dl, dl) * 150.0) * strobe;
      halo  += exp(-dot(dl, dl) * 16.0) * strobe * 0.30;
    }
    shade += mix(vec3(0.78, 0.86, 1.0), pal(0.6), 0.25) * (flash * ss(0.35, 0.68, cl) + halo) * (1.0 - day) * 2.0 * uPunch;

    // atmosphere: a broad fresnel glow and the thin bright edge of the disc itself
    float fres = 1.0 - mu;
    shade += haze * fres * fres * fres * fres * fres * (0.45 + 0.6 * uLevel + 0.5 * uBeat * uPunch) * ss(-0.35, 0.45, lit);
    shade += haze * (1.0 - ss(0.0, 0.09, mu)) * (0.25 + 0.45 * day);
    col = shade;
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'jupiter',
  name: 'Jupiter',
  group: 'Journey',
  blurb: 'Gas giant up close; every cloud belt runs on its own band, beats fire lightning on the night side',
  tags: ['space', 'nature', 'organic'],
  energy: 0.4,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
