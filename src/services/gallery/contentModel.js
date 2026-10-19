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
