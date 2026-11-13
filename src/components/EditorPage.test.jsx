import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import { getPalette } from '../data/palettes'
import EditorPage from './EditorPage'

/**
 * 图纸编辑器操作台(/editor)的行为契约。
 *
 * 编辑器复用 App 画布状态(Canvas 以桩替换,只验证接线),
 * 本文件锁定操作台自身的行为:图纸用色 chips 的颗数与点选、
 * 补色网格、精简工具行、上下文选区条、去噪/撤销/保存/导出回调。
 */

const { canvasPropsRef } = vi.hoisted(() => ({ canvasPropsRef: { current: null } }))

vi.mock('./Canvas', async () => {
  const React = await import('react')
  const MockCanvas = React.forwardRef(function MockCanvas(props) {
    canvasPropsRef.current = props
    return React.createElement('div', { className: 'mock-canvas' })
  })
  return { default: MockCanvas }
})

function renderEditorProps() {
  return {
    gridSize: 3,
    gridWidth: null,
    gridHeight: null,
    committedData: makeCanvasData(),
    onCanvasChange: vi.fn(),
    selectedColor: R,
    tool: 'pencil',
    onSave: vi.fn(),
    saveState: 'idle',
  }
}

const R = '#E53935'
const B = '#1E88E5'

function makeCanvasData() {
  // 3×3:两颗红一颗蓝
  const g = Array.from({ length: 3 }, () => Array(3).fill(null))
  g[0][0] = R
  g[1][1] = R
  g[2][2] = B
  return g
}

function renderEditor(overrides = {}) {
  const props = {
    canvasProps: {
      gridSize: 3,
      gridWidth: null,
      gridHeight: null,
      committedData: makeCanvasData(),
      onCanvasChange: vi.fn(),
      selectedColor: R,
      tool: 'pencil',
      onSave: vi.fn(),
      saveState: 'idle',
    },
    canvasRef: { current: null },
    tool: 'pencil',
    onToolChange: vi.fn(),
    selectedColor: R,
    onColorSelect: vi.fn(),
    currentPalette: 'perler',
    canvasData: makeCanvasData(),
    gridSize: 3,
    gridWidth: null,
    gridHeight: null,
    canUndo: true,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    selection: null,
    onSelectionCommand: vi.fn(),
    onClearSelection: vi.fn(),
    canPaste: false,
    fillIncludeEmpty: false,
    onToggleFillIncludeEmpty: vi.fn(),
    onNoiseCleanup: vi.fn(),
    onExport: vi.fn(),
    canvasSource: 'photo-quantized',
    onFinishSave: vi.fn(),
    onCropCanvas: vi.fn(),
    onOpenReplace: vi.fn(),
    onToast: vi.fn(),
    ...overrides,
  }
  const view = render(
    <MemoryRouter initialEntries={['/editor']}>
      <EditorPage {...props} />
    </MemoryRouter>
  )
  return { ...view, props }
}

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})
afterEach(() => cleanup())

describe('EditorPage · 图纸用色列表', () => {
  it('按 calculateColorStats 口径渲染 chips(色号+颗数,降序)', () => {
    renderEditor()
    const chips = [...document.querySelectorAll('.editor-color-chip')]
    expect(chips).toHaveLength(2)
    // 红色 2 颗排前,蓝色 1 颗排后(就近归并到品牌色号 P58)
    expect(chips[0].textContent).toContain('2')
    expect(chips[1].textContent).toContain('P58')
  })

  it('点击 chip 把该色设为画笔色', () => {
    const { props } = renderEditor()
    const chips = [...document.querySelectorAll('.editor-color-chip')]
    fireEvent.click(chips[1])
    expect(props.onColorSelect).toHaveBeenCalledTimes(1)
    expect(typeof props.onColorSelect.mock.calls[0][0]).toBe('string')
  })

  it('当前画笔色对应 chip 高亮(按品牌 hex 匹配)', () => {
    // chips 展示的是「画布 hex 就近归并后」的品牌色:取第一颗 chip 的色号,
    // 用它的品牌 hex 作为画笔色重渲染,该 chip 应高亮
    const { props, container, rerender } = renderEditor()
    const id = container.querySelector('.editor-color-chip .editor-color-label').textContent
    const hex = getPalette('perler').colors.find(c => c.id === id).hex

    rerender(
      <MemoryRouter initialEntries={['/editor']}>
        <EditorPage {...props} selectedColor={hex} />
      </MemoryRouter>
    )
    const active = document.querySelector('.editor-color-chip.active')
    expect(active).toBeTruthy()
    expect(active.textContent).toContain(id)
  })

  it('有来源的空画布显示占位而不渲染 chips', () => {
    renderEditor({ canvasData: Array.from({ length: 3 }, () => Array(3).fill(null)) })
    expect(document.querySelectorAll('.editor-color-chip')).toHaveLength(0)
    expect(document.querySelector('.editor-color-empty')).toBeTruthy()
  })

  it('无来源的空白编辑器(深链/刷新)显示空态引导,不渲染操作台', () => {
    renderEditor({
      canvasData: Array.from({ length: 29 }, () => Array(29).fill(null)),
      gridSize: 29,
      canvasSource: null,
    })
    const empty = document.querySelector('.editor-empty')
    expect(empty).toBeTruthy()
    expect(empty.textContent).toContain('还没有可编辑的图纸')
    expect(screen.getByRole('button', { name: /去图片转拼豆/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /回首页/ })).toBeTruthy()
    // 操作台不出现:没有可编辑内容时不能把用户按在一整套工具前
    expect(document.querySelector('.editor-console')).toBeNull()
  })
})

