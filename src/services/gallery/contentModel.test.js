import { describe, it, expect } from 'vitest'
import {
  CONTENT_STATUS,
  CONTENT_ERRORS,
  normalizeSlug,
  isSafeCoverUrl,
  normalizeContentInput,
  contentToRow,
  rowToContent,
  localizedContentText,
  sortContent,
  checkContentHealth,
  HOME_SECTION_KINDS,
  HOME_SECTION_ERRORS,
  DEFAULT_HOME_SECTIONS,
  normalizeHomeSectionInput,
  homeSectionToRow,
  rowToHomeSection,
  resolveHomeSections,
} from './contentModel'

describe('normalizeSlug', () => {
  it('小写化并把非字母数字折叠成单个连字符', () => {
    expect(normalizeSlug('  Spring  Animals! ')).toBe('spring-animals')
    expect(normalizeSlug('a__b---c')).toBe('a-b-c')
  })

  it('去掉首尾连字符,截断到 80 字符且不以连字符结尾', () => {
    expect(normalizeSlug('---hi---')).toBe('hi')
    const long = normalizeSlug(`${'a'.repeat(79)} b`)
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.endsWith('-')).toBe(false)
  })

  it('非字符串返回空串', () => {
    expect(normalizeSlug(null)).toBe('')
    expect(normalizeSlug(42)).toBe('')
  })
})

describe('isSafeCoverUrl', () => {
  it('接受 http(s) 与站内绝对路径', () => {
    expect(isSafeCoverUrl('https://cdn.example.com/a.png')).toBe(true)
    expect(isSafeCoverUrl('http://example.com/a.png')).toBe(true)
    expect(isSafeCoverUrl('/covers/spring.png')).toBe(true)
  })

  it('拒绝可执行协议、协议相对地址与空值', () => {
    expect(isSafeCoverUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeCoverUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isSafeCoverUrl('//evil.example.com/a.png')).toBe(false)
    expect(isSafeCoverUrl('')).toBe(false)
    expect(isSafeCoverUrl(null)).toBe(false)
  })
})

describe('normalizeContentInput', () => {
  const valid = { slug: 'spring-animals', title: '春日动物' }

  it('合法输入返回规范化结果,默认草稿、非精选、排序 0', () => {
    const res = normalizeContentInput(valid, 'theme')
    expect(res.ok).toBe(true)
    expect(res.content).toMatchObject({
      slug: 'spring-animals',
      title: '春日动物',
      status: CONTENT_STATUS.DRAFT,
      isFeatured: false,
      sortOrder: 0,
      coverUrl: null,
    })
    expect(res.content.translations.en).toEqual({ title: null, description: null })
    expect(res.content.curationNote).toBeUndefined()
  })

  it('合集额外保留 curationNote 及其翻译', () => {
    const res = normalizeContentInput(
      { ...valid, curationNote: '  春游首选  ', translations: { en: { curationNote: 'Spring picks' } } },
      'collection',
    )
    expect(res.ok).toBe(true)
    expect(res.content.curationNote).toBe('春游首选')
    expect(res.content.translations.en.curationNote).toBe('Spring picks')
  })

  it('slug 非法(空/纯符号)与标题缺失分别报错', () => {
    const res = normalizeContentInput({ slug: '!!!', title: '' }, 'theme')
    expect(res.ok).toBe(false)
    const codes = res.errors.map((e) => e.code)
    expect(codes).toContain(CONTENT_ERRORS.SLUG_INVALID)
    expect(codes).toContain(CONTENT_ERRORS.TITLE_REQUIRED)
  })

  it('拒绝未知状态、非数字排序与不安全封面', () => {
    const res = normalizeContentInput(
      { ...valid, status: 'live', sortOrder: 'abc', coverUrl: 'javascript:alert(1)' },
      'theme',
    )
    expect(res.ok).toBe(false)
    const codes = res.errors.map((e) => e.code)
    expect(codes).toContain(CONTENT_ERRORS.INVALID_STATUS)
    expect(codes).toContain(CONTENT_ERRORS.INVALID_SORT_ORDER)
    expect(codes).toContain(CONTENT_ERRORS.INVALID_COVER_URL)
  })

  it('超长标题被拒绝,超长描述被截断而不是报错', () => {
    const longTitle = normalizeContentInput({ slug: 'a', title: 'x'.repeat(81) }, 'theme')
    expect(longTitle.ok).toBe(false)
    expect(longTitle.errors[0].code).toBe(CONTENT_ERRORS.TITLE_TOO_LONG)

    const longDesc = normalizeContentInput({ slug: 'a', title: 'A', description: 'y'.repeat(3000) }, 'theme')
    expect(longDesc.ok).toBe(true)
    expect(longDesc.content.description.length).toBe(2000)
  })

  it('非对象输入直接拒绝', () => {
    expect(normalizeContentInput(null).ok).toBe(false)
    expect(normalizeContentInput([]).ok).toBe(false)
  })
})

