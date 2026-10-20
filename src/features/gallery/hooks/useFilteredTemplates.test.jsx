import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useFilteredTemplates } from './useFilteredTemplates'

const tpl = (id, over = {}) => ({ id, name: `Name ${id}`, category: 'animal', difficulty: 'easy', ...over })
const list = [
  tpl('1', { name: 'Duck', nameZh: '小鸭' }),
  tpl('2', { name: 'Cat', nameZh: '小猫', category: 'food' }),
  tpl('3', { name: 'Dog', nameZh: '小狗', difficulty: 'hard' }),
]

const wrapperFor = (initial = '/gallery') => ({ children }) => (
  <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
)

const renderFilters = (templates = list, initial) => renderHook(
  () => useFilteredTemplates(templates, (t) => t.nameZh || t.name),
  { wrapper: wrapperFor(initial) },
)

beforeEach(() => {})
afterEach(() => {})

describe('useFilteredTemplates', () => {
  it('默认返回全部模板', () => {
    const { result } = renderFilters()
    expect(result.current.filtered.map((t) => t.id)).toEqual(['1', '2', '3'])
  })

  it('从 URL 恢复搜索词与筛选(刷新/分享/前进后退)', () => {
    const { result } = renderFilters(list, '/gallery?q=%E5%B0%8F&cat=animal&diff=easy')
    // q=小 命中 小鸭/小猫,再叠加 cat=animal → 只剩 1
    expect(result.current.filtered.map((t) => t.id)).toEqual(['1'])
    expect(result.current.searchTerm).toBe('小')
    expect(result.current.category).toBe('animal')
    expect(result.current.difficulty).toBe('easy')
  })

  it('搜索同时匹配原始名与翻译名', () => {
    const { result } = renderFilters()
    act(() => result.current.setSearchTerm('duck'))
    expect(result.current.filtered.map((t) => t.id)).toEqual(['1'])
    act(() => result.current.setSearchTerm('小猫'))
    expect(result.current.filtered.map((t) => t.id)).toEqual(['2'])
  })

  it('难度筛选与空结果', () => {
    const { result } = renderFilters()
    act(() => result.current.setDifficulty('hard'))
    expect(result.current.filtered.map((t) => t.id)).toEqual(['3'])
    act(() => result.current.setSearchTerm('zzz'))
    expect(result.current.filtered).toEqual([])
  })

  it('resetFilters 清空 URL 参数', () => {
    const { result } = renderFilters(list, '/gallery?q=x&cat=food&diff=hard')
    act(() => result.current.resetFilters())
    expect(result.current.searchTerm).toBe('')
    expect(result.current.category).toBe('all')
    expect(result.current.difficulty).toBe('all')
    expect(result.current.filtered).toHaveLength(3)
  })

  it('空列表安全', () => {
    const { result } = renderFilters([])
    expect(result.current.filtered).toEqual([])
  })
})

describe('useFilteredTemplates · 用色数量筛选', () => {
  const tpl = (id, colors) => ({
    id,
    name: id,
    category: 'animal',
    difficulty: 'easy',
    pattern: [colors],
  })

  it('按 pattern 中唯一颜色数过滤(≤ 上限)', () => {
    const list = [tpl('few', ['#FF0000', '#FF0000', null]), tpl('many', ['#FF0000', '#00FF00', '#0000FF'])]
    const { result } = renderHook(() => useFilteredTemplates(list, (x) => x.name), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/?colors=2']}>{children}</MemoryRouter>
      ),
    })
    expect(result.current.filtered.map((x) => x.id)).toEqual(['few'])
    expect(result.current.maxColors).toBe(2)
  })

  it('非法 colors 参数当作不限', () => {
    const list = [tpl('a', ['#FF0000', '#00FF00', '#0000FF'])]
    const { result } = renderHook(() => useFilteredTemplates(list, (x) => x.name), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/?colors=abc']}>{children}</MemoryRouter>
      ),
    })
    expect(result.current.maxColors).toBe(null)
    expect(result.current.filtered).toHaveLength(1)
  })

  it('resetFilters 一并清掉 colors', () => {
    const list = [tpl('a', ['#FF0000', '#00FF00', '#0000FF'])]
    const { result } = renderHook(() => useFilteredTemplates(list, (x) => x.name), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/?colors=2&cat=animal']}>{children}</MemoryRouter>
      ),
    })
    expect(result.current.filtered).toHaveLength(0)
    act(() => result.current.resetFilters())
    expect(result.current.maxColors).toBe(null)
    expect(result.current.filtered).toHaveLength(1)
  })
})
