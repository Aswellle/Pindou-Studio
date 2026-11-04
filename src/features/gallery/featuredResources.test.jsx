import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GalleryPage from './GalleryPage'
import i18n from '../../i18n'

/**
 * 精选资源区块(0032):人工策展关系按 sort_order 解析到前台。
 *
 * useGalleryContent 整体 mock:关系表由后台管理,这里只验证公开侧的
 * 解析与展示契约 —— 保序、跳过不可读 id、无关系时整段隐藏。
 */

const galleryContentState = {
  enabled: true,
  loading: false,
  error: '',
  themes: [],
  collections: [],
  homeSections: [],
  themeTemplateIds: new Map(),
  collectionTemplateIds: new Map(),
  featuredTemplateIds: [],
}

vi.mock('../../hooks/useGalleryContent', () => ({
  useGalleryContent: () => galleryContentState,
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    save: () => {},
    restore: () => {},
    clip: () => {},
    translate: () => {},
    scale: () => {},
    drawImage: () => {},
    setTransform: () => {},
    fillText: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
  }
  HTMLCanvasElement.prototype.getContext = () => ctx
})

afterEach(() => {
  cleanup()
  galleryContentState.featuredTemplateIds = []
  localStorage.clear()
})

const templates = [
  {
    id: 'tpl-1',
    name: '鸭子',
    nameZh: '鸭子',
    category: 'animal',
    difficulty: 'easy',
    size: 2,
    pattern: [[null]],
  },
  {
    id: 'tpl-2',
    name: '猫',
    nameZh: '猫',
    category: 'animal',
    difficulty: 'easy',
    size: 2,
    pattern: [[null]],
  },
  {
    id: 'tpl-3',
    name: '房子',
    nameZh: '房子',
    category: 'icon',
    difficulty: 'easy',
    size: 2,
    pattern: [[null]],
  },
]

const cloudStore = {
  enabled: true,
  loading: false,
  error: null,
  templates,
  categories: [],
  refresh: vi.fn(),
  loadAll: vi.fn(),
}

const setup = (initialEntries = ['/gallery']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <GalleryPage onLoadTemplate={vi.fn()} cloudStore={cloudStore} />
    </MemoryRouter>
  )

describe('GalleryPage · 精选资源区块', () => {
  it('按后台顺序展示精选资源,关系外的模板不出现', () => {
    galleryContentState.featuredTemplateIds = ['tpl-2', 'tpl-1']
    const { container } = setup()
    const section = container.querySelector('.gallery-section')
    expect(section).toBeTruthy()
    expect(screen.getByText('精选资源')).toBeTruthy()
    const names = [...section.querySelectorAll('.template-name')].map(el => el.textContent)
    // featuredTemplateIds 顺序即展示顺序;tpl-3 未被精选,不在区块里
    expect(names).toEqual(['猫', '鸭子'])
  })

  it('关系中引用了不存在/已删除的模板时跳过,不渲染断链卡片', () => {
    galleryContentState.featuredTemplateIds = ['tpl-gone', 'tpl-1', 'tpl-3']
    const { container } = setup()
    const names = [...container.querySelectorAll('.gallery-section .template-name')].map(el => el.textContent)
    expect(names).toEqual(['鸭子', '房子'])
  })

  it('没有精选关系时整段隐藏,不渲染空标题', () => {
    const { container } = setup()
    expect(screen.queryByText('精选资源')).toBeNull()
    expect(container.querySelector('.gallery-section')).toBeNull()
    // 精选视图无策展资源(主题/合集也为空)→ 回退完整模板网格
    expect(container.querySelectorAll('.template-card').length).toBe(3)
  })
})
