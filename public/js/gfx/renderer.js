import {
  FULLSCREEN_VERT, SCENE_HEADER, PARTICLE_VERT, PARTICLE_FRAG, FEEDBACK_FRAG,
  BLOOM_PREFILTER_FRAG, BLOOM_DOWN_FRAG, BLOOM_UP_FRAG, COMPOSITE_FRAG, BLIT_FRAG,
  SIM_DECL, pointVertex, POINT_FRAG, POINT_FRAG_HEADER,
} from './glsl.js';
import { PALETTES, blendPalettes } from './palettes.js';
import { LyricLayer } from './lyric-layer.js';
import { SPECTRUM_BINS, HIST_W, HIST_H } from '../audio/analysis.js';
import { clamp, isPhone } from '../util.js';

// 0 = use devicePixelRatio. Auto is High on a desktop; on a phone it starts at Medium and the
// pacer (pacer.js) moves it with how long the frames take.
const QUALITY_SCALE = { auto: isPhone ? 0.75 : 1, low: 0.5, medium: 0.75, high: 1, ultra: 0 };
const MAX_PIXELS = 2560 * 1440;
const PHONE_PIXELS = 1.0e6;   // Ultra on a phone would be ~3 Mpx at DPR 3: about 1.7x CSS pixels is the most it gets
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

// A scene is one program, or two or three when it brings its own points or simulation (glsl.js,
// "scene extras"). They compile together and are finished, used and thrown away together.
class SceneProgram {
  constructor(gl, scene, { defer = false, floatTargets = true } = {}) {
    this.parts = [];
    this.points = null;
    this.sim = null;
    // settled when finish() runs, so a background compile queue never meets an exception
    this.error = scene.sim && !floatTargets ? `[${scene.name}] This scene runs a simulation, which needs half-float render targets this graphics card does not offer.` : null;
    if (!this.error) {
      const decl = scene.sim ? SIM_DECL : '';
      this.main = this.#add(new Program(gl, FULLSCREEN_VERT, SCENE_HEADER + decl + scene.frag, scene.name, { defer: true }));
      if (scene.points) {
        const frag = scene.points.frag ? POINT_FRAG_HEADER + scene.points.frag : POINT_FRAG;
        this.points = this.#add(new Program(gl, pointVertex(scene.points.vert, !!scene.sim), frag, `${scene.name} points`, { defer: true }));
      }
      if (scene.sim) this.sim = this.#add(new Program(gl, FULLSCREEN_VERT, SCENE_HEADER + SIM_DECL + scene.sim.frag, `${scene.name} sim`, { defer: true }));
      this.handle = this.main.handle;
    }
    if (!defer) this.finish();
  }

  #add(program) { this.parts.push(program); return program; }

  done(ext) { return this.parts.every((p) => p.done(ext)); }

  finish() {
    if (this.error) throw new Error(this.error);
    try {
      for (const p of this.parts) p.finish();
    } catch (e) {
      this.dispose();
      throw e;
    }
    return this;
  }

  dispose() {
    for (const p of this.parts) {
      p.gl.deleteProgram(p.handle);
      p.gl.deleteShader(p.vs);
      p.gl.deleteShader(p.fs);
    }
  }

  use() { return this.main.use(); }
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
    this.pending = new Map();                                          // scene id → Program still compiling
    this.queue = [];                                                   // scenes waiting for a compile slot
    this.pumping = false;
    this.simState = null;                                              // the current scene's simulation, when it has one

    this.look = {
      bloom: 0.9, aberration: 0.6, grain: 0.35, symmetry: 0, particles: true,
      quality: 'auto', fps: 'auto', reduceFlashing: false, hueDrift: true, scanlines: false, glitch: false,
      softPalette: true,
    };
    this.dynamicScale = 1;                                             // set by the pacer on phones
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

    this.#build();
    this.lyrics = new LyricLayer(gl);
    this.hasBrand = false;
    this.fixedSize = null;   // { w, h } while the picture is made for a video of a given size
    this.artImage = null;    // the cover itself, for the clip's title card
    this.hasArt = false;
    this.artAspect = 1;
    this.hasBackdrop = false;
    this.backdropAspect = 1;
    this.extra = { uSpin: 0, uProgress: 0, uElapsed: 0, uDuration: 0 }; // per-frame values owned by the UI (record angle, where the track is)
    this.freeze = false;
    this.blackout = false;
    this.strobe = false;
    this.captureNext = null;
    // What the market's tools do to the picture: see hit(), shock() and bend()
    this.visual = { strength: 0, age: 9, count: 0, shock: 0, bend: { hue: 0, warp: 0, twist: 0, spin: 0, slow: 0 }, want: { hue: 0, warp: 0, twist: 0, spin: 0, slow: 0 } };

