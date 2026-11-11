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
  window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
  return () => {
    window.matchMedia = orig
  }
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
          element={<Header user={mockUser} currentPage="canvas" simplified onLogout={onLogout} {...props} />}
        />
        <Route path="/profile" element={<div>PROFILE_PAGE</div>} />
        <Route path="/colors" element={<div>COLORS_PAGE</div>} />
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

describe('Header · 纯图标导航与圆形登录', () => {
  it('导航只渲染图标:链接带 aria-label 与悬浮提示(data-tip),不再有文字', () => {
    renderHeader({ simplified: false, currentPage: 'canvas', onSave: vi.fn() })
    const links = [...document.querySelectorAll('.nav-link')]
    // 4 个主栏目 + 1 个备料下拉入口
    expect(links.length).toBe(5)
    expect(links.every(link => link.getAttribute('aria-label'))).toBe(true)
    expect(links.every(link => link.getAttribute('data-tip'))).toBe(true)
    expect(document.querySelectorAll('.nav-text, .nav-label')).toHaveLength(0)
  })

  it('保存按钮不进顶栏:画布动作不会让右侧图标组随页面切换跳位', () => {
    renderHeader({ simplified: false, currentPage: 'canvas', onSave: vi.fn(), saveState: 'dirty' })
    expect(document.querySelector('.save-work-btn, .info-save-btn')).toBeNull()
  })

  it('PC 登录按钮是圆形,中文显示「登录」', () => {
    renderHeader({ simplified: false, user: null, onLogin: vi.fn() })
    const btn = document.querySelector('.auth-circle-btn')
    expect(btn?.textContent).toBe('登录')
  })

  it('非中文语言统一显示英文 Login(圆形放不下长词)', async () => {
    await i18n.changeLanguage('ja-JP')
    renderHeader({ simplified: false, user: null, onLogin: vi.fn() })
    expect(document.querySelector('.auth-circle-btn')?.textContent).toBe('Login')
    await i18n.changeLanguage('zh-CN')
  })
})

describe('Header · 备料资料入口', () => {
  it('展开后列出五个资料页并可以跳转', () => {
    renderHeader({ simplified: false })
    fireEvent.click(screen.getByRole('button', { name: '备料资料' }))

    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items).toHaveLength(5)
    expect(items.map(item => item.textContent)).toEqual([
      '品牌色卡对照',
      '熨烫温度对照',
      '豆子数量计算器',
      '拼豆图案',
      '像素画生成器',
    ])

    fireEvent.click(within(menu).getByRole('menuitem', { name: '品牌色卡对照' }))
    expect(screen.getByText('COLORS_PAGE')).toBeTruthy()
  })

  it('Escape 关闭菜单并把焦点还给入口', () => {
    renderHeader({ simplified: false })
    const trigger = screen.getByRole('button', { name: '备料资料' })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('点击菜单外部关闭', () => {
    renderHeader({ simplified: false })
    fireEvent.click(screen.getByRole('button', { name: '备料资料' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
