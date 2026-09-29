<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->
<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, CircleCheck, Delete, DocumentChecked } from '@element-plus/icons-vue';
import type { DraftRecord, RunRecord } from '../../shared/contracts';
import { useWorkbenchStore } from '../stores/workbench';
import { toolTitle } from '../data/presentation';
import ResultPanel from '../components/ResultPanel.vue';
const store = useWorkbenchStore();
const filter = ref('pending');
const selected = ref<DraftRecord | null>(null);
const result = ref<RunRecord | null>(null);
const busy = ref(false);
const syncing = ref(false);
const rows = computed(() => store.drafts.filter(draft => filter.value === 'all' || draft.status === filter.value));
const pending = computed(() => store.drafts.filter(draft => draft.status === 'pending').length);
const connected = computed(() => store.connection.state === 'connected');
const labels: Record<string,string> = { pending:'待审批', executed:'已执行', failed:'执行失败', discarded:'已丢弃' };
function summary(draft: DraftRecord) { const args=draft.args; return String((args.text ?? args.question ?? (Array.isArray(args.tweets) ? args.tweets.join(' → ') : '')) || JSON.stringify(args)); }
function date(value: string) { return new Date(value).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); }
async function refresh() {
  if (syncing.value) return;
  syncing.value = true;
  try { await store.loadDrafts(); selected.value = store.drafts.find(item => item.id === selected.value?.id) ?? null; }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '同步草稿失败'); }
  finally { syncing.value = false; }
}
function choose(draft: DraftRecord) { selected.value=draft; result.value=null; }
async function approve(draft: DraftRecord) {
  if (!connected.value || busy.value || store.executing) return;
  try {
    await ElMessageBox({ title:'确认执行这条草稿', message:h('div', {style:'display:grid;gap:12px'}, [h('p', `即将执行「${toolTitle(draft.tool)}」。请核对以下完整参数：`), h('pre', {style:'max-height:340px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7fb;padding:14px;border-radius:8px;font-size:12px;line-height:1.7'}, JSON.stringify(draft.args,null,2))]), showCancelButton:true, confirmButtonText:'批准并执行', cancelButtonText:'返回检查', type:'warning', closeOnClickModal:false });
    busy.value=true;
    result.value=await store.approve(draft.id);
    selected.value=store.drafts.find(item=>item.id===draft.id) ?? draft;
    if(result.value.status==='success') ElMessage.success('草稿执行完成');
  } catch(error) { if(error!=='cancel' && error!=='close') ElMessage.error(error instanceof Error ? error.message : '审批执行失败'); } finally { busy.value=false; }
}
async function discard(draft: DraftRecord) {
  try { await ElMessageBox.confirm('丢弃后不会执行此操作。是否丢弃这条草稿？','丢弃草稿',{confirmButtonText:'丢弃草稿',cancelButtonText:'保留',type:'warning'}); busy.value=true; await store.discard(draft.id); if(selected.value?.id===draft.id) selected.value=null; ElMessage.success('草稿已丢弃'); } catch(error) { if(error!=='cancel' && error!=='close') ElMessage.error(error instanceof Error ? error.message : '丢弃失败'); } finally {busy.value=false;}
}
watch(connected,value=>{if(value)refresh();},{immediate:true});
</script>
<template>
  <div class="page-stack"><div class="page-heading"><div><span class="eyebrow">REVIEW & APPROVAL</span><h1>审批中心 <span class="heading-count">{{ pending }}</span></h1><p class="muted">每一条对外行动，都经过一次明确的确认。</p></div><el-button :icon="Refresh" :loading="syncing" :disabled="!connected || busy || store.executing" @click="refresh">同步草稿</el-button></div>
    <el-alert v-if="!connected" title="连接 XActions 后同步审批草稿" description="在设置中连接本机服务，再查看待处理内容。" type="info" show-icon :closable="false" />
    <div class="approval-layout"><section class="surface draft-list"><div class="draft-filter"><el-radio-group v-model="filter" size="small"><el-radio-button value="pending">待审批</el-radio-button><el-radio-button value="executed">已执行</el-radio-button><el-radio-button value="failed">失败</el-radio-button><el-radio-button value="all">全部</el-radio-button></el-radio-group><span>{{ rows.length }} 条</span></div><div v-if="!rows.length" class="draft-empty"><el-icon><DocumentChecked /></el-icon><h3>{{ filter === 'pending' ? '所有行动，都已妥善安排' : '此分类暂无草稿' }}</h3><p>在内容创作或工具库提交写入操作后，<br>草稿会显示在这里等待审核。</p><router-link to="/compose"><el-button text type="primary">去创作内容</el-button></router-link></div><button v-for="draft in rows" :key="draft.id" :class="['draft-row',{selected:selected?.id === draft.id}]" @click="choose(draft)"><div class="draft-row-head"><strong>{{ toolTitle(draft.tool) }}</strong><el-tag size="small" :type="draft.status === 'pending' ? 'warning' : draft.status === 'failed' ? 'danger' : 'info'">{{ labels[draft.status] || draft.status }}</el-tag></div><p>{{ summary(draft) }}</p><small>{{ date(draft.createdAt) }}<span>{{ draft.tool }}</span></small></button></section>
      <section class="surface draft-detail"><template v-if="selected"><div class="section-heading"><h2>草稿详情</h2><span class="mono draft-id">{{ selected.id }}</span></div><h3>{{ toolTitle(selected.tool) }}</h3><div class="detail-meta"><span>{{ labels[selected.status] || selected.status }}</span><span>{{ date(selected.createdAt) }}</span></div><pre class="draft-content">{{ JSON.stringify(selected.args,null,2) }}</pre><el-alert v-if="selected.error" :title="selected.error" type="error" :closable="false" /><div v-if="selected.status === 'pending'" class="draft-actions"><el-button :icon="Delete" :disabled="!connected || busy || store.executing" @click="discard(selected)">丢弃</el-button><el-button type="primary" :icon="CircleCheck" :loading="busy" :disabled="!connected || busy || store.executing" @click="approve(selected)">审核并执行</el-button></div><ResultPanel v-if="result" :run="result" /></template><div v-else class="detail-empty"><el-icon><DocumentChecked /></el-icon><h3>选择一条草稿，查看完整内容</h3><p>执行之前，你始终拥有最后的决定权。</p></div></section>
    </div>
  </div>
