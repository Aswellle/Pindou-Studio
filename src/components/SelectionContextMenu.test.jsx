import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SelectionContextMenu from './SelectionContextMenu'

/**
 * 长按上下文菜单(A4)。
 *
 * 组件 portal 到 document.body,断言一律查 document。
 * 三条验收点各有用例:命令回调、点击外部关闭、Escape 关闭。
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

describe('SelectionContextMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function renderMenu(overrides = {}) {
    const onCommand = vi.fn()
    const onClose = vi.fn()
    const view = render(
      <SelectionContextMenu
        open
        x={100}
        y={120}
        canPaste
        onCommand={onCommand}
        onClose={onClose}
        {...overrides}
      />
    )
    return { ...view, onCommand, onClose }
  }

  it('open 为 false 时不渲染任何东西', () => {
    renderMenu({ open: false })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('列出六条命令', () => {
    renderMenu()
    expect(screen.getAllByRole('menuitem')).toHaveLength(6)
  })

  it('点击命令项 → 回调该命令并关闭菜单', () => {
    const { onCommand, onClose } = renderMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /selectionCopyShort/ }))

    expect(onCommand).toHaveBeenCalledWith('copy')
    expect(onClose).toHaveBeenCalled()
  })

  it('点击遮罩(菜单外部)关闭菜单', () => {
    const { onClose, onCommand } = renderMenu()
    const overlay = document.querySelector('.selection-menu-overlay')
    fireEvent.click(overlay)

    expect(onClose).toHaveBeenCalled()
    expect(onCommand).not.toHaveBeenCalled()
  })

  it('点击菜单本体不关闭(冒泡被拦下)', () => {
    const { onClose } = renderMenu()
    fireEvent.click(document.querySelector('.selection-menu'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape 关闭', () => {
    const { onClose } = renderMenu()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('输入法组合态的 Escape 不关闭(中文用户按 Esc 是取消候选词)', () => {
    const { onClose } = renderMenu()
    fireEvent.keyDown(document, { key: 'Escape', isComposing: true })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('剪贴板为空时粘贴项禁用', () => {
    renderMenu({ canPaste: false })
    expect(screen.getByRole('menuitem', { name: /selectionPasteShort/ }).disabled).toBe(true)
  })

  it('禁用项被点击也不触发命令', () => {
    const { onCommand } = renderMenu({ canPaste: false })
    fireEvent.click(screen.getByRole('menuitem', { name: /selectionPasteShort/ }))

    expect(onCommand).not.toHaveBeenCalled()
  })

  it('portal 到 body,不受画布祖先裁剪', () => {
    renderMenu()
    const overlay = document.querySelector('.selection-menu-overlay')
    expect(overlay.parentElement).toBe(document.body)
  })
})
