import { describe, it, expect } from 'vitest'
import {
  CREATE_IMAGE_SEO,
  FAQ_SEO,
  GALLERY_SEO,
  HOME_SEO,
  PRIVACY_SEO,
  TERMS_SEO,
  TUTORIALS_SEO,
} from './staticSeo'

const PAGES = {
  HOME_SEO,
  GALLERY_SEO,
  TUTORIALS_SEO,
  FAQ_SEO,
  CREATE_IMAGE_SEO,
  PRIVACY_SEO,
  TERMS_SEO,
}

describe('staticSeo · 索引型静态页 meta', () => {
  it('标题长度不超过 40 字', () => {
    for (const [name, seo] of Object.entries(PAGES)) {
      expect([...seo.title].length, name).toBeLessThanOrEqual(40)
      expect(seo.title, name).toContain('拼豆Studio')
    }
  })

  it('描述统一落在 Bing 建议的 150–160 字符', () => {
    for (const [name, seo] of Object.entries(PAGES)) {
      const len = [...seo.desc].length
      expect(len, name).toBeGreaterThanOrEqual(150)
      expect(len, name).toBeLessThanOrEqual(160)
    }
  })

  it('各页描述互不相同,不互相竞争同一段文案', () => {
    const descs = Object.values(PAGES).map(seo => seo.desc)
    expect(new Set(descs).size).toBe(descs.length)
  })
})
