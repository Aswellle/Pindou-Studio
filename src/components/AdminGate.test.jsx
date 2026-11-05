import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminGate from './AdminGate'
import i18n from '../i18n'

// AdminGate 只用到 supabase.auth.mfa;非管理员分支不会调用它,给个空壳即可
vi.mock('../services/supabase', () => ({
  supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn() } } },
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(cleanup)

function renderGate(props = {}) {
  return render(
    <MemoryRouter>
      <AdminGate
        cloudEnabled
        authLoading={false}
        user={{ id: 'u1', email: 'x@example.com' }}
        isAdmin={false}
        onLogin={() => {}}
        onLogout={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('AdminGate · 退出确认', () => {
  it('无权限页的退出走 alertdialog 二次确认', () => {
    renderGate()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('admin.signOut') }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText(i18n.t('admin.confirmSignOutHint'))).toBeTruthy()
  })

  it('遮罩点击与 Escape 都不关闭,必须显式选择', () => {
    renderGate()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('admin.signOut') }))
    const dialog = screen.getByRole('alertdialog')

    fireEvent.click(dialog.parentElement)
    expect(screen.getByRole('alertdialog')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('取消只关对话框,不退出登录', () => {
    const onLogout = vi.fn()
    renderGate({ onLogout })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('admin.signOut') }))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('admin.cancel') }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('确认后调用 onLogout', () => {
    const onLogout = vi.fn()
    renderGate({ onLogout })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('admin.signOut') }))
    // 页面上的退出按钮仍在,确认按钮要限定在对话框内取
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: i18n.t('admin.signOut') })
    )
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
