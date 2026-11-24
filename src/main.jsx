import React, { useLayoutEffect } from 'react'
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
  mql.addEventListener('change', e => {
    if (e.matches) loadFonts() // 重复触发幂等(import 已缓存,不重复下载)
  })
}
import App from './App'
import ToastProvider from './components/Toast'
import { i18nReady } from './i18n'
import { initTheme } from './utils/theme'
import './index.css'

// 主题接管:首帧主题已由 index.html 内联脚本设置(防白闪),这里做幂等重设 +
// 注册系统明暗变化监听(跟随系统模式下,系统切换深浅色时实时生效)。
initTheme()

// app CSS 由 vite.config.js 的 asyncAppCss 改成 preload + onload。
// 首帧骨架不依赖它,但 React 挂载最好等它到达,否则会出现短暂无样式应用。
// Safari 对 preload 内联 onload 的触发并不可靠:这里主动把 rel 切成 stylesheet,
// 并用 load/error + sheet 轮询 + 2s 超时三重兜底,绝不把挂载无限期卡住。
const appCssReady = (() => {
  const link = document.querySelector('link[data-app-css]')
  if (!link || link.sheet || link.dataset.appCssLoaded === '1') return Promise.resolve()
  return new Promise(resolve => {
    let done = false
    let timer = null
    let poll = null
    const finish = () => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      if (poll) clearInterval(poll)
      resolve()
    }
    link.addEventListener('load', finish, { once: true })
    link.addEventListener('error', finish, { once: true })
    timer = setTimeout(finish, 2000)
    // 有些 Safari 版本不派发 preload 的 load 事件,但 rel 切成 stylesheet 后
    // sheet 会立即可用;轮询能提前放行,不必等满 2 秒。
    poll = setInterval(() => {
      if (link.sheet) finish()
    }, 100)
    if (link.rel !== 'stylesheet') link.rel = 'stylesheet'
  })
})()

// 初始语言非 zh-CN 时先加载该语言包再挂载 React(避免非中文用户看到中文兜底闪烁;
// 加载失败不阻塞,回退 zh-CN)。zh-CN 用户只需让出一个宏任务,不额外等待网络。
Promise.all([i18nReady, appCssReady]).then(() => {
  // 先让出一个宏任务:模块求值结束后浏览器才能把首屏骨架画出来,
  // 否则 React 挂载的同步渲染会一直占着主线程,骨架等到被移除都没上屏。
  setTimeout(() => {
    const rootEl = document.getElementById('root')
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <BootGuard>
          <BrowserRouter>
            <HelmetProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
              <Analytics />
              <SpeedInsights />
            </HelmetProvider>
          </BrowserRouter>
        </BootGuard>
      </React.StrictMode>
    )
  }, 0)
})

/**
 * 预渲染页的静态正文守卫(见 scripts/generate-prerender-html.js)。
 *
 * 构建期会把 #seo-static 正文塞进 #root,供不执行 JS 的抓取端读取;同时在
 * <head> 里用 .js-booting 把它 visibility:hidden,避免用户先看到一屏纯文字。
 *
 * 摘标记必须发生在**应用已经提交到 DOM 之后**。此前是在 createRoot().render()
 * 之前同步摘掉的,而 render() 只是把工作排进调度队列 —— 浏览器完全有机会在
 * 「标记已摘、应用还没上屏」这段间隙画一帧:静态正文的纯文本 + body 的浅色底,
 * 看起来就是一次白屏闪烁。改用 useLayoutEffect:它在 React 提交 DOM 之后、
 * 浏览器绘制之前同步执行,摘标记与首帧应用永远在同一帧内完成。
 */
function BootGuard({ children }) {
  useLayoutEffect(() => {
    document.documentElement.classList.remove('js-booting')
    // 骨架屏只是首帧占位:应用已经提交到 DOM,同帧移除,避免与真实界面重叠。
    document.getElementById('boot-skeleton')?.remove()
  }, [])
  return children
}
