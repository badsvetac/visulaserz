// Kinetic typography inside the WebGL pipeline, so lyrics are part of the recording and get
// bloom and colour fringing like everything else.
//
// The current line's words (or characters) are rasterised once into a canvas atlas; every frame
// each sprite gets a position, scale, rotation, colour and glow from the active style and is
// drawn as an instanced quad into the overlay target. Lines animate in when they start and out
// when the next one takes over.
//
// Each atlas cell holds two things: the crisp glyph in the green channel and a blurred copy in
// the alpha channel. The shader darkens the halo and lights the glyph, so words stay readable
// over a bright scene without a subtitle box.
const ATLAS = 2048;
const ATLAS_FONT = 110;
const PAD = 14;   // room for the halo around each glyph
const HALO = 9;   // blur radius of that halo, in atlas pixels

export const LYRIC_STYLE_DEFS = {
  rise:    { font: 'body',    per: 'word', stack: true },
  karaoke: { font: 'body',    per: 'word', stack: true },
  pulse:   { font: 'display', per: 'word', upper: true },
  type:    { font: 'mono',    per: 'char' },
  wave:    { font: 'body',    per: 'char' },
  scatter: { font: 'poster',  per: 'word', upper: true },
  glitch:  { font: 'display', per: 'word', upper: true },
  zoom:    { font: 'poster',  per: 'word', upper: true },
  flip:    { font: 'serif',   per: 'word' },
  slam:    { font: 'poster',  per: 'word', upper: true },
  fall:    { font: 'body',    per: 'char' },
  neon:    { font: 'serif',   per: 'char' },
  tower:   { font: 'poster',  per: 'word', upper: true, rows: 'word', align: 'left', sizeMul: 1.5 },
  swing:   { font: 'serif',   per: 'word' },
  split:   { font: 'display', per: 'word', upper: true },
};
export const LYRIC_STYLE_NAMES = Object.keys(LYRIC_STYLE_DEFS);
export const LYRIC_FONTS = {
  body: (px) => `600 ${px}px "Saira Semi Condensed", "Barlow Semi Condensed", sans-serif`,
  display: (px) => `400 ${px}px Michroma, "Eurostile", sans-serif`,
  poster: (px) => `400 ${px}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`,
  serif: (px) => `italic 700 ${px}px "Playfair Display", Georgia, serif`,
  mono: (px) => `500 ${px}px "Martian Mono", "JetBrains Mono", monospace`,
};

// Canvas rasterises with whatever face is available at that moment, so the web fonts must be
// in before the first line is drawn. Resolves once they are (or have failed) — never rejects.
export function loadLyricFonts() {
  if (!document.fonts?.load) return Promise.resolve();
  return Promise.all(Object.values(LYRIC_FONTS).map((f) => document.fonts.load(f(20)).catch(() => null)));
}

