import { describe, it, expect } from 'vitest'
import {
  publishedOnly,
  resolveTemplatesByIds,
  templateById,
  pickPopular,
  pickLatest,
  pickFeatured,
  buildDiscoverySections,
  RAIL_LIMIT,
} from './discovery'

const tpl = (id, over = {}) => ({ id, name: `T${id}`, pattern: [[null]], ...over })
const content = (id, over = {}) => ({ id, slug: id, title: id, status: 'published', isFeatured: false, sortOrder: 0, ...over })

describe('publishedOnly', () => {
  it('只保留 published,草稿与非法状态被过滤', () => {
    expect(publishedOnly([content('a'), content('b', { status: 'draft' }), null, { id: 'c' }]).map((x) => x.id)).toEqual(['a'])
  })
})

describe('resolveTemplatesByIds', () => {
  const all = [tpl('1'), tpl('2'), tpl('3')]

  it('按传入顺序解析,不按模板列表顺序', () => {
    const { templates, missing } = resolveTemplatesByIds(all, ['3', '1'])
    expect(templates.map((t) => t.id)).toEqual(['3', '1'])
    expect(missing).toBe(0)
  })

  it('已删除的引用被跳过并计数', () => {
    const { templates, missing } = resolveTemplatesByIds(all, ['2', 'ghost'])
    expect(templates.map((t) => t.id)).toEqual(['2'])
    expect(missing).toBe(1)
  })

  it('空输入返回空结果', () => {
    expect(resolveTemplatesByIds(all, [])).toEqual({ templates: [], missing: 0 })
    expect(resolveTemplatesByIds(all, null)).toEqual({ templates: [], missing: 0 })
  })

  it('数字与字符串 id 视为同一个模板', () => {
    expect(templateById([tpl(7)], '7')?.id).toBe(7)
    expect(templateById([tpl('x')], 'x')?.id).toBe('x')
    expect(templateById([tpl('x')], null)).toBe(null)
  })
})

