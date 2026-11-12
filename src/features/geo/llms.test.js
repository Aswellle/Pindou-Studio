import { describe, it, expect } from 'vitest'
import { GALLERY_CATEGORY_META, categoryPagePath } from '../gallery/categoryMeta'
import { PALETTE_LIST } from '../../data/palettes/index'
import { TUTORIALS_ZH } from '../../data/tutorials.zh'
import { faqItemsFor } from '../../data/faq'
import { SITE, buildLlmsTxt, buildLlmsFullTxt, llmsFacts } from './llms'

const CORE_PATHS = [
  '/',
  '/create/image',
  '/gallery',
  '/bead-patterns',
  '/pixel-art',
  '/tutorials',
  '/faq',
  '/colors',
  '/ironing',
  '/bead-calculator',
]

describe('buildLlmsTxt', () => {
  it('收录所有核心页、品牌色卡与图库分类', () => {
    const text = buildLlmsTxt()
    for (const pathname of CORE_PATHS) {
      expect(text).toContain(`${SITE}${pathname}`)
    }
    for (const palette of PALETTE_LIST) {
      expect(text).toContain(`${SITE}/colors/${palette.id}`)
    }
    for (const meta of GALLERY_CATEGORY_META) {
      expect(text).toContain(`${SITE}${categoryPagePath(meta.slug)}`)
    }
  })

  it('只使用规范裸路径,不把 ?lang= 当可收录变体', () => {
    const text = buildLlmsTxt()
    expect(text).not.toContain('?lang=')
    expect(text).toContain(`${SITE}/llms-full.txt`)
    expect(text).toContain(`${SITE}/sitemap.xml`)
    expect(text).toContain(`${SITE}/robots.txt`)
  })

  it('保持在 llmstxt.org 建议的 10KB 以内', () => {
    expect(Buffer.byteLength(buildLlmsTxt(), 'utf8')).toBeLessThan(10 * 1024)
  })

  it('输出稳定,内容更新不会造成无意义抖动', () => {
    expect(buildLlmsTxt()).toBe(buildLlmsTxt())
  })
})

describe('buildLlmsFullTxt', () => {
  it('展开全部 FAQ 问答、教程标题与品牌事实', () => {
    const text = buildLlmsFullTxt()
    for (const item of faqItemsFor('zh')) {
      expect(text).toContain(item.question)
      expect(text).toContain(item.answer)
    }
    for (const section of TUTORIALS_ZH) {
      for (const article of section.children || []) {
        expect(text).toContain(article.title)
      }
    }
    for (const palette of PALETTE_LIST) {
      expect(text).toContain(`${palette.colors.length}`)
    }
  })

  it('不包含查询参数变体,并指向 sitemap', () => {
    const text = buildLlmsFullTxt()
    expect(text).not.toContain('?lang=')
    expect(text).toContain(`${SITE}/sitemap.xml`)
  })
})

describe('llmsFacts', () => {
  it('与站内数据规模一致', () => {
    expect(llmsFacts()).toEqual({
      faqCount: 16,
      brandCount: 6,
      categoryCount: 11,
      tutorialCount: 18,
    })
  })
})
