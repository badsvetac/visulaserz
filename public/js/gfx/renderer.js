import {
  FULLSCREEN_VERT, SCENE_HEADER, PARTICLE_VERT, PARTICLE_FRAG, FEEDBACK_FRAG,
  BLOOM_PREFILTER_FRAG, BLOOM_DOWN_FRAG, BLOOM_UP_FRAG, COMPOSITE_FRAG,
} from './glsl.js';
import { PALETTES, blendPalettes } from './palettes.js';
import { LyricLayer } from './lyric-layer.js';
import { SPECTRUM_BINS, HIST_W, HIST_H } from '../audio/analysis.js';
import { clamp } from '../util.js';

const QUALITY_SCALE = { low: 0.5, medium: 0.75, high: 1, ultra: 0 }; // 0 = use devicePixelRatio
const MAX_PIXELS = 2560 * 1440;
const BLOOM_LEVELS = 5;
const PARTICLE_COUNT = { 1: 1400, 2: 500, 3: 260, 4: 512 };
export const SYMMETRY_MODES = ['Off', 'Mirror', 'Quad', 'Kaleido 6', 'Kaleido 12'];

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

// Compiling and linking are only *requested* by the constructor. Asking the driver how it went is
// what blocks, so that is left to finish(): with { defer: true } and KHR_parallel_shader_compile
// the work happens on another thread while the show keeps running, and finish() is called once
// done() says the result is in. Without defer the constructor finishes at once, as before.
class Program {
  constructor(gl, vert, frag, label, { defer = false } = {}) {
    this.gl = gl;
    this.label = label;
    this.vs = compile(gl, gl.VERTEX_SHADER, vert);
    this.fs = compile(gl, gl.FRAGMENT_SHADER, frag);
    this.handle = gl.createProgram();
    gl.attachShader(this.handle, this.vs);
    gl.attachShader(this.handle, this.fs);
    gl.linkProgram(this.handle);
    this.uniforms = null;
    if (!defer) this.finish();
  }

  // Without the extension there is no way to ask without waiting, so the answer is "go ahead and wait".
  done(ext) { return !ext || this.gl.getProgramParameter(this.handle, ext.COMPLETION_STATUS_KHR); }

  finish() {
    if (this.uniforms) return this;
    const gl = this.gl;
    const { handle } = this;
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      const log = [gl.getShaderInfoLog(this.fs), gl.getShaderInfoLog(this.vs), gl.getProgramInfoLog(handle)].filter(Boolean).join('\n');
      gl.deleteShader(this.vs);
      gl.deleteShader(this.fs);
      gl.deleteProgram(handle);
      throw new Error(`[${this.label}] ${log}`);
    }
    gl.deleteShader(this.vs);                                  // flagged for deletion; freed with the program
    gl.deleteShader(this.fs);
    this.uniforms = new Map();
    const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(handle, i);
      this.uniforms.set(info.name, { loc: gl.getUniformLocation(handle, info.name), type: info.type });
    }
    return this;
  }

  use() { this.gl.useProgram(this.handle); return this; }

  // Unknown names are ignored: GLSL compilers strip uniforms a shader does not use.
  set(values) {
    const gl = this.gl;
    for (const name in values) {
      const u = this.uniforms.get(name);
      if (!u) continue;
      const v = values[name];
      if (u.type === gl.FLOAT) gl.uniform1f(u.loc, v);
      else if (u.type === gl.FLOAT_VEC2) gl.uniform2f(u.loc, v[0], v[1]);
      else if (u.type === gl.FLOAT_VEC3) gl.uniform3f(u.loc, v[0], v[1], v[2]);
      else gl.uniform1i(u.loc, v);
    }
    return this;
  }
}

const HEADER_LINES = SCENE_HEADER.split('\n').length - 1;

