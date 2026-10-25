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
  HTMLCanvasElement.prototype.getContext = () => ctx
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const setup = (props = {}, initialEntries = ['/gallery']) => render(
  <MemoryRouter initialEntries={initialEntries}>
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

  it('点击收藏后写入 localStorage(收藏列表本身在个人中心展示)', () => {
    const { container } = setup({ savedWorks: [] })
    const firstCard = container.querySelector('.template-card')
    fireEvent.click(firstCard.querySelector('.favorite-btn'))
    // 与 V1 一致:内置模板 id 原样存储(数字),跨类型收藏靠 String() 协同比较
    expect(JSON.parse(localStorage.getItem('gallery-favorites'))).toContain(TEMPLATES[0].id)
    // 图库不再有收藏页签:收藏后本页不出现任何计数/页签变化
    expect(screen.queryByText(/我的收藏 \(\d+\)/)).toBeNull()
    expect(container.querySelector('.filter-tabs')).toBeNull()
  })

  it('图库只有模板库:不渲染收藏/作品页签,也不渲染作品卡片', () => {
    const { container } = setup({
      savedWorks: [{ id: 'w1', name: '我的小鸭', canvasData: [[null, '#FFD700']], gridSize: 2 }],
    })
    // 视图页签整体消失
    expect(container.querySelector('.filter-tabs')).toBeNull()
    expect(screen.queryByText(/我的作品/)).toBeNull()
    expect(screen.queryByText(/我的收藏/)).toBeNull()
    // 作品卡片不再出现在图库(已移到个人中心)
    expect(container.querySelectorAll('.work-card').length).toBe(0)
    expect(screen.queryByText('我的小鸭')).toBeNull()
    // 模板仍然正常渲染
    expect(container.querySelectorAll('.template-card').length).toBe(TEMPLATES.length)
  })

  it('老链接 ?view=works 不再切换到作品视图,而是被静默清掉', () => {
    const { container } = setup({
      savedWorks: [{ id: 'w1', name: '深链接作品', canvasData: [[null, '#FFD700']], gridSize: 2 }],
    }, ['/gallery?view=works'])

    // 仍显示模板库,作品不出现
    expect(container.querySelectorAll('.template-card').length).toBe(TEMPLATES.length)
    expect(screen.queryByText('深链接作品')).toBeNull()
  })

  it('?view= 任意值都不影响模板渲染(参数已废弃)', () => {
    const { container } = setup({ savedWorks: [] }, ['/gallery?view=不存在的页签'])

    expect(container.querySelectorAll('.template-card').length).toBe(TEMPLATES.length)
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

describe('GalleryPage V2 — 矩形模板(M2 / R3)', () => {
  const rectTemplate = {
    id: 'cloud-rect',
    name: 'Wide',
    nameZh: '宽图',
    category: 'animal',
    difficulty: 'easy',
    size: 4,                    // 旧协议只有单值 max
    pattern: [
      ['#FFD700', '#FFD700', '#FFD700', '#FFD700'],
      [null, '#FFD700', '#FFD700', null],
    ],
  }
  const rectStore = {
    enabled: true, loading: false, error: null,
    templates: [rectTemplate],
    categories: [], refresh: vi.fn(), loadAll: vi.fn(),
  }

  it('卡片显示真实 W × H,而不是 size × size', () => {
    const { container } = setup({ savedWorks: [], cloudStore: rectStore })
    expect(container.querySelector('.template-size').textContent).toBe('4 x 2')
  })

  it('载入矩形模板时回调携带真实 gridWidth/gridHeight', () => {
    const onLoadTemplate = vi.fn()
    const { container } = setup({ savedWorks: [], cloudStore: rectStore, onLoadTemplate })
    fireEvent.click(container.querySelector('.template-card'))
    fireEvent.click(screen.getByText('填充到画布'))

    const [pattern, size, opts] = onLoadTemplate.mock.calls[0]
    expect(pattern).toHaveLength(2)
    expect(size).toBe(4)                 // 兼容参数仍是 max
    expect(opts.gridWidth).toBe(4)
    expect(opts.gridHeight).toBe(2)
  })

  it('方形模板不传 gridWidth/gridHeight(保持旧调用形态)', () => {
    const onLoadTemplate = vi.fn()
    const { container } = setup({ savedWorks: [], onLoadTemplate })
    fireEvent.click(container.querySelector('.template-card'))
    fireEvent.click(screen.getByText('填充到画布'))

    const [, , opts] = onLoadTemplate.mock.calls[0]
    expect(opts).toBeUndefined()
  })

  it('填充确认弹窗尺寸文案使用真实宽高', () => {
    const { container } = setup({ savedWorks: [], cloudStore: rectStore })
    fireEvent.click(container.querySelector('.template-card'))
    expect(screen.getByText(/\(4×2\)/)).toBeTruthy()
  })
})

describe('GalleryPage V2 — 用色数筛选', () => {
  // 3 色模板:超过「≤ 2 色」档位应被筛掉
  const threeColorStore = (overrides = {}) => ({
    enabled: true, loading: false, error: null,
    templates: [
      { id: 'c-1', name: 'Two', nameZh: '两色', category: 'animal', difficulty: 'easy', size: 2,
        pattern: [['#FF0000', '#00FF00'], [null, null]] },
      { id: 'c-2', name: 'Five', nameZh: '五色', category: 'animal', difficulty: 'easy', size: 3,
        pattern: [['#FF0000', '#00FF00', '#0000FF'], ['#FFFF00', '#FF00FF', null]] },
    ],
    categories: [], refresh: vi.fn(), loadAll: vi.fn(),
    ...overrides,
  })

  it('筛选栏渲染档位按钮,默认「不限」为激活态', () => {
    const { container } = setup({ savedWorks: [], cloudStore: threeColorStore() })
    const buttons = [...container.querySelectorAll('.colors-btn')]
    // 1 个「不限」+ COLOR_COUNT_TIERS.length 个上限档
    expect(buttons.length).toBe(1 + 6)
    expect(buttons[0].className).toContain('active')
    expect(buttons[0].textContent).toBe('不限')
  })

  it('选择上限后按 pattern 唯一颜色数过滤', () => {
    const { container } = setup({ savedWorks: [], cloudStore: threeColorStore() })
    fireEvent.click(screen.getByText('≤ 4 色'))
    expect(container.querySelectorAll('.template-card').length).toBe(1)
    expect(screen.getByText('两色')).toBeTruthy()
    expect(screen.queryByText('五色')).toBe(null)
  })

  it('筛选状态写进 URL(可分享/刷新恢复)', () => {
    // setup 的 MemoryRouter 不暴露 location;改用带 initialEntries 的独立渲染
    const { container } = render(
      <MemoryRouter initialEntries={['/gallery?colors=4']}>
        <GalleryPage onLoadTemplate={vi.fn()} savedWorks={[]} cloudStore={threeColorStore()} />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('.template-card').length).toBe(1)
    expect(screen.getByText('≤ 4 色').className).toContain('active')
  })

  it('筛选无结果时提供一键清除,点击后恢复全部模板', () => {
    // 搜索词与用色数叠加制造空结果
    const { container } = render(
      <MemoryRouter initialEntries={['/gallery?q=zzz&colors=4']}>
        <GalleryPage onLoadTemplate={vi.fn()} savedWorks={[]} cloudStore={threeColorStore()} />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('.template-card').length).toBe(0)

    fireEvent.click(screen.getByText('清除筛选'))
    // 清除后 URL 参数一并清空 → 两个模板都回来
    expect(container.querySelectorAll('.template-card').length).toBe(2)
  })
})
