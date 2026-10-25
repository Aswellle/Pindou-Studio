import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from '../../i18n'
import ProfileWorksSection from './ProfileWorksSection'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  // jsdom 无 canvas 实现:WorkThumbnail 直接 getContext 绘制,给个空上下文即可
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, clearRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fill: () => {}, arc: () => {}, save: () => {}, restore: () => {},
    clip: () => {}, translate: () => {}, scale: () => {}, drawImage: () => {},
    setTransform: () => {}, fillText: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
  }
  HTMLCanvasElement.prototype.getContext = () => ctx
})

afterEach(cleanup)

const work = (overrides = {}) => ({
  id: 'w1',
  name: '小鸭',
  canvasData: [[null, '#FFD700'], ['#FFD700', null]],
  gridSize: 2,
  gridWidth: 2,
  gridHeight: 2,
  savedAt: '2026-10-01T00:00:00Z',
  ...overrides,
})

describe('ProfileWorksSection', () => {
  it('渲染作品网格,卡片带名称、尺寸与打开/删除入口', () => {
    const { container } = render(<ProfileWorksSection works={[work()]} />)

    expect(container.querySelectorAll('.pf-work-card').length).toBe(1)
    expect(screen.getByText('小鸭')).toBeTruthy()
    expect(screen.getByText('2 × 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: '打开' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy()
  })

  it('空列表显示空态,并给出「去图库看看」入口', () => {
    const onOpenGallery = vi.fn()
    render(<ProfileWorksSection works={[]} onOpenGallery={onOpenGallery} />)

    expect(screen.getByText(/还没有保存过图纸/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '去图库看看' }))
    expect(onOpenGallery).toHaveBeenCalledTimes(1)
  })

  it('加载中显示骨架,不把「还没读到」画成空态', () => {
    const { container } = render(<ProfileWorksSection works={[]} worksLoading />)

    expect(container.querySelectorAll('.pf-works-skeleton-card').length).toBeGreaterThan(0)
    expect(screen.queryByText(/还没有保存过图纸/)).toBeNull()
  })

  it('读取失败显示降级提示与重试,不显示空态', () => {
    const onRetry = vi.fn()
    render(<ProfileWorksSection works={[]} worksError={{ code: 'loadFailed' }} onRetry={onRetry} />)

    expect(screen.getByText(/云端作品暂时没读到/)).toBeTruthy()
    expect(screen.queryByText(/还没有保存过图纸/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /重试/ }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('搜索按名称过滤,无匹配时提供清除搜索', () => {
    const { container } = render(
      <ProfileWorksSection works={[work(), work({ id: 'w2', name: '小熊' })]} />,
    )
    const input = screen.getByRole('searchbox', { name: '搜索作品名称' })

    fireEvent.change(input, { target: { value: '熊' } })
    expect(container.querySelectorAll('.pf-work-card').length).toBe(1)
    expect(screen.getByText('小熊')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(container.querySelectorAll('.pf-work-card').length).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(container.querySelectorAll('.pf-work-card').length).toBe(2)
  })

  it('删除走二次确认:确认前不回调,确认后才删', () => {
    const onDeleteWork = vi.fn()
    render(<ProfileWorksSection works={[work()]} onDeleteWork={onDeleteWork} />)

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDeleteWork).not.toHaveBeenCalled()
    expect(screen.getByText('删除这个作品?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onDeleteWork).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(onDeleteWork).toHaveBeenCalledTimes(1)
    expect(onDeleteWork.mock.calls[0][0].id).toBe('w1')
  })

  it('来源徽标只对已知 sourceKind 显示,旧作品不凭空补一个', () => {
    const { container } = render(
      <ProfileWorksSection
        works={[work({ id: 'w1', sourceKind: 'chart-import' }), work({ id: 'w2', name: '旧作品' })]}
      />,
    )

    const badges = [...container.querySelectorAll('.pf-work-source')]
    expect(badges).toHaveLength(1)
    expect(badges[0].textContent).toBe('图纸导入')
    expect(badges[0].className).toContain('source-chart-import')
  })

  it('本机作品多于云端镜像时提示尚未同步', () => {
    render(
      <ProfileWorksSection
        works={[work(), work({ id: 'w2', name: '小熊' })]}
        cloudMirrorCount={1}
      />,
    )

    expect(screen.getByText(/还有 1 个作品尚未同步/)).toBeTruthy()
  })

  it('传入 onShowVersions 才出现版本历史入口', () => {
    const onShowVersions = vi.fn()
    const { rerender } = render(<ProfileWorksSection works={[work()]} />)
    expect(screen.queryByRole('button', { name: '历史' })).toBeNull()

    rerender(<ProfileWorksSection works={[work()]} onShowVersions={onShowVersions} />)
    fireEvent.click(screen.getByRole('button', { name: '历史' }))
    expect(onShowVersions).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }))
  })
})
