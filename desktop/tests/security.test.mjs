// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'xactions-desktop-test-'));
const output = join(directory, 'security.mjs');
await build({ entryPoints: [new URL('../electron/security.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], outfile: output, platform: 'node', format: 'esm', bundle: true });
const { redact, collectSecrets, requireObject, validateSchema, validateConfig, externalUrl, parseToolResult, runToCsv } = await import(pathToFileURL(output).href);
after(() => rm(directory, { recursive: true, force: true }));

test('credential fields, nested login cookies and echoed secrets are redacted', () => {
  const input = { cookie: 'sample-cookie', nested: { apiKey: 'sample-key', text: 'value sample-key' }, count: 3 };
  const values = collectSecrets(input);
  assert.deepEqual(values, ['sample-cookie', 'sample-key']);
  assert.deepEqual(redact(input, values), { cookie: '[REDACTED]', nested: { apiKey: '[REDACTED]', text: 'value [REDACTED]' }, count: 3 });
  assert.equal(input.cookie, 'sample-cookie');
});

test('credential-looking log strings are scrubbed even without a known value', () => {
  const safe = redact('auth_token=abcdef; ct0=ghijk Authorization: Bearer my-secret-token');
  assert.ok(!safe.includes('abcdef'));
  assert.ok(!safe.includes('ghijk'));
  assert.ok(!safe.includes('my-secret-token'));
  assert.ok(!redact('{"authToken":"private-token"}').includes('private-token'));
  assert.ok(!redact('Cookie: auth_token=abc; unrelated=def').includes('def'));
});

test('redaction terminates for circular upstream values', () => {
  const value = {}; value.self = value;
  assert.ok(JSON.stringify(redact(value)).includes('Maximum depth'));
});

test('MCP held results remain held instead of success', () => {
  assert.equal(parseToolResult({ content: [{ type: 'text', text: '{"held":true,"draftId":"draft-1"}' }] }).status, 'held');
});

test('MCP content error fields are errors without isError', () => {
  const result = parseToolResult({ content: [{ type: 'text', text: '{"error":"login required"}' }] });
  assert.equal(result.status, 'error'); assert.equal(result.error, 'login required');
});

test('draft approval with an upstream error result remains an error', () => {
  const result = parseToolResult({ structuredContent: { approved: true, draft: { status: 'executed', result: { error: 'limit exceeded' } } } });
  assert.equal(result.status, 'error');
});

test('partial and total bulk failures retain results but are not reported as success', () => {
  const value = { succeeded: ['one'], failed: [{ username: 'two', error: 'rate limited' }] };
  const result = parseToolResult({ structuredContent: value });
  assert.equal(result.status, 'error');
  assert.deepEqual(result.value, value);
  assert.match(result.error, /1 项失败/);
  assert.equal(parseToolResult({ structuredContent: { failed: [] } }).status, 'success');
});

test('MCP transport errors and ordinary results are classified', () => {
  assert.equal(parseToolResult({ isError: true, content: [{ type: 'text', text: 'invalid request' }] }).error, 'invalid request');
  assert.deepEqual(parseToolResult({ content: [{ type: 'text', text: '[{"username":"example"}]' }] }).value, [{ username: 'example' }]);
});

test('input validation rejects required, numeric, enum and nested type errors', () => {
  const schema = { type: 'object', required: ['limit'], additionalProperties: false, properties: { limit: { type: 'integer', minimum: 1, maximum: 200 }, mode: { enum: ['latest', 'top'] }, values: { type: 'array', items: { type: 'number' } } } };
  assert.throws(() => validateSchema({}, schema), /limit/);
  assert.throws(() => validateSchema({ limit: 201 }, schema), /200/);
  assert.throws(() => validateSchema({ limit: 1.5 }, schema), /integer/);
  assert.throws(() => validateSchema({ limit: 2, mode: 'other' }, schema), /允许/);
  assert.throws(() => validateSchema({ limit: 2, values: ['1'] }, schema), /number/);
  assert.throws(() => validateSchema({ limit: 2, unknown: true }, schema), /未知/);
  assert.doesNotThrow(() => validateSchema({ limit: 50, mode: 'latest', values: [1, 2] }, schema));
});

test('arguments reject nonobjects, prototype keys and oversized messages', () => {
  assert.throws(() => requireObject([]));
  assert.throws(() => requireObject({ text: 'a'.repeat(1_000_001) }));
  assert.throws(() => validateSchema(JSON.parse('{"__proto__":{}}'), { type: 'object' }));
});

test('external navigation only accepts HTTP links without credentials', () => {
  assert.equal(externalUrl('https://x.com/example'), 'https://x.com/example');
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:password@example.com', 'not a url']) assert.throws(() => externalUrl(url));
});

test('settings validate tokens without ever embedding their value in errors', () => {
  const config = { projectPath: '/projects/xactions', nodePath: 'node', chromePath: '', headless: true };
  assert.equal(validateConfig(config).headless, true);
  assert.throws(() => validateConfig({ ...config, authToken: 'private\nvalue' }), error => !error.message.includes('private'));
  assert.throws(() => validateConfig({ ...config, headless: 'false' }));
});

test('CSV export preserves Unicode and escapes quotes, newlines and formulas', () => {
  const run = { id: 'one', toolName: 'x_search_tweets', status: 'success', args: {}, createdAt: '2026-09-30', result: [{ text: '=HYPERLINK("https://example.com")', name: '中文,名称', multiline: 'one\ntwo' }, { text: ' @SUM(1+1)', name: 'other' }] };
  const csv = runToCsv(run);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("' @SUM"));
  assert.ok(csv.includes('""https://example.com""'));
  assert.ok(csv.includes('"中文,名称"'));
  assert.ok(csv.includes('"one\ntwo"'));
});

test('CSV export handles scalar results and empty arrays', () => {
  const base = { id: 'one', toolName: 'x_list_drafts', status: 'success', args: {}, createdAt: '2026-09-30' };
  assert.ok(runToCsv({ ...base, result: [] }).includes('"result"'));
  assert.ok(runToCsv({ ...base, result: 'done' }).includes('"done"'));
});
