// Builds the portable Windows edition: a folder (and a zip of it) that runs on a PC with nothing
// installed. `npm run portable`, on Windows.
//
//   Visulaserz/
//     Visulaserz.exe      a small launcher: starts the server, opens the browser, keeps yt-dlp fresh
//     OKU-BENI.txt        how to use it, in Turkish
//     app/                server.js, lib/, public/ and package.json, exactly as in this project
//     app/bin/            node.exe (this machine's own), yt-dlp.exe, ffmpeg.exe and ffprobe.exe
//
// node.exe is copied from the Node running this script, and ffmpeg / ffprobe from the PATH. yt-dlp.exe
// is the official standalone build from the yt-dlp releases on GitHub, fetched once into
// .build-cache/. The launcher is compiled with the C# compiler that ships with Windows' .NET
// Framework, so building needs nothing extra either.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'Visulaserz');
const APP = path.join(OUT, 'app');
const BIN = path.join(APP, 'bin');
const CACHE = path.join(ROOT, '.build-cache');
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

if (process.platform !== 'win32') {
  console.error('The portable edition is built on Windows (it bundles Windows binaries).');
  process.exit(1);
}

const step = (msg) => console.log(`\n> ${msg}`);
const where = (exe) => {
  const r = spawnSync('where', [exe], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean) : null;
};

// ── 1. a clean folder with the app in it ───────────────────────────────────────────────
step('Copying the app');
await fsp.rm(OUT, { recursive: true, force: true });
await fsp.mkdir(BIN, { recursive: true });
for (const item of ['server.js', 'package.json', 'lib', 'public']) {
  await fsp.cp(path.join(ROOT, item), path.join(APP, item), { recursive: true });
}

// ── 2. the tools ───────────────────────────────────────────────────────────────────────
step('Bundling node.exe, ffmpeg and ffprobe');
await fsp.copyFile(process.execPath, path.join(BIN, 'node.exe'));
for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) {
  const found = where(exe);
  if (!found) {
    console.error(`${exe} was not found on PATH. Install ffmpeg (winget install Gyan.FFmpeg) and run this again.`);
    process.exit(1);
  }
  await fsp.copyFile(found, path.join(BIN, exe));
  console.log(`  ${exe} from ${found}`);
}

step('Bundling yt-dlp.exe');
const cachedYtdlp = path.join(CACHE, 'yt-dlp.exe');
if (!fs.existsSync(cachedYtdlp)) {
  console.log(`  fetching ${YTDLP_URL}`);
  const res = await fetch(YTDLP_URL);
  if (!res.ok) { console.error(`  download failed: HTTP ${res.status}`); process.exit(1); }
  await fsp.mkdir(CACHE, { recursive: true });
  await fsp.writeFile(cachedYtdlp, Buffer.from(await res.arrayBuffer()));
}
await fsp.copyFile(cachedYtdlp, path.join(BIN, 'yt-dlp.exe'));
// the cached copy may be old: bring the bundled one up to date before it ships
spawnSync(path.join(BIN, 'yt-dlp.exe'), ['-U'], { stdio: 'inherit', timeout: 60000 });
const version = spawnSync(path.join(BIN, 'yt-dlp.exe'), ['--version'], { encoding: 'utf8' }).stdout.trim();
console.log(`  yt-dlp ${version}`);

// ── 3. the icon: the favicon's three beams, drawn here so no image tools are needed ────────
step('Drawing the icon');
// distance from p to the segment ab
const seg = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// the picture in the favicon's own 64x64 units: [r, g, b, alpha] at a point
function iconAt(x, y) {
  // rounded square
  const qx = Math.max(Math.abs(x - 32) - 20, 0), qy = Math.max(Math.abs(y - 32) - 20, 0);
  if (Math.hypot(qx, qy) > 12) return [0, 0, 0, 0];
  let c = hex('#0b0b12');
  const beams = [[14, 14, '#ff4fd8'], [32, 10, '#8fe9ff'], [50, 14, '#c8ff3d']];
  for (const [ex, ey, col] of beams) if (seg(x, y, 32, 54, ex, ey) <= 1.5) c = hex(col);
  if (Math.hypot(x - 32, y - 54) <= 4) c = [255, 255, 255];
  return [...c, 255];
}
// one icon image as a 32-bit BMP (bottom-up BGRA plus an empty AND mask), 4x4 supersampled
function iconImage(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const [cr, cg, cb, ca] = iconAt(((col + (sx + 0.5) / 4) / size) * 64, ((row + (sy + 0.5) / 4) / size) * 64);
        r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
      }
      const o = ((size - 1 - row) * size + col) * 4;
      px[o] = a ? Math.round(b / a) : 0; px[o + 1] = a ? Math.round(g / a) : 0; px[o + 2] = a ? Math.round(r / a) : 0;
      px[o + 3] = Math.round(a / 16);
    }
  }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  return Buffer.concat([header, px, mask]);
}
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map(iconImage);
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  dir[e] = s === 256 ? 0 : s; dir[e + 1] = s === 256 ? 0 : s;
  dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(images[i].length, e + 8); dir.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
