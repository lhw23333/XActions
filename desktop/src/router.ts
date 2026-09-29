// Copyright (c) 2024-2026 nich (@nichxbt). Apache-2.0. @author nich (@nichxbt)
import { createRouter, createWebHashHistory } from 'vue-router';
export const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: () => import('./views/Overview.vue'), meta: { title: '工作台概览', section: '工作空间' } },
  { path: '/tools', component: () => import('./views/ToolLibrary.vue'), meta: { title: '功能库', section: '工作空间' } },
  { path: '/compose', component: () => import('./views/Composer.vue'), meta: { title: '内容创作', section: '内容与运营' } },
  { path: '/approvals', component: () => import('./views/Approvals.vue'), meta: { title: '待审批草稿', section: '内容与运营' } },
  { path: '/history', component: () => import('./views/History.vue'), meta: { title: '执行记录', section: '工作空间' } },
  { path: '/settings', component: () => import('./views/Settings.vue'), meta: { title: '连接与设置', section: '工作空间' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
] });
