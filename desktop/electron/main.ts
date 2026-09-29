// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorkbenchStore } from './store';
import { Workbench } from './workbench';
import { externalUrl, redact, requireString, runToCsv } from './security';

let window: BrowserWindow | null = null;
let backend: Workbench | null = null;
let quitting = false;
const devUrl = process.env.XACTIONS_DEV_URL;
const indexPath = resolve(__dirname, '../dist/index.html');
const productionUrl = pathToFileURL(indexPath).href;

function assertSender(event: IpcMainInvokeEvent): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许的 IPC 来源');
  const senderUrl = event.senderFrame.url;
  const allowed = devUrl ? new URL(senderUrl).origin === new URL(devUrl).origin : senderUrl.split('#')[0] === productionUrl;
  if (!allowed) throw new Error('不允许的页面来源');
}

function registerHandlers(service: Workbench): void {
  const handle = (channel: string, callback: (...args: unknown[]) => unknown) => ipcMain.handle(`workbench:${channel}`, async (event, ...args) => {
    assertSender(event);
    try { return await callback(...args); }
    catch (error) { throw new Error(String(redact(error instanceof Error ? error.message : String(error), service.store.secretValues()))); }
  });
  handle('bootstrap', () => service.snapshot());
  handle('connect', () => service.connect());
  handle('disconnect', () => service.disconnect());
  handle('runTool', (name, args) => service.runTool(name, args));
  handle('history', () => service.store.history());
  handle('drafts', () => service.drafts());
  handle('approveDraft', id => service.approveDraft(id));
  handle('discardDraft', id => service.discardDraft(id));
  handle('saveConfig', input => service.saveConfig(input));
  handle('openExternal', async url => { await shell.openExternal(externalUrl(url)); });
  handle('exportRun', async (id, format) => {
    const run = service.store.getRun(requireString(id, '运行 ID', 200));
    if (!run) throw new Error('运行记录不存在');
    if (format !== 'json' && format !== 'csv') throw new Error('导出格式必须为 JSON 或 CSV');
    const result = await dialog.showSaveDialog(window!, { title: '导出运行记录', defaultPath: `xactions-${run.toolName}-${run.id.slice(0, 8)}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    await writeFile(result.filePath, format === 'json' ? JSON.stringify(run, null, 2) + '\n' : runToCsv(run), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 1050, minHeight: 720, title: 'XActions Workbench', backgroundColor: '#f5f7fb', show: false, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = devUrl ? new URL(url).origin === new URL(devUrl).origin : url.split('#')[0] === productionUrl;
    if (!allowed) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = null; });
  if (devUrl) {
    const parsed = new URL(devUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('开发地址必须为本机 HTTP 服务');
    await window.loadURL(devUrl);
  } else await window.loadFile(indexPath);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    app.setAppUserModelId('app.xactions.workbench');
    const store = new WorkbenchStore(join(app.getPath('userData'), 'workbench'), resolve(__dirname, '../..'));
    backend = new Workbench(store, () => { if (window && !window.isDestroyed()) window.webContents.send('workbench:changed'); });
    registerHandlers(backend);
    await createWindow();
  }).catch(error => { dialog.showErrorBox('XActions Workbench 启动失败', String(error instanceof Error ? error.message : error)); app.quit(); });
  app.on('activate', () => { if (!window && backend) void createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void (backend?.close() ?? Promise.resolve()).finally(() => app.quit());
  });
}
