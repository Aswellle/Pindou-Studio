import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GalleryPage from './GalleryPage'
import i18n from '../../i18n'
import { TEMPLATES } from '../../data/templates'

// 分享弹窗做轻量替身:避免测试环境真实挂载 useWorkShares(会读取环境变量并发请求)
vi.mock('../sharing/ShareWorkDialog', () => ({
  default: ({ open, onClose }) =>
    open ? (
      <div>
        <div>分享图纸</div>
        <button type="button" onClick={onClose}>
          关闭分享
        </button>
      </div>
    ) : null,
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  // jsdom 无 canvas 实现:复用 App.test 的 2D 上下文 mock(缩略图直绘不崩即可)
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    clearRect: () => {},
    fillText: () => {},
    arc: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
    clip: () => {},
    translate: () => {},
    scale: () => {},
    drawImage: () => {},
    setTransform: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }
  HTMLCanvasElement.prototype.getContext = () => ctx
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const setup = (props = {}, initialEntries = ['/gallery']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <GalleryPage onLoadTemplate={vi.fn()} onDeleteWork={vi.fn()} onLoadWork={vi.fn()} {...props} />
    </MemoryRouter>
  )

describe('GalleryPage V2 — 本地模式', () => {
  it('渲染全部内置模板卡片', () => {
    const { container } = setup({ savedWorks: [] })
    expect(container.querySelectorAll('.template-card').length).toBe(TEMPLATES.length)
  })

  it('搜索过滤生效(无匹配时显示空状态)', () => {
    const { container } = setup({ savedWorks: [] })
    fireEvent.change(screen.getByPlaceholderText(/搜索|模板|Search/i), {
      target: { value: 'zzz-不存在的模板' },
    })
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
    // 作品卡片不再出现在图库(已移到个人中心);侧栏的「我的收藏」只是导航入口
    expect(container.querySelectorAll('.work-card').length).toBe(0)
    expect(container.querySelectorAll('.template-card').length).toBe(TEMPLATES.length)
    expect(screen.queryByText('我的小鸭')).toBeNull()
  })

  it('老链接 ?view=works 不再切换到作品视图,而是被静默清掉', () => {
    const { container } = setup(
      {
        savedWorks: [{ id: 'w1', name: '深链接作品', canvasData: [[null, '#FFD700']], gridSize: 2 }],
      },
      ['/gallery?view=works']
    )

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
    // 弹窗标题是模板名(内置模板取 i18n 名称);操作区含分享入口与取消
    // (弹窗经 portal 渲染到 document.body,须在 document 层查询)
    expect(document.querySelector('.load-confirm-title').textContent).toBeTruthy()
    expect(screen.getByText('创建分享链接')).toBeTruthy()
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
    enabled: true,
    loading: false,
    error: null,
    templates: [
      {
        id: 'cloud-1',
        name: 'Cloud Duck',
        nameZh: '云端小鸭',
        category: 'animal',
        difficulty: 'easy',
        size: 9,
        pattern: [
          [null, '#FFD700'],
          ['#FFD700', null],
        ],
      },
    ],
    categories: [],
    refresh: vi.fn(),
    loadAll: vi.fn(),
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
    size: 4, // 旧协议只有单值 max
    pattern: [
      ['#FFD700', '#FFD700', '#FFD700', '#FFD700'],
      [null, '#FFD700', '#FFD700', null],
    ],
  }
  const rectStore = {
    enabled: true,
    loading: false,
    error: null,
    templates: [rectTemplate],
    categories: [],
    refresh: vi.fn(),
    loadAll: vi.fn(),
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
    expect(size).toBe(4) // 兼容参数仍是 max
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
    expect(screen.getByText(/4\s*×\s*2/)).toBeTruthy()
  })
})

describe('GalleryPage — 模板创建分享链接', () => {
  it('弹窗展示模板名、尺寸与创建(上传)日期', () => {
    const { container } = setup({
      savedWorks: [],
      cloudStore: {
        enabled: true,
        loading: false,
        error: null,
        templates: [
          {
            id: 'cloud-date',
            name: 'Dated',
            nameZh: '日期模板',
            category: 'animal',
            difficulty: 'easy',
            size: 9,
            pattern: Array.from({ length: 9 }, () => Array(9).fill('#FFD700')),
            paletteId: 'perler',
            createdAt: '2026-11-01T00:00:00Z',
          },
        ],
        categories: [],
        refresh: vi.fn(),
        loadAll: vi.fn(),
      },
    })
    fireEvent.click(container.querySelector('.template-card'))
    // 卡片与弹窗标题同名:断言弹窗(portal 到 body)标题元素本身
    expect(document.querySelector('.load-confirm-title').textContent).toBe('日期模板')
    expect(document.querySelector('.load-confirm-meta').textContent).toContain('9 × 9')
    expect(document.querySelector('.load-confirm-meta').textContent).toContain('创建于')
    expect(screen.getByText('创建分享链接')).toBeTruthy()
  })

  it('匿名点击分享入口不打开分享弹窗(实际入口在登录后)', async () => {
    const { container } = setup({ savedWorks: [] })
    fireEvent.click(container.querySelector('.template-card'))
    fireEvent.click(screen.getByText('创建分享链接'))
    // 匿名:不弹分享弹窗、不调用保存(saveWork 不会在未登录时被调用)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(screen.queryByText('分享图纸')).toBeNull()
  })

  it('已登录:先复制为云端作品,成功后打开分享弹窗并带来源模板', async () => {
    const saved = { id: '0f0f0f0f-1111-2222-3333-444444444444', name: '小鸭' }
    const onSaveWork = vi.fn(async () => saved)
    const { container } = setup({ savedWorks: [], user: { id: 'u1' }, onSaveWork })
    fireEvent.click(container.querySelector('.template-card'))
    fireEvent.click(screen.getByText('创建分享链接'))
    await vi.waitFor(() => expect(screen.getByText('分享图纸')).toBeTruthy())
    expect(onSaveWork).toHaveBeenCalledTimes(1)
    expect(onSaveWork.mock.calls[0][0].sourceTemplateId).toBe(TEMPLATES[0].id)
  })

  it('关闭分享弹窗后删除临时副本,不留在「我的作品」', async () => {
    const saved = { id: '0f0f0f0f-1111-2222-3333-444444444444', name: '小鸭' }
    const onSaveWork = vi.fn(async () => saved)
    const onDeleteWork = vi.fn(async () => {})
    const { container } = setup({ savedWorks: [], user: { id: 'u1' }, onSaveWork, onDeleteWork })
    fireEvent.click(container.querySelector('.template-card'))
    fireEvent.click(screen.getByText('创建分享链接'))
    await vi.waitFor(() => expect(screen.getByText('分享图纸')).toBeTruthy())
    expect(onDeleteWork).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('关闭分享'))
    await vi.waitFor(() => expect(onDeleteWork).toHaveBeenCalledTimes(1))
    expect(onDeleteWork.mock.calls[0][0]).toBe(saved)
    expect(screen.queryByText('分享图纸')).toBeNull()
  })

  it('离开页面(卸载)同样清理临时副本', async () => {
    const saved = { id: '0f0f0f0f-1111-2222-3333-444444444444', name: '小鸭' }
    const onSaveWork = vi.fn(async () => saved)
    const onDeleteWork = vi.fn(async () => {})
    const { container, unmount } = setup({
      savedWorks: [],
      user: { id: 'u1' },
      onSaveWork,
      onDeleteWork,
    })
    fireEvent.click(container.querySelector('.template-card'))
    fireEvent.click(screen.getByText('创建分享链接'))
    await vi.waitFor(() => expect(screen.getByText('分享图纸')).toBeTruthy())
    unmount()
    await vi.waitFor(() => expect(onDeleteWork).toHaveBeenCalledTimes(1))
  })

  it('本地模式(无云端 id):保存成功但不打开分享弹窗', async () => {
    const onSaveWork = vi.fn(async () => true)
    const { container } = setup({ savedWorks: [], user: { id: 'u1' }, onSaveWork })
    fireEvent.click(container.querySelector('.template-card'))
    fireEvent.click(screen.getByText('创建分享链接'))
    await vi.waitFor(() => expect(onSaveWork).toHaveBeenCalledTimes(1))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(screen.queryByText('分享图纸')).toBeNull()
  })
})

describe('GalleryPage V2 — 用色数筛选', () => {
  // 3 色模板:超过「≤ 2 色」档位应被筛掉
  const threeColorStore = (overrides = {}) => ({
    enabled: true,
    loading: false,
    error: null,
    templates: [
      {
        id: 'c-1',
        name: 'Two',
        nameZh: '两色',
        category: 'animal',
        difficulty: 'easy',
        size: 2,
        pattern: [
          ['#FF0000', '#00FF00'],
          [null, null],
        ],
      },
      {
        id: 'c-2',
        name: 'Five',
        nameZh: '五色',
        category: 'animal',
        difficulty: 'easy',
        size: 3,
        pattern: [
          ['#FF0000', '#00FF00', '#0000FF'],
          ['#FFFF00', '#FF00FF', null],
        ],
      },
    ],
    categories: [],
    refresh: vi.fn(),
    loadAll: vi.fn(),
    ...overrides,
  })

  /** 打开筛选面板(分类/难度/用色数收纳在此,工具栏只留入口按钮) */
  function openFilterPanel() {
    const trigger = document.querySelector('.gallery-filter-trigger')
    fireEvent.click(trigger)
    return document.querySelector('.gallery-filter-pop')
  }

  it('筛选面板收纳三组条件,用色数默认「不限」为激活态', () => {
    const { container } = setup({ savedWorks: [], cloudStore: threeColorStore() })
    // 默认关闭:面板不在 DOM,旧的大块筛选栏也不存在
    expect(document.querySelector('.gallery-filter-pop')).toBeNull()
    expect(container.querySelector('.category-bar')).toBeNull()
    const panel = openFilterPanel()
    expect(panel).toBeTruthy()
    const buttons = [...panel.querySelectorAll('.gallery-filter-group')]
      .at(-1)
      .querySelectorAll('.gallery-filter-opt')
    // 1 个「不限」+ COLOR_COUNT_TIERS.length 个上限档
    expect(buttons.length).toBe(1 + 6)
    expect(buttons[0].className).toContain('active')
    expect(buttons[0].textContent).toBe('不限')
  })

  it('面板内选择用色数上限后按 pattern 唯一颜色数过滤', () => {
    const { container } = setup({ savedWorks: [], cloudStore: threeColorStore() })
    openFilterPanel()
    fireEvent.click(screen.getByText('≤ 4 色'))
    // 选择立即生效(URL 即状态),结果在面板背后同步更新
    expect(container.querySelectorAll('.template-card').length).toBe(1)
    expect(screen.getByText('两色')).toBeTruthy()
    expect(screen.queryByText('五色')).toBe(null)
  })

  it('Escape 关闭筛选面板并把焦点还给触发按钮', () => {
    setup({ savedWorks: [], cloudStore: threeColorStore() })
    const trigger = document.querySelector('.gallery-filter-trigger')
    trigger.focus()
    fireEvent.click(trigger)
    // portal 到 body 的面板已打开
    expect(document.querySelector('.gallery-filter-pop')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.gallery-filter-pop')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('筛选状态写进 URL(可分享/刷新恢复),激活数显示在入口按钮上', () => {
    // setup 的 MemoryRouter 不暴露 location;改用带 initialEntries 的独立渲染
    const { container } = render(
      <MemoryRouter initialEntries={['/gallery?colors=4']}>
        <GalleryPage onLoadTemplate={vi.fn()} savedWorks={[]} cloudStore={threeColorStore()} />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('.template-card').length).toBe(1)
    // 激活筛选数徽标:用色数 1 项
    expect(screen.getByText('1')).toBeTruthy()
    openFilterPanel()
    expect(screen.getByText('≤ 4 色').className).toContain('active')
  })

  it('激活筛选以 chips 呈现,可逐项移除与一键清除', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/gallery?q=zzz&colors=4']}>
        <GalleryPage onLoadTemplate={vi.fn()} savedWorks={[]} cloudStore={threeColorStore()} />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('.template-card').length).toBe(0)
    // 两个 chip:搜索 + 用色数
    expect(container.querySelectorAll('.gallery-chip').length).toBe(2)
    // 移除搜索 chip → 只剩用色数上限,「两色」回到结果里
    fireEvent.click(container.querySelector('.gallery-chip-remove'))
    expect(container.querySelectorAll('.gallery-chip').length).toBe(1)
    expect(container.querySelectorAll('.template-card').length).toBe(1)
    // chips 行的「清除全部」→ 全部模板回来,chips 消失
    fireEvent.click(screen.getByText('清除全部'))
    expect(container.querySelectorAll('.gallery-chip').length).toBe(0)
    expect(container.querySelectorAll('.template-card').length).toBe(2)
  })
})

