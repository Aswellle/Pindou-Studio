import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 兼容 VITE_ 前缀(local .env.local)与无前缀/其他前缀(Vercel 环境变量)两种命名
  // (自定义后需显式包含 VITE_,否则默认前缀失效)
  envPrefix: ['VITE_', 'SUPABASE_', 'NEXT_PUBLIC_'],
  build: {
    rollupOptions: {
      input: 'index.html',
      output: {
        // 框架/路由/i18n/云客户端/图标 拆 vendor 分包:代码更新时这些不变的大块
        // 可命中长缓存,不重复下载;主 chunk 因此显著变小(此前 775KB 超 500KB 告警)
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'i18n-vendor': ['i18next', 'react-i18next', 'react-helmet-async'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'icons-vendor': ['lucide-react'],
          // 图表库(recharts)只被后台概览页用:单独分包 + 页面 lazy 加载,
          // 普通用户访问画布/图库不会下载它
          'chart-vendor': ['recharts'],
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
