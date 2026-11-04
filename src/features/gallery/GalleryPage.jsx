/**
 * GalleryPage — Gallery V2(/gallery 主路由)
 *
 * 与 V1(components/Gallery.jsx,已归档于 _legacy/Gallery.v1.jsx)功能完全对齐,
 * 布局升级为「发现页」形态(Hero + URL 可分享/可回退的筛选状态)。
 *
 * 与 V1 的差异:
 *  - 搜索词/分类/难度经 useGalleryQuery 同步到 URLSearchParams
 *    (/gallery?q=…&cat=…&diff=…),刷新恢复、前进后退、可分享
 *  - 本页只呈现「模板库」:全部模板即默认视图,靠筛选器收窄。
 *    收藏与我的作品已移到个人中心(/profile),本页不再有视图页签。
 *  - 复用 V1 抽出的共享样式(gallery.css)与下载计数 hook(useDownloadCounts)
 *
 * 载入模板等回调由 App.jsx 传入。
 */
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Home, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, DIFFICULTIES, extractPatternColors, convertTemplateToBrand, templateDimensions } from '../../data/templates'
import { getPalette } from '../../data/palettes'
import { exportAsPNG } from '../../services/BeadPatternExporter'
import { useToast } from '../../components/Toast'
import ThumbnailCanvas from '../../components/ThumbnailCanvas'
import { useGalleryQuery, COLOR_COUNT_TIERS } from './hooks/useGalleryQuery'
import { useGalleryTemplates } from './hooks/useGalleryTemplates'
import useDownloadCounts from './hooks/useDownloadCounts'
import { useGalleryContent } from '../../hooks/useGalleryContent'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import useGalleryFavorites from '../../hooks/useGalleryFavorites'
import { buildDiscoverySections } from './discovery'
import DiscoveryRails from './components/DiscoveryRails'
import GalleryTemplateCard, { getDifficultyColor } from './components/GalleryTemplateCard'
// 与 V1 共享的全部图库样式(卡片/菜单/横幅/弹窗)
import './gallery.css'

