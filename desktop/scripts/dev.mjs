// Copyright (c) 2024-2026 nich (@nichxbt). Apache-2.0. @author nich (@nichxbt)
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import electron from 'electron';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root });
await server.listen();
server.printUrls();
const env = { ...process.env, XACTIONS_DEV_URL: 'http://127.0.0.1:5180', XACTIONS_NODE_PATH: process.env.XACTIONS_NODE_PATH || process.execPath };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [root], { cwd: root, env, stdio: 'inherit' });
let closing = false;
async function close(code = 0) { if (closing) return; closing = true; child.kill(); await server.close(); process.exit(code); }
child.on('error', error => { console.error(error); void close(1); });
child.on('exit', code => void close(code ?? 0));
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
