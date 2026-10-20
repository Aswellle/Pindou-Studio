/**
 * 图库策展内容的云端仓库(Supabase,migration 0022)。
 *
 * 读取:
 *   - 匿名/普通用户经 RLS 只拿得到 status = 'published' 的主题/合集及其关联;
 *   - 管理员凭 is_admin() 拿到草稿与全部关联,供后台运营使用。
 *   这里不按角色拼查询条件 —— 可见性完全由 RLS 决定,避免前端过滤与数据库策略
 *   两套规则不一致。
 *
 * 写入(仅管理员,RLS 强制):主题/合集 CRUD 与关联列表整组替换。
 *
 * 所有方法返回 { ok, ... } / 抛出 load 错误,由 hook 决定降级策略。
 */

import { supabase } from '../supabase'
import {
  normalizeContentInput,
  contentToRow,
  rowToContent,
  normalizeHomeSectionInput,
  homeSectionToRow,
  rowToHomeSection,
} from './contentModel'

const TABLES = {
  theme: 'gallery_themes',
  collection: 'gallery_collections',
}

const HOME_SECTIONS_TABLE = 'gallery_home_sections'

// 主题嵌套(0027):子主题与主题下的合集
const NESTING_TABLES = {
  children: 'gallery_theme_children',
  collections: 'gallery_theme_collections',
}

const LINK_TABLES = {
  theme: { table: 'gallery_theme_templates', parentColumn: 'theme_id' },
  collection: { table: 'gallery_collection_templates', parentColumn: 'collection_id' },
}

function fail(errors) {
  return { ok: false, errors }
}

function fromDbError(error) {
  return fail([{ code: 'cloud', detail: error?.message || String(error) }])
}

function assertKind(kind) {
  return kind === 'theme' || kind === 'collection'
}

