// ─────────────────────────────────────────────────────────────────────────────
// TODO(you): decide when the show should cut to a different scene.
//
// This runs every frame while AUTO is switched on in the VISION rack. Return true to
// cut to the next scene. The placeholder below is a plain timer; a musical version
// could cut on a beat once enough bars have passed, or when the energy jumps (a drop)
// or falls away (a breakdown). Everything you need is in `state`:
//
//   secondsInScene  seconds since the current scene started
//   beatsInScene    beats detected since the current scene started
//   isBeat          true on the exact frame a beat lands (cut here for a musical feel)
//   energy          loudness right now, 0..1, smoothed over ~2 s
//   energyAvg       loudness averaged over the last ~20 s (compare with energy to spot drops)
//   bpm             estimated tempo, or 0 if unknown
//
// Trade-offs: cutting on every 16th beat feels tight but can be relentless; cutting only on
// energy changes feels dramatic but may leave a calm track on one scene for minutes.
// ─────────────────────────────────────────────────────────────────────────────
export function shouldSwitchScene(state) {
  return state.secondsInScene > 45;
}

export class Director {
  constructor(renderer, registry) {
    this.renderer = renderer;
    this.registry = registry;
    this.enabled = false;
    this.secondsInScene = 0;
    this.beatsInScene = 0;
    this.energyAvg = 0;
    this.lastScene = renderer.sceneId;
    this.anchor = renderer.sceneId;                                    // the last scene shown that is on the strip
  }

  update(dt, an) {
    if (this.registry.isInstalled(this.renderer.sceneId)) this.anchor = this.renderer.sceneId;
    if (this.renderer.sceneId !== this.lastScene) {
      this.lastScene = this.renderer.sceneId;
      this.secondsInScene = 0;
      this.beatsInScene = 0;
    }
    this.secondsInScene += dt;
    if (an.isBeat) this.beatsInScene++;
    this.energyAvg += (an.energy - this.energyAvg) * (1 - Math.exp(-dt / 20));
    if (!this.enabled) return;
    const state = {
      secondsInScene: this.secondsInScene,
      beatsInScene: this.beatsInScene,
      isBeat: an.isBeat,
      energy: an.energy,
      energyAvg: this.energyAvg,
      bpm: an.bpm,
    };
    if (shouldSwitchScene(state)) this.step(1);
  }

  // Walks the strip: only scenes that were added from the market take part in the show.
  step(direction = 1) {
    // A scene on trial from the market is not on the strip: carry on from the one it interrupted.
    const strip = this.registry.scenes;
    const from = this.registry.isInstalled(this.renderer.sceneId) ? this.renderer.sceneId : this.anchor;
    const i = strip.findIndex((s) => s.id === from);
    const next = strip[i < 0 ? 0 : (i + direction + strip.length) % strip.length];
    this.renderer.setScene(next.id);
    return next;
  }
}
