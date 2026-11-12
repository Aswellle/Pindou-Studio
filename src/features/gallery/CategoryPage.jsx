/**
 * 分类聚合页(/gallery/category/:slug)
 *
 * 与主题页/合集页同一定位:把「某一类图纸」集中到一个可独立收录的 URL 上,
 * 承接「动物拼豆图纸」「食物拼豆图纸模板」这类按品类搜索的长尾词。
 *
 * 分类是模板自带的字段,不是策展关系,所以数据源只有 useGalleryTemplates:
 * 当前可见的全部模板按 category 收窄,再复用图库的搜索/难度/用色数筛选。
 * 分类本身由 URL 固定,页面内不再提供分类选择器 —— 否则同一页面会出现
 * 「URL 说是动物、筛选却选了食物」的自相矛盾状态。
 */

import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BackButton from '../../components/BackButton'
import { useGalleryTemplates } from './hooks/useGalleryTemplates'
import { COLOR_COUNT_TIERS, useGalleryQuery } from './hooks/useGalleryQuery'
import { templateMatchesQuery } from './hooks/useFilteredTemplates'
import {
  GALLERY_CATEGORY_META,
  categoryLabelFor,
  categoryPagePath,
  categorySeo,
  resolveCategoryBySlug,
} from './categoryMeta'
import TemplateGrid from './components/TemplateGrid'
import GallerySearchInput from './components/GallerySearchInput'
import ContentPageSkeleton, { PageHeadSkeleton } from './components/ContentPageSkeleton'
import ContentSeo from './components/ContentSeo'
import './gallery.css'

export default function CategoryPage({ cloudStore }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams()
  const meta = resolveCategoryBySlug(slug)
  const { allTemplates, templatesLoading, customCategories } = useGalleryTemplates(cloudStore)

  const {
    searchTerm,
    setSearchTerm,
    difficulty,
    setDifficulty,
    maxColors,
    setMaxColors,
    setFilters,
  } = useGalleryQuery()

  // 当前语言下的显示名:与图库卡片、主题页同一口径(原始名 / 中文名 / 翻译名)
  const resolveName = useMemo(
    () => (template) => (
      template?.name
        ? (template.nameZh || template.name)
        : t(`templates.names.${template?.nameKey}`, template?.nameKey || '')
    ),
    [t]
  )

  // 本页范围 = 该分类下的全部模板。分类固定,不读 URL 的 cat 参数。
  const scopeTemplates = useMemo(
    () => (meta ? allTemplates.filter((template) => template.category === meta.raw) : []),
    [allTemplates, meta]
  )

  // 页面内筛选:搜索 / 难度 / 用色数。分类条件不参与(它已经是页面本身)。
  const filtered = useMemo(
    () => scopeTemplates.filter((template) =>
      templateMatchesQuery(template, { searchTerm, difficulty, maxColors }, resolveName)
    ),
    [scopeTemplates, searchTerm, difficulty, maxColors, resolveName]
  )

  // 其他分类的入口:只列当前有模板的分类,不给用户一个点进去必然为空的链接。
  const categoryCounts = useMemo(() => {
    const counts = new Map()
    for (const template of allTemplates) {
      if (!template?.category) continue
      counts.set(template.category, (counts.get(template.category) || 0) + 1)
    }
    return counts
  }, [allTemplates])
  const relatedCategories = useMemo(
    () => (meta
      ? GALLERY_CATEGORY_META.filter(
        (item) => item.slug !== meta.slug && (categoryCounts.get(item.raw) || 0) > 0
      )
      : []),
    [meta, categoryCounts]
  )

  const filtersActive = !!searchTerm || difficulty !== 'all' || !!maxColors
  const resetFilters = () => setFilters({ q: '', cat: 'all', diff: 'all', colors: '' })

  // 首屏:模板还没到时不要断言「该分类没有图纸」—— 那是还没到,不是没有。
  const showPageSkeleton = !!meta && templatesLoading && scopeTemplates.length === 0
  // 显示名以后台分类名称为准;分类加载完成前退回代码默认名(避免闪空标题)。
  const label = meta ? categoryLabelFor(meta, customCategories) : ''
  const effectiveSeo = meta ? categorySeo({ ...meta, label }) : null

  return (
    <div className="content-page">
      {meta && effectiveSeo && (
        <ContentSeo
          title={`${label}拼豆图纸模板`}
          description={effectiveSeo.desc}
        />
      )}
      <div className="content-page-head">
        <BackButton size="md" onClick={() => navigate('/gallery')} />
        {!meta && (
          <p className="content-desc" role="status">{t('gallery.discovery.notFound')}</p>
        )}
        {showPageSkeleton && <PageHeadSkeleton kind="theme" />}
        {meta && !showPageSkeleton && (
          <>
            <span className="content-kicker">{t('gallery.discovery.categoryPage')}</span>
            <h1 className="content-title">
              {t('gallery.discovery.categoryTitle', { label })}
            </h1>
            {/* 分类专属简介:给出该类题材的做法要点,同时避免聚合页正文只有卡片列表。
                只在该分类确有中文简介、且界面语言为中文时展示 —— 其余语言下
                塞一段中文正文会让页面语言混杂。 */}
            {meta.intro && i18n.language?.startsWith('zh') ? (
              <p className="content-desc">{meta.intro}</p>
            ) : null}
            <span className="content-count">
              {t('gallery.discovery.filteredCount', { n: filtered.length })}
            </span>
            <Link
              className="content-filter-reset"
              to={`/gallery?cat=${encodeURIComponent(meta.raw)}`}
            >
              {t('gallery.discovery.viewInGallery')}
            </Link>
          </>
        )}
      </div>

      {showPageSkeleton && <ContentPageSkeleton />}

      {meta && !showPageSkeleton && (
        <div className="content-filters">
          <label className="content-filter-search">
            <span className="sr-only">{t('gallery.discovery.filterSearch')}</span>
            <GallerySearchInput
              value={searchTerm}
              onCommit={setSearchTerm}
              placeholder={t('gallery.discovery.filterSearch')}
              ariaLabel={t('gallery.discovery.filterSearch')}
            />
          </label>
          <label className="content-filter-select">
            <span>{t('gallery.discovery.filterDifficulty')}</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              aria-label={t('gallery.discovery.filterDifficulty')}
            >
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
          {filtersActive && (
            <button type="button" className="content-filter-reset" onClick={resetFilters}>
              {t('gallery.discovery.filterReset')}
            </button>
          )}
        </div>
      )}

      {meta && !showPageSkeleton && (
        <TemplateGrid
          templates={filtered}
          emptyText={templatesLoading ? t('gallery.cloudLoading') : t('gallery.discovery.noMatch')}
          onOpen={(template) => navigate(`/gallery/pattern/${encodeURIComponent(template.id)}`)}
        />
      )}

      {meta && !showPageSkeleton && relatedCategories.length > 0 && (
        <section className="content-related" aria-label={t('gallery.discovery.relatedCategories')}>
          <h2 className="content-related-title">{t('gallery.discovery.relatedCategories')}</h2>
          <div className="content-related-rail">
            {relatedCategories.map((item) => (
              <button
                key={item.slug}
                type="button"
                className="content-related-card"
                onClick={() => navigate(categoryPagePath(item.slug))}
              >
                <span className="content-related-name">
                  {categoryLabelFor(item, customCategories)}
                </span>
                <span className="content-related-desc">
                  {t('gallery.discovery.patternCount', { n: categoryCounts.get(item.raw) })}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
