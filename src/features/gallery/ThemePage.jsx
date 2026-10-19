/**
 * 主题详情页(/gallery/theme/:slug)
 *
 * 内容来源:useGalleryContent(主题 + 关联模板 id)+ useGalleryTemplates(模板实体)。
 * 行为:
 *   - 主题不存在 / 未发布 → 明确的空状态 + 返回图库,不白屏;
 *   - 关联里已删除的模板自动跳过(discovery.resolveTemplatesByIds);
 *   - 筛选复用图库的 q/cat/diff URL 参数,刷新/分享/后退可恢复;
 *   - 点击图纸进入 /gallery/pattern/:id,不在本页直接改画布。
 */

import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { useGalleryContent } from '../../../hooks/useGalleryContent'
import { useGalleryTemplates } from '../hooks/useGalleryTemplates'
import { useFilteredTemplates } from '../hooks/useFilteredTemplates'
import { resolveTemplatesByIds } from '../discovery'
import { localizedContentText } from '../../../services/gallery/contentModel'
import TemplateGrid from '../components/TemplateGrid'
import '../../../features/gallery/gallery.css'

export default function ThemePage({ cloudStore }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams()
  const content = useGalleryContent()
  const { allTemplates } = useGalleryTemplates(cloudStore)

  const theme = content.getThemeBySlug(slug)
  const text = theme ? localizedContentText(theme, i18n.language) : null

  const scopeTemplates = useMemo(() => {
    if (!theme) return []
    return resolveTemplatesByIds(allTemplates, content.themeTemplateIds.get(theme.id) || []).templates
  }, [theme, allTemplates, content.themeTemplateIds])

  const resolveName = useMemo(
    () => (template) => (
      template?.name
        ? (template.nameZh || template.name)
        : t(`templates.names.${template?.nameKey}`, template?.nameKey || '')
    ),
    [t]
  )
  const { filtered } = useFilteredTemplates(scopeTemplates, resolveName)

  const loading = content.loading && !theme

  return (
    <div className="content-page">
      <div className="content-page-head">
        <button className="content-back" onClick={() => navigate('/gallery')}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('gallery.discovery.backToGallery')}
        </button>
        {loading ? (
          <p className="content-desc">{t('gallery.discovery.loading')}</p>
        ) : !theme ? (
          <p className="content-desc" role="status">{t('gallery.discovery.notFound')}</p>
        ) : (
          <>
            <span className="content-kicker">{t('gallery.discovery.themePage')}</span>
            <h1 className="content-title">{text.title}</h1>
            {text.description && <p className="content-desc">{text.description}</p>}
            <span className="content-count">
              {t('gallery.discovery.filteredCount', { n: filtered.length })}
            </span>
          </>
        )}
      </div>

      {theme && (
        <TemplateGrid
          templates={filtered}
          emptyText={t('gallery.discovery.noMatch')}
          onOpen={(template) => navigate(`/gallery/pattern/${encodeURIComponent(template.id)}`)}
        />
      )}
    </div>
  )
}
