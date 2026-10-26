import { clamp, isPhone, store } from '../util.js';

// How often the show is drawn, and how sharp. A desktop draws every frame the display offers at the
// quality chosen in Look, as it always has. A phone drawing a ray-marched scene 60 or 120 times a
// second at full size runs its GPU flat out and is hot within minutes, so with the Auto settings
// a phone draws 30 frames a second (15 while nothing plays), and the resolution follows how long
// the frames really take: down a step when the GPU is busy for most of its slot, back up when it
// has had room for a while.
//
// The GPU's own time comes from a timer query where the browser has one (Chrome on Android, mostly).
// Elsewhere (Safari) lateness is the only signal: frames that arrive well after their slot mean the
// GPU is behind. (A fence per frame would measure the browser's own pipeline delay as well, and
// could keep lowering a picture that was fine.) Each scene remembers the step it settled on, and
// one that bounces back down soon after a step up has to wait longer before the next try.
const STEPS = [0.45, 0.55, 0.65, 0.78, 0.9, 1];
const BUSY = 0.62;           // timer: share of the frame slot the GPU may spend before we step down
const ROOM = 0.32;           // …and below which we step back up
const LATE = 1.22;           // neither: frames this much slower than the cap mean it is behind

export class Pacer {
  constructor(renderer, engine) {
    this.renderer = renderer;
    this.engine = engine;
    this.lastDraw = -1e9;
    this.step = STEPS.length - 1;
    this.since = 0;           // ms since the resolution last changed
    this.slow = 0;            // ms the frames have been over budget
    this.fast = 0;            // ms they have been comfortably under it
    this.interval = 1000 / 30;
    this.gpu = 0;             // smoothed GPU ms per frame, when measured
    const gl = renderer.gl;
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = [];
    this.query = null;
    this.sceneId = null;
    this.steps = new Map(Object.entries(store.get('pacerSteps', {})));   // scene id → the step it settled on
    this.patience = new Map();                                            // scene id → ms of room needed before a step up
    this.upAt = -1e9;                                                     // when the last step up happened
    renderer.dynamicScale = 1;
  }

  // frames per second to aim for, or 0 for every frame the display offers
  get cap() {
    const want = this.renderer.look.fps ?? 'auto';
    if (want !== 'auto') return Number(want) || 0;
    if (!isPhone) return 0;
    return this.engine.playing ? 30 : 15;
  }

  get adaptive() { return (this.renderer.look.quality ?? 'auto') === 'auto' && isPhone; }

  // true when this animation frame should draw
  due(now) {
    if (!this.adaptive) {
      if (this.renderer.dynamicScale !== 1) this.#set(STEPS.length - 1, false);   // a quality was picked by hand
    } else {
      const id = this.renderer.sceneId;
      if (id !== this.sceneId) {                                     // a new scene starts where it settled last time
        this.sceneId = id;
        if (this.steps.has(id)) this.#set(clamp(Number(this.steps.get(id)) || 0, 0, STEPS.length - 1), false);
        else { this.since = this.slow = this.fast = 0; this.gpu = 0; }
      }
    }
    const cap = this.cap;
    if (!cap) { this.lastDraw = now; return true; }
    this.interval = 1000 / cap;
    if (now - this.lastDraw < this.interval * 0.92) return false;   // a little slack for vsync jitter
    const late = now - this.lastDraw;
    this.lastDraw = now;
    if (this.adaptive && late < 1000 && !(this.timer && this.gpu)) this.#judge(late > this.interval * LATE, late < this.interval * 1.04, late);
    return true;
  }

  // around renderer.render(): the GPU's own time, where the browser can tell us
  begin() {
    const gl = this.renderer.gl;
    if (this.refetch && !gl.isContextLost()) { this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2'); this.refetch = false; }
    if (!this.timer || !this.adaptive || this.query || gl.isContextLost()) return;
    this.query = gl.createQuery();
    gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.query);
  }

  end() {
    const gl = this.renderer.gl;
    if (gl.isContextLost()) {                                        // extensions die with the context
      this.query = null; this.queries = []; this.refetch = !!this.timer;
      return;
    }
    if (!this.adaptive || !this.timer) return;
    if (this.query) {
      gl.endQuery(this.timer.TIME_ELAPSED_EXT);
      this.queries.push(this.query);
      this.query = null;
    }
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.isQuery(q)) { this.queries.shift(); continue; }        // made before a lost context
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.timer.GPU_DISJOINT_EXT);
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
      this.queries.shift();
      if (!disjoint && ms > 0) {
        this.gpu = this.gpu ? this.gpu + (ms - this.gpu) * 0.15 : ms;
        const share = this.gpu / this.interval;
        this.#judge(share > BUSY, share < ROOM, this.interval);
      }
    }
  }

  #judge(over, under, ms) {
    this.since += ms;
    this.slow = over ? this.slow + ms : Math.max(0, this.slow - ms * 0.5);
    this.fast = under ? this.fast + ms : 0;
    const id = this.sceneId;
    if (this.slow > 1500 && this.since > 2000 && this.step > 0) {
      // came straight back down after a step up: wait twice as long before trying again
      if (performance.now() - this.upAt < 10000) this.patience.set(id, Math.min(120000, (this.patience.get(id) || 8000) * 2));
      this.#set(this.step - 1);
    } else if (this.fast > (this.patience.get(id) || 8000) && this.since > 8000 && this.step < STEPS.length - 1) {
      this.upAt = performance.now();
      this.#set(this.step + 1);
    }
  }

  #set(step, remember = true) {
    this.step = clamp(step, 0, STEPS.length - 1);
    this.since = this.slow = this.fast = 0;
    this.gpu = 0;
    if (this.renderer.dynamicScale !== STEPS[this.step]) {
      this.renderer.dynamicScale = STEPS[this.step];
      this.renderer.needsResize = true;
    }
    if (remember && this.sceneId) {
      this.steps.set(this.sceneId, this.step);
      store.set('pacerSteps', Object.fromEntries(this.steps));
    }
  }
}
