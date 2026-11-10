import { describe, it, expect } from 'vitest'
import {
  FAQ_ITEMS,
  FAQ_PAGE_TEXT,
  faqItemsFor,
  faqPageTextFor,
  normalizeFaqLanguage,
} from './faq'

const LANGS = ['zh', 'en', 'ja', 'ko']

describe('faq · 四语言内容源', () => {
  it('每条问答在四种语言下都有非空文案', () => {
    for (const item of FAQ_ITEMS) {
      for (const lang of LANGS) {
        expect(item.q[lang]?.trim(), `${item.id}.q.${lang}`).toBeTruthy()
        expect(item.a[lang]?.trim(), `${item.id}.a.${lang}`).toBeTruthy()
      }
    }
  })

  it('id 唯一', () => {
    const ids = FAQ_ITEMS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('语言码归一化到 zh / en / ja / ko', () => {
    expect(normalizeFaqLanguage('zh-CN')).toBe('zh')
    expect(normalizeFaqLanguage('en-US')).toBe('en')
    expect(normalizeFaqLanguage('ja-JP')).toBe('ja')
    expect(normalizeFaqLanguage('ko-KR')).toBe('ko')
    expect(normalizeFaqLanguage('fr-FR')).toBe('zh')
    expect(normalizeFaqLanguage(undefined)).toBe('zh')
  })

  it('按语言返回扁平问答列表', () => {
    const items = faqItemsFor('en-US')
    expect(items).toHaveLength(FAQ_ITEMS.length)
    expect(items[0].question).toBe(FAQ_ITEMS[0].q.en)
    expect(items[0].answer).toBe(FAQ_ITEMS[0].a.en)
    expect(items[0]).not.toHaveProperty('q')
  })

  it('页面文案在各语言下完整', () => {
    for (const lang of LANGS) {
      expect(FAQ_PAGE_TEXT[lang].title).toBeTruthy()
      expect(FAQ_PAGE_TEXT[lang].intro).toBeTruthy()
      expect(FAQ_PAGE_TEXT[lang].links.create).toBeTruthy()
      expect(FAQ_PAGE_TEXT[lang].links.gallery).toBeTruthy()
      expect(FAQ_PAGE_TEXT[lang].links.tutorials).toBeTruthy()
      expect(FAQ_PAGE_TEXT[lang].links.contact).toBeTruthy()
    }
    expect(faqPageTextFor('ja-JP')).toBe(FAQ_PAGE_TEXT.ja)
  })
})
