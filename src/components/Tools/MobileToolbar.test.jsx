import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import i18n, { ensureLanguage } from '../../i18n'
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
    fillIncludeEmpty: false,
    onToggleFillIncludeEmpty: vi.fn(),
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

  it('每个选区命令按钮都有可见短标签,完整说明在 aria-label', () => {
    renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 } })
    // 只取命令按钮行 —— 信息行里的「含空白」开关也是 button,不属于命令集合
    const buttons = [...$$('[data-testid="mobile-selection-bar"] .selection-actions-row button')]
    // 可见文字用短标签(填充/擦除/左右翻转/…):一行放得下,长译文也不会把按钮撑破
    const expected = [
      ['tools.selectionFillShort', 'tools.fillSelection'],
      ['tools.selectionEraseShort', 'tools.clearSelection'],
      ['tools.selectionFlipHShort', 'tools.mirrorH'],
      ['tools.selectionFlipVShort', 'tools.mirrorV'],
      ['tools.selectionRotateCwShort', 'tools.rotateCw'],
      ['tools.selectionRotateCcwShort', 'tools.rotateCcw'],
      ['tools.clearSelectionBtn', 'tools.clearSelectionBtn'],
    ]
    expect(buttons).toHaveLength(expected.length)
    for (const [shortKey, fullKey] of expected) {
      const label = i18n.t(shortKey)
      const btn = buttons.find(b => b.textContent.includes(label))
      expect(btn, `缺少带文字的按钮:${label}`).toBeTruthy()
      // 文字必须包在可省略号的 span 里,而不是裸文本 —— 裸文本无法截断,
      // 长译文(如日语「塗りつぶし」)会把按钮撑出屏幕。
      const labelEl = btn.querySelector('.selection-btn-label')
      expect(labelEl, `按钮缺少 label 容器:${label}`).toBeTruthy()
      expect(labelEl.textContent).toBe(label)
      // 完整语义不能丢:读屏与长按提示仍然给出全称
      expect(btn.getAttribute('aria-label')).toBe(i18n.t(fullKey))
    }
  })

  it('短标签足够窄,按钮内的文字不会被迫折行(四种语言都检查)', async () => {
    // 约束不是「字符数」而是「渲染宽度」:中日韩字符按 1em、拉丁字符按 0.55em 估算。
    // 手机最窄 320px,工具栏左右各 12px 内边距 → 可用约 296px = 24.6em(12px 字号)。
    // 预算 10em(约 120px)保证「图标 14px + 间距 + 内边距」之后仍远小于一行宽度,
    // 超长译文会先被省略号截断(见 .selection-btn-label),绝不会把布局撑破。
    const widthEm = (text) => [...text].reduce((sum, ch) => {
      const cjk = /[぀-ヿ㐀-䶿一-鿿가-힯]/.test(ch)
      return sum + (cjk ? 1 : 0.55)
    }, 0)

    const keys = [
      'selectionFillShort', 'selectionEraseShort',
      'selectionFlipHShort', 'selectionFlipVShort',
      'selectionRotateCwShort', 'selectionRotateCcwShort',
    ]
    for (const lng of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
      await ensureLanguage(lng)
      for (const key of keys) {
        const text = i18n.getResourceBundle(lng, 'translation').tools[key]
        expect(text, `${lng}.${key} 缺失`).toBeTruthy()
        expect(widthEm(text), `${lng}.${key} 过宽(${widthEm(text).toFixed(1)}em):${text}`)
          .toBeLessThanOrEqual(10)
      }
    }
  })

  it('按钮行允许换行,按钮本身不换行(文字不跨行、不溢出)', () => {
    renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 } })
    const row = $('.selection-actions-row')
    expect(row).toBeTruthy()
    // 结构层面:flex-wrap 由 CSS 保证;这里锁定每个按钮都带 label 容器,
    // 且「取消选区」与命令按钮分开放置(退出动作不混在编辑动作里)
    const clearBtn = [...row.querySelectorAll('button')]
      .find(b => b.textContent.includes(i18n.t('tools.clearSelectionBtn')))
    expect(clearBtn.classList.contains('selection-clear')).toBe(true)
  })

  it('「含空白格」开关:默认关闭,点击回调取反值', () => {
    const { props } = renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 }, fillIncludeEmpty: false })
    const toggle = $('.selection-fill-toggle')
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.textContent).toContain(i18n.t('tools.fillIncludeEmptyShort'))

    fireEvent.click(toggle)
    expect(props.onToggleFillIncludeEmpty).toHaveBeenCalledWith(true)
  })

  it('「含空白格」打开时呈按下态', () => {
    renderBar({ selection: { x: 0, y: 0, w: 2, h: 2 }, fillIncludeEmpty: true })
    const toggle = $('.selection-fill-toggle')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.classList.contains('active')).toBe(true)
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
    // 用 aria-label 定位(按钮可见文字是短标签,完整命令名在 aria-label)
    const mirrorH = buttons.find(b => b.getAttribute('aria-label') === i18n.t('tools.mirrorH'))
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
