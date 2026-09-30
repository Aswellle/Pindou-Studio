import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import i18n from '../i18n'
import ProfilePage from './ProfilePage'

// jsdom 下 navigator.language 解析为 en-US;断言统一按基准语言 zh-CN
beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(cleanup)

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  nickname: '测试用户',
}

function renderProfilePage(initialEntries = ['/profile'], initialIndex) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/profile" element={
          <ProfilePage
            user={mockUser}
            onLogout={() => {}}
            onUpdateProfile={async () => {}}
            onChangePassword={async () => {}}
          />
        } />
        <Route path="/" element={<div>home-marker</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProfilePage', () => {
  it('以页面形态渲染,不产生模态遮罩浮层', () => {
    renderProfilePage()

    // 页面壳与内嵌面板存在
    expect(document.querySelector('.profile-page')).toBeTruthy()
    expect(document.querySelector('.profile-panel')).toBeTruthy()

    // 页面形态不再渲染模态遮罩
    expect(document.querySelector('.modal-overlay.profile-overlay')).toBeNull()

    // 页面头部返回按钮存在
    expect(screen.getByRole('button', { name: /返回/ })).toBeTruthy()

    // 浮层专属的关闭按钮不渲染
    expect(document.querySelector('.profile-page .close-btn')).toBeNull()
  })

  it('页面形态保留资料编辑与退出登录功能入口', () => {
    renderProfilePage()

    // 用户信息与核心操作仍在(与原模态框同一内容组件)
    expect(screen.getByText('test@example.com')).toBeTruthy()
    expect(screen.getByText(/退出登录/)).toBeTruthy()
    expect(screen.getByText(/修改密码/)).toBeTruthy()
  })

  it('深链接直达(无浏览历史)时,返回按钮兜底回首页', () => {
    renderProfilePage(['/profile'])

    fireEvent.click(screen.getByRole('button', { name: /返回/ }))

    expect(screen.getByText('home-marker')).toBeTruthy()
  })

  it('从站内进入个人资料页时,返回按钮回退上一页', () => {
    const originalLength = window.history.length
    // jsdom 中 MemoryRouter 不写 window.history,手动模拟"存在浏览历史"
    Object.defineProperty(window.history, 'length', { value: 3, configurable: true })
    try {
      renderProfilePage(['/', '/profile'], 1)

      fireEvent.click(screen.getByRole('button', { name: /返回/ }))

      expect(screen.getByText('home-marker')).toBeTruthy()
    } finally {
      Object.defineProperty(window.history, 'length', { value: originalLength, configurable: true })
    }
  })
})
