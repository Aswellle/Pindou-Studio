import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
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
        <Route path="/login" element={<div>login-marker</div>} />
        <Route path="/" element={<div>home-marker</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProfilePage', () => {
  it('以独立页面形态渲染(页面壳 + 身份卡 + 设置卡),不产生模态遮罩', () => {
    const { container } = renderProfilePage()

    expect(container.querySelector('.profile-page')).toBeTruthy()
    expect(container.querySelector('.profile-layout')).toBeTruthy()
    expect(container.querySelector('.profile-identity')).toBeTruthy()
    // 页面形态不再渲染模态遮罩,也没有浮层的关闭按钮
    expect(container.querySelector('.modal-overlay.profile-overlay')).toBeNull()
    expect(container.querySelector('.profile-page .close-btn')).toBeNull()
    // 页面头部返回按钮存在
    expect(screen.getByRole('button', { name: /返回/ })).toBeTruthy()
  })

  it('页面内不出现站点导航/其他页面控件/登录按钮', () => {
    const { container } = renderProfilePage()

    // 站点顶栏(nav/logo)与画布工具栏、保存/导出、调色板等均不得出现
    expect(container.querySelector('header.site-header, nav, .mobile-toolbar, .color-palette, .tools-drawer')).toBeNull()
    // 登录/注册是 /login 的职责:本页不得出现登录或注册按钮(退出登录不算)
    expect(screen.queryByRole('button', { name: /^(登录|立即登录|登录\/注册)$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^注册$/ })).toBeNull()
    expect(screen.queryByText(/保存到图库|导出/)).toBeNull()
    // 只保留个人资料自身的操作入口
    expect(screen.getByText('test@example.com')).toBeTruthy()
    expect(screen.getByText(/退出登录/)).toBeTruthy()
    expect(screen.getByText(/修改密码/)).toBeTruthy()
  })

  it('昵称未改动时保存按钮禁用,改动后可保存并提示已保存', async () => {
    renderProfilePage()

    const saveBtn = screen.getByRole('button', { name: '保存' })
    expect(saveBtn.disabled).toBe(true)

    fireEvent.change(screen.getByDisplayValue('测试用户'), { target: { value: '新昵称' } })
    expect(saveBtn.disabled).toBe(false)

    fireEvent.click(saveBtn)
    expect(await screen.findByText('已保存')).toBeTruthy()
  })

  it('点击修改密码展开表单,缺少当前密码时给出校验提示', async () => {
    const { container } = renderProfilePage()

    fireEvent.click(screen.getByRole('button', { name: '修改密码' }))
    expect(screen.getByLabelText('当前密码')).toBeTruthy()

    // 密码表单与昵称卡各有一个「保存」:按表单范围定位,避免歧义
    const pwForm = container.querySelector('.profile-pw-form')
    fireEvent.click(within(pwForm).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('请输入当前密码')).toBeTruthy()
  })

  it('退出登录需二次确认', () => {
    const onLogout = vi.fn()
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={
            <ProfilePage user={mockUser} onLogout={onLogout} onUpdateProfile={async () => {}} onChangePassword={async () => {}} />
          } />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(onLogout).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('资料异步到达时昵称输入框跟随同步,已编辑内容不被覆盖', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage user={{ id: 'u1', email: 'test@example.com' }} onLogout={vi.fn()} onUpdateProfile={async () => {}} onChangePassword={async () => {}} />} />
        </Routes>
      </MemoryRouter>,
    )

    // 首帧无昵称 → 资料到达后同步进输入框
    const nickInput = () => screen.getByLabelText('昵称')
    expect(nickInput().value).toBe('')
    rerender(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage user={{ id: 'u1', email: 'test@example.com', nickname: '测试用户' }} onLogout={vi.fn()} onUpdateProfile={async () => {}} onChangePassword={async () => {}} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await waitFor(() => expect(nickInput().value).toBe('测试用户')))

    // 用户编辑后再刷新资料:保留用户输入
    fireEvent.change(nickInput(), { target: { value: '我在编辑' } })
    rerender(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage user={{ id: 'u1', email: 'test@example.com', nickname: '别的名字' }} onLogout={vi.fn()} onUpdateProfile={async () => {}} onChangePassword={async () => {}} />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(nickInput().value).toBe('我在编辑')
  })

  it('未登录时直接跳转独立登录页(本页不提供登录入口)', () => {
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage user={null} onLogout={vi.fn()} onUpdateProfile={async () => {}} onChangePassword={async () => {}} />} />
          <Route path="/login" element={<div>login-marker</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('login-marker')).toBeTruthy()
  })

  it('会话解析中不跳转登录页(已登录用户不被误踢)', () => {
    // 回归:authLoading 期间 user 仍为 null,若据此判定未登录,已登录用户会被重定向
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage user={null} authLoading onLogout={vi.fn()} onUpdateProfile={async () => {}} onChangePassword={async () => {}} />} />
          <Route path="/login" element={<div>login-marker</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByText('login-marker')).toBeNull()
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