const VERT = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aPos;
layout(location = 2) in vec2 aSize;
layout(location = 3) in vec4 aUv;
layout(location = 4) in vec4 aColor;
layout(location = 5) in vec3 aRotGlowShadow;
uniform vec2 uRes;
out vec2 vUv;
out vec4 vColor;
out float vGlow;
out float vShadow;
void main() {
  float c = cos(aRotGlowShadow.x), s = sin(aRotGlowShadow.x);
  vec2 off = aCorner * aSize;
  off = vec2(off.x * c - off.y * s, off.x * s + off.y * c);
  gl_Position = vec4((aPos + off) / uRes * 2.0 - 1.0, 0.0, 1.0);
  vUv = mix(aUv.xy, aUv.zw, aCorner * 0.5 + 0.5);
  vColor = aColor;
  vGlow = aRotGlowShadow.y;
  vShadow = aRotGlowShadow.z;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in float vGlow;
in float vShadow;
uniform sampler2D uAtlas;
out vec4 outColor;
void main() {
  vec4 t = texture(uAtlas, vUv);
  float g = t.g;                 // crisp glyph coverage
  float h = max(t.a, g);         // glyph plus its blurred halo
  float a = vColor.a * max(g, h * vShadow);
  outColor = vec4(vColor.rgb * (g * vColor.a) * (1.0 + vGlow), a);   // premultiplied; the halo is pure darkening
}`;

const FLOATS = 15; // per instance: pos2 size2 uv4 color4 rot glow shadow
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const easeIn = (u) => Math.pow(clamp(u, 0, 1), 3);
const easeBack = (u) => { u = clamp(u, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
const bounce = (u) => {
  u = clamp(u, 0, 1);
  const n = 7.5625, d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
  return n * (u -= 2.625 / d) * u + 0.984375;
};

export class LyricLayer {
  constructor(gl) {
    this.gl = gl;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS;
    this.ctx = this.canvas.getContext('2d');
    this.cursor = { x: 0, y: 0, rowH: 0 };
    this.atlasDirty = false;
    this.#build(gl);

    this.data = new Float32Array(FLOATS * 1024);
    this.count = 0;
    this.current = null;   // { sprites, style, def, lineT, lineEnd, words, stack: {prev, next} }
    this.leaving = null;   // the previous line while it animates out
    this.accent = [1, 0.3, 0.85];
    this.beatAt = -10;
    this.shake = 0;
  }

  // after a lost context: new GPU objects, and the glyph atlas (kept on its 2D canvas) sent again
  restore(gl) {
    this.gl = gl;
    this.#build(gl);
    this.atlasDirty = true;
  }

  #build(gl) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`[lyrics] ${gl.getShaderInfoLog(sh)}`);
      return sh;
    };
    this.program = gl.createProgram();
    gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(`[lyrics] ${gl.getProgramInfoLog(this.program)}`);
    this.uRes = gl.getUniformLocation(this.program, 'uRes');
    this.uAtlas = gl.getUniformLocation(this.program, 'uAtlas');

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instances = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    const stride = FLOATS * 4;
    [[1, 2, 0], [2, 2, 8], [3, 4, 16], [4, 4, 32], [5, 3, 48]].forEach(([loc, size, offset]) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    });
    gl.bindVertexArray(null);
  }

  setAccent(rgb) { this.accent = rgb; }

  // ── atlas ──────────────────────────────────────────────────────────────────
  #resetAtlas() {
    this.ctx.clearRect(0, 0, ATLAS, ATLAS);
    this.cursor = { x: 0, y: 0, rowH: 0 };
  }

  // Draws one string into the atlas. The returned rect's w/h are the glyph's advance box (for
  // layout); cw/ch and the uv cover the whole padded cell, halo included.
  #raster(text, font) {
    const ctx = this.ctx;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    const gw = Math.ceil(ctx.measureText(text).width);
    const gh = Math.ceil(ATLAS_FONT * 1.35);
    const w = gw + PAD * 2, h = gh + PAD * 2;
    if (this.cursor.x + w > ATLAS) { this.cursor.x = 0; this.cursor.y += this.cursor.rowH; this.cursor.rowH = 0; }
    if (this.cursor.y + h > ATLAS) return null; // atlas full: the sprite is skipped
    const x = this.cursor.x, y = this.cursor.y;
    // halo first, in red so the shader can tell it from the glyph, which lands in green
    ctx.shadowColor = '#f00'; ctx.shadowBlur = HALO; ctx.fillStyle = '#f00';
    ctx.fillText(text, x + PAD, y + h / 2);
    ctx.fillText(text, x + PAD, y + h / 2);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff';
    ctx.fillText(text, x + PAD, y + h / 2);
    this.cursor.x += w;
    this.cursor.rowH = Math.max(this.cursor.rowH, h);
    this.atlasDirty = true;
    // the texture is uploaded flipped, so v runs bottom-up
    return { w: gw, h: gh, cw: w, ch: h, u0: x / ATLAS, v0: 1 - (y + h) / ATLAS, u1: (x + w) / ATLAS, v1: 1 - y / ATLAS };
  }

  // Rasterises a line into word or character sprites. Returns null when there is nothing to draw.
  setLine({ line, prev, next, index, style, font, locale }) {
    const def = LYRIC_STYLE_DEFS[style] || LYRIC_STYLE_DEFS.rise;
    const fontFn = LYRIC_FONTS[font || def.font] || LYRIC_FONTS.body;
    const fontStr = fontFn(ATLAS_FONT);
    const fix = (s) => (def.upper ? s.toLocaleUpperCase(locale || undefined) : s);
    if (this.current) {
      this.leaving = { ...this.current, exitStart: performance.now() / 1000 };
    }
    this.#resetAtlas();
    // the leaving line's sprites still reference the old atlas: re-rasterise them first
    if (this.leaving) {
      const lv = this.leaving;
      const lvFont = (LYRIC_FONTS[lv.font] || LYRIC_FONTS.body)(ATLAS_FONT);
      lv.sprites = lv.sprites.map((s) => ({ ...s, rect: this.#raster(s.text, lvFont) })).filter((s) => s.rect);
      lv.stack = null;
    }
    if (!line) { this.current = null; return; }
    const sprites = [];
    const words = line.words.length ? line.words : [{ text: '♪', t: line.t, end: line.end }];
    words.forEach((w, wi) => {
      const text = fix(w.text);
      if (def.per === 'char') {
        const chars = [...text];
        chars.forEach((ch, ci) => {
          const rect = this.#raster(ch, fontStr);
          if (rect) sprites.push({ text: ch, rect, wi, ci, n: chars.length, word: w, seed: index * 131 + wi * 17 + ci });
        });
      } else {
        const rect = this.#raster(text, fontStr);
        if (rect) sprites.push({ text, rect, wi, ci: 0, n: 1, word: w, seed: index * 131 + wi * 17 });
      }
    });
    const stack = def.stack ? {
      prev: prev?.text ? this.#raster(prev.text, fontStr) : null,
      next: next?.text ? this.#raster(next.text, fontStr) : null,
    } : null;
    this.current = { sprites, def, style, font: font || def.font, lineT: line.t, lineEnd: line.end, words, stack, index, startedAt: performance.now() / 1000 };
  }

  clear() {
    this.current = null;
    this.leaving = null;
    this.count = 0;
  }

  // ── per-frame ──────────────────────────────────────────────────────────────
  // p: { t, dt, beat, isBeat, level, W, H, stageFrac, place, sizeFrac }
  update(p) {
    this.count = 0;
    const now = performance.now() / 1000;
    if (p.isBeat) this.beatAt = now;
    this.shake = Math.max(0, this.shake - p.dt * 6);
    if (this.leaving && now - this.leaving.exitStart > 0.8) this.leaving = null;
    if (this.leaving) this.#emitLine(this.leaving, p, now, clamp((now - this.leaving.exitStart) / 0.6, 0, 1));
    if (this.current) this.#emitLine(this.current, p, now, -1);
  }

  #layout(line, p, scaleMul) {
    const def = line.def;
    const fontPx = p.sizeFrac * p.H * scaleMul;
    const scale = fontPx / ATLAS_FONT;
    const space = 0.3 * fontPx;
    const maxW = 0.86 * p.W;
    const wordRows = def.rows === 'word';
    // greedy wrap by word (or one word per row)
    const rows = [];
    let row = [], rowW = 0;
    let wordW = 0, wordSprites = [];
    const flushWord = () => {
      if (!wordSprites.length) return;
      const add = (rowW ? space : 0) + wordW;
      if ((wordRows || rowW + add > maxW) && row.length) { rows.push({ items: row, w: rowW }); row = []; rowW = 0; }
      const start = rowW + (rowW ? space : 0);
      let x = start;
      for (const s of wordSprites) { row.push({ s, x: x + (s.rect.w * scale) / 2 }); x += s.rect.w * scale; }
      rowW = start + wordW;
      wordSprites = [];
      wordW = 0;
    };
    let lastWi = -1;
    for (const s of line.sprites) {
      if (s.wi !== lastWi) { flushWord(); lastWi = s.wi; }
      wordSprites.push(s);
      wordW += s.rect.w * scale;
    }
    flushWord();
    if (row.length) rows.push({ items: row, w: rowW });
    const lineH = fontPx * (wordRows ? 0.98 : 1.12);
    const stageH = p.H * p.stageFrac;
    const frac = p.place === 'upper' ? 0.74 : p.place === 'center' ? 0.52 : 0.34; // fraction of the stage, from the bottom
    const yCenter = (p.H - stageH) + stageH * frac;
    const y0 = yCenter + ((rows.length - 1) * lineH) / 2;
    const placed = [];
    rows.forEach((r, ri) => {
      const x0 = def.align === 'left' ? 0.07 * p.W : (p.W - r.w) / 2;
      for (const it of r.items) placed.push({ s: it.s, x: x0 + it.x, y: y0 - ri * lineH, size: [(it.s.rect.cw * scale) / 2, (it.s.rect.ch * scale) / 2] });
    });
    return { placed, fontPx, yCenter, blockH: rows.length * lineH, scale };
  }

  #push(x, y, hw, hh, rect, r, g, b, a, rot, glow, shadow) {
    if (a <= 0.001) return;
    if (this.count * FLOATS + FLOATS > this.data.length) return;
    const d = this.data, o = this.count * FLOATS;
    d[o] = x; d[o + 1] = y; d[o + 2] = hw; d[o + 3] = hh;
    d[o + 4] = rect.u0; d[o + 5] = rect.v0; d[o + 6] = rect.u1; d[o + 7] = rect.v1;
    d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a;
    d[o + 12] = rot; d[o + 13] = glow; d[o + 14] = shadow;
    this.count++;
  }

  #emitLine(line, p, now, ex) {
    const sizeMul = line.def.sizeMul || 1;
    let L = this.#layout(line, p, sizeMul);
    const limit = 0.72 * p.H * p.stageFrac;
    if (L.blockH > limit) L = this.#layout(line, p, (sizeMul * limit) / L.blockH); // tall stacks shrink to fit
    const age = Math.max(0, p.t - line.lineT);
    const style = line.style;
    const [ar, ag, ab] = this.accent;
    const beatAge = now - this.beatAt;
    const beat = p.beat;
    const fx = L.fontPx;
    const n = L.placed.length;
    const exiting = ex >= 0;
    const shakeX = this.shake > 0 ? (hash(now * 60) - 0.5) * this.shake * fx * 0.08 : 0;
    const shakeY = this.shake > 0 ? (hash(now * 60 + 7) - 0.5) * this.shake * fx * 0.08 : 0;

    // dim neighbours for stacked styles
    if (line.stack && !exiting) {
      const small = L.scale * 0.55;
      const gap = L.blockH / 2 + fx * 0.75;
      const fade = easeOut(age / 0.5);
      const { prev, next } = line.stack;
      if (prev) this.#push(p.W / 2, L.yCenter + gap, (prev.cw * small) / 2, (prev.ch * small) / 2, prev, 1, 1, 1, 0.3 * fade, 0, 0, 0.6);
      if (next) this.#push(p.W / 2, L.yCenter - gap, (next.cw * small) / 2, (next.ch * small) / 2, next, 1, 1, 1, 0.42 * fade, 0, 0, 0.6);
    }

    L.placed.forEach(({ s, x, y, size }, k) => {
      const w = s.word;
      const wp = clamp((p.t - w.t) / Math.max(w.end - w.t, 0.05), 0, 1);
      const r1 = hash(s.seed + 0.1), r2 = hash(s.seed + 0.7), r3 = hash(s.seed + 1.3);
      let dx = shakeX, dy = shakeY, sx = 1, sy = 1, rot = 0, a = 1, glow = 0, shadow = 0.7;
      let cr = 1, cg = 1, cb = 1;
      const stagger = k / Math.max(1, n - 1);
      const enter = clamp((age - stagger * 0.35) / 0.45, 0, 1);

      switch (style) {
        case 'rise': {
          const e = easeOut(enter);
          dy += (1 - e) * 0.6 * fx; a = e;
          if (exiting) { dy += ex * 0.9 * fx; a = 1 - ex; }
          break;
        }
        case 'karaoke': {
          a = easeOut(enter);
          const sung = wp >= 1, singing = wp > 0 && wp < 1;
          const m = sung ? 1 : singing ? wp : 0;
          cr = 0.55 + (ar - 0.55) * m; cg = 0.55 + (ag - 0.55) * m; cb = 0.55 + (ab - 0.55) * m;
          if (singing) { sx = sy = 1 + 0.1 * Math.sin(wp * Math.PI); glow = 0.6; }
          if (exiting) a = 1 - ex;
          break;
        }
        case 'pulse': {
          a = easeOut(enter);
          sx = sy = (1 + beat * 0.14) * a;
          glow = 0.4 + beat * 1.8;
          cr = 0.7 + ar * 0.3; cg = 0.7 + ag * 0.3; cb = 0.7 + ab * 0.3;
          if (exiting) { a = 1 - ex; sx = sy = 1 - ex * 0.3; }
          break;
        }
        case 'type': {
          a = clamp(wp * s.n - s.ci, 0, 1) >= 0.5 ? 1 : 0;
          if (exiting) a *= 1 - ex;
          glow = 0.25;
          break;
        }
        case 'wave': {
          const ph = now * 4 + k * 0.45;
          dy += Math.sin(ph) * 0.13 * fx;
          a = easeOut(enter);
          const hue = (k / Math.max(1, n)) * 0.6 + now * 0.05;
          cr = 0.5 + 0.5 * Math.cos(6.283 * (hue)); cg = 0.5 + 0.5 * Math.cos(6.283 * (hue + 0.33)); cb = 0.5 + 0.5 * Math.cos(6.283 * (hue + 0.67));
          glow = 0.5; shadow = 0.85;
          if (exiting) a = 1 - ex;
          break;
        }
        case 'scatter': {
          const e = easeBack(enter);
          dx += (1 - e) * (r1 - 0.5) * p.W * 0.8; dy += (1 - e) * (r2 - 0.5) * p.H * 0.8;
          rot = (1 - e) * (r3 - 0.5) * 3; sx = sy = 0.4 + 0.6 * e; a = easeOut(enter);
          if (exiting) { const g = easeIn(ex); dx += g * (r2 - 0.5) * p.W; dy += g * (r1 - 0.5) * p.H; rot = g * (r3 - 0.5) * 4; a = 1 - ex; }
          glow = 0.2;
          break;
        }
        case 'glitch': {
          a = easeOut(enter);
          if (exiting) a = 1 - ex;
          const hit = beatAge < 0.16;
          if (hit) {
            const j = hash(now * 90 + k) - 0.5;
            dx += j * fx * 0.35;
            const off = fx * 0.05;
            // r/g/b copies produce the chromatic tear; the white pass below completes the glyph
            this.#push(x + dx - off, y + dy, size[0], size[1], s.rect, 1, 0.1, 0.1, a * 0.9, 0, 0.3, 0);
            this.#push(x + dx + off, y + dy, size[0], size[1], s.rect, 0.1, 1, 0.3, a * 0.9, 0, 0.3, 0);
            this.#push(x + dx, y + dy + off * 0.6, size[0], size[1], s.rect, 0.2, 0.3, 1, a * 0.9, 0, 0.3, 0);
            a *= 0.6;
          }
          glow = 0.3;
          break;
        }
        case 'zoom': {
          const e = easeOut(enter);
          sx = sy = (0.15 + 0.85 * e) * (1 + age * 0.04);
          a = e;
          if (exiting) { sx = sy = (1 + age * 0.04) * (1 + easeIn(ex) * 3); a = 1 - ex; }
          glow = 0.35 + beat * 0.6;
          break;
        }
        case 'flip': {
          const e = easeBack(enter);
          sy = Math.max(0.02, e); dy += (1 - e) * 0.25 * fx; a = easeOut(enter);
          rot = (1 - e) * 0.35;
          if (exiting) { const g = easeIn(ex); sy = Math.max(0.02, 1 - g); rot = -g * 0.4; a = 1 - ex; }
          cr = 0.95; cg = 0.92; cb = 0.85; glow = 0.25;
          break;
        }
        case 'slam': {
          const since = p.t - w.t;
          if (since < 0) { a = 0; break; }
          const e = clamp(since / 0.18, 0, 1);
          const pop = 2.4 - 1.4 * easeOut(e);
          sx = sy = pop; a = easeOut(clamp(since / 0.08, 0, 1));
          if (since < 0.05 && s.ci === 0) this.shake = 1;
          glow = 0.6 + (1 - e) * 2.0 + beat * 0.5;
          if (exiting) a = 1 - ex;
          break;
        }
        case 'fall': {
          const u = clamp((age - stagger * 0.5) / 0.9, 0, 1);
          dy += (1 - bounce(u)) * 1.6 * fx;
          a = clamp(u * 4, 0, 1);
          if (exiting) { const g = easeIn(ex); dy -= g * 1.8 * fx; rot = g * (r1 - 0.5) * 2; a = 1 - ex; }
          break;
        }
        case 'neon': {
          const warm = clamp(age / 0.6, 0, 1);
          const flick = hash(Math.floor(now * 28) + s.seed) < 0.15 + 0.85 * warm * warm;
          const steady = warm >= 1 ? 1 : flick ? 1 : 0.12;
          a = steady;
          cr = ar; cg = ag; cb = ab;
          glow = 1.2 * (steady > 0.5 ? 1 : 0.1) + beat * 0.6; shadow = 0.45;
          if (exiting) { a *= hash(Math.floor(now * 40) + s.seed) < 1 - ex ? 1 : 0.1; a *= 1 - ex * 0.5; }
          break;
        }
        case 'tower': {
          // one word per row, hammered in from the left; every other row takes the accent
          const u = clamp((age - s.wi * 0.12) / 0.5, 0, 1);
          const e = easeBack(u);
          dx += (e - 1) * p.W * 0.5; a = easeOut(clamp((age - s.wi * 0.12) / 0.25, 0, 1));
          if (s.wi % 2) { cr = ar; cg = ag; cb = ab; }
          glow = 0.25 + beat * 0.4;
          if (exiting) { const g = easeIn(ex); dx += g * p.W * 0.6; a = 1 - ex; }
          break;
        }
        case 'swing': {
          // hangs from a pivot above each word and swings to rest, like a sign in the wind
          const u = clamp((age - stagger * 0.3) / 1.2, 0, 1);
          const damp = Math.exp(-u * 4.5);
          rot = Math.sin(u * 14) * 0.6 * damp;
          const pivot = size[1] * 1.6 + fx * 0.4;
          dx += Math.sin(rot) * pivot; dy += (1 - Math.cos(rot)) * pivot;
          a = easeOut(clamp((age - stagger * 0.3) / 0.3, 0, 1));
          cr = 0.98; cg = 0.94; cb = 0.86; glow = 0.2;
          if (exiting) { const g = easeIn(ex); dy -= g * p.H * 0.6; rot += ex * 0.8; a = 1 - ex; }
          break;
        }
        case 'split': {
          // words arrive from alternating sides, stretched by their speed, and lock into place
          const side = s.wi % 2 ? 1 : -1;
          const u = clamp((age - stagger * 0.25) / 0.5, 0, 1);
          const e = easeBack(u);
          dx += (1 - e) * side * p.W * 0.6; sx = 1 + (1 - e) * 0.6;
          a = easeOut(clamp((age - stagger * 0.25) / 0.2, 0, 1));
          glow = 0.3 + beat * 0.3;
          if (exiting) { const g = easeIn(ex); dx += g * side * p.W * 0.7; sx = 1 + g * 0.6; a = 1 - ex; }
          break;
        }
        default: a = 1;
      }
      this.#push(x + dx, y + dy, size[0] * sx, size[1] * sy, s.rect, cr, cg, cb, a, rot, glow, shadow);
    });
  }

  draw(W, H) {
    if (!this.count) return;
    const gl = this.gl;
    if (this.atlasDirty) {
      this.atlasDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * FLOATS), gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uAtlas, 0);
    gl.uniform2f(this.uRes, W, H);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }
}
