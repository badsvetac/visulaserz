import { clamp, formatTime } from '../util.js';

// Two things a hi-fi deck shows you at a glance: how loud it is (VU needles) and where
// you are in the record (the waveform overview under the seek bar).
export function buildMeters({ engine }) {
  const vu = document.getElementById('vu');
  const meter = (id, label) => `
    <svg viewBox="0 0 60 38" class="vu-meter" aria-hidden="true">
      <path d="M8 30 A24 24 0 0 1 52 30" class="vu-scale"/>
      <path d="M41.5 13.5 A24 24 0 0 1 52 30" class="vu-red"/>
      <g class="vu-ticks">
        <line x1="8" y1="30" x2="10.6" y2="28.5"/><line x1="18.5" y1="14.6" x2="20" y2="17.2"/>
        <line x1="30" y1="6" x2="30" y2="9"/><line x1="41.5" y1="14.6" x2="40" y2="17.2"/><line x1="52" y1="30" x2="49.4" y2="28.5"/>
      </g>
      <line id="${id}" class="vu-needle" x1="30" y1="34" x2="30" y2="9" transform="rotate(-42 30 34)"/>
      <circle cx="30" cy="34" r="2.2" class="vu-pivot"/>
      <text x="30" y="37" class="vu-label">${label}</text>
    </svg>`;
  vu.innerHTML = meter('vu-l', 'L') + meter('vu-r', 'R');
  const needles = [vu.querySelector('#vu-l'), vu.querySelector('#vu-r')];
  // -22 dB at the left stop, +3 dB at the right stop (the red zone starts at 0)
  const angle = (rms) => clamp((20 * Math.log10(Math.max(rms, 1e-5)) + 22) / 25, 0, 1) * 84 - 42;

  const seek = document.getElementById('seek');
  const canvas = document.getElementById('seek-wave');
  const ctx = canvas.getContext('2d');
  let peaks = null;
  let token = 0;
  let beam = '#ff4fd8';
  let frames = 0;

  async function build(track) {
    const my = ++token;
    peaks = null;
    seek.classList.remove('has-wave');
    if (!track?.url) return;
    try {
      const data = await (await fetch(track.url)).arrayBuffer();
      if (my !== token) return;
      // 16 kHz is plenty for an outline and keeps a long track's decode small.
      const audio = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(data);
      if (my !== token || audio.duration > 40 * 60) return;
      const n = 480;
      const out = new Float32Array(n);
      const per = Math.floor(audio.length / n);
      let max = 1e-4;
      for (let ch = 0; ch < audio.numberOfChannels; ch++) {
        const d = audio.getChannelData(ch);
        for (let i = 0; i < n; i++) {
          let m = 0;
          const base = i * per;
          for (let j = 0; j < per; j += 2) { const v = Math.abs(d[base + j]); if (v > m) m = v; }
          if (m > out[i]) out[i] = m;
          if (m > max) max = m;
        }
      }
      for (let i = 0; i < n; i++) out[i] = Math.pow(out[i] / max, 0.7);
      peaks = out;
      drawn = '';
      seek.classList.add('has-wave');
      fit();
    } catch { /* an overview is a nicety; the plain bar still works */ }
  }

  function fit() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.round(seek.clientWidth * dpr));
    canvas.height = Math.round(22 * dpr);
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const n = peaks.length;
    const bar = w / n;
    const progress = engine.duration ? engine.currentTime / engine.duration : 0;
    for (let i = 0; i < n; i++) {
      const hh = Math.max(1, peaks[i] * (h - 2));
      ctx.fillStyle = i / n <= progress ? beam : 'rgba(255,255,255,0.22)';
      ctx.fillRect(i * bar, (h - hh) / 2, Math.max(1, bar - 0.8), hh);
    }
    if (engine.ab && engine.duration) {
      ctx.fillStyle = '#ffb547';
      for (const t of [engine.ab.a, engine.ab.b]) ctx.fillRect((t / engine.duration) * w - 1, 0, 2, h);
    }
  }

  engine.addEventListener('trackchange', (e) => build(e.detail));
  engine.addEventListener('live', () => { if (engine.live) { token++; peaks = null; seek.classList.remove('has-wave'); } });
  new ResizeObserver(() => { if (peaks) { fit(); drawn = ''; } }).observe(seek);

  // The needles are hidden on narrow screens (style.css), and the overview only changes when the
  // played part grows by a bar: neither is worth redrawing every frame, least of all on a phone.
  const vuHidden = matchMedia('(max-width: 980px)');
  let drawn = '';
  return {
    tick(dt, an) {
      if (!vuHidden.matches) {
        needles[0].setAttribute('transform', `rotate(${angle(an.rmsL).toFixed(1)} 30 34)`);
        needles[1].setAttribute('transform', `rotate(${angle(an.rmsR).toFixed(1)} 30 34)`);
      }
      if (peaks && canvas.width >= 8 * (window.devicePixelRatio || 1)) {
        if (frames++ % 30 === 0) beam = getComputedStyle(document.documentElement).getPropertyValue('--beam').trim() || beam;
        const at = engine.duration ? Math.floor((engine.currentTime / engine.duration) * peaks.length) : 0;
        const key = `${at}|${beam}|${engine.ab ? `${engine.ab.a}-${engine.ab.b}` : ''}|${canvas.width}`;
        if (key !== drawn) { drawn = key; draw(); }
      }
    },
    abText() {
      if (!engine.ab) return '';
      return `${formatTime(engine.ab.a)} – ${formatTime(engine.ab.b)}`;
    },
  };
}