describe('contentToRow / rowToContent 往返', () => {
  it('主题行展开/折叠多语言字段', () => {
    const { content } = normalizeContentInput({
      slug: 'spring',
      title: '春天',
      description: '描述',
      coverUrl: '/covers/spring.png',
      status: 'published',
      isFeatured: true,
      sortOrder: 3,
      translations: { en: { title: 'Spring', description: 'Desc' } },
    }, 'theme')
    const row = contentToRow(content, 'theme')
    expect(row).toMatchObject({
      slug: 'spring',
      title: '春天',
      title_en: 'Spring',
      description_en: 'Desc',
      title_ja: null,
      cover_url: '/covers/spring.png',
      is_featured: true,
      sort_order: 3,
      status: 'published',
    })
    expect(row.curation_note).toBeUndefined()

    const back = rowToContent({ id: 't1', ...row }, 'theme')
    expect(back).toMatchObject({
      id: 't1',
      slug: 'spring',
      title: '春天',
      isFeatured: true,
      sortOrder: 3,
      status: 'published',
    })
    expect(back.translations.en).toEqual({ title: 'Spring', description: 'Desc' })
    expect(back.translations.ja).toEqual({ title: null, description: null })
  })

  it('合集行包含策展说明列,主题行不包含', () => {
    const { content } = normalizeContentInput({ slug: 'c', title: 'C', curationNote: '说明' }, 'collection')
    expect(contentToRow(content, 'collection').curation_note).toBe('说明')
  })

  it('rowToContent(null) 返回 null;缺列安全回退', () => {
    expect(rowToContent(null)).toBe(null)
    const minimal = rowToContent({ id: 'x', slug: 's', title: 'T' })
    expect(minimal.status).toBe(CONTENT_STATUS.DRAFT)
    expect(minimal.coverUrl).toBe('')
    expect(minimal.sortOrder).toBe(0)
  })
})

describe('localizedContentText', () => {
  const content = {
    title: '春天', description: '中文描述',
    translations: { en: { title: 'Spring', description: null }, ja: { title: null, description: '春の説明' } },
  }

  it('命中语言时优先翻译,缺失字段逐个回退', () => {
    expect(localizedContentText(content, 'en-US')).toEqual({ title: 'Spring', description: '中文描述', curationNote: '' })
    expect(localizedContentText(content, 'ja-JP').title).toBe('春天')
    expect(localizedContentText(content, 'ja-JP').description).toBe('春の説明')
  })

  it('zh-CN 直接用主字段;未知语言同样回退', () => {
    expect(localizedContentText(content, 'zh-CN').title).toBe('春天')
    expect(localizedContentText(content, 'fr-FR').title).toBe('春天')
  })

  it('空对象返回空串', () => {
    expect(localizedContentText(null, 'en')).toEqual({ title: '', description: '', curationNote: '' })
  })
})

describe('sortContent', () => {
  it('精选优先,再按 sort_order,最后按标题', () => {
    const list = [
      { title: 'B', sortOrder: 1, isFeatured: false },
      { title: 'A', sortOrder: 2, isFeatured: false },
      { title: 'Z', sortOrder: 9, isFeatured: true },
      { title: 'C', sortOrder: 1, isFeatured: false },
    ]
    expect(sortContent(list).map((x) => x.title)).toEqual(['Z', 'B', 'C', 'A'])
  })

  it('不修改入参', () => {
    const list = [{ title: 'B', sortOrder: 2 }, { title: 'A', sortOrder: 1 }]
    const copy = [...list]
    sortContent(list)
    expect(list).toEqual(copy)
  })
})

