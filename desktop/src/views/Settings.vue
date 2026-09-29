<!-- Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0. @author nich (@nichxbt) -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Connection, FolderOpened, Key, Check, Refresh } from '@element-plus/icons-vue';
import { useWorkbenchStore } from '../stores/workbench';
import type { SaveConfigInput } from '../../shared/contracts';
const store = useWorkbenchStore();
const busy = ref(false);
const dirty = ref(false);
const form = reactive<SaveConfigInput>({ projectPath: '', nodePath: 'node', chromePath: '', headless: true });
const secrets = reactive({ authToken: '', csrfToken: '', openrouterKey: '' });
const desktop = computed(() => store.desktopAvailable);
const connectionLabels: Record<string,string> = { connected: '已连接', connecting: '正在连接', disconnected: '未连接', error: '连接失败' };
function reset() { Object.assign(form, { projectPath: store.config.projectPath, nodePath: store.config.nodePath, chromePath: store.config.chromePath, headless: store.config.headless }); dirty.value = false; }
watch(() => store.ready, ready => { if (ready && !dirty.value) reset(); }, { immediate: true });
watch(() => store.config, () => { if (!dirty.value) reset(); });
function markDirty() { dirty.value = true; }
async function save() {
  if (!desktop.value || busy.value) return false;
  if (!form.projectPath.trim()) { ElMessage.warning('请填写 XActions 项目目录'); return false; }
  if (!form.nodePath.trim()) { ElMessage.warning('请填写 Node.js 可执行文件路径'); return false; }
  busy.value = true;
  try {
    const input: SaveConfigInput = { ...form };
    if (secrets.authToken.trim()) input.authToken = secrets.authToken.trim();
    if (secrets.csrfToken.trim()) input.csrfToken = secrets.csrfToken.trim();
    if (secrets.openrouterKey.trim()) input.openrouterKey = secrets.openrouterKey.trim();
    await store.saveConfig(input);
    Object.assign(secrets, { authToken: '', csrfToken: '', openrouterKey: '' });
    reset(); ElMessage.success('配置已保存；连接时生效'); return true;
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存配置失败'); return false; } finally { busy.value = false; }
}
async function connect() {
  if (dirty.value || secrets.authToken || secrets.csrfToken || secrets.openrouterKey) { if (!await save()) return; }
  busy.value = true;
  try {
    if (store.connection.state === 'connected') await store.disconnect();
    await store.connect();
    if (store.connection.state === 'connected') { ElMessage.success(`连接成功，发现 ${store.connection.toolCount} 个工具`); await store.loadDrafts(); }
    else ElMessage.error(store.connection.error || '未能连接服务');
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '连接测试失败'); } finally { busy.value = false; }
}
async function disconnect() {
  busy.value = true;
  try { await store.disconnect(); ElMessage.success('已断开连接'); } catch (error) { ElMessage.error(error instanceof Error ? error.message : '断开失败'); } finally { busy.value = false; }
}
async function clearSecrets() {
  try {
    await ElMessageBox.confirm('将删除工作台保存的登录凭据和 OpenRouter 密钥。此操作不会删除执行记录。', '清除凭据', { confirmButtonText: '清除凭据', cancelButtonText: '取消', type: 'warning' });
    busy.value = true; await store.saveConfig({ ...form, clearSecrets: true });
    Object.assign(secrets, { authToken: '', csrfToken: '', openrouterKey: '' }); reset(); ElMessage.success('已清除工作台保存的凭据');
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '清除失败'); } finally { busy.value = false; }
}
</script>
<template>
  <div class="page-stack">
    <div class="page-heading"><div><span class="eyebrow">WORKSPACE SETTINGS</span><h1>连接与设置</h1><p class="muted">连接你的本地工具，管理会话与工作环境。</p></div><el-button type="primary" :icon="Check" :loading="busy" :disabled="!desktop || busy || store.executing" @click="save">保存配置</el-button></div>
    <el-alert v-if="!desktop" title="浏览器预览模式" description="配置与执行需要在 XActions 桌面应用中操作。此处仅展示配置界面。" type="info" show-icon :closable="false" />
    <div class="settings-layout"><div class="settings-main">
      <section class="surface settings-card"><div class="setting-title"><span class="setting-icon"><el-icon><FolderOpened /></el-icon></span><div><h2>本地运行环境</h2><p>指定项目与运行时，启动本机 XActions 服务。</p></div></div>
        <el-form label-position="top" :disabled="!desktop || busy || store.executing" class="settings-form">
          <el-form-item label="XActions 项目目录" required><el-input v-model="form.projectPath" placeholder="包含 src/mcp/server.js 的项目目录" @input="markDirty" /><span class="setting-help">选择 XActions 源码所在目录，不是 desktop 子目录。</span></el-form-item>
          <el-form-item label="Node.js 可执行文件" required><el-input v-model="form.nodePath" placeholder="node 或 node.exe 的绝对路径" @input="markDirty" /><span class="setting-help">使用 Node.js 20 或更高版本。</span></el-form-item>
          <el-form-item label="Chrome / Chromium 路径"><el-input v-model="form.chromePath" placeholder="可选，留空使用引擎默认浏览器" @input="markDirty" /></el-form-item>
          <div class="headless-setting"><div><strong>后台运行浏览器</strong><p>作为支持 headless 参数工具的默认值；其他工具使用引擎自身设置。</p></div><el-switch v-model="form.headless" @change="markDirty" /></div>
        </el-form>
      </section>
      <section class="surface settings-card"><div class="setting-title"><span class="setting-icon"><el-icon><Key /></el-icon></span><div><h2>会话与密钥</h2><p>凭据仅可更新；保存后不会在界面回显。</p></div></div>
        <el-form label-position="top" :disabled="!desktop || busy || store.executing" class="settings-form">
          <el-form-item><template #label>登录凭据 <code>auth_token</code><el-tag v-if="store.config.sessionConfigured" size="small" type="success" effect="plain">已配置</el-tag></template><el-input v-model="secrets.authToken" type="password" autocomplete="new-password" :placeholder="store.config.sessionConfigured ? '留空保留现有凭据' : '输入 auth_token'" /></el-form-item>
          <el-form-item><template #label>CSRF 凭据 <code>ct0</code><el-tag v-if="store.config.csrfConfigured" size="small" type="success" effect="plain">已配置</el-tag></template><el-input v-model="secrets.csrfToken" type="password" autocomplete="new-password" :placeholder="store.config.csrfConfigured ? '留空保留现有凭据' : '输入 ct0'" /><span class="setting-help">写入操作通常同时需要登录凭据与 CSRF 凭据。</span></el-form-item>
          <el-form-item><template #label>OpenRouter API Key<el-tag v-if="store.config.aiConfigured" size="small" type="success" effect="plain">已配置</el-tag></template><el-input v-model="secrets.openrouterKey" type="password" autocomplete="new-password" :placeholder="store.config.aiConfigured ? '留空保留现有密钥' : '可选，用于需要模型调用的 AI 工具'" /><span class="setting-help">仅执行相应 AI 工具时使用，调用费用由提供商计收。</span></el-form-item>
          <el-button text type="danger" size="small" :disabled="!desktop || busy || store.executing || !(store.config.sessionConfigured || store.config.csrfConfigured || store.config.aiConfigured)" @click="clearSecrets">清除工作台保存的凭据</el-button>
        </el-form>
      </section>
    </div><aside class="settings-aside">
      <section class="surface connection-card"><span class="eyebrow">CONNECTION STATUS</span><div class="connection-status"><span :class="['connection-dot',store.connection.state]"></span><h2>{{ connectionLabels[store.connection.state] }}</h2></div><dl><dt>服务模式</dt><dd>本机 MCP · stdio</dd><dt>已发现工具</dt><dd>{{ store.connection.toolCount || '—' }}</dd><dt>服务版本</dt><dd>{{ store.connection.version || '—' }}</dd><dt>写入审批</dt><dd class="approval-enabled">始终启用</dd></dl><el-alert v-if="store.connection.error" :title="store.connection.error" type="error" :closable="false" /><el-button type="primary" :icon="store.connection.state === 'connected' ? Refresh : Connection" :loading="busy || store.connection.state === 'connecting'" :disabled="!desktop || busy || store.executing" @click="connect">{{ store.connection.state === 'connected' ? '保存并重新连接' : '保存并测试连接' }}</el-button><el-button v-if="store.connection.state === 'connected'" :disabled="busy || store.executing" @click="disconnect">断开连接</el-button></section>
      <section class="data-location"><span class="eyebrow">LOCAL DATA</span><h3>数据留在本机</h3><p>配置与执行记录保存在工作台数据目录中。</p><code>{{ store.config.dataPath || '启动桌面应用后显示存储位置' }}</code></section>
    </aside></div>
  </div>
