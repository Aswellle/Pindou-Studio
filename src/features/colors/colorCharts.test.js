import { describe, it, expect } from 'vitest'
import { PALETTE_LIST } from '../../data/palettes/index.js'
import {
  BRAND_INTROS,
  COLOR_CHARTS_SEO,
  brandSeo,
  colorBrands,
  colorChartPath,
  colorGroups,
  groupLabel,
  resolveColorBrand,
} from './colorCharts'

describe('colorCharts · 路由与数据', () => {
  it('六个品牌都能解析,未知 slug 返回 null', () => {
    for (const palette of PALETTE_LIST) {
      expect(resolveColorBrand(palette.id)?.id).toBe(palette.id)
    }
    expect(resolveColorBrand('unknown')).toBe(null)
    expect(resolveColorBrand('')).toBe(null)
    expect(resolveColorBrand(null)).toBe(null)
  })

  it('路径形如 /colors/<id>', () => {
    expect(colorChartPath('perler')).toBe('/colors/perler')
  })

  it('品牌列表与色板顺序一致,色号数从数据派生', () => {
    expect(colorBrands().map((b) => b.id)).toEqual(PALETTE_LIST.map((p) => p.id))
    for (const brand of colorBrands()) {
      expect(brand.colorCount).toBe(brand.palette.colors.length)
    }
  })
})

describe('colorGroups · 分组完整性', () => {
  it('每个品牌的分组颜色数之和等于总色数(不吞颜色)', () => {
    for (const palette of PALETTE_LIST) {
      const total = colorGroups(palette).reduce((n, group) => n + group.colors.length, 0)
      expect(total, palette.id).toBe(palette.colors.length)
    }
  })

  it('有色系名称的品牌按 groupOrder 排序', () => {
    const mard = resolveColorBrand('mard')
    const keys = colorGroups(mard).map((g) => g.key)
    expect(keys.slice(0, 6)).toEqual(['H', 'E', 'B', 'C', 'A', 'F'])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('没有色系名称的品牌平铺为一个无标题分组', () => {
    const perler = resolveColorBrand('perler')
    const groups = colorGroups(perler)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe(null)
    expect(groups[0].colors).toHaveLength(perler.colors.length)
  })

  it('groupLabel 缺名称时退回色系字母', () => {
    const mard = resolveColorBrand('mard')
    expect(groupLabel(mard, 'A')).toBe(mard.groupNames.A)
    expect(groupLabel({ groupNames: {} }, 'Z')).toBe('Z')
    expect(groupLabel(mard, null)).toBe('')
  })

  it('异常数据安全:无 colors 时返回空分组', () => {
    expect(colorGroups(null)).toEqual([{ key: null, colors: [] }])
    expect(colorGroups({ colors: null })).toEqual([{ key: null, colors: [] }])
  })
})

describe('色卡页 SEO 文案', () => {
  it('总览页标题与描述在长度约束内', () => {
    expect(COLOR_CHARTS_SEO.title.length).toBeLessThanOrEqual(40)
    expect(COLOR_CHARTS_SEO.desc.length).toBeGreaterThan(40)
    expect(COLOR_CHARTS_SEO.desc.length).toBeLessThanOrEqual(90)
  })

  it('每个品牌页标题/描述唯一且带色号数量', () => {
    const titles = new Set()
    const descs = new Set()
    for (const palette of PALETTE_LIST) {
      const seo = brandSeo(palette)
      titles.add(seo.title)
      descs.add(seo.desc)
      expect(seo.title).toContain(String(palette.colors.length))
      expect(seo.title.length).toBeLessThanOrEqual(40)
      expect(seo.desc.length).toBeLessThanOrEqual(90)
      expect(seo.desc).toContain(String(palette.colors.length))
    }
    // 六个页面不能互相竞争同一段标题描述
    expect(titles.size).toBe(PALETTE_LIST.length)
    expect(descs.size).toBe(PALETTE_LIST.length)
  })

  it('每个品牌都有独立简介(与 SEO 维护约定同口径)', () => {
    const seen = new Set()
    for (const palette of PALETTE_LIST) {
      const intro = BRAND_INTROS[palette.id]
      expect(intro, palette.id).toBeTruthy()
      expect(intro.length, palette.id).toBeGreaterThanOrEqual(40)
      expect(seen.has(intro), palette.id).toBe(false)
      seen.add(intro)
    }
  })
})
