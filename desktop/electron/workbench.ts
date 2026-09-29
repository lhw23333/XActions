// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ConnectionStatus, DraftRecord, JsonSchema, RunRecord, SaveConfigInput, ToolDefinition, WorkbenchSnapshot } from '../shared/contracts';
import { collectSecrets, parseToolResult, redact, requireObject, requireString, validateConfig, validateSchema } from './security';
import { WorkbenchStore } from './store';

const CALL_TIMEOUT_MS = 180_000;
const CONNECT_TIMEOUT_MS = 30_000;
type Classifier = { groupOf: (name: string) => string; isWriteTool: (name: string) => boolean };

export class Workbench {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connection: ConnectionStatus = { state: 'disconnected', toolCount: 0 };
  private tools: ToolDefinition[] = [];
  private connecting: Promise<ConnectionStatus> | null = null;
  private active: { id: string; abort: AbortController } | null = null;
  private transientSecrets: string[] = [];
  private closing = false;
  private generation = 0;

  constructor(readonly store: WorkbenchStore, private readonly changed: () => void) {}

  snapshot(): WorkbenchSnapshot {
    return { tools: this.tools, history: this.store.history(), connection: { ...this.connection }, config: this.store.publicConfig() };
  }

  private safe<T>(value: T): T { return redact(value, [...this.store.secretValues(), ...this.transientSecrets, ...collectSecrets(value)]) as T; }
  private notify(): void { if (!this.closing) this.changed(); }

