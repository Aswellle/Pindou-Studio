/**
 * 图库策展内容的纯函数层:主题 / 合集的校验、行映射、排序与健康检查。
 *
 * 这里不访问 Supabase、不访问 React —— 云端仓库(cloudGalleryStore)与
 * 本地回退都复用同一套规则,测试可直接覆盖。
 *
 * 数据形状(UI 侧,camelCase):
 *   theme      { id, slug, title, description, coverUrl, status, isFeatured,
 *                sortOrder, translations: { en, ja, ko }, createdAt, updatedAt }
 *   collection 同上 + { curationNote, translations.{lang}.curationNote }
 *
 * 多语言字段在库里是 title_en/title_ja/title_ko 这类平铺列;
 * translations 只是 UI 侧的分组视图,读写两端由本文件负责展开/折叠。
 */

export const CONTENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
})

export const CONTENT_ERRORS = Object.freeze({
  NOT_OBJECT: 'notObject',
  SLUG_REQUIRED: 'slugRequired',
  SLUG_INVALID: 'slugInvalid',
  TITLE_REQUIRED: 'titleRequired',
  TITLE_TOO_LONG: 'titleTooLong',
  DESCRIPTION_TOO_LONG: 'descriptionTooLong',
  INVALID_STATUS: 'invalidStatus',
  INVALID_SORT_ORDER: 'invalidSortOrder',
  INVALID_COVER_URL: 'invalidCoverUrl',
})

export const MAX_TITLE_LENGTH = 80
export const MAX_DESCRIPTION_LENGTH = 2000
export const MAX_CURATION_NOTE_LENGTH = 2000
export const MAX_SLUG_LENGTH = 80

/** 语言代码 → 列后缀(en/ja/ko 与 i18n 的 en-US/ja-JP/ko-KR 对应) */
export const TRANSLATION_LANGS = Object.freeze(['en', 'ja', 'ko'])

/** URL 安全的 slug:小写字母/数字,用单个连字符分隔 */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function normalizeSlug(input) {
  if (typeof input !== 'string') return ''
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function trimOrNull(v, max) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.slice(0, max)
}

/**
 * 封面地址只接受 http(s) 绝对地址或站内绝对路径。
 * 拒绝 javascript: / data: 等可执行协议 —— 封面会直接进 <img src>。
 */
export function isSafeCoverUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false
  const s = url.trim()
  if (s.startsWith('/')) return !s.startsWith('//')
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 规范化主题/合集的编辑输入。
 *
 * @param {object} input
 * @param {'theme'|'collection'} kind
 * @returns {{ok:true, content:object} | {ok:false, errors:Array<{code:string,detail?:string}>}}
 */
export function normalizeContentInput(input, kind = 'theme') {
  if (!isPlainObject(input)) return { ok: false, errors: [{ code: CONTENT_ERRORS.NOT_OBJECT }] }
  const errors = []

  const rawSlug = typeof input.slug === 'string' ? input.slug.trim() : ''
  const slug = normalizeSlug(rawSlug)
  if (!rawSlug) errors.push({ code: CONTENT_ERRORS.SLUG_REQUIRED })
  else if (!slug || !SLUG_RE.test(slug)) errors.push({ code: CONTENT_ERRORS.SLUG_INVALID })

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) errors.push({ code: CONTENT_ERRORS.TITLE_REQUIRED })
  else if (title.length > MAX_TITLE_LENGTH) errors.push({ code: CONTENT_ERRORS.TITLE_TOO_LONG })

  const status = input.status === undefined ? CONTENT_STATUS.DRAFT : input.status
  if (!Object.values(CONTENT_STATUS).includes(status)) {
    errors.push({ code: CONTENT_ERRORS.INVALID_STATUS })
  }

  let sortOrder = 0
  if (input.sortOrder !== undefined && input.sortOrder !== null && input.sortOrder !== '') {
    const n = Number(input.sortOrder)
    if (!Number.isFinite(n)) errors.push({ code: CONTENT_ERRORS.INVALID_SORT_ORDER })
    else sortOrder = Math.trunc(n)
  }

  const coverUrl = trimOrNull(input.coverUrl, 2048)
  if (coverUrl && !isSafeCoverUrl(coverUrl)) {
    errors.push({ code: CONTENT_ERRORS.INVALID_COVER_URL })
  }

  if (errors.length > 0) return { ok: false, errors }

  const translations = {}
  for (const lang of TRANSLATION_LANGS) {
    const t = isPlainObject(input.translations?.[lang]) ? input.translations[lang] : {}
    const entry = {
      title: trimOrNull(t.title, MAX_TITLE_LENGTH),
      description: trimOrNull(t.description, MAX_DESCRIPTION_LENGTH),
    }
    if (kind === 'collection') {
      entry.curationNote = trimOrNull(t.curationNote, MAX_CURATION_NOTE_LENGTH)
    }
    translations[lang] = entry
  }

  return {
    ok: true,
    content: {
      slug,
      title,
      description: trimOrNull(input.description, MAX_DESCRIPTION_LENGTH),
      ...(kind === 'collection'
        ? { curationNote: trimOrNull(input.curationNote, MAX_CURATION_NOTE_LENGTH) }
        : {}),
      coverUrl,
      status,
      isFeatured: !!input.isFeatured,
      sortOrder,
      translations,
    },
  }
}

