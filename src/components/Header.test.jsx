import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Header from './Header'
import i18n from '../i18n'

/**
 * 顶栏账号菜单:登出入口必须在任何页面都能找到(此前只在个人中心侧栏,
 * 且该侧栏在 <900px 被 CSS 隐藏,移动端完全没有登出)。
 */

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

const mockUser = { id: 'user-1', email: 'test@example.com', nickname: '测试用户' }

function installMockMatchMedia() {
  const orig = window.matchMedia
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => { window.matchMedia = orig }
}

let restoreMatchMedia

beforeEach(() => {
  restoreMatchMedia = installMockMatchMedia()
})

afterEach(() => {
  cleanup()
  restoreMatchMedia?.()
})

function renderHeader(props = {}) {
  const onLogout = vi.fn()
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <Header
              user={mockUser}
              currentPage="canvas"
              simplified
              onLogout={onLogout}
              {...props}
            />
          }
        />
        <Route path="/profile" element={<div>PROFILE_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )
  return { onLogout }
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: '个人中心' }))

describe('Header · 账号菜单', () => {
  it('已登录时头像入口展开个人中心与退出登录', () => {
    renderHeader()
    openMenu()
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '个人中心' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '退出登录' })).toBeTruthy()
  })

  it('个人中心菜单项跳转 /profile', () => {
    renderHeader()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '个人中心' }))
    expect(screen.getByText('PROFILE_PAGE')).toBeTruthy()
  })

  it('退出登录需二次确认后才调用 onLogout', () => {
    const { onLogout } = renderHeader()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }))

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: '退出登录' })).toBeTruthy()
    expect(onLogout).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '退出登录' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('取消退出不会登出', () => {
    const { onLogout } = renderHeader()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onLogout).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('点击菜单外部或按 Escape 关闭菜单,Escape 后焦点回到入口', () => {
    renderHeader()
    openMenu()
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()

    const trigger = screen.getByRole('button', { name: '个人中心' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('游客没有账号菜单与退出入口', () => {
    renderHeader({ user: null, onLogin: vi.fn() })
    expect(screen.queryByRole('button', { name: '个人中心' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '退出登录' })).toBeNull()
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy()
  })
})
