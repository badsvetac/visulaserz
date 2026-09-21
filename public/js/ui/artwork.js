// Feeds the renderer two images: the album art (for the Vinyl label) and the track title
// rendered to a canvas (for the Title scene). Also keeps the record spinning at 33⅓ rpm.
const RPM = 33.333;

export function attachArtwork({ engine, renderer }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  let token = 0;

  async function renderText(title, artist) {
    const my = ++token;
    try {
      await Promise.all([document.fonts.load('40px Michroma'), document.fonts.load('28px "Saira Semi Condensed"')]);
    } catch { /* fall back to whatever font is available */ }
    if (my !== token) return;
    const font = (s) => `${s}px Michroma, "Eurostile", sans-serif`;
    const maxW = 940;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let lines = [title.toUpperCase()];
    let size = 78;
    ctx.font = font(size);
    while (ctx.measureText(lines[0]).width > maxW && size > 30) { size -= 2; ctx.font = font(size); }
    if (size <= 30) {
      // too long for one line: break at the space nearest the middle
      const t = lines[0];
      let best = -1;
      for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - t.length / 2) < Math.abs(best - t.length / 2))) best = i;
      if (best > 0) lines = [t.slice(0, best), t.slice(best + 1)];
      size = 48;
      ctx.font = font(size);
      while (Math.max(...lines.map((l) => ctx.measureText(l).width)) > maxW && size > 22) { size -= 2; ctx.font = font(size); }
    }
    const artistSize = 26;
    const artistBlock = artist ? artistSize + 18 : 0;
    const total = lines.length * size * 1.15 + artistBlock;
    let y = 128 - total / 2 + size * 0.6;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.08em';
    for (const line of lines) { ctx.fillText(line, 512, y); y += size * 1.15; }
    if (artist) {
      ctx.font = `${artistSize}px "Saira Semi Condensed", "Barlow Semi Condensed", sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0.04em';
      ctx.globalAlpha = 0.75;
      ctx.fillText(artist, 512, y + 4);
      ctx.globalAlpha = 1;
    }
    renderer.setText(canvas);
  }

  let artToken = 0;
  function loadArt(track) {
    const my = ++artToken;
    renderer.setArt(null);
    if (!track?.thumb) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (my === artToken) renderer.setArt(img); };
    img.src = track.thumb;
  }

  engine.addEventListener('trackchange', (e) => {
    loadArt(e.detail);
    renderText(e.detail.title, e.detail.artist || '');
  });
  engine.addEventListener('live', () => {
    if (!engine.live) return;
    loadArt(null);
    renderText(engine.liveLabel || 'Live input', 'listening');
  });
  renderText('VISULASERZ', 'drop a track · paste a link · play the demo');

  return {
    tick(dt) {
      const spin = renderer.extra.uSpin + dt * engine.effectiveRate * (RPM / 60) * Math.PI * 2;
      renderer.extra.uSpin = spin % (Math.PI * 2);
      renderer.extra.uProgress = engine.duration ? engine.currentTime / engine.duration : 0;
    },
  };
}
