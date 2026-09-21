// Installs (or updates) yt-dlp into a project-local virtualenv at ./.venv
// so nothing is installed globally. Run with:  npm run setup
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENV = path.join(ROOT, '.venv');
const isWin = process.platform === 'win32';
const venvPython = path.join(VENV, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
  return r.status === 0;
}

function findPython() {
  for (const cmd of isWin ? ['python', 'py'] : ['python3', 'python']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return null;
}

if (!fs.existsSync(venvPython)) {
  const py = findPython();
  if (!py) {
    console.error('Python 3 was not found. Install it from https://www.python.org/ and run "npm run setup" again.');
    process.exit(1);
  }
  if (!run(py, ['-m', 'venv', VENV])) process.exit(1);
}

// "[default]" pulls in yt-dlp-ejs, the component yt-dlp uses to solve YouTube's JS challenges.
if (!run(venvPython, ['-m', 'pip', 'install', '--upgrade', '--quiet', 'yt-dlp[default]'])) process.exit(1);
run(venvPython, ['-m', 'yt_dlp', '--version']);

const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
if (ff.status !== 0) {
  console.warn('\nffmpeg was not found on PATH. YouTube audio needs it for MP3 conversion: https://ffmpeg.org/download.html');
}
console.log('\nyt-dlp is ready. Start the app with:  npm start');
