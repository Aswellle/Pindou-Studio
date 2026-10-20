import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import ThemePage from './ThemePage'
import CollectionPage from './CollectionPage'
import PatternDetailPage from './PatternDetailPage'
import i18n from '../../i18n'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

/**
 * M7 页面级测试:主题页 / 合集页 / 图纸详情页。
 * 用 mock 的 useGalleryContent 直接提供策展数据,聚焦页面行为:
 *   - 不存在/未发布 → 空状态而不是白屏;
 *   - 已删除的模板引用被跳过;
 *   - 复制图纸写入来源 id 且不改源模板。
 */

const contentState = {
  loading: false,
  error: '',
  themes: [],
  collections: [],
  themeTemplateIds: new Map(),
  collectionTemplateIds: new Map(),
  childThemeIds: new Map(),
  themeCollectionIds: new Map(),
  enabled: true,
}

vi.mock('../../hooks/useGalleryContent', () => ({
  useGalleryContent: () => ({
    ...contentState,
    getThemeBySlug: (slug) => contentState.themes.find((x) => x.slug === slug) || null,
    getCollectionBySlug: (slug) => contentState.collections.find((x) => x.slug === slug) || null,
    // 公开路由专用:只认已发布(与真实 hook 一致)
    getPublishedThemeBySlug: (slug) => contentState.themes.find(
      (x) => x.slug === slug && x.status === 'published'
    ) || null,
    getPublishedCollectionBySlug: (slug) => contentState.collections.find(
      (x) => x.slug === slug && x.status === 'published'
    ) || null,
    reload: vi.fn(),
    createContent: vi.fn(),
    updateContent: vi.fn(),
    deleteContent: vi.fn(),
    setLinks: vi.fn(),
    clearError: vi.fn(),
  }),
}))

vi.mock('../../hooks/useCustomTemplates', () => ({
  default: () => ({ templates: [], categories: [] }),
}))

vi.mock('../../services/BeadPatternExporter', () => ({
  exportAsPNG: vi.fn().mockResolvedValue(undefined),
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  const ctx = {
    fillStyle: '', fillRect: () => {}, clearRect: () => {},
  }
  HTMLCanvasElement.prototype.getContext = function () { return ctx }
})

afterEach(() => {
  cleanup()
  contentState.loading = false
  contentState.themes = []
  contentState.collections = []
  contentState.themeTemplateIds = new Map()
  contentState.collectionTemplateIds = new Map()
  contentState.childThemeIds = new Map()
  contentState.themeCollectionIds = new Map()
})

const template = (id, over = {}) => ({
  id, name: `模板${id}`, category: 'animal', difficulty: 'easy',
  size: 2, pattern: [['#FF0000', null], [null, null]], paletteId: 'perler', ...over,
})
const theme = (id, over = {}) => ({
  id, slug: id, title: `主题${id}`, description: `说明${id}`,
  status: 'published', isFeatured: false, sortOrder: 0, translations: {}, ...over,
})

const cloudStore = (templates) => ({ enabled: true, loading: false, error: null, templates, categories: [], refresh: vi.fn(), loadAll: vi.fn() })

const renderAt = (element, path, route) => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>
  </HelmetProvider>,
)

describe('ThemePage', () => {
  it('主题不存在时显示提示而不是白屏', () => {
    renderAt(<ThemePage cloudStore={cloudStore([])} />, '/gallery/theme/nope', '/gallery/theme/:slug')
    expect(screen.getByText(/内容不存在或尚未发布/)).toBeTruthy()
  })

  it('展示主题标题、说明与关联模板,并跳过已删除模板', () => {
    contentState.themes = [theme('spring')]
    contentState.themeTemplateIds = new Map([['spring', ['t1', 'ghost']]])
    const { container } = renderAt(
      <ThemePage cloudStore={cloudStore([template('t1')])} />,
      '/gallery/theme/spring',
      '/gallery/theme/:slug',
    )
    expect(screen.getByText('主题spring')).toBeTruthy()
    expect(screen.getByText('说明spring')).toBeTruthy()
    expect(container.querySelectorAll('.template-card')).toHaveLength(1)
    expect(screen.getByText('共 1 张图纸')).toBeTruthy()
  })

  it('URL 筛选作用在主题范围内', () => {
    contentState.themes = [theme('spring')]
    contentState.themeTemplateIds = new Map([['spring', ['t1', 't2']]])
    const templates = [template('t1'), template('t2', { category: 'food' })]
    renderAt(
      <ThemePage cloudStore={cloudStore(templates)} />,
      '/gallery/theme/spring?cat=food',
      '/gallery/theme/:slug',
    )
    expect(screen.getByText('共 1 张图纸')).toBeTruthy()
  })
})

  it('草稿主题在公开路由不可见(管理员凭 RLS 能拿到草稿)', () => {
    contentState.themes = [theme('draft-one', { status: 'draft' })]
    contentState.themeTemplateIds = new Map([['draft-one', ['1']]])
    renderAt(<ThemePage cloudStore={cloudStore([template('1')])} />, '/gallery/theme/draft-one', '/gallery/theme/:slug')
    expect(screen.getByText('内容不存在或尚未发布')).toBeTruthy()
    expect(screen.queryByText('主题draft-one')).toBeNull()
  })

  it('封面写入 og:image,相对路径补全为绝对地址', async () => {
    contentState.themes = [theme('with-cover', { coverUrl: '/covers/a.png' })]
    renderAt(<ThemePage cloudStore={cloudStore([])} />, '/gallery/theme/with-cover', '/gallery/theme/:slug')
    // Helmet 在 effect 之后才写入 head,需等待
    const meta = await waitFor(() => {
      const el = document.querySelector('meta[property="og:image"]')
      expect(el).toBeTruthy()
      return el
    })
    expect(meta.getAttribute('content')).toBe('https://tangnotes.site/covers/a.png')
  })

  it('无封面时不输出 og:image(交给站点默认图)', async () => {
    contentState.themes = [theme('no-cover', { coverUrl: '' })]
    renderAt(<ThemePage cloudStore={cloudStore([])} />, '/gallery/theme/no-cover', '/gallery/theme/:slug')
    // 等标题写入 head,确保 Helmet 已 flush 后再断言「没有 og:image」
    await waitFor(() => expect(document.querySelector('title')).toBeTruthy())
    expect(document.querySelector('meta[property="og:image"]')).toBeNull()
  })

