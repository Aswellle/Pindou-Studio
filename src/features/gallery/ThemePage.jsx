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

export default function ThemePage({ cloudStore }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams()
  const content = useGalleryContent()
  const { allTemplates, templatesLoading } = useGalleryTemplates(cloudStore)

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

  // 子主题与相关合集(0027)。只认已发布对象 —— 管理员可能看到草稿,
  // 但公开主题页不应把未发布内容暴露出去。
  const publishedThemes = useMemo(
    () => (content.themes || []).filter((t) => t.status === 'published'),
    [content.themes]
  )
  const publishedCollections = useMemo(
    () => (content.collections || []).filter((c) => c.status === 'published'),
    [content.collections]
  )
  const childThemes = useMemo(() => {
    if (!theme) return []
    const ids = content.childThemeIds?.get(theme.id) || []
    const byId = new Map(publishedThemes.map((t) => [String(t.id), t]))
    return ids.map((id) => byId.get(String(id))).filter(Boolean)
  }, [theme, content.childThemeIds, publishedThemes])

  const relatedCollections = useMemo(() => {
    if (!theme) return []
    const ids = content.themeCollectionIds?.get(theme.id) || []
    const byId = new Map(publishedCollections.map((c) => [String(c.id), c]))
    return ids.map((id) => byId.get(String(id))).filter(Boolean)
  }, [theme, content.themeCollectionIds, publishedCollections])

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

  // 加载中 = 主题元数据还没到,或模板库还没到。
  // 两个条件缺一不可:主题先到、模板后到时,若只判断主题,
  // 页面会先渲染出「共 0 张图纸 + 空网格」再跳成真实内容。
  const loading = content.loading || templatesLoading

  // 首屏加载(还没有主题可展示):整页用骨架,避免闪一屏「内容不存在」。
  // 注意只判 !theme —— 已有 theme 但模板仍在加载时走下面的局部骨架。
  const showPageSkeleton = loading && !theme

  return (
    <div className="content-page">
      <ContentSeo
        title={text?.title}
        description={text?.description}
        image={theme?.coverUrl}
        noindex={!theme}
      />
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/gallery')} />
        {/* 返回按钮始终可见(加载中也能退出);标题区用占位块。
            已确认不存在(!theme 且不在加载)才显示「内容不存在」。 */}
        {showPageSkeleton && <PageHeadSkeleton kind="theme" />}
        {!showPageSkeleton && !theme && (
          <p className="content-desc" role="status">{t('gallery.discovery.notFound')}</p>
        )}
        {!showPageSkeleton && theme && (
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

      {/* 首屏骨架:筛选栏 + 卡片网格(页头占位已在上面渲染) */}
      {showPageSkeleton && <ContentPageSkeleton />}

      {/* 子主题:主题页的二级入口,点击进入对应主题 */}
      {childThemes.length > 0 && (
        <section className="content-related" aria-label={t('gallery.discovery.childThemes')}>
          <h2 className="content-related-title">{t('gallery.discovery.childThemes')}</h2>
          <div className="content-related-rail">
            {childThemes.map((child) => {
              const childText = localizedContentText(child, i18n.language)
              return (
                <button
                  key={child.id}
                  type="button"
                  className="content-related-card"
                  onClick={() => navigate(`/gallery/theme/${encodeURIComponent(child.slug)}`)}
                >
                  <span className="content-related-name">{childText.title}</span>
                  {childText.description && (
                    <span className="content-related-desc">{childText.description}</span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 相关合集:主题下的策展清单 */}
      {relatedCollections.length > 0 && (
        <section className="content-related" aria-label={t('gallery.discovery.relatedCollections')}>
          <h2 className="content-related-title">{t('gallery.discovery.relatedCollections')}</h2>
          <div className="content-related-rail">
            {relatedCollections.map((collection) => {
              const cText = localizedContentText(collection, i18n.language)
              return (
                <button
                  key={collection.id}
                  type="button"
                  className="content-related-card"
                  onClick={() => navigate(`/gallery/collection/${encodeURIComponent(collection.slug)}`)}
                >
                  <span className="content-related-name">{cText.title}</span>
                  {cText.description && (
                    <span className="content-related-desc">{cText.description}</span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

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

      {theme && (
        <TemplateGrid
          templates={filtered}
          // 模板库未到时不要断言「没有匹配」——那是语义错误(不是没有,是还没到)
          emptyText={templatesLoading ? t('gallery.cloudLoading') : t('gallery.discovery.noMatch')}
          onOpen={(template) => navigate(`/gallery/pattern/${encodeURIComponent(template.id)}`)}
        />
      )}
    </div>
  )
}
