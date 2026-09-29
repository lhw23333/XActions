// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import type { JsonSchema, RunRecord, SaveConfigInput } from '../shared/contracts';

const SECRET_KEY = /(?:cookie|password|secret|authorization|credential|api[_-]?key|token|^ct0$)/i;
export const REDACTED = '[REDACTED]';

export function redact(value: unknown, secrets: string[] = [], depth = 0): unknown {
  if (depth > 30) return '[Maximum depth]';
  if (typeof value === 'string') {
    let text = value;
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
      text = text.split(secret).join(REDACTED);
    }
    return text
      .replace(/(\b(?:set-cookie|cookie)\s*:\s*)[^\r\n]+/gi, `$1${REDACTED}`)
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
      .replace(/((?:auth[_-]?token|csrf[_-]?token|ct0|cookie|api[_-]?key|openrouter[_-]?key|password|session[_-]?cookie)["']?\s*[=:]\s*["']?)[^\s;,"'}]+/gi, `$1${REDACTED}`);
  }
  if (Array.isArray(value)) return value.map(item => redact(item, secrets, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? REDACTED : redact(item, secrets, depth + 1)]));
  }
  return value;
}

export function collectSecrets(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== 'object' || depth > 30) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    if (SECRET_KEY.test(key) && typeof item === 'string') return [item];
    return collectSecrets(item, depth + 1);
  });
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数必须为 JSON 对象');
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('不支持的参数对象');
  if (JSON.stringify(value).length > 1_000_000) throw new Error('参数超过 1 MB 限制');
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, label: string, maxLength = 4096): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || value.includes('\0')) throw new Error(`${label} 无效`);
  return value;
}

export function validateSchema(value: unknown, schema: JsonSchema, label = '参数', depth = 0): void {
  if (depth > 30) throw new Error('参数嵌套过深');
  if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) throw new Error(`${label} 不在允许值中`);
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const matches = (type: string) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === type;
  if (types.length && !types.some(matches)) throw new Error(`${label} 类型应为 ${types.join(' / ')}`);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} 必须为有限数字`);
    if (schema.minimum !== undefined && value < schema.minimum) throw new Error(`${label} 不能小于 ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) throw new Error(`${label} 不能大于 ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, index) => validateSchema(item, schema.items!, `${label}[${index}]`, depth + 1));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = requireObject(value);
    for (const key of schema.required || []) if (!(key in object) || object[key] === undefined) throw new Error(`缺少必填参数 ${key}`);
    for (const [key, item] of Object.entries(object)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('参数包含不允许的属性');
      const child = schema.properties?.[key];
      if (child) validateSchema(item, child, `${label}.${key}`, depth + 1);
      else if (schema.additionalProperties === false) throw new Error(`未知参数 ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validateSchema(item, schema.additionalProperties, `${label}.${key}`, depth + 1);
    }
  }
}

export function validateConfig(value: unknown): SaveConfigInput {
  const object = requireObject(value);
  requireString(object.projectPath, '项目路径');
  requireString(object.nodePath, 'Node 路径');
  if (typeof object.chromePath !== 'string' || object.chromePath.length > 4096 || object.chromePath.includes('\0')) throw new Error('Chrome 路径无效');
  if (typeof object.headless !== 'boolean') throw new Error('headless 必须为布尔值');
  for (const key of ['authToken', 'csrfToken', 'openrouterKey']) if (object[key] !== undefined && (typeof object[key] !== 'string' || (object[key] as string).length > 16_384 || /[\r\n\0]/.test(object[key] as string))) throw new Error(`${key} 无效`);
  if (object.clearSecrets !== undefined && typeof object.clearSecrets !== 'boolean') throw new Error('clearSecrets 必须为布尔值');
  return object as unknown as SaveConfigInput;
}

export function externalUrl(value: unknown): string {
  const url = new URL(requireString(value, '链接', 8192));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('只允许不含凭证的 HTTP / HTTPS 链接');
  return url.href;
}

export function parseToolResult(input: unknown): { value: unknown; status: 'success' | 'error' | 'held'; error?: string } {
  const result = requireObject(input);
  const blocks = Array.isArray(result.content) ? result.content : [];
  const values = blocks.filter(item => item?.type === 'text').map(item => {
    try { return JSON.parse(item.text); } catch { return String(item.text); }
  });
  const value = result.structuredContent ?? (values.length === 1 ? values[0] : values.length ? values : result.content ?? null);
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const nested = record.draft && typeof record.draft === 'object' ? record.draft as Record<string, unknown> : {};
  const nestedResult = nested.result && typeof nested.result === 'object' ? nested.result as Record<string, unknown> : {};
  const error = record.error || nested.error || nestedResult.error;
  if (result.isError || error || record.success === false || nested.status === 'failed' || nestedResult.success === false) return { value, status: 'error', error: typeof error === 'string' ? error : error ? JSON.stringify(error) : typeof value === 'string' ? value : '上游工具执行失败' };
  const failures = Array.isArray(record.failed) ? record.failed : Array.isArray(nestedResult.failed) ? nestedResult.failed : [];
  if (failures.length) return { value, status: 'error', error: `批量执行中 ${failures.length} 项失败；请查看保留的完整结果，勿直接重复全部操作` };
  return { value, status: record.held === true ? 'held' : 'success' };
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function runToCsv(run: RunRecord): string {
  const result = run.result;
  const rows = Array.isArray(result) ? result : result && typeof result === 'object' ? Object.values(result).find(Array.isArray) : undefined;
  if (Array.isArray(rows) && rows.length && rows.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    return '\uFEFF' + [keys.map(csvCell).join(','), ...rows.map(row => keys.map(key => csvCell(row[key])).join(','))].join('\r\n');
  }
  const keys = ['id', 'toolName', 'status', 'createdAt', 'finishedAt', 'durationMs', 'args', 'result', 'error'] as const;
  return '\uFEFF' + [keys.map(csvCell).join(','), keys.map(key => csvCell(run[key])).join(',')].join('\r\n');
}
