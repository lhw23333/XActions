<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Search, Star, StarFilled, ArrowRight, Filter } from '@element-plus/icons-vue';
import type { ToolDefinition } from '../../shared/contracts';
import { useWorkbenchStore } from '../stores/workbench';
import { groupMeta, toolTitle, toolDescription } from '../data/presentation';
import ToolRunner from '../components/ToolRunner.vue';
const store = useWorkbenchStore();
const route = useRoute();
const router = useRouter();
const search = ref('');
const group = ref('all');
const onlyFavorites = ref(false);
const selected = ref<ToolDefinition | null>(null);
const drawer = ref(false);
const groups = computed(() => [...new Set(store.tools.map(tool => tool.group))]);
watch(() => route.query, query => { group.value = typeof query.group === 'string' ? query.group : 'all'; search.value = typeof query.search === 'string' ? query.search : ''; onlyFavorites.value = query.favorites === '1'; }, { immediate: true });
watch([() => route.query.tool, () => store.tools], ([name]) => {
  if (typeof name !== 'string') return;
  const tool = store.tools.find(item => item.name === name);
  if (tool) open(tool);
}, { immediate: true });
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return store.tools.filter(tool => (group.value === 'all' || tool.group === group.value) && (!onlyFavorites.value || store.favorites.includes(tool.name)) && (!q || `${tool.name} ${toolTitle(tool.name)} ${toolDescription(tool)}`.toLowerCase().includes(q)));
});
const activeGroup = computed(() => groupMeta[group.value]);
function setGroup(id: string) { group.value = id; router.replace({ query: { ...route.query, group: id === 'all' ? undefined : id, search: search.value || undefined, favorites: onlyFavorites.value ? '1' : undefined, tool: undefined } }); }
function open(tool: ToolDefinition) { selected.value = tool; drawer.value = true; }
function clearFilters() { search.value = ''; onlyFavorites.value = false; setGroup('all'); }
</script>
<template>
  <div class="page-stack">
    <div class="page-heading"><div><span class="eyebrow">TOOL EXPLORER</span><h1>{{ activeGroup ? activeGroup.label : '工具库' }}</h1><p class="muted">{{ activeGroup?.description || '浏览 XActions 的完整能力，选择工具，填写参数，开始行动。' }}</p></div><span class="catalog-count">{{ store.tools.length }} 个工具 <span> / {{ groups.length }} 个分类</span></span></div>
    <div class="surface library-toolbar"><el-input v-model="search" :prefix-icon="Search" placeholder="搜索工具名称、能力或关键词…" clearable class="library-search" /><el-button :icon="onlyFavorites ? StarFilled : Star" :type="onlyFavorites ? 'primary' : 'default'" :plain="onlyFavorites" @click="onlyFavorites = !onlyFavorites">我的收藏<span v-if="store.favorites.length"> · {{ store.favorites.length }}</span></el-button><span class="library-result-count">{{ filtered.length }} 个结果</span></div>
    <div class="library-layout"><aside class="group-filter"><span class="filter-label"><el-icon><Filter /></el-icon>能力分类</span><button :class="{active:group === 'all'}" @click="setGroup('all')"><span>全部工具</span><small>{{ store.tools.length }}</small></button><button v-for="id in groups" :key="id" :class="{active:group === id}" @click="setGroup(id)"><span class="filter-dot" :style="{background:groupMeta[id]?.color || '#94a3b8'}"></span><span>{{ groupMeta[id]?.label || id }}</span><small>{{ store.tools.filter(t => t.group === id).length }}</small></button></aside>
      <div><div v-if="filtered.length" class="tool-grid"><article v-for="tool in filtered" :key="tool.name" class="tool-card surface"><div class="tool-card-top"><span class="tool-group" :style="{color:groupMeta[tool.group]?.color || '#6366f1'}">{{ groupMeta[tool.group]?.label || tool.group }}</span><el-button :icon="store.favorites.includes(tool.name) ? StarFilled : Star" text circle size="small" :aria-label="store.favorites.includes(tool.name) ? '取消收藏' : '收藏工具'" :class="{favorited:store.favorites.includes(tool.name)}" @click="store.toggleFavorite(tool.name)" /></div><button class="tool-card-main" @click="open(tool)"><h3>{{ toolTitle(tool.name) }}</h3><p>{{ toolDescription(tool) }}</p><code>{{ tool.name }}</code></button><div class="tool-card-bottom"><span :class="['tool-kind',tool.isWrite ? 'write' : 'read']">{{ tool.isWrite ? '写入 · 需审批' : '无需发布审批' }}</span><button @click="open(tool)">配置工具 <el-icon><ArrowRight /></el-icon></button></div></article></div><div v-else class="surface empty-state"><el-icon :size="30"><Search /></el-icon><h3>没有找到匹配的工具</h3><p>尝试其他关键词，或调整分类与收藏筛选。</p><el-button text type="primary" @click="clearFilters">清除筛选</el-button></div></div>
    </div>
    <el-drawer v-model="drawer" title="配置与运行" :size="'min(620px, 95vw)'" destroy-on-close :close-on-click-modal="!store.executing" :close-on-press-escape="!store.executing"><ToolRunner v-if="selected" :tool="selected" /></el-drawer>
  </div>
