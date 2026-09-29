<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { EditPen, Plus, Delete, DocumentAdd, View } from '@element-plus/icons-vue';
import { useWorkbenchStore } from '../stores/workbench';
import type { RunRecord } from '../../shared/contracts';
import ResultPanel from '../components/ResultPanel.vue';
const store = useWorkbenchStore();
const mode = ref<'post' | 'thread' | 'poll'>('post');
const text = ref('');
const tweets = ref(['', '']);
const options = ref(['', '']);
const duration = ref(1440);
const busy = ref(false);
const lastRun = ref<RunRecord | null>(null);
const toolName = computed(() => ({ post: 'x_post_tweet', thread: 'x_post_thread', poll: 'x_create_poll' }[mode.value]));
const available = computed(() => store.tools.some(tool => tool.name === toolName.value));
const canSubmit = computed(() => store.connection.state === 'connected' && available.value && !busy.value && !store.executing);
const previews = computed(() => mode.value === 'thread' ? tweets.value : [text.value]);
function count(value: string) { return Array.from(value).length; }
function buildArgs(): Record<string, unknown> {
  if (mode.value === 'thread') {
    if (tweets.value.length < 2 || tweets.value.some(tweet => !tweet.trim())) throw new Error('线程至少需要两条非空内容');
    return { tweets: tweets.value.map(tweet => tweet.trim()) };
  }
  if (!text.value.trim()) throw new Error(mode.value === 'poll' ? '请填写投票问题' : '请先填写帖子内容');
  if (mode.value === 'poll') {
    if (options.value.length < 2 || options.value.length > 4 || options.value.some(option => !option.trim())) throw new Error('投票需要 2 至 4 个非空选项');
    if (!Number.isFinite(duration.value) || duration.value <= 0) throw new Error('请填写有效的投票持续时间');
    return { question: text.value.trim(), options: options.value.map(option => option.trim()), durationMinutes: duration.value };
  }
  return { text: text.value.trim() };
}
async function save() {
  if (!canSubmit.value) return;
  try {
    const args = buildArgs();
    busy.value = true;
    lastRun.value = await store.run(toolName.value, args);
    if (lastRun.value.status === 'held') ElMessage.success('内容已保存到待审批列表');
    else if (lastRun.value.status === 'error') ElMessage.error(lastRun.value.error || '保存草稿失败');
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存草稿失败'); } finally { busy.value = false; }
}
</script>
<template>
  <div class="page-stack">
    <div class="page-heading"><div><span class="eyebrow">CONTENT STUDIO</span><h1>内容创作</h1><p class="muted">专注表达。先整理内容，再在审批中心确认发布。</p></div><router-link to="/approvals"><el-button :icon="DocumentAdd">查看待审批</el-button></router-link></div>
    <div class="composer-layout"><section class="surface editor-card"><div class="editor-tabs"><button :class="{active:mode === 'post'}" :disabled="busy" @click="mode='post'">单条帖子</button><button :class="{active:mode === 'thread'}" :disabled="busy" @click="mode='thread'">连续线程</button><button :class="{active:mode === 'poll'}" :disabled="busy" @click="mode='poll'">发起投票</button></div><div class="editor-body"><div class="editor-label"><el-icon><EditPen /></el-icon>{{ mode === 'poll' ? '你的投票问题' : '写下你的想法' }}</div>
      <template v-if="mode === 'thread'"><div v-for="(_,index) in tweets" :key="index" class="thread-editor"><div class="thread-label"><span>第 {{ index + 1 }} 条</span><el-button v-if="tweets.length > 2" :icon="Delete" text size="small" :disabled="busy" aria-label="删除本条" @click="tweets.splice(index,1)" /></div><el-input v-model="tweets[index]" type="textarea" :rows="4" resize="vertical" :disabled="busy" placeholder="用一条清晰的内容延续你的观点…" /><span class="char-count" :class="{over:count(tweets[index]) > 280}">{{ count(tweets[index]) }} 字符</span></div><el-button :icon="Plus" :disabled="busy" plain @click="tweets.push('')">添加下一条</el-button></template>
      <template v-else><el-input v-model="text" type="textarea" :rows="9" resize="vertical" :disabled="busy" :placeholder="mode === 'poll' ? '你想向大家提出什么问题？' : '今天有什么值得分享？'" class="main-textarea" /><div class="editor-footnote"><span>清晰的观点，从一个想法开始。</span><span class="char-count" :class="{over:count(text) > 280}">{{ count(text) }} 字符</span></div></template>
      <div v-if="mode === 'poll'" class="poll-editor"><label>投票选项 <span>2–4 个</span></label><div v-for="(_,index) in options" :key="index" class="poll-option"><span>{{ String.fromCharCode(65 + index) }}</span><el-input v-model="options[index]" :disabled="busy" :placeholder="`选项 ${index + 1}`" /><el-button v-if="options.length > 2" :icon="Delete" text :disabled="busy" aria-label="删除选项" @click="options.splice(index,1)" /></div><el-button v-if="options.length < 4" :icon="Plus" text type="primary" :disabled="busy" @click="options.push('')">添加选项</el-button><div class="poll-duration"><label>持续时间（分钟）</label><el-input-number v-model="duration" :min="1" :precision="0" :disabled="busy" controls-position="right" /></div></div>
      <p class="count-hint">字符数仅作编辑参考，实际长度限制以 X 平台校验为准。</p><el-alert v-if="!available" title="当前工具目录尚未提供此发布能力" type="warning" :closable="false" /><el-alert v-else-if="store.connection.state !== 'connected'" title="连接本机服务后可保存审批草稿" type="info" :closable="false" />
      <div class="composer-submit"><span><span class="status-dot"></span>发布前需要你的批准</span><el-button type="primary" :icon="DocumentAdd" :disabled="!canSubmit" :loading="busy" @click="save">保存到待审批</el-button></div></div></section>
      <aside class="preview-column"><div class="preview-title"><el-icon><View /></el-icon>内容预览<span>仅预览</span></div><div class="surface post-preview"><div v-for="(post,index) in previews" :key="index" class="preview-post"><div class="preview-avatar">X<span v-if="mode === 'thread' && index < previews.length - 1" class="thread-line"></span></div><div class="preview-post-body"><div class="preview-name">当前会话 <span>待发布内容 · 草稿</span></div><div class="preview-text" :class="{placeholder:!post}">{{ post || (mode === 'poll' ? '投票问题会显示在这里…' : '你的内容会显示在这里…') }}</div><div v-if="mode === 'poll'" class="preview-options"><div v-for="(option,optionIndex) in options" :key="optionIndex">{{ option || `选项 ${optionIndex + 1}` }}</div><small>投票持续 {{ duration }} 分钟</small></div><div class="preview-actions"><span>评论</span><span>转发</span><span>喜欢</span><span>分享</span></div></div></div></div><div class="preview-note"><strong>准备好，再发布。</strong><p>保存后，完整内容和参数会进入待审批列表。你可以在那里查看、批准或丢弃。</p><code>{{ toolName }}</code></div></aside>
    </div><section v-if="lastRun" class="surface composer-result"><ResultPanel :run="lastRun" /></section>
  </div>
</template>
<style scoped>
.composer-layout{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(290px,1fr);gap:24px;align-items:start}.editor-tabs{padding:0 26px;display:flex;gap:29px;border-bottom:1px solid #edf0f5}.editor-tabs button{border:0;background:none;padding:20px 0;font-size:12px;cursor:pointer;color:#8d97a8;border-bottom:2px solid transparent}.editor-tabs button.active{color:#5c6cda;border-bottom-color:#6575e6;font-weight:600}.editor-body{padding:25px}.editor-label{display:flex;gap:8px;align-items:center;font-size:12px;color:#69778b;margin-bottom:14px}.main-textarea :deep(textarea){font-size:14px;line-height:1.9;padding:18px}.editor-footnote{display:flex;justify-content:space-between;gap:10px;color:#a1aabb;font-size:10px;margin-top:12px}.char-count{display:block;text-align:right;color:#97a3b3;font-size:11px;margin-top:6px}.char-count.over{color:#c99448}.thread-editor{margin-bottom:17px}.thread-label{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#97a3b3;margin-bottom:7px}.thread-editor :deep(textarea){line-height:1.8;padding:12px}.count-hint{font-size:10px;color:#a4acb9;line-height:1.7;margin:24px 0}.composer-submit{border-top:1px solid #edf0f5;margin-top:24px;padding-top:22px;display:flex;align-items:center;justify-content:space-between;gap:10px}.composer-submit>span{display:flex;align-items:center;gap:7px;font-size:10px;color:#99a3b4}.composer-submit .status-dot{background:#acb6ca}.preview-title{display:flex;align-items:center;gap:8px;font-size:12px;color:#69778b;margin-bottom:15px}.preview-title>span{margin-left:auto;font-size:10px;color:#adb6c4}.post-preview{padding:25px 23px}.preview-post{display:flex;gap:12px;padding-bottom:20px}.preview-post:last-child{padding-bottom:0}.preview-avatar{position:relative;flex-shrink:0;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:white;background:#293345;font-size:16px;font-weight:600}.thread-line{position:absolute;left:16px;top:43px;bottom:-70px;width:2px;background:#eef1f5}.preview-post-body{min-width:0;flex:1}.preview-name{font-size:12px;font-weight:600;color:#455369;padding:2px 0 13px}.preview-name>span{font-size:10px;font-weight:400;color:#a4adba;margin-left:6px}.preview-text{font-size:13px;color:#556177;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;min-height:88px}.preview-text.placeholder{color:#b4bdca}.preview-actions{display:flex;justify-content:space-between;margin-top:22px;font-size:9px;color:#bcc3cf}.preview-note{padding:23px 4px}.preview-note strong{color:#79879b;font-size:12px;font-weight:500}.preview-note p{font-size:11px;line-height:1.9;color:#9da7b8;margin:7px 0 15px}.preview-note code{font-size:10px;color:#b4bdcb}.poll-editor{margin-top:22px;padding-top:18px;border-top:1px solid #eef2f7}.poll-editor>label{display:block;font-size:12px;color:#64748b;margin-bottom:12px}.poll-editor>label span{font-size:10px;color:#b1bac7;margin-left:8px}.poll-option{display:flex;gap:9px;align-items:center;margin-bottom:10px}.poll-option>span{color:#a0acbd;font-size:11px}.poll-duration{display:flex;align-items:center;justify-content:space-between;margin-top:20px;gap:15px}.poll-duration label{font-size:11px;color:#8794a8}.preview-options{display:grid;gap:9px;margin-top:15px}.preview-options>div{padding:8px 12px;border:1px solid #a9b6ef;color:#778ada;border-radius:7px;font-size:11px}.preview-options>small{font-size:10px;color:#a0a9b7}.composer-result{padding:24px}@media(max-width:1050px){.composer-layout{grid-template-columns:1fr}.preview-column{max-width:650px}}
</style>
