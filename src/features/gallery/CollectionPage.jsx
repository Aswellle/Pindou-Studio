/**
 * 合集详情页(/gallery/collection/:slug)
 *
 * 与主题页同构,额外展示「策展说明」;内容顺序完全由管理员维护的 sort_order 决定
 * (discovery.resolveTemplatesByIds 按关联数组顺序解析,不重排)。
 */

import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { useGalleryContent } from '../../hooks/useGalleryContent'
import { useGalleryTemplates } from './hooks/useGalleryTemplates'
import { useFilteredTemplates } from './hooks/useFilteredTemplates'
import { resolveTemplatesByIds } from './discovery'
import { localizedContentText } from '../../services/gallery/contentModel'
import TemplateGrid from './components/TemplateGrid'
import ContentSeo from './components/ContentSeo'
import './gallery.css'

export default function CollectionPage({ cloudStore }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams()
  const content = useGalleryContent()
  const { allTemplates } = useGalleryTemplates(cloudStore)

  const collection = content.getCollectionBySlug(slug)
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
  const { filtered } = useFilteredTemplates(scopeTemplates, resolveName)

  const loading = content.loading && !collection

  return (
    <div className="content-page">
      <ContentSeo
        title={text?.title}
        description={text?.curationNote || text?.description}
        noindex={!collection}
      />
      <div className="content-page-head">
        <button className="content-back" onClick={() => navigate('/gallery')}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('gallery.discovery.backToGallery')}
        </button>
        {loading ? (
          <p className="content-desc">{t('gallery.discovery.loading')}</p>
        ) : !collection ? (
          <p className="content-desc" role="status">{t('gallery.discovery.notFound')}</p>
        ) : (
          <>
            <span className="content-kicker">{t('gallery.discovery.collectionPage')}</span>
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

      {collection && (
        <TemplateGrid
          templates={filtered}
          emptyText={t('gallery.discovery.noMatch')}
          onOpen={(template) => navigate(`/gallery/pattern/${encodeURIComponent(template.id)}`)}
        />
      )}
    </div>
  )
}