describe('pickPopular', () => {
  it('按下载量降序,0 下载不进榜', () => {
    const list = [tpl('a'), tpl('b'), tpl('c')]
    const counts = { a: 3, b: 10, c: 0 }
    expect(pickPopular(list, (t) => counts[t.id]).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('同下载量保持原顺序(稳定)', () => {
    const list = [tpl('a'), tpl('b'), tpl('c')]
    expect(pickPopular(list, () => 5).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('全部 0 下载时返回空数组,而不是随便挑几个', () => {
    expect(pickPopular([tpl('a'), tpl('b')], () => 0)).toEqual([])
  })

  it('遵守 limit', () => {
    const list = Array.from({ length: RAIL_LIMIT + 5 }, (_, i) => tpl(String(i)))
    expect(pickPopular(list, () => 1, 3)).toHaveLength(3)
  })
})

describe('pickLatest', () => {
  it('只保留有合法创建时间的模板,按时间降序', () => {
    const list = [
      tpl('old', { createdAt: '2026-01-01T00:00:00Z' }),
      tpl('new', { createdAt: '2026-10-01T00:00:00Z' }),
      tpl('builtin'), // 内置模板无 createdAt
      tpl('bad', { createdAt: 'not-a-date' }),
    ]
    expect(pickLatest(list).map((t) => t.id)).toEqual(['new', 'old'])
  })

  it('没有可信时间时返回空数组', () => {
    expect(pickLatest([tpl('a'), tpl('b')])).toEqual([])
  })
})

describe('pickFeatured', () => {
  it('优先精选,其次没有精选时返回 null(不自动编造精选)', () => {
    expect(pickFeatured([content('a'), content('b', { isFeatured: true })])?.id).toBe('b')
    expect(pickFeatured([content('a'), content('b')])).toBe(null)
  })

  it('草稿即使标了精选也不会被选中', () => {
    expect(pickFeatured([content('a', { isFeatured: true, status: 'draft' })])).toBe(null)
  })
})

describe('buildDiscoverySections', () => {
  const templates = [
    tpl('1', { createdAt: '2026-01-02T00:00:00Z' }),
    tpl('2', { createdAt: '2026-01-03T00:00:00Z' }),
    tpl('3', { createdAt: '2026-01-01T00:00:00Z' }),
  ]

  it('组装区块并过滤草稿、跳过已删除模板', () => {
    const sections = buildDiscoverySections({
      templates,
      downloadCountOf: (t) => ({ 1: 1, 2: 5, 3: 0 }[t.id] || 0),
      themes: [
        content('spring', { isFeatured: true }),
        content('draft', { status: 'draft', isFeatured: true }),
      ],
      collections: [content('pets')],
      themeTemplateIds: new Map([['spring', ['2', 'ghost']]]),
      collectionTemplateIds: new Map([['pets', ['3']]]),
    })

    expect(sections.featuredTheme?.id).toBe('spring')
    expect(sections.featuredCollection).toBe(null)
    expect(sections.popular.map((t) => t.id)).toEqual(['2', '1'])
    expect(sections.latest.map((t) => t.id)).toEqual(['2', '1', '3'])
    expect(sections.themes.map((t) => t.id)).toEqual(['spring'])
    expect(sections.collections.map((c) => c.id)).toEqual(['pets'])
    expect(sections.themePreview(sections.themes[0]).id).toBe('2')
    expect(sections.collectionPreview(sections.collections[0]).id).toBe('3')
  })

  it('无策展内容、无下载量、无创建时间时所有区块为空但不抛错', () => {
    const sections = buildDiscoverySections({ templates: [tpl('1'), tpl('2')] })
    expect(sections.featuredTheme).toBe(null)
    expect(sections.popular).toEqual([])
    expect(sections.latest).toEqual([])
    expect(sections.themes).toEqual([])
    expect(sections.themePreview(content('x'))).toBe(null)
  })
})

describe('buildDiscoverySections · 首页区块配置', () => {
  const templates = [
    tpl('1', { createdAt: '2026-10-02T00:00:00Z', downloadCount: 5 }),
    tpl('2', { createdAt: '2026-10-01T00:00:00Z', downloadCount: 9 }),
  ]
  const themes = [content('t1', { slug: 'a', isFeatured: true })]
  const collections = [content('c1', { slug: 'b' })]

  const base = {
    templates,
    downloadCountOf: (x) => x.downloadCount || 0,
    themes,
    collections,
  }

  it('按配置顺序输出区块,并遵守 limitCount', () => {
    const out = buildDiscoverySections({
      ...base,
      homeSections: [
        { kind: 'latest', limitCount: 1, isEnabled: true, sortOrder: 0 },
        { kind: 'popular', limitCount: 2, isEnabled: true, sortOrder: 1 },
      ],
    })
    expect(out.blocks.map((b) => b.kind)).toEqual(['latest', 'popular'])
    expect(out.blocks[0].content.templates).toHaveLength(1)
    expect(out.blocks[1].content.templates).toHaveLength(2)
  })

  it('禁用的区块被跳过', () => {
    const out = buildDiscoverySections({
      ...base,
      homeSections: [
        { kind: 'popular', isEnabled: false, sortOrder: 0 },
        { kind: 'latest', isEnabled: true, sortOrder: 1 },
      ],
    })
    expect(out.blocks.map((b) => b.kind)).toEqual(['latest'])
  })

  it('无内容的区块整块跳过(不渲染空壳)', () => {
    const out = buildDiscoverySections({
      ...base,
      templates: [], // 没有模板 → popular/latest 无内容
      homeSections: [
        { kind: 'popular', isEnabled: true, sortOrder: 0 },
        { kind: 'themes', isEnabled: true, sortOrder: 1 },
      ],
    })
    expect(out.blocks.map((b) => b.kind)).toEqual(['themes'])
  })

  it('单个主题区块只认已发布对象', () => {
    const draft = content('t2', { slug: 'draft', status: 'draft' })
    const out = buildDiscoverySections({
      ...base,
      themes: [...themes, draft],
      homeSections: [
        { kind: 'theme', sourceId: 't2', isEnabled: true, sortOrder: 0 },
      ],
    })
    expect(out.blocks).toHaveLength(0)

    const ok = buildDiscoverySections({
      ...base,
      homeSections: [{ kind: 'theme', sourceId: 't1', isEnabled: true, sortOrder: 0 }],
    })
    expect(ok.blocks[0].content.theme.id).toBe('t1')
  })

  it('无配置时行为与默认区块一致', () => {
    const out = buildDiscoverySections(base)
    expect(out.blocks.map((b) => b.kind)).toEqual(
      ['featured', 'popular', 'latest', 'themes', 'collections']
    )
  })
})
