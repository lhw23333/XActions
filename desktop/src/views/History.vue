<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Clock, ArrowRight } from '@element-plus/icons-vue';
import type { RunRecord } from '../../shared/contracts';
import { useWorkbenchStore } from '../stores/workbench';
import { toolTitle } from '../data/presentation';
import ResultPanel from '../components/ResultPanel.vue';
const store = useWorkbenchStore();
const route = useRoute();
const search = ref('');
const status = ref('all');
const selected = ref<RunRecord | null>(null);
const drawer = ref(false);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const labels: Record<string,string> = { success:'执行成功',error:'执行失败',held:'等待审批',running:'运行中',cancelled:'已取消' };
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return store.history.filter(run => (status.value === 'all' || run.status === status.value) && (!q || `${toolTitle(run.toolName)} ${run.toolName} ${run.id}`.toLowerCase().includes(q)));
});
const rows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
function open(run: RunRecord) { selected.value = run; drawer.value = true; }
function date(value: string) { return new Date(value).toLocaleString('zh-CN'); }
watch([search, status], () => { page.value = 1; });
watch([() => route.query.run, () => store.history], ([id]) => { if (typeof id === 'string') { const run = store.history.find(item => item.id === id); if (run) open(run); } }, { immediate: true });
async function refresh() {
  loading.value = true;
  try { await store.refresh(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : '读取历史失败'); } finally { loading.value = false; }
}
</script>
<template>
  <div class="page-stack">
    <div class="page-heading"><div><span class="eyebrow">ACTIVITY LOG</span><h1>执行记录</h1><p class="muted">每次调用的参数、状态与结果，都有迹可循。</p></div><el-button :icon="Refresh" :loading="loading" :disabled="!store.desktopAvailable" @click="refresh">刷新记录</el-button></div>
    <section class="surface history-panel">
      <div class="history-toolbar"><el-input v-model="search" :prefix-icon="Search" placeholder="搜索工具名称或执行 ID" clearable /><el-select v-model="status"><el-option label="全部状态" value="all" /><el-option v-for="(label,key) in labels" :key="key" :label="label" :value="key" /></el-select><span>{{ filtered.length }} 条记录</span></div>
      <el-table v-if="rows.length" :data="rows" row-key="id" @row-click="open" class="history-table">
        <el-table-column label="执行工具" min-width="210"><template #default="scope"><div class="history-name"><strong>{{ toolTitle(scope.row.toolName) }}</strong><code>{{ scope.row.toolName }}</code></div></template></el-table-column>
        <el-table-column label="状态" width="115"><template #default="scope"><el-tag :type="scope.row.status === 'error' ? 'danger' : scope.row.status === 'held' ? 'warning' : scope.row.status === 'success' ? 'success' : 'info'" size="small" effect="light">{{ labels[scope.row.status] || scope.row.status }}</el-tag></template></el-table-column>
        <el-table-column label="执行时间" min-width="170"><template #default="scope"><span class="history-time">{{ date(scope.row.createdAt) }}</span></template></el-table-column>
        <el-table-column label="耗时" width="95"><template #default="scope"><span class="history-time">{{ scope.row.durationMs !== undefined ? `${(scope.row.durationMs / 1000).toFixed(2)} s` : '—' }}</span></template></el-table-column>
        <el-table-column width="95" label="详情"><template #default="scope"><el-button text size="small" type="primary" @click.stop="open(scope.row)">查看 <el-icon><ArrowRight /></el-icon></el-button></template></el-table-column>
      </el-table>
      <div v-else class="history-empty"><el-icon><Clock /></el-icon><h3>{{ store.history.length ? '没有符合筛选条件的记录' : '让第一次执行，成为一个起点' }}</h3><p>{{ store.history.length ? '试试其他关键词或状态。' : '从工具库运行一个工具，完整结果将在这里保留。' }}</p><router-link v-if="!store.history.length" to="/tools"><el-button type="primary" plain>浏览工具库</el-button></router-link></div>
      <div v-if="filtered.length > pageSize" class="history-pagination"><el-pagination v-model:current-page="page" :page-size="pageSize" :total="filtered.length" layout="prev,pager,next" background small /></div>
    </section>
    <el-drawer v-model="drawer" title="执行详情" :size="'min(700px, 95vw)'" destroy-on-close><template v-if="selected"><div class="history-detail-head"><span class="eyebrow">{{ selected.toolName }}</span><h2>{{ toolTitle(selected.toolName) }}</h2><p>{{ date(selected.createdAt) }} · {{ selected.id }}</p></div><el-collapse class="history-args"><el-collapse-item title="查看调用参数" name="args"><pre>{{ JSON.stringify(selected.args, null, 2) }}</pre></el-collapse-item></el-collapse><ResultPanel :run="selected" /></template></el-drawer>
  </div>
</template>
<style scoped>
.history-toolbar{display:flex;gap:13px;align-items:center;padding:21px 24px;border-bottom:1px solid #edf0f5}.history-toolbar>.el-input{max-width:370px}.history-toolbar>.el-select{width:150px}.history-toolbar>span{margin-left:auto;white-space:nowrap;color:#a0aabd;font-size:11px}.history-panel{overflow:hidden}.history-table :deep(.el-table__row){cursor:pointer}.history-table :deep(th.el-table__cell){background:#fbfcfe;color:#94a0b4;font-size:11px;font-weight:500;padding:13px 8px}.history-table :deep(td.el-table__cell){padding:17px 8px}.history-name{padding-left:8px}.history-name strong{display:block;font-size:12px;color:#5e6b81;font-weight:500}.history-name code{display:block;margin-top:7px;font-size:9px;color:#a2acba}.history-time{font-size:11px;color:#939fb2}.history-empty{text-align:center;padding:100px 20px;color:#a6b1c3}.history-empty>.el-icon{font-size:33px;color:#b9c4d6}.history-empty h3{font-size:14px;font-weight:500;color:#7a8aa2;margin:22px 0 10px}.history-empty p{font-size:12px;margin:0 0 24px}.history-pagination{padding:20px 24px;display:flex;justify-content:flex-end}.history-detail-head h2{font-size:21px;color:#52637c;margin:12px 0}.history-detail-head p{font-size:10px;color:#9aa7ba;line-height:1.8;word-break:break-all}.history-args{margin:22px 0 28px}.history-args pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.8 Consolas,monospace;color:#8390a6;background:#f7f9fc;padding:14px;border-radius:8px}@media(max-width:760px){.history-toolbar{flex-wrap:wrap}.history-toolbar>.el-input{max-width:100%}}
</style>
