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
// 网络字体(桌面端专用):字体 CSS 由构建脚本注入 index.html 的
// <link rel="preload" media="(min-width:1025px)"> 静态声明 ——
// 浏览器原生处理,桌面端异步加载应用、移动端零下载
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
