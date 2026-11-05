import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  useGalleryQuery,
  normalizeGalleryFeed,
  GALLERY_FEEDS,
  DEFAULT_GALLERY_FEED,
  COLOR_COUNT_TIERS,
} from './useGalleryQuery'

/**
 * Gallery URL 状态契约(重构文档 04 §2)。
 *
 * feed 是新参数:非法值归一化 featured、默认不写入 URL、切换用 push
 * (后退可回上一 feed)。q/cat/diff/colors 的语义与写入行为保持不变,
 * 主题页/合集页复用本 hook 时忽略 feed。
 */

function wrapper(initialEntry = '/gallery') {
  return function Wrapper({ children }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  }
}

describe('normalizeGalleryFeed', () => {
  it('合法值原样返回,非法/缺失值归一化为 featured', () => {
    for (const value of GALLERY_FEEDS) {
      expect(normalizeGalleryFeed(value)).toBe(value)
    }
    expect(normalizeGalleryFeed('')).toBe(DEFAULT_GALLERY_FEED)
    expect(normalizeGalleryFeed('works')).toBe(DEFAULT_GALLERY_FEED)
    expect(normalizeGalleryFeed('POPULAR')).toBe(DEFAULT_GALLERY_FEED)
    expect(normalizeGalleryFeed(null)).toBe(DEFAULT_GALLERY_FEED)
    expect(normalizeGalleryFeed(undefined)).toBe(DEFAULT_GALLERY_FEED)
  })
})

describe('useGalleryQuery · feed 解析', () => {
  it('默认 featured,地址栏没有 feed 参数', () => {
    const { result } = renderHook(() => useGalleryQuery(), { wrapper: wrapper('/gallery') })
    expect(result.current.feed).toBe('featured')
  })

  it.each(['popular', 'latest'])('?feed=%s 正确解析', value => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper(`/gallery?feed=${value}`),
    })
    expect(result.current.feed).toBe(value)
  })

  it('非法 feed 值归一化为 featured(不崩溃、不写回)', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?feed=hacked&view=works'),
    })
    expect(result.current.feed).toBe('featured')
    // 旧 view 参数仍被读出,交给页面静默清理
    expect(result.current.legacyView).toBe('works')
  })
})

describe('useGalleryQuery · feed 写入', () => {
  it('setFeed 写入 URL 并保留筛选参数', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?q=小鸭&cat=animal&diff=easy&colors=12'),
    })
    act(() => result.current.setFeed('popular'))
    expect(result.current.feed).toBe('popular')
    // 筛选全部保留:切 feed 不清条件
    expect(result.current.searchTerm).toBe('小鸭')
    expect(result.current.category).toBe('animal')
    expect(result.current.difficulty).toBe('easy')
    expect(result.current.maxColors).toBe(12)
  })

  it('切回默认 feed 时删除参数而不是写 feed=featured', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?feed=latest'),
    })
    act(() => result.current.setFeed('featured'))
    expect(result.current.feed).toBe('featured')
  })

  it('非法 setFeed 值归一化,不产生脏 URL', () => {
    const { result } = renderHook(() => useGalleryQuery(), { wrapper: wrapper('/gallery') })
    act(() => result.current.setFeed('nonsense'))
    expect(result.current.feed).toBe('featured')
    act(() => result.current.setFeed('latest'))
    act(() => result.current.setFeed(''))
    expect(result.current.feed).toBe('featured')
  })
})

describe('useGalleryQuery · 非法筛选值归一化', () => {
  it('diff 不在白名单时归一化为 all', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?diff=banana'),
    })
    expect(result.current.difficulty).toBe('all')
  })

  it('colors 只接受受支持的档位', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?colors=5'),
    })
    expect(result.current.maxColors).toBe(null)

    const { result: tier } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?colors=12'),
    })
    expect(tier.current.maxColors).toBe(12)
  })

  it('写入非法档位时删除参数,不产生读不回来的脏 URL', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?colors=12'),
    })
    act(() => result.current.setMaxColors(5))
    expect(result.current.maxColors).toBe(null)
  })
})

describe('useGalleryQuery · 全部图纸浏览态', () => {
  it('默认关闭;?browse=1 解析为浏览态', () => {
    const { result } = renderHook(() => useGalleryQuery(), { wrapper: wrapper('/gallery') })
    expect(result.current.browse).toBe(false)

    const { result: onBrowse } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?browse=1'),
    })
    expect(onBrowse.current.browse).toBe(true)
  })

  it('browseAll 一次清空筛选并写入 browse=1 + feed=featured', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?feed=popular&q=小鸭&cat=animal&colors=12'),
    })
    act(() => result.current.browseAll())
    expect(result.current.browse).toBe(true)
    expect(result.current.feed).toBe('featured')
    expect(result.current.searchTerm).toBe('')
    expect(result.current.category).toBe('all')
    expect(result.current.maxColors).toBe(null)
  })

  it('切换 feed 会退出浏览态', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?browse=1'),
    })
    act(() => result.current.setFeed('latest'))
    expect(result.current.browse).toBe(false)
    expect(result.current.feed).toBe('latest')
  })
})

describe('useGalleryQuery · 原子清筛选', () => {
  it('clearFiltersAndGoToFeed 一次清空全部条件并切到目标 feed', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?feed=popular&q=小鸭&cat=animal&diff=easy&colors=12'),
    })
    act(() => result.current.clearFiltersAndGoToFeed('featured'))
    expect(result.current.searchTerm).toBe('')
    expect(result.current.category).toBe('all')
    expect(result.current.difficulty).toBe('all')
    expect(result.current.maxColors).toBe(null)
    expect(result.current.feed).toBe('featured')
  })

  it('目标 feed 非默认时写入 feed,其余条件同样清空', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?q=小鸭&cat=animal'),
    })
    act(() => result.current.clearFiltersAndGoToFeed('latest'))
    expect(result.current.feed).toBe('latest')
    expect(result.current.searchTerm).toBe('')
    expect(result.current.category).toBe('all')
  })
})

describe('useGalleryQuery · 筛选写入(既有契约)', () => {
  it('setFilters 一次写入多项并保留 feed', () => {
    const { result } = renderHook(() => useGalleryQuery(), {
      wrapper: wrapper('/gallery?feed=popular'),
    })
    act(() => result.current.setFilters({ q: '', cat: 'food', diff: 'hard', colors: '' }))
    expect(result.current.category).toBe('food')
    expect(result.current.difficulty).toBe('hard')
    expect(result.current.searchTerm).toBe('')
    expect(result.current.feed).toBe('popular')
  })

  it('用色数档位契约不变', () => {
    expect(COLOR_COUNT_TIERS).toEqual([4, 8, 12, 16, 24, 32])
  })
})
