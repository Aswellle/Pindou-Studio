/**
 * GalleryPage — Gallery V2(/gallery 主路由)
 *
 * 与 V1(components/Gallery.jsx,已归档于 _legacy/Gallery.v1.jsx)功能完全对齐,
 * 布局升级为「发现页」形态(Hero + URL 可分享/可回退的筛选状态)。
 *
 * 与 V1 的差异:
 *  - 搜索词/分类/难度经 useGalleryQuery 同步到 URLSearchParams
 *    (/gallery?q=…&cat=…&diff=…),刷新恢复、前进后退、可分享
 *  - 「全部模板 / 我的收藏 / 我的作品」三视图与 V1 一致(组件内状态)
 *  - 复用 V1 抽出的共享样式(gallery.css)与下载计数 hook(useDownloadCounts)
 *
 * 载入模板/我的作品等回调由 App.jsx 传入。
 */
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Home, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TEMPLATES, CATEGORIES, DIFFICULTIES, extractPatternColors, convertTemplateToBrand } from '../../data/templates'
import { getPalette, PALETTE_LIST } from '../../data/palettes'
import { exportAsPNG } from '../../services/BeadPatternExporter'
import { useToast } from '../../components/Toast'
import useCustomTemplates from '../../hooks/useCustomTemplates'
import ThumbnailCanvas from '../../components/ThumbnailCanvas'
import ContactUsModal from '../../components/ContactUsModal'
import { useGalleryQuery } from './hooks/useGalleryQuery'
import useDownloadCounts from './hooks/useDownloadCounts'
import WorkThumbnail from './components/WorkThumbnail'
// 与 V1 共享的全部图库样式(卡片/菜单/横幅/弹窗)
import './gallery.css'

const MAX_VISIBLE_DOTS = 7
function ColorDots({ pattern }) {
  const colors = extractPatternColors(pattern)
  const visible = colors.slice(0, MAX_VISIBLE_DOTS)
  const extra = colors.length - visible.length
  return (
    <>
      {visible.map((color, i) => (
        <span key={i} className="color-dot" style={{ backgroundColor: color }} title={color} />
      ))}
      {extra > 0 && <span className="color-dot-more" title={`+${extra}`}>+{extra}</span>}
    </>
  )
}

