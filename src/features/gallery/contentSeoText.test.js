import { describe, it, expect } from 'vitest'
import { collectionSeoDescription, patternSeoDescription, themeSeoDescription } from './contentSeoText'

const inRange = desc => {
  const len = [...desc].length
  expect(len).toBeGreaterThanOrEqual(150)
  expect(len).toBeLessThanOrEqual(160)
}

describe('patternSeoDescription', () => {
  const base = {
    name: '小鸭',
    width: 29,
    height: 29,
    beads: 502,
    colorCount: 4,
    difficulty: 'easy',
    categoryLabel: '动物',
    brandLabel: 'Perler 拼豆',
  }

  it('包含名称、尺寸、豆数、颜色数与品牌,长度 150–160', () => {
    const desc = patternSeoDescription(base)
    expect(desc).toContain('小鸭')
    expect(desc).toContain('29×29')
    expect(desc).toContain('502 颗豆子')
    expect(desc).toContain('4 种颜色')
    expect(desc).toContain('Perler 拼豆')
    inRange(desc)
  })

  it('超短名字 + 未知分类 + 无品牌时仍能达到长度下限', () => {
    const desc = patternSeoDescription({
      name: '鸭',
      width: 9,
      height: 9,
      beads: 1,
      colorCount: 1,
      difficulty: 'hard',
    })
    inRange(desc)
    expect(desc).toContain('鸭')
  })

  it('长名字不会超过上限', () => {
    const desc = patternSeoDescription({ ...base, name: '戴草帽的小女孩与她的猫' })
    inRange(desc)
  })

  it('缺名字返回空字符串', () => {
    expect(patternSeoDescription({})).toBe('')
    expect(patternSeoDescription(null)).toBe('')
  })
})

describe('themeSeoDescription / collectionSeoDescription', () => {
  it('主题描述保留策展文案并补足长度', () => {
    const desc = themeSeoDescription({ title: '春天', description: '春季主题', count: 5 })
    expect(desc).toContain('春季主题')
    inRange(desc)
  })

  it('主题无描述、无图纸数量时也能生成描述', () => {
    const desc = themeSeoDescription({ title: '宠物' })
    inRange(desc)
    expect(desc).toContain('宠物')
  })

  it('合集描述优先保留策展说明', () => {
    const desc = collectionSeoDescription({
      title: '新手入门',
      description: '描述',
      curationNote: '适合第一次做拼豆的图案',
      count: 8,
    })
    expect(desc).toContain('适合第一次做拼豆的图案')
    inRange(desc)
  })

  it('合集缺说明与图纸数量时也能生成描述', () => {
    const desc = collectionSeoDescription({ title: '精选' })
    inRange(desc)
    expect(desc).toContain('精选')
  })

  it('完全没有内容时返回空字符串', () => {
    expect(themeSeoDescription({})).toBe('')
    expect(collectionSeoDescription({})).toBe('')
  })
})
