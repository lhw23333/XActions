<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Download, CopyDocument, DocumentChecked } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { RunRecord } from '../../shared/contracts';
import { useWorkbenchStore } from '../stores/workbench';

const props = defineProps<{ run: RunRecord | null | undefined }>();
const store = useWorkbenchStore();
const busy = ref(false);
const activeView = ref('readable');
const statusLabels: Record<string, string> = { success: '执行成功', error: '执行失败', held: '已进入审批', running: '执行中', cancelled: '已取消' };
const raw = computed(() => JSON.stringify(props.run?.result ?? { error: props.run?.error }, null, 2));
const parsed = computed(() => {
  const result = props.run?.result as any;
  if (Array.isArray(result?.content)) {
    const texts = result.content.filter((item: any) => item.type === 'text').map((item: any) => item.text).join('\n');
    if (texts) { try { return JSON.parse(texts); } catch { return texts; } }
  }
  return result;
});
const rows = computed<Record<string, unknown>[]>(() => {
  const value = parsed.value;
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value).find(v => Array.isArray(v) && v.length && typeof v[0] === 'object') : null;
  return Array.isArray(list) && list.every(v => v !== null && typeof v === 'object' && !Array.isArray(v)) ? list : [];
});
const columns = computed(() => [...new Set(rows.value.slice(0, 30).flatMap(row => Object.keys(row)))].slice(0, 8));
const readable = computed(() => typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value, null, 2));
function cell(value: unknown) { return value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
async function exportResult(format: 'json' | 'csv') {
  if (!props.run) return;
  busy.value = true;
  try { await store.exportRun(props.run.id, format); } catch (error) { ElMessage.error(error instanceof Error ? error.message : '导出失败'); } finally { busy.value = false; }
}
async function copy() { try { await navigator.clipboard.writeText(raw.value ?? ''); ElMessage.success('结果已复制'); } catch { ElMessage.error('复制失败，请从原始结果中选择文本'); } }
</script>

<template>
  <section v-if="run" class="result-panel">
    <div class="result-head">
      <div><span class="result-kicker">执行结果</span><el-tag :type="run.status === 'error' ? 'danger' : run.status === 'held' ? 'warning' : 'success'" size="small" effect="light">{{ statusLabels[run.status] || run.status }}</el-tag></div>
      <span v-if="run.durationMs !== undefined" class="muted">{{ (run.durationMs / 1000).toFixed(2) }} 秒</span>
    </div>
    <el-alert v-if="run.status === 'held'" title="已保存到待审批" description="查看具体内容并批准后，XActions 才会执行此操作。" type="warning" :closable="false" show-icon />
    <el-alert v-if="run.error" :title="run.error" type="error" :closable="false" show-icon />
    <div class="result-toolbar">
      <el-radio-group v-model="activeView" size="small"><el-radio-button value="readable">可读视图</el-radio-button><el-radio-button value="raw">原始 JSON</el-radio-button></el-radio-group>
      <div class="result-actions"><el-button :icon="CopyDocument" size="small" text @click="copy">复制</el-button><el-dropdown :disabled="busy || !store.desktopAvailable" @command="exportResult"><el-button :icon="Download" size="small" :loading="busy" :disabled="!store.desktopAvailable">导出</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="json">JSON</el-dropdown-item><el-dropdown-item command="csv">CSV</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div>
    </div>
    <template v-if="activeView === 'readable' && rows.length">
      <el-table :data="rows.slice(0,100)" size="small" max-height="420" stripe><el-table-column v-for="column in columns" :key="column" :label="column" min-width="140" show-overflow-tooltip><template #default="scope">{{ cell(scope.row[column]) }}</template></el-table-column></el-table>
      <p class="result-note">共 {{ rows.length }} 条记录<span v-if="rows.length > 100">，当前预览前 100 条；导出包含完整结果</span>。</p>
    </template>
    <pre v-else class="result-code">{{ activeView === 'raw' ? raw : readable || '此操作未返回内容。' }}</pre>
    <router-link v-if="run.status === 'held'" to="/approvals" class="approval-link"><el-icon><DocumentChecked /></el-icon>前往审批中心</router-link>
  </section>
</template>

<style scoped>
.result-panel{display:grid;gap:14px;min-width:0}.result-head,.result-head>div,.result-toolbar,.result-actions{display:flex;align-items:center;gap:10px}.result-head,.result-toolbar{justify-content:space-between}.result-kicker{font-size:13px;font-weight:650}.result-head .muted{font-size:12px}.result-code{max-height:420px;overflow:auto;margin:0;padding:18px;background:#f6f8fb;border:1px solid #e8edf4;border-radius:10px;color:#475569;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.75 Consolas,monospace}.result-note{font-size:12px;color:#94a3b8;margin:0}.approval-link{display:flex;align-items:center;gap:7px;font-size:13px;color:#4f46e5;text-decoration:none}.result-toolbar{flex-wrap:wrap}
</style>