</template>
<style scoped>
.heading-count{display:inline-block;font-size:13px;color:#8189ac;background:#ebeffa;border-radius:8px;padding:4px 9px;vertical-align:middle;margin-left:8px;font-weight:500}.approval-layout{display:grid;grid-template-columns:minmax(290px,1fr) minmax(350px,1.25fr);gap:22px;align-items:start}.draft-filter{padding:20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #edf0f5}.draft-filter>span{font-size:11px;color:#9ba6b7;margin-left:auto}.draft-empty,.detail-empty{text-align:center;padding:75px 15px;color:#a2adbf}.draft-empty>.el-icon,.detail-empty>.el-icon{font-size:32px;color:#b7c2d5}.draft-empty h3,.detail-empty h3{font-size:13px;font-weight:500;color:#7f8da2;margin:20px 0 10px}.draft-empty p,.detail-empty p{font-size:11px;line-height:1.9}.draft-row{width:100%;border:0;border-bottom:1px solid #edf0f5;text-align:left;background:white;padding:22px;cursor:pointer}.draft-row:hover,.draft-row.selected{background:#f7f9ff}.draft-row.selected{box-shadow:inset 3px 0 #7580da}.draft-row-head{display:flex;align-items:center;gap:12px;justify-content:space-between}.draft-row-head strong{font-size:13px;font-weight:600;color:#52627b}.draft-row p{font-size:12px;color:#8b97a9;line-height:1.8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:12px 0}.draft-row small{display:flex;justify-content:space-between;gap:10px;font-size:10px;color:#adb6c4}.draft-detail{padding:25px;min-width:0;min-height:380px}.draft-id{font-size:9px;color:#b0b9c9;max-width:180px;overflow:hidden;text-overflow:ellipsis}.draft-detail>h3{font-size:17px;font-weight:550;color:#506078;margin:25px 0 10px}.detail-meta{display:flex;gap:15px;color:#9cabc0;font-size:11px}.draft-content{max-height:410px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc;border:1px solid #eaf0f6;border-radius:10px;padding:19px;font:12px/1.9 Consolas,monospace;color:#61728b;margin:23px 0}.draft-actions{display:flex;justify-content:flex-end;gap:10px;padding:2px 0 25px}@media(max-width:1000px){.approval-layout{grid-template-columns:1fr}}
</style>