</template>
<style scoped>
.catalog-count{font-size:13px;font-weight:600;white-space:nowrap;color:#59647a}.catalog-count>span{font-weight:400;color:#9aa4b4;font-size:11px}.library-toolbar{padding:14px 18px;display:flex;gap:14px;align-items:center}.library-search{max-width:470px}.library-result-count{margin-left:auto;font-size:11px;color:#94a3b8;white-space:nowrap}.library-layout{display:grid;grid-template-columns:175px minmax(0,1fr);gap:25px}.group-filter{display:flex;flex-direction:column;gap:3px;align-self:start;position:sticky;top:10px}.filter-label{display:flex;align-items:center;gap:7px;font-size:10px;letter-spacing:1px;color:#98a2b3;padding:6px 12px 14px}.group-filter button{display:flex;align-items:center;gap:9px;border:0;border-radius:8px;padding:11px 12px;cursor:pointer;text-align:left;color:#6b778c;background:none;font:inherit;font-size:12px}.group-filter button.active{background:#eaeefe;color:#5364d9}.group-filter button:hover{background:#edf1f8}.group-filter small{margin-left:auto;font-size:10px;color:#a1aabb}.filter-dot{width:5px;height:5px;border-radius:50%}.tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.tool-card{padding:17px 19px 0;min-width:0;display:flex;flex-direction:column;transition:box-shadow .2s,border-color .2s}.tool-card:hover{border-color:#c9d1ed;box-shadow:0 5px 16px #64748b0a}.tool-card-top{display:flex;align-items:center;justify-content:space-between}.tool-group{font-size:10px;font-weight:600}.favorited{color:#ddb34e}.tool-card-main{border:0;background:none;text-align:left;padding:0;cursor:pointer;flex:1;min-width:0}.tool-card-main h3{font-size:14px;color:#34435b;margin:14px 0 9px;font-weight:600}.tool-card-main p{font-size:11px;line-height:1.8;color:#8d97a9;margin:0 0 14px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:59px}.tool-card-main code{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:9px;color:#a7afbc;margin:0 0 18px}.tool-card-bottom{border-top:1px solid #f0f3f8;padding:13px 0;display:flex;align-items:center;gap:8px;justify-content:space-between}.tool-kind{font-size:9px;color:#8191a3}.tool-kind.write{color:#b99154}.tool-card-bottom button{display:flex;align-items:center;gap:5px;border:0;background:none;color:#6979cf;font-size:10px;cursor:pointer}@media(max-width:1250px){.tool-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:820px){.library-layout{grid-template-columns:1fr}.group-filter{position:static;flex-direction:row;overflow:auto}.group-filter button{white-space:nowrap}.filter-label,.group-filter small{display:none}.tool-grid{grid-template-columns:1fr}.library-toolbar{flex-wrap:wrap}}
</style>
