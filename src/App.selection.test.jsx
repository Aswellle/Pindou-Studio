import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import i18n from './i18n'
import App from './App'

/**
 * M5 集成回归:选区命令必须「一次撤销回到原矩阵」。
 *
 * 背景:选区命令(fill / erase / mirror / rotate)都通过 setCanvas 提交,
 * 而 setCanvas → PUSH 只产生一条历史。若某个命令直接 resetCanvas(清空历史)
 * 或分多次 setCanvas,撤销语义就会被破坏。这个测试用最小 Canvas 桩捕获
 * App 传给画布的 props,再直接调用工具条暴露的命令回调。
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
    return React.createElement('div', { className: 'mock-canvas' })
  })
  return { default: MockCanvas }
})

// Tools 桩:把选区状态、选区命令与网格尺寸变更暴露成按钮,
// 绕开侧栏折叠等视觉细节,只验证 App 的接线与事务语义。
vi.mock('./components/Tools', async () => {
  const React = await import('react')
  return {
    default: ({ selection, onSelectionCommand, onClearSelection, onGridSizeChange }) => React.createElement(
      'div',
      null,
      React.createElement('span', { 'data-testid': 'sel' }, selection ? `${selection.w}x${selection.h}` : 'none'),
      React.createElement('button', { 'data-testid': 'fill', onClick: () => onSelectionCommand('fill') }, 'fill'),
      React.createElement('button', { 'data-testid': 'rotate', onClick: () => onSelectionCommand('rotateCw') }, 'rotate'),
      React.createElement('button', { 'data-testid': 'clear-sel', onClick: onClearSelection }, 'clear-sel'),
      React.createElement('button', { 'data-testid': 'resize', onClick: () => onGridSizeChange(57) }, 'resize')
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

/** 直接驱动 App 的选区状态(Canvas 桩不产生真实拖拽) */
function selectRegion(sel) {
  canvasProps.current.onSelectionChange(sel)
}

describe('App · 选区命令的事务语义(M5)', () => {
  it('填充选区只产生一条历史,一次撤销回到原矩阵', async () => {
    const { getByTestId } = renderApp()

    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    const before = canvasProps.current.committedData.map(r => [...r])

    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))

    fireEvent.click(getByTestId('fill'))
    await waitFor(() => {
      const after = canvasProps.current.committedData
      expect(after[0][0]).toBe('#E53935')
      expect(after[1][1]).toBe('#E53935')
    })

    // 一次撤销:矩阵应完全回到填充前
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => {
      expect(canvasProps.current.committedData).toEqual(before)
    })
  })

  it('旋转后选区宽高互换', async () => {
    const { getByTestId } = renderApp()

    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    selectRegion({ x: 0, y: 0, w: 3, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('3x2'))

    fireEvent.click(getByTestId('rotate'))
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x3'))
  })

  it('无选区时命令只提示、不改画布', async () => {
    const { getByTestId } = renderApp()

    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    const before = canvasProps.current.committedData

    fireEvent.click(getByTestId('clear-sel'))
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('none'))

    fireEvent.click(getByTestId('fill'))
    expect(canvasProps.current.committedData).toBe(before)
  })

  it('切换网格尺寸会清空旧选区(坐标已失效)', async () => {
    const { getByTestId } = renderApp()

    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))

    fireEvent.click(getByTestId('resize'))
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('none'))
  })
})

/**
 * 规格 04 §2:撤销/重做快捷键 `Ctrl/Cmd+Z` 与 `Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y`
 * 必须在非输入框内生效。
 *
 * 回归背景:handler 原先只匹配小写 `e.key === 'z'`。真实浏览器里按住 Shift 时
 * `e.key` 是大写 `'Z'`,`Ctrl+Shift+Z` 这条重做路径实际从未触发(测试里写小写
 * `'z'` 恰好掩盖了它)。这里用浏览器真实键值锁定两条重做路径。
 */
describe('App · 撤销/重做快捷键(规格 04 §2)', () => {
  it('Ctrl+Shift+Z(浏览器真实键值是大写 Z)重做生效', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    fireEvent.click(getByTestId('fill'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const filled = canvasProps.current.committedData.map(r => [...r])

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBeNull())

    // 真实浏览器:Shift+Z → e.key === 'Z'(大写)
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(canvasProps.current.committedData).toEqual(filled))
  })

  it('Ctrl+Y 重做同样生效', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    fireEvent.click(getByTestId('fill'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const filled = canvasProps.current.committedData.map(r => [...r])

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBeNull())
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    await waitFor(() => expect(canvasProps.current.committedData).toEqual(filled))
  })

  it('输入框聚焦时不拦截系统文本撤销', async () => {
    const { container, getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    fireEvent.click(getByTestId('fill'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const filled = canvasProps.current.committedData

    // 造一个聚焦的输入框,键盘事件从它冒泡到 window
    const input = document.createElement('input')
    container.appendChild(input)
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })

    // 画布不得变化(撤销没有发生)
    expect(canvasProps.current.committedData).toBe(filled)
  })
})

/**
 * M5.2:拖拽移动选区内容必须同样「一次撤销回到原矩阵」。
 * Canvas 桩直接调用 onSelectionMove 模拟松手时的偏移上报。
 */
describe('App · 拖拽移动选区(M5.2)', () => {
  it('移动只产生一条历史,一次撤销回到原矩阵', async () => {
    const { getByTestId } = renderApp()

    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    // 先填一块内容:选区 2×2 填充
    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    fireEvent.click(getByTestId('fill'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const before = canvasProps.current.committedData.map(r => [...r])

    // 松手时画布上报偏移:向右下移动 2 格
    canvasProps.current.onSelectionMove({ dx: 2, dy: 2, selection: { x: 0, y: 0, w: 2, h: 2 } })

    await waitFor(() => {
      expect(canvasProps.current.committedData[2][2]).toBe('#E53935')
      expect(canvasProps.current.committedData[0][0]).toBeNull()
    })
    // 选框跟随内容落到新位置
    expect(getByTestId('sel').textContent).toBe('2x2')

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => {
      expect(canvasProps.current.committedData).toEqual(before)
    })
  })

  it('移动全空区域不产生历史(撤销栈不变)', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    const before = canvasProps.current.committedData

    canvasProps.current.onSelectionMove({ dx: 1, dy: 1, selection: { x: 0, y: 0, w: 2, h: 2 } })

    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    expect(canvasProps.current.committedData).toBe(before)
  })
})