</template>
<style scoped>
.settings-layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:24px;align-items:start}.settings-main{display:grid;gap:22px}.settings-card{padding:27px 30px}.setting-title{display:flex;gap:14px;align-items:flex-start}.setting-icon{display:grid;place-items:center;width:35px;height:35px;background:#f0f3fb;border-radius:9px;color:#8b9bc2;font-size:17px}.setting-title h2{font-size:15px;color:#56647b;margin:0 0 8px;font-weight:600}.setting-title p{font-size:11px;color:#99a5b6;margin:0;line-height:1.7}.settings-form{margin-top:27px}.settings-form :deep(.el-form-item__label){color:#697a93;font-size:12px;gap:8px;align-items:center}.settings-form :deep(.el-form-item__label code){color:#aab5c4;font-size:10px}.settings-form :deep(.el-input__inner){font-size:12px}.setting-help{color:#a5afbd;display:block;font-size:10px;margin-top:7px;line-height:1.7}.headless-setting{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #eef1f6;padding-top:18px;margin-top:7px}.headless-setting strong{font-size:12px;font-weight:500;color:#728199}.headless-setting p{font-size:10px;color:#a1adbf;margin:7px 0 0}.connection-card{padding:25px}.connection-status{display:flex;align-items:center;gap:10px;margin:22px 0}.connection-status h2{font-size:19px;font-weight:550;color:#617089;margin:0}.connection-dot{width:8px;height:8px;border-radius:50%;background:#b8c2d1}.connection-dot.connected{background:#47b999;box-shadow:0 0 0 4px #ebf9f3}.connection-dot.error{background:#e38484}.connection-dot.connecting{background:#e3b76c}.connection-card dl{display:grid;grid-template-columns:1fr auto;gap:17px 10px;font-size:11px;margin:25px 0}.connection-card dt{color:#a3aec0}.connection-card dd{margin:0;color:#7c8aa1;word-break:break-word}.connection-card dd.approval-enabled{color:#6aa894}.connection-card>.el-button{width:100%;margin:15px 0 0}.connection-card>.el-button+.el-button{margin-top:9px}.data-location{padding:28px 5px}.data-location h3{font-size:12px;color:#8c9ab0;font-weight:500;margin:15px 0 7px}.data-location p{font-size:11px;color:#a7b1bf;line-height:1.8}.data-location code{display:block;font-size:10px;word-break:break-all;line-height:1.9;color:#b1bbc9}@media(max-width:1030px){.settings-layout{grid-template-columns:1fr}.settings-aside{display:grid;grid-template-columns:1fr 1fr;gap:22px}}
</style>
