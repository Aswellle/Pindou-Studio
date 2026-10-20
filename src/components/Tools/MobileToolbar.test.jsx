import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import i18n from '../../i18n'
import MobileToolbar from './MobileToolbar'

/**
 * 移动端选区操作条的可发现性(规格 04 §2)。
 *
 * 回归背景:选区按钮原先只有图标 + title,移动端没有 hover,title 永远看不到;
 * 拖拽移动更是完全没有入口提示。这里锁定三件事:
 *   1. 每个选区命令按钮都必须有可见文字(不能只靠图标);
 *   2. 首次进入选区工具 / 首次框出选区,各出现一次引导气泡;
 *   3. 引导只出现一次,看过即永久静默。
 */

const BEHAVIOR_KEY = 'bead-studio-behavior'

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })

beforeEach(() => {
  localStorage.clear()
  // 关掉图片转拼豆的行为引导,避免它干扰选区引导的断言
  localStorage.setItem(BEHAVIOR_KEY, JSON.stringify({ sessions: 1, guideShown: true }))
})

afterEach(() => cleanup())

function renderBar(overrides = {}) {
  const props = {
    tool: 'select',
    onToolChange: vi.fn(),
    gridSize: 29,
    gridWidth: null,
    gridHeight: null,
    onGridSizeChange: vi.fn(),
    onGridDimensionsChange: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: true,
    canRedo: true,
    onClear: vi.fn(),
    onExport: vi.fn(),
    onQuantize: vi.fn(),
    onImport: vi.fn(),
    selection: null,
    onSelectionCommand: vi.fn(),
    onClearSelection: vi.fn(),
    onOpenReplace: vi.fn(),
    ...overrides,
  }
  const view = render(<MobileToolbar {...props} />)
  return { ...view, props }
}

const $ = (sel) => document.body.querySelector(sel)
const $$ = (sel) => document.body.querySelectorAll(sel)

describe('MobileToolbar · 选区操作条', () => {
  it('非选区工具时不渲染操作条', () => {
    renderBar({ tool: 'pencil' })
    expect($('[data-testid="mobile-selection-bar"]')).toBeNull()
  })

  it('选区工具但无选区时提示先框选', () => {
    renderBar()
    const bar = $('[data-testid="mobile-selection-bar"]')
    expect(bar.textContent).toContain(i18n.t('tools.selectionEmpty'))
    expect(bar.querySelectorAll('button')).toHaveLength(0)
  })

  it('每个选区命令按钮都有可见文字,不是纯图标', () => {
    renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 } })
    const buttons = [...$$('[data-testid="mobile-selection-bar"] button')]
    const expected = [
      i18n.t('tools.fillSelection'),
      i18n.t('tools.clearSelection'),
      i18n.t('tools.mirrorH'),
      i18n.t('tools.mirrorV'),
      i18n.t('tools.rotateCw'),
      i18n.t('tools.rotateCcw'),
      i18n.t('tools.clearSelectionBtn'),
    ]
    expect(buttons).toHaveLength(expected.length)
    for (const label of expected) {
      const btn = buttons.find(b => b.textContent.includes(label))
      expect(btn, `缺少带文字的按钮:${label}`).toBeTruthy()
    }
  })

  it('移动提示与选区尺寸同时可见', () => {
    renderBar({ selection: { x: 0, y: 0, w: 3, h: 2 } })
    const bar = $('[data-testid="mobile-selection-bar"]')
    expect(bar.textContent).toContain(i18n.t('tools.selectionMoveHint'))
    expect(bar.textContent).toContain('3')
    expect(bar.textContent).toContain('2')
  })

  it('点击命令按钮回调对应命令', () => {
    const { props } = renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 } })
    const buttons = [...$$('[data-testid="mobile-selection-bar"] button')]
    const mirrorH = buttons.find(b => b.textContent.includes(i18n.t('tools.mirrorH')))
    fireEvent.click(mirrorH)
    expect(props.onSelectionCommand).toHaveBeenCalledWith('mirrorH')
  })
})

describe('MobileToolbar · 选区分步引导', () => {
  it('首次进入选区工具 → 出现第 1 步引导', () => {
    renderBar()
    expect(screen.getByText(i18n.t('tools.selectionGuideStep1'))).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem(BEHAVIOR_KEY))
    expect(saved.selectionGuideStep1).toBe(true)
  })

  it('首次框出选区 → 出现第 2 步引导,并标记完成', () => {
    renderBar()
    cleanup()
    localStorage.setItem(BEHAVIOR_KEY, JSON.stringify({
      sessions: 1, guideShown: true, selectionGuideStep1: true,
    }))

    renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 } })
    expect(screen.getByText(i18n.t('tools.selectionGuideStep2'))).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(BEHAVIOR_KEY)).selectionGuideDone).toBe(true)
  })

  it('看过之后不再出现(不反复打扰)', () => {
    localStorage.setItem(BEHAVIOR_KEY, JSON.stringify({
      sessions: 1, guideShown: true, selectionGuideDone: true,
    }))
    renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 } })
    expect(screen.queryByText(i18n.t('tools.selectionGuideStep2'))).toBeNull()
  })

  it('切回其他工具时引导立即消失', () => {
    const { rerender, props } = renderBar()
    expect(screen.getByText(i18n.t('tools.selectionGuideStep1'))).toBeTruthy()

    act(() => {
      rerender(<MobileToolbar {...props} tool="pencil" />)
    })
    expect(screen.queryByText(i18n.t('tools.selectionGuideStep1'))).toBeNull()
  })

  it('点按引导气泡即关闭', () => {
    renderBar()
    const bubble = $('.selection-guide')
    expect(bubble).toBeTruthy()
    fireEvent.click(bubble)
    expect($('.selection-guide')).toBeNull()
  })
})

describe('MobileToolbar · 工具栏高度变量', () => {
  it('挂载后把工具栏高度写入 --mobile-toolbar-h(色卡条据此抬高)', () => {
    renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 } })
    const value = document.documentElement.style.getPropertyValue('--mobile-toolbar-h')
    expect(value).toMatch(/^\d+px$/)
  })

  it('卸载时清理变量,不污染其他页面', () => {
    const { unmount } = renderBar()
    expect(document.documentElement.style.getPropertyValue('--mobile-toolbar-h')).toMatch(/px$/)
    unmount()
    expect(document.documentElement.style.getPropertyValue('--mobile-toolbar-h')).toBe('')
  })
})
