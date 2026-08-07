import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        // 字体 CSS 独立入口:打包为独立 chunk,由构建脚本 preload 注入
        fonts: path.resolve(__dirname, 'src/fonts-entry.js'),
      },
      output: {
        // 框架/路由/i18n 拆 vendor 分包:代码更新时这些不变的大块
        // 可命中长缓存,不重复下载
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'i18n-vendor': ['i18next', 'react-i18next', 'react-helmet-async'],
        },
      },
    },
  },
  server: {
    port: 5280,
    host: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
  }
})