    this.needsResize = true;
    new ResizeObserver(() => { this.needsResize = true; }).observe(canvas);
    // Phones drop the GPU context when the screen locks or memory runs short. Everything the GPU
    // held is rebuilt from what the page still has (the scenes' sources, the cover, the lyric
    // atlas), so the picture comes back by itself and the music never has to stop for a reload.
    let lostAt = 0;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();                                              // without this the browser never gives it back
      lostAt = performance.now();
      // say so only if it stays gone while somebody is looking (a phone coming back from lock gets it back in a moment)
      const tell = () => {
        if (!gl.isContextLost() || !lostAt) return;
        if (document.hidden) return document.addEventListener('visibilitychange', () => setTimeout(tell, 5000), { once: true });
        this.onSceneError('Graphics', 'The graphics card stopped drawing. Reload the page if the picture does not come back.');
      };
      setTimeout(tell, 5000);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      lostAt = 0;
      this.#rebuild();
    });

    this.setScene(registry.scenes[0].id);
  }

  // every GPU object the renderer owns, made fresh: at start, and again after a lost context
  #build() {
    const gl = this.gl;
    // Half-float targets keep highlights above 1.0 for bloom and let long trails fade smoothly.
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');   // lets scenes compile off the main thread
    this.pointMax = Math.min(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)?.[1] || 64, 512);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.vao = gl.createVertexArray();
    this.feedback = new Program(gl, FULLSCREEN_VERT, FEEDBACK_FRAG, 'feedback');
    this.prefilter = new Program(gl, FULLSCREEN_VERT, BLOOM_PREFILTER_FRAG, 'bloom prefilter');
    this.down = new Program(gl, FULLSCREEN_VERT, BLOOM_DOWN_FRAG, 'bloom down');
    this.up = new Program(gl, FULLSCREEN_VERT, BLOOM_UP_FRAG, 'bloom up');
    this.composite = new Program(gl, FULLSCREEN_VERT, COMPOSITE_FRAG, 'composite');
    this.particles = new Program(gl, PARTICLE_VERT, PARTICLE_FRAG, 'particles');
    this.blit = new Program(gl, FULLSCREEN_VERT, BLIT_FRAG, 'blit');

    this.audioTex = this.#dataTexture(SPECTRUM_BINS, 6);
    this.histTex = this.#dataTexture(HIST_W, HIST_H);
    this.artTex = this.#imageTexture();
    this.textTex = this.#imageTexture();
    this.backdropTex = this.#imageTexture();
    this.brandTex = this.#imageTexture();
  }

  #rebuild() {
    // scenes somebody was waiting for (a Try in the market) are compiled again first
    const waiting = [...this.queue, ...[...this.pending.keys()].map((id) => this.registry.get(id)).filter(Boolean)];
    // the old objects died with the context: forget them without deleting
    this.programs.clear();
    this.pending.clear();
    this.failed.clear();
    this.queue = [];
    this.pumping = false;
    this.simState = null;
    this.sceneRT = this.overlayRT = null;
    this.fb = null;
    this.bloom = [];
    this.#build();
    this.lyrics.restore(this.gl);
    if (this.artImage) this.setArt(this.artImage);
    if (this.textSource) this.setText(this.textSource);
    if (this.backdropImage) this.setBackdrop(this.backdropImage);
    if (this.brandSource) this.setBrand(this.brandSource);
    this.needsResize = true;
    this.clearTrails = true;
    this.warmUp([this.scene, ...waiting, ...this.registry.scenes], 0);
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
    this.artImage = image || null;
    if (!image) return;
    this.artAspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height) || 1;
    this.#uploadImage(this.artTex, image);
  }

  setText(canvas) {
    this.textSource = canvas;
    this.#uploadImage(this.textTex, canvas);
  }

  // The clip's own layer (name, logo, title card), drawn by clip.js on a 2D canvas the size of the
  // picture. It goes over everything with the lyrics, untouched by trails, symmetry or a tool's bend.
  setBrand(canvas) {
    this.hasBrand = !!canvas;
    this.brandSource = canvas || null;
    if (!canvas) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.brandTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  // A picture of a set size whatever the window (a 1080×1920 video on a laptop), or null for the window.
  setFixedSize(size) {
    this.fixedSize = size && size.w > 0 && size.h > 0 ? { w: Math.round(size.w), h: Math.round(size.h) } : null;
    this.needsResize = true;
  }

  // A photo behind scenes that can use one (Rain shows it through the glass).
  setBackdrop(image) {
    this.hasBackdrop = !!image;
    this.backdropImage = image || null;
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
    let scale = (QUALITY_SCALE[this.look.quality] ?? 1) || window.devicePixelRatio || 1;
    scale = Math.min(scale * this.dynamicScale, Math.sqrt((isPhone ? PHONE_PIXELS : MAX_PIXELS) / (cssW * cssH)));
    // a video of a set size is made at exactly that size, however small it is shown
    const w = this.fixedSize ? this.fixedSize.w : Math.max(2, Math.round(cssW * scale));
    const h = this.fixedSize ? this.fixedSize.h : Math.max(2, Math.round(cssH * scale));
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
    if (this.failed.has(scene.id) || this.gl.isContextLost()) return null;   // a lost context fails every compile: not the scene's fault
    try {
      const program = (this.pending.get(scene.id) || new SceneProgram(this.gl, scene, { defer: true, floatTargets: this.hdr })).finish();
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
      if (this.gl.isContextLost()) { this.pumping = false; return; }     // the restore starts a new warm-up
      for (const [id, program] of [...this.pending]) {
        if (!program.done(this.parallel)) continue;
        const scene = this.registry.get(id);
        if (scene) this.#sceneProgram(scene);
        else this.forget(id);                                          // removed while it was compiling
      }
      while (this.pending.size < slots && this.queue.length) {
        const scene = this.queue.shift();
        if (this.programs.has(scene.id) || this.failed.has(scene.id) || this.registry.get(scene.id) !== scene) continue;
        this.pending.set(scene.id, new SceneProgram(this.gl, scene, { defer: true, floatTargets: this.hdr }));
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
        if (settled) return resolve(this.programs.has(scene.id));
        // whatever dropped it from the queue (a lost context), ask again rather than wait for ever
        if (!this.gl.isContextLost() && !this.pending.has(scene.id) && !this.queue.includes(scene)) this.warmUp([scene], 0);
        setTimeout(poll, 40);
      };
      poll();
    });
  }

  // Drops everything the GPU holds for a scene: it left the strip, or its source was replaced.
  forget(id) {
    const program = this.programs.get(id) || this.pending.get(id);
    if (program) program.dispose();
    this.programs.delete(id);
    this.pending.delete(id);
    this.failed.delete(id);
    this.queue = this.queue.filter((s) => s.id !== id);
    if (this.simState?.id === id) this.#dropSim();
  }

  // Compiles a scene now and says what is wrong with it, or null when it is fine. For scenes that
  // arrive as a dropped file: the market only accepts what this graphics card can actually run.
  check(scene) {
    this.forget(scene.id);
    try {
      this.programs.set(scene.id, new SceneProgram(this.gl, scene, { floatTargets: this.hdr }));
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

  // ── the tools' channel ─────────────────────────────────────────────────────
  // A tool can hit the picture (a drum pad: every scene sees a beat), shock it (a drop: a burst of
  // fringe and bloom) or bend it while it is being played (a sweep turning the colours, a scratch
  // turning the frame, a riser pulling it in). None of it goes near the beat detector, so a pad
  // played on the off-beat can light the show without dragging the tempo with it. Reduce flashing
  // softens all of it, as it does the music's own flashes.
  // While a take is being rendered (busy) only the take's own replayed calls (force) are heard.
  hit(strength = 1, force = false) {
    if (this.busy && !force) return;
    const v = this.visual;
    v.strength = clamp(strength, 0, 1);
    v.age = 0;
    v.count++;
  }
  shock(amount = 1, force = false) {
    if (this.busy && !force) return;
    this.visual.shock = Math.max(this.visual.shock, clamp(amount, 0, 1));
  }
  // Called every frame while a tool bends the picture; once it stops calling, the picture eases back.
  bend(values, force = false) {
    if (this.busy && !force) return;
    const want = this.visual.want;
    for (const k in values) if (k in want && Number.isFinite(values[k])) want[k] += values[k];
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

  // Advances the scene's simulation (glsl.js, "scene extras") and leaves its newest state bound to
  // texture unit 5. Steps are counted in 60ths of a second, so it keeps its pace on any screen; the
  // state starts from zero whenever the scene comes on or the screen changes shape.
  #simulate(scene, sim, shared, dt) {
    const gl = this.gl;
    const h = scene.sim.height;
    const w = Math.max(2, Math.round(h * this.sceneRT.w / this.sceneRT.h));
    let s = this.simState;
    if (!s || s.id !== scene.id || s.w !== w || s.h !== h) {
      this.#dropSim();
      s = this.simState = { id: scene.id, w, h, read: this.#target(w, h), write: this.#target(w, h), frame: 0, clock: 1 };
    }
    s.clock = Math.min(s.clock + dt * 60, 3);                          // after a stall, catch up a little, not all at once
    const ticks = Math.floor(s.clock);
    s.clock -= ticks;
    if (ticks) {
      sim.use().set(shared).set({ uAudio: 0, uHist: 1, uArt: 2, uText: 3, uBackdrop: 4, uState: 5, uRes: [w, h], uStateRes: [w, h] });
      for (let i = 0; i < ticks * scene.sim.steps; i++) {
        this.#bind(s.write);
        this.#texture(5, s.read.tex);
        sim.set({ uSimFrame: s.frame });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        [s.read, s.write] = [s.write, s.read];
        s.frame++;
      }
    }
    this.#texture(5, s.read.tex);
  }

  #dropSim() {
    if (!this.simState) return;
    this.#freeTarget(this.simState.read);
    this.#freeTarget(this.simState.write);
    this.simState = null;
  }

  render(an, dt) {
    const gl = this.gl;
    if (gl.isContextLost()) return;                                     // until webglcontextrestored
    if (this.needsResize) this.#resize();
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

    // the tools' hits and bends, merged with the music's own beat
    const vis = this.visual;
    vis.age += dt;
    const hitLevel = vis.age < 1.5 ? vis.strength * Math.exp(-vis.age / 0.16) : 0;
    vis.shock *= Math.exp(-dt / 0.28);
    const ease = 1 - Math.exp(-dt / 0.08);
    for (const k in vis.bend) { vis.bend[k] += (vis.want[k] - vis.bend[k]) * ease; vis.want[k] = 0; }
    // a tool can slow the picture's own clock (a freeze holds the motion while the sound stands still)
    this.time += dt * (1 - clamp(vis.bend.slow, 0, 1));
    const beat = Math.max(an.active === false ? 0 : an.beat, hitLevel);

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
        uAudioActive: an.active === false ? 0 : 1,
        uBeat: Math.max(an.beat, hitLevel), uBeatAge: Math.min(an.beatAge, vis.age), uBeatCount: an.beatCount + vis.count, uBalance: an.balance,
        uPunch: punch, uHue: (((this.hue + vis.bend.hue) % 1) + 1) % 1, uHistFrac: an.historyFrac,
        uPalA: pal.a, uPalB: pal.b, uPalC: pal.c, uPalD: pal.d,
        uPalA2: pal2.a, uPalB2: pal2.b, uPalC2: pal2.c, uPalD2: pal2.d, uPalMix: k,
        uHasArt: this.hasArt ? 1 : 0, uArtAspect: this.artAspect, uXYGain: an.xyGain,
        uHasBackdrop: this.hasBackdrop ? 1 : 0, uBackdropAspect: this.backdropAspect,
        ...this.extra,
      };

      // 0. a scene with a memory moves its simulation on first, so the picture shows this frame's state
      if (program.sim) this.#simulate(scene, program.sim, shared, dt);
      else if (this.simState) this.#dropSim();
      const samplers = {
        uAudio: 0, uHist: 1, uArt: 2, uText: 3, uBackdrop: 4, uState: 5,
        uStateRes: this.simState ? [this.simState.w, this.simState.h] : [1, 1],
        uSimFrame: this.simState ? this.simState.frame : 0,
      };

      // 1. scene
      this.#bind(this.sceneRT);
      program.use().set(shared).set(samplers);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 1b. the scene's own points (drones, fireflies…), added on top of its picture
      if (program.points) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, scene.points.blend === 'alpha' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
        program.points.use().set(shared).set(samplers).set({
          uPointCount: scene.points.count, uPointScale: this.sceneRT.h / 1080, uPointMax: this.pointMax,
        });
        gl.drawArrays(gl.POINTS, 0, scene.points.count);
        gl.disable(gl.BLEND);
      }

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
        uSpin: this.trail.spin * frames + vis.bend.spin * dt,
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
    // the clip's name, logo and title card, over the lyrics
    if (this.hasBrand) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.#texture(0, this.brandTex);
      this.blit.use().set({ uTex: 0, uAlpha: 1 });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
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
      uGrain: this.look.grain, uBeat: beat, uPunch: punch, uFade: this.blackout ? 0 : this.fade,
      uWarp: Math.max(0, vis.bend.warp), uTwist: vis.bend.twist, uShock: vis.shock,
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
