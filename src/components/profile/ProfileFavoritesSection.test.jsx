import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import i18n from '../../i18n'
import ProfileFavoritesSection from './ProfileFavoritesSection'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  // jsdom 无 canvas 实现:ThumbnailCanvas 依赖 getContext + ResizeObserver
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

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** 云端模板库:只有一张,id 为字符串,便于验证收藏 id 的跨类型比较 */
const cloudStore = (overrides = {}) => ({
  enabled: true,
  loading: false,
  error: null,
  templates: [{
    id: 'cloud-duck',
    name: 'Duck',
    nameZh: '小鸭',
    category: 'animal',
    difficulty: 'easy',
    size: 2,
    paletteId: 'perler',
    pattern: [[null, '#FFD700'], ['#FFD700', null]],
  }],
  categories: [],
  refresh: vi.fn(),
  loadAll: vi.fn(),
  ...overrides,
})

const noopFavorite = () => false

describe('ProfileFavoritesSection', () => {
  it('把收藏 id 解析回模板并渲染卡片(含名称/尺寸/难度)', () => {
    const { container } = render(
      <ProfileFavoritesSection
        cloudStore={cloudStore()}
        favorites={['cloud-duck']}
        isFavorite={noopFavorite}
        removeFavorite={vi.fn()}
        onLoadTemplate={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.pf-fav-card').length).toBe(1)
    expect(screen.getByText('小鸭')).toBeTruthy()
    expect(screen.getByText('2 × 2')).toBeTruthy()
    expect(screen.getByText('简单')).toBeTruthy()
    expect(screen.getByText(/共 1 个/)).toBeTruthy()
  })

  it('收藏 id 与模板 id 类型不同也能匹配(数字 vs 字符串)', () => {
    const localStore = cloudStore({
      enabled: false,
      templates: [],
    })
    // 本地模式:内置模板 id 是数字,收藏里存成字符串也要认出来
    const { container } = render(
      <ProfileFavoritesSection
        cloudStore={localStore}
        favorites={['1']}
        isFavorite={noopFavorite}
        removeFavorite={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.pf-fav-card').length).toBe(1)
  })

  it('空收藏显示空态与「去图库看看」入口', () => {
    const onOpenGallery = vi.fn()
    render(
      <ProfileFavoritesSection
        cloudStore={cloudStore()}
        favorites={[]}
        isFavorite={noopFavorite}
        removeFavorite={vi.fn()}
        onOpenGallery={onOpenGallery}
      />,
    )

    expect(screen.getByText('还没有收藏任何模板')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '去图库看看' }))
    expect(onOpenGallery).toHaveBeenCalledTimes(1)
  })

  it('收藏了但已下架的模板:如实提示数量,不静默消失', () => {
    render(
      <ProfileFavoritesSection
        cloudStore={cloudStore()}
        favorites={['cloud-duck', 'gone-1', 'gone-2']}
        isFavorite={noopFavorite}
        removeFavorite={vi.fn()}
      />,
    )

    expect(screen.getByText(/有 2 个收藏的模板已从图库下架/)).toBeTruthy()
    // 计数按仍可显示的模板算,下架数量单独提示
    expect(screen.getByText(/共 1 个/)).toBeTruthy()
  })

  it('取消收藏就地移除,不需要回图库', () => {
    const removeFavorite = vi.fn()
    render(
      <ProfileFavoritesSection
        cloudStore={cloudStore()}
        favorites={['cloud-duck']}
        isFavorite={() => true}
        removeFavorite={removeFavorite}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '取消收藏' }))
    expect(removeFavorite).toHaveBeenCalledWith('cloud-duck')
  })

  it('载入到画布时带上模板品牌;方形模板不传 gridWidth/gridHeight', () => {
    const onLoadTemplate = vi.fn()
    render(
      <ProfileFavoritesSection
        cloudStore={cloudStore()}
        favorites={['cloud-duck']}
        isFavorite={noopFavorite}
        removeFavorite={vi.fn()}
        onLoadTemplate={onLoadTemplate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '载入到画布' }))
    expect(onLoadTemplate).toHaveBeenCalledTimes(1)
    const [pattern, size, opts] = onLoadTemplate.mock.calls[0]
    expect(pattern).toHaveLength(2)
    expect(size).toBe(2)
    expect(opts).toEqual({ palette: 'perler' })
  })

  it('矩形模板载入时附带真实宽高', () => {
    const onLoadTemplate = vi.fn()
    const rectStore = cloudStore({
      templates: [{
        id: 'cloud-rect', name: 'Wide', nameZh: '宽图',
        category: 'animal', difficulty: 'easy', size: 4,
        pattern: [
          ['#FFD700', '#FFD700', '#FFD700', '#FFD700'],
          [null, '#FFD700', '#FFD700', null],
        ],
      }],
    })
    render(
      <ProfileFavoritesSection
        cloudStore={rectStore}
        favorites={['cloud-rect']}
        isFavorite={noopFavorite}
        removeFavorite={vi.fn()}
        onLoadTemplate={onLoadTemplate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '载入到画布' }))
    const [, size, opts] = onLoadTemplate.mock.calls[0]
    expect(size).toBe(4)
    expect(opts.gridWidth).toBe(4)
    expect(opts.gridHeight).toBe(2)
  })

  it('云端加载中显示骨架,而不是「还没有收藏」', () => {
    const { container } = render(
      <ProfileFavoritesSection
        cloudStore={cloudStore({ loading: true, templates: [] })}
        favorites={['cloud-duck']}
        isFavorite={noopFavorite}
        removeFavorite={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.pf-works-skeleton-card').length).toBeGreaterThan(0)
    expect(screen.queryByText('还没有收藏任何模板')).toBeNull()
  })
})