describe('CollectionPage', () => {
  it('展示策展说明与有序模板', () => {
    contentState.collections = [theme('pets', { curationNote: '适合新手' })]
    contentState.collectionTemplateIds = new Map([['pets', ['t2', 't1']]])
    const { container } = renderAt(
      <CollectionPage cloudStore={cloudStore([template('t1'), template('t2')])} />,
      '/gallery/collection/pets',
      '/gallery/collection/:slug',
    )
    expect(screen.getByText('适合新手')).toBeTruthy()
    const names = [...container.querySelectorAll('.template-name')].map((n) => n.textContent)
    expect(names).toEqual(['模板t2', '模板t1']) // 保持管理员顺序
  })

  it('合集不存在时显示提示', () => {
    renderAt(<CollectionPage cloudStore={cloudStore([])} />, '/gallery/collection/nope', '/gallery/collection/:slug')
    expect(screen.getByText(/内容不存在或尚未发布/)).toBeTruthy()
  })
})

describe('PatternDetailPage', () => {
  it('复制到我的图纸:保存携带来源 id,源模板 pattern 不被修改', async () => {
    const tpl = template('tpl-9')
    const before = JSON.stringify(tpl.pattern)
    const onSaveProject = vi.fn().mockResolvedValue(true)
    renderAt(
      <PatternDetailPage cloudStore={cloudStore([tpl])} onSaveProject={onSaveProject} onLoadTemplate={vi.fn()} />,
      '/gallery/pattern/tpl-9',
      '/gallery/pattern/:id',
    )
    fireEvent.click(screen.getByText('复制到我的图纸'))
    await screen.findByText(/已复制到我的图纸/)
    const saved = onSaveProject.mock.calls[0][0]
    expect(saved.sourceTemplateId).toBe('tpl-9')
    expect(saved.name).toBe('模板tpl-9')
    expect(saved.canvasData).toHaveLength(2)
    expect(JSON.stringify(tpl.pattern)).toBe(before)
  })

  it('开始编辑:回调携带 pattern 与品牌,矩形模板带真实宽高', () => {
    const onLoadTemplate = vi.fn()
    const rect = template('rect', { pattern: [['#FF0000', '#FF0000', '#FF0000'], [null, null, null]], paletteId: 'mard' })
    renderAt(
      <PatternDetailPage cloudStore={cloudStore([rect])} onSaveProject={vi.fn()} onLoadTemplate={onLoadTemplate} />,
      '/gallery/pattern/rect',
      '/gallery/pattern/:id',
    )
    fireEvent.click(screen.getByText('查看图纸'))
    const [pattern, size, options] = onLoadTemplate.mock.calls[0]
    expect(pattern).toHaveLength(2)
    expect(size).toBe(3)
    expect(options).toEqual({ palette: 'mard', gridWidth: 3, gridHeight: 2 })
  })

  it('图纸不存在时显示提示', () => {
    renderAt(
      <PatternDetailPage cloudStore={cloudStore([])} onSaveProject={vi.fn()} onLoadTemplate={vi.fn()} />,
      '/gallery/pattern/ghost',
      '/gallery/pattern/:id',
    )
    expect(screen.getByText(/内容不存在或尚未发布/)).toBeTruthy()
  })
})

