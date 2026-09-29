<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { VideoPlay, DocumentAdd } from '@element-plus/icons-vue';
import type { RunRecord, ToolDefinition } from '../../shared/contracts';
import { useWorkbenchStore } from '../stores/workbench';
import { toolTitle, toolDescription } from '../data/presentation';
import SchemaForm from './SchemaForm.vue';
import ResultPanel from './ResultPanel.vue';
const props = defineProps<{ tool: ToolDefinition }>();
const store = useWorkbenchStore();
const form = ref<InstanceType<typeof SchemaForm>>();
const result = ref<RunRecord | null>(null);
const busy = ref(false);
const canRun = computed(() => store.connection.state === 'connected' && !store.executing && !busy.value);
const approvalTool = computed(() => ['x_approve_draft', 'x_discard_draft'].includes(props.tool.name));
watch(() => props.tool.name, () => { result.value = null; });
async function run() {
  if (!canRun.value) return;
  try {
    const args = form.value?.getArguments() ?? {};
    busy.value = true;
    result.value = await store.run(props.tool.name, args);
    if (result.value.status === 'held') ElMessage.success('已保存，等待审批');
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '工具执行失败'); } finally { busy.value = false; }
}
</script>
<template>
  <div class="tool-runner">
    <div class="runner-intro"><span class="eyebrow">{{ tool.group.toUpperCase() }} / TOOL</span><h2>{{ toolTitle(tool.name) }}</h2><p>{{ toolDescription(tool) }}</p><code>{{ tool.name }}</code></div>
    <el-alert v-if="store.connection.state !== 'connected'" title="连接 XActions 后即可执行工具" description="当前可以浏览参数；请在设置中连接本机服务。" type="info" :closable="false" show-icon />
    <el-alert v-if="tool.isWrite" title="此操作将先保存为审批草稿" description="在审批中心确认具体参数后执行。" type="warning" :closable="false" show-icon />
    <template v-if="approvalTool"><p class="muted">请前往审批中心查看完整草稿并处理。</p><router-link to="/approvals"><el-button type="primary">打开审批中心</el-button></router-link></template>
    <template v-else>
      <SchemaForm :key="tool.name" ref="form" :schema="tool.inputSchema" :disabled="busy || store.executing" />
      <div class="runner-submit"><el-button type="primary" :icon="tool.isWrite ? DocumentAdd : VideoPlay" :loading="busy" :disabled="!canRun" @click="run">{{ tool.isWrite ? '提交审批' : '运行工具' }}</el-button><span>使用当前本机会话</span></div>
    </template>
    <div v-if="result" class="runner-result"><ResultPanel :run="result" /></div>
  </div>
</template>
<style scoped>
.tool-runner{display:grid;gap:24px}.runner-intro h2{font-size:23px;letter-spacing:-.7px;margin:9px 0}.runner-intro p{font-size:13px;line-height:1.8;color:#64748b;margin:0 0 12px}.runner-intro code{display:inline-block;background:#f1f5f9;padding:5px 8px;border-radius:5px;font-size:11px;color:#7c89a0}.runner-submit{display:flex;align-items:center;gap:14px}.runner-submit span{font-size:11px;color:#94a3b8}.runner-result{padding-top:24px;border-top:1px solid #e8edf4}
</style>
