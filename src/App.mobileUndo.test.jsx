import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './i18n'
import App from './App'

/**
 * R2 回归测试:移动端 undo/redo 必须走 handleUndo/handleRedo(先 cancelStroke)。
 *
 * 背景:App.jsx 桌面端传的是 `handleUndo`/`handleRedo`(内部调用
 * `canvasRef.current.cancelStroke()`),移动端曾直接传 `undo`/`redo`。
 * 笔画进行中点击撤销时,活动笔画不会被丢弃,手指抬起触发 commitStroke
 * 会把笔画前快照重新 PUSH 回去,撤销结果被回滚。
 *
 * 这类接线错误只存在于 JSX 传参层,组件单测(Canvas.test)覆盖不到,
 * 因此这里把 Canvas 与 MobileToolbar 换成最小桩,直接断言 App 的接线契约。
 */

const { cancelStrokeSpy } = vi.hoisted(() => ({ cancelStrokeSpy: vi.fn() }))

// App 冒烟测试同款:固定「云端未配置」路径,避免真实 Supabase 连接
vi.mock('./services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

// Canvas 桩:暴露 cancelStroke,并记录调用
vi.mock('./components/Canvas', async () => {
  const React = await import('react')
  const MockCanvas = React.forwardRef(function MockCanvas(_props, ref) {
    React.useImperativeHandle(ref, () => ({
      cancelStroke: cancelStrokeSpy,
      resetTransform: () => {},
      fitToScreen: () => {},
    }))
    return React.createElement('div', { className: 'mock-canvas' })
  })
  return { default: MockCanvas }
})

// MobileToolbar 桩:把 onUndo/onRedo 直接暴露成可点击按钮
vi.mock('./components/Tools/MobileToolbar', async () => {
  const React = await import('react')
  return {
    default: ({ onUndo, onRedo }) => React.createElement(
      'div',
      null,
      React.createElement('button', { 'data-testid': 'mobile-undo', onClick: onUndo }, 'undo'),
      React.createElement('button', { 'data-testid': 'mobile-redo', onClick: onRedo }, 'redo')
    ),
  }
})

function installMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => { window.matchMedia = orig }
}

let restoreMedia
let origInnerWidth

beforeAll(() => { window.scrollTo = () => {} })

beforeEach(() => {
  // useResponsive 首帧按 window.innerWidth 判定;500px → isMobile
  origInnerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
  restoreMedia = installMatchMedia()
  cancelStrokeSpy.mockClear()
})

afterEach(() => {
  cleanup()
  restoreMedia()
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: origInnerWidth })
  localStorage.clear()
})

function renderMobileApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </MemoryRouter>
  )
}

describe('App 移动端撤销/重做接线(R2)', () => {
  it('移动端撤销前先取消进行中的笔画', () => {
    const { getByTestId } = renderMobileApp()
    fireEvent.click(getByTestId('mobile-undo'))
    expect(cancelStrokeSpy).toHaveBeenCalledTimes(1)
  })

  it('移动端重做前先取消进行中的笔画', () => {
    const { getByTestId } = renderMobileApp()
    fireEvent.click(getByTestId('mobile-redo'))
    expect(cancelStrokeSpy).toHaveBeenCalledTimes(1)
  })
})
