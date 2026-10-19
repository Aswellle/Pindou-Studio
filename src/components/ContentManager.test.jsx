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
  createContent: vi.fn(),
  updateContent: vi.fn(),
  deleteContent: vi.fn(),
  setLinks: vi.fn(),
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