describe('ThemePage · 子主题与相关合集', () => {
  it('渲染子主题入口,点击跳转到对应主题', () => {
    contentState.themes = [
      theme('parent', { title: '父主题' }),
      theme('child', { slug: 'child', title: '子主题A' }),
    ]
    contentState.childThemeIds = new Map([['parent', ['child']]])
    renderAt(<ThemePage cloudStore={cloudStore([])} />, '/gallery/theme/parent', '/gallery/theme/:slug')

    const section = document.querySelector('.content-related')
    expect(section).toBeTruthy()
    expect(section.textContent).toContain('子主题')
    expect(section.textContent).toContain('子主题A')
  })

  it('未发布的子主题不显示(管理员可能拿到草稿)', () => {
    contentState.themes = [
      theme('parent', { title: '父主题' }),
      theme('draft-child', { slug: 'draft-child', title: '草稿子主题', status: 'draft' }),
    ]
    contentState.childThemeIds = new Map([['parent', ['draft-child']]])
    renderAt(<ThemePage cloudStore={cloudStore([])} />, '/gallery/theme/parent', '/gallery/theme/:slug')

    expect(document.querySelector('.content-related')).toBeNull()
    expect(screen.queryByText('草稿子主题')).toBeNull()
  })

  it('相关合集按关联顺序渲染,已删除的跳过', () => {
    contentState.themes = [theme('parent', { title: '父主题' })]
    contentState.collections = [
      { id: 'c1', slug: 'c1', title: '合集一', status: 'published', translations: {} },
      { id: 'c2', slug: 'c2', title: '合集二', status: 'published', translations: {} },
    ]
    // 顺序:c2 → 已删除的 c9 → c1
    contentState.themeCollectionIds = new Map([['parent', ['c2', 'c9', 'c1']]])
    renderAt(<ThemePage cloudStore={cloudStore([])} />, '/gallery/theme/parent', '/gallery/theme/:slug')

    const sections = document.querySelectorAll('.content-related')
    const collectionsSection = Array.from(sections).find((x) => x.textContent.includes('相关合集'))
    expect(collectionsSection).toBeTruthy()
    const names = Array.from(collectionsSection.querySelectorAll('.content-related-name')).map((x) => x.textContent)
    expect(names).toEqual(['合集二', '合集一'])
  })

  it('没有子主题/合集时不渲染相关区块', () => {
    contentState.themes = [theme('solo', { title: '独立主题' })]
    renderAt(<ThemePage cloudStore={cloudStore([])} />, '/gallery/theme/solo', '/gallery/theme/:slug')
    expect(document.querySelector('.content-related')).toBeNull()
  })
})

describe('PatternDetailPage · 布局与信息密度', () => {
  it('两栏布局:预览与信息栏同时存在', () => {
    const { container } = renderAt(
      <PatternDetailPage cloudStore={cloudStore([template('1')])} />,
      '/gallery/pattern/1', '/gallery/pattern/:id',
    )
    expect(container.querySelector('.detail-layout')).toBeTruthy()
    expect(container.querySelector('.detail-preview-pane')).toBeTruthy()
    expect(container.querySelector('.detail-info-pane')).toBeTruthy()
  })

  it('事实表展示尺寸/豆子数/用色数/难度/色卡', () => {
    renderAt(
      <PatternDetailPage cloudStore={cloudStore([template('1')])} />,
      '/gallery/pattern/1', '/gallery/pattern/:id',
    )
    const facts = document.querySelector('.detail-facts')
    expect(facts).toBeTruthy()
    const text = facts.textContent
    expect(text).toContain('尺寸')
    expect(text).toContain('豆子总数')
    expect(text).toContain('用色数')
    expect(text).toContain('难度')
    expect(text).toContain('色卡')
  })

  it('颜色清单按颗数降序,并给出品牌色号', () => {
    // 3 颗红、1 颗蓝 → 红在前
    const tpl = template('1', {
      pattern: [['#FF0000', '#FF0000'], ['#FF0000', '#0000FF']],
    })
    renderAt(
      <PatternDetailPage cloudStore={cloudStore([tpl])} />,
      '/gallery/pattern/1', '/gallery/pattern/:id',
    )
    const rows = document.querySelectorAll('.detail-color-item')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('3')
    expect(rows[1].textContent).toContain('1')
    // 每行都有色号(Perler 就近匹配)
    expect(rows[0].querySelector('.detail-color-code')?.textContent).toBeTruthy()
    // 清单在通栏网格里,不是窄栏内的滚动列表
    expect(document.querySelector('.detail-color-grid')).toBeTruthy()
    expect(document.querySelector('.detail-color-list')).toBeNull()
  })

  it('预览画布有高度约束类,避免大图纸溢出视口', () => {
    const { container } = renderAt(
      <PatternDetailPage cloudStore={cloudStore([template('1')])} />,
      '/gallery/pattern/1', '/gallery/pattern/:id',
    )
    const preview = container.querySelector('.content-detail-preview')
    expect(preview).toBeTruthy()
    expect(preview.querySelector('canvas')).toBeTruthy()
  })
})
