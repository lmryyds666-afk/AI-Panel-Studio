/**
 * AI Panel Studio — 前端 Vite 配置
 *
 * - React SWC 插件（快速编译）
 * - Tailwind CSS v4 Vite 插件
 * - 开发代理：/api → http://localhost:3001
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