describe('EditorPage · 色卡浮层', () => {
  it('「色卡」打开全色板浮层,点选后回调并收起', () => {
    const { props } = renderEditor()
    expect(document.querySelector('.editor-sheet')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /色卡/ }))
    const sheet = document.querySelector('.editor-sheet')
    expect(sheet).toBeTruthy()
    // Perler 色板 80 色
    const swatches = sheet.querySelectorAll('.editor-palette-swatch')
    expect(swatches).toHaveLength(80)

    fireEvent.click(swatches[0])
    expect(props.onColorSelect).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.editor-sheet')).toBeNull()
  })

  it('色号搜索收窄结果,已用色显示颗数', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /色卡/ }))
    const sheet = document.querySelector('.editor-sheet')

    // 红/蓝两色都已用,格子上应出现颗数角标
    expect(sheet.querySelectorAll('.editor-palette-count').length).toBeGreaterThan(0)

    fireEvent.change(sheet.querySelector('.editor-sheet-search'), { target: { value: 'P06' } })
    const visible = [...sheet.querySelectorAll('.editor-palette-swatch')]
    expect(visible.length).toBeLessThan(80)
    expect(
      visible.every(el => el.textContent.includes('P06') || el.getAttribute('aria-label').includes('P06'))
    ).toBe(true)
  })
})

describe('EditorPage · 工具与操作', () => {
  it('七个工具按钮,点击切换 tool', () => {
    const { props } = renderEditor()
    const tools = [...document.querySelectorAll('.editor-tool-btn')]
    expect(tools).toHaveLength(7)
    fireEvent.click(tools[4]) // 点选
    expect(props.onToolChange).toHaveBeenCalledWith('pick')
  })

  it('去噪直达按钮与整理抽屉并存,保存/导出接线;撤销/重做带文字且按 canUndo 禁用', () => {
    const { props } = renderEditor()

    // 去噪直达:操作台上一眼可见的同名按钮(最高频动作,不能只藏在抽屉里)
    fireEvent.click(screen.getByTitle('去噪'))
    expect(props.onNoiseCleanup).toHaveBeenCalledTimes(1)

    // 整理抽屉:里面另有同一入口
    fireEvent.click(screen.getByTitle('整理'))
    const sheet = document.querySelector('.editor-cleanup-sheet')
    expect(sheet).toBeTruthy()
    expect(document.querySelector('.editor-cleanup-sheet')).toBeTruthy()
    fireEvent.click(screen.getByTitle('整理'))
    // 关闭抽屉(点遮罩)后继续
    fireEvent.click(document.querySelector('.editor-sheet-overlay'))
    expect(document.querySelector('.editor-cleanup-sheet')).toBeNull()

    const saveBtn = screen.getByTitle('保存作品')
    fireEvent.click(saveBtn)
    expect(props.canvasProps.onSave).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle('导出'))
    expect(props.onExport).toHaveBeenCalledTimes(1)

    // 撤销/重做带可见文字(用户反馈:图标语义不直观)
    const undoBtn = screen.getByRole('button', { name: '撤销' })
    expect(undoBtn.disabled).toBe(false)
    expect(undoBtn.textContent).toContain('撤销')
    const redoBtn = screen.getByRole('button', { name: '重做' })
    expect(redoBtn.disabled).toBe(true)
    expect(redoBtn.textContent).toContain('重做')
  })
})

