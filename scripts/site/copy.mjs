// The words on the site's own pages (scripts/site/pages.mjs builds them). Inline marks:
// **bold**, [label](/address). {scenes}, {free}, {tools}, {turkish} are counted from the catalogues
// at build time, so the numbers stay true as scenes come and go. Every address a link points at
// is checked against the pages that exist, or the build stops.

// ── the scene rooms and the tool groups ───────────────────────────────────────
export const SCENE_GROUPS = {
  Show: 'Club and stage pictures for loud music: spectrum analysers, lasers, a mirror ball, a festival main stage and the Winamp classics.',
  Journey: 'Moving through something while the beat pushes you on: deep space, night motorways, a night train, a flight over the clouds.',
  Vibe: 'Calm places that breathe with the song: rain on a window, northern lights, a koi pond, a snowed-in cabin.',
  Things: 'Objects that play the music: a record, a cassette, lava lamps, Nixie tubes, a snow globe, a music box.',
  Lab: 'Mathematics and physics turned into music: fractals, Chladni figures, a Lorenz attractor, fluid ink, hyperbolic tilings.',
};
export const TOOL_GROUPS = {
  Studio: 'A whole music workstation over the song.',
  Pads: 'One finger on a pad and the whole mix moves.',
  Rhythm: 'Effects that keep time with the track.',
  Instruments: 'Play along with the song, in its tempo and key.',
  FX: 'The big moves: builds, pumps, freezes and vocal cuts.',
};

// How a scene's energy reads, and the music it suits. The catalogue gives every scene a number
// from 0 (still) to 1 (flat out).
export const ENERGY = [
  { min: 0.75, word: 'intense', text: 'High energy: it hits hard on every beat, so it suits music with drops.', genres: ['EDM', 'Techno', 'Drum & bass', 'Phonk', 'Hardstyle'] },
  { min: 0.55, word: 'lively', text: 'Lively: it keeps time with the beat without flooding the screen.', genres: ['Pop', 'Hip-hop', 'House', 'Rock', 'Synthwave'] },
  { min: 0.4, word: 'steady', text: 'A middle pace: steady movement that follows the bass and the melody, good with most music.', genres: ['Indie', 'R&B', 'Pop', 'Electronic', 'Film music'] },
  { min: 0, word: 'calm', text: 'Calm: slow, smooth movement for quiet songs.', genres: ['Lo-fi', 'Ambient', 'Slowed + reverb', 'Piano', 'Acoustic'] },
];

// ── each tool: what people search for, and what it is for ──────────────────────
export const TOOL_COPY = {
  studio: { phrase: 'Online DAW in your browser', uses: ['Make a beat over a song you love, locked to its tempo and key', 'Sketch a remix: drums in the channel rack, a bassline in the piano roll', 'Arrange patterns in the playlist and export the song as a WAV'] },
  touchfx: { phrase: 'Kaoss-style touch effects pad', uses: ['Sweep the filter before a drop', 'Throw a tempo echo on the last word of a line', 'Wobble and crush the mix for a breakdown'] },
  roll: { phrase: 'Beat repeat and stutter effect', uses: ['Build tension with rolls from a beat down to a 32nd', 'Roll backwards into a chorus', 'Let go and the track is where it would have been, still in time'] },
  scratch: { phrase: 'Scratch any track in your browser', uses: ['Baby scratches and cuts over the mix', 'Brake and backspin transitions', 'Practise scratching without a turntable'] },
  stepgate: { phrase: 'Step gate and trance gate', uses: ['Chop a pad or a vocal into a rhythm', 'The classic trance gate over a breakdown', 'Swing a stiff loop'] },
  looper: { phrase: 'Online looper', uses: ['Loop a few bars of the mix and play over them', 'Layer drums, chords and voice in overdubs', 'Solo the loop over silence for a break'] },
  drums: { phrase: 'Drum pads over any song', uses: ['Finger-drum along with a track, quantised to its beat', 'Add an air horn or a clap to a drop', 'Three synthesised kits, nothing to download'] },
  theremin: { phrase: 'A theremin that stays in key', uses: ['Play a lead over any song without a wrong note', 'Find the key of a song by ear with Listen', 'Bend into the melody with vibrato'] },
  chop: { phrase: 'MPC-style sample chopper', uses: ['Chop the last two bars into eight pads', 'Replay the pieces in a new order, in time', 'Mute the track and keep only your chops'] },
  chords: { phrase: 'Chord pads in the song’s key', uses: ['Play along with a song without knowing its chords', 'Strum, pluck or arpeggiate in time', 'Find the key of the song by ear with Listen'] },
  siren: { phrase: 'Dub siren', uses: ['The sound-system wail over a reggae or dub track', 'A laser zap or an alarm before a drop', 'Let the tempo-locked echo carry it away'] },
  micfx: { phrase: 'Voice changer and vocoder', uses: ['MC over a track with your voice up or down', 'A robot, a radio or a vocoder in the song’s key', 'Karaoke with effects (headphones on)'] },
  riser: { phrase: 'Riser and build-up effect', uses: ['A noise sweep and a snare roll that speed up in time', 'Thin the track out before the drop', 'Land the drop on an impact'] },
  pump: { phrase: 'Sidechain pump effect', uses: ['Make any track breathe like a house record', 'Quarter or eighth-note pumping, locked to the tempo', 'Shape how deep and how fast it ducks'] },
  freeze: { phrase: 'Granular sound freeze', uses: ['Stop the music in mid-air for a transition', 'Turn a moment into a drone, an octave up or down', 'Freeze the picture with it'] },
  vocalcut: { phrase: 'Vocal remover for karaoke', uses: ['Take a centred vocal out of a studio mix', 'Keep only the voice for an a cappella moment', 'Works live, on the song as it plays'] },
  lofi: { phrase: 'Lo-fi effect: tape, vinyl and radio', uses: ['Put the mix on a stretched cassette', 'Dust and crackle like an old record', 'Squeeze it into a pocket radio'] },
};