describe('checkContentHealth', () => {
  const base = (over = {}) => ({
    id: 't1', slug: 'spring', title: 'Spring', coverUrl: '/c.png', status: 'published',
    isFeatured: false, translations: { en: { title: 'S' }, ja: { title: 'S' }, ko: { title: 'S' } },
    ...over,
  })

  it('健康对象无问题', () => {
    const issues = checkContentHealth({
      themes: [base()],
      collections: [],
      templateIds: ['tpl-1'],
      links: [{ kind: 'theme', parentId: 't1', templateId: 'tpl-1' }],
    })
    expect(issues).toEqual([])
  })

  it('缺封面 / 缺翻译 / 重复 slug / 已发布但为空', () => {
    const issues = checkContentHealth({
      themes: [
        base({ id: 't1', coverUrl: '', translations: { en: { title: 'S' } } }),
        base({ id: 't2', slug: 'spring' }),
      ],
      collections: [],
      templateIds: [],
      links: [],
    })
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('missingCover')
    expect(codes).toContain('duplicateSlug')
    expect(codes).toContain('emptyPublished')
    expect(issues.filter((i) => i.code === 'missingTranslation').length).toBe(2) // 仅 t1 缺 ja/ko;t2 三条齐全
  })

  it('引用不存在的模板 / 孤儿关联', () => {
    const issues = checkContentHealth({
      themes: [base()],
      collections: [],
      templateIds: ['tpl-1'],
      links: [
        { kind: 'theme', parentId: 't1', templateId: 'ghost' },
        { kind: 'theme', parentId: 'nope', templateId: 'tpl-1' },
      ],
    })
    const codes = issues.map((i) => i.code)
    expect(codes).toContain('missingTemplate')
    expect(codes).toContain('orphanLink')
  })

  it('草稿没有关联不报 emptyPublished(草稿本就允许为空)', () => {
    const issues = checkContentHealth({
      themes: [base({ status: 'draft' })],
      collections: [],
      templateIds: [],
      links: [],
    })
    expect(issues.map((i) => i.code)).not.toContain('emptyPublished')
  })
})

describe('首页区块配置', () => {
  it('聚合型区块不需要 sourceId', () => {
    const res = normalizeHomeSectionInput({ kind: 'popular', limitCount: 8 })
    expect(res.ok).toBe(true)
    expect(res.section).toMatchObject({ kind: 'popular', sourceId: null, limitCount: 8, isEnabled: true })
  })

  it('theme/collection 缺少 sourceId 时拒绝', () => {
    const res = normalizeHomeSectionInput({ kind: 'theme' })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(HOME_SECTION_ERRORS.MISSING_SOURCE)
  })

  it('聚合型区块带了 sourceId 时拒绝(避免写入无意义引用)', () => {
    const res = normalizeHomeSectionInput({ kind: 'latest', sourceId: 'abc' })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(HOME_SECTION_ERRORS.UNEXPECTED_SOURCE)
  })

  it('未知 kind 被拒绝', () => {
    const res = normalizeHomeSectionInput({ kind: 'nope' })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe(HOME_SECTION_ERRORS.INVALID_KIND)
  })

  it('limitCount 超出 1–50 被拒绝', () => {
    expect(normalizeHomeSectionInput({ kind: 'popular', limitCount: 0 }).errors[0].code)
      .toBe(HOME_SECTION_ERRORS.INVALID_LIMIT)
    expect(normalizeHomeSectionInput({ kind: 'popular', limitCount: 51 }).errors[0].code)
      .toBe(HOME_SECTION_ERRORS.INVALID_LIMIT)
  })

  it('行映射往返保持字段', () => {
    const row = homeSectionToRow({
      kind: 'collection', sourceId: 'c1', title: '精选', subtitle: '说明',
      limitCount: 6, isEnabled: false, sortOrder: 3,
    })
    expect(row).toMatchObject({
      kind: 'collection', source_id: 'c1', title: '精选', subtitle: '说明',
      limit_count: 6, is_enabled: false, sort_order: 3,
    })
    expect(rowToHomeSection({ id: 's1', ...row })).toMatchObject({
      id: 's1', kind: 'collection', sourceId: 'c1', limitCount: 6, isEnabled: false, sortOrder: 3,
    })
  })

  it('无配置时回退到默认区块(未执行迁移的项目行为不变)', () => {
    expect(resolveHomeSections([]).map((s) => s.kind))
      .toEqual(DEFAULT_HOME_SECTIONS.map((s) => s.kind))
    expect(resolveHomeSections(null).length).toBe(DEFAULT_HOME_SECTIONS.length)
  })

  it('有配置时只保留启用项,并按 sortOrder 排序', () => {
    const resolved = resolveHomeSections([
      { kind: 'latest', sortOrder: 2, isEnabled: true },
      { kind: 'popular', sortOrder: 1, isEnabled: true },
      { kind: 'themes', sortOrder: 0, isEnabled: false },
    ])
    expect(resolved.map((s) => s.kind)).toEqual(['popular', 'latest'])
  })

  it('所有已知 kind 都有对应的规范化路径', () => {
    for (const kind of HOME_SECTION_KINDS) {
      const needsSource = kind === 'theme' || kind === 'collection'
      const res = normalizeHomeSectionInput({ kind, sourceId: needsSource ? 'x' : null })
      expect(res.ok).toBe(true)
    }
  })
})
