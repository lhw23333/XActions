<!-- Copyright (c) 2024-2026 nich (@nichxbt). Apache-2.0. @author nich (@nichxbt) -->
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <router-link class="brand" to="/" aria-label="XActions 首页"><span class="brand-mark">𝕏<span></span></span><span class="brand-word">XActions<small>DESKTOP WORKBENCH</small></span></router-link>
      <div class="workspace-pill"><span class="workspace-avatar">X</span><div><strong>我的工作空间</strong><span>本地工作台</span></div><el-icon><Expand /></el-icon></div>
      <nav class="navigation" aria-label="主导航">
        <template v-for="section in sections" :key="section.label">
          <div class="nav-section-label">{{ section.label }}</div>
          <router-link v-for="item in section.items" :key="item.label" :to="item.to" class="nav-link" :class="{ active: isActive(item) }">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
            <span v-if="item.label === '功能库'" class="nav-count">{{ store.tools.length }}</span>
            <span v-if="item.label === '待审批草稿' && store.pendingCount" class="approval-count">{{ store.pendingCount }}</span>
          </router-link>
        </template>
      </nav>
      <div class="sidebar-bottom"><div class="engine-indicator"><span class="status-dot" :class="store.connection.state"></span><div><strong>{{ statusLabel }}</strong><span>{{ store.connection.state === 'connected' ? 'MCP 本地引擎 · v' + (store.connection.version || '3.5.0') : '连接你的本地 XActions' }}</span></div></div><router-link to="/settings" class="settings-link"><el-icon><Setting /></el-icon><span>连接与设置</span><el-icon><ArrowRight /></el-icon></router-link><div class="sidebar-caption">在一个工作台，连接所有可能。<span>v0.1.0</span></div></div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb"><span>{{ route.meta.section || '工作空间' }}</span><el-icon><ArrowRight /></el-icon><strong>{{ pageTitle }}</strong></div>
        <div class="topbar-actions"><button class="global-search" @click="searchOpen = true"><el-icon><Search /></el-icon><span>搜索功能、工具…</span><kbd>Ctrl K</kbd></button><span class="environment-badge"><span class="status-dot connected"></span>本地运行</span><button class="profile-avatar" @click="router.push('/settings')" aria-label="打开设置">XA</button></div>
      </header>
      <main class="main-content">
        <el-alert v-if="!store.desktopAvailable" class="runtime-banner" title="浏览器预览模式" description="可浏览真实功能目录。执行工具、审批和保存配置请使用 Electron 桌面窗口。" type="info" :closable="false" show-icon />
        <el-alert v-else-if="store.connection.state === 'error'" class="runtime-banner" title="引擎连接需要处理" :description="store.connection.error || store.error" type="warning" show-icon :closable="false"><template #default><div>{{ store.connection.error || store.error }} <router-link to="/settings">检查连接设置 →</router-link></div></template></el-alert>
        <router-view v-slot="{ Component }"><transition name="page" mode="out-in"><component :is="Component" /></transition></router-view>
        <footer class="workspace-footer"><span>XActions 工作台</span><span>Electron · Vue 3 · 本地数据</span></footer>
      </main>
    </div>
    <el-dialog v-model="searchOpen" width="650px" title="搜索工作台功能" class="command-dialog" :show-close="true">
      <el-input v-model="searchQuery" placeholder="输入功能名称，如：搜索、分析、草稿" size="large" clearable :prefix-icon="Search" autofocus />
      <div class="command-results"><button v-for="tool in searchResults" :key="tool.name" @click="selectTool(tool.name)"><div><strong>{{ toolTitle(tool.name) }}</strong><small>{{ tool.name }}</small></div><span>{{ groupMeta[tool.group]?.label || tool.group }}</span><el-icon><ArrowRight /></el-icon></button><div v-if="!searchResults.length" class="empty-state">没有找到匹配的功能</div></div>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Grid, Compass, EditPen, CircleCheck, DataLine, Connection, Clock, Setting, Search, ArrowRight, Expand, Collection } from '@element-plus/icons-vue';
import { useWorkbenchStore } from './stores/workbench';
import { groupMeta, toolTitle } from './data/presentation';
const store = useWorkbenchStore(), router = useRouter(), route = useRoute();
const searchOpen = ref(false), searchQuery = ref('');
const sections = [
  { label: '工作空间', items: [{ label: '概览', to: '/', icon: Grid }, { label: '功能库', to: '/tools', icon: Compass }, { label: '我的收藏', to: '/tools?favorites=1', icon: Collection }] },
  { label: '内容与运营', items: [{ label: '内容创作', to: '/compose', icon: EditPen }, { label: '待审批草稿', to: '/approvals', icon: CircleCheck }, { label: '数据与分析', to: '/tools?group=analytics', icon: DataLine }, { label: '自动化与工作流', to: '/tools?group=workflows', icon: Connection }] },
  { label: '活动', items: [{ label: '执行记录', to: '/history', icon: Clock }] },
];
const statusLabel = computed(() => ({ connected: '引擎已连接', connecting: '正在连接引擎', disconnected: '引擎未连接', error: '引擎连接异常' })[store.connection.state]);
const pageTitle = computed(() => route.query.favorites ? '我的收藏' : route.query.group ? groupMeta[String(route.query.group)]?.label || '功能库' : route.meta.title);
function isActive(item: { to: string }) { return route.fullPath === item.to || (item.to === '/tools' && route.path === '/tools' && !route.query.group && !route.query.favorites); }
const searchResults = computed(() => { const q = searchQuery.value.trim().toLowerCase(); return store.tools.filter(t => !q || `${toolTitle(t.name)} ${t.name} ${t.description}`.toLowerCase().includes(q)).slice(0, 8); });
function selectTool(name: string) { searchOpen.value = false; void router.push({ path: '/tools', query: { tool: name } }); }
function keyboard(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchOpen.value = !searchOpen.value; } }
onMounted(() => { void store.initialize(); window.addEventListener('keydown', keyboard); });
onUnmounted(() => { store.dispose(); window.removeEventListener('keydown', keyboard); });
</script>
