import { el, clamp, store, debounce } from '../util.js';

// The CLIP unit: how the video comes out. FORMAT frames the stage the way the video will be (16:9;
// 9:16 for Reels, TikTok and Shorts; 1:1) and SIZE sets its pixels, so the picture on screen is
// exactly the picture REC records, letterboxed if the window is another shape. The brand layer
// puts your name and logo in a corner, and the title card (the cover, the title, the artist) opens
// a recording. Both are drawn into the picture itself, over everything, like the lyrics.
//
// On the hosted site a guest's videos also carry a small credit, "made with visulaserz.com", in a
// bottom corner; a free account takes it off, or keeps it on for anyone who likes it there.
// account.js says which kind of visitor this is; the editions without accounts never draw it.

const FORMATS = [
  { id: 'screen', name: 'Screen', ratio: null },
  { id: '16:9', name: '16:9', ratio: [16, 9] },
  { id: '9:16', name: '9:16', ratio: [9, 16] },
  { id: '1:1', name: '1:1', ratio: [1, 1] },
];
const SIZES = [720, 1080, 1440];                 // the short side
const CORNERS = [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']];
const CARD_SECONDS = [3, 4, 6];

export const formatSize = (format, short) => {
  const f = FORMATS.find((x) => x.id === format);
  if (!f?.ratio) return null;
  const [a, b] = f.ratio;
  return a >= b ? { w: Math.round((short * a) / b / 2) * 2, h: short } : { w: short, h: Math.round((short * b) / a / 2) * 2 };
};

export function buildClip({ engine, renderer, toast, lcdShow, key, cycle, toggle, group }) {
  const unit = document.getElementById('unit-clip');
  const saved = store.get('clip', {});
  const s = {
    format: FORMATS.some((f) => f.id === saved.format) ? saved.format : 'screen',
    size: SIZES.includes(saved.size) ? saved.size : 1080,
    name: typeof saved.name === 'string' ? saved.name.slice(0, 40) : '',
    corner: CORNERS.some((c) => c[0] === saved.corner) ? saved.corner : 'br',
    show: saved.show !== false,
    card: saved.card !== false,
    cardSeconds: CARD_SECONDS.includes(saved.cardSeconds) ? saved.cardSeconds : 4,
    logo: typeof saved.logo === 'string' && saved.logo.startsWith('data:image/') ? saved.logo : null,
    credit: saved.credit === true,                // a member's choice; a guest's videos always carry it
  };
  const account = () => document.documentElement.dataset.account;     // 'guest' | 'member' | undefined
  const credited = () => account() === 'guest' || (account() === 'member' && s.credit);
  let recording = false;
  const save = debounce(() => store.set('clip', s), 250);
  let logo = null;
  if (s.logo) { logo = new Image(); logo.onload = () => { dirty = true; }; logo.src = s.logo; }

  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  let dirty = true;
  let card = null;                 // { t, dur } while the title card is up
  let beam = '#ff4fd8';
  let beamAge = 1;

  // ── framing ───────────────────────────────────────────────────────────────
  // The stage shows the video's shape at once, but it is drawn at its size on screen (like any
  // picture: quality, the phone's frame pacer and its pixel budget apply); the video's own pixels,
  // 1080×1920 and up, are only drawn while REC films them. A Take renders at that size itself.
  const stage = renderer.canvas;
  let filming = false;
  function frame() {
    const size = formatSize(s.format, s.size);
    renderer.setFixedSize(filming ? size : null);
    if (!size) {
      for (const k of ['width', 'height', 'left', 'top', 'right', 'bottom']) stage.style[k] = '';
      document.body.classList.remove('is-framed');
    } else {
      const vw = window.innerWidth, vh = window.innerHeight, a = size.w / size.h;
      const w = vw / vh > a ? vh * a : vw;
      const h = vw / vh > a ? vh : vw / a;
      Object.assign(stage.style, { width: `${w}px`, height: `${h}px`, left: `${(vw - w) / 2}px`, top: `${(vh - h) / 2}px`, right: 'auto', bottom: 'auto' });
      document.body.classList.add('is-framed');
    }
    dirty = true;
  }
  window.addEventListener('resize', debounce(frame, 100));

  // ── the brand layer ───────────────────────────────────────────────────────
  function fitText(text, font, size, max) {
    let px = size;
    g.font = font(px);
    while (px > size * 0.45 && g.measureText(text).width > max) { px -= 1; g.font = font(px); }
    return px;
  }
  function paint(cardAlpha, credit) {
    const w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    const u = Math.min(w, h) / 1080;
    const text = s.name.trim().toUpperCase();
    if (s.show && (text || logo)) {
      const pad = Math.round(56 * u), lh = Math.round(86 * u);
      g.font = `400 ${Math.round(28 * u)}px Michroma, "Eurostile", sans-serif`;
      if ('letterSpacing' in g) g.letterSpacing = `${(6 * u).toFixed(1)}px`;
      const tw = text ? g.measureText(text).width : 0;
      const lw = logo ? lh * (logo.naturalWidth / logo.naturalHeight || 1) : 0;
      const gap = logo && text ? Math.round(24 * u) : 0;
      let x = s.corner.endsWith('r') ? w - pad - (lw + gap + tw) : pad;
      const mid = s.corner.startsWith('b') ? h - pad - lh / 2 : pad + lh / 2;
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.7)';
      g.shadowBlur = 20 * u;
      if (logo) { g.drawImage(logo, x, mid - lh / 2, lw, lh); x += lw + gap; }
      if (text) { g.fillStyle = 'rgba(255,255,255,0.93)'; g.textBaseline = 'middle'; g.fillText(text, x, mid + 2 * u); }
      g.restore();
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    }
    if (cardAlpha > 0) paintCard(w, h, u, cardAlpha);
    if (credit) paintCredit(w, h, u);                // over the title card too
  }
  // Small, in the bottom corner the name is not in. On a tall video it sits higher and on the left,
  // clear of the caption and the buttons TikTok, Reels and Shorts lay over the bottom and the right.
  function paintCredit(w, h, u) {
    const pad = Math.round(40 * u);
    const nameRight = s.show && s.corner === 'br' && !!(s.name.trim() || logo);
    const tall = h > w;
    const right = !tall && !nameRight;
    g.save();
    g.font = `400 ${Math.round(19 * u)}px Michroma, "Eurostile", sans-serif`;
    if ('letterSpacing' in g) g.letterSpacing = `${(1.5 * u).toFixed(1)}px`;
    g.textAlign = right ? 'right' : 'left';
    g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0,0,0,0.75)';
    g.shadowBlur = 12 * u;
    g.fillStyle = 'rgba(255,255,255,0.74)';
    g.fillText('made with visulaserz.com', right ? w - pad : pad, tall ? Math.round(h * 0.8) : h - pad);
    g.restore();
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }
  function paintCard(w, h, u, alpha) {
    const track = engine.decks?.onAirInfo?.()?.track || engine.track;
    const title = track?.title || 'Visulaserz';
    const artist = track?.artist || '';
    g.save();
    g.globalAlpha = alpha;
    const veil = g.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, 'rgba(5,5,9,0.62)');
    veil.addColorStop(1, 'rgba(5,5,9,0.86)');
    g.fillStyle = veil;
    g.fillRect(0, 0, w, h);
    const portrait = h > w;
    const side = Math.round(Math.min(w, h) * (portrait ? 0.66 : 0.44));
    const x = (w - side) / 2, y = portrait ? h * 0.2 : h * 0.12;
    // the cover, square and cropped to fill, lit by a little glow in the palette's colour
    g.save();
    g.shadowColor = beam;
    g.shadowBlur = 60 * u;
    const r = 18 * u;
    g.beginPath();
    g.roundRect ? g.roundRect(x, y, side, side, r) : g.rect(x, y, side, side);
    g.fillStyle = '#111';
    g.fill();
    g.restore();
    g.save();
    g.beginPath();
    g.roundRect ? g.roundRect(x, y, side, side, r) : g.rect(x, y, side, side);
    g.clip();
    const art = renderer.artImage;
    if (art && (art.naturalWidth || art.width)) {
      const iw = art.naturalWidth || art.width, ih = art.naturalHeight || art.height;
      const k = Math.max(side / iw, side / ih);
      g.drawImage(art, x + (side - iw * k) / 2, y + (side - ih * k) / 2, iw * k, ih * k);
    } else {
      const grad = g.createLinearGradient(x, y, x + side, y + side);
      grad.addColorStop(0, beam);
      grad.addColorStop(1, '#0b0b12');
      g.fillStyle = grad;
      g.fillRect(x, y, side, side);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = `400 ${Math.round(side * 0.16)}px Michroma, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('VZ', x + side / 2, y + side / 2);
    }
    g.restore();
    // the title and the artist under it
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff';
    const titleFont = (px) => `600 ${px}px "Saira Semi Condensed", "Barlow Semi Condensed", sans-serif`;
    const tpx = fitText(title, titleFont, Math.round(76 * u), w * 0.86);
    g.font = titleFont(tpx);
    const ty = y + side + 96 * u;
    g.fillText(title, w / 2, ty);
    g.fillStyle = beam;
    g.fillRect(w / 2 - 34 * u, ty + 26 * u, 68 * u, 3 * u);
    if (artist) {
      const artistFont = (px) => `400 ${px}px "Saira Semi Condensed", "Barlow Semi Condensed", sans-serif`;
      g.font = artistFont(fitText(artist, artistFont, Math.round(40 * u), w * 0.8));
      g.fillStyle = 'rgba(211,208,199,0.9)';
      g.fillText(artist, w / 2, ty + 82 * u);
    }
    g.restore();
  }
  function refresh() {
    const credit = recording && credited();
    const live = !!(s.show && (s.name.trim() || logo)) || !!card || credit;
    if (!live) { renderer.setBrand(null); return; }
    const w = renderer.canvas.width, h = renderer.canvas.height;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    let alpha = 0;
    if (card) {
      const t = card.t, d = card.dur;
      alpha = t < 0.35 ? t / 0.35 : t > d - 0.7 ? Math.max(0, (d - t) / 0.7) : 1;
    }
    paint(alpha, credit);
    renderer.setBrand(canvas);
  }

  // ── controls ──────────────────────────────────────────────────────────────
  const formatRow = el('div', { class: 'keys', role: 'group', 'aria-label': 'Format' });
  for (const f of FORMATS) {
    const b = key(f.name, { active: f.id === s.format, title: f.ratio ? `Make the video ${f.name}` : 'Use the whole window, as before', onClick: () => {
      s.format = f.id;
      save();
      frame();
      formatRow.querySelectorAll('.key').forEach((k) => { const on = k.dataset.format === f.id; k.classList.toggle('is-active', on); k.setAttribute('aria-pressed', String(on)); });
      sizeBtn.hidden = !f.ratio;
      const size = formatSize(f.id, s.size);
      lcdShow('format', size ? `${f.name} · ${size.w}×${size.h}` : 'SCREEN');
    } });
    b.dataset.format = f.id;
    formatRow.append(b);
  }
  const sizeBtn = cycle('Size', SIZES.map((v) => `${v}p`), () => SIZES.indexOf(s.size), (i) => { s.size = SIZES[i]; save(); frame(); });
  sizeBtn.hidden = s.format === 'screen';

  const nameInput = el('input', { class: 'clip-name', type: 'text', maxlength: '40', placeholder: 'Artist or channel name', 'aria-label': 'Name on the video', spellcheck: 'false', value: s.name });
  nameInput.addEventListener('input', () => { s.name = nameInput.value; save(); dirty = true; });
  const logoInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const logoBtn = el('button', { class: 'cycle', type: 'button', title: 'A logo beside the name (PNG with transparency works best). Click again to remove it.' },
    el('span', { class: 'cycle-label' }, 'Logo'), el('span', { class: 'cycle-value' }, s.logo ? 'set' : 'none'));
  logoBtn.addEventListener('click', () => { if (logo) setLogo(null); else logoInput.click(); });
  logoInput.addEventListener('change', () => { if (logoInput.files[0]) setLogo(logoInput.files[0]); logoInput.value = ''; });
  unit.append(logoInput);
  function setLogo(file) {
    if (!file) {
      logo = null;
      s.logo = null;
      save();
      logoBtn.querySelector('.cycle-value').textContent = 'none';
      dirty = true;
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // kept small enough to live in the browser's storage with the rest of the settings
      const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      s.logo = c.toDataURL('image/png');
      logo = new Image();
      logo.onload = () => { dirty = true; };
      logo.src = s.logo;
      save();
      logoBtn.querySelector('.cycle-value').textContent = 'set';
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be opened.', { kind: 'error' }); };
    img.src = url;
  }
  const cornerBtn = cycle('Corner', CORNERS.map((c) => c[1]), () => CORNERS.findIndex((c) => c[0] === s.corner), (i) => { s.corner = CORNERS[i][0]; save(); dirty = true; });
  const showBtn = toggle('Show', () => s.show, (v) => { s.show = v; save(); dirty = true; }, { title: 'Show the name and the logo on the picture' });
  // A guest's switch stays on; pressing it offers the free account that takes the credit off.
  const creditBtn = toggle('Credit', credited, (v) => {
    if (account() === 'guest') {
      toast('A free account takes “made with visulaserz.com” off your videos.', { timeout: 6000 });
      window.dispatchEvent(new CustomEvent('visulaserz:auth-required', { detail: { mode: 'register' } }));
      return;
    }
    s.credit = v;
    save();
    dirty = true;
  });
  function syncCredit() {
    creditBtn.hidden = !account();
    creditBtn.title = account() === 'guest' ? 'Videos made as a guest say “made with visulaserz.com” in a corner. A free account takes it off.' : 'Put “made with visulaserz.com” in a corner of your videos';
    creditBtn.refresh();
  }
  syncCredit();
  window.addEventListener('visulaserz:account', () => { syncCredit(); dirty = true; });
  const cardBtn = toggle('Title card', () => s.card, (v) => { s.card = v; save(); }, { title: 'Open every recording with the cover, the title and the artist' });
  const cardTime = cycle('Card', CARD_SECONDS.map((v) => `${v} s`), () => CARD_SECONDS.indexOf(s.cardSeconds), (i) => { s.cardSeconds = CARD_SECONDS[i]; save(); });
  const preview = key('Preview card', { title: 'Show the title card now', onClick: () => showCard() });

  const grid = el('div', { class: 'knob-row clip-row' },
    group('Format', formatRow, sizeBtn),
    group('Name & logo', nameInput, logoBtn, cornerBtn, showBtn, creditBtn),
    group('Title card', cardBtn, cardTime, preview),
  );
  unit.append(grid);

  let creditTold = false;
  function showCard() {
    card = { t: 0, dur: s.cardSeconds };
    lcdShow('title card', `${s.cardSeconds} S`);
  }

  frame();
  document.fonts?.ready?.then(() => { dirty = true; });

  return {
    get settings() { return { ...s }; },
    get framed() { return s.format !== 'screen'; },
    get size() { return formatSize(s.format, s.size); },
    // the grid unit where the take recorder adds its own group
    get row() { return grid; },
    // REC has started: the title card opens it, when it is on
    recordingStarted() {
      recording = true;
      dirty = true;
      if (s.card) showCard();
      if (account() === 'guest' && !creditTold) { creditTold = true; toast('Guest videos say “made with visulaserz.com” in a corner. A free account takes it off.', { timeout: 6000 }); }
    },
    recordingStopped() { recording = false; dirty = true; },
    // REC films the canvas itself, so from before its first frame to its last the picture is made
    // at the video's exact size (ui.js toggleRecording)
    fixSize(on) {
      if (filming === !!on) return;
      filming = !!on;
      frame();
    },
    showCard,
    // draws the brand layer at time t into a canvas of w×h (for a rendered video)
    paintAt(w, h, t, withCard) {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const d = s.cardSeconds;
      const alpha = withCard && s.card && t < d ? (t < 0.35 ? t / 0.35 : t > d - 0.7 ? Math.max(0, (d - t) / 0.7) : 1) : 0;
      const credit = credited();
      paint(alpha, credit);
      return !!(s.show && (s.name.trim() || logo)) || alpha > 0 || credit;
    },
    canvas,
    tick(dt) {
      if ((beamAge += dt) > 0.5) { beamAge = 0; beam = getComputedStyle(document.documentElement).getPropertyValue('--beam').trim() || beam; }
      if (card) { card.t += dt; dirty = true; if (card.t > card.dur) card = null; }
      if (canvas.width !== renderer.canvas.width || canvas.height !== renderer.canvas.height) dirty = true;
      if (dirty) { dirty = false; refresh(); }
    },
  };
}
