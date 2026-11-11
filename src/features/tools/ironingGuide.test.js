import { describe, it, expect } from 'vitest'
import { IRONING_ARTICLE_IDS, IRONING_RULES, ironingReference, tutorialArticle } from './ironingGuide'

describe('ironingGuide · 数据同源', () => {
  it('品牌温度表与翻车表直接取自教程表格(结构完整)', () => {
    const { brandTable, failureTable } = ironingReference()
    expect(brandTable.headers).toEqual(['品牌', '熨斗档位', '特性', '适合人群'])
    expect(brandTable.rows).toHaveLength(4)
    expect(brandTable.rows[0][0]).toContain('Perler')

    expect(failureTable.headers).toEqual(['问题', '原因', '急救方法'])
    expect(failureTable.rows.length).toBeGreaterThanOrEqual(4)
  })

  it('相关教程都能解析出标题与所属章节', () => {
    const { articles } = ironingReference()
    expect(articles.map((a) => a.id)).toEqual(IRONING_ARTICLE_IDS)
    for (const article of articles) {
      expect(article.title.length).toBeGreaterThan(0)
      expect(article.sectionTitle.length).toBeGreaterThan(0)
    }
  })

  it('未知文章 id 返回 null', () => {
    expect(tutorialArticle('not-a-real-article')).toBe(null)
  })

  it('熨烫要点每条都有标题与说明', () => {
    expect(IRONING_RULES).toHaveLength(4)
    for (const [title, text] of IRONING_RULES) {
      expect(title.length).toBeGreaterThan(0)
      expect(text.length).toBeGreaterThan(20)
    }
  })
})
