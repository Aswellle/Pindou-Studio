import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import GalleryFeedTabs from './GalleryFeedTabs'
import i18n from '../../../i18n'

/**
 * feed tabs 的可访问性契约(06 §M6):
 *   - 三个 tab 固定顺序,当前项 aria-selected;
 *   - roving tabIndex 下方向键/Home/End 必须可达 —— 否则键盘用户
 *     无法切换到热门/最新;
 *   - 每个 tab 的图标按 feed 区分(此前 kind 映射错误,三个都是时钟)。
 */

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

afterEach(() => {
  cleanup()
})

const setup = (props = {}) => render(<GalleryFeedTabs feed="featured" onFeedChange={vi.fn()} {...props} />)

describe('GalleryFeedTabs', () => {
  it('按固定顺序渲染三个 feed,当前项可聚焦且 aria-selected', () => {
    setup()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['精选', '热门', '最新'])
    const featured = document.getElementById('gallery-tab-featured')
    expect(featured.getAttribute('aria-selected')).toBe('true')
    expect(featured.tabIndex).toBe(0)
    expect(document.getElementById('gallery-tab-popular').tabIndex).toBe(-1)
  })

  it('三个 tab 使用不同图标(精选不再与热门共用时钟)', () => {
    setup()
    expect(document.getElementById('gallery-tab-featured').querySelector('svg.lucide-sparkles')).toBeTruthy()
    expect(document.getElementById('gallery-tab-popular').querySelector('svg.lucide-flame')).toBeTruthy()
    expect(document.getElementById('gallery-tab-latest').querySelector('svg.lucide-clock')).toBeTruthy()
  })

  it('方向键循环切换 feed 并把焦点移到新 tab', () => {
    const onFeedChange = vi.fn()
    setup({ onFeedChange })
    const featured = document.getElementById('gallery-tab-featured')
    featured.focus()

    fireEvent.keyDown(featured, { key: 'ArrowRight' })
    expect(onFeedChange).toHaveBeenLastCalledWith('popular')
    expect(document.activeElement).toBe(document.getElementById('gallery-tab-popular'))

    fireEvent.keyDown(document.getElementById('gallery-tab-popular'), { key: 'ArrowRight' })
    expect(onFeedChange).toHaveBeenLastCalledWith('latest')

    // 从最后一项继续向右回绕到第一项
    fireEvent.keyDown(document.getElementById('gallery-tab-latest'), { key: 'ArrowRight' })
    expect(onFeedChange).toHaveBeenLastCalledWith('featured')
  })

  it('ArrowLeft 反向移动,Home/End 跳到首尾', () => {
    const onFeedChange = vi.fn()
    setup({ onFeedChange })

    fireEvent.keyDown(document.getElementById('gallery-tab-featured'), { key: 'ArrowLeft' })
    expect(onFeedChange).toHaveBeenLastCalledWith('latest')

    fireEvent.keyDown(document.getElementById('gallery-tab-popular'), { key: 'Home' })
    expect(onFeedChange).toHaveBeenLastCalledWith('featured')

    fireEvent.keyDown(document.getElementById('gallery-tab-featured'), { key: 'End' })
    expect(onFeedChange).toHaveBeenLastCalledWith('latest')
  })

  it('其它按键不拦截、不切 feed', () => {
    const onFeedChange = vi.fn()
    setup({ onFeedChange })
    fireEvent.keyDown(document.getElementById('gallery-tab-featured'), { key: 'Tab' })
    expect(onFeedChange).not.toHaveBeenCalled()
  })
})
