// One command to start everything: central API (:8000) + user site (:5173) + sticker app (:5174).
// No Java or Firebase needed any more. Python 3.11+ with `pip install -r backend/requirements.txt` is required.
import { spawn, spawnSync } from 'node:child_process';

const py = process.platform === 'win32' ? 'python' : 'python3';
const probe = spawnSync(py, ['-c', 'import fastapi, uvicorn, segno, reportlab, jwt'], {
  encoding: 'utf8',
});
if (probe.status !== 0) {
  console.log('Installing backend dependencies (one time)...');
  const r = spawnSync(py, ['-m', 'pip', 'install', '-r', 'backend/requirements.txt'], {
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('Could not install backend/requirements.txt. Run it manually, then try again.');
    process.exit(1);
  }
}

const api = `${py} -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`;
const cmd = `npx concurrently -k -n api,site,sticker -c blue,green,magenta "${api}" "npm:dev -w 2-user-report-site" "npm:dev -w 1-sticker-app"`;
const child = spawn(cmd, { stdio: 'inherit', shell: true });
child.on('exit', (c) => process.exit(c ?? 0));
