# Visulaserz

An audio-reactive light show with a sound rack. Drop in music files, paste a YouTube link, or play the built-in demo, then bend the sound (slowed + reverb, vaporwave, nightcore, 8D, lo-fi tape…) while WebGL scenes react to it: a handful on the rack, dozens more one click away in the scene market.

## Run it

```bash
npm start
```

Then open <http://localhost:4777>. The app itself has no dependencies.

### YouTube (one-time setup)

YouTube audio is fetched by `yt-dlp` and converted to MP3 by `ffmpeg`, both running locally. Install `yt-dlp` into a project-local virtualenv with:

```bash
npm run setup
```

Requirements: Python 3 and `ffmpeg` on your PATH. If YouTube stops working (it changes often), update `yt-dlp` with the same command and restart. Downloaded MP3s are cached in `cache/` and appear under "Saved from YouTube" in the crate; the app only ever listens on `127.0.0.1`.

## What's inside

- **Sound rack** – varispeed (speed with or without pitch lock), convolution reverb with size and tone, echo, bass/treble/muffle, 8D orbit, drive, vinyl crackle, and presets. Press **Store** to keep your own knob settings as "Mine". The **Ambience** knob sets the level of scene sound, mixed under the music: by default a synthesised rain in the Rain scene, or any track you mark with its ☂ button in the crate (search "rain sounds" on YouTube, press ☂, done). Drop a photo onto the page and the Rain scene shows it through the glass.
- **Vision rack** – the scenes you have picked, on a strip that scrolls sideways, grouped as Show, Journey, Vibe, Things and Lab; nine palettes with a beat-synced "Cycle" option, one-click looks (Cinema, Club, Retro, Mirror, Zen), trails/zoom/spin feedback, bloom, chromatic fringe, grain, symmetry modes, an "Auto" scene director, and a "Reduce flashing" switch.
- **Scene market** (the dashed **Market** key on the strip, or `K`) – every scene lives here until you want it, so the rack stays short however many there are. Click a card's picture to try the scene on the stage behind the drawer; close the drawer and the show goes back to where it was. **+** adds it to the strip (and to the Auto director and the number keys), **✓** takes it off again and frees its shader. Search by name or tag ("space", "rain", "turkish"), filter by group, or sort by **Match** to see what suits the music playing now. A first visit starts with ten scenes; Nova is built in.
- **Stage rack** – hold-to-play pads (tape stop, stutter, strobe, blackout, freeze), a manual DROP, snapshots to PNG, an A–B loop, and live input: visualise whatever the computer is playing, or the microphone.
- The deck shows VU needles and the track's waveform under the seek bar.
- **Lyrics** – synced words are looked up on [LRCLIB](https://lrclib.net) when a track loads (matched by title, artist and duration), or you drop an `.lrc` file / paste LRC text in the crate. The words are drawn inside the WebGL pipeline as kinetic typography, so they get bloom and colour fringing like the scene and end up in REC videos. Fifteen styles (Rise, Karaoke, Pulse, Type, Wave, Scatter, Glitch, Zoom, Flip, Slam, Fall, Neon, Tower, Swing, Split) with enter and exit animations, or **Auto**, which changes the style every four lines so a whole clip varies by itself. Five faces (Auto, Body, Display, Poster, Serif, Mono), four sizes, three positions and an offset knob, all in the Vision rack. Word-level effects use real `<mm:ss.xx>` stamps when the LRC has them, otherwise words are spread over each line's time. Every glyph carries a soft dark halo so lines stay readable over a bright scene.
- **Export WAV** renders the current track through the rack faster than real time. **REC** records the show (picture and sound) to a WebM video.
- Press `?` in the app for the keyboard shortcuts.

## Scene guide

Every scene is a fragment shader that reads the same few signals: the spectrum, the waveform, bass/mid/high levels, the beat (and how long ago it was), a travel clock that runs faster when the music is louder, and the track's title and artwork as textures.

**Show** – *Nova* (radial analyser and shockwaves), *Lasers* (a rig of beams, one band each), *Bars*, *Orb* (a spiked sphere), *Tunnel*, *Kaleido*, *Scope*, *XY* (vectorscope), *Title* (the track's name as the picture), *Pulsar* (stacked ridgelines of the spectrogram, after the CP 1919 plot), *Lattice* (a corridor through a crystal of cubes, each on its own band), *Fireworks* (the big shell is the beat).

**Journey** – *Voyage* (cockpit flight past planets), *Flyby* (between planets at arm's length), *Highway* (night drive with ray-marched traffic), *Forest* (an empty road through pines), *Outrun*, *Train* (the window seat: every beat is a lamp passing the glass), *Cloudsea* (above the clouds at sunset), *Singularity* (a black hole with really bent light: each pixel's photon is integrated along a Schwarzschild geodesic), *Galaxy* (a spiral where radius is frequency).

**Vibe** – *Aurora*, *Rain* (a city through wet glass; drop a photo in to change the view), *Tide* (moonlit sea, plankton on the beat), *Ember* (a campfire whose five tongues are five bands), *Skyline* (towers as the equaliser), *Storm* (a bolt every second beat, with the rain ambience), *Sakura*, *Cabin* (snowed in; the bulbs on the eaves are the analyser), *Abyss* (jellyfish that swim on the beat), *Eclipse* (the corona is a circular analyser), *Nebula*, *Bosphorus* (the bridge's light show is the spectrum), *Cappadocia* (nine balloons, nine bands).

**Things** – *Vinyl* and *Cassette* (both turn at the real playback rate, so the speed knob and tape-stop pad show), *Lava* (metaball lamps), *Broadcast* (a worn VHS of the artwork, or spectrum colour bars), *Neon* (the title as a tube sign over wet pavement), *Arcade* (hash-generated invaders, one column per band), *Globe* (a holographic planet with a ring of bars), *Pool* (caustics computed from screen-space derivatives; beats drop pebbles).

**Lab** – *Chladni* (sand on a vibrating plate; the mode changes every four beats), *Mosaic* (a rose window of folded Voronoi glass), *Julia* (the music steers the constant), *Harmonograph* (a pendulum pen whose ratios are musical intervals), *Helix* (DNA with base pairs as bands), *Cipher* (digital rain that spells the title), *Ebru* (paper marbling with the real drop transform; every beat is a drop), *Radar* (the sweep paints a polar spectrogram into the phosphor).

## Make it yours

- `public/js/gfx/director.js` – `shouldSwitchScene()` decides when AUTO mode cuts to the next scene. It ships as a plain timer; the comment block explains the signals you can use to make it musical.
- `public/js/ui/match.js` – `matchScore()` decides what the market's **Match** sort recommends for the music that is playing. It ships as a plain energy comparison; the comment block lists the signals and the trade-offs.
- `public/scenes/` – every scene is a plugin: one module whose default export describes itself (`id`, `name`, `group`, `blurb`, `tags`, `energy`, its trail settings and the `frag` shader). Copy one, change its `main()`, then run `npm run catalog` so the market lists it and `npm run thumbs` to render its card picture.
- No build step at all: download the template from the bottom of the market, edit it, and drop the `.glsl` file on the page. It is compiled on the spot (errors come back with your own line numbers), joins the strip under "Custom" and is kept in this browser. Drop it again to update it.
- `public/js/gfx/palettes.js` – palettes are four numbers per channel (cosine gradients); the swatch, the UI accent colour and the shaders all read from the same entry.
- `public/js/audio/params.js` – every knob and preset is defined once here.

## Layout

```
server.js               local server: static files, Range-enabled media, yt-dlp jobs
scripts/setup.js        installs yt-dlp into ./.venv
scripts/build-catalog.js  rebuilds public/scenes/catalog.json from the scene plugins (npm run catalog)
scripts/make-thumbs.js    renders the market's card pictures in a browser tab (npm run thumbs)
public/scenes/          scene plugins, catalog.json (what the market reads), thumbs/, template.glsl
public/js/audio/        engine (playback + FX graph), fx-chain, analysis, demo track, WAV encoder
public/js/gfx/          WebGL2 renderer, scene registry (what is installed / loaded), post-processing GLSL, palettes, director
public/js/ui/           knobs, crate (queue + YouTube client), market drawer, UI wiring
```
