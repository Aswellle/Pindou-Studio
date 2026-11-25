import { describe, it, expect } from 'vitest'
import { TUTORIALS_ZH } from '../data/tutorials.zh'
import { tutorialSeoDescription } from './tutorialSeo'

const articles = TUTORIALS_ZH.flatMap(section =>
  (section.children || []).map(article => ({ article, section }))
)

describe('tutorialSeoDescription', () => {
  it('18 篇文章的描述都落在 150–160 字符', () => {
    expect(articles).toHaveLength(18)
    for (const { article, section } of articles) {
      const desc = tutorialSeoDescription(article, section.title)
      expect([...desc].length, article.id).toBeGreaterThanOrEqual(150)
      expect([...desc].length, article.id).toBeLessThanOrEqual(160)
      expect(desc, article.id).toContain(section.title)
    }
  })

  it('每篇文章描述互不相同(18 个页面不能共用同一段)', () => {
    const descs = articles.map(({ article, section }) => tutorialSeoDescription(article, section.title))
    expect(new Set(descs).size).toBe(descs.length)
  })

  it('没有正文段落时用标题兜底,长度仍然达标', () => {
    const desc = tutorialSeoDescription({ title: '测试文章', blocks: [] }, '入门指南')
    expect(desc).toContain('测试文章')
    expect([...desc].length).toBeGreaterThanOrEqual(150)
    expect([...desc].length).toBeLessThanOrEqual(160)
  })

  it('缺标题返回空字符串', () => {
    expect(tutorialSeoDescription(null)).toBe('')
    expect(tutorialSeoDescription({ blocks: [] })).toBe('')
  })
})
