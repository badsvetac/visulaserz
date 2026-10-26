// TRACK ANALYSIS — a web worker that reads a whole track once and returns what a DJ deck needs:
// a three-band waveform to see it by, the tempo and where every beat falls to lock on to, how loud
// it is (for auto gain), and where the music actually starts (for the first cue).
//
// The track arrives as mono at 12 kHz. Two cascaded one-pole filters at 180 Hz pull out the low
// band and two at 2.5 kHz split off the highs; whatever is between is the mids. Their energy is
// taken 300 times a second: those are the waveform's columns, and the rises in each band's log
// energy, added up with the kick weighted most, are the onsets the tempo is found from.
//
// The tempo is found in two passes. The first asks which tempo the rhythm as a whole repeats at:
// every tempo from 60 to 200 BPM is scored by the onsets' autocorrelation at its beat, half and
// quarter beat, two beats and bar together, with a gentle preference for the 90–160 BPM a DJ
// usually means. Scoring the whole metre is what keeps a syncopated kick pattern (which also
// repeats every three sixteenths) from being taken for the beat. That lands within half a BPM.
//
// Half a BPM is not good enough to keep a grid on the beat for four minutes, so the second pass
// folds the onsets onto one beat at every tempo within ±1.2 % of it, in hundredths and then
// thousandths, and keeps the tempo whose fold stacks them tallest. A soft, reverb-smeared beat
// folds broadly, so the fold is also taken in 16-second windows: at the right tempo the beat's
// phase stays put all through the track, and the speed it drifts at measures what is left of the
// error. Most dance music sits on a whole number of BPM, so a whole number almost as good wins.
//
// The onsets of the last few tracks are kept, so that a tempo tapped in by hand can be polished the
// same way: a tap is good to a BPM or so, the fold to a hundredth.
const BIN_RATE = 300;
const KEEP = 4;
const kept = new Map();             // analysis id → that track's beat tools

