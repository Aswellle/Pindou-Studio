/**
 * 合集详情页(/gallery/collection/:slug)
 *
 * 与主题页同构,额外展示「策展说明」;内容顺序完全由管理员维护的 sort_order 决定
 * (discovery.resolveTemplatesByIds 按关联数组顺序解析,不重排)。
 */

import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackButton from '../../components/BackButton'
import { useGalleryContent } from '../../hooks/useGalleryContent'
import { useGalleryTemplates } from './hooks/useGalleryTemplates'
import { useFilteredTemplates } from './hooks/useFilteredTemplates'
import { COLOR_COUNT_TIERS } from './hooks/useGalleryQuery'
import { resolveTemplatesByIds } from './discovery'
import { localizedContentText } from '../../services/gallery/contentModel'
import TemplateGrid from './components/TemplateGrid'
import ContentPageSkeleton, { PageHeadSkeleton } from './components/ContentPageSkeleton'
import ContentSeo from './components/ContentSeo'
import './gallery.css'

export default function CollectionPage({ cloudStore }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams()
  const content = useGalleryContent()
  const { allTemplates, templatesLoading } = useGalleryTemplates(cloudStore)

  // 公开路由只认已发布对象(理由同主题页;同样不能用 `??` 回退)
  const collection = content.getPublishedCollectionBySlug
    ? content.getPublishedCollectionBySlug(slug)
    : content.getCollectionBySlug(slug)
  const text = collection ? localizedContentText(collection, i18n.language) : null

  const scopeTemplates = useMemo(() => {
    if (!collection) return []
    return resolveTemplatesByIds(allTemplates, content.collectionTemplateIds.get(collection.id) || []).templates
  }, [collection, allTemplates, content.collectionTemplateIds])

  const resolveName = useMemo(
    () => (template) => (
      template?.name
        ? (template.nameZh || template.name)
        : t(`templates.names.${template?.nameKey}`, template?.nameKey || '')
    ),
    [t]
  )
  const {
    filtered, searchTerm, setSearchTerm, category, setCategory,
    difficulty, setDifficulty, maxColors, setMaxColors, resetFilters,
  } = useFilteredTemplates(scopeTemplates, resolveName)

  // 与主题页同一判定:元数据与模板库任一未到都算加载中
  const loading = content.loading || templatesLoading
  const showPageSkeleton = loading && !collection

  return (
    <div className="content-page">
      <ContentSeo
        title={text?.title}
        description={text?.curationNote || text?.description}
        image={collection?.coverUrl}
        noindex={!collection}
      />
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/gallery')} />
        {showPageSkeleton && <PageHeadSkeleton kind="collection" />}
        {!showPageSkeleton && !collection && (
          <p className="content-desc" role="status">{t('gallery.discovery.notFound')}</p>
        )}
        {!showPageSkeleton && collection && (
          <>
            <span className="content-kicker">{t('gallery.discovery.collectionPage')}</span>
            {collection.coverUrl && (
              <div className="content-cover">
                <img
                  src={collection.coverUrl}
                  alt={t('gallery.discovery.coverAlt', { title: text.title })}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              </div>
            )}
            <h1 className="content-title">{text.title}</h1>
            {text.description && <p className="content-desc">{text.description}</p>}
            {text.curationNote && (
              <p className="content-note">
                <strong>{t('gallery.discovery.curationNote')}:</strong> {text.curationNote}
              </p>
            )}
            <span className="content-count">
              {t('gallery.discovery.filteredCount', { n: filtered.length })}
            </span>
          </>
        )}
      </div>

      {/* 首屏骨架:筛选栏 + 卡片网格(页头占位已在上面渲染) */}
      {showPageSkeleton && <ContentPageSkeleton />}

      {collection && (
        <div className="content-filters">
          <label className="content-filter-search">
            <span className="sr-only">{t('gallery.discovery.filterSearch')}</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('gallery.discovery.filterSearch')}
              aria-label={t('gallery.discovery.filterSearch')}
            />
          </label>
          <label className="content-filter-select">
            <span>{t('gallery.discovery.filterCategory')}</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('gallery.discovery.filterCategory')}>
              <option value="all">{t('gallery.allTemplates')}</option>
              {[...new Set(scopeTemplates.map((tpl) => tpl.category).filter(Boolean))].map((cat) => (
                <option key={cat} value={cat}>{t(`gallery.categories.${cat}`, cat)}</option>
              ))}
            </select>
          </label>
          <label className="content-filter-select">
            <span>{t('gallery.discovery.filterDifficulty')}</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label={t('gallery.discovery.filterDifficulty')}>
              <option value="all">{t('gallery.allTemplates')}</option>
              {[...new Set(scopeTemplates.map((tpl) => tpl.difficulty).filter(Boolean))].map((diff) => (
                <option key={diff} value={diff}>{t(`gallery.difficulties.${diff}`, diff)}</option>
              ))}
            </select>
          </label>
          <label className="content-filter-select">
            <span>{t('gallery.discovery.filterColors')}</span>
            <select
              value={maxColors ?? ''}
              onChange={(e) => setMaxColors(e.target.value)}
              aria-label={t('gallery.discovery.filterColors')}
            >
              <option value="">{t('gallery.discovery.filterColorsAny')}</option>
              {COLOR_COUNT_TIERS.map((n) => (
                <option key={n} value={n}>{t('gallery.discovery.filterColorsMax', { n })}</option>
              ))}
            </select>
          </label>
          {(searchTerm || category !== 'all' || difficulty !== 'all' || maxColors) && (
            <button type="button" className="content-filter-reset" onClick={resetFilters}>
              {t('gallery.discovery.filterReset')}
            </button>
          )}
        </div>
      )}

      {collection && (
        <TemplateGrid
          templates={filtered}
          // 模板库未到时不要说「没有匹配」——那是「还没到」,不是「没有」
          emptyText={templatesLoading ? t('gallery.cloudLoading') : t('gallery.discovery.noMatch')}
          onOpen={(template) => navigate(`/gallery/pattern/${encodeURIComponent(template.id)}`)}
        />
      )}
    </div>
  )
}
