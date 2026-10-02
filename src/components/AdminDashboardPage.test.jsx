import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AdminDashboardPage from './AdminDashboardPage'
import i18n from '../i18n'

// 组件真实走 useAdminOverview → supabase.rpc,这里只替换网络层
const rpc = vi.fn()
vi.mock('../services/supabase', () => ({
  supabase: { rpc: (...args) => rpc(...args), from: vi.fn() },
  SUPABASE_PROXIED: false,
  toStorageUrl: () => null,
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {}, stroke: () => {}, clearRect: () => {},
    fillText: () => {}, arc: () => {}, fill: () => {}, save: () => {}, restore: () => {},
    clip: () => {}, translate: () => {}, scale: () => {}, drawImage: () => {},
    setTransform: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }
  HTMLCanvasElement.prototype.getContext = function () { return ctx }
})

afterEach(() => {
  cleanup()
  rpc.mockReset()
})

const OVERVIEW = {
  users: {
    total: 42, verified: 30, unverified: 12, admins: 2,
    new7d: 5, new30d: 11, active7d: 9, neverSignedIn: 3, banned: 1, usernameAccounts: 7,
  },
  registrations: [
    { date: '2026-09-30', email: 1, username: 0 },
    { date: '2026-10-01', email: 2, username: 1 },
    { date: '2026-10-02', email: 0, username: 2 },
  ],
  contact: {
    threads: 4, messages: 9, pending: 2,
    pendingList: [
      { participantId: 'p1', email: null, message: '导出没有反应', createdAt: '2026-10-02T10:00:00Z' },
      { participantId: 'p2', email: 'a@b.c', message: '想问下色卡', createdAt: '2026-10-01T09:00:00Z' },
    ],
  },
}

const CLOUD_STORE = {
  enabled: true,
  loading: false,
  refresh: vi.fn(),
  categories: [{ id: 'animal', label: '动物' }, { id: 'food', label: '食物' }],
  templates: [
    { id: 'a', name: 'Cat', nameZh: '小猫', category: 'animal', difficulty: 'easy', size: 2, paletteId: 'perler', source: 'builtin', downloadCount: 12, pattern: [['#fff', '#000'], ['#000', '#fff']] },
    { id: 'b', name: 'Duck', category: 'animal', difficulty: 'hard', size: 2, paletteId: 'mard', source: 'custom', downloadCount: 0, pattern: [['#fff', '#000'], ['#000', '#fff']] },
  ],
}

let currentLocation = null
function LocationProbe() {
  currentLocation = useLocation()
  return null
}

const setup = (props = {}) => render(
  <MemoryRouter initialEntries={['/admin/dashboard']}>
    <LocationProbe />
    <Routes>
      <Route path="/admin/dashboard" element={
        <AdminDashboardPage
          cloudStore={CLOUD_STORE}
          user={{ email: 'admin@example.com' }}
          isAdmin
          authLoading={false}
          onLogin={vi.fn()}
          onLogout={vi.fn()}
          {...props}
        />
      } />
      <Route path="/admin" element={<div>后台面板</div>} />
      <Route path="*" element={<div>其他页面</div>} />
    </Routes>
  </MemoryRouter>,
)

describe('AdminDashboardPage — 门禁', () => {
  it('云端未配置时显示配置指引,不请求数据', () => {
    setup({ cloudStore: { enabled: false, loading: false, templates: [], categories: [] } })
    expect(screen.getByText('云端未配置')).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('未登录时要求登录', () => {
    setup({ user: null })
    expect(screen.getByText('管理员登录')).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('非管理员显示无权限', () => {
    setup({ isAdmin: false })
    expect(screen.getByText('当前账号无管理员权限')).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('AdminDashboardPage — 概览渲染', () => {
  const mockRpc = () => {
    rpc.mockImplementation((fn) => {
      if (fn === 'admin_overview') return Promise.resolve({ data: OVERVIEW, error: null })
      if (fn === 'admin_list_registrations') {
        return Promise.resolve({
          data: [{ id: 1, email: 'new@example.com', nickname: '新用户', method: 'username', created_at: '2026-10-02T08:00:00Z' }],
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })
  }

  it('并行拉取聚合与注册名单,渲染用户口径与注册行', async () => {
    mockRpc()
    setup()
    expect(await screen.findByText('42')).toBeTruthy()
    expect(screen.getByText('已验证 30 · 未验证 12')).toBeTruthy()
    expect(screen.getByText('近 30 天 11')).toBeTruthy()
    expect(screen.getByText('从未登录 3')).toBeTruthy()
    expect(screen.getByText('新用户')).toBeTruthy()
    const calls = rpc.mock.calls.map(([fn]) => fn)
    expect(calls).toContain('admin_overview')
    expect(calls).toContain('admin_list_registrations')
  })

  it('趋势图按聚合序列绘制,并显示合计/单日峰值', async () => {
    mockRpc()
    const { container } = setup()
    await screen.findByText('42')
    const bars = container.querySelectorAll('.adash-bar-track')
    // 组件按 14 天窗口渲染:序列只有 3 天则补不齐(数据源负责补零),此处只断言已有天数
    expect(bars.length).toBe(3)
    expect(screen.getByText('合计 6')).toBeTruthy()
    expect(screen.getByText('邮箱注册 3')).toBeTruthy()
    expect(screen.getByText('用户名注册 3')).toBeTruthy()
    expect(screen.getByText('单日峰值 3')).toBeTruthy()
  })

  it('内容库统计来自 cloudStore(规模/分类分布/热门模板)', async () => {
    mockRpc()
    setup()
    await screen.findByText('42')
    expect(screen.getByText('模板总数').previousSibling.textContent).toBe('2')
    expect(screen.getByText('累计下载').previousSibling.textContent).toBe('12')
    expect(screen.getByText('热门模板(按下载量)')).toBeTruthy()
    expect(screen.getAllByText('小猫').length).toBeGreaterThan(0)
  })

  it('健康检查列出问题并给出处理入口', async () => {
    mockRpc()
    setup()
    await screen.findByText('42')
    expect(await screen.findByText('缺少中文名')).toBeTruthy()
    expect(screen.getByText('分类下没有模板')).toBeTruthy()
    expect(screen.getAllByText('去处理').length).toBeGreaterThan(0)
  })

  it('留言待办显示未回复条数与最新未回复内容', async () => {
    mockRpc()
    setup()
    await screen.findByText('42')
    expect(screen.getByText('待回复').previousSibling.textContent).toBe('2')
    expect(screen.getAllByText('未回复').length).toBe(2)
    expect(screen.getByText('导出没有反应')).toBeTruthy()
  })

  it('快捷入口跳转到对应后台标签页(带 tab 参数)', async () => {
    mockRpc()
    setup()
    await screen.findByText('42')
    fireEvent.click(screen.getByRole('button', { name: '用户管理' }))
    await waitFor(() => expect(currentLocation.pathname).toBe('/admin'))
    expect(currentLocation.search).toBe('?tab=users')
  })

  it('RPC 失败时给出重试入口,重试成功后渲染数据', async () => {
    rpc.mockImplementation((fn) => {
      if (fn === 'admin_overview') return Promise.resolve({ data: null, error: { message: 'not authorized' } })
      return Promise.resolve({ data: [], error: null })
    })
    setup()
    expect(await screen.findByText('概览数据加载失败,请重试')).toBeTruthy()
    mockRpc()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('42')).toBeTruthy()
  })
})
