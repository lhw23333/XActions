// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
import { app } from 'electron';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { WorkbenchStore } from '../electron/store';
import { Workbench } from '../electron/workbench';

const directory = process.env.XACTIONS_INTEGRATION_DIR!;
const project = process.env.XACTIONS_INTEGRATION_PROJECT!;
assert.ok(directory && project, 'Integration directories must be explicitly supplied');
assert.equal(process.env.XACTIONS_HOME, join(directory, 'xactions'));
app.setPath('userData', join(directory, 'electron-user-data'));

void app.whenReady().then(async () => {
  let service: Workbench | null = null;
  try {
    let changes = 0;
    const dataPath = join(directory, 'workbench');
    const store = new WorkbenchStore(dataPath, project);
    assert.equal(store.publicConfig().sessionConfigured, false);
    assert.equal(store.publicConfig().nodePath, process.env.XACTIONS_NODE_PATH);
    assert.equal(store.childEnv().MCP_TRANSPORT, 'stdio');
    assert.equal(store.childEnv().XACTIONS_MCP_REQUIRE_APPROVAL, '1');
    service = new Workbench(store, () => { changes++; });
    const connection = await service.connect();
    assert.equal(connection.state, 'connected', connection.error);
    assert.equal(connection.toolCount, 154);
    assert.ok(service.snapshot().tools.find(tool => tool.name === 'x_post_tweet')?.isWrite);
    const budget = await service.runTool('x_action_budget', {});
    assert.equal(budget.status, 'success', budget.error);
    const held = await service.runTool('x_post_tweet', { text: 'Local desktop integration test — approval gate only, never publish.' });
    assert.equal(held.status, 'held', held.error);
    const draftId = (held.result as { draftId: string }).draftId;
    assert.ok(draftId);
    const drafts = await service.drafts();
    assert.ok(drafts.some(draft => draft.id === draftId && draft.tool === 'x_post_tweet' && draft.status === 'pending'));
    await service.discardDraft(draftId);
    assert.equal((await service.drafts()).some(draft => draft.id === draftId), false);
    assert.ok(changes >= 6);
    const originalHistory = service.snapshot().history;
    assert.equal(originalHistory.length, 3);
    await service.close();
    service = null;
    const reopened = new WorkbenchStore(dataPath, project);
    assert.deepEqual(reopened.history(), originalHistory);
    assert.equal(reopened.publicConfig().nodePath, process.env.XACTIONS_NODE_PATH);
    reopened.close();
    const draftStore = join(directory, 'xactions', 'mcp-drafts.json');
    assert.ok(existsSync(draftStore));
    assert.deepEqual(JSON.parse(readFileSync(draftStore, 'utf8')), []);
    writeFileSync(join(directory, 'passed.json'), JSON.stringify({ tools: connection.toolCount, runs: originalHistory.length, heldDraftDiscarded: true, historyPersisted: true, noPlatformRequests: true }));
    console.info('INTEGRATION PASS: real Electron + SQLite + MCP, 154 tools, local budget, held draft, discard, persistent history.');
    app.exit(0);
  } catch (error) {
    console.error('INTEGRATION FAIL:', error instanceof Error ? error.message : String(error));
    await service?.close().catch(() => undefined);
    app.exit(1);
  }
});
