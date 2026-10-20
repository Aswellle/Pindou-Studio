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
import { useGalleryContent } from '../../hooks/useGalleryContent'
import { useGalleryTemplates } from './hooks/useGalleryTemplates'
import { useFilteredTemplates } from './hooks/useFilteredTemplates'
import { resolveTemplatesByIds } from './discovery'
import { localizedContentText } from '../../services/gallery/contentModel'
import TemplateGrid from './components/TemplateGrid'
import ContentSeo from './components/ContentSeo'
import './gallery.css'

export default function ThemePage({ cloudStore }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams()
  const content = useGalleryContent()
  const { allTemplates } = useGalleryTemplates(cloudStore)

  // 公开路由只认已发布对象:管理员凭 RLS 能拿到草稿,但公开页不应展示。
  // 注意不能用 `??` 回退 —— null(未发布)会被未过滤查询重新捞回来。
  const theme = content.getPublishedThemeBySlug
    ? content.getPublishedThemeBySlug(slug)
    : content.getThemeBySlug(slug)
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
  const {
    filtered, searchTerm, setSearchTerm, category, setCategory,
    difficulty, setDifficulty, maxColors, setMaxColors, resetFilters,
  } = useFilteredTemplates(scopeTemplates, resolveName)

  const loading = content.loading && !theme

  return (
    <div className="content-page">
      <ContentSeo
        title={text?.title}
        description={text?.description}
        image={theme?.coverUrl}
        noindex={!theme}
      />
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
            {theme.coverUrl && (
              <div className="content-cover">
                <img
                  src={theme.coverUrl}
                  alt={t('gallery.discovery.coverAlt', { title: text.title })}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              </div>
            )}
            <h1 className="content-title">{text.title}</h1>
            {text.description && <p className="content-desc">{text.description}</p>}
            <span className="content-count">
              {t('gallery.discovery.filteredCount', { n: filtered.length })}
            </span>
          </>
        )}
      </div>

      {theme && (
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
              {[4, 8, 12, 16, 24, 32].map((n) => (
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
