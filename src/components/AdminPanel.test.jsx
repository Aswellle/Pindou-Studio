import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminPanel from './AdminPanel'
import i18n from '../i18n'

// 回归:门禁抽成 AdminGate 后,children 曾按 JSX 提前求值 —— 未登录时
// AdminPanel 头部读 user.email 直接空指针白屏。此处锁住「未登录不崩、显示登录门禁」。

vi.mock('../services/supabase', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }), from: vi.fn() },
  SUPABASE_PROXIED: false,
  toStorageUrl: () => null,
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(cleanup)

const cloudStore = { enabled: true, loading: false, templates: [], categories: [], refresh: vi.fn() }

const setup = (props = {}) => render(
  <MemoryRouter initialEntries={['/admin']}>
    <AdminPanel
      user={null}
      isAdmin={false}
      authLoading={false}
      onLogin={vi.fn()}
      onLogout={vi.fn()}
      onChangePassword={vi.fn()}
      cloudStore={cloudStore}
      {...props}
    />
  </MemoryRouter>,
)

describe('AdminPanel 门禁', () => {
  it('未登录:显示登录门禁而不抛错(不读取 user 字段)', () => {
    expect(() => setup({ user: null })).not.toThrow()
    expect(screen.getByText('管理员登录')).toBeTruthy()
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy()
    expect(screen.queryByText('ADMIN')).toBe(null)
  })

  it('已登录但非管理员:显示无权限,不渲染后台内容', () => {
    setup({ user: { email: 'user@example.com' }, isAdmin: false })
    expect(screen.getByText('当前账号无管理员权限')).toBeTruthy()
    expect(screen.queryByText('ADMIN')).toBe(null)
  })

  it('会话检查中:显示检查提示', () => {
    setup({ authLoading: true })
    expect(screen.getByText('正在检查登录状态...')).toBeTruthy()
  })

  it('云端未配置:显示配置指引', () => {
    setup({ cloudStore: { enabled: false, loading: false, templates: [], categories: [] } })
    expect(screen.getByText('云端未配置')).toBeTruthy()
  })
})