// ── the words every page shares ─────────────────────────────────────────────────
export const UI = {
  en: {
    nav: [['/scenes', 'Scenes'], ['/tools', 'Tools'], ['/music-visualizer', 'Visualizer'], ['/lyric-video-maker', 'Lyric videos'], ['/slowed-reverb', 'Slowed + reverb'], ['/online-daw', 'DAW'], ['/visualizer-for-tiktok', 'TikTok']],
    open: 'Open the app',
    other: 'Türkçe',
    footer: { scenes: 'Scenes', tools: 'Tools', make: 'Make', tr: 'Türkçe', line: 'A music visualizer that runs in your browser.' },
    crumbs: 'Breadcrumb',
    site: 'Site',
  },
  tr: {
    nav: [['/tr', 'Görselleştirici'], ['/tr/sarki-sozu-videosu', 'Şarkı sözü'], ['/tr/slowed-reverb', 'Slowed + reverb'], ['/tr/online-daw', 'DAW'], ['/tr/dikey-video', 'Dikey video'], ['/scenes', 'Sahneler'], ['/tools', 'Araçlar']],
    open: 'Uygulamayı aç',
    other: 'English',
    footer: { scenes: 'Sahneler', tools: 'Araçlar', make: 'Yap', tr: 'English', line: 'Tarayıcıda çalışan bir müzik görselleştirici.' },
    crumbs: 'Sayfa yolu',
    site: 'Site',
  },
};

// The scene and tool pages are in English; the steps every scene page ends with.
export const SCENE_STEPS = [
  ['Drop a track', 'Open {name} in Visulaserz and drop in a song: MP3, WAV, FLAC, M4A, OGG or Opus. The files stay on your computer.'],
  ['Choose the shape', 'In the Clip unit pick 9:16 for TikTok, Reels and Shorts, 16:9 for YouTube, or 1:1 for a post. The stage takes that shape.'],
  ['Record', 'Press REC to record it as it plays, or record a Take and render an MP4 at 720p, 1080p or 1440p, frame by frame.'],
];
export const TOOL_STEPS = [
  ['Open it', 'Open {name} in Visulaserz. It sits on the desk over the picture, and you can open several tools at once.'],
  ['Play a song', 'Drop in a track or start the demo. {name} finds the tempo, and the key where it needs one.'],
  ['Play along', 'Everything you do lands in time with the song. Record a video of it with REC.'],
];

