import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
// 自托管网络字体(按 unicode-range 子集按需加载,不依赖外网 CDN):
// - Noto Sans SC(思源黑体):桌面端正文,替代 Windows 微软雅黑的粗糙渲染
// - LXGW WenKai(霞鹜文楷):桌面端标题/品牌/强调,手作艺术感
// 仅桌面端(≥1025px)应用(index.css 中的媒体查询),移动端保持系统字体栈
// 网络字体(桌面端专用,index.css 中 ≥1025px 媒体查询才应用):
// JS 动态加载字体 CSS(url 已重写为可解析路径,Vite 打包字体文件)——
// 桌面端异步加载应用,移动端不执行不下载;加载失败不影响功能。
// 门控同时监听视口变化:窗口加载后从窄变宽跨过 1025px 时补加载
// (index.css 用响应式 @media 应用字体,一次性门控会造成二者失步)。
const DESKTOP_QUERY = '(min-width: 1025px)'

async function loadFonts() {
  try {
    await import('./styles/fonts-all.css')
  } catch (e) {
    console.warn('字体加载失败:', e)
    return
  }
  // CSS chunk 加载成功 ≠ 字体资源就绪(个别 woff2 可能 404,import 仍 resolve)。
  // 主动触发 @font-face 加载并校验,失败时留下可观测信号。
  if ('fonts' in document) {
    try {
      await Promise.all([
        document.fonts.load('1em "Noto Sans SC"', '拼豆Studio 一二三四五六七八九〇'),
        document.fonts.load('1em "LXGW WenKai"', '拼豆Studio 一二三四五六七八九〇'),
      ])
    } catch (e) {
      console.warn('字体资源加载失败:', e)
    }
  }
}

// jsdom 等测试环境无 matchMedia → 直接跳过字体逻辑,不抛错
const mql = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null
if (mql) {
  if (mql.matches) {
    loadFonts()
  }
  mql.addEventListener('change', (e) => {
    if (e.matches) loadFonts() // 重复触发幂等(import 已缓存,不重复下载)
  })
}
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <HelmetProvider>
        <App />
        <Analytics />
        <SpeedInsights />
      </HelmetProvider>
    </BrowserRouter>
  </React.StrictMode>
)
