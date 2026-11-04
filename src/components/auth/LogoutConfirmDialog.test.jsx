import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import LogoutConfirmDialog from './LogoutConfirmDialog'
import i18n from '../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(cleanup)

describe('LogoutConfirmDialog · 退出确认', () => {
  it('关闭时不渲染任何内容', () => {
    render(<LogoutConfirmDialog open={false} onClose={() => {}} onConfirm={() => {}} />)
    expect(document.body.textContent).not.toContain('退出后需重新登录')
  })

  it('具备 alertdialog 语义并说明退出后果', () => {
    render(<LogoutConfirmDialog open onClose={() => {}} onConfirm={() => {}} />)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('退出登录')
    expect(screen.getByText(/退出后需重新登录/)).toBeTruthy()
  })

  it('确认与取消分别触发对应回调', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<LogoutConfirmDialog open onClose={onClose} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('遮罩点击与 Escape 都可以关闭', () => {
    const onClose = vi.fn()
    render(<LogoutConfirmDialog open onClose={onClose} onConfirm={() => {}} />)

    fireEvent.click(document.querySelector('.logout-confirm-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