// ── the use-case pages ──────────────────────────────────────────────────────────
// hero: 'strip' (five scene frames), 'phones' (five tall frames) or 'tool' (one tool's picture).
export const USE_CASES = [
  {
    route: '/music-visualizer', lang: 'en', card: 'music-visualizer',
    title: 'Online Music Visualizer — Free, in Your Browser | Visulaserz',
    ogTitle: 'A music visualizer you can play',
    description: 'Turn any song into a laser show, a night drive or a koi pond that moves with the beat. {scenes} scenes, timed lyrics and MP4 export. Free, in your browser.',
    eyebrow: 'Music visualizer · in your browser',
    h1: 'A music visualizer you can play',
    lead: 'Drop in a track and Visulaserz turns it into a laser show, a night drive, a galaxy or a koi pond that moves with the music. It runs in your browser, so there is nothing to install, and the files you drop stay on your computer.',
    cta: 'Open Visulaserz',
    hero: { kind: 'strip', scenes: ['lasers', 'highway', 'koi', 'galaxy', 'festival'] },
    sections: [
      { h2: 'How it listens', p: [
        'Visulaserz finds the beat and the tempo, and splits the sound into bass, mids and highs as it plays. Every scene ties its parts to different bands: in [Pamukkale](/scene/pamukkale) each pool rides its own band and a beat sends a spill down the terraces; in [Lasers](/scene/lasers) the beam pattern switches every eight beats; [Bars](/scene/bars) is the classic LED ladder with falling peaks.',
        'Turn React and Motion to taste, change the palette, add trails, or hold a pad for a strobe, a freeze or a blackout of your own.',
      ] },
      { h2: '{scenes} scenes in five rooms', list: [
        '**[Show](/scenes#show)**: analysers, lasers, a mirror ball and the Winamp classics, for loud music.',
        '**[Journey](/scenes#journey)**: deep space, night motorways, a night train and a flight over the clouds.',
        '**[Vibe](/scenes#vibe)**: rain on a window, northern lights, a koi pond, a snowed-in cabin.',
        '**[Things](/scenes#things)**: a record, a cassette, lava lamps, a snow globe, a music box.',
        '**[Lab](/scenes#lab)**: fractals, Chladni figures, fluid ink and other physics.',
      ], scenes: ['bars', 'voyage', 'aurora', 'vinyl', 'julia', 'mirrorball'] },
      { h2: 'Make the video', steps: [
        ['Drop a track', 'MP3, WAV, FLAC, M4A, OGG or Opus. Or play live: Visulaserz can listen to the microphone, or to whatever this computer is playing.'],
        ['Frame it', 'In the Clip unit choose 9:16 for TikTok, Reels and Shorts, 16:9 for YouTube or 1:1 for a post. The stage takes that shape, so what you see is what you get.'],
        ['Record', 'Press REC to record as it plays, or record a Take and render it as an MP4 at 720p, 1080p or 1440p, frame by frame.'],
      ], p: ['Put your name and logo in a corner, open with a title card (the cover, the title, the artist), and show the [lyrics](/lyric-video-maker) in time with the song.'] },
      { h2: 'On a big screen', p: [
        'Go full screen and switch on Auto: the show changes scenes by itself. Two decks with tempo sync are there for a DJ set, and the strobe, freeze, blackout and drop pads are on the keyboard. For the sound itself there is a [slowed + reverb](/slowed-reverb) rack and a [studio](/online-daw).',
      ] },
      { h2: 'Free', p: [
        '{free} scenes work without an account. A free account (an email and a password, nothing to pay) opens all {scenes}, keeps your track list and takes the small credit off your videos.',
      ] },
    ],
  },
  {
    route: '/lyric-video-maker', lang: 'en', pair: '/tr/sarki-sozu-videosu', card: 'lyric-video-maker',
    title: 'Lyric Video Maker — Timed, Animated Lyrics, Free | Visulaserz',
    ogTitle: 'Make a lyric video in your browser',
    description: 'Make a lyric video in your browser: find timed lyrics or tap them in, pick one of 15 animated styles, and export an MP4 in 9:16 or 16:9. Free.',
    eyebrow: 'Lyric video maker',
    h1: 'Make a lyric video in your browser',
    lead: 'Visulaserz puts the words on screen as they are sung, animated over a scene that moves with the music. Find the timed lyrics, or tap them in yourself once, then record the video.',
    cta: 'Make a lyric video',
    hero: { kind: 'strip', scenes: ['neon', 'rain', 'starry', 'cassette', 'aurora'] },
    sections: [
      { h2: 'Get the timing', list: [
        '**Search**: type “artist - song” and Visulaserz looks it up in [LRCLIB](https://lrclib.net), an open library of timed lyrics.',
        '**Drop or paste**: an .lrc file, or LRC text from anywhere.',
        '**Tap sync**: paste the plain words, play the song and press Space as each line begins. The timing is kept for that song, and you can download it as an .lrc.',
      ] },
      { h2: 'Make the words move', p: [
        'Fifteen lyric styles, from a soft rise and a karaoke fill to typewriter, glitch, neon, slam and a tower of words. Each one keeps time with the beat. Under the words goes any of the {scenes} scenes: [Rain](/scene/rain) for a slow song, [Neon](/scene/neon) for a sign on a wet street, [Festival](/scene/festival) for a big chorus.',
      ], scenes: ['rain', 'neon', 'festival', 'cabin', 'nightflight', 'title'] },
      { h2: 'Record it', steps: [
        ['Choose the shape', '9:16 for TikTok, Reels and Shorts, 16:9 for YouTube, 1:1 for a post.'],
        ['Open with a title card', 'The cover, the song title and the artist, for the first few seconds.'],
        ['Record', 'REC records as it plays. A Take renders an MP4 at up to 1440p, frame by frame, so nothing stutters even on a slow laptop.'],
      ] },
      { h2: 'Good to know', list: [
        '**No account needed.** A free account opens every scene and takes the small “made with visulaserz.com” off your videos.',
        '**Use songs you may share**: your own music, or tracks whose licence allows it.',
        'For TikTok and Reels, see [vertical videos](/visualizer-for-tiktok).',
      ] },
    ],
  },
  {
    route: '/slowed-reverb', lang: 'en', pair: '/tr/slowed-reverb', card: 'slowed-reverb',
    title: 'Slowed + Reverb Maker — Online and Free | Visulaserz',
    ogTitle: 'Slowed + reverb in one click',
    description: 'Make a slowed + reverb edit in your browser: one-click presets (Vaporwave, Nightcore, 8D, Lo-fi and more), speed from 0.5× to 1.5×, WAV download. Free.',
    eyebrow: 'Slowed + reverb maker',
    h1: 'Slowed + reverb in one click',
    lead: 'Drop a song, press Slowed + Reverb, and it plays slower, lower and in a big room, the way the edits sound. Then fine-tune it, save it as a WAV, or record it as a video with a scene.',
    cta: 'Make a slowed + reverb',
    hero: { kind: 'strip', scenes: ['rain', 'cabin', 'nightflight', 'tide', 'train'] },
    sections: [
      { h2: 'The presets', list: [
        '**Slowed + Reverb**: 0.82× speed, a large dark reverb, a little more bass.',
        '**Vaporwave**: 0.72×, a bigger room and a tempo echo.',
        '**Nightcore**: 1.25×, brighter, in a short room.',
        '**Underwater**: muffled and far away.',
        '**8D Hall**: the sound circles your head. Best on headphones.',
        '**Lo-fi Tape**: wow, crackle and warm drive.',
        '**Bass Boost**: more low end.',
      ] },
      { h2: 'Shape it yourself', p: [
        'Speed runs from 0.5× to 1.5×. As on a record, the pitch moves with it: that is the slowed sound. Reverb mix, size and tone, echo, bass and treble are knobs on the same rack, and the music keeps playing while you turn them.',
      ] },
      { h2: 'Keep it', p: [
        'Export renders your edit as a WAV, faster than real time, for tracks up to 20 minutes. To post it, record a video instead: a slow scene like [Rain](/scene/rain), [Cabin](/scene/cabin) or [Night flight](/scene/nightflight) suits the sound, and [9:16](/visualizer-for-tiktok) makes it ready for TikTok.',
        'Share only edits of music you have the rights to.',
      ], scenes: ['rain', 'cabin', 'nightflight', 'tide', 'aurora', 'lava'] },
    ],
  },
  {
    route: '/online-daw', lang: 'en', pair: '/tr/online-daw', card: 'online-daw',
    title: 'Online DAW — FL Studio-Style Beat Maker in Your Browser | Visulaserz',
    ogTitle: 'A DAW in your browser, built around the song',
    description: 'Make beats in your browser: playlist, channel rack, piano roll and a mixer with effect slots, locked to your song’s tempo and key. Free, nothing to install.',
    eyebrow: 'Online DAW · beat maker',
    h1: 'A DAW in your browser, built around the song',
    lead: 'The Studio is a music workstation laid out like FL Studio, with one difference: it plays along with a song. Drop in a track and the Studio takes its tempo and key, so your drums, bass and chords fit it from the first bar.',
    cta: 'Open the Studio',
    ctaHref: '/?tool=studio',
    hero: { kind: 'tool', tool: 'studio' },
    sections: [
      { h2: 'What is in it', list: [
        '**Playlist**: arrange your patterns into a song.',
        '**Channel rack**: a step sequencer for drums and samples.',
        '**Piano roll**: draw melodies, chords and basslines.',
        '**Mixer**: tracks with effect slots, and plugin windows you can open side by side.',
        '**Undo and export**: a WAV of the pattern or of the whole song.',
      ] },
      { h2: 'Play over the track', p: [
        'Beside the Studio sit {instruments} more tools that play over the song in time: [Drum Pads](/tool/drums), [Chords](/tool/chords) in the song’s key, a [Theremin](/tool/theremin) that cannot play a wrong note, an MPC-style [Chop](/tool/chop), a [Looper](/tool/looper), and effects like [Beat Roll](/tool/roll), [Riser](/tool/riser) and [Pump](/tool/pump). [See them all](/tools).',
      ], tools: ['drums', 'chords', 'chop', 'looper', 'roll', 'riser'] },
      { h2: 'Who it is for', p: [
        'Anyone who wants to get an idea down on whatever computer is in front of them: nothing to install, no account needed for the tools, nothing to buy. It does not replace a full DAW; it is the shortest way from a song you like to a beat of your own.',
        'And because it is Visulaserz, the picture moves with what you make. Record it, and the beat comes with its own video.',
      ] },
    ],
  },
  {
    route: '/visualizer-for-tiktok', lang: 'en', pair: '/tr/dikey-video', card: 'visualizer-for-tiktok',
    title: 'Music Visualizer for TikTok, Reels and Shorts — 9:16 | Visulaserz',
    ogTitle: 'Vertical music videos for TikTok, Reels and Shorts',
    description: 'Make vertical music videos for TikTok, Reels and Shorts: 9:16 at 1080×1920, animated lyrics, a title card and MP4 export, in your browser. Free.',
    eyebrow: 'Vertical video · 9:16',
    h1: 'Vertical music videos for TikTok, Reels and Shorts',
    lead: 'Set Visulaserz to 9:16 and the stage becomes a phone screen: what you see is the video you get, at 1080×1920 or sharper. Pick a scene, put the lyrics on, record.',
    cta: 'Make a vertical video',
    hero: { kind: 'phones', scenes: ['lasers', 'fireworks', 'koi', 'tunnel', 'starry'] },
    sections: [
      { h2: 'Sizes', list: [
        '**9:16**: 720×1280, 1080×1920 or 1440×2560, for TikTok, Reels and Shorts.',
        '**1:1**: square posts.',
        '**16:9**: YouTube and landscape screens.',
      ] },
      { h2: 'Made for the feed', list: [
        '**The first second counts**: start recording on the drop, or open with a short title card (the cover, the title, the artist).',
        '**Words keep people watching**: put the [timed lyrics](/lyric-video-maker) on screen.',
        '**Leave room for the app**: captions and buttons cover the bottom and the right of a vertical video, so keep your name in a top corner.',
        '**Big shapes read on a small screen**: [Lasers](/scene/lasers), [Tunnel](/scene/tunnel), [Orb](/scene/orb) and [Fireworks](/scene/fireworks) work well.',
      ], scenes: ['lasers', 'tunnel', 'orb', 'fireworks', 'mirrorball', 'outrun'] },
      { h2: 'Record', steps: [
        ['Drop a track', 'MP3, WAV, FLAC, M4A, OGG or Opus, or start the demo.'],
        ['Pick 9:16', 'In the Clip unit. Choose 1080 or 1440 for the size.'],
        ['Record', 'REC records as it plays; a Take renders the MP4 frame by frame, smooth even on a slow laptop.'],
      ], p: ['Free, in your browser. A guest’s videos carry a small “made with visulaserz.com”; a free account takes it off.'] },
    ],
  },

  // ── Türkçe ──
  {
    route: '/tr', lang: 'tr', pair: '/', card: 'tr',
    title: 'Müzik Görselleştirici — Ücretsiz, Tarayıcıda | Visulaserz',
    ogTitle: 'Çalabildiğin bir müzik görselleştirici',
    description: 'Şarkını lazer şovuna, gece yolculuğuna ya da koi havuzuna çevir: ritimle hareket eden {scenes} sahne, şarkı sözü videoları, slowed + reverb. Ücretsiz.',
    eyebrow: 'Müzik görselleştirici · tarayıcıda',
    h1: 'Çalabildiğin bir müzik görselleştirici',
    lead: 'Bir şarkı bırak, Visulaserz onu müzikle birlikte hareket eden bir lazer şovuna, gece yolculuğuna, galaksiye ya da koi havuzuna çevirsin. Tarayıcıda çalışır: kurulacak bir şey yok, bıraktığın dosyalar bilgisayarından çıkmaz.',
    cta: 'Visulaserz’i aç',
    hero: { kind: 'strip', scenes: ['bosphorus', 'cappadocia', 'sema', 'pamukkale', 'express'] },
    sections: [
      { h2: 'Nasıl dinler', p: [
        'Visulaserz şarkı çalarken ritmi ve tempoyu bulur, sesi bas, orta ve tiz olarak ayırır. Her sahne kendi parçalarını farklı bantlara bağlar: [Pamukkale](/scene/pamukkale)’de her havuz kendi bandıyla dolar, vuruşta terasların aşağısına su taşar; [Lasers](/scene/lasers)’ta ışın deseni her sekiz vuruşta değişir.',
        'React ve Motion düğmeleriyle tepkiyi ve hareketi istediğin gibi ayarla, paleti değiştir, iz ekle; ya da bir pede basılı tutup kendi strobunu, donmanı, karartmanı yap.',
      ] },
      { h2: 'Türkiye’den {turkish} sahne', p: ['{turkishList}: bu topraklardan yerler ve motifler, müzikle birlikte hareket ediyor.'], scenes: ['bosphorus', 'cappadocia', 'hamam', 'fener', 'snowglobe', 'express'] },
      { h2: 'Videoyu yap', steps: [
        ['Şarkıyı bırak', 'MP3, WAV, FLAC, M4A, OGG ya da Opus. İstersen canlı da çalar: mikrofonu ya da bilgisayarda çalan her şeyi dinleyebilir.'],
        ['Biçimi seç', 'Clip bölümünde TikTok, Reels ve Shorts için 9:16, YouTube için 16:9, gönderi için 1:1. Sahne o şekle girer; ekranda ne görüyorsan video o olur.'],
        ['Kaydet', 'REC çalarken kaydeder. Take ise videoyu kare kare 720p, 1080p ya da 1440p MP4 olarak işler.'],
      ], p: ['Köşeye adını ve logonu koy, videoyu bir başlık kartıyla aç, [şarkı sözlerini](/tr/sarki-sozu-videosu) şarkıyla birlikte ekrana getir.'] },
      { h2: 'Ses tarafı', p: [
        'Tek tıkla [slowed + reverb](/tr/slowed-reverb), vaporwave, nightcore, 8D ya da lo-fi. Bir de şarkının tempo ve tonuna kilitli bir [stüdyo](/tr/online-daw): FL Studio düzeninde playlist, channel rack, piano roll ve mikser.',
      ] },
      { h2: 'Ücretsiz', p: [
        '{free} sahne hesapsız çalışır. Ücretsiz bir hesap (e-posta ve şifre, ödeme yok) {scenes} sahnenin hepsini açar, şarkı listeni saklar ve videolarındaki küçük yazıyı kaldırır. Uygulamanın dili İngilizce; sahneler ve araçlar herkes için aynı.',
      ] },
    ],
  },
  {
    route: '/tr/slowed-reverb', lang: 'tr', pair: '/slowed-reverb', card: 'tr-slowed-reverb',
    title: 'Slowed + Reverb Yapma — Online ve Ücretsiz | Visulaserz',
    ogTitle: 'Tek tıkla slowed + reverb',
    description: 'Bir şarkının slowed + reverb versiyonunu tarayıcıda yap: tek tık hazır ayarlar (Vaporwave, Nightcore, 8D, Lo-fi ve fazlası), 0.5×–1.5× hız, WAV indirme.',
    eyebrow: 'Slowed + reverb yapma',
    h1: 'Tek tıkla slowed + reverb',
    lead: 'Şarkıyı bırak, Slowed + Reverb’e bas: daha yavaş, daha pes ve büyük bir salonun içinde çalar; edit’ler nasıl duyuluyorsa öyle. Sonra ince ayarını yap, WAV olarak kaydet ya da bir sahneyle video olarak kaydet.',
    cta: 'Slowed + reverb yap',
    hero: { kind: 'strip', scenes: ['rain', 'cabin', 'nightflight', 'tide', 'express'] },
    sections: [
      { h2: 'Hazır ayarlar', list: [
        '**Slowed + Reverb**: 0.82× hız, büyük ve koyu bir reverb, biraz daha bas.',
        '**Vaporwave**: 0.72×, daha büyük bir oda ve tempoya oturan bir eko.',
        '**Nightcore**: 1.25×, daha parlak, kısa bir odada.',
        '**Underwater**: boğuk ve uzaktan.',
        '**8D Hall**: ses başının etrafında döner. En iyisi kulaklıkla.',
        '**Lo-fi Tape**: kaset dalgalanması, cızırtı ve sıcak bir sürüş.',
        '**Bass Boost**: daha çok bas.',
      ] },
      { h2: 'Kendin ayarla', p: [
        'Hız 0.5× ile 1.5× arasında. Plakta olduğu gibi perde de onunla birlikte değişir: slowed sesi tam olarak bu. Reverb miktarı, boyutu ve tonu, eko, bas ve tiz aynı rafta düğme; sen çevirirken müzik durmaz.',
      ] },
      { h2: 'Sakla', p: [
        'Export, edit’ini gerçek zamandan hızlı bir şekilde WAV olarak işler; 20 dakikaya kadar şarkılarda çalışır. Paylaşmak için video kaydet: [Rain](/scene/rain), [Cabin](/scene/cabin) ya da [Night flight](/scene/nightflight) gibi yavaş bir sahne bu sese yakışır, [9:16](/tr/dikey-video) de TikTok’a hazır hale getirir.',
        'Sadece paylaşma hakkın olan müziklerin edit’lerini paylaş.',
      ], scenes: ['rain', 'cabin', 'nightflight', 'tide', 'aurora', 'lava'] },
    ],
  },
  {
    route: '/tr/sarki-sozu-videosu', lang: 'tr', pair: '/lyric-video-maker', card: 'tr-sarki-sozu-videosu',
    title: 'Şarkı Sözü Videosu Yapma — Senkronize, Animasyonlu | Visulaserz',
    ogTitle: 'Tarayıcıda şarkı sözü videosu',
    description: 'Tarayıcıda şarkı sözü videosu yap: zamanlı sözleri bul ya da kendin senkronla, 15 animasyon stilinden birini seç, 9:16 veya 16:9 MP4 indir. Ücretsiz.',
    eyebrow: 'Şarkı sözü videosu',
    h1: 'Tarayıcıda şarkı sözü videosu',
    lead: 'Visulaserz sözleri söylendikleri anda ekrana getirir; müzikle hareket eden bir sahnenin üstünde, animasyonlu. Zamanlı sözleri bul ya da bir kere kendin tıklayarak senkronla, sonra videoyu kaydet.',
    cta: 'Şarkı sözü videosu yap',
    hero: { kind: 'strip', scenes: ['neon', 'rain', 'starry', 'cassette', 'aurora'] },
    sections: [
      { h2: 'Zamanlamayı al', list: [
        '**Ara**: “sanatçı - şarkı” yaz; Visulaserz sözleri zamanlı sözlerin açık kütüphanesi [LRCLIB](https://lrclib.net)’de arar.',
        '**Bırak ya da yapıştır**: bir .lrc dosyası ya da herhangi bir yerden LRC metni.',
        '**Tıklayarak senkronla**: düz sözleri yapıştır, şarkıyı çal ve her satır başladığında Space’e bas. Zamanlama o şarkı için saklanır; istersen .lrc olarak indirebilirsin.',
      ] },
      { h2: 'Sözleri hareket ettir', p: [
        'Yumuşak bir yükselişten karaoke dolgusuna, daktilo, glitch, neon, slam ve kelime kulesine kadar on beş söz stili. Hepsi ritimle birlikte çalışır. Sözlerin altına {scenes} sahneden herhangi biri gelir: yavaş bir şarkı için [Rain](/scene/rain), ıslak bir sokakta neon tabela için [Neon](/scene/neon), büyük bir nakarat için [Festival](/scene/festival).',
      ], scenes: ['rain', 'neon', 'festival', 'cabin', 'bosphorus', 'title'] },
      { h2: 'Kaydet', steps: [
        ['Biçimi seç', 'TikTok, Reels ve Shorts için 9:16, YouTube için 16:9, gönderi için 1:1.'],
        ['Başlık kartıyla aç', 'İlk birkaç saniye kapak, şarkının adı ve sanatçı.'],
        ['Kaydet', 'REC çalarken kaydeder. Take, MP4’ü 1440p’ye kadar kare kare işler; yavaş bir dizüstünde bile takılmaz.'],
      ] },
      { h2: 'Bilmekte fayda var', list: [
        '**Hesap gerekmez.** Ücretsiz bir hesap tüm sahneleri açar ve videolarındaki küçük “made with visulaserz.com” yazısını kaldırır.',
        '**Paylaşabileceğin şarkıları kullan**: kendi müziğin ya da lisansı buna izin veren parçalar.',
        'TikTok ve Reels için [dikey videolara](/tr/dikey-video) bak.',
      ] },
    ],
  },
  {
    route: '/tr/online-daw', lang: 'tr', pair: '/online-daw', card: 'tr-online-daw',
    title: 'Online DAW — Tarayıcıda FL Studio Tarzı Beat Yapma | Visulaserz',
    ogTitle: 'Şarkının etrafına kurulmuş, tarayıcıda bir DAW',
    description: 'Tarayıcıda beat yap: playlist, channel rack, piano roll ve efekt slotlu mikser, şarkının tempo ve tonuna kilitli. WAV dışa aktarma. Ücretsiz, kurulum yok.',
    eyebrow: 'Online DAW · beat yapma',
    h1: 'Şarkının etrafına kurulmuş, tarayıcıda bir DAW',
    lead: 'Studio, FL Studio gibi düzenlenmiş bir müzik istasyonu; tek bir farkla: bir şarkıyla birlikte çalar. Bir parça bırak, Studio onun temposunu ve tonunu alsın; davulların, basın ve akorların ilk ölçüden oturur.',
    cta: 'Studio’yu aç',
    ctaHref: '/?tool=studio',
    hero: { kind: 'tool', tool: 'studio' },
    sections: [
      { h2: 'İçinde neler var', list: [
        '**Playlist**: pattern’lerini bir şarkıya diz.',
        '**Channel rack**: davul ve sample’lar için bir step sequencer.',
        '**Piano roll**: melodi, akor ve bas çiz.',
        '**Mikser**: efekt slotlu kanallar ve yan yana açabildiğin plugin pencereleri.',
        '**Geri alma ve dışa aktarma**: pattern’in ya da bütün şarkının WAV’ı.',
      ] },
      { h2: 'Şarkının üstünde çal', p: [
        'Studio’nun yanında şarkının üstünde, tempoda çalan {instruments} araç daha var: [Drum Pads](/tool/drums), şarkının tonunda [Chords](/tool/chords), yanlış nota çalamayan bir [Theremin](/tool/theremin), MPC tarzı [Chop](/tool/chop), bir [Looper](/tool/looper); ayrıca [Beat Roll](/tool/roll), [Riser](/tool/riser) ve [Pump](/tool/pump) gibi efektler. [Hepsine bak](/tools).',
      ], tools: ['drums', 'chords', 'chop', 'looper', 'roll', 'riser'] },
      { h2: 'Kimin için', p: [
        'Önündeki bilgisayar hangisi olursa olsun bir fikri hemen kaydetmek isteyen herkes için: kurulacak bir şey yok, araçlar için hesap gerekmez, satın alınacak bir şey yok. Tam bir DAW’ın yerini tutmaz; sevdiğin bir şarkıdan kendi beat’ine giden en kısa yol.',
        'Ve Visulaserz olduğu için, görüntü senin yaptığınla birlikte hareket eder. Kaydet; beat’in kendi videosuyla gelsin.',
      ] },
    ],
  },
  {
    route: '/tr/dikey-video', lang: 'tr', pair: '/visualizer-for-tiktok', card: 'tr-dikey-video',
    title: 'TikTok, Reels ve Shorts için Dikey Müzik Videosu | Visulaserz',
    ogTitle: 'TikTok, Reels ve Shorts için dikey müzik videoları',
    description: 'TikTok, Reels ve Shorts için dikey müzik videosu yap: 1080×1920 9:16, animasyonlu sözler, başlık kartı ve MP4 dışa aktarma. Tarayıcıda, ücretsiz.',
    eyebrow: 'Dikey video · 9:16',
    h1: 'TikTok, Reels ve Shorts için dikey müzik videoları',
    lead: 'Visulaserz’i 9:16’ya al, sahne bir telefon ekranına dönüşsün: ekranda ne görüyorsan video o, 1080×1920 ya da daha keskin. Bir sahne seç, sözleri ekle, kaydet.',
    cta: 'Dikey video yap',
    hero: { kind: 'phones', scenes: ['bosphorus', 'fireworks', 'sema', 'lasers', 'fener'] },
    sections: [
      { h2: 'Boyutlar', list: [
        '**9:16**: TikTok, Reels ve Shorts için 720×1280, 1080×1920 ya da 1440×2560.',
        '**1:1**: kare gönderiler.',
        '**16:9**: YouTube ve yatay ekranlar.',
      ] },
      { h2: 'Akış için', list: [
        '**İlk saniye önemli**: kayda drop’ta başla ya da kısa bir başlık kartıyla aç (kapak, şarkının adı, sanatçı).',
        '**Sözler izletir**: [zamanlı sözleri](/tr/sarki-sozu-videosu) ekrana getir.',
        '**Uygulamaya yer bırak**: dikey videoda yazılar ve düğmeler altı ve sağı kapatır; adını üst köşelerden birine koy.',
        '**Küçük ekranda büyük şekiller okunur**: [Lasers](/scene/lasers), [Tunnel](/scene/tunnel), [Orb](/scene/orb) ve [Fireworks](/scene/fireworks) iyi çalışır.',
      ], scenes: ['lasers', 'tunnel', 'orb', 'fireworks', 'mirrorball', 'outrun'] },
      { h2: 'Kaydet', steps: [
        ['Şarkıyı bırak', 'MP3, WAV, FLAC, M4A, OGG ya da Opus; ya da demoyu başlat.'],
        ['9:16’yı seç', 'Clip bölümünde. Boyut için 1080 ya da 1440.'],
        ['Kaydet', 'REC çalarken kaydeder; Take MP4’ü kare kare işler, yavaş bir dizüstünde bile akıcı.'],
      ], p: ['Ücretsiz, tarayıcıda. Misafir videolarında küçük bir “made with visulaserz.com” yazısı olur; ücretsiz bir hesap onu kaldırır.'] },
    ],
  },
];