self.onmessage = (e) => {
  const { id } = e.data;
  try {
    if (e.data.refine) {
      const tools = kept.get(e.data.refine);
      if (!tools) throw new Error('That track is no longer in the analysis.');
      self.postMessage({ id, ...tools.refine(e.data.bpm, e.data.near) });
      return;
    }
    const r = analyse(e.data.mono, e.data.rate, id);
    self.postMessage({ id, ...r }, [r.bins.buffer, r.overview.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};

function analyse(x, rate, id) {
  const hop = rate / BIN_RATE;
  const n = Math.floor(x.length / hop);
  if (n < BIN_RATE * 2) throw new Error('The track is too short to analyse.');

  // ── band energies, BIN_RATE times a second ──────────────────────────────
  const eLow = new Float32Array(n), eMid = new Float32Array(n), eHigh = new Float32Array(n);
  const kl = 1 - Math.exp((-2 * Math.PI * 180) / rate);
  const kh = 1 - Math.exp((-2 * Math.PI * 2500) / rate);
  let l1 = 0, l2 = 0, h1 = 0, h2 = 0, sumsq = 0;
  let bin = 0, inBin = 0, sl = 0, sm = 0, shh = 0;
  const per = hop;
  for (let i = 0; i < x.length && bin < n; i++) {
    const s = x[i];
    sumsq += s * s;
    l1 += kl * (s - l1); l2 += kl * (l1 - l2);           // low band
    h1 += kh * (s - h1); h2 += kh * (h1 - h2);           // everything below 2.5 kHz
    const low = l2, high = s - h2, mid = h2 - l2;
    sl += low * low; sm += mid * mid; shh += high * high;
    if (++inBin >= per) {
      eLow[bin] = sl / inBin; eMid[bin] = sm / inBin; eHigh[bin] = shh / inBin;
      bin++; inBin = 0; sl = sm = shh = 0;
    }
  }
  const rms = Math.sqrt(sumsq / x.length);
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-6));

  // ── the waveform: amplitude per band, one byte each ───────────────────────
  const amp = (e) => Math.sqrt(e);
  const peaks = new Float32Array(n);
  for (let i = 0; i < n; i++) peaks[i] = Math.max(amp(eLow[i]), amp(eMid[i]), amp(eHigh[i]));
  const sorted = Float32Array.from(peaks).sort();
  const ref = Math.max(sorted[Math.floor(n * 0.985)], 1e-4);
  const bins = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    bins[i * 3] = Math.min(255, Math.round((amp(eLow[i]) / ref) * 255));
    bins[i * 3 + 1] = Math.min(255, Math.round((amp(eMid[i]) / ref) * 255));
    bins[i * 3 + 2] = Math.min(255, Math.round((amp(eHigh[i]) / ref) * 255));
  }
  const OVER = 1200;
  const overview = new Uint8Array(OVER * 3);
  for (let c = 0; c < OVER; c++) {
    const a = Math.floor((c * n) / OVER), b = Math.max(a + 1, Math.floor(((c + 1) * n) / OVER));
    for (let band = 0; band < 3; band++) {
      let m = 0;
      for (let i = a; i < b; i++) m = Math.max(m, bins[i * 3 + band]);
      overview[c * 3 + band] = m;
    }
  }
  // where the music starts: the first column with real energy in it
  let start = 0;
  for (let i = 0; i < n; i++) if (peaks[i] > ref * 0.06) { start = i / BIN_RATE; break; }

  // ── onsets ────────────────────────────────────────────────────────────────
  const od = new Float32Array(n);
  const C = 1 / (ref * ref * 0.01);
  for (let i = 1; i < n; i++) {
    const rise = (e, w) => w * Math.max(0, Math.log(1 + C * e[i]) - Math.log(1 + C * e[i - 1]));
    od[i] = rise(eLow, 1.0) + rise(eMid, 0.5) + rise(eHigh, 0.25);
  }
  // take away the local average, so steady loud passages do not count as onsets
  const W = Math.round(BIN_RATE * 0.25);
  const odn = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += od[i];
    if (i >= W) acc -= od[i - W];
    const mean = acc / Math.min(i + 1, W);
    odn[i] = Math.max(0, od[i] - mean);
  }
  const tools = beatTools(odn);
  kept.set(id, tools);
  while (kept.size > KEEP) kept.delete(kept.keys().next().value);

  // ── pass 1: which tempo the rhythm as a whole repeats at ─────────────────────
  // A real beat comes with the rest of the metre: its sixteenths, its eighths, the beat itself,
  // two beats, and above all the bar, which is what a syncopated pattern actually repeats. So each
  // tempo is scored by the autocorrelation at all of those lags together. One beat alone is fooled
  // by syncopation: a funk kick pattern lines up just as well every three sixteenths.
  const minLag = Math.floor((60 * BIN_RATE) / 200), maxLag = Math.ceil((60 * BIN_RATE) / 60);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += odn[i];
  mean /= n;
  const cen = new Float32Array(n);
  for (let i = 0; i < n; i++) cen[i] = odn[i] - mean;
  const maxAc = Math.min(n - 2, 4 * maxLag + 2);
  const ac = new Float32Array(maxAc + 2);
  for (let lag = 1; lag <= maxAc + 1; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += cen[i] * cen[i - lag];
    ac[lag] = s;
  }
  const acAt = (L) => {
    if (L < 1 || L > maxAc) return 0;
    const i = Math.floor(L), f = L - i;
    return ac[i] * (1 - f) + ac[i + 1] * f;
  };
  const metre = (lag) => acAt(lag) + 0.5 * acAt(2 * lag) + 0.6 * acAt(4 * lag) + 0.35 * acAt(lag / 2) + 0.2 * acAt(lag / 4);
  const prior = (bpm) => Math.exp(-0.5 * (Math.log2(bpm / 122) / 0.55) ** 2);
  let bestLag = minLag, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 0.25) {
    const sc = metre(lag) * prior((60 * BIN_RATE) / lag);
    if (sc > bestScore) { bestScore = sc; bestLag = lag; }
  }

  // ── pass 2: the exact tempo, and where the beats fall ─────────────────────────
  const { bpm, fold: fin, R } = tools.polish((60 * BIN_RATE) / bestLag, 0.012);
  const first = fin.phase / BIN_RATE;                         // a beat, within the first beat period
  return { bins, binRate: BIN_RATE, overview, bpm, first, confidence: confidenceOf(fin, R), rmsDb, start, duration: x.length / rate };
}

