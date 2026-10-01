import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GalleryPage from './GalleryPage'
import i18n from '../../i18n'
import { TEMPLATES } from '../../data/templates'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  // jsdom 无 canvas 实现:复用 App.test 的 2D 上下文 mock(缩略图直绘不崩即可)
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
  localStorage.clear()
})

const setup = (props = {}) => render(
  <MemoryRouter initialEntries={['/gallery']}>
    <GalleryPage
      onLoadTemplate={vi.fn()}
      onDeleteWork={vi.fn()}
      onLoadWork={vi.fn()}
      {...props}
    />
  </MemoryRouter>
)

describe('GalleryPage V2 — 本地模式', () => {
  it('渲染全部内置模板卡片', () => {
    const { container } = setup({ savedWorks: [] })
    expect(container.querySelectorAll('.template-card').length).toBe(TEMPLATES.length)
  })

  it('搜索过滤生效(无匹配时显示空状态)', () => {
    const { container } = setup({ savedWorks: [] })
    fireEvent.change(screen.getByPlaceholderText(/搜索|模板|Search/i), { target: { value: 'zzz-不存在的模板' } })
    expect(container.querySelectorAll('.template-card').length).toBe(0)
    expect(screen.getByText('没有找到匹配的模板')).toBeTruthy()
  })

  it('点击收藏后写入 localStorage 并更新收藏页签计数', () => {
    const { container } = setup({ savedWorks: [] })
    const firstCard = container.querySelector('.template-card')
    fireEvent.click(firstCard.querySelector('.favorite-btn'))
    // 与 V1 一致:内置模板 id 原样存储(数字),跨类型收藏靠 String() 协同比较
    expect(JSON.parse(localStorage.getItem('gallery-favorites'))).toContain(TEMPLATES[0].id)
    expect(screen.getByText(/我的收藏 \(1\)/)).toBeTruthy()
  })

  it('我的作品视图:空态与作品卡片渲染', () => {
    const first = setup({ savedWorks: [] })
    fireEvent.click(screen.getByText(/我的作品 \(0\)/))
    expect(screen.getByText('还没有保存的作品')).toBeTruthy()
    first.unmount()

    const { container: c2 } = setup({
      savedWorks: [{ id: 'w1', name: '我的小鸭', canvasData: [[null, '#FFD700']], gridSize: 2, gridWidth: 2, gridHeight: 1, savedAt: '2026-10-01T00:00:00Z' }],
    })
    fireEvent.click(screen.getByText(/我的作品 \(1\)/))
    expect(c2.querySelectorAll('.work-card').length).toBe(1)
    expect(screen.getByText('我的小鸭')).toBeTruthy()
  })

  it('点击卡片弹出填充确认弹窗,确认后回调携带模板 pattern', () => {
    const onLoadTemplate = vi.fn()
    const { container } = setup({ savedWorks: [], onLoadTemplate })
    fireEvent.click(container.querySelector('.template-card'))
    expect(screen.getByText('填充模板到画布')).toBeTruthy()
    fireEvent.click(screen.getByText('填充到画布'))
    expect(onLoadTemplate).toHaveBeenCalledTimes(1)
    const [pattern, size, opts] = onLoadTemplate.mock.calls[0]
    expect(Array.isArray(pattern)).toBe(true)
    expect(size).toBe(TEMPLATES[0].size)
    expect(opts).toBeUndefined() // 内置模板无 paletteId → 不打扰用户当前色卡
  })
})

describe('GalleryPage V2 — 云端模式', () => {
  const cloudStore = (overrides = {}) => ({
    enabled: true, loading: false, error: null,
    templates: [{ id: 'cloud-1', name: 'Cloud Duck', nameZh: '云端小鸭', category: 'animal', difficulty: 'easy', size: 9, pattern: [[null, '#FFD700'], ['#FFD700', null]] }],
    categories: [], refresh: vi.fn(), loadAll: vi.fn(),
    ...overrides,
  })

  it('云端开启时只显示云端模板(与内置模板隔离)', () => {
    const { container } = setup({ savedWorks: [], cloudStore: cloudStore() })
    expect(container.querySelectorAll('.template-card').length).toBe(1)
    expect(screen.getByText('云端小鸭')).toBeTruthy()
  })

  it('云端拉取失败且无缓存模板 → 显示降级横幅与重试入口', () => {
    const loadAll = vi.fn()
    const { container } = setup({
      savedWorks: [],
      cloudStore: cloudStore({ templates: [], error: 'network down', loadAll }),
    })
    expect(screen.getByText('云端模板加载失败')).toBeTruthy()
    const retry = screen.getByText('重新加载')
    fireEvent.click(retry)
    expect(loadAll).toHaveBeenCalledTimes(1)
    // 降级:仍可浏览内置模板
    expect(container.querySelectorAll('.template-card').length).toBe(TEMPLATES.length)
  })
})
