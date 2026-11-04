import { useTranslation } from 'react-i18next'
import { GALLERY_FEEDS } from '../hooks/useGalleryQuery'

const TAB_ICONS = { featured: 'sparkles', popular: 'flame', latest: 'clock' }

/** 三个一级 feed 的图标(内联 SVG,避免引入额外图标依赖) */
function TabIcon({ kind }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  if (kind === 'featured') {
    return (
      <svg {...common}>
        <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" />
        <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
      </svg>
    )
  }
  if (kind === 'popular') {
    return (
      <svg {...common}>
        <path d="M12 22c4 0 7-2.8 7-7 0-3-2-5.5-3.5-7C14 6 13 4 13 2c-3 2-4.5 4.5-4.5 7 0 0-1.5-1-2-3C4.5 8 5 11 5 15c0 4.2 3 7 7 7z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

/**
 * GalleryFeedTabs — 一级 feed 切换(精选/热门/最新,顺序固定)。
 * tablist/tab 语义;切换不刷新页面,URL 由父级 setFeed 管理。
 */
export default function GalleryFeedTabs({ feed, onFeedChange }) {
  const { t } = useTranslation()
  const labelFor = {
    featured: t('gallery.explorer.tabFeatured'),
    popular: t('gallery.explorer.tabPopular'),
    latest: t('gallery.explorer.tabLatest'),
  }

  return (
    <div className="gallery-feed-tabs" role="tablist" aria-label={t('gallery.explorer.tabsLabel')}>
      {GALLERY_FEEDS.map(value => (
        <button
          key={value}
          type="button"
          role="tab"
          id={`gallery-tab-${value}`}
          aria-selected={feed === value}
          aria-controls="gallery-feed-panel"
          tabIndex={feed === value ? 0 : -1}
          className={`gallery-feed-tab${feed === value ? ' active' : ''}`}
          onClick={() => onFeedChange(value)}
        >
          <TabIcon kind={TAB_ICONS[value]} />
          <span>{labelFor[value]}</span>
        </button>
      ))}
    </div>
  )
}