export default function GalleryPage({ onLoadTemplate, cloudStore }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  // 搜索/分类/难度/用色数走 URL 状态(V2 核心差异),回退逻辑与 V1 一致
  const {
    searchTerm, setSearchTerm,
    category, setCategory,
    difficulty, setDifficulty,
    maxColors, setMaxColors,
    legacyView, clearLegacyView,
    setFilters,
  } = useGalleryQuery()

  // 旧链接 ?view=works / ?view=favorites 指向的视图已搬到个人中心。
  // 静默清掉参数(保留其余筛选),用户看到的仍是模板库,不会被顶成空白。
  useEffect(() => {
    if (legacyView) clearLegacyView()
  }, [legacyView, clearLegacyView])

  // 云端启用时,模板库完全来自云端(RLS 公开只读);未启用时回退本地模式
  // (内置模板 + localStorage 自定义模板,自定义在前)
  const { cloudEnabled, cloudDown, allTemplates, customCategories } = useGalleryTemplates(cloudStore)
  const categoryOptions = useMemo(
    () => [...new Set([...CATEGORIES, ...customCategories.map(c => c.id)])],
    [customCategories]
  )
  // 每个分类下的模板总数(含"全部");与收藏/作品计数一致
  const categoryCounts = useMemo(() => {
    const counts = {}
    for (const tpl of allTemplates) counts[tpl.category] = (counts[tpl.category] || 0) + 1
    return counts
  }, [allTemplates])
  const getCategoryLabel = (cat) => {
    const custom = customCategories.find(c => c.id === cat)
    return custom ? custom.label : t(`gallery.categories.${cat}`, cat)
  }

  // 收藏:与个人中心的「我的收藏」分区共用同一份数据(useGalleryFavorites)
  const { isFavorite, toggleFavorite } = useGalleryFavorites()
  const [exportingId, setExportingId] = useState(null)
  // 每模板用户选定的转换品牌(不改云端模板本身;跨卡片/跨 feed 持久)
  const [brandOverride, setBrandOverride] = useState({})
  // 待确认填充到画布的模板(卡片点击不再直接填充,弹窗让用户确认,避免误触)
  const [pendingLoad, setPendingLoad] = useState(null)
  // 载入确认弹层打开时锁背景滚动(引用计数)
  useScrollLock(!!pendingLoad)

  // 可访问性(规格 08 §5):载入确认浮层
  const { ref: loadConfirmRef, dialogProps: loadConfirmDialogProps } = useDialogA11y({
    open: !!pendingLoad,
    onClose: () => setPendingLoad(null),
    label: t('gallery.loadConfirmTitle'),
  })

  // 下载量:本地计数(localStorage 持久)叠加云端模板 download_count(抽出的共享 hook)
  const { getDownloadCount, bumpDownload } = useDownloadCounts({
    cloudEnabled,
    onCloudSync: () => cloudStore?.refresh?.(),
  })

  // 策展内容(主题/合集):与模板数据相互独立,失败时为空集合,旧图库照常可用。
  // active 只在本页挂载时加载 —— 主题/详情页各自调用同一 hook。
  const galleryContent = useGalleryContent()
  const discoverySections = useMemo(() => buildDiscoverySections({
    templates: allTemplates,
    downloadCountOf: getDownloadCount,
    themes: galleryContent.themes,
    collections: galleryContent.collections,
    themeTemplateIds: galleryContent.themeTemplateIds,
    collectionTemplateIds: galleryContent.collectionTemplateIds,
    homeSections: galleryContent.homeSections,
  }), [allTemplates, getDownloadCount, galleryContent.themes, galleryContent.collections, galleryContent.themeTemplateIds, galleryContent.collectionTemplateIds, galleryContent.homeSections])
  const discoveryEnabled = galleryContent.enabled && !cloudDown
  // 搜索/分类/难度/用色数任一激活时隐藏发现区块,避免「筛选了却还看到无关推荐」
  const filtersActive = !!searchTerm || category !== 'all' || difficulty !== 'all' || !!maxColors

  // 模板生效品牌:优先用户覆盖,否则模板自带 paletteId(缺省 perler)
  const templateBrandId = (template) => brandOverride[template.id] || template.paletteId || 'perler'
  // 用户指定了不同于模板原始品牌的转换 → 载入/导出前把 pattern 颜色重映射到该品牌
  const templateConvertedPattern = (template) => {
    const override = brandOverride[template.id]
    if (override && override !== template.paletteId) return convertTemplateToBrand(template.pattern, override)
    return template.pattern
  }

  const handleExportTemplate = async (template, beadStyle, e) => {
    e.stopPropagation()
    setExportingId(template.id)
    try {
      const brand = templateBrandId(template)
      const palette = getPalette(brand)
      // 矩形模板必须传真实宽高,否则旧导出器按 size 单值当正方形裁/补
      const { width, height } = templateDimensions(template)
      await exportAsPNG(
        templateConvertedPattern(template),
        Math.max(width, height),
        brand,
        t(`templates.names.${template.nameKey}`, template.nameKey),
        palette,
        { beadStyle, gridWidth: width, gridHeight: height }
      )
      // 导出成功(任一格式)即计数 +1:本地同步 +1,云端 RPC 后台异步(不阻塞导出状态复位)
      bumpDownload(template)
    } catch (err) {
      console.error('Template export failed:', err)
      toast(t('export.exportFailed'), 'error')
    } finally {
      setExportingId(null)
    }
  }

  const filteredTemplates = useMemo(() => allTemplates.filter(template => {
    const displayName = (template.nameZh || template.name || '').toLowerCase()
    const translatedName = t(`templates.names.${template.nameKey}`, template.nameKey).toLowerCase()
    const matchesSearch = (displayName || translatedName).includes(searchTerm.toLowerCase())
    const matchesCategory = category === 'all' || template.category === category
    const matchesDifficulty = difficulty === 'all' || template.difficulty === difficulty
    // 用色数上限:按 pattern 实际出现的唯一颜色数计算(与卡片色点、详情页口径一致)
    const matchesColors = !maxColors || extractPatternColors(template.pattern).length <= maxColors
    return matchesSearch && matchesCategory && matchesDifficulty && matchesColors
  }), [allTemplates, searchTerm, category, difficulty, maxColors, t])

  const handleToggleFavorite = (id, e) => {
    e.stopPropagation()
    toggleFavorite(id)
  }

  // 载入模板:有品牌(模板自带或用户覆盖)时转换 pattern 并通知 App 同步切换色卡;
  // 无品牌(内置通用模板)则原样载入,不打扰用户当前色卡。
  // 方形模板保持旧调用形态(不传 options),矩形模板才附带真实宽高。
  const handleTemplateLoad = (template) => {
    const brand = brandOverride[template.id] || template.paletteId
    const { width, height } = templateDimensions(template)
    const options = {}
    if (brand) options.palette = brand
    if (width !== height) {
      options.gridWidth = width
      options.gridHeight = height
    }
    onLoadTemplate(
      templateConvertedPattern(template),
      Math.max(width, height),
      Object.keys(options).length > 0 ? options : undefined
    )
  }

  return (
    <div className="gallery-page">
      {/* 右侧悬浮按钮:返回首页 + 联系我们(仅图库页出现) */}
      <div className="gallery-floating">
        <button
          className="gallery-float-btn home"
          onClick={() => navigate('/')}
          aria-label={t('gallery.backHome')}
          title={t('gallery.backHome')}
        >
          <Home size={20} />
        </button>
        <button
          className="gallery-float-btn contact"
          onClick={() => navigate('/contact')}
          aria-label={t('gallery.contactUs')}
          title={t('gallery.contactUs')}
        >
          <MessageCircle size={20} />
        </button>
      </div>

      <div className="gallery-header">
        <h1 className="gallery-title">{t('gallery.title')}</h1>
        <p className="gallery-subtitle">{t('gallery.subtitle')}</p>
      </div>

      <div className="gallery-toolbar">
        <div className="search-box">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder={t('gallery.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="category-bar">
        <div className="category-group">
          <span className="category-label">{t('gallery.category')}</span>
          <div className="filter-buttons">
            {categoryOptions.map(cat => (
              <button
                key={cat}
                className={`category-btn ${category === cat ? 'active' : ''}`}
                onClick={() => setCategory(cat)}
              >
                {getCategoryLabel(cat)}
                <span className="category-count">{cat === 'all' ? allTemplates.length : (categoryCounts[cat] || 0)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="difficulty-group">
          <span className="category-label">{t('gallery.difficulty')}</span>
          <div className="filter-buttons">
            {DIFFICULTIES.map(diff => (
              <button
                key={diff}
                className={`difficulty-btn ${difficulty === diff ? 'active' : ''}`}
                onClick={() => setDifficulty(diff)}
                style={{ '--diff-color': getDifficultyColor(diff) }}
              >
                {t(`gallery.difficulties.${diff}`)}
              </button>
            ))}
          </div>
        </div>
        {/* 用色数:新手最关心的「这图纸要买几种豆」,按上限分档。
            档位与主题页/合集页共用 COLOR_COUNT_TIERS,同一链接到哪都筛出同样结果。 */}
        <div className="colors-group">
          <span className="category-label">{t('gallery.discovery.filterColors')}</span>
          <div className="filter-buttons">
            <button
              className={`colors-btn ${!maxColors ? 'active' : ''}`}
              onClick={() => setMaxColors('')}
            >
              {t('gallery.discovery.filterColorsAny')}
            </button>
            {COLOR_COUNT_TIERS.map(n => (
              <button
                key={n}
                className={`colors-btn ${maxColors === n ? 'active' : ''}`}
                onClick={() => setMaxColors(n)}
              >
                {t('gallery.discovery.filterColorsMax', { n })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="gallery-content">
        {/* 策展区块:仅在「全部模板」视图、无筛选、云端可用且确实有内容时出现。
            数据为空 / 加载失败 → 整块不渲染,下方旧图库网格不受影响。 */}
        {!filtersActive && discoveryEnabled && (
          <DiscoveryRails
            sections={discoverySections}
            loading={galleryContent.loading}
            error={galleryContent.error}
            onOpenTheme={(theme) => navigate(`/gallery/theme/${encodeURIComponent(theme.slug)}`)}
            onOpenCollection={(collection) => navigate(`/gallery/collection/${encodeURIComponent(collection.slug)}`)}
            onOpenPattern={(template) => navigate(`/gallery/pattern/${encodeURIComponent(template.id)}`)}
            // 「查看全部」:主题/合集没有独立索引页,回到图库并清空筛选
            onViewAllThemes={() => { setFilters({ q: '', cat: 'all', diff: 'all', colors: '' }) }}
            onViewAllCollections={() => { setFilters({ q: '', cat: 'all', diff: 'all', colors: '' }) }}
          />
        )}
        {/* 云端不可用:横幅说明 + 已回退本地/内置模板;网络恢复后自动重试(useCloudTemplates) */}
        {cloudDown && (
          <div className="cloud-offline-banner" role="status">
            <div className="cloud-offline-text">
              <strong>{t('gallery.cloudLoadError')}</strong>
              <span>{t('gallery.cloudFallbackNotice')}</span>
              {/* 只给可读的原因,不把底层错误文本(含表名/堆栈/URL)暴露到界面上。
                  完整错误仍保留在 console 里供排查。 */}
              <span className="cloud-offline-reason">
                {cloudStore?.error === 'timeout'
                  ? t('gallery.cloudErrorTimeout')
                  : t('gallery.cloudLoadErrorHint')}
              </span>
            </div>
            <button className="retry-btn" onClick={() => cloudStore.loadAll()}>
              {t('gallery.retry')}
            </button>
          </div>
        )}
        {cloudEnabled && cloudStore?.loading ? (
          <div className="empty-state">
            <p>{t('gallery.cloudLoading')}</p>
          </div>
        ) : cloudEnabled && allTemplates.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v8"/>
              <path d="M12 16.5v.01"/>
            </svg>
            <p>{t('gallery.cloudEmpty')}</p>
            <span>{t('gallery.cloudEmptyHint')}</span>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <p>{t('gallery.noResults')}</p>
            <span>{t('gallery.noResultsHint')}</span>
            {/* 筛选条件(尤其新增的用色数)可能藏在下方不可见处,给一个一键清除 */}
            {filtersActive && (
              <button
                className="btn btn-primary empty-login-btn"
                onClick={() => setFilters({ q: '', cat: 'all', diff: 'all', colors: '' })}
              >
                {t('gallery.discovery.filterReset')}
              </button>
            )}
          </div>
        ) : (
          <div className="templates-grid">
            {filteredTemplates.map(template => (
              <GalleryTemplateCard
                key={template.id}
                template={template}
                categoryLabel={getCategoryLabel(template.category)}
                favorite={isFavorite(template.id)}
                onToggleFavorite={(e) => handleToggleFavorite(template.id, e)}
                onOpen={() => setPendingLoad(template)}
                exporting={exportingId === template.id}
                onExportTemplate={handleExportTemplate}
                brandId={templateBrandId(template)}
                brandOverridden={Boolean(brandOverride[template.id])}
                onBrandSelect={(brandId) => setBrandOverride(prev => {
                  const next = { ...prev }
                  if (!brandId || brandId === template.paletteId) delete next[template.id]
                  else next[template.id] = brandId
                  return next
                })}
                getDownloadCount={getDownloadCount}
              />
            ))}
          </div>
        )}
      </div>

      {/* 填充模板到画布:点击卡片后弹出确认,避免误触直接填充+跳转 */}
      {pendingLoad && createPortal(
        <div className="load-confirm-overlay" onClick={() => setPendingLoad(null)}>
          <div className="load-confirm-modal" ref={loadConfirmRef} {...loadConfirmDialogProps} onClick={e => e.stopPropagation()}>
            <div className="load-confirm-preview">
              <ThumbnailCanvas pattern={pendingLoad.pattern} size={pendingLoad.size} />
            </div>
            <div className="load-confirm-info">
              <h3 className="load-confirm-title">{t('gallery.loadConfirmTitle')}</h3>
              <p className="load-confirm-body">
                {t('gallery.loadConfirmBody', {
                  name: pendingLoad.name ? (pendingLoad.nameZh || pendingLoad.name) : t(`templates.names.${pendingLoad.nameKey}`, pendingLoad.nameKey),
                  width: templateDimensions(pendingLoad).width,
                  height: templateDimensions(pendingLoad).height,
                })}
              </p>
              <div className="load-confirm-actions">
                <button className="load-confirm-cancel" onClick={() => setPendingLoad(null)}>
                  {t('common.cancel')}
                </button>
                <button
                  className="load-confirm-ok"
                  onClick={() => { const tpl = pendingLoad; setPendingLoad(null); handleTemplateLoad(tpl) }}
                >
                  {t('gallery.loadToCanvas')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
