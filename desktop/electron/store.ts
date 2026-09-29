// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import Database from 'better-sqlite3';
import { safeStorage } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RunRecord, SaveConfigInput, WorkbenchConfig } from '../shared/contracts';
import { redact } from './security';

type Secrets = { authToken?: string; csrfToken?: string; openrouterKey?: string };
type StoredConfig = Pick<SaveConfigInput, 'projectPath' | 'nodePath' | 'chromePath' | 'headless'>;

export function detectChrome(): string {
  const paths = process.platform === 'win32' ? [
    join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ] : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return paths.find(path => existsSync(path)) || '';
}

export class WorkbenchStore {
  private readonly db: Database.Database;
  private config: StoredConfig;
  private secrets: Secrets;

  constructor(readonly dataPath: string, defaultProjectPath: string) {
    mkdirSync(dataPath, { recursive: true });
    this.db = new Database(join(dataPath, 'workbench.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);');
    const defaults: StoredConfig = { projectPath: defaultProjectPath, nodePath: process.env.XACTIONS_NODE_PATH || 'node', chromePath: detectChrome(), headless: true };
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('config') as { value: string } | undefined;
    this.config = row ? { ...defaults, ...JSON.parse(row.value) } : defaults;
    if (!row) this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('config', JSON.stringify(this.config));
    this.secrets = {};
    const secretRow = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('secrets') as { value: string } | undefined;
    if (secretRow) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('操作系统凭据加密不可用，无法读取保存的凭据');
      this.secrets = JSON.parse(safeStorage.decryptString(Buffer.from(secretRow.value, 'base64')));
    }
    for (const run of this.history()) {
      if (run.status === 'running') this.putRun({ ...run, status: 'cancelled', finishedAt: new Date().toISOString(), error: '应用已重启；此前执行结果未确认，请先检查实际状态再重试' });
    }
  }

  publicConfig(): WorkbenchConfig {
    return { ...this.config, dataPath: this.dataPath, sessionConfigured: Boolean(this.secrets.authToken), csrfConfigured: Boolean(this.secrets.csrfToken), aiConfigured: Boolean(this.secrets.openrouterKey) };
  }

  secretValues(): string[] { return Object.values(this.secrets).filter((value): value is string => Boolean(value)); }

  childEnv(): Record<string, string> {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    Object.assign(env, {
      XACTIONS_MODE: 'local', MCP_TRANSPORT: 'stdio', XACTIONS_MCP_REQUIRE_APPROVAL: '1',
      XACTIONS_MCP_TOOLS: '', XACTIONS_MCP_EXCLUDE: '',
      XACTIONS_SESSION_COOKIE: this.secrets.authToken || '', XACTIONS_CSRF_TOKEN: this.secrets.csrfToken || '',
      OPENROUTER_API_KEY: this.secrets.openrouterKey || '',
    });
    if (this.config.chromePath) env.PUPPETEER_EXECUTABLE_PATH = this.config.chromePath;
    return env;
  }

  saveConfig(input: SaveConfigInput): WorkbenchConfig {
    const config: StoredConfig = { projectPath: resolve(input.projectPath), nodePath: input.nodePath.trim(), chromePath: input.chromePath.trim(), headless: input.headless };
    const secrets: Secrets = input.clearSecrets ? {} : { ...this.secrets };
    for (const key of ['authToken', 'csrfToken', 'openrouterKey'] as const) if (input[key]?.trim()) secrets[key] = input[key]!.trim();
    const hasSecrets = Object.values(secrets).some(Boolean);
    if (hasSecrets && (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'))) throw new Error('操作系统安全凭据存储不可用，未保存凭据');
    const encrypted = hasSecrets ? safeStorage.encryptString(JSON.stringify(secrets)).toString('base64') : null;
    this.db.transaction(() => {
      this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('config', JSON.stringify(config));
      if (encrypted) this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('secrets', encrypted);
      else this.db.prepare('DELETE FROM settings WHERE key = ?').run('secrets');
    })();
    this.config = config;
    this.secrets = secrets;
    return this.publicConfig();
  }

  putRun(run: RunRecord): void {
    const safe = redact(run, this.secretValues());
    this.db.prepare('INSERT OR REPLACE INTO runs (id, created_at, data) VALUES (?, ?, ?)').run(run.id, run.createdAt, JSON.stringify(safe));
  }

  history(): RunRecord[] {
    return (this.db.prepare('SELECT data FROM runs ORDER BY created_at DESC LIMIT 250').all() as { data: string }[]).map(row => redact(JSON.parse(row.data), this.secretValues()) as RunRecord);
  }

  getRun(id: string): RunRecord | undefined {
    const row = this.db.prepare('SELECT data FROM runs WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? redact(JSON.parse(row.data), this.secretValues()) as RunRecord : undefined;
  }

  close(): void { this.db.close(); }
}
