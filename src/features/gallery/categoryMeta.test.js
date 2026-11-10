import { describe, it, expect } from 'vitest'
import {
  GALLERY_CATEGORY_META,
  categoryPagePath,
  categorySeo,
  resolveCategoryByRaw,
  resolveCategoryBySlug,
} from './categoryMeta'

describe('categoryMeta · 分类聚合页映射', () => {
  it('slug 与 raw 都唯一', () => {
    const slugs = GALLERY_CATEGORY_META.map((item) => item.slug)
    const raws = GALLERY_CATEGORY_META.map((item) => item.raw)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(raws).size).toBe(raws.length)
  })

  it('按 slug / raw 都能解析到同一项', () => {
    expect(resolveCategoryBySlug('animal')?.raw).toBe('animal')
    expect(resolveCategoryByRaw('animal')?.slug).toBe('animal')
    expect(resolveCategoryBySlug('cartoon')?.raw).toBe('卡通')
    expect(resolveCategoryByRaw('卡通')?.slug).toBe('cartoon')
  })

  it('未知值返回 null,不猜测', () => {
    expect(resolveCategoryBySlug('nope')).toBeNull()
    expect(resolveCategoryByRaw('nope')).toBeNull()
    expect(resolveCategoryBySlug('')).toBeNull()
    expect(resolveCategoryByRaw(null)).toBeNull()
  })

  it('路径统一编码,SEO 文案含分类名', () => {
    expect(categoryPagePath('plant')).toBe('/gallery/category/plant')
    const meta = resolveCategoryBySlug('animal')
    const seo = categorySeo(meta)
    expect(seo.title).toContain('动物')
    expect(seo.title).toContain('拼豆Studio')
    expect(seo.desc).toContain('动物')
  })

  it('无 meta 时不生成 SEO 文案', () => {
    expect(categorySeo(null)).toBeNull()
  })
})
