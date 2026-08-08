import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './i18n' // 初始化全局 i18next(与 main.jsx 一致,useTranslation 才能返回真实文案)
import App from './App'

/**
 * App 冒烟测试:确保整棵组件树能挂载渲染。
 *
 * 回归目标(生产白屏类缺陷):组件使用了未 import 的标识符(如 App.jsx 曾缺
 * useCallback)时,JS 编译不报错、单组件测试也测不到 —— 只有整树渲染能暴露
 * ReferenceError: xxx is not defined。
 */

// jsdom 没有 canvas 2d context,安装记录型 mock(与 Canvas.test.jsx 同模式)
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

// jsdom 未实现 window.scrollTo(App 的 body scroll lock 在卸载时调用)
beforeAll(() => { window.scrollTo = () => {} })

// jsdom 无 matchMedia(防御:渲染树中组件若使用则不崩)
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
      // 画布渲染(Canvas 组件挂载)
      expect(container.querySelector('.canvas-container')).toBeTruthy()
      // 桌面调色板渲染(官方色卡)
      expect(container.querySelector('.palette-drawer')).toBeTruthy()
      // 桌面工具抽屉渲染
      expect(container.querySelector('.tools-drawer, .tool-drawer, [class*="tool"]')).toBeTruthy()
    } finally {
      restore2d()
      restoreMedia()
    }
  })
})
