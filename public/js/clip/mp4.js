// A small MP4 writer for the clip renderer: H.264 video and AAC audio as WebCodecs hands them over,
// laid out as a plain file with its index (moov) in front of the media (mdat), so it plays at once
// and uploads anywhere that takes video: Reels, TikTok, Shorts, a phone's gallery.
//
// One sample per chunk keeps the tables simple; the video runs at a constant frame duration.

const enc = new TextEncoder();
function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const u8 = (...v) => Uint8Array.from(v);
function u16(...values) { const b = new Uint8Array(values.length * 2), d = new DataView(b.buffer); values.forEach((x, i) => d.setUint16(i * 2, x)); return b; }
function u32(...values) { const b = new Uint8Array(values.length * 4), d = new DataView(b.buffer); values.forEach((x, i) => d.setUint32(i * 4, x >>> 0)); return b; }
function table(values) { const b = new Uint8Array(values.length * 4), d = new DataView(b.buffer); for (let i = 0; i < values.length; i++) d.setUint32(i * 4, values[i] >>> 0); return b; }
function box(type, ...parts) {
  const body = concat(parts.flat());
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, body.length + 8);
  head.set(enc.encode(type), 4);
  return concat([head, body]);
}
const full = (type, version, flags, ...parts) => box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);
// an MPEG-4 descriptor, its length written in the four-byte form every reader accepts
const desc = (tag, ...parts) => { const body = concat(parts.flat()); return concat([u8(tag, 0x80, 0x80, 0x80, body.length & 127), body]); };
const MATRIX = u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);

function runs(durations) {
  const out = [];
  for (const d of durations) { const last = out[out.length - 1]; if (last && last[1] === d) last[0]++; else out.push([1, d]); }
  return out;
}

function trak({ id, handler, timescale, duration, movieDuration, width = 0, height = 0, entry, durations, sizes, offsets, keys }) {
  const video = handler === 'vide';
  const stbl = box('stbl',
    full('stsd', 0, 0, u32(1), entry),
    full('stts', 0, 0, u32(runs(durations).length), ...runs(durations).map(([c, d]) => u32(c, d))),
    keys ? full('stss', 0, 0, u32(keys.length), table(keys)) : [],
    full('stsc', 0, 0, u32(1, 1, 1, 1)),
    full('stsz', 0, 0, u32(0, sizes.length), table(sizes)),
    full('stco', 0, 0, u32(offsets.length), table(offsets)),
  );
  return box('trak',
    full('tkhd', 0, 3, u32(0, 0, id, 0, movieDuration, 0, 0), u16(0, 0, video ? 0 : 0x0100, 0), MATRIX, u32(width * 65536, height * 65536)),
    box('mdia',
      full('mdhd', 0, 0, u32(0, 0, timescale, duration), u16(0x55c4, 0)),
      full('hdlr', 0, 0, u32(0), enc.encode(handler), u32(0, 0, 0), enc.encode(video ? 'VideoHandler\0' : 'SoundHandler\0')),
      box('minf',
        video ? full('vmhd', 0, 1, u16(0, 0, 0, 0)) : full('smhd', 0, 0, u16(0, 0)),
        box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
        stbl,
      ),
    ),
  );
}

// video: { width, height, fps, samples: [{ data: Uint8Array, key }], avcC: Uint8Array }, or with
//   samples: [{ size, key }] and media: [Blob…] holding those samples' bytes one after the other
//   (a long render sets its video aside in Blobs as it goes, rather than keeping it all in memory)
// audio: { sampleRate, channels, samples: [{ data, duration }], asc: Uint8Array, bitrate } or null
export function muxMP4({ video, audio }) {
  const vScale = 90000;
  const vDur = Math.round(vScale / video.fps);
  const vSizes = video.samples.map((s) => s.size ?? s.data.length);
  const vKeys = [];
  video.samples.forEach((s, i) => { if (s.key) vKeys.push(i + 1); });
  const vTotal = vSizes.reduce((a, b) => a + b, 0);
  const aSizes = audio ? audio.samples.map((s) => s.data.length) : [];
  const aDurs = audio ? audio.samples.map((s) => s.duration) : [];
  const aTotal = aSizes.reduce((a, b) => a + b, 0);
  const movieMs = Math.round((video.samples.length * 1000) / video.fps);

  const avc1 = box('avc1',
    u8(0, 0, 0, 0, 0, 0), u16(1, 0, 0), u32(0, 0, 0), u16(video.width, video.height), u32(0x480000, 0x480000, 0), u16(1),
    concat([u8(10), enc.encode('Visulaserz'), new Uint8Array(21)]),                       // compressor name: 32 bytes, length first
    u16(0x18, 0xffff), box('avcC', video.avcC));
  const mp4a = audio && box('mp4a',
    u8(0, 0, 0, 0, 0, 0), u16(1), u32(0, 0), u16(audio.channels, 16, 0, 0), u32(audio.sampleRate * 65536),
    full('esds', 0, 0, desc(3, u16(1), u8(0),
      desc(4, u8(0x40, 0x15, 0, 0, 0), u32(audio.bitrate || 192000, audio.bitrate || 192000), desc(5, audio.asc)),
      desc(6, u8(2)))));

  const build = (base) => {
    let o = base;
    const vOffsets = vSizes.map((s) => { const at = o; o += s; return at; });
    const aOffsets = aSizes.map((s) => { const at = o; o += s; return at; });
    return box('moov',
      full('mvhd', 0, 0, u32(0, 0, 1000, movieMs, 0x10000), u16(0x0100, 0), u32(0, 0), MATRIX, u32(0, 0, 0, 0, 0, 0, audio ? 3 : 2)),
      trak({ id: 1, handler: 'vide', timescale: vScale, duration: vDur * vSizes.length, movieDuration: movieMs, width: video.width, height: video.height,
        entry: avc1, durations: vSizes.map(() => vDur), sizes: vSizes, offsets: vOffsets, keys: vKeys }),
      audio ? trak({ id: 2, handler: 'soun', timescale: audio.sampleRate, duration: aDurs.reduce((a, b) => a + b, 0), movieDuration: movieMs,
        entry: mp4a, durations: aDurs, sizes: aSizes, offsets: aOffsets }) : [],
    );
  };
  const ftyp = box('ftyp', enc.encode('isom'), u32(0x200), enc.encode('isomiso2avc1mp41'));
  const sized = build(0);                                     // the same tables with dummy offsets: only its length matters
  const data = ftyp.length + sized.length + 8;
  const moov = build(data);
  const mdatSize = 8 + vTotal + aTotal;
  if (mdatSize > 0xffffffff) throw new Error('This video is too long for one file. Render a shorter take.');
  const vMedia = video.media || video.samples.map((s) => s.data);
  return new Blob([ftyp, moov, u32(mdatSize), enc.encode('mdat'), ...vMedia, ...(audio ? audio.samples.map((s) => s.data) : [])], { type: 'video/mp4' });
}
