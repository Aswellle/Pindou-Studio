import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import DraftRestorePrompt from './DraftRestorePrompt'
import i18n from '../i18n'
import { __resetDialogStack } from '../hooks/useDialogA11y'
import { __resetScrollLock } from '../hooks/useScrollLock'

/**
 * 草稿恢复提示(规格 03 §7)。
 *
 * 这个弹层的存在理由是「自动保存之后,用户回到页面要能拿回内容」,
 * 所以三条都必须锁住:
 *   1. 有草稿才渲染,没草稿时连 DOM 都不出现(不能占着浮层);
 *   2. 两个动作各自只回调一次,不能互相串(恢复 ≠ 丢弃);
 *   3. Escape 等同于丢弃 —— 但**必须**走 onDiscard,不能什么都不做,
 *      否则用户会以为已经处理了,下次打开又弹一次。
 */

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })

beforeEach(() => {
  __resetDialogStack()
  __resetScrollLock()
})

afterEach(() => cleanup())

const DRAFT = {
  canvasData: [['#E53935', null], [null, '#43A047']],
  gridSize: 2,
  paletteId: 'perler',
  savedAt: '2026-10-23T10:30:00.000Z',
}

// createPortal 到 body,断言一律查 document.body
const $ = (sel) => document.body.querySelector(sel)

function setup(props = {}) {
  const onRestore = vi.fn()
  const onDiscard = vi.fn()
  const view = render(
    <DraftRestorePrompt draft={DRAFT} onRestore={onRestore} onDiscard={onDiscard} {...props} />,
  )
  return { ...view, onRestore, onDiscard }
}

describe('DraftRestorePrompt · 渲染', () => {
  it('没有草稿时不渲染任何东西', () => {
    render(<DraftRestorePrompt draft={null} onRestore={vi.fn()} onDiscard={vi.fn()} />)
    expect($('.draft-restore-dialog')).toBeNull()
    expect($('.modal-overlay')).toBeNull()
  })

  it('有草稿时显示标题与尺寸', () => {
    setup()
    const dialog = $('.draft-restore-dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain(i18n.t('autosave.restoreTitle'))
    // 2×2 草稿:宽高都出现在正文里
    expect(dialog.textContent).toContain('2')
  })

  it('有保存时间时正文带时间', () => {
    setup()
    const body = $('.draft-restore-body').textContent
    // 时间被本地化格式化,只断言「不是没有时间的那一版文案」
    expect(body).not.toBe(i18n.t('autosave.restoreBody', { w: 2, h: 2 }))
  })

  it('savedAt 非法时退回不带时间的文案,不显示 Invalid Date', () => {
    setup({ draft: { ...DRAFT, savedAt: 'not-a-date' } })
    const body = $('.draft-restore-body').textContent
    expect(body).not.toContain('Invalid')
    expect(body).not.toContain('NaN')
  })

  it('可访问性:role=dialog + aria-modal', () => {
    setup()
    const dialog = $('.draft-restore-dialog')
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe(i18n.t('autosave.restoreTitle'))
  })

  it('两个按钮文案来自 i18n', () => {
    setup()
    const buttons = [...document.body.querySelectorAll('.draft-restore-actions button')]
    expect(buttons).toHaveLength(2)
    const labels = buttons.map(b => b.textContent)
    expect(labels).toContain(i18n.t('autosave.restore'))
    expect(labels).toContain(i18n.t('autosave.discard'))
  })
})

describe('DraftRestorePrompt · 交互', () => {
  it('点「恢复」只调用 onRestore', () => {
    const { onRestore, onDiscard } = setup()
    const btn = [...document.body.querySelectorAll('.draft-restore-actions button')]
      .find(b => b.textContent === i18n.t('autosave.restore'))

    fireEvent.click(btn)
    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('点「丢弃」只调用 onDiscard', () => {
    const { onRestore, onDiscard } = setup()
    const btn = [...document.body.querySelectorAll('.draft-restore-actions button')]
      .find(b => b.textContent === i18n.t('autosave.discard'))

    fireEvent.click(btn)
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onRestore).not.toHaveBeenCalled()
  })

  it('点遮罩空白处等于丢弃', () => {
    const { onRestore, onDiscard } = setup()
    fireEvent.click($('.modal-overlay'))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onRestore).not.toHaveBeenCalled()
  })

  it('点对话框内部不会误触丢弃(冒泡被拦截)', () => {
    const { onDiscard } = setup()
    fireEvent.click($('.draft-restore-dialog'))
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('Escape 走丢弃,而不是什么都不做', () => {
    const { onRestore, onDiscard } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onRestore).not.toHaveBeenCalled()
  })

  it('输入法组合态下 Escape 不关闭(中文候选词场景)', () => {
    const { onDiscard } = setup()
    fireEvent.keyDown(document, { key: 'Escape', isComposing: true })
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
