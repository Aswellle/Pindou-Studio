/**
 * SharePage 组件测试:公开落地页的全部边界状态。
 *
 * shareService 用 mock 替身;路由用 MemoryRouter,/login 渲染一个
 * LocationSpy 用于断言「跳登录 + 回跳 state」。HelmetProvider 提供真实
 * meta 提交,直接断言 document.title / robots meta。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import i18n from '../../i18n'

vi.mock('./shareService', () => ({
  fetchPublicShare: vi.fn(),
  shareCardPublicUrl: vi.fn(() => ''),
  submitShareReport: vi.fn(),
}))
vi.mock('../../components/ThumbnailCanvas', () => ({
  default: ({ gridWidth, gridHeight }) => (
    <div data-testid="thumb" data-size={`${gridWidth}x${gridHeight}`} />
  ),
}))

const { fetchPublicShare, shareCardPublicUrl, submitShareReport } = await import('./shareService')
const { default: SharePage } = await import('./SharePage')

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const OK = { ok: true, data: null, error: null, detail: null }
const NOT_FOUND = { ok: false, data: null, error: 'shareNotFound', detail: null }
const NETWORK = { ok: false, data: null, error: 'network', detail: 'Failed to fetch' }

const share = () => ({
  id: UUID,
  title: '雪景小屋',
  description: '冬日雪景',
  authorLabel: '拼豆创作者',
  gridWidth: 9,
  gridHeight: 9,
  canvasData: Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 9 }, (_, x) => ((x + y) % 2 === 0 ? '#FF0000' : '#FFFFFF'))
  ),
  paletteId: 'perler',
  previewImagePath: null,
  status: 'published',
})

let lastLoginLocation = null
function LocationSpy() {
  lastLoginLocation = useLocation()
  return <div>login-page-stub</div>
}

function renderPage({ path = `/share/${UUID}`, user = null, authLoading = false, onSaveWork } = {}) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/share/:id"
            element={<SharePage user={user} authLoading={authLoading} onSaveWork={onSaveWork} />}
          />
          <Route path="/login" element={<LocationSpy />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

beforeEach(() => {
  for (const fn of [fetchPublicShare, shareCardPublicUrl, submitShareReport]) fn.mockReset()
  shareCardPublicUrl.mockReturnValue('')
  submitShareReport.mockResolvedValue(OK)
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('SharePage 加载与错误状态', () => {
  it('非法 id 直接 notFound,不发请求;helmet 标题与 noindex 生效', async () => {
    fetchPublicShare.mockResolvedValue(NOT_FOUND)
    renderPage({ path: '/share/not-a-uuid' })
    expect(await screen.findByText('分享不存在或已被撤销')).toBeTruthy()
    expect(fetchPublicShare).not.toHaveBeenCalled()
    // react-helmet-async 异步提交 head:高负载下不能假设与 DOM 同帧就绪
    await waitFor(() => expect(document.title).toContain('分享不存在或已被撤销'))
    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
    )
  })

  it('loading 状态渲染提示', async () => {
    fetchPublicShare.mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByText('正在加载分享…')).toBeTruthy()
  })

  it('服务端不可见(不存在/已撤销)→ notFound,不可重试', async () => {
    fetchPublicShare.mockResolvedValue(NOT_FOUND)
    renderPage()
    expect(await screen.findByText('分享不存在或已被撤销')).toBeTruthy()
    expect(screen.getByText(/链接可能已失效/)).toBeTruthy()
    expect(screen.queryByText('重试')).toBeNull()
  })

  it('网络失败 → network 状态 + 重试按钮,重试成功后进入 ready', async () => {
    fetchPublicShare.mockResolvedValueOnce(NETWORK).mockResolvedValueOnce({ ...OK, data: share() })
    renderPage()
    expect(await screen.findByText('网络异常,暂时无法加载')).toBeTruthy()
    fireEvent.click(screen.getByText('重试'))
    expect(await screen.findByText('雪景小屋')).toBeTruthy()
    expect(fetchPublicShare).toHaveBeenCalledTimes(2)
  })
})

describe('SharePage ready 状态', () => {
  it('渲染标题/说明/署名/尺寸/豆数/色数与缩略图', async () => {
    fetchPublicShare.mockResolvedValue({ ...OK, data: share() })
    renderPage()
    expect(await screen.findByText('雪景小屋')).toBeTruthy()
    expect(screen.getByText('冬日雪景')).toBeTruthy()
    expect(screen.getByText(/拼豆创作者/)).toBeTruthy()
    expect(screen.getByText('尺寸 9 × 9')).toBeTruthy()
    // 9×9 棋盘:非空格共 81(两色都算豆)、2 色
    expect(screen.getByText('81 颗豆子')).toBeTruthy()
    expect(screen.getByText('2 种颜色')).toBeTruthy()
    expect(screen.getByTestId('thumb').dataset.size).toBe('9x9')
    expect(screen.getByText('#FF0000')).toBeTruthy()
  })

  it('快照提示与举报入口始终可见;登录提示仅对匿名访客展示', async () => {
    fetchPublicShare.mockResolvedValue({ ...OK, data: share() })
    const { rerender } = render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/share/${UUID}`]}>
          <Routes>
            <Route path="/share/:id" element={<SharePage user={null} authLoading={false} />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )
    expect(await screen.findByText(/内容为创建分享时的版本快照/)).toBeTruthy()
    expect(screen.getByText(/登录或注册后/)).toBeTruthy()
    rerender(
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/share/${UUID}`]}>
          <Routes>
            <Route
              path="/share/:id"
              element={
                <SharePage user={{ id: 'u1' }} authLoading={false} onSaveWork={vi.fn(async () => true)} />
              }
            />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )
    await waitFor(() => expect(screen.queryByText(/登录或注册后/)).toBeNull())
  })
})

describe('SharePage 复制流程', () => {
  it('匿名点击复制:写入 sessionStorage 标记并跳 /login,带 share-copy 原因', async () => {
    fetchPublicShare.mockResolvedValue({ ...OK, data: share() })
    renderPage()
    fireEvent.click(await screen.findByText('复制到我的图纸'))
    await waitFor(() => expect(lastLoginLocation).not.toBeNull())
    expect(sessionStorage.getItem(`share-copy-intent:${UUID}`)).toBe('1')
    expect(lastLoginLocation.pathname).toBe('/login')
    expect(lastLoginLocation.state).toEqual({
      mode: 'register',
      next: `/share/${UUID}`,
      reason: 'shareCopy',
    })
  })

  it('已登录点击复制:onSaveWork 收到 shared-copy 新作品', async () => {
    fetchPublicShare.mockResolvedValue({ ...OK, data: share() })
    const onSaveWork = vi.fn(async () => true)
    renderPage({ user: { id: 'u1' }, onSaveWork })
    fireEvent.click(await screen.findByText('复制到我的图纸'))
    await waitFor(() => expect(onSaveWork).toHaveBeenCalledTimes(1))
    const work = onSaveWork.mock.calls[0][0]
    expect(work.sourceKind).toBe('shared-copy')
    expect(work.name).toBe('雪景小屋')
    expect(work.canvasData).toHaveLength(9)
    expect(work.id).not.toBe(UUID)
    await waitFor(() => expect(screen.getByText('已复制到你的作品')).toBeTruthy())
  })

  it('保存失败:按钮回到可复制状态,不显示成功', async () => {
    fetchPublicShare.mockResolvedValue({ ...OK, data: share() })
    const onSaveWork = vi.fn(async () => false)
    renderPage({ user: { id: 'u1' }, onSaveWork })
    fireEvent.click(await screen.findByText('复制到我的图纸'))
    await waitFor(() => expect(onSaveWork).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('复制到我的图纸')).toBeTruthy())
    expect(screen.queryByText('已复制到你的作品')).toBeNull()
  })

  it('登录后恢复 intent:自动复制一次并清掉标记,不重复执行', async () => {
    sessionStorage.setItem(`share-copy-intent:${UUID}`, '1')
    fetchPublicShare.mockResolvedValue({ ...OK, data: share() })
    const onSaveWork = vi.fn(async () => true)
    const view = renderPage({ user: { id: 'u1' }, onSaveWork })
    await waitFor(() => expect(onSaveWork).toHaveBeenCalledTimes(1))
    expect(sessionStorage.getItem(`share-copy-intent:${UUID}`)).toBeNull()
    view.rerender(
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/share/${UUID}`]}>
          <Routes>
            <Route
              path="/share/:id"
              element={<SharePage user={{ id: 'u1' }} authLoading={false} onSaveWork={onSaveWork} />}
            />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    )
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(onSaveWork).toHaveBeenCalledTimes(1)
  })

  it('authLoading 期间按钮禁用且不触发复制', async () => {
    fetchPublicShare.mockResolvedValue({ ...OK, data: share() })
    const onSaveWork = vi.fn(async () => true)
    renderPage({ user: { id: 'u1' }, authLoading: true, onSaveWork })
    const button = await screen.findByText('复制到我的图纸')
    expect(button.closest('button').disabled).toBe(true)
  })
})

describe('SharePage 举报对话框', () => {
  const openReport = async () => {
    fetchPublicShare.mockResolvedValue({ ...OK, data: share() })
    renderPage()
    fireEvent.click(await screen.findByText('举报 / 权利投诉'))
    await screen.findByText('举报或权利投诉')
  }

  it('打开 → 填写 → 提交成功 → 表单清空、成功文案', async () => {
    await openReport()
    fireEvent.change(screen.getByLabelText('类别'), { target: { value: 'privacy' } })
    fireEvent.change(screen.getByLabelText('说明'), { target: { value: '涉嫌侵权内容' } })
    fireEvent.click(screen.getByText('提交'))
    await waitFor(() => expect(submitShareReport).toHaveBeenCalledTimes(1))
    expect(submitShareReport).toHaveBeenCalledWith({
      shareId: UUID,
      category: 'privacy',
      detail: '涉嫌侵权内容',
      contact: '',
    })
    expect(await screen.findByText('已收到,我们会尽快处理。')).toBeTruthy()
    expect(screen.getByLabelText('说明').value).toBe('')
  })

  it('提交失败显示失败文案,对话框保留可重试', async () => {
    submitShareReport.mockResolvedValue({ ok: false, data: null, error: 'rateLimited', detail: 'x' })
    await openReport()
    fireEvent.click(screen.getByText('提交'))
    await waitFor(() => expect(screen.getByText('提交失败,请稍后重试。')).toBeTruthy())
    expect(screen.getByText('提交')).toBeTruthy()
  })

  it('关闭后不再渲染对话框', async () => {
    await openReport()
    fireEvent.click(screen.getByText('关闭'))
    await waitFor(() => expect(screen.queryByText('举报或权利投诉')).toBeNull())
  })
})