/** UI 对象 → 数据库行(写入用) */
export function contentToRow(content, kind = 'theme') {
  const row = {
    slug: content.slug,
    title: content.title,
    description: content.description || null,
    cover_url: content.coverUrl || null,
    status: content.status || CONTENT_STATUS.DRAFT,
    is_featured: !!content.isFeatured,
    sort_order: Number.isFinite(Number(content.sortOrder)) ? Number(content.sortOrder) : 0,
    updated_at: new Date().toISOString(),
  }
  if (kind === 'collection') row.curation_note = content.curationNote || null
  for (const lang of TRANSLATION_LANGS) {
    const t = content.translations?.[lang] || {}
    row[`title_${lang}`] = t.title || null
    row[`description_${lang}`] = t.description || null
    if (kind === 'collection') row[`curation_note_${lang}`] = t.curationNote || null
  }
  return row
}

/** 数据库行 → UI 对象(读取用);缺列时安全回退 */
export function rowToContent(row, kind = 'theme') {
  if (!row) return null
  const translations = {}
  for (const lang of TRANSLATION_LANGS) {
    const entry = {
      title: row[`title_${lang}`] || null,
      description: row[`description_${lang}`] || null,
    }
    if (kind === 'collection') entry.curationNote = row[`curation_note_${lang}`] || null
    translations[lang] = entry
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    ...(kind === 'collection' ? { curationNote: row.curation_note || '' } : {}),
    coverUrl: row.cover_url || '',
    status: row.status || CONTENT_STATUS.DRAFT,
    isFeatured: !!row.is_featured,
    sortOrder: Number(row.sort_order) || 0,
    translations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 当前语言下的展示文案:优先该语言翻译,缺失回退到主字段。
 * @param {object} content
 * @param {string} language - i18n 语言代码(en-US / ja-JP / ko-KR / zh-CN)
 */
export function localizedContentText(content, language) {
  if (!content) return { title: '', description: '', curationNote: '' }
  const lang = String(language || '').slice(0, 2).toLowerCase()
  const tr = TRANSLATION_LANGS.includes(lang) ? content.translations?.[lang] : null
  return {
    title: tr?.title || content.title || '',
    description: tr?.description || content.description || '',
    curationNote: tr?.curationNote || content.curationNote || '',
  }
}

/** 策展排序:精选优先,再按 sort_order 升序,最后按标题稳定排序 */
export function sortContent(list) {
  return [...(list || [])].sort((a, b) => {
    if (!!a.isFeatured !== !!b.isFeatured) return a.isFeatured ? -1 : 1
    const sa = Number(a.sortOrder) || 0
    const sb = Number(b.sortOrder) || 0
    if (sa !== sb) return sa - sb
    return String(a.title || '').localeCompare(String(b.title || ''))
  })
}

/**
 * 内容健康检查(后台用):返回问题列表,不修改数据。
 * 覆盖规格书要求:缺封面、slug 重复、空合集、未发布误上首页、多语言缺失。
 *
 * @param {{themes:Array, collections:Array, templateIds:Set<string>|Array, links:Array<{kind,parentId,templateId}>}} input
 */
export function checkContentHealth({ themes = [], collections = [], templateIds = [], links = [] } = {}) {
  const issues = []
  const knownTemplates = templateIds instanceof Set ? templateIds : new Set((templateIds || []).map(String))
  const seenSlugs = new Map()

  for (const [kind, list] of [['theme', themes], ['collection', collections]]) {
    for (const item of list || []) {
      const slugKey = `${kind}:${String(item.slug || '').toLowerCase()}`
      if (seenSlugs.has(slugKey)) {
        issues.push({ code: 'duplicateSlug', kind, id: item.id, detail: item.slug })
      } else {
        seenSlugs.set(slugKey, item.id)
      }
      if (!item.coverUrl) issues.push({ code: 'missingCover', kind, id: item.id, detail: item.slug })
      if (item.status === CONTENT_STATUS.PUBLISHED && item.isFeatured && !item.title) {
        issues.push({ code: 'featuredWithoutTitle', kind, id: item.id })
      }
      for (const lang of TRANSLATION_LANGS) {
        if (!item.translations?.[lang]?.title) {
          issues.push({ code: 'missingTranslation', kind, id: item.id, detail: lang })
        }
      }
    }
  }

  // 关联:空父对象 / 引用不存在的模板
  const byKind = { theme: new Map(), collection: new Map() }
  for (const item of themes || []) byKind.theme.set(String(item.id), item)
  for (const item of collections || []) byKind.collection.set(String(item.id), item)

  const linkCounts = new Map()
  for (const link of links || []) {
    const parent = byKind[link.kind]?.get(String(link.parentId))
    if (!parent) {
      issues.push({ code: 'orphanLink', kind: link.kind, id: link.parentId, detail: link.templateId })
      continue
    }
    if (knownTemplates.size > 0 && !knownTemplates.has(String(link.templateId))) {
      issues.push({ code: 'missingTemplate', kind: link.kind, id: link.parentId, detail: link.templateId })
    }
    const key = `${link.kind}:${link.parentId}`
    linkCounts.set(key, (linkCounts.get(key) || 0) + 1)
  }
  for (const [kind, map] of Object.entries(byKind)) {
    for (const item of map.values()) {
      if (item.status === CONTENT_STATUS.PUBLISHED && !(linkCounts.get(`${kind}:${item.id}`) > 0)) {
        issues.push({ code: 'emptyPublished', kind, id: item.id, detail: item.slug })
      }
    }
  }

  return issues
}

/** 健康问题 → 稳定的 i18n key 后缀(组件负责翻译) */
export const HEALTH_ISSUE_KEYS = Object.freeze({
  duplicateSlug: 'duplicateSlug',
  missingCover: 'missingCover',
  featuredWithoutTitle: 'featuredWithoutTitle',
  missingTranslation: 'missingTranslation',
  orphanLink: 'orphanLink',
  missingTemplate: 'missingTemplate',
  emptyPublished: 'emptyPublished',
})

// ── 首页区块配置(0026)────────────────────────────────────────
/**
 * 区块类型。`theme` / `collection` 是「单个对象独立成区块」,
 * 其余是聚合型区块(featured / popular / latest / themes / collections)。
 */
export const HOME_SECTION_KINDS = Object.freeze([
  'featured', 'popular', 'latest', 'themes', 'collections', 'theme', 'collection',
])

/** 需要 source_id 的区块类型 */
export const HOME_SECTION_SOURCE_KINDS = Object.freeze(['theme', 'collection'])

export const HOME_SECTION_ERRORS = Object.freeze({
  INVALID_KIND: 'invalidKind',
  MISSING_SOURCE: 'missingSource',
  UNEXPECTED_SOURCE: 'unexpectedSource',
  INVALID_LIMIT: 'invalidLimit',
  INVALID_SORT_ORDER: 'invalidSortOrder',
})

export const DEFAULT_SECTION_LIMIT = 12
export const MAX_SECTION_LIMIT = 50

/** 未配置时的默认区块顺序:与 0022 时代的首页行为一致 */
export const DEFAULT_HOME_SECTIONS = Object.freeze([
  { kind: 'featured', limitCount: DEFAULT_SECTION_LIMIT, isEnabled: true, sortOrder: 0 },
  { kind: 'popular', limitCount: DEFAULT_SECTION_LIMIT, isEnabled: true, sortOrder: 1 },
  { kind: 'latest', limitCount: DEFAULT_SECTION_LIMIT, isEnabled: true, sortOrder: 2 },
  { kind: 'themes', limitCount: DEFAULT_SECTION_LIMIT, isEnabled: true, sortOrder: 3 },
  { kind: 'collections', limitCount: DEFAULT_SECTION_LIMIT, isEnabled: true, sortOrder: 4 },
])

function optionalText(v, max) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

/**
 * 规范化首页区块输入。
 *
 * @param {object} input
 * @returns {{ok:true, section:object} | {ok:false, errors:Array<{code:string,detail?:string}>}}
 */
export function normalizeHomeSectionInput(input) {
  if (!isPlainObject(input)) return { ok: false, errors: [{ code: CONTENT_ERRORS.NOT_OBJECT }] }
  const errors = []

  const kind = typeof input.kind === 'string' ? input.kind.trim() : ''
  if (!HOME_SECTION_KINDS.includes(kind)) {
    errors.push({ code: HOME_SECTION_ERRORS.INVALID_KIND, detail: kind })
  }

  const needsSource = HOME_SECTION_SOURCE_KINDS.includes(kind)
  const sourceId = input.sourceId == null || input.sourceId === '' ? null : String(input.sourceId)
  if (needsSource && !sourceId) errors.push({ code: HOME_SECTION_ERRORS.MISSING_SOURCE, detail: kind })
  if (!needsSource && sourceId) errors.push({ code: HOME_SECTION_ERRORS.UNEXPECTED_SOURCE, detail: kind })

  let limitCount = DEFAULT_SECTION_LIMIT
  if (input.limitCount !== undefined && input.limitCount !== null && input.limitCount !== '') {
    const n = Number(input.limitCount)
    if (!Number.isFinite(n) || Math.trunc(n) < 1 || Math.trunc(n) > MAX_SECTION_LIMIT) {
      errors.push({ code: HOME_SECTION_ERRORS.INVALID_LIMIT, detail: String(input.limitCount) })
    } else {
      limitCount = Math.trunc(n)
    }
  }

  let sortOrder = 0
  if (input.sortOrder !== undefined && input.sortOrder !== null && input.sortOrder !== '') {
    const n = Number(input.sortOrder)
    if (!Number.isFinite(n)) errors.push({ code: HOME_SECTION_ERRORS.INVALID_SORT_ORDER })
    else sortOrder = Math.trunc(n)
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    section: {
      kind,
      sourceId,
      title: optionalText(input.title, MAX_TITLE_LENGTH),
      subtitle: optionalText(input.subtitle, MAX_DESCRIPTION_LENGTH),
      limitCount,
      isEnabled: input.isEnabled === undefined ? true : !!input.isEnabled,
      sortOrder,
    },
  }
}

/** UI 对象 → 数据库行 */
export function homeSectionToRow(section) {
  return {
    kind: section.kind,
    source_id: section.sourceId || null,
    title: section.title || null,
    subtitle: section.subtitle || null,
    limit_count: Number(section.limitCount) || DEFAULT_SECTION_LIMIT,
    is_enabled: section.isEnabled !== false,
    sort_order: Number(section.sortOrder) || 0,
    updated_at: new Date().toISOString(),
  }
}

/** 数据库行 → UI 对象 */
export function rowToHomeSection(row) {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    sourceId: row.source_id || null,
    title: row.title || '',
    subtitle: row.subtitle || '',
    limitCount: Number(row.limit_count) || DEFAULT_SECTION_LIMIT,
    isEnabled: row.is_enabled !== false,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 把配置行整理成「按 sort_order 排序、只含启用项」的区块列表。
 * 无配置时返回 DEFAULT_HOME_SECTIONS 的副本 —— 保证未执行迁移的项目行为不变。
 *
 * 注意:这里不做「对象是否已发布」的判断(那是渲染层的事);
 * 配置引用了草稿时,渲染层会得到空内容并跳过该区块。
 *
 * @param {Array} sections
 * @returns {Array<{kind:string, sourceId:string|null, title:string, subtitle:string,
 *                  limitCount:number, isEnabled:boolean, sortOrder:number}>}
 */
export function resolveHomeSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return DEFAULT_HOME_SECTIONS.map((s) => ({ ...s, sourceId: null, title: '', subtitle: '' }))
  }
  return [...sections]
    .filter((s) => s && s.isEnabled !== false)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
}