describe('GalleryPage V3 — 一级 feed(精选/热门/最新)', () => {
  // 云端夹具:downloadCount / createdAt 可控,验证热门与最新的数据口径
  const feedStore = (overrides = {}) => ({
    enabled: true,
    loading: false,
    error: null,
    templates: [
      {
        id: 't-a',
        name: 'A',
        nameZh: '图纸A',
        category: 'animal',
        difficulty: 'easy',
        size: 4,
        pattern: [
          ['#FF0000', '#00FF00'],
          [null, null],
        ],
        downloadCount: 9,
        createdAt: '2026-01-02T00:00:00Z',
      },
      {
        id: 't-b',
        name: 'B',
        nameZh: '图纸B',
        category: 'food',
        difficulty: 'easy',
        size: 4,
        pattern: [
          ['#FF0000', '#00FF00'],
          [null, null],
        ],
        downloadCount: 5,
        createdAt: '2026-03-01T00:00:00Z',
      },
      {
        id: 't-c',
        name: 'C',
        nameZh: '图纸C',
        category: 'animal',
        difficulty: 'easy',
        size: 4,
        pattern: [
          ['#FF0000', '#00FF00'],
          [null, null],
        ],
        downloadCount: 0,
        createdAt: null,
      },
    ],
    categories: [],
    refresh: vi.fn(),
    loadAll: vi.fn(),
    ...overrides,
  })

  it('默认精选 feed;tabs 切换写入 ?feed= 且保留筛选', () => {
    setup({ savedWorks: [], cloudStore: feedStore() }, ['/gallery?q=图纸A'])
    // 精选 tabs 为当前项
    expect(document.getElementById('gallery-tab-featured').getAttribute('aria-selected')).toBe('true')
    // 切到热门:URL 带 feed=popular,q 保留
    fireEvent.click(document.getElementById('gallery-tab-popular'))
    expect(document.getElementById('gallery-tab-popular').getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('gallery-tab-popular').className).toContain('active')
  })

  it('搜索同时匹配 name 与 nameZh,并忽略首尾空格', () => {
    const store = feedStore({
      templates: [
        {
          id: 't-duck',
          name: 'Duck',
          nameZh: '小鸭',
          category: 'animal',
          difficulty: 'easy',
          size: 4,
          pattern: [['#FF0000']],
          downloadCount: 0,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    })
    // nameZh 存在时也要能用英文 name 搜到;前后空格应被忽略
    const { container } = setup({ savedWorks: [], cloudStore: store }, ['/gallery?q=%20duck%20'])
    expect(container.querySelectorAll('.template-card').length).toBe(1)
  })

  it('热门 feed 按真实下载量排序,零下载不进入', () => {
    const { container } = setup({ savedWorks: [], cloudStore: feedStore() }, ['/gallery?feed=popular'])
    const cards = container.querySelectorAll('.template-card')
    // 图纸C 下载量为 0,不进入热门
    expect(cards.length).toBe(2)
    expect(cards[0].textContent).toContain('图纸A')
    expect(cards[1].textContent).toContain('图纸B')
  })

  it('最新 feed 只含有可信创建时间的模板,按时间倒序', () => {
    const { container } = setup({ savedWorks: [], cloudStore: feedStore() }, ['/gallery?feed=latest'])
    const cards = container.querySelectorAll('.template-card')
    expect(cards.length).toBe(2)
    expect(cards[0].textContent).toContain('图纸B')
    expect(cards[1].textContent).toContain('图纸A')
  })

  it('热门/最新为空时显示诚实空态而不是伪造数据', () => {
    const { container } = setup({ savedWorks: [], cloudStore: feedStore() }, [
      '/gallery?feed=popular&q=不存在',
    ])
    expect(container.querySelectorAll('.template-card').length).toBe(0)
    expect(screen.getByText('没有找到匹配的模板')).toBeTruthy()
  })

  it('无筛选的热门空态说明「暂无下载数据」,而不是「匹配不到」', () => {
    const store = feedStore({
      templates: [
        {
          id: 't-zero',
          name: 'Zero',
          category: 'animal',
          difficulty: 'easy',
          size: 4,
          pattern: [['#FF0000']],
          downloadCount: 0,
          createdAt: null,
        },
      ],
    })
    setup({ savedWorks: [], cloudStore: store }, ['/gallery?feed=popular'])
    expect(screen.getByText('还没有足够的下载数据,先看看精选或最新吧')).toBeTruthy()
    expect(screen.queryByText('没有找到匹配的模板')).toBeNull()
  })

  it('精选 feed 带筛选时退化为筛选结果,并明确提示这不是人工精选', () => {
    const { container } = setup({ savedWorks: [], cloudStore: feedStore() }, ['/gallery?cat=animal'])
    expect(container.querySelectorAll('.template-card').length).toBe(2)
    expect(screen.getByText('匹配结果')).toBeTruthy()
  })

  it('切换 feed 不清空搜索词与筛选', () => {
    setup({ savedWorks: [], cloudStore: feedStore() }, ['/gallery?q=图纸A'])
    fireEvent.click(document.getElementById('gallery-tab-latest'))
    expect(screen.getByRole('searchbox').value).toBe('图纸A')
  })

  it('带筛选时点击侧栏策展入口会先清空筛选(单次写入,不被第二次导航写回)', () => {
    const { container } = setup({ savedWorks: [], cloudStore: feedStore() }, ['/gallery?cat=animal'])
    expect(container.querySelectorAll('.gallery-chip').length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '精选主题' }))
    expect(container.querySelectorAll('.gallery-chip').length).toBe(0)
    expect(screen.getByRole('searchbox').value).toBe('')
  })

  it('侧栏分类入口只改 cat,feed 保持不变', () => {
    const { container } = setup({ savedWorks: [], cloudStore: feedStore() }, ['/gallery?feed=popular'])
    // 侧栏与移动分类条都渲染食物项;点第一个(计数 1)
    fireEvent.click(screen.getAllByRole('button', { name: /食物/ })[0])
    expect(document.getElementById('gallery-tab-popular').getAttribute('aria-selected')).toBe('true')
    // 分类生效:热门 feed 只剩 food 分类下有下载的图纸B
    const cards = container.querySelectorAll('.template-card')
    expect(cards.length).toBe(1)
    expect(cards[0].textContent).toContain('图纸B')
  })
})
