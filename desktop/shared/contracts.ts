// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  group: string;
  isWrite: boolean;
}
export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  version?: string;
  toolCount: number;
  error?: string;
}
export interface WorkbenchConfig {
  projectPath: string;
  nodePath: string;
  chromePath: string;
  headless: boolean;
  sessionConfigured: boolean;
  csrfConfigured: boolean;
  aiConfigured: boolean;
  dataPath: string;
}
export interface SaveConfigInput {
  projectPath: string;
  nodePath: string;
  chromePath: string;
  headless: boolean;
  authToken?: string;
  csrfToken?: string;
  openrouterKey?: string;
  clearSecrets?: boolean;
}
export type RunStatus = 'running' | 'success' | 'error' | 'held' | 'cancelled';
export interface RunRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: RunStatus;
  createdAt: string;
  finishedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
}
export interface DraftRecord {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: string;
  createdAt: string;
  error?: string;
}
export interface WorkbenchSnapshot {
  tools: ToolDefinition[];
  history: RunRecord[];
  connection: ConnectionStatus;
  config: WorkbenchConfig;
}
export interface WorkbenchAPI {
  bootstrap(): Promise<WorkbenchSnapshot>;
  connect(): Promise<ConnectionStatus>;
  disconnect(): Promise<ConnectionStatus>;
  runTool(name: string, args: Record<string, unknown>): Promise<RunRecord>;
  history(): Promise<RunRecord[]>;
  drafts(): Promise<DraftRecord[]>;
  approveDraft(id: string): Promise<RunRecord>;
  discardDraft(id: string): Promise<void>;
  saveConfig(input: SaveConfigInput): Promise<WorkbenchConfig>;
  exportRun(id: string, format: 'json' | 'csv'): Promise<{ canceled: boolean; filePath?: string }>;
  openExternal(url: string): Promise<void>;
  onChange(callback: () => void): () => void;
}
