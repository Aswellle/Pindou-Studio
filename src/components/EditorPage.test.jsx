import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
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
  const MockCanvas = React.forwardRef(function MockCanvas(props, ref) {
    canvasPropsRef.current = props
    return React.createElement('div', { className: 'mock-canvas' })
  })
  return { default: MockCanvas }
})

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
    ...overrides,
  }
  const view = render(
    <MemoryRouter initialEntries={['/editor']}>
      <EditorPage {...props} />
    </MemoryRouter>
  )
  return { ...view, props }
}

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })
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

  it('空画布显示占位而不渲染 chips', () => {
    renderEditor({ canvasData: Array.from({ length: 3 }, () => Array(3).fill(null)) })
    expect(document.querySelectorAll('.editor-color-chip')).toHaveLength(0)
    expect(document.querySelector('.editor-color-empty')).toBeTruthy()
  })
})

describe('EditorPage · 补色网格', () => {
  it('「更多颜色」展开品牌色板,选中即回调并收起', () => {
    const { props } = renderEditor()
    expect(document.querySelector('.editor-extra-colors')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /更多颜色/ }))
    const grid = document.querySelector('.editor-extra-colors')
    expect(grid).toBeTruthy()
    // Perler 色板 80 色
    expect(grid.querySelectorAll('.editor-extra-swatch').length).toBe(80)

    fireEvent.click(grid.querySelector('.editor-extra-swatch'))
    expect(props.onColorSelect).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.editor-extra-colors')).toBeNull()
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

  it('去噪/保存/导出回调接线;撤销按 canUndo 禁用', () => {
    const { props } = renderEditor()
    fireEvent.click(screen.getByTitle('去噪'))
    expect(props.onNoiseCleanup).toHaveBeenCalledTimes(1)

    const saveBtn = screen.getByTitle('保存作品')
    fireEvent.click(saveBtn)
    expect(props.canvasProps.onSave).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle('导出'))
    expect(props.onExport).toHaveBeenCalledTimes(1)

    const undoBtn = screen.getByTitle('撤销 (Ctrl+Z)')
    expect(undoBtn.disabled).toBe(false)
    const redoBtn = screen.getByTitle('重做 (Ctrl+Y)')
    expect(redoBtn.disabled).toBe(true)
  })
})

describe('EditorPage · 上下文选区条', () => {
  it('无选区时不渲染;有选区渲染命令并接线,粘贴按 canPaste 禁用', () => {
    const { props, rerender } = renderEditor()
    expect(document.querySelector('[data-testid="editor-selection-bar"]')).toBeNull()

    rerender(
      <MemoryRouter initialEntries={['/editor']}>
        <EditorPage
          {...props}
          selection={{ x: 0, y: 0, w: 2, h: 2 }}
          canPaste
        />
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
