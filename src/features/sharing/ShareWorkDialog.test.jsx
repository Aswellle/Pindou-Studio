/**
 * ShareWorkDialog 组件测试:gate/未配置/忙碌/错误重试/成功面板。
 *
 * useWorkShares 用 mock 替身,直接给定各状态;断言组件对状态机的呈现
 * 与用户动作(createAndPublish / retry / onPublished)的衔接。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from '../../i18n'

vi.mock('./useWorkShares', () => ({
  useWorkShares: vi.fn(),
}))
vi.mock('../gallery/components/WorkThumbnail', () => ({
  default: () => <div data-testid="work-thumb" />,
}))
vi.mock('./shareService', () => ({
  shareCardPublicUrl: vi.fn(() => ''),
}))

const { useWorkShares } = await import('./useWorkShares')
const { default: ShareWorkDialog } = await import('./ShareWorkDialog')

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const work = () => ({
  id: 'work-uuid-1',
  name: '小鸭子',
  canvasData: Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 9 }, (_, x) => ((x + y) % 2 === 0 ? '#FF0000' : null))
  ),
  gridWidth: 9,
  gridHeight: 9,
})

let hookState
const createAndPublish = vi.fn()
const retry = vi.fn()
const reset = vi.fn()

/** 按给定状态安装 hook 替身 */
function setHook(overrides = {}) {
  hookState = {
    configured: true,
    state: 'idle',
    error: null,
    share: null,
    gate: true,
    isBusy: false,
    createAndPublish,
    retry,
    reset,
    revoke: vi.fn(),
    loadShares: vi.fn(),
    refreshGate: vi.fn(),
    ...overrides,
  }
  useWorkShares.mockReturnValue(hookState)
}

const renderDialog = (props = {}) => render(<ShareWorkDialog open work={work()} {...props} />)

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

beforeEach(() => {
  createAndPublish.mockReset().mockResolvedValue(null)
  retry.mockReset().mockResolvedValue(null)
  reset.mockReset()
  setHook()
})

afterEach(cleanup)

describe('ShareWorkDialog 门禁与可用性', () => {
  it('gate 关闭:显示未开放提示,提交禁用,可就地重试门禁查询', () => {
    const refreshGate = vi.fn()
    setHook({ gate: false, refreshGate })
    renderDialog()
    expect(screen.getByText('分享发布暂未开放')).toBeTruthy()
    expect(screen.getByText('生成分享卡').disabled).toBe(true)
    fireEvent.click(screen.getByText('重试'))
    expect(refreshGate).toHaveBeenCalledTimes(1)
  })

  it('云端未配置:显示不可用提示,提交禁用', () => {
    setHook({ configured: false, gate: null })
    renderDialog()
    expect(screen.getByText('云端作品尚未连接,恢复后才能分享。')).toBeTruthy()
    expect(screen.getByText('生成分享卡').disabled).toBe(true)
  })

  it('work 缺 id:提交禁用', () => {
    renderDialog({ work: { name: '无云端作品', canvasData: [] } })
    expect(screen.getByText('生成分享卡').disabled).toBe(true)
  })
})

describe('ShareWorkDialog 提交与重试', () => {
  it('打开时重置表单,默认标题取作品名、署名取中性默认', () => {
    renderDialog()
    expect(reset).toHaveBeenCalled()
    // label 内还有字数/提示 span,labelText 匹配不到:按 DOM 顺序取表单控件
    const [titleInput, descInput, authorInput] = screen.getAllByRole('textbox')
    expect(titleInput.value).toBe('小鸭子')
    expect(descInput.value).toBe('')
    expect(authorInput.value).toBe('拼豆创作者')
    expect(screen.getByText('3/80')).toBeTruthy()
  })

  it('可提交时点击:以完整 payload 调 createAndPublish,结果透传 onPublished', async () => {
    const onPublished = vi.fn()
    const result = { id: UUID, url: `https://tangnotes.site/share/${UUID}` }
    createAndPublish.mockResolvedValue(result)
    renderDialog({ onPublished })
    const [titleInput, descInput] = screen.getAllByRole('textbox')
    fireEvent.change(titleInput, { target: { value: '雪景小屋' } })
    fireEvent.change(descInput, { target: { value: '冬日' } })
    fireEvent.click(screen.getByText('生成分享卡'))
    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledWith(result))
    expect(createAndPublish).toHaveBeenCalledWith({
      work: work(),
      title: '雪景小屋',
      description: '冬日',
      authorLabel: '拼豆创作者',
    })
  })

  it('忙碌中:居中加载动画展示当前状态文案,表单被加载视图替代', () => {
    setHook({ state: 'creating', isBusy: true })
    renderDialog()
    expect(screen.getByText('正在创建分享…')).toBeTruthy()
    // 表单/按钮被加载视图替代:任何操作都无法在流程中误触发
    expect(screen.queryByText('生成分享卡')).toBeNull()
    expect(screen.queryByText('取消')).toBeNull()
    expect(screen.getByLabelText('关闭').disabled).toBe(true)
    expect(document.querySelector('.share-progress-beads')).toBeTruthy()
  })

  it('错误状态:显示映射文案与重试按钮,重试透传 onPublished', async () => {
    const onPublished = vi.fn()
    const result = { id: UUID, url: `https://tangnotes.site/share/${UUID}` }
    setHook({ state: 'error', error: 'rateLimited' })
    retry.mockResolvedValue(result)
    renderDialog({ onPublished })
    expect(screen.getByText('创建过于频繁,请稍后再试。')).toBeTruthy()
    fireEvent.click(screen.getByText('重试'))
    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledWith(result))
  })

  it('错误文案未知码回退到通用提示', () => {
    setHook({ state: 'error', error: 'mysteryCode' })
    renderDialog()
    expect(screen.getByText('操作失败,请稍后重试。')).toBeTruthy()
  })

  it('成功:渲染成功面板,不再渲染表单', () => {
    setHook({
      state: 'success',
      share: {
        id: UUID,
        url: `https://tangnotes.site/share/${UUID}`,
        previewPath: `${UUID}/r1.png`,
        snapshot: { title: '雪景小屋' },
      },
    })
    renderDialog()
    expect(screen.getByText('分享已创建')).toBeTruthy()
    expect(screen.queryByLabelText('标题')).toBeNull()
  })
})

describe('ShareWorkDialog 关闭', () => {
  it('open=false 不渲染任何内容', () => {
    const { container } = render(<ShareWorkDialog open={false} work={work()} />)
    expect(container.firstChild).toBeNull()
  })

  it('非忙碌状态可关闭', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    fireEvent.click(screen.getByText('取消'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
