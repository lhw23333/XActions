<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->
<script setup lang="ts">
import { reactive, computed, watch } from 'vue';
import type { JsonSchema } from '../../shared/contracts';

const props = defineProps<{ schema: JsonSchema; disabled?: boolean }>();
const values = reactive<Record<string, unknown>>({});
const errors = reactive<Record<string, string>>({});
const fields = computed(() => Object.entries(props.schema.properties ?? {}));
const labels: Record<string, string> = { username: '用户名', query: '搜索内容', text: '内容', url: '链接', tweetUrl: '帖子链接', limit: '数量上限', id: '标识 ID', name: '名称', description: '描述', model: '模型', prompt: '提示词', options: '选项', tweets: '帖子列表', question: '问题', durationMinutes: '持续时间（分钟）', filePath: '文件路径', outputPath: '导出路径', dryRun: '仅预览', scheduledAt: '计划时间' };
function typeOf(field: JsonSchema) { return Array.isArray(field.type) ? field.type.find(t => t !== 'null') : field.type; }
function isStructured(field: JsonSchema) { return ['object', 'array'].includes(typeOf(field) ?? '') || !!field.properties; }
function isSecret(key: string) { return /password|token|api.?key|cookie|secret/i.test(key); }
function jsonPlaceholder(field: JsonSchema) { return typeOf(field) === 'array' ? '["第一项", "第二项"]' : '{"key": "value"}'; }
watch(() => props.schema, () => {
  Object.keys(values).forEach(key => delete values[key]);
  Object.keys(errors).forEach(key => delete errors[key]);
  for (const [key, field] of fields.value) {
    if (field.default !== undefined) values[key] = isStructured(field) ? JSON.stringify(field.default, null, 2) : field.default;
  }
}, { immediate: true });
function getArguments(): Record<string, unknown> {
  Object.keys(errors).forEach(key => delete errors[key]);
  const args: Record<string, unknown> = {};
  for (const [key, field] of fields.value) {
    const value = values[key];
    const required = props.schema.required?.includes(key);
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      if (required) errors[key] = '请填写此参数';
      continue;
    }
    let parsed = value;
    if (isStructured(field)) {
      try { parsed = JSON.parse(String(value)); } catch { errors[key] = '请输入有效的 JSON'; continue; }
      if (typeOf(field) === 'array' && !Array.isArray(parsed)) { errors[key] = '此参数需要 JSON 数组'; continue; }
      if ((typeOf(field) === 'object' || field.properties) && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) { errors[key] = '此参数需要 JSON 对象'; continue; }
      if (Array.isArray(parsed) && field.items?.type) {
        const itemType = typeOf(field.items);
        if (itemType && parsed.some(item => itemType === 'integer' ? !Number.isInteger(item) : itemType === 'object' ? typeof item !== 'object' || item === null || Array.isArray(item) : typeof item !== itemType)) { errors[key] = `数组元素类型应为 ${itemType}`; continue; }
      }
    }
    if (typeOf(field) === 'integer' && !Number.isInteger(parsed)) { errors[key] = '请输入整数'; continue; }
    if (typeof parsed === 'number' && (!Number.isFinite(parsed) || (field.minimum !== undefined && parsed < field.minimum) || (field.maximum !== undefined && parsed > field.maximum))) { errors[key] = '数值不在允许范围内'; continue; }
    args[key] = parsed;
  }
  if (Object.keys(errors).length) throw new Error('请检查标红的参数后重试');
  return args;
}
defineExpose({ getArguments });
</script>

<template>
  <el-form label-position="top" :disabled="disabled" class="schema-form">
    <div v-if="!fields.length" class="empty-parameters">此工具无需填写参数。</div>
    <el-form-item v-for="[key, field] in fields" :key="key" :required="schema.required?.includes(key)" :error="errors[key]">
      <template #label><span>{{ labels[key] || key }}</span><code v-if="labels[key]">{{ key }}</code></template>
      <el-select v-if="field.enum" v-model="values[key]" clearable placeholder="请选择" style="width:100%">
        <el-option v-for="(option, index) in field.enum" :key="index" :label="String(option)" :value="option as string | number | boolean" />
      </el-select>
      <el-select v-else-if="typeOf(field) === 'boolean'" v-model="values[key]" clearable placeholder="使用工具默认值" style="width:100%">
        <el-option label="是 / true" :value="true" /><el-option label="否 / false" :value="false" />
      </el-select>
      <el-input-number v-else-if="['number','integer'].includes(typeOf(field) || '')" v-model="values[key] as number" :min="field.minimum" :max="field.maximum" :precision="typeOf(field) === 'integer' ? 0 : undefined" controls-position="right" style="width:100%" />
      <el-input v-else-if="isStructured(field)" v-model="values[key] as string" type="textarea" :rows="4" :placeholder="jsonPlaceholder(field)" class="json-input" />
      <el-input v-else v-model="values[key] as string" :type="isSecret(key) ? 'password' : /text|prompt|description|bio|content|question/.test(key) ? 'textarea' : 'text'" :rows="3" :show-password="isSecret(key)" :autocomplete="isSecret(key) ? 'new-password' : 'off'" :placeholder="schema.required?.includes(key) ? '填写必填参数' : '可选，留空使用工具默认值'" />
      <p v-if="field.description" class="field-hint">{{ field.description }}</p>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.schema-form :deep(.el-form-item__label){font-weight:600;color:#334155;gap:8px}.schema-form code{font-size:11px;font-weight:400;color:#94a3b8}.field-hint{width:100%;font-size:11px;color:#8791a3;line-height:1.6;margin:6px 0 0}.empty-parameters{padding:18px;background:#f8fafc;border-radius:8px;color:#64748b;font-size:13px}.json-input :deep(textarea){font-family:Consolas,monospace;font-size:12px}
</style>