export function createGalleryContentStore(client = supabase) {
  if (!client) {
    return {
      enabled: false,
      async load() {
        return {
          themes: [], collections: [], themeLinks: [], collectionLinks: [],
          homeSections: [], themeChildren: [], themeCollections: [],
        }
      },
      async createContent() { return fail([{ code: 'cloudNotConfigured' }]) },
      async updateContent() { return fail([{ code: 'cloudNotConfigured' }]) },
      async deleteContent() { return fail([{ code: 'cloudNotConfigured' }]) },
      async setLinks() { return fail([{ code: 'cloudNotConfigured' }]) },
      async saveHomeSections() { return fail([{ code: 'cloudNotConfigured' }]) },
      async setThemeChildren() { return fail([{ code: 'cloudNotConfigured' }]) },
      async setThemeCollections() { return fail([{ code: 'cloudNotConfigured' }]) },
    }
  }

  let lastError = null
  const remember = (e) => { lastError = e; return e }

  const listOf = async (table, orderColumn) => {
    const { data, error } = await client.from(table).select('*').order(orderColumn, { ascending: true })
    if (error) {
      remember({ code: 'cloud', detail: error.message })
      throw error
    }
    return data || []
  }

  /**
   * 可选表的读取:表不存在时返回空数组,而不是让整个图库降级。
   * 用于「新迁移尚未执行」也能正常浏览的向前兼容场景。
   */
  async function listOptional(table, orderColumn) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order(orderColumn, { ascending: true })
    if (error) {
      const missingTable = error.code === '42P01'
        || error.code === 'PGRST205'
        || /does not exist|schema cache/i.test(error.message || '')
      if (missingTable) return []
      remember({ code: 'cloud', detail: error.message })
      throw error
    }
    return data || []
  }

  /**
   * 首页区块配置。表不存在(0026 未执行)时返回空数组而不是抛错 ——
   * 首页仍按默认区块渲染,后台的区块标签页会提示「云端未配置」。
   */
  async function listHomeSections() {
    const { data, error } = await client
      .from(HOME_SECTIONS_TABLE)
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) {
      // 42P01 = undefined_table;PostgREST 也返回 PGRST205
      const missingTable = error.code === '42P01'
        || error.code === 'PGRST205'
        || /does not exist|schema cache/i.test(error.message || '')
      if (missingTable) return []
      remember({ code: 'cloud', detail: error.message })
      throw error
    }
    return (data || []).map(rowToHomeSection)
  }

  return {
    enabled: true,

    takeError() {
      const e = lastError
      lastError = null
      return e
    },

    /**
     * 拉取主题、合集与两张关联表。
     * 表尚未创建(migration 0022 未执行)时 PostgREST 返回错误,由调用方展示
     * 「内容暂不可用」并继续使用旧图库 —— 不在这里静默吞掉。
     */
    async load() {
      const [themes, collections, themeLinks, collectionLinks, homeSections, themeChildren, themeCollections] =
        await Promise.all([
          listOf(TABLES.theme, 'sort_order'),
          listOf(TABLES.collection, 'sort_order'),
          listOf(LINK_TABLES.theme.table, 'sort_order'),
          listOf(LINK_TABLES.collection.table, 'sort_order'),
          // 区块配置表可能尚未创建(0026 未执行):此时不阻断整个图库,
          // 返回空数组让前端回退到默认区块。
          listHomeSections(),
          // 同理:0027 未执行时返回空数组,主题页不显示子主题区块。
          listOptional(NESTING_TABLES.children, 'sort_order'),
          listOptional(NESTING_TABLES.collections, 'sort_order'),
        ])
      return {
        themes: themes.map((row) => rowToContent(row, 'theme')),
        collections: collections.map((row) => rowToContent(row, 'collection')),
        themeLinks,
        collectionLinks,
        homeSections,
        themeChildren,
        themeCollections,
      }
    },

    async createContent(kind, input) {
      if (!assertKind(kind)) return fail([{ code: 'invalidKind' }])
      const res = normalizeContentInput(input, kind)
      if (!res.ok) return res
      const { data, error } = await client
        .from(TABLES[kind])
        .insert(contentToRow(res.content, kind))
        .select()
        .single()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, content: rowToContent(data, kind) }
    },

    async updateContent(kind, id, input) {
      if (!assertKind(kind)) return fail([{ code: 'invalidKind' }])
      const res = normalizeContentInput(input, kind)
      if (!res.ok) return res
      const { data, error } = await client
        .from(TABLES[kind])
        .update(contentToRow(res.content, kind))
        .eq('id', id)
        .select()
        .single()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, content: rowToContent(data, kind) }
    },

    async deleteContent(kind, id) {
      if (!assertKind(kind)) return fail([{ code: 'invalidKind' }])
      // 关联由 on delete cascade 清理,不复制 pattern 数据
      const { error } = await client.from(TABLES[kind]).delete().eq('id', id)
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true }
    },

    /**
     * 整组替换某主题/合集的模板关联。
     * 先删后插:关联只是策展元数据,失败时 reload 可恢复真实状态;
     * 不提供「部分成功」的假象 —— 任一步失败都返回错误。
     */
    async setLinks(kind, parentId, templateIds = []) {
      if (!assertKind(kind)) return fail([{ code: 'invalidKind' }])
      if (!parentId) return fail([{ code: 'notFound' }])
      const { table, parentColumn } = LINK_TABLES[kind]
      const ids = [...new Set((templateIds || []).map(String).filter(Boolean))]

      const del = await client.from(table).delete().eq(parentColumn, parentId)
      if (del.error) { remember({ code: 'cloud', detail: del.error.message }); return fromDbError(del.error) }
      if (ids.length === 0) return { ok: true, links: [] }

      const rows = ids.map((templateId, index) => ({
        [parentColumn]: parentId,
        template_id: templateId,
        sort_order: index,
      }))
      const { data, error } = await client.from(table).insert(rows).select()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, links: data || [] }
    },

    /**
     * 整组替换主题的子主题列表(仅两层,深度由 DB 触发器强制)。
     * 与 setLinks 同一策略:先删后插,失败不做部分成功。
     */
    async setThemeChildren(themeId, childIds = []) {
      if (!themeId) return fail([{ code: 'notFound' }])
      const ids = [...new Set((childIds || []).map(String).filter(Boolean))]
        .filter((id) => id !== String(themeId)) // 自己不能是自己的子主题
      const del = await client.from(NESTING_TABLES.children).delete().eq('parent_id', themeId)
      if (del.error) { remember({ code: 'cloud', detail: del.error.message }); return fromDbError(del.error) }
      if (ids.length === 0) return { ok: true, children: [] }
      const { data, error } = await client
        .from(NESTING_TABLES.children)
        .insert(ids.map((childId, index) => ({
          parent_id: themeId, child_id: childId, sort_order: index,
        })))
        .select()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, children: data || [] }
    },

    /** 整组替换主题关联的合集(主题页展示「相关合集」)。 */
    async setThemeCollections(themeId, collectionIds = []) {
      if (!themeId) return fail([{ code: 'notFound' }])
      const ids = [...new Set((collectionIds || []).map(String).filter(Boolean))]
      const del = await client.from(NESTING_TABLES.collections).delete().eq('theme_id', themeId)
      if (del.error) { remember({ code: 'cloud', detail: del.error.message }); return fromDbError(del.error) }
      if (ids.length === 0) return { ok: true, collections: [] }
      const { data, error } = await client
        .from(NESTING_TABLES.collections)
        .insert(ids.map((collectionId, index) => ({
          theme_id: themeId, collection_id: collectionId, sort_order: index,
        })))
        .select()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, collections: data || [] }
    },

    /**
     * 整组替换首页区块配置(后台保存)。
     * 与 setLinks 同一策略:先删后插,任一步失败都返回错误,不做部分成功的假象。
     */
    async saveHomeSections(sections = []) {
      const normalized = []
      for (let i = 0; i < sections.length; i++) {
        const res = normalizeHomeSectionInput(sections[i])
        if (!res.ok) return { ok: false, errors: res.errors.map((e) => ({ ...e, index: i })) }
        normalized.push({ ...res.section, sortOrder: i })
      }

      // PostgREST 要求 delete 必须带过滤条件;`not id is null` 等价于「删除全部」
      const del = await client.from(HOME_SECTIONS_TABLE).delete().not('id', 'is', null)
      if (del.error) {
        remember({ code: 'cloud', detail: del.error.message })
        return fromDbError(del.error)
      }
      if (normalized.length === 0) return { ok: true, sections: [] }

      const { data, error } = await client
        .from(HOME_SECTIONS_TABLE)
        .insert(normalized.map(homeSectionToRow))
        .select()
      if (error) { remember({ code: 'cloud', detail: error.message }); return fromDbError(error) }
      return { ok: true, sections: (data || []).map(rowToHomeSection) }
    },
  }
}
