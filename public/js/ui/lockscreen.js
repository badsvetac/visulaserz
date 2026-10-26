// What a phone asks of a music page: the screen stays on while the show plays, the song goes on
// when the screen locks or another app comes up, and the lock screen and the notification show
// the track with buttons that work.
import { isIOS, isPhone } from '../util.js';

export function attachLockScreen({ engine, crate, toast }) {
  // ── the screen stays on while music plays (and only then: a paused page may sleep) ──
  // Between two songs (a download) still counts as playing, or the phone locks mid-queue.
  let lock = null;
  let asking = false;
  let warned = false;
  const wanted = () => engine.playing || engine.loading;
  async function wake() {
    if (lock || asking || document.hidden) return;
    if (!('wakeLock' in navigator)) return warn();
    asking = true;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        lock = null;
        if (wanted() && !document.hidden) wake();                  // the system let go while we still play
      });
      if (!wanted() || document.hidden) release();                  // it stopped while we were asking
    } catch { lock = null; warn(); }                               // battery saver, or not allowed here
    asking = false;
  }
  function warn() {
    if (warned || !isPhone || !toast) return;
    warned = true;
    toast('This phone may turn the screen off while you watch; the music keeps playing.', { timeout: 6000 });
  }
  function release() { lock?.release().catch(() => {}); lock = null; }
  const awake = () => (wanted() ? wake() : release());

  // ── lock screen, notification, headphones and car buttons ──
  const session = navigator.mediaSession;
  const picture = (src, sizes, type = 'image/png') => ({ src: new URL(src, location.href).href, sizes, type });
  // a square picture when the track has none (the site's link picture is wide, so it comes last)
  const sitePicture = document.querySelector('meta[property="og:image"]')?.content;
  const fallbackArt = [picture('/icon-512.png', '512x512'), picture('/icon-192.png', '192x192'), ...(sitePicture ? [picture(sitePicture, '1200x630', 'image/jpeg')] : [])];
  function artwork(t) {
    // YouTube: the 16:9 frames, not the 4:3 ones with black bars
    const yt = t.source === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(t.id || '') ? t.id : null;
    if (yt) return [picture(`https://i.ytimg.com/vi/${yt}/hq720.jpg`, '1280x720', 'image/jpeg'), picture(`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`, '320x180', 'image/jpeg')];
    const own = t.thumb || t.cover;
    return own ? [{ src: own }, ...fallbackArt] : fallbackArt;
  }
  function describe() {
    if (!session || !window.MediaMetadata) return;
    const t = engine.track;
    if (!t) { session.metadata = null; return; }
    session.metadata = new MediaMetadata({ title: t.title || 'Untitled', artist: t.artist || '', album: 'Visulaserz', artwork: artwork(t) });
  }
  function where() {
    if (!session) return;
    session.playbackState = engine.playing ? 'playing' : engine.track ? 'paused' : 'none';
    if (!session.setPositionState) return;
    const d = engine.duration;
    try {
      if (!d || engine.live || engine.decks) session.setPositionState();   // nothing honest to show
      else session.setPositionState({ duration: d, position: Math.min(engine.currentTime, d), playbackRate: engine.effectiveRate || engine.fx.speed || 1 });
    } catch { /* a rate the platform does not take */ }
  }
  // In DJ mode the buttons drive the deck on air, not the single player hidden under the console.
  const actions = {
    play: () => (engine.decks ? (engine.decks.playing || engine.decks.toggleOnAir()) : engine.play()),
    pause: () => (engine.decks ? engine.decks.pauseAll() : engine.pause()),
    stop: () => (engine.decks ? engine.decks.pauseAll() : engine.pause()),
    previoustrack: () => (engine.decks ? null : engine.currentTime > 4 || crate.tracks.length < 2 ? engine.seek(0) : crate.prev()),
    nexttrack: () => (engine.decks ? null : crate.next()),
    seekto: (d) => engine.seek(d.seekTime),
    // iOS shows these instead of the previous/next buttons once they exist, so only elsewhere
    ...(isIOS ? {} : {
      seekbackward: (d) => engine.seek(engine.currentTime - (d.seekOffset || 10)),
      seekforward: (d) => engine.seek(engine.currentTime + (d.seekOffset || 10)),
    }),
  };
  function register() {
    if (!session) return;
    for (const [name, fn] of Object.entries(actions)) {
      try { session.setActionHandler(name, fn); } catch { /* an action this browser does not know */ }
    }
    if (isIOS) for (const name of ['seekbackward', 'seekforward']) { try { session.setActionHandler(name, null); } catch { /* fine */ } }
  }
  register();

  // WebKit can drop the handlers when its now-playing listener is recreated: registering again is cheap
  engine.addEventListener('trackchange', () => { describe(); where(); register(); });
  for (const type of ['play', 'pause', 'ended', 'loadedmetadata', 'seeked', 'decks', 'live', 'loading']) {
    engine.addEventListener(type, () => { where(); awake(); if (type === 'play') register(); });
  }
  engine.addEventListener('fxchange', (e) => { if (['speed', 'pitchLock', '*'].includes(e.detail?.id)) where(); });
  let lastWhere = 0;
  engine.addEventListener('timeupdate', () => {                    // every 5 s is plenty
    const now = performance.now();
    if (now - lastWhere > 5000) { lastWhere = now; where(); }
  });
  engine.addEventListener('handoffrefused', () => toast?.('Press play once more: the music needs one more tap to keep going with the screen locked.', { timeout: 8000 }));

  // ── out of sight ──
  // iOS stops Web Audio there, so the song moves to the engine's stand-in element (engine.handOff)
  // and comes back once Web Audio runs again (engine.takeBack). Android keeps Web Audio playing.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (isIOS) engine.handOff();
    } else {
      if (engine.standIn) engine.takeBack();
      else if (engine.ctx && engine.ctx.state !== 'running' && engine.ctx.state !== 'closed') engine.ctx.resume().catch(() => {});
      awake();
      where();
    }
  });
  // A call or Siri interrupts Web Audio with the page in sight: pause the song rather than let it
  // run on unheard, and pick it up again when the call is over.
  let interrupted = false;
  engine.addEventListener('context', () => {
    const ctx = engine.ctx;
    ctx.addEventListener('statechange', () => {
      if (!isIOS) return;
      if (ctx.state === 'running') {
        if (engine.standIn && !document.hidden) engine.takeBack();     // WebKit woke it by itself
        else if (interrupted && !document.hidden) { interrupted = false; engine.play(); }
      } else if (!document.hidden) {
        // a lock also suspends the context; wait a moment so the hand-off gets there first
        setTimeout(() => {
          if (ctx.state === 'running' || document.hidden || engine.standIn || engine.el.paused || engine.live || engine.decks) return;
          interrupted = true;
          engine.pause();
        }, 400);
      }
    });
  });
  // a context iOS left suspended runs again on a tap; the song then goes back to the effects
  addEventListener('pointerdown', () => {
    const ctx = engine.ctx;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().then(() => { if (engine.standIn) engine.takeBack(); }, () => {});
    if (wanted() && !lock) wake();                                     // a refused wake lock gets another go with a tap
  }, true);

  return { awake, where };
}
