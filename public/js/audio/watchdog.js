// The sound watchdog: an ear on what actually leaves the page. When the sound stops while
// something is playing, it works out why (the browser stopped the audio clock, the device dropped
// buffers, the track stalled, a gain on the way out is closed) and says so once, with what was done
// just before it. A cut that only happens on one machine can then be read off the screen instead
// of guessed at. It only listens: nothing here changes the sound.

const EVERY = 250;          // ms between looks
const QUIET = 15000;        // the same kind of trouble is reported at most this often

export function watchSound(engine, { toast, lastAction = () => null }) {
  const incidents = [];
  const said = new Map();
  let out = null, buf = null, srcBuf = null;
  let lastUnder = null, lastTime = -1, frozenFor = 0, silentFor = 0, clockFor = 0;
  // a pad, a knob or a key held down (an isolator kill, the scratch hand) may silence it on purpose
  let held = 0;
  const keys = new Set();
  addEventListener('pointerdown', () => { held++; }, true);
  const up = () => { held = 0; };
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
  addEventListener('keydown', (e) => keys.add(e.code), true);
  addEventListener('keyup', (e) => keys.delete(e.code), true);
  addEventListener('blur', () => { keys.clear(); held = 0; });

  const level = (analyser, data) => {
    analyser.getFloatTimeDomainData(data);
    let s = 0;
    for (let i = 0; i < data.length; i++) s += data[i] * data[i];
    return 10 * Math.log10(s / data.length + 1e-12);
  };

  function report(kind, why) {
    const now = performance.now();
    if (now - (said.get(kind) || -1e9) < QUIET) return;
    said.set(kind, now);
    const act = lastAction();
    const after = act && now - act.at < 8000 ? ` ${((now - act.at) / 1000).toFixed(1)} s after ${act.what}` : '';
    const entry = { at: new Date().toISOString(), kind, why, after: act && after ? act : null, rate: engine.ctx?.sampleRate, state: engine.ctx?.state };
    incidents.push(entry);
    if (incidents.length > 40) incidents.shift();
    console.warn('[sound]', entry);
    toast(`The sound dropped out${after}: ${why}`, { kind: 'error', timeout: 9000 });
  }

  function look() {
    const ctx = engine.ctx;
    if (!ctx || !engine.chain) return;
    if (!out) {
      out = ctx.createAnalyser();
      out.fftSize = 2048;
      engine.master.connect(out);
      buf = new Float32Array(out.fftSize);
      srcBuf = new Float32Array(engine.beatAnalyser.fftSize);
    }
    const el = engine.el;
    const track = !el.paused && !el.ended && !!el.src && !engine.decks && !engine.live;
    const sounding = track || !!engine.decks?.playing || !!engine.live;
    if (!sounding) { frozenFor = silentFor = clockFor = 0; lastTime = -1; return; }
    // Out of sight nobody hears a toast, and a lock or an unlock pauses Web Audio for a moment on
    // purpose (the stand-in has the song, engine.js): only what lasts in plain sight is news.
    if (document.hidden || engine.standIn || engine.takingBack) { frozenFor = silentFor = clockFor = 0; lastTime = -1; return; }

    // the browser's audio clock: suspended or interrupted, nothing plays at all (a resume that
    // comes within two seconds, as after unlocking a phone, is not worth a word)
    if (ctx.state !== 'running') {
      clockFor += EVERY;
      if (clockFor >= 2000) report('clock', `the browser has the page's audio ${ctx.state}. A click on the page usually wakes it.`);
      return;
    }
    clockFor = 0;

    // the device asked for sound faster than the page made it: buffers dropped, the sound breaks up
    const ps = ctx.playbackStats;
    if (ps && typeof ps.underrunEvents === 'number') {
      if (lastUnder !== null) {
        const n = ps.underrunEvents - lastUnder;
        if (n >= 3) report('glitch', `the browser dropped ${n} audio buffers in a quarter of a second, so the computer or the audio device fell behind. Closing heavy tabs or apps, or another output device, helps.`);
      }
      lastUnder = ps.underrunEvents;
    }

    // the track itself stopped moving while it should be playing (loading, the server, the file)
    if (track && el.currentTime > 0.5) {                    // a track still starting is only loading
      if (el.currentTime === lastTime && el.playbackRate > 0) frozenFor += EVERY; else frozenFor = 0;
      lastTime = el.currentTime;
      if (frozenFor >= (el.seeking ? 4000 : 750)) report('stall', `the track stopped moving at ${el.currentTime.toFixed(1)} s (${el.readyState < 3 ? 'it is waiting for data from the server' : 'the browser stopped decoding it'}).`);
    }

    // the music is there, but nothing leaves the page: some gain on the way out is closed
    const src = level(engine.beatAnalyser, srcBuf), fin = level(out, buf);
    const perf = engine.chain.performance;
    const meant = engine.volume <= 0.001 || engine.tape || held > 0 || keys.size > 0
      || engine.chain.musicLevel.value < 0.05 || perf.main < 0.5 || perf.kill.every((k) => k < 0.5)
      || (engine.live && !engine.liveMonitor);
    if (src > -50 && fin < -80 && !meant) silentFor += EVERY; else silentFor = 0;
    if (silentFor >= 1250) {
      const chainOut = level(engine.analyser, buf);
      const where = chainOut < -80 ? 'inside the effects (an effect or a tool slot passes nothing)'
        : engine.monitor.gain.value < 0.05 ? 'at the live-input safety valve'
        : engine.master.gain.value < 0.05 ? 'at the master volume' : 'after the effects';
      report('silent', `the music is playing but the sound stops ${where}.`);
      silentFor = 0;
    }
  }

  // a watchdog that breaks must not be one more thing going wrong: it says so once and stops
  const timer = setInterval(() => { try { look(); } catch (e) { clearInterval(timer); console.warn('[sound] the watchdog stopped:', e); } }, EVERY);
  return { incidents, stop: () => clearInterval(timer) };
}
