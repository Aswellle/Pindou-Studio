import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import UserManager from './UserManager'
import { resetIpRegionCache } from '../utils/ipGeolocation'
import i18n from '../i18n'

/**
 * 用户管理表格:登录环境(IP 归属地 / 设备)两列的数据绑定与降级。
 * supabase 走 mock —— jsdom 里不真连云端;归属地接口同样 mock 掉。
 */

const publicUser = {
  id: 'u-1',
  email: 'user@example.com',
  role: 'user',
  nickname: '小明',
  email_confirmed: true,
  created_at: '2026-11-01T08:00:00Z',
  last_sign_in_at: '2026-11-11T09:30:00Z',
  is_custom: false,
  last_login_ip: '114.114.114.114',
  last_login_user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  last_login_snapshot_at: '2026-11-11T09:30:05Z',
}

const privateUser = {
  ...publicUser,
  id: 'u-2',
  email: 'local@example.com',
  nickname: null,
  last_login_ip: '192.168.1.10',
  last_login_user_agent: null,
  last_login_snapshot_at: null,
}

const rpcMock = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    channel: () => ({ on: () => ({ subscribe: () => 'ch' }) }),
    removeChannel: () => {},
  },
}))

vi.mock('./Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    adminDeleteUser: vi.fn(),
    adminLockUser: vi.fn(),
    adminUnlockUser: vi.fn(),
  }),
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(() => {
  cleanup()
  rpcMock.mockReset()
  resetIpRegionCache()
})

function installRpc(users) {
  rpcMock.mockImplementation(async (name) => {
    if (name === 'admin_user_stats') {
      return { data: [{ total: users.length, verified: users.length, unverified: 0, admins: 0, recent_30d: users.length }] }
    }
    if (name === 'admin_list_users') return { data: users }
    return { data: [] }
  })
}

describe('UserManager · 登录环境列', () => {
  it('展示最近登录 IP 与归属地、设备摘要(解析 UA)', async () => {
    installRpc([publicUser])
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, country: '中国', region: '江苏省', city: '南京' }),
    })))

    const { container } = render(<UserManager />)
    await waitFor(() => expect(container.querySelector('.users-ip-addr')?.textContent).toBe('114.114.114.114'))

    // 归属地来自异步查询,就绪后填入
    await waitFor(() => expect(container.querySelector('.users-ip-region')?.textContent).toBe('中国 江苏省 南京'))
    // 设备列解析 UA 为「系统 · 浏览器」,原始 UA 留在悬浮提示
    const deviceCell = container.querySelector('.users-device')
    expect(deviceCell.textContent).toContain('Windows')
    expect(deviceCell.textContent).toContain('Chrome')
    expect(deviceCell.getAttribute('title')).toContain('Mozilla/5.0')
  })

  it('内网 IP 标记为「内网 / 本地」且不发归属地请求;缺失数据显示 —', async () => {
    installRpc([privateUser])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<UserManager />)
    await waitFor(() => expect(container.querySelector('.users-ip-addr')?.textContent).toBe('192.168.1.10'))

    expect(container.querySelector('.users-ip-region')?.textContent).toBe('内网 / 本地')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.querySelector('.users-device')?.textContent).toContain('—')
  })

  it('两个新列都带表头,移动端卡片每格带 data-label', async () => {
    installRpc([publicUser])
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, country: '中国', region: '江苏省', city: '南京' }),
    })))

    const { container } = render(<UserManager />)
    await waitFor(() => expect(container.querySelector('.users-ip-addr')).toBeTruthy())

    const headers = [...container.querySelectorAll('.users-table thead th')].map(th => th.textContent)
    expect(headers).toContain('最近登录 IP')
    expect(headers).toContain('设备 / 环境')
    // 移动端卡片布局依赖每个 td 的 data-label 标注字段名
    const labeled = [...container.querySelectorAll('.users-table tbody td')]
    expect(labeled.length).toBeGreaterThan(0)
    expect(labeled.every(td => td.getAttribute('data-label'))).toBe(true)
  })
})
