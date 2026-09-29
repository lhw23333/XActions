// Copyright (c) 2024-2026 nich (@nichxbt). Apache-2.0. @author nich (@nichxbt)
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()], base: './',
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  build: { outDir: 'dist', rollupOptions: { output: { manualChunks: { vue: ['vue', 'vue-router', 'pinia'], elements: ['element-plus', '@element-plus/icons-vue'], charts: ['echarts'] } } } },
});
