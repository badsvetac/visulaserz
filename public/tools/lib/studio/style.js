// The Studio's own look, carried by the plugin itself: a dark slate workstation with orange and
// green lights, LCD readouts and floating windows, after the way FL Studio looks. Everything is
// scoped under .vz-studio, so none of it reaches the rest of the page.

export const STUDIO_CSS = `
.vz-studio {
  --s-bg: #283035; --s-panel: #343c42; --s-panel2: #3d464c; --s-inset: #1c2124; --s-line: #14181a; --s-hi: #56616a;
  --s-text: #dce2e5; --s-dim: #8d99a0; --s-orange: #f39b3f; --s-green: #8edc5b; --s-red: #e35a50; --s-blue: #61b3ea;
  --s-step: #444c52; --s-step2: #5a4545; --s-on: #e9eff1;
  position: relative; display: flex; flex-direction: column; gap: 0; padding: 0 !important; min-height: 0; overflow: hidden;
  background: var(--s-bg); color: var(--s-text); font: 500 11px/1.2 var(--font-body); user-select: none;
}
.vz-studio button { font: inherit; color: inherit; }
.vz-studio .knob { width: auto; padding: 0; gap: 0; }
.vz-studio .knob svg { width: 22px; height: 22px; }
.vz-studio .knob .knob-label, .vz-studio .knob .knob-value { display: none; }
.vz-studio .knob.has-label .knob-label { display: block; font: 600 8.5px/1 var(--font-body); letter-spacing: 0.04em; text-transform: none; color: var(--s-dim); margin-top: 2px; }
.vz-studio .knob.big svg { width: 34px; height: 34px; }
.vz-studio .knob-track { stroke: #15191b; stroke-width: 5; }
.vz-studio .knob-arc { stroke: var(--s-orange); stroke-width: 4; filter: none; }
.vz-studio .knob-cap line { stroke: #f2f5f6; stroke-width: 4; }

/* the toolbar */
.st2-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 5px 8px; min-height: 46px; flex-wrap: wrap;
  background: linear-gradient(180deg, #424b51, #31393e); border-bottom: 1px solid var(--s-line); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); }
.st2-group { display: flex; align-items: center; gap: 3px; }
.st2-sep { width: 1px; align-self: stretch; margin: 2px 2px; background: var(--s-line); box-shadow: 1px 0 0 rgba(255,255,255,0.05); }
.st2-btn { min-width: 28px; height: 28px; padding: 0 7px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  background: linear-gradient(180deg, #4d575d, #3a4247); border: 1px solid #1a1e21; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); color: var(--s-text); font-weight: 600; }
.st2-btn:hover { background: linear-gradient(180deg, #57626a, #424b51); }
.st2-btn.is-on { background: linear-gradient(180deg, #5c4a36, #3f3326); border-color: #1a1e21; color: #fff; box-shadow: inset 0 0 0 1px rgba(243,155,63,0.65); }
.st2-btn svg { width: 15px; height: 15px; }
.st2-btn .led { width: 6px; height: 6px; border-radius: 50%; background: #262b2e; box-shadow: inset 0 0 1px #000; }
.st2-btn.is-on .led { background: var(--s-orange); box-shadow: 0 0 5px var(--s-orange); }
.st2-mode .st2-btn { min-width: 44px; font-size: 10px; letter-spacing: 0.06em; }
.st2-play svg { color: var(--s-green); }
.st2-play.is-on { box-shadow: inset 0 0 0 1px rgba(142,220,91,0.7); background: linear-gradient(180deg, #3f5a36, #2d3f27); }
.st2-rec svg { color: var(--s-red); }
.st2-rec.is-on { box-shadow: inset 0 0 0 1px rgba(227,90,80,0.8); background: linear-gradient(180deg, #5e3632, #3f2522); animation: blink 1s infinite; }
.st2-lcd { height: 30px; padding: 0 8px; display: inline-flex; align-items: center; gap: 6px; border-radius: 3px; background: #0f1213; border: 1px solid #070809;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.06); font: 400 15px/1 var(--font-mono); color: #ffb35a; letter-spacing: 0.02em; }
.st2-lcd small { font: 600 8px/1 var(--font-body); letter-spacing: 0.1em; color: #7d6a55; text-transform: uppercase; }
.st2-lcd.is-green { color: #9be86a; }
.st2-lcd.is-drag { cursor: ns-resize; touch-action: none; }
.st2-pattern { height: 30px; min-width: 150px; max-width: 220px; padding: 0 6px; display: inline-flex; align-items: center; gap: 6px; border-radius: 3px; cursor: pointer;
  background: #1a1e20; border: 1px solid #0b0d0e; box-shadow: inset 0 1px 2px rgba(0,0,0,0.7); }
.st2-pattern .sw { width: 10px; height: 18px; border-radius: 2px; flex: none; }
.st2-pattern .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: #fff; }
.st2-hint { flex: 1; min-width: 120px; max-width: 360px; height: 30px; padding: 0 8px; display: flex; align-items: center; border-radius: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  background: #1f2427; border: 1px solid #0f1213; color: var(--s-dim); font-size: 11px; }
.st2-hint b { color: var(--s-text); font-weight: 600; margin-right: 6px; }
.st2-meter { width: 46px; height: 8px; border-radius: 2px; background: #121517; overflow: hidden; border: 1px solid #090a0b; }
.st2-meter i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #6ad04b, #e8d34a 75%, #e35a50); }

/* the main area: browser at the left, the playlist behind the floating windows */
.st2-main { position: relative; flex: 1; min-height: 0; display: flex; }
.st2-browser { flex: none; width: 188px; display: flex; flex-direction: column; background: #22282b; border-right: 1px solid var(--s-line); overflow: hidden; }
.st2-browser[hidden] { display: none; }
.st2-browser-head { padding: 6px 8px; font: 700 10px/1 var(--font-body); letter-spacing: 0.12em; text-transform: uppercase; color: var(--s-dim); border-bottom: 1px solid var(--s-line); background: #2a3034; }
.st2-tree { flex: 1; overflow-y: auto; padding: 4px 0 10px; }
.st2-node { display: flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--s-text); }
.st2-node:hover { background: rgba(255,255,255,0.05); }
.st2-node.is-folder { font-weight: 700; color: #e8ecee; }
.st2-node.is-folder::before { content: "▸"; color: var(--s-dim); width: 8px; }
.st2-node.is-folder.is-open::before { content: "▾"; }
.st2-node.is-item { padding-left: 22px; color: #c9d1d5; }
.st2-node .dot { width: 7px; height: 7px; border-radius: 2px; flex: none; }
.st2-work { position: relative; flex: 1; min-width: 0; overflow: hidden; }

/* a floating window */
.st2-win { position: absolute; display: flex; flex-direction: column; min-width: 240px; min-height: 120px; background: var(--s-panel);
  border: 1px solid #101315; border-radius: 4px; box-shadow: 0 12px 34px rgba(0,0,0,0.55); overflow: hidden; }
.st2-win[hidden] { display: none; }
/* every surface a drag starts on says so to a touch screen, or the browser takes the finger for a scroll */
.st2-win-head { flex: none; height: 24px; display: flex; align-items: center; gap: 6px; padding: 0 4px 0 8px; cursor: move; touch-action: none;
  background: linear-gradient(180deg, #4e585f, #3c444a); border-bottom: 1px solid #15181a; font: 700 11px/1 var(--font-body); color: #eef2f3; }
.st2-win.is-front .st2-win-head { background: linear-gradient(180deg, #5a656d, #444d53); }
.st2-win-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st2-win-x { width: 18px; height: 18px; border-radius: 3px; display: grid; place-items: center; color: var(--s-dim); }
.st2-win-x:hover { color: #fff; background: rgba(227,90,80,0.6); }
.st2-win-body { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.st2-win-grip { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; touch-action: none;
  background: linear-gradient(135deg, transparent 55%, rgba(255,255,255,0.25) 55% 62%, transparent 62% 72%, rgba(255,255,255,0.25) 72% 79%, transparent 79%); }
.st2-tools { flex: none; display: flex; align-items: center; gap: 4px; padding: 4px 6px; background: #2f363b; border-bottom: 1px solid var(--s-line); flex-wrap: wrap; }
.st2-tools .st2-btn { height: 22px; min-width: 22px; padding: 0 6px; font-size: 10px; }
.st2-select { height: 22px; padding: 0 6px; border-radius: 3px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; background: #1c2023; border: 1px solid #0d0f10; color: var(--s-text); font-size: 10.5px; }
.st2-select::after { content: "▾"; color: var(--s-dim); font-size: 9px; }
.st2-label { color: var(--s-dim); font-size: 10px; font-weight: 600; }
.st2-grow { flex: 1; }

/* the playlist */
.st2-playlist { position: absolute; inset: 0; display: flex; flex-direction: column; }
.st2-pl-body { position: relative; flex: 1; min-height: 0; display: flex; }
.st2-picker { flex: none; width: 112px; overflow-y: auto; background: #252b2f; border-right: 1px solid var(--s-line); padding: 4px; display: flex; flex-direction: column; gap: 2px; }
.st2-pick { height: 22px; padding: 0 6px; border-radius: 2px; display: flex; align-items: center; gap: 5px; cursor: pointer; background: #2f363b; color: #dfe5e8; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.st2-pick .sw { width: 6px; align-self: stretch; margin: 3px 0; border-radius: 1px; flex: none; }
.st2-pick.is-on { background: #46392b; box-shadow: inset 0 0 0 1px rgba(243,155,63,0.6); color: #fff; }
.st2-pick-add { height: 22px; border-radius: 2px; border: 1px dashed #4b555c; color: var(--s-dim); }
.st2-tracks { flex: none; width: 96px; background: #2b3236; border-right: 1px solid var(--s-line); overflow: hidden; position: relative; }
.st2-track { position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 5px; padding: 0 6px; border-bottom: 1px solid #1d2225; cursor: pointer; }
.st2-track .led { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--s-green); box-shadow: 0 0 4px rgba(142,220,91,0.7); }
.st2-track.is-mute .led { background: #2b3033; box-shadow: none; }
.st2-track .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cfd6da; font-weight: 600; }
.st2-grid { position: relative; flex: 1; min-width: 0; }
.st2-grid canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }

/* the channel rack */
.st2-rack { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.st2-rack-scroll { flex: 1; min-height: 0; overflow: auto; padding: 4px 0 6px; }
.st2-row { display: flex; align-items: center; height: 26px; gap: 4px; padding: 0 6px; }
.st2-row.is-selected .st2-name { box-shadow: inset 0 0 0 1px rgba(142,220,91,0.7); }
.st2-led { width: 10px; height: 14px; border-radius: 2px; flex: none; background: #2a3033; border: 1px solid #111416; }
.st2-led.is-on { background: var(--s-green); box-shadow: 0 0 5px rgba(142,220,91,0.7); }
.st2-led.is-solo { background: var(--s-orange); box-shadow: 0 0 5px var(--s-orange); }
.st2-ins { width: 22px; height: 18px; flex: none; border-radius: 2px; display: grid; place-items: center; background: #1a1e20; border: 1px solid #0b0d0e; color: #9be86a; font: 400 10px/1 var(--font-mono); cursor: ns-resize; touch-action: none; }
.st2-name { width: 118px; height: 20px; flex: none; padding: 0 8px; border-radius: 2px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  background: linear-gradient(180deg, #67727a, #4f595f); border: 1px solid #1a1e20; color: #fff; font-weight: 700; font-size: 11px; box-shadow: inset 3px 0 0 var(--c, #8a959b); }
.st2-name:hover { background: linear-gradient(180deg, #737f87, #59646b); }
/* a sideways finger paints steps; an up-and-down one still scrolls the channel list */
.st2-steps { display: flex; gap: 2px; padding-left: 4px; touch-action: pan-y; }
.st2-step { width: 17px; height: 20px; flex: none; border-radius: 2px; background: var(--s-step); border: 1px solid #1d2225; box-shadow: inset 0 1px 0 rgba(255,255,255,0.07); }
.st2-step.alt { background: var(--s-step2); }
.st2-step:hover { filter: brightness(1.25); }
.st2-step.on { background: linear-gradient(180deg, #ffffff, #c9d3d7); border-color: #6b767c; box-shadow: inset 0 -3px 0 var(--c, #9aa6ac); }
.st2-step.now { outline: 1px solid var(--s-orange); outline-offset: -1px; }
.st2-mini { height: 20px; margin-left: 4px; border-radius: 2px; background: #1d2225; border: 1px solid #111416; cursor: pointer; display: block; }
.st2-graph { display: flex; align-items: flex-end; gap: 2px; height: 44px; padding: 0 6px 4px 196px; touch-action: none; }
.st2-bar-v { width: 17px; flex: none; height: 100%; position: relative; background: #1d2225; border-radius: 2px; cursor: ns-resize; }
.st2-bar-v i { position: absolute; left: 2px; right: 2px; bottom: 0; background: var(--s-orange); border-radius: 1px; }
.st2-add { margin: 4px 0 0 30px; height: 22px; padding: 0 12px; border-radius: 3px; border: 1px dashed #56616a; color: var(--s-dim); font-weight: 600; }
.st2-add:hover { color: #fff; border-color: var(--s-orange); }

/* the piano roll */
.st2-roll { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.st2-roll-canvas { position: relative; flex: 1; min-height: 0; background: #22282b; }
.st2-roll-canvas canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }

/* the mixer */
.st2-mixer { flex: 1; min-height: 0; display: flex; }
.st2-strips { flex: 1; min-width: 0; overflow-x: auto; overflow-y: hidden; display: flex; gap: 1px; padding: 4px; background: #23292c; }
.st2-strip { width: 64px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 5px 3px; background: #343c42; border-radius: 2px; cursor: pointer; border: 1px solid transparent; }
.st2-strip.is-on { border-color: rgba(243,155,63,0.7); background: #3b4349; }
.st2-strip.is-master { width: 74px; background: #3a3530; }
.st2-strip-name { width: 100%; height: 18px; padding: 0 3px; border-radius: 2px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #1c2023; color: #e9eef0; font-size: 10px; font-weight: 700; line-height: 18px; }
.st2-strip-num { font: 400 9px/1 var(--font-mono); color: var(--s-dim); }
.st2-level { flex: 1; min-height: 70px; display: flex; gap: 4px; align-items: stretch; padding: 2px 0; }
.st2-vu { width: 5px; border-radius: 2px; background: #101315; position: relative; overflow: hidden; }
.st2-vu i { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: linear-gradient(0deg, #5fca44, #e8d34a 78%, #e35a50); }
.st2-fader { position: relative; width: 16px; border-radius: 2px; background: #121517; border: 1px solid #08090a; cursor: ns-resize; touch-action: none; }
.st2-fader b { position: absolute; left: -5px; right: -5px; height: 14px; border-radius: 2px; background: linear-gradient(180deg, #c9d1d5, #8a959b); border: 1px solid #1a1e20; box-shadow: 0 2px 3px rgba(0,0,0,0.6); }
.st2-fader b::after { content: ""; position: absolute; left: 2px; right: 2px; top: 6px; height: 1px; background: #1b1f22; }
.st2-mute { width: 12px; height: 12px; border-radius: 50%; background: var(--s-green); box-shadow: 0 0 5px rgba(142,220,91,0.7); border: 1px solid #111; }
.st2-mute.is-off { background: #2a2f32; box-shadow: none; }
.st2-fxpanel { flex: none; width: 214px; display: flex; flex-direction: column; gap: 3px; padding: 6px; background: #2c3337; border-left: 1px solid var(--s-line); overflow-y: auto; }
.st2-fxtitle { font-weight: 700; color: #fff; padding: 2px 2px 4px; }
.st2-slot { height: 24px; display: flex; align-items: center; gap: 5px; padding: 0 5px; border-radius: 2px; background: #1d2225; border: 1px solid #111416; cursor: pointer; }
.st2-slot:hover { border-color: #56616a; }
.st2-slot .led { width: 8px; height: 8px; border-radius: 50%; flex: none; background: #2a2f32; }
.st2-slot .led.is-on { background: var(--s-green); box-shadow: 0 0 4px rgba(142,220,91,0.7); }
.st2-slot .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e3e9ec; font-weight: 600; }
.st2-slot.is-empty .nm { color: #6c777e; font-weight: 500; }
.st2-songduck { margin-top: 6px; padding: 6px; border-radius: 3px; background: #3a3530; display: flex; align-items: center; gap: 8px; }

/* plugin and effect windows */
.st2-plugin { flex: 1; min-height: 0; overflow: auto; padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 8px; }
.st2-section { padding: 6px 8px 8px; border-radius: 3px; background: #2c3338; border: 1px solid #1d2225; display: flex; flex-direction: column; gap: 6px; }
.st2-section-title { font: 700 9px/1 var(--font-body); letter-spacing: 0.14em; text-transform: uppercase; color: var(--s-orange); }
.st2-knobs { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px 12px; }
.st2-osc { display: flex; align-items: center; gap: 10px; }
.st2-osc-n { width: 16px; font: 700 11px/1 var(--font-mono); color: var(--s-dim); }
.st2-waves { display: flex; gap: 2px; }
.st2-wave { width: 26px; height: 20px; border-radius: 2px; display: grid; place-items: center; background: #1c2023; border: 1px solid #0d0f10; color: var(--s-dim); }
.st2-wave svg { width: 18px; height: 12px; }
.st2-wave.is-on { color: #1c2023; background: var(--s-orange); border-color: #9c5f22; }
.st2-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.st2-chip { height: 22px; padding: 0 8px; border-radius: 2px; background: #1c2023; border: 1px solid #0d0f10; color: #cfd6da; font-weight: 600; }
.st2-chip.is-on { color: #1c2023; background: var(--s-orange); border-color: #9c5f22; }
.st2-wavebox { height: 64px; border-radius: 3px; background: #15191b; border: 1px solid #0b0d0e; position: relative; }
.st2-wavebox canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.st2-wavebox.is-drop { outline: 2px dashed var(--s-orange); }
.st2-keys { height: 46px; position: relative; border-radius: 2px; overflow: hidden; background: #0f1213; cursor: pointer; touch-action: none; }
.st2-keys canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.st2-note { margin: 0; color: var(--s-dim); font-size: 10.5px; line-height: 1.4; }
.st2-pads { flex: 1; min-height: 0; padding: 8px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: repeat(4, minmax(0, 1fr)); gap: 6px; }
.st2-pad { position: relative; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between; padding: 6px 7px; text-align: left;
  background: linear-gradient(180deg, #4a545a, #353d42); border: 1px solid #14181a; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -3px 0 var(--c, #5e6a71); }
.st2-pad span:first-child { font-weight: 700; color: #fff; font-size: 11.5px; }
.st2-pad span:last-child { align-self: flex-end; font: 400 10px/1 var(--font-mono); color: var(--s-dim); }
.st2-pad:disabled { opacity: 0.3; }
.st2-pad.is-hit { animation: st2-hit 0.22s ease-out; }
@keyframes st2-hit { from { background: var(--c, #8a959b); } }

/* menus */
.st2-menu { position: absolute; z-index: 9999; min-width: 160px; max-height: 340px; overflow-y: auto; padding: 4px 0; background: #2b3236; border: 1px solid #0f1213; border-radius: 3px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); }
.st2-mi { display: flex; align-items: center; gap: 6px; width: 100%; height: 22px; padding: 0 12px; text-align: left; color: var(--s-text); white-space: nowrap; }
.st2-mi:hover { background: #4a3a28; color: #fff; }
.st2-mi.is-head { height: 20px; color: var(--s-orange); font: 700 9px/1 var(--font-body); letter-spacing: 0.14em; text-transform: uppercase; cursor: default; }
.st2-mi.is-head:hover { background: none; }
.st2-mi.is-danger { color: #ff8f86; }
.st2-mi .dot { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.st2-mi-sep { height: 1px; margin: 4px 0; background: #1a1e21; }
.st2-input { height: 22px; padding: 0 6px; border-radius: 2px; background: #121517; border: 1px solid #08090a; color: #fff; font: 600 11px/1 var(--font-body); }
.st2-input:focus { outline: 1px solid var(--s-orange); }
.st2-pad { touch-action: manipulation; }

/* a narrow Studio (a phone) or a short one (a phone on its side): the toolbar is one row to swipe
   along, so the work area keeps its height */
.vz-studio:is(.is-narrow, .is-short) .st2-bar { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: none; min-height: 44px; }
.vz-studio:is(.is-narrow, .is-short) .st2-bar::-webkit-scrollbar { display: none; }
.vz-studio:is(.is-narrow, .is-short) .st2-bar > * { flex: none; }
.vz-studio:is(.is-narrow, .is-short) .st2-hint { min-width: 160px; }
.vz-studio.is-narrow .st2-picker { width: 84px; }
.vz-studio.is-narrow .st2-tracks { width: 64px; }
/* fingers: window headers, close buttons and grips big enough to hit */
@media (pointer: coarse) {
  .st2-win-head { height: 32px; }
  .st2-win-x { width: 30px; height: 28px; font-size: 16px; }
  .st2-win-grip { width: 24px; height: 24px; }
}
`;
