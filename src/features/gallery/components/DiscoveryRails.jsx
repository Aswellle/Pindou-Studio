/**
 * DiscoveryRails — 图库首页的策展区块(编辑精选 / 热门 / 最新 / 主题 / 合集)。
 *
 * 渲染原则:
 *   - 任何区块没有内容就整块不渲染(不显示空壳、不占位);
 *   - 数据失败时显示一行降级说明,旧图库网格不受影响;
 *   - 卡片只用真实模板缩略图,不使用装饰图冒充内容。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import ThumbnailCanvas from '../../../components/ThumbnailCanvas'
import { templateDimensions } from '../../../data/templates'
import { localizedContentText } from '../../../services/gallery/contentModel'

/** 模板缩略图(统一尺寸,懒加载) */
function RailThumb({ template }) {
  const { width, height } = templateDimensions(template)
  return (
    <span className="rail-thumb">
      <ThumbnailCanvas pattern={template.pattern} size={template.size} gridWidth={width} gridHeight={height} />
    </span>
  )
}

function Rail({ id, title, hint, viewAll, onViewAll, children }) {
  // 桌面滚轮:横向 rail 默认只能拖滚动条或按 Shift+滚轮。
  // 这里把纵向滚轮转成横向滚动,但不劫持「已经能横向滚」或「滚到边界」的情况 ——
  // 否则用户会被卡在 rail 里滚不动页面。
  const onWheel = (e) => {
    const el = e.currentTarget
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // 已是横向手势
    const maxScroll = el.scrollWidth - el.clientWidth
    if (!(maxScroll > 0)) return // 内容没溢出(jsdom 无布局时为 NaN)
    const atStart = el.scrollLeft <= 0 && e.deltaY < 0
    const atEnd = el.scrollLeft >= maxScroll - 1 && e.deltaY > 0
    if (atStart || atEnd) return // 让页面继续纵向滚动
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  return (
    <section className="discovery-rail" aria-labelledby={`rail-${id}`}>
      <div className="rail-head">
        <h2 id={`rail-${id}`} className="rail-title">{title}</h2>
        {hint && <span className="rail-hint">{hint}</span>}
        {viewAll && onViewAll && (
          <button type="button" className="rail-view-all" onClick={onViewAll}>
            {viewAll}
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="rail-track" onWheel={onWheel}>{children}</div>
    </section>
  )
}

/**
 * 封面图:coverUrl 存在时渲染真实封面,加载失败回退到调用方给的 fallback。
 * 用 <img> 而非背景图,失败时能拿到 onError 事件。
 */
function CoverImage({ url, alt, className, fallback }) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) return fallback
  return (
    <span className={className}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function templateDisplayName(template, t) {
  if (template.name) return template.nameZh || template.name
  return t(`templates.names.${template.nameKey}`, template.nameKey)
}

function TemplateRailCard({ template, onOpen }) {
  const { t } = useTranslation()
  const name = templateDisplayName(template, t)
  const { width, height } = templateDimensions(template)
  return (
    <button className="rail-card" onClick={() => onOpen?.(template)} aria-label={name} title={name}>
      <RailThumb template={template} />
      <span className="rail-card-name">{name}</span>
      <span className="rail-card-meta">
        {width} × {height}
        {' · '}
        {t(`gallery.difficulties.${template.difficulty}`, template.difficulty)}
      </span>
    </button>
  )
}

function ContentRailCard({ item, preview, kind, language, onOpen, coverAlt }) {
  const text = localizedContentText(item, language)
  // 缩略图优先级:真实封面 > 首个关联模板 > 首字母占位。
  // 封面加载失败时 CoverImage 会回退到这里传的 fallback。
  const thumbFallback = preview ? (
    <RailThumb template={preview} />
  ) : (
    <span className="rail-thumb">
      <span className="rail-thumb-empty" aria-hidden="true">{text.title.slice(0, 1)}</span>
    </span>
  )
  return (
    <button
      className={`rail-card rail-card-${kind}`}
      onClick={() => onOpen?.(item)}
      aria-label={text.title}
      title={text.title}
    >
      <CoverImage
        url={item.coverUrl}
        alt={coverAlt || text.title}
        className="rail-thumb rail-cover"
        fallback={thumbFallback}
      />
      <span className="rail-card-name">{text.title}</span>
      {text.description && <span className="rail-card-desc">{text.description}</span>}
    </button>
  )
}

/**
 * @param {object} props
 * @param {object} props.sections - buildDiscoverySections 的返回值
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 * @param {(theme:object)=>void} [props.onOpenTheme]
 * @param {(collection:object)=>void} [props.onOpenCollection]
 * @param {(template:object)=>void} [props.onOpenPattern]
 */
export default function DiscoveryRails({
  sections,
  loading = false,
  error = '',
  onOpenTheme,
  onOpenCollection,
  onOpenPattern,
  onViewAllThemes,
  onViewAllCollections,
}) {
  const { t, i18n } = useTranslation()
  if (!sections) return null
  if (loading) {
    return <div className="discovery-loading" role="status">{t('gallery.discovery.loading')}</div>
  }

  const { featuredTheme, featuredCollection, popular, latest, themes, collections, blocks } = sections
  const featuredThemeText = featuredTheme ? localizedContentText(featuredTheme, i18n.language) : null
  const featuredCollectionText = featuredCollection ? localizedContentText(featuredCollection, i18n.language) : null

  // 区块标题:管理员自定义优先,否则用 i18n 默认标题
  const titleFor = (cfg, fallbackKey) => cfg.title || t(fallbackKey)
  const hintFor = (cfg, fallbackKey) => cfg.subtitle || (fallbackKey ? t(fallbackKey) : '')

  const renderTemplates = (list, cfg) => (list || [])
    .slice(0, cfg.limitCount || list.length)
    .map((template) => (
      <TemplateRailCard key={template.id} template={template} onOpen={onOpenPattern} />
    ))

  const renderContentList = (list, cfg, kind) => (list || [])
    .slice(0, cfg.limitCount || list.length)
    .map((item) => (
      <ContentRailCard
        key={item.id}
        item={item}
        preview={kind === 'theme' ? sections.themePreview(item) : sections.collectionPreview(item)}
        kind={kind}
        language={i18n.language}
        onOpen={kind === 'theme' ? onOpenTheme : onOpenCollection}
        coverAlt={t('gallery.discovery.coverAlt', {
          title: localizedContentText(item, i18n.language).title,
        })}
      />
    ))

  /**
   * 按后台配置渲染区块。
   * blocks 已在 discovery.buildDiscoverySections 里过滤掉「无内容」的项,
   * 因此这里只负责把 kind 映射到具体组件。
   */
  const renderBlock = (block, index) => {
    const key = block.id || `${block.kind}-${index}`
    switch (block.kind) {
      case 'featured':
        return (
          <section className="discovery-featured" key={key} aria-label={titleFor(block, 'gallery.discovery.featured')}>
            {block.content.featuredTheme && (
              <button className="featured-card" onClick={() => onOpenTheme?.(block.content.featuredTheme)}>
                <span className="featured-kicker">{t('gallery.discovery.featuredTheme')}</span>
                <span className="featured-title">
                  {localizedContentText(block.content.featuredTheme, i18n.language).title}
                </span>
                {localizedContentText(block.content.featuredTheme, i18n.language).description && (
                  <span className="featured-desc">
                    {localizedContentText(block.content.featuredTheme, i18n.language).description}
                  </span>
                )}
              </button>
            )}
            {block.content.featuredCollection && (
              <button className="featured-card" onClick={() => onOpenCollection?.(block.content.featuredCollection)}>
                <span className="featured-kicker">{t('gallery.discovery.featuredCollection')}</span>
                <span className="featured-title">
                  {localizedContentText(block.content.featuredCollection, i18n.language).title}
                </span>
                {localizedContentText(block.content.featuredCollection, i18n.language).description && (
                  <span className="featured-desc">
                    {localizedContentText(block.content.featuredCollection, i18n.language).description}
                  </span>
                )}
              </button>
            )}
          </section>
        )
      case 'popular':
        return (
          <Rail
            key={key}
            id={`popular-${index}`}
            title={titleFor(block, 'gallery.discovery.popular')}
            hint={hintFor(block, 'gallery.discovery.popularHint')}
          >
            {renderTemplates(block.content.templates, block)}
          </Rail>
        )
      case 'latest':
        return (
          <Rail
            key={key}
            id={`latest-${index}`}
            title={titleFor(block, 'gallery.discovery.latest')}
            hint={hintFor(block, null)}
          >
            {renderTemplates(block.content.templates, block)}
          </Rail>
        )
      case 'themes':
        return (
          <Rail
            key={key}
            id={`themes-${index}`}
            title={titleFor(block, 'gallery.discovery.themes')}
            hint={hintFor(block, null)}
            viewAll={t('gallery.discovery.viewAll')}
            onViewAll={onViewAllThemes}
          >
            {renderContentList(block.content.themes, block, 'theme')}
          </Rail>
        )
      case 'collections':
        return (
          <Rail
            key={key}
            id={`collections-${index}`}
            title={titleFor(block, 'gallery.discovery.collections')}
            hint={hintFor(block, null)}
            viewAll={t('gallery.discovery.viewAll')}
            onViewAll={onViewAllCollections}
          >
            {renderContentList(block.content.collections, block, 'collection')}
          </Rail>
        )
      case 'theme': {
        const text = localizedContentText(block.content.theme, i18n.language)
        return (
          <Rail key={key} id={`theme-${index}`} title={block.title || text.title} hint={block.subtitle || ''}>
            {renderContentList([block.content.theme], { ...block, limitCount: 1 }, 'theme')}
          </Rail>
        )
      }
      case 'collection': {
        const text = localizedContentText(block.content.collection, i18n.language)
        return (
          <Rail key={key} id={`collection-${index}`} title={block.title || text.title} hint={block.subtitle || ''}>
            {renderContentList([block.content.collection], { ...block, limitCount: 1 }, 'collection')}
          </Rail>
        )
      }
      default:
        return null
    }
  }

  const hasBlocks = Array.isArray(blocks) && blocks.length > 0
  // 兼容:调用方没传 blocks(旧测试/旧调用)时退回固定渲染顺序
  const legacyBlocks = hasBlocks ? null : [
    (featuredTheme || featuredCollection) && { kind: 'featured', content: { featuredTheme, featuredCollection } },
    popular.length > 0 && { kind: 'popular', content: { templates: popular } },
    latest.length > 0 && { kind: 'latest', content: { templates: latest } },
    themes.length > 0 && { kind: 'themes', content: { themes } },
    collections.length > 0 && { kind: 'collections', content: { collections } },
  ].filter(Boolean)

  return (
    <div className="discovery">
      {error && (
        <div className="discovery-degraded" role="status">
          {t('gallery.discovery.unavailable')}
        </div>
      )}
      {(hasBlocks ? blocks : legacyBlocks).map(renderBlock)}
    </div>
  )
}