// how sure the grid is: a steady phase through the track, and a fold that stands out
const confidenceOf = (fold, R) => Math.max(0, Math.min(1, R * Math.min(1, (fold.contrast - 1) / 1.5)));

// Everything that needs only a track's onsets (BIN_RATE a second): folding them onto one beat,
// polishing a rough tempo into an exact one, and finding the beat nearest a given moment.
function beatTools(odn) {
  const n = odn.length;

  // fold the onsets onto one beat, over the whole track or a stretch of it
  const fold = (bpm, i0 = 0, i1 = n) => {
    const P = (60 * BIN_RATE) / bpm;
    const slots = Math.ceil(P);
    const buckets = new Float32Array(slots + 1);
    for (let i = i0; i < i1; i++) {
      const v = odn[i];
      if (v <= 0) continue;
      const ph = i % P;
      const k = Math.floor(ph), f = ph - k;
      buckets[k] += v * (1 - f);
      buckets[(k + 1) % slots] += v * f;
    }
    let best = 0, bestK = 0;
    for (let k = 0; k < slots; k++) {
      const s = smooth(buckets, k, slots);
      if (s > best) { best = s; bestK = k; }
    }
    let total = 0;
    for (let k = 0; k < slots; k++) total += buckets[k];
    const avg = total / P;                    // per unit of phase: dividing by the whole number of slots would jump as P crosses one
    let vx = 0, vy = 0;
    for (let k = 0; k < slots; k++) {
      const w = buckets[k] - avg;
      if (w > 0) { const a2 = (2 * Math.PI * (k + 0.5)) / P; vx += w * Math.cos(a2); vy += w * Math.sin(a2); }
    }
    return { phase: (((bestK + peakOffset(buckets, bestK, slots)) % P) + P) % P, P, buckets, contrast: best / Math.max(avg, 1e-9), vx, vy };
  };

  // The grid's steadiness through the track: the best phase in 16-second windows. The right
  // tempo keeps it still; one a little off makes it drift, and the drift measures the error.
  const steadiness = (bpm) => {
    const WIN = 16 * BIN_RATE, HOP = 8 * BIN_RATE;
    let sx = 0, sy = 0, sw = 0;
    const pts = [];
    for (let i0 = 0; i0 + WIN <= n; i0 += HOP) {
      const r = fold(bpm, i0, i0 + WIN);
      const w = Math.hypot(r.vx, r.vy);
      const ph = Math.atan2(r.vy, r.vx) / (2 * Math.PI);
      sx += w * Math.cos(2 * Math.PI * ph); sy += w * Math.sin(2 * Math.PI * ph); sw += w;
      pts.push({ t: (i0 + WIN / 2) / BIN_RATE, ph, w: w + 1e-6 });
    }
    const R = sw > 0 ? Math.hypot(sx, sy) / sw : 0;
    let slope = 0;                                            // beats of drift per second
    if (pts.length >= 3) {
      let acc = pts[0].ph;
      const u = [acc];
      for (let k = 1; k < pts.length; k++) { let d = pts[k].ph - pts[k - 1].ph; d -= Math.round(d); acc += d; u.push(acc); }
      let W = 0, T = 0, Y = 0, TT = 0, TY = 0;
      pts.forEach((p, k) => { W += p.w; T += p.w * p.t; Y += p.w * u[k]; TT += p.w * p.t * p.t; TY += p.w * p.t * u[k]; });
      const den = W * TT - T * T;
      if (den > 1e-9) slope = (W * TY - T * Y) / den;
    }
    return { R, slope };
  };

  // A rough tempo made exact. The fold is sharpest at exactly the right tempo (a few hundredths
  // off already blurs it), so scan ±span of it in hundredths and polish in thousandths.
  const polish = (rough, span) => {
    let top = null, bpm = rough;
    for (let b = rough * (1 - span); b <= rough * (1 + span); b += 0.01) { const r = fold(b); if (!top || r.contrast > top.contrast) { top = r; bpm = b; } }
    const lo = bpm - 0.012, hi = bpm + 0.012;
    for (let b = lo; b <= hi + 1e-9; b += 0.002) { const r = fold(b); if (r.contrast > top.contrast) { top = r; bpm = b; } }
    let { R, slope } = steadiness(bpm);
    // A track whose beat is soft everywhere has a broad fold; then the drift of the phase through
    // the track is the better witness: it moves by t·(P′ − P)/P², so P′ = P + slope·P². It is only
    // believed if it makes the fold sharper.
    const Ps = 60 / bpm;
    if (Math.abs(slope * Ps) < 0.02) {
      const corrected = 60 / (Ps + slope * Ps * Ps);
      const f2 = fold(corrected);
      if (f2.contrast > top.contrast * 1.02) { bpm = corrected; top = f2; R = steadiness(corrected).R; }
    }
    // most dance music sits on a whole number of BPM: if one is about as good, it wins
    const whole = Math.round(bpm);
    if (Math.abs(whole - bpm) < 0.08) {
      const s = steadiness(whole), f = fold(whole);
      if (s.R >= R * 0.97 && f.contrast >= top.contrast * 0.97) { bpm = whole; R = s.R; }
    }
    bpm = Math.round(bpm * 100) / 100;
    return { bpm, fold: fold(bpm), R };
  };

  // The fold's own peak nearest a moment (seconds), within a sixth of a beat either side: the beat
  // a tapper meant, placed where its onsets really are. With no peak there, the moment stands.
  const beatNear = (f, at) => {
    const { P, buckets } = f, slots = Math.ceil(P);
    const want = (((at * BIN_RATE) % P) + P) % P, reach = Math.max(1, Math.round(P / 6));
    const c = Math.round(want);
    let best = -1, bestD = 0;
    for (let d = -reach; d <= reach; d++) {
      const s = smooth(buckets, (((c + d) % slots) + slots) % slots, slots);
      if (s > best) { best = s; bestD = d; }
    }
    if (Math.abs(bestD) === reach) return at;              // still climbing at the edge: no peak near
    const k = (((c + bestD) % slots) + slots) % slots;
    const phase = (((k + peakOffset(buckets, k, slots)) % P) + P) % P;
    let d = (phase - want) / BIN_RATE;                       // how far the peak is from the moment, in seconds
    const half = P / BIN_RATE / 2;
    if (d > half) d -= 2 * half;
    if (d < -half) d += 2 * half;
    return at + d;
  };

  // a tapped tempo and beat, polished against the track
  const refine = (bpm, near) => {
    const r = polish(bpm, 0.02);
    const first = near == null ? r.fold.phase / BIN_RATE : beatNear(r.fold, near);
    return { bpm: r.bpm, first, confidence: confidenceOf(r.fold, r.R) };
  };

  return { fold, steadiness, polish, refine };
}

// a little smoothing across neighbouring phase slots
const smooth = (b, k, slots) => b[k] * 0.5 + 0.25 * (b[(k + slots - 1) % slots] + b[(k + 1) % slots]);

// where between slots a peak really is, from a parabola through it and its neighbours
function peakOffset(b, k, slots) {
  const a = b[(k + slots - 1) % slots], m = b[k], c = b[(k + 1) % slots];
  const d = a - 2 * m + c;
  return d !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0;
}
