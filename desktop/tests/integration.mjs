// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = resolve(desktop, '..');
const tempParent = await realpath(tmpdir());
const temporary = await mkdtemp(join(tempParent, 'xactions-desktop-integration-'));
const buildParent = join(desktop, 'node_modules', '.cache');
await mkdir(buildParent, { recursive: true });
const buildDirectory = await mkdtemp(join(buildParent, 'xactions-desktop-integration-'));
const env = { ...process.env, XACTIONS_INTEGRATION_DIR: temporary, XACTIONS_INTEGRATION_PROJECT: project,
  XACTIONS_HOME: join(temporary, 'xactions'), XACTIONS_NODE_PATH: process.env.XACTIONS_NODE_PATH || process.execPath,
  NODE_PATH: join(desktop, 'node_modules'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
await mkdir(join(temporary, 'electron-user-data'));
let child;
let timer;
async function terminateOwnedChild() {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') await new Promise(resolveKill => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolveKill()));
  else child.kill('SIGKILL');
}
try {
  // Electron does not reliably honor NODE_PATH for the entry module. Keeping
  // only the compiled entry beneath desktop/node_modules resolves real native
  // dependencies without copying, symlinking, or rebuilding their ABI.
  const bundle = join(buildDirectory, 'integration.cjs');
  await build({ entryPoints: [join(desktop, 'tests/integration-main.ts')], outfile: bundle, platform: 'node', format: 'cjs', target: 'node24', bundle: true, packages: 'external' });
  const require = createRequire(import.meta.url);
  const electron = require('electron');
  child = spawn(electron, [bundle], { cwd: desktop, env, stdio: 'inherit', windowsHide: true });
  const exitCode = await new Promise((resolveExit, reject) => {
    timer = setTimeout(() => { void terminateOwnedChild().finally(() => reject(new Error('Integration test exceeded 90 seconds'))); }, 90_000);
    child.once('error', reject);
    child.once('close', code => resolveExit(code));
  });
  if (exitCode !== 0) throw new Error(`Electron integration exited ${exitCode}`);
  console.info(await readFile(join(temporary, 'passed.json'), 'utf8'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await terminateOwnedChild();
  // Delete only the unique directory created above; never an existing profile.
  const target = await realpath(temporary);
  if (dirname(target).toLowerCase() !== tempParent.toLowerCase() || !basename(target).startsWith('xactions-desktop-integration-')) throw new Error('Refusing cleanup outside the owned integration directory');
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const buildTarget = await realpath(buildDirectory);
  const expectedParent = await realpath(buildParent);
  if (dirname(buildTarget).toLowerCase() !== expectedParent.toLowerCase() || !basename(buildTarget).startsWith('xactions-desktop-integration-')) throw new Error('Refusing cleanup outside the owned integration build directory');
  await rm(buildTarget, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
