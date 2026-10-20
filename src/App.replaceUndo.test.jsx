import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import i18n from './i18n'
import App from './App'

/**
 * 规格 04 §8:颜色替换必须可撤销、可重做。
 *
 * 回归背景:替换命令走 `replaceColor` + 一次 `setCanvas`,但 App 层没有测试锁定
 * 「一次撤销回到替换前」—— 单元测试只覆盖纯函数,对话框测试只覆盖回调。
 * 这里用桩把替换对话框与工具条替换成按钮,直接驱动 App 的真实提交路径。
 */

const { canvasProps } = vi.hoisted(() => ({ canvasProps: { current: null } }))

vi.mock('./services/supabase', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, supabase: null, SUPABASE_URL: '', SUPABASE_DIRECT_URL: '', SUPABASE_PROXIED: false }
})

vi.mock('./components/Canvas', async () => {
  const React = await import('react')
  const MockCanvas = React.forwardRef(function MockCanvas(props, ref) {
    canvasProps.current = props
    React.useImperativeHandle(ref, () => ({
      cancelStroke: () => {}, resetTransform: () => {}, fitToScreen: () => {},
    }))
    // 「画一格红」:让画布上先有一种真实颜色可供替换
    const paint = () => {
      const rows = props.gridHeight || props.gridSize
      const cols = props.gridWidth || props.gridSize
      const next = Array.from({ length: rows }, () => Array(cols).fill(null))
      next[0][0] = '#E53935'
      next[0][1] = '#E53935'
      next[1][0] = '#E53935'
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

vi.mock('./components/Tools', async () => {
  const React = await import('react')
  return {
    default: ({ onOpenReplace }) => React.createElement(
      'div',
      null,
      React.createElement('button', { 'data-testid': 'open-replace', onClick: onOpenReplace }, 'replace')
    ),
  }
})

// 替换对话框桩:确认时直接调用 App 的 onConfirm,验证 App 侧事务语义
vi.mock('./components/ReplaceColorDialog', async () => {
  const React = await import('react')
  return {
    default: ({ open, onConfirm }) => (open
      ? React.createElement('button', {
        'data-testid': 'confirm-replace',
        onClick: () => onConfirm('#E53935', '#43A047'),
      }, 'confirm')
      : null),
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

beforeEach(() => { restoreMedia = installMatchMedia() })

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

describe('App · 颜色替换的事务语义(规格 04 §8)', () => {
  it('替换只产生一条历史,一次撤销回到替换前,重做恢复', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    // 先画三个红格
    fireEvent.click(getByTestId('paint'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const before = canvasProps.current.committedData.map(r => [...r])

    // 打开替换对话框 → 确认 红 → 绿
    fireEvent.click(getByTestId('open-replace'))
    fireEvent.click(await waitFor(() => getByTestId('confirm-replace')))

    await waitFor(() => {
      const after = canvasProps.current.committedData
      expect(after[0][0]).toBe('#43A047')
      expect(after[0][1]).toBe('#43A047')
      expect(after[1][0]).toBe('#43A047')
    })
    const replaced = canvasProps.current.committedData.map(r => [...r])

    // 一次撤销:矩阵完全回到替换前
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(canvasProps.current.committedData).toEqual(before))

    // 重做:回到替换后
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    await waitFor(() => expect(canvasProps.current.committedData).toEqual(replaced))
  })

  it('没有命中时不写历史(撤销栈不增长)', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    // 空画布上替换:replaceColor 返回 data: null,不应压栈
    const empty = canvasProps.current.committedData
    fireEvent.click(getByTestId('open-replace'))
    fireEvent.click(await waitFor(() => getByTestId('confirm-replace')))

    expect(canvasProps.current.committedData).toBe(empty)
  })
})
