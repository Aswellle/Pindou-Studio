import { describe, it, expect } from 'vitest'
import { loadTutorials, flattenTutorials, resolveTutorialLang, peekTutorials } from './tutorials'

describe('resolveTutorialLang', () => {
  it('支持的四种语言原样返回', () => {
    expect(resolveTutorialLang('zh-CN')).toBe('zh-CN')
    expect(resolveTutorialLang('en-US')).toBe('en-US')
    expect(resolveTutorialLang('ja-JP')).toBe('ja-JP')
    expect(resolveTutorialLang('ko-KR')).toBe('ko-KR')
  })

  it('不支持或缺失的语言回退 zh-CN', () => {
    expect(resolveTutorialLang('fr-FR')).toBe('zh-CN')
    expect(resolveTutorialLang(undefined)).toBe('zh-CN')
    expect(resolveTutorialLang('')).toBe('zh-CN')
  })
})

describe('loadTutorials', () => {
  it('加载 zh-CN 教程 sections(数组,含 children)', async () => {
    const sections = await loadTutorials('zh-CN')
    expect(Array.isArray(sections)).toBe(true)
    expect(sections.length).toBeGreaterThan(0)
    expect(sections[0].children.length).toBeGreaterThan(0)
    expect(typeof sections[0].id).toBe('string')
  })

  it('并发调用共享同一份结果(幂等)', async () => {
    const [a, b] = await Promise.all([loadTutorials('en-US'), loadTutorials('en-US')])
    expect(a).toBe(b)
  })

  it('不支持的语言回退到 zh 数据', async () => {
    const fallback = await loadTutorials('de-DE')
    const zh = await loadTutorials('zh-CN')
    expect(fallback).toBe(zh)
  })

  it('加载后可同步 peek 到缓存', async () => {
    await loadTutorials('ja-JP')
    expect(peekTutorials('ja-JP')).toBeTruthy()
    expect(peekTutorials('ko-KR')).toBeUndefined() // 未加载过
  })
})

describe('flattenTutorials', () => {
  it('摊平并附加 sectionId/sectionTitle', () => {
    const flat = flattenTutorials([
      { id: 's1', title: '章节一', children: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] },
      { id: 's2', title: '章节二', children: [{ id: 'c', title: 'C' }] },
    ])
    expect(flat.map(t => t.id)).toEqual(['a', 'b', 'c'])
    expect(flat[0].sectionId).toBe('s1')
    expect(flat[0].sectionTitle).toBe('章节一')
    expect(flat[2].sectionId).toBe('s2')
    // 原对象不被修改
    expect(flat[0]).not.toHaveProperty('children')
  })

  it('空/缺省输入返回空数组', () => {
    expect(flattenTutorials([])).toEqual([])
    expect(flattenTutorials()).toEqual([])
    expect(flattenTutorials(null)).toEqual([]) // 数据未就绪时组件会传 null
  })
})
