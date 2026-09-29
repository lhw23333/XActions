// Copyright (c) 2024-2026 nich (@nichxbt). Apache-2.0. @author nich (@nichxbt)
import { build } from 'esbuild';
await build({ entryPoints: ['electron/main.ts', 'electron/preload.ts'], outdir: 'dist-electron', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node24', packages: 'external', sourcemap: true });
console.log('Electron main and preload built.');