const icoPath = path.join(CACHE, 'visulaserz.ico');
await fsp.mkdir(CACHE, { recursive: true });
await fsp.writeFile(icoPath, Buffer.concat([dir, ...images]));

// ── 4. the launcher ────────────────────────────────────────────────────────────────────
step('Compiling Visulaserz.exe');
const LAUNCHER = String.raw`
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

// Starts the bundled server and opens the app in the browser. The window stays open while the app
// runs; closing it stops the app.
class Launcher {
  const string Url = "http://localhost:4777";

  static bool Answers() {
    try {
      var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:4777/api/health");
      req.Timeout = 800;
      using (req.GetResponse()) { }
      return true;
    } catch { return false; }
  }

  static void Open() { try { Process.Start(Url); } catch { } }

  static int Main() {
    Console.Title = "Visulaserz";
    string root = AppDomain.CurrentDomain.BaseDirectory;
    string app = Path.Combine(root, "app");
    string bin = Path.Combine(app, "bin");
    string node = Path.Combine(bin, "node.exe");
    if (!File.Exists(node)) {
      Console.WriteLine("Uygulama dosyalari bulunamadi. Zip'in tamamini bir klasore cikarip oradan ac.");
      Console.ReadKey();
      return 1;
    }
    if (Answers()) {                       // already running: just show it
      Open();
      return 0;
    }
    Console.WriteLine("  VISULASERZ");
    Console.WriteLine("  Bu pencere acik kaldikca uygulama calisir. Kapatinca durur.\n");

    // YouTube changes often; a fresh yt-dlp keeps downloads working
    Console.WriteLine("  yt-dlp guncelleniyor...");
    try {
      var up = new ProcessStartInfo(Path.Combine(bin, "yt-dlp.exe"), "-U");
      up.UseShellExecute = false; up.CreateNoWindow = true;
      up.RedirectStandardOutput = true; up.RedirectStandardError = true;
      var u = Process.Start(up);
      if (!u.WaitForExit(20000)) { try { u.Kill(); } catch { } }
    } catch { }

    var psi = new ProcessStartInfo(node, "\"" + Path.Combine(app, "server.js") + "\"");
    psi.UseShellExecute = false;
    psi.WorkingDirectory = app;
    psi.EnvironmentVariables["PATH"] = bin + ";" + Environment.GetEnvironmentVariable("PATH");
    var server = Process.Start(psi);

    for (int i = 0; i < 80 && !server.HasExited; i++) {
      if (Answers()) { Open(); break; }
      Thread.Sleep(250);
    }
    server.WaitForExit();
    if (server.ExitCode != 0) {
      Console.WriteLine("\n  Uygulama durdu (kod " + server.ExitCode + "). Kapatmak icin bir tusa bas.");
      Console.ReadKey();
    }
    return server.ExitCode;
  }
}
`;
const csPath = path.join(CACHE, 'Launcher.cs');
await fsp.writeFile(csPath, LAUNCHER);
const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const built = spawnSync(csc, ['/nologo', '/target:exe', '/optimize+', `/win32icon:${icoPath}`, `/out:${path.join(OUT, 'Visulaserz.exe')}`, csPath], { stdio: 'inherit' });
if (built.status !== 0) { console.error('The launcher did not compile.'); process.exit(1); }

// ── 5. instructions, and the zip ───────────────────────────────────────────────────────
await fsp.writeFile(path.join(OUT, 'OKU-BENI.txt'), [
  'VISULASERZ',
  '',
  'Hicbir sey kurmana gerek yok. Klasoru istedigin yere koy ve Visulaserz.exe\'ye cift tikla.',
  'Uygulama tarayicida acilir. Siyah pencere acik kaldikca calisir; kapatinca durur.',
  '',
  'DJ modu: ustteki DJ dugmesi ya da D tusu. Sarkilari listedeki A / B dugmeleriyle destelere yukle.',
  'Butun kisayollar icin uygulamada ? tusuna bas.',
  '',
  'Windows "bilgisayarinizi korudu" derse: "Ek bilgi" > "Yine de calistir".',
  'Indirdigin sarkilar app\\cache klasorunde durur.',
  'YouTube icin internet gerekir; yt-dlp her acilista kendini gunceller.',
  '',
].join('\r\n'));

step('Zipping');
const zip = path.join(DIST, 'Visulaserz-portable.zip');
await fsp.rm(zip, { force: true });
const zipped = spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: 'inherit' });
if (zipped.status !== 0) { console.error('Zipping failed.'); process.exit(1); }
const mb = (fs.statSync(zip).size / 1048576).toFixed(0);
console.log(`\nDone: ${zip} (${mb} MB)`);
