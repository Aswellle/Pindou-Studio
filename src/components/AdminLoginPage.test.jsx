import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminLoginPage from './AdminLoginPage'
import i18n from '../i18n'

// 只替换网络层:组件真实走 supabase.auth / supabase.from
// (vi.mock 工厂会被提升,故用 vi.hoisted 定义可引用的 mock 对象)
const mocks = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(),
      listFactors: vi.fn(),
      challenge: vi.fn(),
      verify: vi.fn(),
      enroll: vi.fn(),
      unenroll: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  maybeSingle: vi.fn(),
}))
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: mocks.auth,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  },
  SUPABASE_PROXIED: false,
  toStorageUrl: () => null,
}))
const auth = mocks.auth
const maybeSingle = mocks.maybeSingle

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  auth.signOut.mockResolvedValue({ error: null })
  auth.mfa.unenroll.mockResolvedValue({ error: null })
  auth.getSession.mockResolvedValue({ data: { session: null } })
})

const renderPage = (onLogin = vi.fn().mockResolvedValue(undefined)) => render(
  <MemoryRouter initialEntries={['/admin/login']}>
    <Routes>
      <Route path="/admin/login" element={<AdminLoginPage onLogin={onLogin} />} />
      <Route path="/admin" element={<div>admin-console</div>} />
    </Routes>
  </MemoryRouter>,
)

const submitCredentials = async () => {
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'admin@example.com' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
}

describe('AdminLoginPage — 管理员登录防护', () => {
  it('已绑定 TOTP 的账号:密码通过后必须完成动态码校验才进入后台', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] } })
    auth.mfa.challenge.mockResolvedValue({ data: { id: 'ch1' }, error: null })
    auth.mfa.verify.mockResolvedValue({ data: {}, error: null })

    renderPage()
    await submitCredentials()

    // 停在第 2 步:未验证前不得进入后台
    expect(await screen.findByText('输入身份验证器应用中的 6 位动态码后进入后台')).toBeTruthy()
    expect(screen.queryByText('admin-console')).toBeNull()

    // 位数不足时提交按钮禁用
    const verifyBtn = screen.getByRole('button', { name: '验证并进入' })
    expect(verifyBtn.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('动态码'), { target: { value: '123456' } })
    expect(verifyBtn.disabled).toBe(false)
    fireEvent.click(verifyBtn)

    await waitFor(() => expect(screen.getByText('admin-console')).toBeTruthy())
    expect(auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'f1' })
    expect(auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'ch1', code: '123456' })
  })

  it('动态码错误:给出提示且不进入后台', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] } })
    auth.mfa.challenge.mockResolvedValue({ data: { id: 'ch1' }, error: null })
    auth.mfa.verify.mockResolvedValue({ data: null, error: { message: 'Invalid TOTP code entered' } })

    renderPage()
    await submitCredentials()
    fireEvent.change(await screen.findByLabelText('动态码'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并进入' }))

    expect(await screen.findByText('动态码不正确或已过期,请重试')).toBeTruthy()
    expect(screen.queryByText('admin-console')).toBeNull()
  })

  it('未绑定 TOTP:提示风险并给出绑定入口,可显式跳过进入后台', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] } })

    renderPage()
    await submitCredentials()

    expect(await screen.findByText(/未启用两步验证时,仅凭密码即可进入后台/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '暂不启用,直接进入' }))
    await waitFor(() => expect(screen.getByText('admin-console')).toBeTruthy())
  })

  it('绑定流程:展示二维码与密钥,验证成功后进入后台', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'old', status: 'unverified' }], totp: [] } })
    auth.mfa.enroll.mockResolvedValue({ data: { id: 'f-new', totp: { qr_code: 'data:image/svg+xml;utf8,<svg/>', secret: 'ABCDEFGHIJKLMNOP' } }, error: null })
    auth.mfa.challenge.mockResolvedValue({ data: { id: 'ch2' }, error: null })
    auth.mfa.verify.mockResolvedValue({ data: {}, error: null })

    renderPage()
    await submitCredentials()
    fireEvent.click(await screen.findByRole('button', { name: '立即启用两步验证' }))

    expect(await screen.findByText('ABCDEFGHIJKLMNOP')).toBeTruthy()
    // 历史未验证因子先被清理,避免同名因子重复 enroll 报错
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' })

    fireEvent.change(screen.getByLabelText('动态码'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: '完成绑定' }))
    await waitFor(() => expect(screen.getByText('admin-console')).toBeTruthy())
  })

  it('项目未启用 MFA:绑定失败时给出可执行的指引', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] } })
    auth.mfa.enroll.mockResolvedValue({ data: null, error: { message: 'MFA is not enabled' } })

    renderPage()
    await submitCredentials()
    fireEvent.click(await screen.findByRole('button', { name: '立即启用两步验证' }))

    expect(await screen.findByText(/Supabase 控制台开启 Authentication → Multi-Factor Auth/)).toBeTruthy()
  })

  it('非管理员账号:提示无权限且不进入后台', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    maybeSingle.mockResolvedValue({ data: { role: 'user' } })

    renderPage()
    await submitCredentials()

    expect(await screen.findByText('该账号无后台管理权限')).toBeTruthy()
    expect(screen.queryByText('admin-console')).toBeNull()
    expect(auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled()
  })

  it('刷新页面时按当前会话等级续走:aal2 直接进后台,已绑定则要求输码', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } })

    renderPage()
    await waitFor(() => expect(screen.getByText('admin-console')).toBeTruthy())
  })

  it('AAL 接口异常时不静默卡住:回退按会话因子判定,aal1 且已绑定因子则要求输码', async () => {
    // 回归:此前 AAL 抛错会让页面停在密码页且毫无反应(异常未兜底)
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', factors: [{ id: 'f9', factor_type: 'totp', status: 'verified' }] } } },
    })
    maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
    auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('aal unavailable'))

    renderPage()
    expect(await screen.findByLabelText('动态码')).toBeTruthy()
    expect(screen.queryByText('admin-console')).toBeNull()
  })

  it('AAL 接口异常且未绑定因子:退回绑定分支,不要求重新登录', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', factors: [] } } } })
    maybeSingle.mockResolvedValue({ data: { role: 'admin' } })
    auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('aal unavailable'))

    renderPage()
    expect(await screen.findByRole('button', { name: '立即启用两步验证' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '登录' })).toBeNull()
  })
})
