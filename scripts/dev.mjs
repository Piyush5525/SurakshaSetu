// One command to start everything: Firebase emulators + sticker app (:5174) + user site (:5173).
// Finds Java 21+ by itself (PATH, JAVA_HOME or ~/.jdk/jdk-*), because the emulators need it.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

function javaMajor(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  const m = /version "(\d+)(?:\.(\d+))?/.exec(`${r.stderr}${r.stdout}`);
  if (!m) return 0;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]);
}

const exe = process.platform === 'win32' ? 'java.exe' : 'java';
const candidates = [];
if (process.env.JAVA_HOME) candidates.push(join(process.env.JAVA_HOME, 'bin'));
const jdkRoot = join(homedir(), '.jdk');
if (existsSync(jdkRoot)) {
  for (const d of readdirSync(jdkRoot)) candidates.push(join(jdkRoot, d, 'bin'));
}
let env = { ...process.env };
if (javaMajor('java') < 21) {
  const dir = candidates.find((c) => existsSync(join(c, exe)) && javaMajor(join(c, exe)) >= 21);
  if (!dir) {
    console.error(
      'Java 21+ is required by the Firebase emulators (found: ' +
        javaMajor('java') +
        ').\nInstall a free JDK 21 (https://adoptium.net) or set JAVA_HOME, then run again.',
    );
    process.exit(1);
  }
  env = { ...env, PATH: `${dir}${delimiter}${env.PATH}`, JAVA_HOME: join(dir, '..') };
  console.log(`Using Java from ${dir}`);
}

const cmd = 'npx concurrently -k -n emu,site,sticker -c blue,green,magenta';
const args = ['"npm:emulators"', '"npm:dev -w 2-user-report-site"', '"npm:dev -w 1-sticker-app"'];
const child = spawn(`${cmd} ${args.join(' ')}`, { stdio: 'inherit', shell: true, env });
child.on('exit', (c) => process.exit(c ?? 0));