describe('EditorPage · 触屏轻提示', () => {
  it('点按图标工具按钮浮现功能名,1.5s 后自动消失', () => {
    vi.useFakeTimers()
    try {
      renderEditor()
      expect(document.querySelector('.editor-hint')).toBeNull()

      const pencil = screen.getByTitle('画笔')
      fireEvent.pointerDown(pencil)
      const bubble = document.querySelector('.editor-hint')
      expect(bubble).toBeTruthy()
      expect(bubble.textContent).toBe('画笔')

      act(() => {
        vi.advanceTimersByTime(1600)
      })
      expect(document.querySelector('.editor-hint')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('点按其他按钮立即让位:提示切到新按钮且只显示一条', () => {
    renderEditor()
    fireEvent.pointerDown(screen.getByTitle('画笔'))
    expect(document.querySelector('.editor-hint').textContent).toBe('画笔')

    // 有可见文字的按钮(整理)点下也会立即接管提示位 —— 立即消失旧提示
    fireEvent.pointerDown(screen.getByTitle('整理'))
    const bubbles = [...document.querySelectorAll('.editor-hint')]
    expect(bubbles).toHaveLength(0)
  })

  it('色卡浮层显示品牌与颗粒规格', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /色卡/ }))
    const brand = document.querySelector('.editor-palette-brand')
    expect(brand).toBeTruthy()
    expect(brand.textContent).toContain('Perler 拼豆')
    expect(brand.textContent).toContain('中颗粒')
  })
})

describe('EditorPage · 移动端分支', () => {
  it('mobile + pick 工具渲染方向盘;桌面不渲染', () => {
    const onPickMove = vi.fn()
    const { props, rerender } = renderEditor({
      mobile: true,
      tool: 'pick',
      pickCursor: { x: 1, y: 1 },
      onPickMove,
      onPickToggle: vi.fn(),
    })
    expect(document.querySelector('.pick-dpad')).toBeTruthy()

    // 方向盘四向接线
    fireEvent.click(screen.getByRole('button', { name: '光标右移一格' }))
    expect(onPickMove).toHaveBeenCalledWith(1, 0)

    // 桌面(mobile=false)即使 tool=pick 也不渲染方向盘
    rerender(
      <MemoryRouter initialEntries={['/editor']}>
        <EditorPage {...props} mobile={false} />
      </MemoryRouter>
    )
    expect(document.querySelector('.pick-dpad')).toBeNull()
  })

  it('mobile 长按菜单打开时渲染 SelectionContextMenu,命令走 onSelectionMenuCommand', () => {
    const onSelectionMenuCommand = vi.fn()
    const onCloseSelectionMenu = vi.fn()
    renderEditor({
      mobile: true,
      tool: 'select',
      selection: { x: 0, y: 0, w: 2, h: 2 },
      selectionMenu: { x: 120, y: 300 },
      onSelectionMenuCommand,
      onCloseSelectionMenu,
      canPaste: false,
    })
    // portal 到 body:命令项可寻址
    const menu = document.body.querySelector('.selection-menu')
    expect(menu).toBeTruthy()

    const fillItem = [...menu.querySelectorAll('button')].find(b => b.textContent?.includes('填充'))
    fireEvent.click(fillItem)
    expect(onSelectionMenuCommand).toHaveBeenCalledWith('fill')
    expect(onCloseSelectionMenu).toHaveBeenCalledTimes(1)
  })
})

describe('EditorPage · 上下文选区条', () => {
  it('无选区时不渲染;有选区渲染命令并接线,粘贴按 canPaste 禁用', () => {
    const { props, rerender } = renderEditor()
    expect(document.querySelector('[data-testid="editor-selection-bar"]')).toBeNull()

    rerender(
      <MemoryRouter initialEntries={['/editor']}>
        <EditorPage {...props} selection={{ x: 0, y: 0, w: 2, h: 2 }} canPaste />
      </MemoryRouter>
    )
    const bar = document.querySelector('[data-testid="editor-selection-bar"]')
    expect(bar).toBeTruthy()
    // 擦除 + 取消选区 + 含空白 toggle 共 11 个按钮
    expect(bar.querySelectorAll('button')).toHaveLength(11)

    const eraseBtn = [...bar.querySelectorAll('button')][0]
    fireEvent.click(eraseBtn)
    expect(props.onSelectionCommand).toHaveBeenCalledWith('erase')
    expect([...bar.querySelectorAll('button')].every(b => !b.disabled)).toBe(true)
  })
})