  private async closeTransport(client?: Client | null, transport?: StdioClientTransport | null): Promise<void> {
    // The Windows desktop owns this exact stdio process. Stop its descendants
    // too, so a Puppeteer browser cannot outlive cancellation or app shutdown.
    const pid = transport?.pid;
    if (process.platform === 'win32' && pid && Number.isInteger(pid) && pid > 0) {
      await new Promise<void>(resolve => execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()));
    }
    await client?.close().catch(() => undefined);
    await transport?.close().catch(() => undefined);
  }

  connect(): Promise<ConnectionStatus> {
    if (this.closing) return Promise.reject(new Error('应用正在退出'));
    if (this.connecting) return this.connecting;
    if (this.connection.state === 'connected') return Promise.resolve({ ...this.connection });
    this.connecting = this.doConnect().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private async doConnect(): Promise<ConnectionStatus> {
    const config = this.store.publicConfig();
    const entry = join(config.projectPath, 'src/mcp/server.js');
    this.connection = { state: 'connecting', toolCount: 0 };
    this.notify();
    const generation = ++this.generation;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let client: Client | undefined;
    let transport: StdioClientTransport | undefined;
    try {
      if (!existsSync(entry)) throw new Error(`未找到 XActions MCP 服务：${entry}`);
      const classifiers = await import(pathToFileURL(join(config.projectPath, 'src/mcp/tool-groups.js')).href) as Classifier;
      if (generation !== this.generation || this.closing) throw new Error('连接已取消');
      if (typeof classifiers.groupOf !== 'function' || typeof classifiers.isWriteTool !== 'function') throw new Error('XActions 工具分类模块无效');
      transport = new StdioClientTransport({ command: config.nodePath, args: [entry, '--require-approval'], cwd: config.projectPath, env: this.store.childEnv(), stderr: 'pipe' });
      client = new Client({ name: 'xactions-workbench', version: '0.1.0' }, { capabilities: {} });
      this.client = client;
      this.transport = transport;
      client.onclose = () => {
        if (generation !== this.generation) return;
        this.client = null;
        this.transport = null;
        this.active?.abort.abort(new Error('MCP 连接已关闭；执行结果可能未确认'));
        this.connection = { state: 'disconnected', toolCount: this.tools.length, error: 'MCP 服务已断开，请重新连接' };
        this.notify();
      };
      client.onerror = (error) => {
        if (generation !== this.generation) return;
        this.connection.error = this.safe(error.message);
        this.notify();
      };
      let stderrBuffer = '';
      transport.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() || '';
        for (const line of lines) if (line.trim()) console.info('[XActions MCP]', this.safe(line));
        if (stderrBuffer.length > 32_768) stderrBuffer = '';
      });
      const connectWork = async () => {
        await client!.connect(transport!);
        const discovered: ToolDefinition[] = [];
        let cursor: string | undefined;
        do {
          const page = await client!.listTools(cursor ? { cursor } : undefined);
          discovered.push(...page.tools.map(tool => ({ name: tool.name, description: tool.description || '', inputSchema: tool.inputSchema as JsonSchema, group: classifiers.groupOf(tool.name), isWrite: classifiers.isWriteTool(tool.name) })));
          cursor = page.nextCursor;
        } while (cursor);
        return discovered;
      };
      const discovered = await Promise.race([connectWork(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('MCP 连接超时（30 秒），请检查 Node、依赖和项目路径')), CONNECT_TIMEOUT_MS); })]);
      if (generation !== this.generation || this.closing) throw new Error('连接已取消');
      this.tools = discovered;
      this.connection = { state: 'connected', toolCount: discovered.length, version: client.getServerVersion()?.version };
    } catch (error) {
      if (generation === this.generation) {
        ++this.generation;
        this.client = null;
        this.transport = null;
        this.connection = { state: 'error', toolCount: this.tools.length, error: this.safe(error instanceof Error ? error.message : String(error)) };
      }
      await this.closeTransport(client, transport);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.notify();
    }
    return { ...this.connection };
  }

  async disconnect(): Promise<ConnectionStatus> {
    ++this.generation;
    this.active?.abort.abort(new Error('连接已手动断开；执行结果未确认，请检查平台状态'));
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    this.connection = { state: 'disconnected', toolCount: this.tools.length };
    this.notify();
    await this.closeTransport(client, transport);
    return { ...this.connection };
  }

  async runTool(nameValue: unknown, inputValue: unknown): Promise<RunRecord> {
    const name = requireString(nameValue, '工具名称', 200);
    const input = requireObject(inputValue);
    if (this.active) throw new Error('已有任务正在执行，请等待完成或断开连接');
    const client = this.client;
    if (!client || this.connection.state !== 'connected') throw new Error('请先连接 XActions 服务');
    const tool = this.tools.find(item => item.name === name);
    if (!tool) throw new Error('工具未由当前 MCP 服务提供');
    const args = { ...input };
    if (tool.inputSchema.properties?.headless && args.headless === undefined) args.headless = this.store.publicConfig().headless;
    validateSchema(args, tool.inputSchema);
    this.transientSecrets = collectSecrets(args);
    const createdAt = new Date().toISOString();
    const run: RunRecord = { id: randomUUID(), toolName: name, args: this.safe(args), status: 'running', createdAt };
    const abort = new AbortController();
    this.active = { id: run.id, abort };
    this.store.putRun(run);
    this.notify();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; abort.abort(new Error('执行超过 3 分钟；结果未确认，请先检查平台状态'));
      void this.disconnect();
    }, CALL_TIMEOUT_MS);
    try {
      const result = await client.callTool({ name, arguments: args }, undefined, { signal: abort.signal, timeout: CALL_TIMEOUT_MS + 1000 });
      const parsed = parseToolResult(result);
      run.status = parsed.status;
      run.result = this.safe(parsed.value);
      run.error = parsed.error ? this.safe(parsed.error) : undefined;
      if (abort.signal.aborted) { run.status = 'cancelled'; run.error = '连接中断；工具执行结果未确认'; }
    } catch (error) {
      run.status = abort.signal.aborted ? 'cancelled' : 'error';
      run.error = this.safe(timedOut ? '执行超过 3 分钟，已断开连接；请检查平台状态后再决定重试' : error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
      run.finishedAt = new Date().toISOString();
      run.durationMs = Date.now() - Date.parse(createdAt);
      this.store.putRun(this.safe(run));
      this.active = null;
      this.transientSecrets = [];
      this.notify();
    }
    return this.safe(run);
  }

  async drafts(): Promise<DraftRecord[]> {
    if (this.active) throw new Error('任务执行中，请稍后刷新待审批列表');
    const client = this.client;
    if (!client || this.connection.state !== 'connected') throw new Error('请先连接 XActions 服务');
    const abort = new AbortController();
    this.active = { id: 'draft-list', abort };
    try {
      const raw = await client.callTool({ name: 'x_list_drafts', arguments: { status: 'all' } }, undefined, { timeout: 15_000, signal: abort.signal });
      const result = parseToolResult(raw);
      if (result.status === 'error') throw new Error(result.error);
      const payload = requireObject(result.value);
      if (!Array.isArray(payload.drafts)) throw new Error('上游草稿返回格式无效');
      return this.safe(payload.drafts.map(value => {
        const draft = requireObject(value);
        return { id: requireString(draft.id, '草稿 ID', 200), tool: requireString(draft.tool, '工具名称', 200), args: requireObject(draft.args ?? {}), status: String(draft.status || 'pending'), createdAt: String(draft.createdAt || ''), ...(draft.error ? { error: String(draft.error) } : {}) };
      }));
    } finally {
      this.active = null;
    }
  }

  approveDraft(id: unknown): Promise<RunRecord> { return this.runTool('x_approve_draft', { id: requireString(id, '草稿 ID', 200) }); }

  async discardDraft(id: unknown): Promise<void> {
    const result = await this.runTool('x_discard_draft', { id: requireString(id, '草稿 ID', 200) });
    if (result.status !== 'success') throw new Error(result.error || '丢弃草稿失败');
  }

  async saveConfig(value: unknown) {
    if (this.active) throw new Error('任务执行中，暂不能修改连接配置');
    if (this.connecting) throw new Error('正在连接，请等待连接完成后保存配置');
    const input: SaveConfigInput = validateConfig(value);
    if (!existsSync(join(input.projectPath, 'src/mcp/server.js'))) throw new Error('项目路径内未找到 src/mcp/server.js');
    if (input.chromePath && !existsSync(input.chromePath)) throw new Error('Chrome / Edge 可执行文件不存在');
    await this.disconnect();
    const config = this.store.saveConfig(input);
    this.notify();
    await this.connect();
    return config;
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.disconnect();
    if (this.connecting) await this.connecting;
    // callTool settles on close; allow its history write to finish first.
    for (let index = 0; this.active && index < 40; index++) await new Promise(resolve => setTimeout(resolve, 50));
    this.store.close();
  }
}
