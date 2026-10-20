import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import i18n from './i18n'
import App from './App'

/**
 * 规格 04 §3:输入框编辑、网格尺寸切换、项目切换时应取消未完成笔画。
 *
 * 回归背景:App 的撤销/重做已接 cancelStroke(R2),但「替换画布」的路径
 * (换网格 / 载入模板 / 载入作品 / 清空 / 应用量化结果)没有。笔画进行中
 * 换网格,旧尺寸的累加器会在松手时把旧矩阵提交回来,覆盖新画布。
 * 这类接线只在 JSX/回调层,Canvas 单测覆盖不到,因此用桩直接断言调用。
 */

const { cancelStrokeSpy } = vi.hoisted(() => ({ cancelStrokeSpy: vi.fn() }))

vi.mock('./services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

vi.mock('./components/Canvas', async () => {
  const React = await import('react')
  const MockCanvas = React.forwardRef(function MockCanvas(props, ref) {
    React.useImperativeHandle(ref, () => ({
      cancelStroke: cancelStrokeSpy,
      resetTransform: () => {},
      fitToScreen: () => {},
    }))
    // 「画一格」按钮:让测试先把画布变成非空,再验证清空路径的取消行为
    const paint = () => {
      const rows = props.gridHeight || props.gridSize
      const cols = props.gridWidth || props.gridSize
      const next = Array.from({ length: rows }, () => Array(cols).fill(null))
      next[0][0] = '#E53935'
      props.onCanvasChange(next)
    }
    return React.createElement(
      'div',
      { className: 'mock-canvas' },
      React.createElement('button', { 'data-testid': 'paint', onClick: paint }, 'paint')
    )
  })
  return { default: MockCanvas }
})

// 把「换网格」「清空画布」暴露成按钮,只验证 App 是否先 cancelStroke
vi.mock('./components/Tools', async () => {
  const React = await import('react')
  return {
    default: ({ onGridSizeChange, onClear }) => React.createElement(
      'div',
      null,
      React.createElement('button', { 'data-testid': 'resize', onClick: () => onGridSizeChange(57) }, 'resize'),
      React.createElement('button', { 'data-testid': 'clear', onClick: onClear }, 'clear')
    ),
  }
})

function installMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = (query) => ({
    matches: true, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => { window.matchMedia = orig }
}

let restoreMedia

beforeAll(async () => {
  window.scrollTo = () => {}
  await i18n.changeLanguage('zh-CN')
})

beforeEach(() => {
  restoreMedia = installMatchMedia()
  cancelStrokeSpy.mockClear()
})

afterEach(() => {
  cleanup()
  restoreMedia()
  localStorage.clear()
})

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </MemoryRouter>
  )
}

describe('App · 替换画布前取消活动笔画(规格 04 §3)', () => {
  it('切换网格尺寸先取消活动笔画', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(getByTestId('resize')).toBeTruthy())

    fireEvent.click(getByTestId('resize'))
    expect(cancelStrokeSpy).toHaveBeenCalled()
  })

  it('清空画布先取消活动笔画', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(getByTestId('clear')).toBeTruthy())

    // 空画布上点清空是空操作(既有语义),先画一格让清空真正发生
    fireEvent.click(getByTestId('paint'))
    await waitFor(() => expect(getByTestId('paint')).toBeTruthy())

    fireEvent.click(getByTestId('clear'))
    expect(cancelStrokeSpy).toHaveBeenCalled()
  })

  it('空画布上点清空不触发取消(没有可清的内容,也不该打断任何状态)', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(getByTestId('clear')).toBeTruthy())

    fireEvent.click(getByTestId('clear'))
    expect(cancelStrokeSpy).not.toHaveBeenCalled()
  })

  it('撤销/重做仍先取消活动笔画(R2 契约保持)', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(getByTestId('resize')).toBeTruthy())
    cancelStrokeSpy.mockClear()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(cancelStrokeSpy).toHaveBeenCalled()
  })
})
