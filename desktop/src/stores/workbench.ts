// Copyright (c) 2024-2026 nich (@nichxbt). Apache-2.0. @author nich (@nichxbt)
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import catalog from '../data/catalog.json';
import type { ConnectionStatus, DraftRecord, RunRecord, SaveConfigInput, ToolDefinition, WorkbenchConfig } from '../../shared/contracts';
const defaultConfig: WorkbenchConfig = { projectPath: '', nodePath: 'node', chromePath: '', headless: true, sessionConfigured: false, csrfConfigured: false, aiConfigured: false, dataPath: '' };
export const useWorkbenchStore = defineStore('workbench', () => {
  const tools = ref<ToolDefinition[]>(catalog as ToolDefinition[]);
  const history = ref<RunRecord[]>([]);
  const drafts = ref<DraftRecord[]>([]);
  const connection = ref<ConnectionStatus>({ state: 'disconnected', toolCount: 0 });
  const config = ref<WorkbenchConfig>({ ...defaultConfig });
  const ready = ref(false), loading = ref(false), executing = ref(false), error = ref('');
  const desktopAvailable = Boolean(window.workbench);
  const favorites = ref<string[]>([]);
  try { const stored = JSON.parse(localStorage.getItem('xactions.favorites') || '[]'); if (Array.isArray(stored)) favorites.value = stored.filter(x => typeof x === 'string'); } catch { /* reset malformed local UI preferences */ }
  const connected = computed(() => connection.value.state === 'connected');
  const pendingCount = computed(() => drafts.value.filter(d => d.status === 'pending').length);
  let removeListener: (() => void) | undefined;
  let refreshPromise: Promise<void> | null = null;
  function api() { if (!window.workbench) throw new Error('请在 XActions 桌面应用中运行此功能。浏览器预览仅用于浏览功能目录。'); return window.workbench; }
  function message(e: unknown) { return e instanceof Error ? e.message : String(e); }
  async function refresh() {
    if (!window.workbench) return;
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const snapshot = await api().bootstrap();
      tools.value = snapshot.tools.length ? snapshot.tools : catalog as ToolDefinition[];
      history.value = snapshot.history;
      connection.value = snapshot.connection;
      config.value = snapshot.config;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function initialize() {
    if (ready.value || loading.value) return;
    loading.value = true;
    try {
      if (desktopAvailable) {
        removeListener = api().onChange(() => { void refresh().catch(e => { error.value = message(e); }); });
        await refresh();
        if (connection.value.state === 'disconnected') await connect();
      }
    } catch (e) { error.value = message(e); }
    finally { ready.value = true; loading.value = false; }
  }
  async function connect() {
    connection.value = { state: 'connecting', toolCount: 0 }; error.value = '';
    try { connection.value = await api().connect(); await refresh(); }
    catch (e) { connection.value = { state: 'error', toolCount: 0, error: message(e) }; error.value = message(e); }
    return connection.value;
  }
  async function disconnect() { connection.value = await api().disconnect(); await refresh(); }
  async function loadDrafts() { if (connected.value) drafts.value = await api().drafts(); }
  async function run(name: string, args: Record<string, unknown>) {
    if (executing.value) throw new Error('已有任务正在执行，请等待完成。');
    executing.value = true; error.value = '';
    try { const record = await api().runTool(name, args); await refresh(); if (record.status === 'held') await loadDrafts(); return record; }
    catch (e) { error.value = message(e); throw e; }
    finally { executing.value = false; }
  }
  async function approve(id: string) {
    if (executing.value) throw new Error('请等待当前任务完成。');
    executing.value = true;
    try { const result = await api().approveDraft(id); await refresh(); await loadDrafts(); return result; }
    finally { executing.value = false; }
  }
  async function discard(id: string) { await api().discardDraft(id); await loadDrafts(); await refresh(); }
  async function saveConfig(input: SaveConfigInput) { config.value = await api().saveConfig(input); await refresh(); return config.value; }
  function toggleFavorite(name: string) { favorites.value = favorites.value.includes(name) ? favorites.value.filter(n => n !== name) : [...favorites.value, name]; localStorage.setItem('xactions.favorites', JSON.stringify(favorites.value)); }
  async function exportRun(id: string, format: 'json' | 'csv') { return api().exportRun(id, format); }
  function dispose() { removeListener?.(); }
  return { tools, history, drafts, connection, config, ready, loading, executing, favorites, error, desktopAvailable, connected, pendingCount, initialize, refresh, connect, disconnect, loadDrafts, run, approve, discard, saveConfig, toggleFavorite, exportRun, dispose };
});
