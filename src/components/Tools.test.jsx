import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import i18n from '../i18n'
import Tools from './Tools'

/**
 * 桌面端选区面板的布局约束。
 *
 * 回归背景:面板在 200px 宽的侧栏里,原先用两列 grid + 图标按钮:
 * 「顺时针旋转」这类标签在窄列里会被挤压/溢出,镜像与旋转还只有图标
 * (hover 才出 title,视觉上等于让用户猜)。现在改为单列「图标 + 文字」,
 * 这里锁定:每个命令都有可见文字、文字有可省略容器、按钮不跨列。
 */

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(() => cleanup())

function renderTools(overrides = {}) {
  const props = {
    tool: 'select',
    onToolChange: vi.fn(),
    gridSize: 29,
    gridWidth: null,
    gridHeight: null,
    onGridSizeChange: vi.fn(),
    onGridDimensionsChange: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClear: vi.fn(),
    canUndo: true,
    canRedo: true,
    onOpenQuantizer: vi.fn(),
    onOpenImport: vi.fn(),
    selection: { x: 0, y: 0, w: 2, h: 2 },
    onSelectionCommand: vi.fn(),
    onClearSelection: vi.fn(),
    onOpenReplace: vi.fn(),
    ...overrides,
  }
  const view = render(<Tools {...props} />)
  return { ...view, props }
}

const $ = (sel) => document.body.querySelector(sel)
const $$ = (sel) => [...document.body.querySelectorAll(sel)]

describe('Tools · 桌面选区面板', () => {
  it('每个选区命令都有可见文字(镜像/旋转不再只有图标)', () => {
    renderTools()
    const buttons = $$('.selection-actions button')
    const expected = [
      'tools.fillSelection', 'tools.clearSelection',
      'tools.mirrorH', 'tools.mirrorV',
      'tools.rotateCw', 'tools.rotateCcw',
      'tools.clearSelectionBtn',
    ]
    expect(buttons).toHaveLength(expected.length)
    for (const key of expected) {
      const label = i18n.t(key)
      const btn = buttons.find(b => b.textContent.includes(label))
      expect(btn, `缺少带文字的按钮:${label}`).toBeTruthy()
      // 文字在可省略容器里,窄侧栏下截断而不是溢出
      expect(btn.querySelector('.action-btn-label')).toBeTruthy()
    }
  })

  it('按钮为单列布局(不再使用 icon-only / wide 两列写法)', () => {
    renderTools()
    expect($$('.selection-actions .icon-only')).toHaveLength(0)
    expect($$('.selection-actions .wide')).toHaveLength(0)
  })

  it('没有选区时只提示先框选,不渲染命令按钮', () => {
    renderTools({ selection: null })
    expect(screen.getByText(i18n.t('tools.selectionEmpty'))).toBeTruthy()
    expect($$('.selection-actions button')).toHaveLength(0)
  })

  it('点击镜像按钮回调对应命令', () => {
    const { props } = renderTools()
    const btn = $$('.selection-actions button')
      .find(b => b.textContent.includes(i18n.t('tools.mirrorV')))
    fireEvent.click(btn)
    expect(props.onSelectionCommand).toHaveBeenCalledWith('mirrorV')
  })

  it('选区尺寸与拖拽移动提示同时可见', () => {
    renderTools()
    expect($('.selection-size').textContent).toContain('2')
    expect(screen.getByText(i18n.t('tools.selectionMoveHint'))).toBeTruthy()
  })
})
