/**
 * DiscoveryRails — 图库首页的策展区块(编辑精选 / 热门 / 最新 / 主题 / 合集)。
 *
 * 渲染原则:
 *   - 任何区块没有内容就整块不渲染(不显示空壳、不占位);
 *   - 数据失败时显示一行降级说明,旧图库网格不受影响;
 *   - 卡片只用真实模板缩略图,不使用装饰图冒充内容。
 */

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

function Rail({ id, title, hint, children }) {
  return (
    <section className="discovery-rail" aria-labelledby={`rail-${id}`}>
      <div className="rail-head">
        <h2 id={`rail-${id}`} className="rail-title">{title}</h2>
        {hint && <span className="rail-hint">{hint}</span>}
      </div>
      <div className="rail-track">{children}</div>
    </section>
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

function ContentRailCard({ item, preview, kind, language, onOpen }) {
  const text = localizedContentText(item, language)
  return (
    <button
      className={`rail-card rail-card-${kind}`}
      onClick={() => onOpen?.(item)}
      aria-label={text.title}
      title={text.title}
    >
      {preview ? (
        <RailThumb template={preview} />
      ) : (
        <span className="rail-thumb">
          <span className="rail-thumb-empty" aria-hidden="true">{text.title.slice(0, 1)}</span>
        </span>
      )}
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
}) {
  const { t, i18n } = useTranslation()
  if (!sections) return null
  if (loading) {
    return <div className="discovery-loading" role="status">{t('gallery.discovery.loading')}</div>
  }

  const { featuredTheme, featuredCollection, popular, latest, themes, collections } = sections
  const featuredThemeText = featuredTheme ? localizedContentText(featuredTheme, i18n.language) : null
  const featuredCollectionText = featuredCollection ? localizedContentText(featuredCollection, i18n.language) : null

  return (
    <div className="discovery">
      {error && (
        <div className="discovery-degraded" role="status">
          {t('gallery.discovery.unavailable')}
        </div>
      )}

      {(featuredTheme || featuredCollection) && (
        <section className="discovery-featured" aria-label={t('gallery.discovery.featured')}>
          {featuredTheme && (
            <button className="featured-card" onClick={() => onOpenTheme?.(featuredTheme)}>
              <span className="featured-kicker">{t('gallery.discovery.featuredTheme')}</span>
              <span className="featured-title">{featuredThemeText.title}</span>
              {featuredThemeText.description && (
                <span className="featured-desc">{featuredThemeText.description}</span>
              )}
            </button>
          )}
          {featuredCollection && (
            <button className="featured-card" onClick={() => onOpenCollection?.(featuredCollection)}>
              <span className="featured-kicker">{t('gallery.discovery.featuredCollection')}</span>
              <span className="featured-title">{featuredCollectionText.title}</span>
              {featuredCollectionText.description && (
                <span className="featured-desc">{featuredCollectionText.description}</span>
              )}
            </button>
          )}
        </section>
      )}

      {popular.length > 0 && (
        <Rail id="popular" title={t('gallery.discovery.popular')} hint={t('gallery.discovery.popularHint')}>
          {popular.map((template) => (
            <TemplateRailCard key={template.id} template={template} onOpen={onOpenPattern} />
          ))}
        </Rail>
      )}

      {latest.length > 0 && (
        <Rail id="latest" title={t('gallery.discovery.latest')}>
          {latest.map((template) => (
            <TemplateRailCard key={template.id} template={template} onOpen={onOpenPattern} />
          ))}
        </Rail>
      )}

      {themes.length > 0 && (
        <Rail id="themes" title={t('gallery.discovery.themes')}>
          {themes.map((theme) => (
            <ContentRailCard
              key={theme.id}
              item={theme}
              preview={sections.themePreview(theme)}
              kind="theme"
              language={i18n.language}
              onOpen={onOpenTheme}
            />
          ))}
        </Rail>
      )}

      {collections.length > 0 && (
        <Rail id="collections" title={t('gallery.discovery.collections')}>
          {collections.map((collection) => (
            <ContentRailCard
              key={collection.id}
              item={collection}
              preview={sections.collectionPreview(collection)}
              kind="collection"
              language={i18n.language}
              onOpen={onOpenCollection}
            />
          ))}
        </Rail>
      )}
    </div>
  )
}
