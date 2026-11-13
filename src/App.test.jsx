import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { vi } from 'vitest'
import './i18n'
import App from './App'

// 冒烟测试必须与环境无关:本机 .env.local 配了真实项目时,不 mock 会让 App 建立真实
// Supabase 客户端并发起网络/Realtime 连接(Node undici WebSocket 在测试环境抛未捕获异常,
// 曾使整个套件 exit 1)。固定为「云端未配置」路径 —— 与 CI(无 env)行为一致。
vi.mock('./services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

function installMock2dContext() {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {}, stroke: () => {}, clearRect: () => {},
    fillText: () => {}, arc: () => {}, fill: () => {}, save: () => {}, restore: () => {},
    clip: () => {}, translate: () => {}, scale: () => {}, drawImage: () => {},
    setTransform: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = () => ctx
  return () => { HTMLCanvasElement.prototype.getContext = orig }
}

beforeAll(async () => {
  window.scrollTo = () => {}
  // 断言中文文案(去噪/导出):jsdom 的浏览器语言探测会落到 en-US,先固定语言
  const i18n = (await import('./i18n')).default
  await i18n.changeLanguage('zh-CN')
})

function installMockMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => { window.matchMedia = orig }
}

describe('App smoke test', () => {
  it('renders the full component tree without crashing', () => {
    const restore2d = installMock2dContext()
    const restoreMedia = installMockMatchMedia()
    try {
      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <HelmetProvider>
            <App />
          </HelmetProvider>
        </MemoryRouter>
      )
      expect(container).toBeTruthy()
    } finally {
      restore2d()
      restoreMedia()
    }
  })

  it('/create/image 渲染独立功能页，不继承站点导航与登录入口', async () => {
    const restore2d = installMock2dContext()
    const restoreMedia = installMockMatchMedia()
    try {
      const { container } = render(
        <MemoryRouter initialEntries={['/create/image']}>
          <HelmetProvider>
            <App />
          </HelmetProvider>
        </MemoryRouter>
      )
      // 量化器自带页面头部必须渲染（lazy 组件，等待 Suspense 解析；
      // 全量并发跑套件时动态 chunk 导入可能远超默认 1s,放宽超时避免顺序性误报）
      await waitFor(() => expect(container.querySelector('.quantizer-header')).toBeTruthy(), { timeout: 10000 })

      // 站点导航(菜单/登录/语言切换)不得出现在该功能页
      expect(container.querySelector('header.header')).toBeNull()
      expect(container.querySelector('.language-select')).toBeNull()
      const authEntries = Array.from(container.querySelectorAll('button, a'))
        .filter((el) => /^(登录|注册)$/.test((el.textContent || '').trim()))
      expect(authEntries).toHaveLength(0)
    } finally {
      restore2d()
      restoreMedia()
    }
  })

  it('/editor 深链显示空态引导,不继承站点导航', async () => {
    const restore2d = installMock2dContext()
    const restoreMedia = installMockMatchMedia()
    try {
      const { container } = render(
        <MemoryRouter initialEntries={['/editor']}>
          <HelmetProvider>
            <App />
          </HelmetProvider>
        </MemoryRouter>
      )
      // 编辑器是 lazy 路由:没有转换结果/作品来源时是空态引导,
      // 不能把用户按在一整套工具和 0 颗的空白网格前。
      await waitFor(() => expect(container.querySelector('.editor-empty')).toBeTruthy(), { timeout: 10000 })
      expect(container.textContent).toContain('还没有可编辑的图纸')
      expect(container.querySelector('.editor-console')).toBeNull()

      // 站点导航不得出现
      expect(container.querySelector('header.header')).toBeNull()
      expect(container.querySelector('.language-select')).toBeNull()

      // 空态给出两个明确出口:去转换 / 回首页
      expect(container.querySelector('.editor-empty-primary')).toBeTruthy()
      expect(container.querySelector('.editor-empty-ghost')).toBeTruthy()
    } finally {
      restore2d()
      restoreMedia()
    }
  })
})
