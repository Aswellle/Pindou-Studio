import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: 'index.html',
      output: {
        // 框架/路由/i18n 拆 vendor 分包:代码更新时这些不变的大块
        // 可命中长缓存,不重复下载
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'i18n-vendor': ['i18next', 'react-i18next', 'react-helmet-async'],
        },
      },
    },
    // 字体 woff2 一律外链,不做 base64 内联:
    // 默认 assetsInlineLimit(4096B)会把 ≤4KB 的 noto-sans-sc 子集内联进 CSS,
    // 绕过 unicode-range 按需加载与浏览器 HTTP 缓存。其余资源保持默认行为。
    assetsInlineLimit: (filePath, content) => {
      if (filePath.endsWith('.woff2')) return false
      return Buffer.byteLength(content) <= 4096
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
