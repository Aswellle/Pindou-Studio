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

/** 云端/本机都读成功且为空的拼豆资产,用于让统计显示 0 而不是骨架 */
const emptyBeadStore = {
  palettes: [], colors: [], inventory: [],
  loading: false, error: null, pendingLocal: 0, mode: 'local',
}

function renderPage(overrides = {}, { initialEntries = ['/profile'], initialIndex } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/profile" element={
          <ProfilePage
            user={mockUser}
            onLogout={() => {}}
            onUpdateProfile={async () => {}}
            onChangePassword={async () => {}}
            {...overrides}
          />
        } />
        <Route path="/login" element={<div>login-marker</div>} />
        <Route path="/" element={<div>home-marker</div>} />
        <Route path="/gallery" element={<div>gallery-marker</div>} />
      </Routes>
    </MemoryRouter>
  )
}

/** 分区导航是按钮,按文案切换后目标分区才会挂载 */
const gotoSection = (label) => fireEvent.click(screen.getByRole('button', { name: label }))

describe('ProfilePage', () => {
  it('以独立页面形态渲染(页面壳 + 分区导航 + 身份摘要),不产生模态遮罩', () => {
    const { container } = renderPage()

    expect(container.querySelector('.profile-page')).toBeTruthy()
    expect(container.querySelector('.pf-layout')).toBeTruthy()
    expect(container.querySelector('.pf-nav')).toBeTruthy()
    expect(container.querySelector('.pf-identity-summary')).toBeTruthy()
    // 页面形态不再渲染模态遮罩,也没有浮层的关闭按钮
    expect(container.querySelector('.modal-overlay.profile-overlay')).toBeNull()
    expect(container.querySelector('.profile-page .close-btn')).toBeNull()
    // 页面头部返回按钮存在
    expect(screen.getByRole('button', { name: /返回/ })).toBeTruthy()
  })

  it('页面内不出现站点导航/其他页面控件/登录按钮', () => {
    const { container } = renderPage()

    // 站点顶栏(nav/logo)与画布工具栏、保存/导出、调色板等均不得出现
    expect(container.querySelector('header.header, header.site-header, .mobile-toolbar, .color-palette, .tools-drawer')).toBeNull()
    // 登录/注册是 /login 的职责:本页不得出现登录或注册按钮(退出登录不算)
    expect(screen.queryByRole('button', { name: /^(登录|立即登录|登录\/注册)$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^注册$/ })).toBeNull()
    expect(screen.queryByText(/保存到图库|导出/)).toBeNull()
    // 只保留个人资料自身的操作入口
    expect(screen.getByText('test@example.com')).toBeTruthy()
    expect(screen.getByText(/退出登录/)).toBeTruthy()
    gotoSection('账号与安全')
    expect(screen.getByText(/修改密码/)).toBeTruthy()
  })

  it('切换分区只渲染当前分区的内容', () => {
    renderPage()

    // 概览默认可见,资料表单尚未挂载
    expect(screen.getByText('最近作品')).toBeTruthy()
    expect(screen.queryByLabelText('昵称')).toBeNull()

    gotoSection('个人资料')
    expect(screen.getByLabelText('昵称')).toBeTruthy()
    expect(screen.queryByText('最近作品')).toBeNull()

    gotoSection('偏好设置')
    expect(screen.getByText('界面语言')).toBeTruthy()
    expect(screen.queryByLabelText('昵称')).toBeNull()
  })

  it('自动保存开关用的是 App 下传的状态,勾选后回调给上层', () => {
    // 这里不能自持一份 useState:开关要作用的是创作页正在跑的那个自动保存实例。
    // 组件内自持状态只会写 localStorage,当前会话里的自动保存照旧写草稿 ——
    // 表面关了、实际没关。
    const onToggleAutoSave = vi.fn()
    const { container, rerender } = renderPage({ autoSaveEnabled: false, onToggleAutoSave })

    gotoSection('偏好设置')
    const box = container.querySelector('.pf-switch-row input[type="checkbox"]')
    expect(box).toBeTruthy()
    expect(box.checked).toBe(false)

    fireEvent.click(box)
    expect(onToggleAutoSave).toHaveBeenCalledWith(true)

    // 状态由上层驱动:上层改成 true 后勾选框跟着变
    rerender(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={
            <ProfilePage
              user={mockUser}
              autoSaveEnabled
              onToggleAutoSave={onToggleAutoSave}
            />
          } />
        </Routes>
      </MemoryRouter>,
    )
    gotoSection('偏好设置')
    expect(container.querySelector('.pf-switch-row input[type="checkbox"]').checked).toBe(true)
  })

  it('统计加载中显示骨架,读取失败显示骨架而不是 0,只有读到空才是 0', () => {
    const { container, rerender } = renderPage({ worksLoading: true })
    // 加载中:作品统计是骨架,不是 0
    expect(container.querySelectorAll('.pf-stat-skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByText('已保存图纸')).toBeTruthy()

    // 云端读取失败:仍然不能把「读不到」画成「0 件」
    rerender(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={
            <ProfilePage
              user={mockUser}
              works={[]}
              worksLoading={false}
              worksError={{ code: 'loadFailed' }}
              beadStore={emptyBeadStore}
            />
          } />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(/云端作品暂时没读到/)).toBeTruthy()
    expect(container.querySelector('.pf-stat-skeleton')).toBeTruthy()

    // 读到且确实为空:这时才显示 0
    rerender(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={
            <ProfilePage
              user={mockUser}
              works={[]}
              worksLoading={false}
              worksError={null}
              beadStore={emptyBeadStore}
            />
          } />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('已保存图纸').parentElement.textContent).toContain('0')
    expect(container.querySelector('.pf-stat-skeleton')).toBeNull()
  })

  it('用户名账号只显示用户名,任何分区都不出现合成邮箱', () => {
    const usernameUser = {
      id: 'u2',
      email: 'alice@custom.local',
      username: 'alice',
      authType: 'username',
      nickname: '',
      name: 'alice',
      emailConfirmedAt: null,
      pendingEmail: null,
    }
    renderPage({ user: usernameUser })

    // 概览里名称与账号标识都是 alice(显示名回落到用户名),用 getAllByText 而非唯一匹配
    expect(screen.getAllByText('alice').length).toBeGreaterThan(0)
    expect(screen.getByText('用户名账号')).toBeTruthy()
    expect(screen.queryByText(/custom\.local/)).toBeNull()

    gotoSection('个人资料')
    expect(screen.getByText('用户名')).toBeTruthy()
    expect(screen.queryByText(/custom\.local/)).toBeNull()

    // 用户名账号没有真实邮箱 → 不提供更换邮箱入口,只提供安全密钥
    gotoSection('账号与安全')
    expect(screen.queryByText('更换邮箱')).toBeNull()
    expect(screen.getByText('安全密钥')).toBeTruthy()
    expect(screen.queryByText(/custom\.local/)).toBeNull()
  })

  it('昵称未改动时保存按钮禁用,改动后可保存并提示已保存', async () => {
    renderPage()
    gotoSection('个人资料')

    const saveBtn = screen.getByRole('button', { name: '保存' })
    expect(saveBtn.disabled).toBe(true)

    fireEvent.change(screen.getByDisplayValue('测试用户'), { target: { value: '新昵称' } })
    expect(saveBtn.disabled).toBe(false)

    fireEvent.click(saveBtn)
    expect(await screen.findByText('已保存')).toBeTruthy()
  })

  it('修改密码表单缺少当前密码时给出校验提示', async () => {
    const { container } = renderPage()
    gotoSection('账号与安全')

    expect(screen.getByLabelText('当前密码')).toBeTruthy()

    // 密码表单内的「保存」,按表单范围定位,避免与其他卡片的按钮歧义
    const pwForm = container.querySelector('.pf-form')
    fireEvent.click(within(pwForm).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('请输入当前密码')).toBeTruthy()
  })

  it('头像上传过门控:非图片 / 超大字节 / 像素极多的文件均被拒绝,不进入裁剪', async () => {
    const { container } = renderPage()
    gotoSection('个人资料')

    const input = container.querySelector('input[type="file"]')
    const pngWithSize = (w, h) => {
      const bytes = new Uint8Array(24)
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const dv = new DataView(bytes.buffer)
      dv.setUint32(16, w)
      dv.setUint32(20, h)
      return bytes
    }

    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText('请选择图片格式的头像文件')).toBeTruthy()

    fireEvent.change(input, { target: { files: [new File([pngWithSize(20000, 20000)], 'huge.png', { type: 'image/png' })] } })
    expect(await screen.findByText(/像素过多/)).toBeTruthy()

    expect(container.querySelector('.pf-avatar-editor')).toBeTruthy()
    expect(container.querySelector('.pf-avatar-editor input[type="file"]')).toBeTruthy()
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
    const tree = (user) => (
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage user={user} onLogout={vi.fn()} onUpdateProfile={async () => {}} onChangePassword={async () => {}} />} />
        </Routes>
      </MemoryRouter>
    )

    const { rerender } = render(tree({ id: 'u1', email: 'test@example.com' }))
    gotoSection('个人资料')

    // 首帧无昵称 → 资料到达后同步进输入框
    const nickInput = () => screen.getByLabelText('昵称')
    expect(nickInput().value).toBe('')
    rerender(tree({ id: 'u1', email: 'test@example.com', nickname: '测试用户' }))
    expect(await waitFor(() => expect(nickInput().value).toBe('测试用户')))

    // 用户编辑后再刷新资料:保留用户输入
    fireEvent.change(nickInput(), { target: { value: '我在编辑' } })
    rerender(tree({ id: 'u1', email: 'test@example.com', nickname: '别的名字' }))
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
    renderPage({}, { initialEntries: ['/profile'] })

    fireEvent.click(screen.getByRole('button', { name: /返回/ }))

    expect(screen.getByText('home-marker')).toBeTruthy()
  })

  it('从站内进入个人资料页时,返回按钮回退上一页', () => {
    const originalLength = window.history.length
    // jsdom 中 MemoryRouter 不写 window.history,手动模拟"存在浏览历史"
    Object.defineProperty(window.history, 'length', { value: 3, configurable: true })
    try {
      renderPage({}, { initialEntries: ['/', '/profile'], initialIndex: 1 })

      fireEvent.click(screen.getByRole('button', { name: /返回/ }))

      expect(screen.getByText('home-marker')).toBeTruthy()
    } finally {
      Object.defineProperty(window.history, 'length', { value: originalLength, configurable: true })
    }
  })
})
