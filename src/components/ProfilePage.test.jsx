import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import ProfilePage from './ProfilePage'

// jsdom 下 navigator.language 解析为 en-US;断言统一按基准语言 zh-CN
beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  nickname: '测试用户',
}

function renderProfilePage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage
        user={mockUser}
        onLogout={() => {}}
        onUpdateProfile={async () => {}}
        onChangePassword={async () => {}}
      />
    </MemoryRouter>
  )
}

describe('ProfilePage', () => {
  it('以页面形态渲染,不产生模态遮罩浮层', () => {
    renderProfilePage()

    // 页面壳与内嵌内容卡片存在
    expect(document.querySelector('.profile-page')).toBeTruthy()
    expect(document.querySelector('.profile-modal-embedded')).toBeTruthy()

    // embedded 形态不再渲染 .modal-overlay 遮罩(也不会 portal 出全屏浮层)
    expect(document.querySelector('.modal-overlay.profile-overlay')).toBeNull()

    // 页面头部返回按钮存在
    expect(screen.getByRole('button', { name: /返回/ })).toBeTruthy()

    // 浮层专属的关闭按钮在 embedded 下不渲染
    expect(document.querySelector('.profile-page .close-btn')).toBeNull()
  })

  it('内嵌形态保留资料编辑与退出登录功能入口', () => {
    renderProfilePage()

    // 用户信息与核心操作仍在(embedded 与模态共用同一内容)
    expect(screen.getByText('test@example.com')).toBeTruthy()
    expect(screen.getByText(/退出登录/)).toBeTruthy()
    expect(screen.getByText(/修改密码/)).toBeTruthy()
  })
})