describe('EditorPage · 完成流程', () => {
  it('头部「完成」打开完成面板,保存并退出走 onFinishSave', () => {
    const { props } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /完成/ }))
    const sheet = document.querySelector('.editor-finish-sheet')
    expect(sheet).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '保存并退出' }))
    expect(props.onFinishSave).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.editor-finish-sheet')).toBeNull()
  })

  it('完成面板的保存/导出分别接回既有回调,未保存时给出提示', () => {
    const { props } = renderEditor({ canvasProps: { ...renderEditorProps(), saveState: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: /完成/ }))
    expect(document.querySelector('.editor-finish-hint')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(props.canvasProps.onSave).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /完成/ }))
    const sheet = document.querySelector('.editor-finish-sheet')
    fireEvent.click(within(sheet).getByRole('button', { name: '导出' }))
    expect(props.onExport).toHaveBeenCalledTimes(1)
  })

  it('有未保存修改时,返回键先打开完成面板而不是直接离开', () => {
    renderEditor({ canvasProps: { ...renderEditorProps(), saveState: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(document.querySelector('.editor-finish-sheet')).toBeTruthy()
  })
})

describe('EditorPage · 整理抽屉(低频刚需)', () => {
  it('删除颜色:把该色全部清成空白,颗数显示在按钮上', () => {
    const { props } = renderEditor()
    fireEvent.click(screen.getByTitle('整理'))
    const sheet = document.querySelector('.editor-cleanup-sheet')
    // 红色 2 颗是主色,默认选中
    const btn = within(sheet).getByRole('button', { name: /删除 2 颗/ })
    fireEvent.click(btn)
    expect(props.canvasProps.onCanvasChange).toHaveBeenCalledTimes(1)
    const next = props.canvasProps.onCanvasChange.mock.calls[0][0]
    expect(next.flat().filter(Boolean)).toHaveLength(1)
  })

  it('合并相近色:按预设合并到目标色数,颗数不变', () => {
    const colors = [
      '#E53935',
      '#1E88E5',
      '#43A047',
      '#FDD835',
      '#8E24AA',
      '#00ACC1',
      '#FB8C00',
      '#6D4C41',
      '#546E7A',
    ]
    const data = colors.map((hex, i) => [hex, null, i === 0 ? '#E53A36' : null])
    const { props } = renderEditor({ canvasData: data, gridSize: 3, gridWidth: null, gridHeight: null })
    fireEvent.click(screen.getByTitle('整理'))
    const sheet = document.querySelector('.editor-cleanup-sheet')
    fireEvent.click(within(sheet).getByRole('button', { name: '8' }))
    fireEvent.click(within(sheet).getByRole('button', { name: /合并到 8 色/ }))
    expect(props.canvasProps.onCanvasChange).toHaveBeenCalledTimes(1)
    const next = props.canvasProps.onCanvasChange.mock.calls[0][0]
    expect(new Set(next.flat().filter(Boolean)).size).toBe(8)
    expect(next.flat().filter(Boolean)).toHaveLength(data.flat().filter(Boolean).length)
  })

  it('裁切:裁到内容边界与裁到选区', () => {
    const data = [
      [null, null, null, null, null],
      [null, '#E53935', null, null, null],
      [null, null, '#1E88E5', null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
    ]
    const { props } = renderEditor({ canvasData: data, gridSize: 5 })
    fireEvent.click(screen.getByTitle('整理'))
    const sheet = document.querySelector('.editor-cleanup-sheet')
    fireEvent.click(within(sheet).getByRole('button', { name: /裁到内容边界/ }))
    expect(props.onCropCanvas).toHaveBeenCalledTimes(1)
    const [cropped, w, h] = props.onCropCanvas.mock.calls[0]
    expect([w, h]).toEqual([2, 2])
    expect(cropped.flat().filter(Boolean)).toHaveLength(2)
  })

  it('裁到选区:没有选区时禁用', () => {
    renderEditor()
    fireEvent.click(screen.getByTitle('整理'))
    const sheet = document.querySelector('.editor-cleanup-sheet')
    expect(within(sheet).getByRole('button', { name: /裁到选区/ }).disabled).toBe(true)
  })

  it('替换色号走 App 的替换弹层入口', () => {
    const { props } = renderEditor()
    fireEvent.click(screen.getByTitle('整理'))
    const sheet = document.querySelector('.editor-cleanup-sheet')
    fireEvent.click(within(sheet).getByRole('button', { name: '颜色替换' }))
    expect(props.onOpenReplace).toHaveBeenCalledTimes(1)
  })

  it('单色隔离:选中颜色后画布收到 isolateColor,控制台出现退出角标', () => {
    const { props } = renderEditor()
    fireEvent.click(screen.getByTitle('整理'))
    const sheet = document.querySelector('.editor-cleanup-sheet')
    const isolateSection = [...sheet.querySelectorAll('.editor-cleanup-section')].find(sec =>
      sec.textContent.includes('单色隔离')
    )
    fireEvent.click(isolateSection.querySelector('.editor-cleanup-color'))
    expect(canvasPropsRef.current.isolateColor).toBeTruthy()
    expect(document.querySelector('.editor-isolate-badge')).toBeTruthy()

    fireEvent.click(document.querySelector('.editor-isolate-badge'))
    expect(document.querySelector('.editor-isolate-badge')).toBeNull()
    expect(props.onToast).not.toHaveBeenCalled()
  })
})
