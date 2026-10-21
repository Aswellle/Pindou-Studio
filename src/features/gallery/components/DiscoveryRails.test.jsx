import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import DiscoveryRails from './DiscoveryRails'
import { buildDiscoverySections } from '../discovery'
import i18n from '../../../i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
  const ctx = {
    fillStyle: '', fillRect: () => {}, clearRect: () => {},
  }
  HTMLCanvasElement.prototype.getContext = () => ctx
})

afterEach(cleanup)

const tpl = (id, over = {}) => ({
  id, name: `图案${id}`, category: 'animal', difficulty: 'easy',
  size: 2, pattern: [['#FF0000', null], [null, null]], ...over,
})
const content = (id, over = {}) => ({
  id, slug: id, title: `主题${id}`, description: `说明${id}`,
  status: 'published', isFeatured: false, sortOrder: 0, translations: {}, ...over,
})

const sectionsOf = (over = {}) => buildDiscoverySections({
  templates: [tpl(1), tpl(2, { createdAt: '2026-10-01T00:00:00Z' })],
  downloadCountOf: (t) => (t.id === 1 ? 5 : 0),
  themes: [content('spring')],
  collections: [content('pets')],
  themeTemplateIds: new Map([['spring', ['1']]]),
  collectionTemplateIds: new Map([['pets', ['2']]]),
  ...over,
})

describe('DiscoveryRails', () => {
  it('加载中渲染骨架占位(而不是一行文字导致布局跳动)', () => {
    const { container } = render(<DiscoveryRails sections={sectionsOf()} loading />)
    // 无障碍:状态文本仍在,但视觉上是骨架
    expect(screen.getByText('正在加载精选内容…')).toBeTruthy()
    expect(container.querySelector('.discovery')).toBeTruthy()
    // 骨架 rail 有固定高度,内容到达后不会把下方网格整体推下去
    expect(container.querySelectorAll('.rail-skeleton').length).toBeGreaterThan(0)
    // 骨架不渲染任何真实卡片/标题
    expect(container.querySelector('.rail-title')).toBe(null)
  })

  it('渲染热门 / 最新 / 主题 / 合集区块', () => {
    const { container } = render(<DiscoveryRails sections={sectionsOf()} />)
    expect(screen.getByText('热门图纸')).toBeTruthy()
    expect(screen.getByText('最新图纸')).toBeTruthy()
    expect(screen.getByText('主题浏览')).toBeTruthy()
    expect(screen.getByText('策展合集')).toBeTruthy()
    // 热门只有 1 个(0 下载不进榜),最新只有 1 个(只有 tpl2 有 createdAt)
    expect(container.querySelectorAll('.discovery-rail')).toHaveLength(4)
  })

  it('点击主题卡片回调主题对象', () => {
    const onOpenTheme = vi.fn()
    render(<DiscoveryRails sections={sectionsOf()} onOpenTheme={onOpenTheme} />)
    fireEvent.click(screen.getByRole('button', { name: '主题spring' }))
    expect(onOpenTheme).toHaveBeenCalledWith(expect.objectContaining({ slug: 'spring' }))
  })

  it('点击图纸卡片回调模板', () => {
    const onOpenPattern = vi.fn()
    render(<DiscoveryRails sections={sectionsOf()} onOpenPattern={onOpenPattern} />)
    fireEvent.click(screen.getByRole('button', { name: '图案1' }))
    expect(onOpenPattern).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('精选主题显示为置顶卡片', () => {
    const sections = sectionsOf({ themes: [content('spring', { isFeatured: true })] })
    render(<DiscoveryRails sections={sections} />)
    expect(screen.getByText('精选主题')).toBeTruthy()
    // 同一说明同时出现在精选卡片与主题 rail 卡片上 → 用 getAllByText
    expect(screen.getAllByText('说明spring').length).toBeGreaterThanOrEqual(1)
  })

  it('数据为空时不渲染任何区块(旧图库不受影响)', () => {
    const empty = buildDiscoverySections({ templates: [] })
    const { container } = render(<DiscoveryRails sections={empty} />)
    expect(container.querySelector('.discovery')).toBeTruthy()
    expect(container.querySelectorAll('.discovery-rail')).toHaveLength(0)
    expect(container.querySelector('.featured-card')).toBe(null)
  })

  it('加载失败显示降级说明', () => {
    render(<DiscoveryRails sections={sectionsOf()} error="network down" />)
    expect(screen.getByText(/精选内容暂时无法加载/)).toBeTruthy()
  })

  it('多语言:英文环境显示英文翻译标题', async () => {
    await i18n.changeLanguage('en-US')
    const sections = sectionsOf({
      themes: [content('spring', { translations: { en: { title: 'Spring', description: 'Spring picks' } } })],
    })
    render(<DiscoveryRails sections={sections} />)
    expect(screen.getByText('Spring')).toBeTruthy()
    await i18n.changeLanguage('zh-CN')
  })
})

describe('DiscoveryRails · 交互细节', () => {
  const sections = (over = {}) => ({
    featuredTheme: null,
    featuredCollection: null,
    popular: [],
    latest: [],
    themes: [],
    collections: [],
    themePreview: () => null,
    collectionPreview: () => null,
    ...over,
  })

  it('「查看全部」按钮点击回调', () => {
    const onViewAllThemes = vi.fn()
    render(
      <DiscoveryRails
        sections={sections({ themes: [{ id: 't1', slug: 'a', title: 'T', status: 'published', translations: {} }] })}
        onViewAllThemes={onViewAllThemes}
      />
    )
    fireEvent.click(screen.getByText('查看全部'))
    expect(onViewAllThemes).toHaveBeenCalledTimes(1)
  })

  it('滚轮在 rail 内部横向滚动,到边界时放行页面纵向滚动', () => {
    render(
      <DiscoveryRails
        sections={sections({
          popular: [{ id: 'p1', name: 'P', pattern: [['#FF0000']], size: 1, difficulty: 'easy' }],
        })}
      />
    )
    // 该用例渲染出的是带 onWheel 的 Rail(有 viewAll 时才是 .rail-track 内的轨道)
    const track = document.querySelector('.rail-track')
    // jsdom 无布局:手动给出溢出尺寸
    Object.defineProperty(track, 'scrollWidth', { value: 1000, configurable: true })
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true })
    track.scrollLeft = 100

    // React 用原生 addEventListener 代理事件,必须用 fireEvent 触发才能走到 onWheel。
    // 断言滚动位置而不是返回值:后者受 jsdom 对 preventDefault 的实现影响。
    fireEvent.wheel(track, { deltaY: 50 })
    expect(track.scrollLeft).toBe(150)

    // 滚到最右再往下滚 → 不拦截(让页面继续纵向滚)
    track.scrollLeft = 700
    fireEvent.wheel(track, { deltaY: 50 })
    expect(track.scrollLeft).toBe(700)
  })
})
