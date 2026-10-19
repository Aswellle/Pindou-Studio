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
} from './contentModel'

const TABLES = {
  theme: 'gallery_themes',
  collection: 'gallery_collections',
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
        return { themes: [], collections: [], themeLinks: [], collectionLinks: [] }
      },
      async createContent() { return fail([{ code: 'cloudNotConfigured' }]) },
      async updateContent() { return fail([{ code: 'cloudNotConfigured' }]) },
      async deleteContent() { return fail([{ code: 'cloudNotConfigured' }]) },
      async setLinks() { return fail([{ code: 'cloudNotConfigured' }]) },
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
      const [themes, collections, themeLinks, collectionLinks] = await Promise.all([
        listOf(TABLES.theme, 'sort_order'),
        listOf(TABLES.collection, 'sort_order'),
        listOf(LINK_TABLES.theme.table, 'sort_order'),
        listOf(LINK_TABLES.collection.table, 'sort_order'),
      ])
      return {
        themes: themes.map((row) => rowToContent(row, 'theme')),
        collections: collections.map((row) => rowToContent(row, 'collection')),
        themeLinks,
        collectionLinks,
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
  }
}