export default function GalleryPage({ onLoadTemplate, onDeleteWork, onLoadWork, savedWorks = [], worksLoading, cloudMirrorCount = 0, cloudStore, user, onLogin, onRegister }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  // 搜索/分类/难度走 URL 状态(V2 核心差异),回退逻辑与 V1 一致
  const { searchTerm, setSearchTerm, category, setCategory, difficulty, setDifficulty } = useGalleryQuery()
  const [view, setView] = useState('all') // 'all' | 'favorites' | 'works'

  // 云端启用时,模板库完全来自云端(RLS 公开只读);未启用时回退本地模式
  // (内置模板 + localStorage 自定义模板,自定义在前)
  const localStore = useCustomTemplates()
  const cloudEnabled = !!cloudStore?.enabled
  const localTemplates = useMemo(
    () => [...localStore.templates, ...TEMPLATES],
    [localStore.templates]
  )
  // 云端拉取失败(弱网 / supabase 域名在该网络下不可达):回退到本地 + 内置模板,
  // 让图库仍然可用;顶部保留故障横幅与重试入口 —— 降级,但不静默吞掉故障。
  const cloudDown = cloudEnabled
    && !!cloudStore?.error
    && (cloudStore?.templates?.length || 0) === 0
  const allTemplates = useMemo(
    () => (cloudEnabled && !cloudDown) ? (cloudStore?.templates || []) : localTemplates,
    [cloudEnabled, cloudDown, cloudStore, localTemplates]
  )
  const customCategories = cloudEnabled ? (cloudStore?.categories || []) : localStore.categories
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

  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('gallery-favorites')
    if (!saved) return []
    try { return JSON.parse(saved) } catch { return [] } // 脏数据不白屏
  })
  const [exportMenuId, setExportMenuId] = useState(null)
  const [exportingId, setExportingId] = useState(null)
  // 品牌徽章:当前展开品牌菜单的模板 id + 每模板用户选定的转换品牌(不改云端模板本身)
  const [brandMenuId, setBrandMenuId] = useState(null)
  const [brandOverride, setBrandOverride] = useState({})
  // 待确认填充到画布的模板(卡片点击不再直接填充,弹窗让用户确认,避免误触)
  const [pendingLoad, setPendingLoad] = useState(null)
  const [showContact, setShowContact] = useState(false)

  // 下载量:本地计数(localStorage 持久)叠加云端模板 download_count(抽出的共享 hook)
  const { getDownloadCount, bumpDownload } = useDownloadCounts({
    cloudEnabled,
    onCloudSync: () => cloudStore?.refresh?.(),
  })

  // 模板生效品牌:优先用户覆盖,否则模板自带 paletteId(缺省 perler)
  const templateBrandId = (template) => brandOverride[template.id] || template.paletteId || 'perler'
  // 用户指定了不同于模板原始品牌的转换 → 载入/导出前把 pattern 颜色重映射到该品牌
  const templateConvertedPattern = (template) => {
    const override = brandOverride[template.id]
    if (override && override !== template.paletteId) return convertTemplateToBrand(template.pattern, override)
    return template.pattern
  }

  // 品牌/导出菜单:记录触发按钮位置 + 菜单元素,用 useLayoutEffect 贴近按钮定位(避免居中)
  const brandTriggerRect = useRef(null)
  const brandMenuRef = useRef(null)
  const exportTriggerRect = useRef(null)
  const exportMenuRef = useRef(null)
  useLayoutEffect(() => {
    if (!brandMenuId || !brandMenuRef.current || !brandTriggerRect.current) return
    const menu = brandMenuRef.current
    const r = brandTriggerRect.current
    const mw = menu.offsetWidth
    const mh = menu.offsetHeight
    let left = r.left
    let top = r.bottom + 6
    if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8)
    // iOS 键盘弹起时 window.innerHeight 是布局视口(不收缩),用视觉视口高度才正确
    const vh = window.visualViewport?.height ?? window.innerHeight
    if (top + mh > vh - 8) top = Math.max(8, r.top - mh - 6)
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [brandMenuId])
  useLayoutEffect(() => {
    if (!exportMenuId || !exportMenuRef.current || !exportTriggerRect.current) return
    const menu = exportMenuRef.current
    const r = exportTriggerRect.current
    const mw = menu.offsetWidth
    const mh = menu.offsetHeight
    // 右对齐导出按钮(按钮在卡片右下角),优先在按钮上方展开
    let left = r.right - mw
    let top = r.top - mh - 6
    if (left < 8) left = 8
    if (top < 8) top = r.bottom + 6
    const vh = window.visualViewport?.height ?? window.innerHeight
    if (top + mh > vh - 8) top = Math.max(8, vh - mh - 8)
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [exportMenuId])

  // 「我的作品」注册软引导:可关闭,关闭后本机记住不再打扰
  const [localWorksHintDismissed, setLocalWorksHintDismissed] = useState(
    () => localStorage.getItem('auth-hint-local-works-dismissed') === '1'
  )
  const dismissLocalWorksHint = () => {
    localStorage.setItem('auth-hint-local-works-dismissed', '1')
    setLocalWorksHintDismissed(true)
  }

  useEffect(() => {
    localStorage.setItem('gallery-favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    if (!exportMenuId) return
    const close = () => setExportMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [exportMenuId])

  const filteredTemplates = useMemo(() => allTemplates.filter(template => {
    const displayName = (template.nameZh || template.name || '').toLowerCase()
    const translatedName = t(`templates.names.${template.nameKey}`, template.nameKey).toLowerCase()
    const matchesSearch = (displayName || translatedName).includes(searchTerm.toLowerCase())
    const matchesCategory = category === 'all' || template.category === category
    const matchesDifficulty = difficulty === 'all' || template.difficulty === difficulty
    const matchesFavorite = view !== 'favorites' || favorites.some(f => String(f) === String(template.id))
    return matchesSearch && matchesCategory && matchesDifficulty && matchesFavorite
  }), [allTemplates, searchTerm, category, difficulty, view, favorites, t])

  const toggleFavorite = (id, e) => {
    e.stopPropagation()
    setFavorites(prev =>
      prev.some(f => String(f) === String(id)) ? prev.filter(f => String(f) !== String(id)) : [...prev, id]
    )
  }

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'var(--secondary-accent)'
      case 'medium': return 'var(--warning)'
      case 'hard': return 'var(--error)'
      default: return 'var(--text-muted)'
    }
  }

  const handleExportTemplate = async (template, beadStyle, e) => {
    e.stopPropagation()
    setExportMenuId(null)
    setExportingId(template.id)
    try {
      const brand = templateBrandId(template)
      const palette = getPalette(brand)
      await exportAsPNG(
        templateConvertedPattern(template),
        template.size,
        brand,
        t(`templates.names.${template.nameKey}`, template.nameKey),
        palette,
        { beadStyle, gridWidth: null, gridHeight: null }
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

  // 载入模板:有品牌(模板自带或用户覆盖)时转换 pattern 并通知 App 同步切换色卡;
  // 无品牌(内置通用模板)则原样载入,不打扰用户当前色卡
  const handleTemplateLoad = (template) => {
    const brand = brandOverride[template.id] || template.paletteId
    onLoadTemplate(templateConvertedPattern(template), template.size, brand ? { palette: brand } : undefined)
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
          onClick={() => setShowContact(true)}
          aria-label={t('gallery.contactUs')}
          title={t('gallery.contactUs')}
        >
          <MessageCircle size={20} />
        </button>
      </div>
      {showContact && <ContactUsModal user={user} onClose={() => setShowContact(false)} />}

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

        <div className="filter-tabs">
          <button
            className={`filter-tab ${view === 'all' ? 'active' : ''}`}
            onClick={() => setView('all')}
          >
            {t('gallery.allTemplates')}
          </button>
          <button
            className={`filter-tab ${view === 'favorites' ? 'active' : ''}`}
            onClick={() => setView('favorites')}
          >
            {t('gallery.myFavorites')} ({favorites.length})
          </button>
          <button
            className={`filter-tab ${view === 'works' ? 'active' : ''}`}
            onClick={() => setView('works')}
          >
            {t('gallery.myWorks')} ({savedWorks.length})
          </button>
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
      </div>

      <div className="gallery-content">
        {/* 云端不可用:横幅说明 + 已回退本地/内置模板;网络恢复后自动重试(useCloudTemplates) */}
        {cloudDown && view !== 'works' && (
          <div className="cloud-offline-banner" role="status">
            <div className="cloud-offline-text">
              <strong>{t('gallery.cloudLoadError')}</strong>
              <span>{t('gallery.cloudFallbackNotice')}</span>
              {cloudStore?.error && (
                <code className="cloud-offline-reason">{String(cloudStore.error).slice(0, 160)}</code>
              )}
            </div>
            <button className="retry-btn" onClick={() => cloudStore.loadAll()}>
              {t('gallery.retry')}
            </button>
          </div>
        )}
        {view === 'works' ? (
          <div className="works-section">
            <h2 className="section-title">{t('gallery.myWorksSectionTitle')}</h2>
            {/* 匿名用户且有本地作品时的注册软引导:强调本机保存的丢失风险,可关闭 */}
            {!user && savedWorks.length > 0 && !localWorksHintDismissed && (
              <div className="local-works-banner" role="note">
                <svg className="banner-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <div className="banner-text">
                  <p className="banner-title">{t('gallery.localWorksTitle')}</p>
                  <p className="banner-body">{t('gallery.localWorksBody', { n: savedWorks.length })}</p>
                </div>
                {onRegister && (
                  <button className="btn btn-primary banner-register" onClick={onRegister}>
                    {t('gallery.localWorksRegister')}
                  </button>
                )}
                <button
                  className="banner-dismiss"
                  onClick={dismissLocalWorksHint}
                  aria-label={t('gallery.localWorksDismiss')}
                  title={t('gallery.localWorksDismiss')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
            {worksLoading ? (
              <div className="empty-state">
                <p>{t('gallery.worksLoading')}</p>
              </div>
            ) : savedWorks.length === 0 ? (
              !user && cloudMirrorCount > 0 ? (
                /* 登出但云端有作品:提示登录查看(避免"作品消失了"的误解) */
                <div className="empty-state">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                  </svg>
                  <p>{t('gallery.cloudWorksEmptyTitle')}</p>
                  <span>{t('gallery.cloudWorksEmptyBody')}</span>
                  {onLogin && (
                    <button className="btn btn-primary empty-login-btn" onClick={onLogin}>
                      {t('auth.login')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18"/>
                    <path d="M9 21V9"/>
                  </svg>
                  <p>{t('gallery.noWorks')}</p>
                  <span>{t('gallery.noWorksHint')}</span>
                </div>
              )
            ) : (
              <div className="works-grid">
                {savedWorks.map((work, index) => {
                  const w = work.gridWidth || work.gridSize
                  const h = work.gridHeight || work.gridSize
                  const displayName = work.name || (t('gallery.workName') + ' ' + (index + 1))
                  const displayDate = work.savedAt ? work.savedAt.slice(0, 10) : ''
                  return (
                    <div key={work.id ?? index} className="work-card">
                      <div className="work-thumbnail">
                        <WorkThumbnail work={work} />
                      </div>
                      <div className="work-info">
                        <span className="work-name">{displayName}</span>
                        <span className="work-size">{w} × {h}</span>
                        {displayDate && <span className="work-date">{displayDate}</span>}
                      </div>
                      <div className="work-actions">
                        <button
                          className="work-btn load"
                          onClick={() => onLoadWork ? onLoadWork(work) : onLoadTemplate(work.canvasData, work.gridSize)}
                        >
                          {t('gallery.load')}
                        </button>
                        <button
                          className="work-btn delete"
                          onClick={() => onDeleteWork(work)}
                        >
                          {t('gallery.delete')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : cloudEnabled && cloudStore?.loading ? (
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
          </div>
        ) : (
          <div className="templates-grid">
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className="template-card"
                onClick={() => setPendingLoad(template)}
              >
                <div className="template-thumbnail">
                  <ThumbnailCanvas pattern={template.pattern} size={template.size} />
                  <button
                    className={`favorite-btn ${favorites.some(f => String(f) === String(template.id)) ? 'active' : ''}`}
                    onClick={(e) => toggleFavorite(template.id, e)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={favorites.includes(template.id) ? 'var(--accent)' : 'none'} stroke="var(--accent)" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>
                  <div className="export-btn-wrap">
                    <button
                      className="export-btn"
                      onClick={e => {
                        e.stopPropagation()
                        exportTriggerRect.current = e.currentTarget.getBoundingClientRect()
                        setBrandMenuId(null)
                        setExportMenuId(exportMenuId === template.id ? null : template.id)
                      }}
                      disabled={exportingId === template.id}
                      title={t('export.title')}
                      aria-expanded={exportMenuId === template.id}
                      aria-haspopup="menu"
                      aria-label={t('export.title')}
                    >
                      {exportingId === template.id ? (
                        <svg className="spinning" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      )}
                    </button>
                    <span className="download-count" title={t('gallery.downloadCount')}>{getDownloadCount(template)}</span>
                  </div>

                  {exportMenuId === template.id && createPortal(
                    // portal 到 document.body:彻底脱离模板卡片的 overflow:hidden 与
                    // 任何祖先 transform/包含块陷阱,对话框永不被卡片边框裁剪
                    <div
                      className="export-menu-overlay"
                      onClick={e => { e.stopPropagation(); setExportMenuId(null) }}
                    >
                      <div className="export-menu" ref={exportMenuRef} role="menu" onClick={e => e.stopPropagation()}>
                        <div className="export-menu-header">
                          <span className="export-menu-title">{t('gallery.exportTitle')}</span>
                          <span className="export-menu-name">
                            {template.name ? (template.nameZh || template.name) : t(`templates.names.${template.nameKey}`, template.nameKey)}
                          </span>
                        </div>
                        <div className="export-menu-hint">{t('gallery.exportHint')}</div>
                        <button role="menuitem" className="export-format-item" onClick={e => handleExportTemplate(template, 'professional', e)}>
                          <span className="export-format-icon" aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                            </svg>
                          </span>
                          <span className="export-format-text">
                            <span className="export-format-name">{t('gallery.exportProfessional')}</span>
                            <span className="export-format-desc">{t('gallery.exportProfessionalDesc')}</span>
                          </span>
                        </button>
                        <button role="menuitem" className="export-format-item" onClick={e => handleExportTemplate(template, 'realistic', e)}>
                          <span className="export-format-icon" aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2c1.5 3 4 4 4 7a4 4 0 0 1-8 0c0-3 2.5-4 4-7z"/><path d="M12 15v4"/><path d="M8 22h8"/>
                            </svg>
                          </span>
                          <span className="export-format-text">
                            <span className="export-format-name">{t('gallery.exportRealistic')}</span>
                            <span className="export-format-desc">{t('gallery.exportRealisticDesc')}</span>
                          </span>
                        </button>
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
                <div className="template-info">
                  <h3 className="template-name">
                    {template.name ? (template.nameZh || template.name) : t(`templates.names.${template.nameKey}`, template.nameKey)}
                  </h3>
                  <div className="template-meta">
                    <span className="template-size">{template.size} x {template.size}</span>
                    {/* 拼豆品牌徽章:显示模板所属色卡品牌;点击可切换并转换为指定品牌 */}
                    <button
                      className={`template-brand${brandOverride[template.id] ? ' overridden' : ''}`}
                      onClick={(e) => { e.stopPropagation(); brandTriggerRect.current = e.currentTarget.getBoundingClientRect(); setExportMenuId(null); setBrandMenuId(brandMenuId === template.id ? null : template.id) }}
                      title={t('gallery.brandConvert')}
                      aria-label={t('gallery.brandConvert')}
                      aria-expanded={brandMenuId === template.id}
                      aria-haspopup="menu"
                    >
                      {t(`palette.brand.${templateBrandId(template)}`)}
                      {brandOverride[template.id] && (
                        /* 调色板图标:表示该模板已转换到指定品牌的色卡 */
                        <svg className="brand-convert-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 22a10 10 0 1 1 10-10c0 1.66-1.34 3-3 3h-2.3a2.4 2.4 0 0 0-1.8 3.94c.3.37.35.87.07 1.3-.38.7-.9 1.76-.97 1.76z"/>
                          <circle cx="7.5" cy="11.5" r="1"/><circle cx="11.5" cy="7.5" r="1"/><circle cx="16" cy="9.5" r="1"/>
                        </svg>
                      )}
                      {/* 向下箭头:标示该徽章是可展开的下拉按钮 */}
                      <svg className="brand-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>
                    <span
                      className="template-difficulty"
                      style={{ '--diff-color': getDifficultyColor(template.difficulty) }}
                    >
                      {t(`gallery.difficulties.${template.difficulty}`)}
                    </span>
                  </div>
                  <span className="template-category">{getCategoryLabel(template.category)}</span>
                </div>
                {/* 品牌切换菜单(portal 到 body,避免卡片 overflow:hidden 裁剪) */}
                {brandMenuId === template.id && createPortal(
                  <div
                    className="brand-menu-overlay"
                    onClick={(e) => { e.stopPropagation(); setBrandMenuId(null) }}
                  >
                    <div className="brand-menu" ref={brandMenuRef} role="menu" onClick={e => e.stopPropagation()}>
                      <button
                        role="menuitem"
                        className={!brandOverride[template.id] ? 'active' : ''}
                        onClick={(e) => {
                          e.stopPropagation()
                          setBrandOverride(prev => { const n = { ...prev }; delete n[template.id]; return n })
                          setBrandMenuId(null)
                        }}
                      >
                        {t('gallery.brandDefault')}
                      </button>
                      {PALETTE_LIST.map(brand => (
                        <button
                          key={brand.id}
                          role="menuitem"
                          className={templateBrandId(template) === brand.id && brandOverride[template.id] ? 'active' : ''}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (brand.id === template.paletteId) {
                              // 选中模板原始品牌 → 等价于跟随模板,清空覆盖
                              setBrandOverride(prev => { const n = { ...prev }; delete n[template.id]; return n })
                            } else {
                              setBrandOverride(prev => ({ ...prev, [template.id]: brand.id }))
                            }
                            setBrandMenuId(null)
                          }}
                        >
                          {t(`palette.brand.${brand.id}`)}
                        </button>
                      ))}
                    </div>
                  </div>,
                  document.body
                )}
                {/* 珠子颜色圆点由系统从 pattern 自动识别(统一协议可省略 colors 字段) */}
                <div className="template-colors">
                  <ColorDots pattern={template.pattern} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 填充模板到画布:点击卡片后弹出确认,避免误触直接填充+跳转 */}
      {pendingLoad && createPortal(
        <div className="load-confirm-overlay" onClick={() => setPendingLoad(null)}>
          <div className="load-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="load-confirm-preview">
              <ThumbnailCanvas pattern={pendingLoad.pattern} size={pendingLoad.size} />
            </div>
            <div className="load-confirm-info">
              <h3 className="load-confirm-title">{t('gallery.loadConfirmTitle')}</h3>
              <p className="load-confirm-body">
                {t('gallery.loadConfirmBody', {
                  name: pendingLoad.name ? (pendingLoad.nameZh || pendingLoad.name) : t(`templates.names.${pendingLoad.nameKey}`, pendingLoad.nameKey),
                  size: pendingLoad.size,
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
