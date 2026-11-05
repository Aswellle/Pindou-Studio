import { useTranslation } from 'react-i18next'
import { Compass, LayoutGrid, Sparkles, FolderHeart, Palette, Wand2, Heart } from 'lucide-react'

/**
 * GallerySidebar — 桌面端图库左侧导航(≥1100px 显示,由 CSS 控制)。
 *
 * 职责边界(重构文档 04 §1):只承载稳定入口与动态分类,不保存第二份
 * 筛选状态 —— 所有状态(feed/筛选)都在 GalleryPage,这里只回传意图:
 *   - feed 切换 / 全部图纸(清筛选) → onDiscover / onAllTemplates
 *   - 策展锚点 → onCurationAnchor('themes' | 'collections')(切到精选并定位)
 *   - 分类 → onSelectCategory(cat)(只改 cat,feed 不动)
 * 分类列表由真实 categoryOptions 生成,计数取当前模板数据 —— 不写死内置分类。
 */
export default function GallerySidebar({
  feed,
  browse = false,
  filtersActive,
  category,
  categoryOptions,
  categoryCounts,
  getCategoryLabel,
  onSelectCategory,
  onDiscover,
  onAllTemplates,
  onCurationAnchor,
  onCreate,
  onOpenProfile,
}) {
  const { t } = useTranslation()

  return (
    <aside className="gallery-sidebar" aria-label={t('gallery.explorer.navLabel')}>
      <nav className="gallery-side-group" aria-label={t('gallery.explorer.navDiscover')}>
        <p className="gallery-side-title">{t('gallery.explorer.navDiscover')}</p>
        <button
          type="button"
          className={`gallery-side-item${feed === 'featured' && !filtersActive && !browse ? ' active' : ''}`}
          aria-current={feed === 'featured' && !filtersActive && !browse ? 'page' : undefined}
          onClick={onDiscover}
        >
          <Compass size={16} aria-hidden="true" />
          <span>{t('gallery.explorer.navDiscover')}</span>
        </button>
        <button
          type="button"
          className={`gallery-side-item${browse ? ' active' : ''}`}
          aria-current={browse ? 'page' : undefined}
          onClick={onAllTemplates}
        >
          <LayoutGrid size={16} aria-hidden="true" />
          <span>{t('gallery.explorer.navAll')}</span>
        </button>
      </nav>

      <nav className="gallery-side-group" aria-label={t('gallery.explorer.navCuration')}>
        <p className="gallery-side-title">{t('gallery.explorer.navCuration')}</p>
        <button type="button" className="gallery-side-item" onClick={() => onCurationAnchor('themes')}>
          <Sparkles size={16} aria-hidden="true" />
          <span>{t('gallery.explorer.navThemes')}</span>
        </button>
        <button type="button" className="gallery-side-item" onClick={() => onCurationAnchor('collections')}>
          <FolderHeart size={16} aria-hidden="true" />
          <span>{t('gallery.explorer.navCollections')}</span>
        </button>
      </nav>

      <nav className="gallery-side-group" aria-label={t('gallery.explorer.navCategories')}>
        <p className="gallery-side-title">{t('gallery.explorer.navCategories')}</p>
        <div className="gallery-side-cats">
          {categoryOptions.map(cat => (
            <button
              key={cat}
              type="button"
              className={`gallery-side-item${category === cat ? ' active' : ''}`}
              aria-current={category === cat ? 'true' : undefined}
              onClick={() => onSelectCategory(cat)}
            >
              <Palette size={15} aria-hidden="true" />
              <span className="gallery-side-cat-label">{getCategoryLabel(cat)}</span>
              <span className="gallery-side-count">
                {cat === 'all'
                  ? Object.values(categoryCounts).reduce((a, b) => a + b, 0)
                  : categoryCounts[cat] || 0}
              </span>
            </button>
          ))}
        </div>
      </nav>

      <div className="gallery-side-group">
        <button type="button" className="gallery-side-item gallery-side-create" onClick={onCreate}>
          <Wand2 size={16} aria-hidden="true" />
          <span>{t('gallery.explorer.navCreate')}</span>
        </button>
        <button type="button" className="gallery-side-item" onClick={onOpenProfile}>
          <Heart size={16} aria-hidden="true" />
          <span>{t('gallery.explorer.navProfile')}</span>
        </button>
      </div>
    </aside>
  )
}
