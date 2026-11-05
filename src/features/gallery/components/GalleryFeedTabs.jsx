import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Flame, Sparkles } from 'lucide-react'
import { GALLERY_FEEDS } from '../hooks/useGalleryQuery'

/** 三个一级 feed 的图标(项目已依赖 lucide-react,不另写内联 SVG) */
const TAB_ICONS = { featured: Sparkles, popular: Flame, latest: Clock }

/**
 * GalleryFeedTabs — 一级 feed 切换(精选/热门/最新,顺序固定)。
 *
 * tablist/tab 语义 + roving tabIndex:非活动 tab 不进入 Tab 序,因此必须
 * 同时提供方向键导航,否则键盘用户只能停留在当前 feed(06 §M6)。
 * 方向键按自动激活模式切换 feed 并把焦点移到新 tab;Home/End 到首尾。
 * 切换不刷新页面,URL 由父级 setFeed 管理。
 */
export default function GalleryFeedTabs({ feed, onFeedChange }) {
  const { t } = useTranslation()
  const tabRefs = useRef({})

  const labelFor = {
    featured: t('gallery.explorer.tabFeatured'),
    popular: t('gallery.explorer.tabPopular'),
    latest: t('gallery.explorer.tabLatest'),
  }

  const handleKeyDown = (event, index) => {
    const { key } = event
    let nextIndex
    if (key === 'ArrowRight') nextIndex = (index + 1) % GALLERY_FEEDS.length
    else if (key === 'ArrowLeft') nextIndex = (index - 1 + GALLERY_FEEDS.length) % GALLERY_FEEDS.length
    else if (key === 'Home') nextIndex = 0
    else if (key === 'End') nextIndex = GALLERY_FEEDS.length - 1
    else return

    event.preventDefault()
    const next = GALLERY_FEEDS[nextIndex]
    onFeedChange(next)
    // tab 节点不随切换卸载,可以同步聚焦;受控父级下一帧会更新 tabIndex
    tabRefs.current[next]?.focus()
  }

  return (
    <div
      className="gallery-feed-tabs"
      role="tablist"
      aria-label={t('gallery.explorer.tabsLabel')}
      aria-orientation="horizontal"
    >
      {GALLERY_FEEDS.map((value, index) => {
        const Icon = TAB_ICONS[value]
        return (
          <button
            key={value}
            ref={el => {
              tabRefs.current[value] = el
            }}
            type="button"
            role="tab"
            id={`gallery-tab-${value}`}
            aria-selected={feed === value}
            aria-controls="gallery-feed-panel"
            tabIndex={feed === value ? 0 : -1}
            className={`gallery-feed-tab${feed === value ? ' active' : ''}`}
            onClick={() => onFeedChange(value)}
            onKeyDown={e => handleKeyDown(e, index)}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{labelFor[value]}</span>
          </button>
        )
      })}
    </div>
  )
}
