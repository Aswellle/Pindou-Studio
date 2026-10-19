import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'

/**
 * useGalleryContent 的本地可测部分。
 * 真实云端由 galleryContentStore.test.js 覆盖协议形状;
 * 这里用注入的假 supabase 验证 hook 的加载/降级/排序/关联索引行为。
 */

const state = { client: null }

vi.mock('../services/supabase', () => ({
  get supabase() { return state.client },
}))

import { useGalleryContent } from './useGalleryContent'

function makeClient(rowsByTable) {
  return {
    from(table) {
      const builder = {
        select() { return builder },
        order() { return builder },
        then(resolve, reject) {
          const rows = rowsByTable[table]
          if (rows instanceof Error) return Promise.reject(rows).then(resolve, reject)
          return Promise.resolve({ data: rows ?? [], error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
}

const theme = (id, over = {}) => ({
  id, slug: `theme-${id}`, title: `主题${id}`, status: 'published', sort_order: 0,
  is_featured: false, translations: {},
  ...over,
})

beforeEach(() => { state.client = null })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('useGalleryContent', () => {
  it('云端未配置:enabled=false,不加载、不报错', async () => {
    const { result } = renderHook(() => useGalleryContent())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(false)
    expect(result.current.themes).toEqual([])
    expect(result.current.error).toBe('')
  })

  it('加载后按精选优先 + sort_order 排序', async () => {
    state.client = makeClient({
      gallery_themes: [
        { id: 'a', slug: 'a', title: 'A', status: 'published', sort_order: 1, is_featured: false },
        { id: 'b', slug: 'b', title: 'B', status: 'published', sort_order: 9, is_featured: true },
      ],
      gallery_collections: [],
      gallery_theme_templates: [],
      gallery_collection_templates: [],
    })
    const { result } = renderHook(() => useGalleryContent())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.themes.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('关联索引按 sort_order 展开为 templateId 列表', async () => {
    state.client = makeClient({
      gallery_themes: [{ id: 't1', slug: 'spring', title: '春', status: 'published', sort_order: 0, is_featured: false }],
      gallery_collections: [],
      gallery_theme_templates: [
        { theme_id: 't1', template_id: 'tpl-b', sort_order: 1 },
        { theme_id: 't1', template_id: 'tpl-a', sort_order: 0 },
      ],
      gallery_collection_templates: [],
    })
    const { result } = renderHook(() => useGalleryContent())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.themeTemplateIds.get('t1')).toEqual(['tpl-a', 'tpl-b'])
    expect(result.current.getThemeBySlug('SPRING')?.id).toBe('t1')
    expect(result.current.getThemeBySlug('nope')).toBe(null)
  })

  it('加载失败:保留空集合 + error,不抛未捕获异常', async () => {
    state.client = makeClient({
      gallery_themes: new Error('relation does not exist'),
      gallery_collections: [],
      gallery_theme_templates: [],
      gallery_collection_templates: [],
    })
    const { result } = renderHook(() => useGalleryContent())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.themes).toEqual([])
    expect(result.current.error).toMatch(/does not exist/)
  })

  it('reload 重新拉取', async () => {
    // store 在挂载时按 client 建一次;换数据应改同一 client 的返回,而不是换 client
    const rows = {
      gallery_themes: [theme('t1')],
      gallery_collections: [],
      gallery_theme_templates: [],
      gallery_collection_templates: [],
    }
    state.client = makeClient(rows)
    const { result } = renderHook(() => useGalleryContent())
    await waitFor(() => expect(result.current.themes).toHaveLength(1))
    rows.gallery_themes = [theme('t1'), theme('t2')]
    await act(async () => { result.current.reload() })
    await waitFor(() => expect(result.current.themes).toHaveLength(2))
  })
})
