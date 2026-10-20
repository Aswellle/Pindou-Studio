import { describe, it, expect, vi } from 'vitest'
import { createGalleryContentStore } from './galleryContentStore'

/**
 * 云端策展仓库的协议测试(不连真实 Supabase)。
 * 验证发给 PostgREST 的查询/写入形状;真实的 RLS 可见性(草稿不可见)
 * 需要双账号测试实例,本仓库没有 —— 交付说明里标为未验证。
 */

function fakeClient({ data = null, error = null } = {}) {
  const calls = []
  const makeBuilder = (table) => {
    const op = { table, method: null, payload: null, filters: [], single: false }
    const builder = {
      insert(payload) { op.method = 'insert'; op.payload = payload; return builder },
      update(payload) { op.method = 'update'; op.payload = payload; return builder },
      delete() { op.method = 'delete'; return builder },
      select() { if (!op.method) op.method = 'select'; return builder },
      eq(col, val) { op.filters.push([col, val]); return builder },
      order() { return builder },
      single() { op.single = true; return builder },
      then(resolve, reject) {
        calls.push(op)
        let payload = data
        if (!error && payload !== null && !Array.isArray(payload) && !op.single) payload = [payload]
        return Promise.resolve(error ? { data: null, error } : { data: payload, error: null }).then(resolve, reject)
      },
    }
    return builder
  }
  return { calls, from(table) { return makeBuilder(table) } }
}

describe('galleryContentStore · 读取', () => {
  it('load 并行拉取四张表并映射为 camelCase', async () => {
    const rows = {
      gallery_themes: [{ id: 't1', slug: 'spring', title: '春天', status: 'published', sort_order: 2, is_featured: true, title_en: 'Spring' }],
      gallery_collections: [{ id: 'c1', slug: 'pets', title: '宠物', status: 'draft', sort_order: 0, curation_note: '策展' }],
      gallery_theme_templates: [{ theme_id: 't1', template_id: 'tpl-1', sort_order: 0 }],
      gallery_collection_templates: [],
    }
    const client = {
      from(table) {
        const builder = {
          select() { return builder },
          order() { return builder },
          then(resolve) { return Promise.resolve({ data: rows[table], error: null }).then(resolve) },
        }
        return builder
      },
    }
    const store = createGalleryContentStore(client)
    const data = await store.load()
    expect(data.themes[0]).toMatchObject({ id: 't1', slug: 'spring', isFeatured: true, sortOrder: 2 })
    expect(data.themes[0].translations.en.title).toBe('Spring')
    expect(data.collections[0]).toMatchObject({ id: 'c1', curationNote: '策展' })
    expect(data.themeLinks).toHaveLength(1)
    expect(data.collectionLinks).toHaveLength(0)
  })

  it('表不存在等数据库错误向上抛出,由调用方降级', async () => {
    const client = fakeClient({ error: { message: 'relation "gallery_themes" does not exist' } })
    const store = createGalleryContentStore(client)
    await expect(store.load()).rejects.toMatchObject({ message: expect.stringContaining('does not exist') })
    expect(store.takeError().detail).toContain('does not exist')
  })

  it('未配置云端时 load 返回空集合', async () => {
    const store = createGalleryContentStore(null)
    expect(store.enabled).toBe(false)
    await expect(store.load()).resolves.toEqual({
      themes: [], collections: [], themeLinks: [], collectionLinks: [],
      homeSections: [], themeChildren: [], themeCollections: [],
    })
  })
})

describe('galleryContentStore · 写入', () => {
  it('createContent 写入规范化的 snake_case 行', async () => {
    const client = fakeClient({
      data: { id: 't1', slug: 'spring', title: '春天', status: 'draft', sort_order: 0, is_featured: false },
    })
    const store = createGalleryContentStore(client)
    const res = await store.createContent('theme', { slug: 'Spring!', title: ' 春天 ' })
    expect(res.ok).toBe(true)
    expect(client.calls[0].table).toBe('gallery_themes')
    expect(client.calls[0].payload).toMatchObject({ slug: 'spring', title: '春天', status: 'draft' })
  })

  it('校验失败不发请求', async () => {
    const client = fakeClient()
    const store = createGalleryContentStore(client)
    const res = await store.createContent('theme', { slug: '', title: '' })
    expect(res.ok).toBe(false)
    expect(client.calls).toHaveLength(0)
  })

  it('未知 kind 被拒绝', async () => {
    const store = createGalleryContentStore(fakeClient())
    expect((await store.deleteContent('bogus', 'x')).errors[0].code).toBe('invalidKind')
  })

  it('setLinks 先删后插,并按数组顺序写 sort_order', async () => {
    const client = fakeClient({ data: [] })
    const store = createGalleryContentStore(client)
    const res = await store.setLinks('collection', 'c1', ['tpl-2', 'tpl-1', 'tpl-2'])
    expect(res.ok).toBe(true)
    expect(client.calls[0]).toMatchObject({ table: 'gallery_collection_templates', method: 'delete' })
    expect(client.calls[0].filters).toEqual([['collection_id', 'c1']])
    const insert = client.calls.find((c) => c.method === 'insert')
    expect(insert.payload).toEqual([
      { collection_id: 'c1', template_id: 'tpl-2', sort_order: 0 },
      { collection_id: 'c1', template_id: 'tpl-1', sort_order: 1 },
    ])
  })

  it('setLinks 传空数组只清空关联,不再 insert', async () => {
    const client = fakeClient({ data: [] })
    const store = createGalleryContentStore(client)
    const res = await store.setLinks('theme', 't1', [])
    expect(res.ok).toBe(true)
    expect(client.calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('数据库错误返回 { ok:false } 并记录原因', async () => {
    const client = fakeClient({ error: { message: 'new row violates row-level security policy' } })
    const store = createGalleryContentStore(client)
    const res = await store.updateContent('theme', 't1', { slug: 'a', title: 'A' })
    expect(res.ok).toBe(false)
    expect(res.errors[0].code).toBe('cloud')
    expect(store.takeError().detail).toMatch(/row-level security/)
  })

  it('未配置云端时写入返回 cloudNotConfigured', async () => {
    const store = createGalleryContentStore(null)
    expect((await store.createContent('theme', { slug: 'a', title: 'A' })).errors[0].code).toBe('cloudNotConfigured')
    expect((await store.setLinks('theme', 't1', [])).errors[0].code).toBe('cloudNotConfigured')
  })
})
