/**
 * 图库发现页的纯函数:把「模板列表 + 策展内容」组装成首页各区块。
 *
 * 设计约束(对应 docs/agent-spec/07 §3/§7):
 *   - 不制造数据:内置模板没有创建时间,就不参与「最新」;下载量为 0 的不进「热门」;
 *   - 策展区块只使用已发布对象(即使管理员在公开图库页看,也按公开规则);
 *   - 关联里引用的模板被删除时跳过,不抛错、不显示空白卡片;
 *   - 所有区块都可能为空,由 UI 决定是否渲染。
 */

import {
  CONTENT_STATUS,
  DEFAULT_HOME_SECTIONS,
  DEFAULT_SECTION_LIMIT,
} from '../../services/gallery/contentModel'

export const RAIL_LIMIT = 12

/** 只保留已发布对象(RLS 对匿名已过滤,管理员会拿到草稿,这里再兜一层) */
export function publishedOnly(list) {
  return (list || []).filter((item) => item?.status === CONTENT_STATUS.PUBLISHED)
}

/**
 * 按 id 顺序解析模板,跳过已删除的引用。
 * @returns {{ templates: Array, missing: number }}
 */
export function resolveTemplatesByIds(allTemplates, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { templates: [], missing: 0 }
  const byId = new Map((allTemplates || []).map((t) => [String(t.id), t]))
  const templates = []
  let missing = 0
  for (const id of ids) {
    const found = byId.get(String(id))
    if (found) templates.push(found)
    else missing++
  }
  return { templates, missing }
}

export function templateById(allTemplates, id) {
  if (id === null || id === undefined) return null
  return (allTemplates || []).find((t) => String(t.id) === String(id)) || null
}

/**
 * 热门:按真实下载量降序,0 下载不进入(避免用随机顺序冒充热门)。
 * 同量时保持原列表顺序(稳定排序),不引入随机性。
 *
 * @param {Array} templates
 * @param {(t:object)=>number} countOf
 */
export function pickPopular(templates, countOf, limit = RAIL_LIMIT) {
  return (templates || [])
    .map((template, index) => ({ template, index, count: Number(countOf?.(template)) || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => (b.count - a.count) || (a.index - b.index))
    .slice(0, limit)
    .map((x) => x.template)
}

/**
 * 最新:只取有可信创建时间的模板(云端 created_at),按时间降序。
 * 内置模板没有时间戳 → 不参与,绝不用数组下标伪装「最新」。
 */
export function pickLatest(templates, limit = RAIL_LIMIT) {
  return (templates || [])
    .filter((t) => {
      if (!t?.createdAt) return false
      const d = new Date(t.createdAt)
      return !Number.isNaN(d.getTime())
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
}

/**
 * 首页精选:优先取 isFeatured 的主题/合集,没有则取排序后的第一个已发布对象。
 * 返回 null 表示不渲染该区块(不凭空造精选)。
 */
export function pickFeatured(list) {
  const published = publishedOnly(list)
  return published.find((item) => item.isFeatured) || null
}

/**
 * 组装发现页区块。
 *
 * @param {object} params
 * @param {Array} params.templates - 当前可见模板(云端或本地)
 * @param {(t:object)=>number} params.downloadCountOf
 * @param {Array} params.themes
 * @param {Array} params.collections
 * @param {Map<string,string[]>} params.themeTemplateIds
 * @param {Map<string,string[]>} params.collectionTemplateIds
 * @param {number} [params.limit]
 */
export function buildDiscoverySections({
  templates = [],
  downloadCountOf = () => 0,
  themes = [],
  collections = [],
  themeTemplateIds = new Map(),
  collectionTemplateIds = new Map(),
  homeSections = null,
  limit = RAIL_LIMIT,
} = {}) {
  const publishedThemes = publishedOnly(themes)
  const publishedCollections = publishedOnly(collections)

  const featuredTheme = pickFeatured(publishedThemes)
  const featuredCollection = pickFeatured(publishedCollections)
  const popular = pickPopular(templates, downloadCountOf, limit)
  const latest = pickLatest(templates, limit)

  // 区块配置:无配置时用默认顺序(未执行 0026 的项目行为不变)
  const configs = Array.isArray(homeSections) && homeSections.length > 0
    ? homeSections
    : DEFAULT_HOME_SECTIONS

  const byId = (list, id) => list.find((item) => String(item.id) === String(id)) || null

  /**
   * 每种区块的「内容」。
   * 返回 null 表示该区块当前无内容 —— 调用方据此整块跳过(不渲染空壳)。
   */
  const contentFor = (cfg) => {
    const n = Number(cfg.limitCount) || DEFAULT_SECTION_LIMIT
    switch (cfg.kind) {
      case 'featured':
        return (featuredTheme || featuredCollection) ? { featuredTheme, featuredCollection } : null
      case 'popular':
        return popular.length > 0 ? { templates: popular.slice(0, n) } : null
      case 'latest':
        return latest.length > 0 ? { templates: latest.slice(0, n) } : null
      case 'themes':
        return publishedThemes.length > 0 ? { themes: publishedThemes.slice(0, n) } : null
      case 'collections':
        return publishedCollections.length > 0 ? { collections: publishedCollections.slice(0, n) } : null
      case 'theme': {
        // 单个主题独立成区块:只认已发布的,配置指向草稿时不渲染
        const theme = byId(publishedThemes, cfg.sourceId)
        return theme ? { theme } : null
      }
      case 'collection': {
        const collection = byId(publishedCollections, cfg.sourceId)
        return collection ? { collection } : null
      }
      default:
        return null
    }
  }

  const blocks = []
  for (const cfg of configs) {
    if (!cfg || cfg.isEnabled === false) continue
    const content = contentFor(cfg)
    if (!content) continue
    blocks.push({ ...cfg, content })
  }

  return {
    // 兼容字段(既有调用方/测试仍在用)
    featuredTheme,
    featuredCollection,
    popular,
    latest,
    themes: publishedThemes,
    collections: publishedCollections,
    // 按后台配置排好序、已过滤空内容的区块列表
    blocks,
    // 预览缩略图:主题/合集卡片用其首个可解析模板
    themePreview: (theme) => resolveTemplatesByIds(templates, themeTemplateIds.get(theme.id) || []).templates[0] || null,
    collectionPreview: (collection) => resolveTemplatesByIds(templates, collectionTemplateIds.get(collection.id) || []).templates[0] || null,
  }
}
