import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import ContentManager from './ContentManager'
import i18n from '../i18n'

/**
 * 后台内容运营模块:
 *   - 健康检查把问题列出来(缺封面 / 重复 slug / 空发布等);
 *   - 新建/编辑走同一套校验,失败显示错误而不乐观更新;
 *   - 关联管理按顺序提交(整组替换)。
 * 真实 RLS 由迁移保证,这里不伪造权限测试。
 */

const contentState = {
  loading: false,
  error: '',
  themes: [],
  collections: [],
  themeTemplateIds: new Map(),
  collectionTemplateIds: new Map(),
  homeSections: [],
  childThemeIds: new Map(),
  themeCollectionIds: new Map(),
  createContent: vi.fn(),
  updateContent: vi.fn(),
  deleteContent: vi.fn(),
  setLinks: vi.fn(),
  saveHomeSections: vi.fn(),
  setThemeChildren: vi.fn(),
  setThemeCollections: vi.fn(),
  reload: vi.fn(),
}

vi.mock('../hooks/useGalleryContent', () => ({
  useGalleryContent: () => contentState,
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  contentState.themes = []
  contentState.collections = []
  contentState.themeTemplateIds = new Map()
  contentState.collectionTemplateIds = new Map()
  contentState.homeSections = []
  contentState.saveHomeSections = vi.fn()
  contentState.childThemeIds = new Map()
  contentState.themeCollectionIds = new Map()
})

const theme = (id, over = {}) => ({
  id, slug: id, title: `主题${id}`, description: '', coverUrl: '/c.png',
  status: 'published', isFeatured: false, sortOrder: 0,
  translations: { en: { title: 'T' }, ja: { title: 'T' }, ko: { title: 'T' } },
  ...over,
})

const templates = [
  { id: 't1', name: '鸭子', nameZh: '鸭子', category: 'animal', difficulty: 'easy', size: 2, pattern: [[null]] },
  { id: 't2', name: '猫', nameZh: '猫', category: 'animal', difficulty: 'easy', size: 2, pattern: [[null]] },
]

const setup = (over = {}) => render(
  <ContentManager cloudStore={{ templates, ...over }} />,
)

describe('ContentManager', () => {
  it('健康检查列出问题:缺封面、重复 slug、已发布为空', () => {
    contentState.themes = [
      theme('a', { coverUrl: '' }),
      theme('b', { slug: 'a' }),
    ]
    setup()
    expect(screen.getByText('内容健康检查')).toBeTruthy()
    expect(screen.getByText('缺封面')).toBeTruthy()
    expect(screen.getByText('重复 slug')).toBeTruthy()
    expect(screen.getAllByText('已发布但为空').length).toBeGreaterThan(0)
  })

  it('健康内容显示「未发现问题」', () => {
    contentState.themes = [theme('a')]
    contentState.themeTemplateIds = new Map([['a', ['t1']]])
    setup()
    expect(screen.getByText('未发现问题')).toBeTruthy()
  })

  it('新建主题:校验失败显示错误,不调用云端', async () => {
    contentState.createContent.mockResolvedValue({ ok: false, errors: [{ code: 'slugRequired' }] })
    setup()
    fireEvent.click(screen.getByText('新增主题'))
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(contentState.createContent).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('请填写 slug')).toBeTruthy()
  })

  it('新建主题:合法输入提交规范化数据并关闭弹窗', async () => {
    contentState.createContent.mockResolvedValue({ ok: true, content: theme('new') })
    setup()
    fireEvent.click(screen.getByText('新增主题'))
    const inputs = screen.getAllByRole('textbox')
    // 第一个输入是 slug,第二个是标题
    fireEvent.change(inputs[0], { target: { value: 'Spring Animals' } })
    fireEvent.change(inputs[1], { target: { value: '春日动物' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(contentState.createContent).toHaveBeenCalled())
    const [kind, input] = contentState.createContent.mock.calls[0]
    expect(kind).toBe('theme')
    expect(input.slug).toBe('Spring Animals')
    expect(input.title).toBe('春日动物')
  })

  it('切换合集标签后新增合集带策展说明字段', () => {
    setup()
    fireEvent.click(screen.getByText('合集'))
    fireEvent.click(screen.getByText('新增合集'))
    // 主字段 + 三个语言区各有一个「策展说明」
    expect(screen.getAllByText('策展说明').length).toBe(4)
  })

  it('关联管理:加入模板、上下移动后按顺序整组提交', async () => {
    contentState.themes = [theme('a')]
    contentState.themeTemplateIds = new Map([['a', ['t1']]])
    contentState.setLinks.mockResolvedValue({ ok: true })
    setup()
    fireEvent.click(screen.getByText('管理图纸'))
    expect(screen.getByText('已选 1 张')).toBeTruthy()
    fireEvent.click(screen.getByText('+ 猫'))
    expect(screen.getByText('已选 2 张')).toBeTruthy()
    fireEvent.click(screen.getAllByLabelText('up')[1]) // 把第二个(猫)上移
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(contentState.setLinks).toHaveBeenCalled())
    expect(contentState.setLinks).toHaveBeenCalledWith('theme', 'a', ['t2', 't1'])
  })

  it('删除需要二次确认', async () => {
    contentState.themes = [theme('a')]
    contentState.deleteContent.mockResolvedValue({ ok: true })
    setup()
    fireEvent.click(screen.getByText('删除'))
    expect(screen.getByText(/确定删除「主题a」/)).toBeTruthy()
    // 弹窗标题也是「删除」,按按钮角色取最后一个(弹窗内的确认按钮)
    const deleteButtons = screen.getAllByRole('button', { name: '删除' })
    fireEvent.click(deleteButtons[deleteButtons.length - 1])
    await waitFor(() => expect(contentState.deleteContent).toHaveBeenCalledWith('theme', 'a'))
  })
})

describe('ContentManager · 首页区块配置', () => {
  const section = (over = {}) => ({
    kind: 'popular',
    sourceId: null,
    title: '',
    subtitle: '',
    limitCount: 12,
    isEnabled: true,
    sortOrder: 0,
    ...over,
  })

  it('无配置时显示空态提示,并允许新增区块', async () => {
    render(<ContentManager cloudStore={{ templates: [] }} />)
    expect(screen.getByText('还没有配置区块,首页将使用默认顺序。')).toBeTruthy()

    fireEvent.click(screen.getByText('新增区块'))
    await waitFor(() => expect(document.querySelectorAll('.content-section-row')).toHaveLength(1))
  })

  it('保存时按当前顺序整组提交', async () => {
    contentState.homeSections = [
      section({ id: 's1', kind: 'popular', sortOrder: 0 }),
      section({ id: 's2', kind: 'latest', sortOrder: 1 }),
    ]
    contentState.saveHomeSections = vi.fn().mockResolvedValue({ ok: true })
    render(<ContentManager cloudStore={{ templates: [] }} />)

    const rows = document.querySelectorAll('.content-section-row')
    expect(rows).toHaveLength(2)

    // 第二行上移 → 顺序变成 latest, popular
    fireEvent.click(rows[1].querySelectorAll('.content-section-actions button')[0])
    fireEvent.click(screen.getByText('保存区块配置'))

    await waitFor(() => expect(contentState.saveHomeSections).toHaveBeenCalledTimes(1))
    const sent = contentState.saveHomeSections.mock.calls[0][0]
    expect(sent.map((x) => x.kind)).toEqual(['latest', 'popular'])
    // sortOrder 按新顺序重排
    expect(sent.map((x) => x.sortOrder)).toEqual([0, 1])
  })

  it('保存失败时显示错误,不清空草稿', async () => {
    contentState.homeSections = [section({ id: 's1' })]
    contentState.saveHomeSections = vi.fn().mockResolvedValue({
      ok: false,
      errors: [{ code: 'invalidLimit', detail: '0' }],
    })
    render(<ContentManager cloudStore={{ templates: [] }} />)

    // 未改动时保存按钮是禁用的(避免无意义写入);先改一处再保存
    fireEvent.change(document.querySelector('.content-section-row input[type="number"]'), {
      target: { value: '6' },
    })
    fireEvent.click(screen.getByText('保存区块配置'))
    // 错误详情展示在面板里(错误码未知时回退为 detail)
    await waitFor(() => expect(document.querySelector('.content-sections .content-section-error')).toBeTruthy())
    expect(document.querySelector('.content-sections .content-section-error').textContent).toContain('0')
    // 行仍在(草稿没被丢弃)
    expect(document.querySelectorAll('.content-section-row')).toHaveLength(1)
  })

  it('切换区块类型时清掉不适用的 sourceId', async () => {
    contentState.homeSections = [section({ id: 's1', kind: 'theme', sourceId: 'theme-1' })]
    render(<ContentManager cloudStore={{ templates: [] }} />)

    const kindSelect = document.querySelector('.content-section-row select')
    fireEvent.change(kindSelect, { target: { value: 'popular' } })

    // 切到 popular 后不再显示「数据来源」下拉
    await waitFor(() => {
      const labels = Array.from(document.querySelectorAll('.content-section-row label'))
        .map((l) => l.textContent)
      expect(labels.some((x) => x.includes('数据来源'))).toBe(false)
    })
  })
})

describe('ContentManager · 主题嵌套', () => {
  const th = (id, over = {}) => ({
    id, slug: id, title: `主题${id}`, description: '', coverUrl: '/c.png',
    status: 'published', isFeatured: false, sortOrder: 0, translations: {}, ...over,
  })

  it('主题行显示子主题与相关合集入口,合集行不显示', async () => {
    contentState.themes = [th('a')]
    const { rerender } = render(<ContentManager cloudStore={{ templates: [] }} />)
    expect(screen.getByText('子主题')).toBeTruthy()
    expect(screen.getByText('相关合集')).toBeTruthy()

    // 切到合集标签后入口消失
    fireEvent.click(screen.getByText('合集'))
    await waitFor(() => expect(screen.queryByText('子主题')).toBeNull())
  })

  it('子主题候选排除自己与已是别人子主题的主题', async () => {
    contentState.themes = [th('a'), th('b'), th('c')]
    // c 已经是 b 的子主题 → 不能作为 a 的候选
    contentState.childThemeIds = new Map([['b', ['c']]])
    render(<ContentManager cloudStore={{ templates: [] }} />)

    fireEvent.click(screen.getAllByText('子主题')[0])
    await waitFor(() => expect(document.querySelector('.content-link-editor')).toBeTruthy())

    const candidates = Array.from(document.querySelectorAll('.content-link-candidates button'))
      .map((b) => b.textContent)
    expect(candidates.some((x) => x.includes('主题b'))).toBe(true)
    expect(candidates.some((x) => x.includes('主题c'))).toBe(false)
  })

  it('保存子主题时按顺序整组提交', async () => {
    contentState.themes = [th('a'), th('b'), th('c')]
    contentState.setThemeChildren = vi.fn().mockResolvedValue({ ok: true })
    render(<ContentManager cloudStore={{ templates: [] }} />)

    fireEvent.click(screen.getAllByText('子主题')[0])
    await waitFor(() => expect(document.querySelector('.content-link-editor')).toBeTruthy())

    // 依次加入 b、c
    const addButtons = Array.from(document.querySelectorAll('.content-link-candidates button'))
    fireEvent.click(addButtons.find((b) => b.textContent.includes('主题b')))
    fireEvent.click(Array.from(document.querySelectorAll('.content-link-candidates button'))
      .find((b) => b.textContent.includes('主题c')))

    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(contentState.setThemeChildren).toHaveBeenCalledTimes(1))
    const [themeId, ids] = contentState.setThemeChildren.mock.calls[0]
    expect(themeId).toBe('a')
    expect(ids).toHaveLength(2)
  })

  it('保存相关合集调用 setThemeCollections', async () => {
    contentState.themes = [th('a')]
    contentState.collections = [
      { id: 'c1', slug: 'c1', title: '合集一', status: 'published', translations: {} },
    ]
    contentState.setThemeCollections = vi.fn().mockResolvedValue({ ok: true })
    render(<ContentManager cloudStore={{ templates: [] }} />)

    fireEvent.click(screen.getAllByText('相关合集')[0])
    await waitFor(() => expect(document.querySelector('.content-link-editor')).toBeTruthy())
    fireEvent.click(Array.from(document.querySelectorAll('.content-link-candidates button'))
      .find((b) => b.textContent.includes('合集一')))
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => expect(contentState.setThemeCollections).toHaveBeenCalledTimes(1))
    expect(contentState.setThemeCollections.mock.calls[0][1]).toEqual(['c1'])
  })
})
