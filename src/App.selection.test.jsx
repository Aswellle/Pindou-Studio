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
    default: ({ selection, tool, onToolChange, onSelectionCommand, onClearSelection, onGridSizeChange, onToggleFillIncludeEmpty, canPaste }) => React.createElement(
      'div',
      null,
      React.createElement('span', { 'data-testid': 'sel' }, selection ? `${selection.w}x${selection.h}` : 'none'),
      React.createElement('span', { 'data-testid': 'tool' }, tool),
      React.createElement('button', { 'data-testid': 'select-tool', onClick: () => onToolChange('select') }, 'select-tool'),
      React.createElement('button', { 'data-testid': 'fill', onClick: () => onSelectionCommand('fill') }, 'fill'),
      React.createElement('button', { 'data-testid': 'rotate', onClick: () => onSelectionCommand('rotateCw') }, 'rotate'),
      React.createElement('button', { 'data-testid': 'copy', onClick: () => onSelectionCommand('copy') }, 'copy'),
      React.createElement('button', { 'data-testid': 'paste', disabled: !canPaste, onClick: () => onSelectionCommand('paste') }, 'paste'),
      React.createElement('button', { 'data-testid': 'clear-sel', onClick: onClearSelection }, 'clear-sel'),
      React.createElement('button', { 'data-testid': 'resize', onClick: () => onGridSizeChange(57) }, 'resize'),
      // 规格 04 §2:填充默认跳过空白格,需要连空白一起填时由这个开关显式打开
      React.createElement('button', { 'data-testid': 'toggle-empty', onClick: () => onToggleFillIncludeEmpty(true) }, 'include-empty')
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

/**
 * 打开「含空白格」开关。
 *
 * 规格 04 §2:选区填充默认只改已有珠子。这些用例的起点是空画布,
 * 要让「填充」真的写入矩阵,必须先显式打开开关 —— 这本身就是对默认值的验证:
 * 没打开时填充空选区不会产生任何变化。
 */
function enableIncludeEmpty(getByTestId) {
  fireEvent.click(getByTestId('toggle-empty'))
}

describe('App · 选区命令的事务语义(M5)', () => {
  it('填充选区只产生一条历史,一次撤销回到原矩阵', async () => {
    const { getByTestId } = renderApp()

    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    const before = canvasProps.current.committedData.map(r => [...r])

    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))

    // 空画布:默认不填空白格,需显式打开开关才能铺满整个选区
    enableIncludeEmpty(getByTestId)
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

  it('默认(开关关闭)填充空选区不写画布', async () => {
    const { getByTestId } = renderApp()

    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    const before = canvasProps.current.committedData

    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))

    // 不打开开关:整片选区都是空白格 → 没有任何可填的珠子
    fireEvent.click(getByTestId('fill'))

    // 画布引用不变(没有压栈),空白格保持空白
    expect(canvasProps.current.committedData).toBe(before)
    expect(canvasProps.current.committedData[0][0]).toBeNull()
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
    enableIncludeEmpty(getByTestId)
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
    enableIncludeEmpty(getByTestId)
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
    enableIncludeEmpty(getByTestId)
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
    enableIncludeEmpty(getByTestId)
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

  it('复制拖动:原件保留、副本落在新位置,一次撤销后副本消失', async () => {
    // 与移动的关键区别:原件必须还在。Alt 拖动是「再要一份」,不是「搬到别处」。
    const { getByTestId } = renderApp()

    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    enableIncludeEmpty(getByTestId)
    fireEvent.click(getByTestId('fill'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    const before = canvasProps.current.committedData.map(r => [...r])

    canvasProps.current.onSelectionMove({
      dx: 2, dy: 2, selection: { x: 0, y: 0, w: 2, h: 2 }, copy: true,
    })

    await waitFor(() => {
      // 副本
      expect(canvasProps.current.committedData[2][2]).toBe('#E53935')
      // 原件仍在原处
      expect(canvasProps.current.committedData[0][0]).toBe('#E53935')
    })

    // 一次撤销:副本消失,原件不动
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => {
      expect(canvasProps.current.committedData).toEqual(before)
    })
  })
})

/**
 * 规格 04 §2 的选区复制 / 粘贴。
 *
 * 关键语义(与拖拽移动刻意不同):
 *   - 复制只读,不改矩阵、不改选区;
 *   - 粘贴以当前选区左上角为落点,**越界裁剪**(拖拽移动则是钳制,因为那里是
 *     在搬动已有珠子,裁掉就是丢工作);
 *   - 粘贴只产生一条历史,一次撤销回到粘贴前;
 *   - 空剪贴板时「粘贴」按钮禁用。
 */
describe('App · 选区复制 / 粘贴(规格 04 §2)', () => {
  /** 画一块 2×2 内容并返回当时的矩阵快照 */
  async function fillBlock(getByTestId) {
    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    enableIncludeEmpty(getByTestId)
    fireEvent.click(getByTestId('fill'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    return canvasProps.current.committedData.map(r => [...r])
  }

  it('复制不改画布、不改选区,之后粘贴按钮可用', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    const before = await fillBlock(getByTestId)
    expect(getByTestId('paste').disabled).toBe(true)

    fireEvent.click(getByTestId('copy'))

    // 复制是只读操作:矩阵与选区都不动,但剪贴板已有内容
    expect(canvasProps.current.committedData).toEqual(before)
    expect(getByTestId('sel').textContent).toBe('2x2')
    await waitFor(() => expect(getByTestId('paste').disabled).toBe(false))
  })

  it('粘贴到当前选区左上角,且可重复多次', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    await fillBlock(getByTestId)
    fireEvent.click(getByTestId('copy'))
    await waitFor(() => expect(getByTestId('paste').disabled).toBe(false))

    // 把选区挪到 (4,4) 再粘贴 → 内容落在 (4,4)
    selectRegion({ x: 4, y: 4, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    fireEvent.click(getByTestId('paste'))
    await waitFor(() => expect(canvasProps.current.committedData[4][4]).toBe('#E53935'))

    // 再贴一次到 (8,8):剪贴板仍在,可重复粘贴
    selectRegion({ x: 8, y: 8, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    fireEvent.click(getByTestId('paste'))
    await waitFor(() => expect(canvasProps.current.committedData[8][8]).toBe('#E53935'))

    // 原位置内容未被搬走(复制不是剪切)
    expect(canvasProps.current.committedData[0][0]).toBe('#E53935')
  })

  it('粘贴只产生一条历史,一次撤销回到粘贴前', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    await fillBlock(getByTestId)
    fireEvent.click(getByTestId('copy'))
    await waitFor(() => expect(getByTestId('paste').disabled).toBe(false))

    const beforePaste = canvasProps.current.committedData.map(r => [...r])

    selectRegion({ x: 4, y: 4, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    fireEvent.click(getByTestId('paste'))
    await waitFor(() => expect(canvasProps.current.committedData[4][4]).toBe('#E53935'))

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(canvasProps.current.committedData).toEqual(beforePaste))
  })

  it('粘贴越界时裁剪到画布内,不报错也不写到网格外', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    // 先做一个 3×3 的块
    selectRegion({ x: 0, y: 0, w: 3, h: 3 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('3x3'))
    enableIncludeEmpty(getByTestId)
    fireEvent.click(getByTestId('fill'))
    await waitFor(() => expect(canvasProps.current.committedData[2][2]).toBe('#E53935'))
    fireEvent.click(getByTestId('copy'))
    await waitFor(() => expect(getByTestId('paste').disabled).toBe(false))

    // 选区贴到右下角(29×29 网格的最后一格),3×3 的块只能落下左上 1 格
    selectRegion({ x: 28, y: 28, w: 1, h: 1 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('1x1'))
    fireEvent.click(getByTestId('paste'))

    await waitFor(() => expect(canvasProps.current.committedData[28][28]).toBe('#E53935'))
    // 越界部分被丢弃,不是钳制到别处
    expect(canvasProps.current.committedData).toHaveLength(29)
    expect(canvasProps.current.committedData[28]).toHaveLength(29)
    // 选框被收回网格内
    expect(getByTestId('sel').textContent).toBe('1x1')
  })

  it('空剪贴板时粘贴按钮禁用', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    expect(getByTestId('paste').disabled).toBe(true)
  })
})

/**
 * 复制 / 粘贴快捷键只在选区工具下接管,且必须放行浏览器原生行为:
 * 页面上选中文字后 Ctrl+C 仍然要能复制文字,不能因为画布有选区就被抢走。
 */
describe('App · 复制/粘贴快捷键的接管边界', () => {
  async function prepare(getByTestId) {
    selectRegion({ x: 0, y: 0, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    enableIncludeEmpty(getByTestId)
    fireEvent.click(getByTestId('fill'))
    await waitFor(() => expect(canvasProps.current.committedData[0][0]).toBe('#E53935'))
    return canvasProps.current.committedData.map(r => [...r])
  }

  it('非选区工具下 Ctrl+C / Ctrl+V 不接管', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())
    expect(getByTestId('tool').textContent).toBe('pencil')

    await prepare(getByTestId)
    // fireEvent 返回 true 表示事件未被 preventDefault —— 也就是浏览器原生行为照常
    expect(fireEvent.keyDown(window, { key: 'c', ctrlKey: true })).toBe(true)
    // 没有复制 → 粘贴仍禁用
    expect(getByTestId('paste').disabled).toBe(true)
  })

  it('选区工具下 Ctrl+C 复制、Ctrl+V 粘贴', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    fireEvent.click(getByTestId('select-tool'))
    await waitFor(() => expect(getByTestId('tool').textContent).toBe('select'))

    await prepare(getByTestId)
    // 接管:preventDefault 掉浏览器的文本复制
    expect(fireEvent.keyDown(window, { key: 'c', ctrlKey: true })).toBe(false)
    await waitFor(() => expect(getByTestId('paste').disabled).toBe(false))

    selectRegion({ x: 4, y: 4, w: 2, h: 2 })
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('2x2'))
    expect(fireEvent.keyDown(window, { key: 'v', ctrlKey: true })).toBe(false)
    await waitFor(() => expect(canvasProps.current.committedData[4][4]).toBe('#E53935'))
  })

  it('输入框聚焦时 Ctrl+V 交给浏览器原生粘贴', async () => {
    const { container, getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    fireEvent.click(getByTestId('select-tool'))
    await prepare(getByTestId)
    fireEvent.click(getByTestId('copy'))
    await waitFor(() => expect(getByTestId('paste').disabled).toBe(false))
    const before = canvasProps.current.committedData

    const input = document.createElement('input')
    container.appendChild(input)
    expect(fireEvent.keyDown(input, { key: 'v', ctrlKey: true })).toBe(true)

    // 画布不得变化(粘贴没有发生)
    expect(canvasProps.current.committedData).toBe(before)
  })

  it('无选区时 Ctrl+C 不接管(留给浏览器复制页面文字)', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    fireEvent.click(getByTestId('select-tool'))
    fireEvent.click(getByTestId('clear-sel'))
    await waitFor(() => expect(getByTestId('sel').textContent).toBe('none'))

    expect(fireEvent.keyDown(window, { key: 'c', ctrlKey: true })).toBe(true)
    expect(getByTestId('paste').disabled).toBe(true)
  })

  it('剪贴板为空时 Ctrl+V 不接管', async () => {
    const { getByTestId } = renderApp()
    await waitFor(() => expect(canvasProps.current?.committedData).toBeTruthy())

    fireEvent.click(getByTestId('select-tool'))
    await prepare(getByTestId)

    // 有选区但没复制过:粘贴快捷键必须放行,而不是吃掉事件却什么都不做
    expect(fireEvent.keyDown(window, { key: 'v', ctrlKey: true })).toBe(true)
  })
})