export class Renderer {
  constructor(canvas, registry, { onSceneError } = {}) {
    this.canvas = canvas;
    this.registry = registry;                                          // which scenes exist: see registry.js
    this.onSceneError = onSceneError || (() => {});
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    // Half-float targets keep highlights above 1.0 for bloom and let long trails fade smoothly.
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');   // lets scenes compile off the main thread
    this.pending = new Map();                                          // scene id → Program still compiling
    this.queue = [];                                                   // scenes waiting for a compile slot
    this.pumping = false;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.look = {
      bloom: 0.9, aberration: 0.6, grain: 0.35, symmetry: 0, particles: true,
      quality: 'high', reduceFlashing: false, hueDrift: true, scanlines: false, glitch: false,
      softPalette: true,
    };
    this.trail = { trails: 0, zoom: 1, spin: 0 };
    this.trailOverrides = {};
    this.palette = PALETTES[0];   // where the palette is going
    this.palFrom = PALETTES[0];   // where it came from; equal to palette when nothing is gliding
    this.palProgress = 1;         // 0 → 1 across palFrom to palette
    this.palGlide = 0;            // seconds the current glide takes, 0 when it was instant
    this.hue = 0;
    this.time = 0;
    this.fade = 0;
    this.fps = 60;
    this.programs = new Map();
    this.failed = new Set();

    this.vao = gl.createVertexArray();
    this.feedback = new Program(gl, FULLSCREEN_VERT, FEEDBACK_FRAG, 'feedback');
    this.prefilter = new Program(gl, FULLSCREEN_VERT, BLOOM_PREFILTER_FRAG, 'bloom prefilter');
    this.down = new Program(gl, FULLSCREEN_VERT, BLOOM_DOWN_FRAG, 'bloom down');
    this.up = new Program(gl, FULLSCREEN_VERT, BLOOM_UP_FRAG, 'bloom up');
    this.composite = new Program(gl, FULLSCREEN_VERT, COMPOSITE_FRAG, 'composite');
    this.particles = new Program(gl, PARTICLE_VERT, PARTICLE_FRAG, 'particles');
    this.lyrics = new LyricLayer(gl);

    this.audioTex = this.#dataTexture(SPECTRUM_BINS, 6);
    this.histTex = this.#dataTexture(HIST_W, HIST_H);
    this.artTex = this.#imageTexture();
    this.textTex = this.#imageTexture();
    this.backdropTex = this.#imageTexture();
    this.hasArt = false;
    this.artAspect = 1;
    this.hasBackdrop = false;
    this.backdropAspect = 1;
    this.extra = { uSpin: 0, uProgress: 0 }; // per-frame values owned by the UI (record angle, progress)
    this.freeze = false;
    this.blackout = false;
    this.strobe = false;
    this.captureNext = null;

    this.needsResize = true;
    new ResizeObserver(() => { this.needsResize = true; }).observe(canvas);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onSceneError('Graphics', 'The graphics context was lost. Reload the page to bring the picture back.');
    });

    this.setScene(registry.scenes[0].id);
  }

  #dataTexture(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(w * h));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  #imageTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  #uploadImage(tex, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // images are top-down, texture space is bottom-up
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  setArt(image) {
    this.hasArt = !!image;
    if (!image) return;
    this.artAspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height) || 1;
    this.#uploadImage(this.artTex, image);
  }

  setText(canvas) {
    this.#uploadImage(this.textTex, canvas);
  }

  // A photo behind scenes that can use one (Rain shows it through the glass).
  setBackdrop(image) {
    this.hasBackdrop = !!image;
    if (!image) return;
    this.backdropAspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height) || 1;
    this.#uploadImage(this.backdropTex, image);
  }

  #target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }

  #freeTarget(t) {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  #resize() {
    this.needsResize = false;
    const cssW = Math.max(2, this.canvas.clientWidth);
    const cssH = Math.max(2, this.canvas.clientHeight);
    let scale = QUALITY_SCALE[this.look.quality] || window.devicePixelRatio || 1;
    scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
    const w = Math.max(2, Math.round(cssW * scale));
    const h = Math.max(2, Math.round(cssH * scale));
    if (this.sceneRT && w === this.sceneRT.w && h === this.sceneRT.h) return;
    this.canvas.width = w;
    this.canvas.height = h;

    [this.sceneRT, this.overlayRT, ...(this.fb || []), ...(this.bloom || [])].forEach((t) => this.#freeTarget(t));
    this.sceneRT = this.#target(w, h);
    this.overlayRT = this.#target(w, h);
    this.fb = [this.#target(w, h), this.#target(w, h)];
    this.fbIndex = 0;
    this.bloom = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(4, bw >> 1);
      bh = Math.max(4, bh >> 1);
      this.bloom.push(this.#target(bw, bh));
    }
  }

  // The scene's program, ready to draw. If it is still compiling in the background this waits for it.
  #sceneProgram(scene) {
    if (this.programs.has(scene.id)) return this.programs.get(scene.id);
    if (this.failed.has(scene.id)) return null;
    try {
      const program = (this.pending.get(scene.id) || new Program(this.gl, FULLSCREEN_VERT, SCENE_HEADER + scene.frag, scene.name, { defer: true })).finish();
      this.pending.delete(scene.id);
      this.programs.set(scene.id, program);
      return program;
    } catch (e) {
      console.error(e);
      this.pending.delete(scene.id);
      this.failed.add(scene.id);
      this.onSceneError(scene.name, e.message);
      return null;
    }
  }

  // Compile the scenes on the strip in the background so switching never hitches. With
  // KHR_parallel_shader_compile a few are in flight at once on the driver's own threads and the
  // show never waits; without it they are compiled one by one, spaced out. Called again whenever
  // the market adds a scene: what is already compiled, compiling or queued is left alone.
  warmUp(scenes = this.registry.scenes, delay = 600) {
    for (const scene of scenes) {
      const known = this.programs.has(scene.id) || this.failed.has(scene.id) || this.pending.has(scene.id) || this.queue.includes(scene);
      if (!known) this.queue.push(scene);
    }
    if (this.pumping || !this.queue.length) return;
    this.pumping = true;
    const slots = this.parallel ? 3 : 1;
    const pump = () => {
      for (const [id, program] of [...this.pending]) {
        if (!program.done(this.parallel)) continue;
        const scene = this.registry.get(id);
        if (scene) this.#sceneProgram(scene);
        else this.forget(id);                                          // removed while it was compiling
      }
      while (this.pending.size < slots && this.queue.length) {
        const scene = this.queue.shift();
        if (this.programs.has(scene.id) || this.failed.has(scene.id) || this.registry.get(scene.id) !== scene) continue;
        this.pending.set(scene.id, new Program(this.gl, FULLSCREEN_VERT, SCENE_HEADER + scene.frag, scene.name, { defer: true }));
      }
      if (this.queue.length || this.pending.size) setTimeout(pump, this.parallel ? 60 : 250);
      else this.pumping = false;
    };
    setTimeout(pump, delay);
  }

  // Resolves (true = usable) once a scene's shader has been compiled in the background, so that
  // cutting to a scene that was only just downloaded does not freeze the picture while the driver works.
  ready(scene) {
    this.warmUp([scene], 0);
    const i = this.queue.indexOf(scene);
    if (i > 0) this.queue.unshift(this.queue.splice(i, 1)[0]);         // somebody is waiting for this one: ahead of the background work
    return new Promise((resolve) => {
      const poll = () => {
        const settled = this.programs.has(scene.id) || this.failed.has(scene.id) || this.registry.get(scene.id) !== scene;
        if (settled) resolve(this.programs.has(scene.id));
        else setTimeout(poll, 40);
      };
      poll();
    });
  }

  // Drops everything the GPU holds for a scene: it left the strip, or its source was replaced.
  forget(id) {
    const program = this.programs.get(id) || this.pending.get(id);
    if (program) this.gl.deleteProgram(program.handle);
    this.programs.delete(id);
    this.pending.delete(id);
    this.failed.delete(id);
    this.queue = this.queue.filter((s) => s.id !== id);
  }

  // Compiles a scene now and says what is wrong with it, or null when it is fine. For scenes that
  // arrive as a dropped file: the market only accepts what this graphics card can actually run.
  check(scene) {
    this.forget(scene.id);
    try {
      this.programs.set(scene.id, new Program(this.gl, FULLSCREEN_VERT, SCENE_HEADER + scene.frag, scene.name));
      return null;
    } catch (e) {
      // the log counts lines from the top of the shared header; the author counts from their own file
      const line = /ERROR: \d+:(\d+): *(.*)/.exec(e.message);
      return line ? `line ${Math.max(1, Number(line[1]) - HEADER_LINES)}: ${line[2]}` : e.message.split('\n')[0];
    }
  }

  get sceneId() { return this.scene.id; }

  // `id` may be any scene whose code is loaded, on the strip or not: that is how the market's "Try" works.
  setScene(id) {
    const scene = this.registry.get(id);
    if (!scene || scene === this.scene) return;
    this.scene = scene;
    this.trail = { trails: scene.trails, zoom: scene.zoom, spin: scene.spin, ...this.trailOverrides[scene.id] };
    this.fade = 0;
    this.clearTrails = true;
  }

  setTrail(key, value) {
    this.trail[key] = value;
    (this.trailOverrides[this.scene.id] ||= {})[key] = value;
  }

  // glide is seconds; 0 changes palette on the spot. The shader holds both palettes and
  // crossfades them, so the picture never passes through a colour neither one contains.
  setPalette(id, { glide = 0 } = {}) {
    const next = PALETTES.find((p) => p.id === id) || PALETTES[0];
    if (next === this.palette && this.palProgress >= 1) return;
    if (glide > 0) {
      this.palFrom = this.palProgress < 1 ? blendPalettes(this.palFrom, this.palette, this.palProgress) : this.palette;
      this.palProgress = 0;
      this.palGlide = glide;
    } else {
      this.palFrom = next;
      this.palProgress = 1;
      this.palGlide = 0;
    }
    this.palette = next;
  }

  // What the eye is seeing right now, for the UI accent colour.
  get shownPalette() {
    return this.palProgress >= 1 ? this.palette : blendPalettes(this.palFrom, this.palette, this.palProgress);
  }

  setQuality(q) {
    this.look.quality = q;
    this.needsResize = true;
  }

  #bind(target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
  }

  #texture(unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  render(an, dt) {
    const gl = this.gl;
    if (this.needsResize) this.#resize();
    this.time += dt;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    this.fade = Math.min(1, this.fade + dt / 0.6);
    if (this.look.hueDrift) this.hue = (this.hue + dt * 0.008) % 1;
    if (this.palProgress < 1) this.palProgress = Math.min(1, this.palProgress + dt / this.palGlide);

    let scene = this.scene;
    let program = this.#sceneProgram(scene);
    if (!program) {
      scene = this.registry.scenes.find((s) => !this.failed.has(s.id));
      program = scene && this.#sceneProgram(scene);
      if (!program) return;
    }

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    const res = [this.sceneRT.w, this.sceneRT.h];
    const punch = this.look.reduceFlashing ? 0.25 : 1;
    let latest;

    if (this.freeze && this.fb) {
      // FREEZE pad: keep the last frame, but still run bloom + composite so strobe/blackout work.
      latest = this.fb[this.fbIndex];
    } else {
      this.#texture(0, this.audioTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SPECTRUM_BINS, 6, gl.RED, gl.UNSIGNED_BYTE, an.texture);
      this.#texture(1, this.histTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, HIST_W, HIST_H, gl.RED, gl.UNSIGNED_BYTE, an.history);
      this.#texture(2, this.artTex);
      this.#texture(3, this.textTex);
      this.#texture(4, this.backdropTex);

      const pal = this.palFrom;
      const pal2 = this.palette;
      // Smoothstep so a cycled change eases in and out instead of sliding at a constant rate,
      // which is what makes it read as a dissolve rather than a fader being pushed.
      const k = this.palProgress * this.palProgress * (3 - 2 * this.palProgress);
      const shared = {
        uRes: res, uTime: this.time, uTravel: an.travel, uCruise: an.cruise, uCruiseRate: an.cruiseRate,
        uBass: an.bass, uMid: an.mid, uHigh: an.high, uLevel: an.level, uEnergy: an.energy,
        uBeat: an.beat, uBeatAge: an.beatAge, uBeatCount: an.beatCount, uBalance: an.balance,
        uPunch: punch, uHue: this.hue, uHistFrac: an.historyFrac,
        uPalA: pal.a, uPalB: pal.b, uPalC: pal.c, uPalD: pal.d,
        uPalA2: pal2.a, uPalB2: pal2.b, uPalC2: pal2.c, uPalD2: pal2.d, uPalMix: k,
        uHasArt: this.hasArt ? 1 : 0, uArtAspect: this.artAspect, uXYGain: an.xyGain,
        uHasBackdrop: this.hasBackdrop ? 1 : 0, uBackdropAspect: this.backdropAspect,
        ...this.extra,
      };

      // 1. scene
      this.#bind(this.sceneRT);
      program.use().set(shared).set({ uAudio: 0, uHist: 1, uArt: 2, uText: 3, uBackdrop: 4 });
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2. particles, added on top (the vectorscope trace is not optional decoration)
      if (scene.particles && (this.look.particles || scene.particles === 4)) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        this.particles.use().set(shared).set({ uMode: scene.particles, uAudio: 0 });
        gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT[scene.particles]);
        gl.disable(gl.BLEND);
      }

      // 3. trails. The knob values are "per frame at 60 fps"; pow() makes them frame-rate independent.
      const frames = dt * 60;
      if (this.clearTrails) {
        this.clearTrails = false;
        for (const t of this.fb) {
          this.#bind(t);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      }
      const read = this.fb[this.fbIndex];
      const write = this.fb[1 - this.fbIndex];
      this.#bind(write);
      this.#texture(0, this.sceneRT.tex);
      this.#texture(1, read.tex);
      this.feedback.use().set({
        uScene: 0, uPrev: 1, uRes: res,
        uDecay: this.trail.trails > 0.001 ? Math.pow(this.trail.trails, frames) : 0,
        uZoom: Math.pow(this.trail.zoom, frames),
        uSpin: this.trail.spin * frames,
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.fbIndex = 1 - this.fbIndex;
      latest = write;
    }

    // 3b. lyrics into their own target (premultiplied), untouched by trails and symmetry
    this.#bind(this.overlayRT);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.clearColor(0, 0, 0, 1);
    if (this.lyrics.count) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.lyrics.draw(this.overlayRT.w, this.overlayRT.h);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.vao);
    }

    // 4. bloom pyramid
    const levels = this.bloom;
    const write = latest;
    this.#bind(levels[0]);
    this.#texture(0, write.tex);
    this.#texture(2, this.overlayRT.tex);
    this.prefilter.use().set({ uTex: 0, uOverlay: 2, uTexel: [1 / write.w, 1 / write.h], uThreshold: this.hdr ? 0.55 : 0.45, uKnee: 0.35 });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.down.use().set({ uTex: 0 });
    for (let i = 1; i < levels.length; i++) {
      this.#bind(levels[i]);
      this.#texture(0, levels[i - 1].tex);
      this.down.set({ uTexel: [1 / levels[i - 1].w, 1 / levels[i - 1].h] });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.up.use().set({ uTex: 0 });
    for (let i = levels.length - 1; i > 0; i--) {
      this.#bind(levels[i - 1]);
      this.#texture(0, levels[i].tex);
      this.up.set({ uTexel: [1 / levels[i].w, 1 / levels[i].h] });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    // 5. composite to the screen
    this.#bind(null);
    this.#texture(0, write.tex);
    this.#texture(1, levels[0].tex);
    this.#texture(2, this.overlayRT.tex);
    this.composite.use().set({
      uScene: 0, uBloom: 1, uOverlay: 2, uRes: [this.canvas.width, this.canvas.height], uTime: this.time,
      uBloomAmt: this.look.bloom * 0.55, uAberration: this.look.aberration,
      uGrain: this.look.grain, uBeat: an.beat, uPunch: punch, uFade: this.blackout ? 0 : this.fade,
      uScanlines: this.look.scanlines ? 1 : 0,
      uGlitch: this.look.glitch && !this.look.reduceFlashing ? 1 : 0,
      uStrobe: this.strobe && !this.look.reduceFlashing ? 1 : 0,
      uSymmetry: clamp(this.look.symmetry | 0, 0, 4),
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Snapshots must be read in the same frame: the drawing buffer is not preserved afterwards.
    if (this.captureNext) {
      const cb = this.captureNext;
      this.captureNext = null;
      this.canvas.toBlob(cb, 'image/png');
    }
  }
}