// Turkish names for the scenes made in Turkey's image (the /tr page lists them).
export const TR_NAMES = {
  bosphorus: 'Boğaziçi', cappadocia: 'Kapadokya', pamukkale: 'Pamukkale', sema: 'Sema', lale: 'Lale', nazar: 'Nazar', cini: 'Çini',
  ebru: 'Ebru', kilim: 'Kilim', hamam: 'Hamam', fener: 'Fener', express: 'Doğu Ekspresi', snowglobe: 'İstanbul kar küresi', kervan: 'Kervan',
};

// The two indexes.
export const INDEX = {
  scenes: {
    title: '{scenes} Music Visualizer Scenes | Visulaserz',
    ogTitle: '{scenes} scenes that move with your music',
    description: 'Every Visulaserz scene: lasers, spectrum analysers, night drives, space flights, rain, koi, fractals and more, each moving with your music. Free.',
    eyebrow: 'Music visualizer scenes',
    h1: 'Scenes',
    lead: '{scenes} pictures that move with the music, in five rooms. A free account opens all of them; the {free} marked “No account” work without one.',
  },
  tools: {
    title: 'Music Tools in Your Browser — DAW, Pads and FX | Visulaserz',
    ogTitle: '{tools} tools that play over the song',
    description: 'An FL Studio-style Studio, drum pads, chords, a theremin, a looper, scratching, risers, a vocal remover and lo-fi effects, in time with your song. Free.',
    eyebrow: 'Instruments and effects',
    h1: 'Tools',
    lead: 'Instruments and effects that play over the song, in its tempo and key. All {tools} are free and need no account.',
  },
};
