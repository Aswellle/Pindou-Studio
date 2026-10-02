import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './i18n'
import App from './App'

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
  HTMLCanvasElement.prototype.getContext = function () { return ctx }
  return () => { HTMLCanvasElement.prototype.getContext = orig }
}

beforeAll(() => { window.scrollTo = () => {} })

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
      const { container, findByText } = render(
        <MemoryRouter initialEntries={['/create/image']}>
          <HelmetProvider>
            <App />
          </HelmetProvider>
        </MemoryRouter>
      )
      // 量化器自带页面头部必须渲染（lazy 组件，等待 Suspense 解析）
      await waitFor(() => expect(container.querySelector('.quantizer-header')).toBeTruthy())

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
})
