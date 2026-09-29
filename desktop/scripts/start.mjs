// Copyright (c) 2024-2026 nich (@nichxbt). Apache-2.0. @author nich (@nichxbt)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import electron from 'electron';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, XACTIONS_NODE_PATH: process.env.XACTIONS_NODE_PATH || process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
delete env.XACTIONS_DEV_URL;
const child = spawn(electron, [root], { cwd: root, env, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
