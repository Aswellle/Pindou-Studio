import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Home, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TEMPLATES, CATEGORIES, DIFFICULTIES, extractPatternColors, convertTemplateToBrand } from '../data/templates'
import { getPalette, PALETTE_LIST } from '../data/palettes'
import { exportAsPNG } from '../services/BeadPatternExporter'
import { supabase } from '../services/supabase'
import { useToast } from './Toast'
import useCustomTemplates from '../hooks/useCustomTemplates'
import ThumbnailCanvas from './ThumbnailCanvas'
import ContactUsModal from './ContactUsModal'

const CELL_SIZE = 8

// 卡片颜色圆点数量上限:颜色过多的模板(如 57×57 高色数作品)只展示前 N 个,
// 其余以「+N」计数兜底 —— 避免单行色点溢出卡片边界,也保证所有卡片行高统一。
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

const resolveToHex = (colorVal, palette) => {
  if (!colorVal) return null
  if (typeof colorVal === 'string' && colorVal.startsWith('#')) return colorVal
  const found = palette.colors.find(c => c.id === colorVal)
  return found ? found.hex : colorVal
}

export default function Gallery({ onLoadTemplate, onDeleteWork, onLoadWork, savedWorks = [], worksLoading, cloudMirrorCount = 0, cloudStore, user, onLogin, onRegister }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  // 右侧悬浮按钮(返回首页 / 联系我们):目前仅在「图库」页面出现;
  // 悬于屏幕最右沿、垂直居中,方便移动端右手拇指触及
  const [showContact, setShowContact] = useState(false)
  // 云端启用时,模板库完全来自云端(RLS 公开只读);未启用时回退本地模式
  // (内置模板 + localStorage 自定义模板,自定义在前)
  const localStore = useCustomTemplates()
  const cloudEnabled = !!cloudStore?.enabled
  const allTemplates = useMemo(
    () => cloudEnabled ? (cloudStore?.templates || []) : [...localStore.templates, ...TEMPLATES],
    [cloudEnabled, cloudStore, localStore.templates]
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
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedDifficulty, setSelectedDifficulty] = useState('all')
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('gallery-favorites')
    if (!saved) return []
    try { return JSON.parse(saved) } catch { return [] } // 脏数据不白屏
  })
  const [showFavorites, setShowFavorites] = useState(false)
  const [showMyWorks, setShowMyWorks] = useState(false)
  const [exportMenuId, setExportMenuId] = useState(null)
  const [exportingId, setExportingId] = useState(null)
  // 品牌徽章:当前展开品牌菜单的模板 id + 每模板用户选定的转换品牌(不改云端模板本身)
  const [brandMenuId, setBrandMenuId] = useState(null)
  const [brandOverride, setBrandOverride] = useState({})
  // 待确认填充到画布的模板(卡片点击不再直接填充,弹窗让用户确认,避免误触)
  const [pendingLoad, setPendingLoad] = useState(null)
  // 下载量:本地计数(localStorage 持久)叠加云端模板 download_count;
  // 导出成功立即更新显示,云端再走 RPC 跨用户累计,本地计数作为兜底
  const DOWNLOAD_KEY = 'template-downloads'
  const [localDownloads, setLocalDownloads] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DOWNLOAD_KEY) || '{}') } catch { return {} }
  })
  const getDownloadCount = (template) => {
    const local = localDownloads[template.id] || 0
    if (!cloudEnabled) return local
    // 云端:DB 全局计数与本地计数取大(DB 增长后会覆盖本浏览器累计)
    return Math.max(template.downloadCount || 0, local)
  }
  const bumpDownload = async (template) => {
    // 先立即更新本地显示并持久化(localStorage),保证导出后马上 +1、刷新也在
    setLocalDownloads(prev => {
      const next = { ...prev, [template.id]: (prev[template.id] || 0) + 1 }
      try { localStorage.setItem(DOWNLOAD_KEY, JSON.stringify(next)) } catch { /* 配额超限忽略 */ }
      return next
    })
    if (cloudEnabled) {
      // 显式检查 RPC 返回的 { error }:supabase-js 失败时不抛错,只返回 error 对象
      try {
        const { error } = await supabase.rpc('increment_template_download', { p_id: template.id })
        if (error) console.warn('[download-count] RPC 失败:', error.message, '模板', template.name, template.id)
      } catch (e) {
        console.warn('[download-count] RPC 异常:', e)
      }
    }
  }
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
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6)
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
    if (top + mh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - mh - 8)
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

  const filteredTemplates = allTemplates.filter(template => {
    const displayName = (template.nameZh || template.name || '').toLowerCase()
    const translatedName = t(`templates.names.${template.nameKey}`, template.nameKey).toLowerCase()
    const matchesSearch = (displayName || translatedName).includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    const matchesDifficulty = selectedDifficulty === 'all' || template.difficulty === selectedDifficulty
    const matchesFavorite = !showFavorites || favorites.some(f => String(f) === String(template.id))
    return matchesSearch && matchesCategory && matchesDifficulty && matchesFavorite
  })

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
      toast(t('export.exportFailed'), 'error') // 此前 try/finally 无 catch,canvas 分配失败成为未处理 rejection
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
            className={`filter-tab ${!showFavorites && !showMyWorks ? 'active' : ''}`}
            onClick={() => { setShowFavorites(false); setShowMyWorks(false) }}
          >
            {t('gallery.allTemplates')}
          </button>
          <button
            className={`filter-tab ${showFavorites ? 'active' : ''}`}
            onClick={() => { setShowFavorites(!showFavorites); setShowMyWorks(false) }}
          >
            {t('gallery.myFavorites')} ({favorites.length})
          </button>
          <button
            className={`filter-tab ${showMyWorks ? 'active' : ''}`}
            onClick={() => { setShowMyWorks(!showMyWorks); setShowFavorites(false) }}
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
                className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
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
                className={`difficulty-btn ${selectedDifficulty === diff ? 'active' : ''}`}
                onClick={() => setSelectedDifficulty(diff)}
                style={{ '--diff-color': getDifficultyColor(diff) }}
              >
                {t(`gallery.difficulties.${diff}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="gallery-content">
        {showMyWorks ? (
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
                        <canvas
                          width={w * CELL_SIZE}
                          height={h * CELL_SIZE}
                          style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '160px' }}
                          ref={(canvas) => {
                            if (!canvas) return
                            const ctx = canvas.getContext('2d')
                            const palette = getPalette(work.paletteId || 'perler')
                            ctx.fillStyle = '#ffffff'
                            ctx.fillRect(0, 0, w * CELL_SIZE, h * CELL_SIZE)
                            for (let y = 0; y < h; y++) {
                              for (let x = 0; x < w; x++) {
                                const hex = resolveToHex(work.canvasData[y]?.[x], palette)
                                if (hex) {
                                  ctx.fillStyle = hex
                                  ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1)
                                }
                              }
                            }
                          }}
                        />
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
        ) : cloudEnabled && cloudStore?.error && allTemplates.length === 0 ? (
          // 云端拉取失败(网络抖动 / 登录后瞬时 RLS 或 Supabase 抖动):显示可重试的错误
          // 提示,而不是误表现成「云端模板库为空 → 请联系管理员迁移」。
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v8"/>
              <path d="M12 16.5v.01"/>
            </svg>
            <p>{t('gallery.cloudLoadError')}</p>
            <span>{t('gallery.cloudLoadErrorHint')}</span>
            <button
              className="retry-btn"
              onClick={() => cloudStore.loadAll()}
            >
              {t('gallery.retry')}
            </button>
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

      <style>{`
        .gallery-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px;
        }
        .gallery-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .gallery-title {
          font-size: var(--text-3xl);
          font-weight: var(--font-weight-semibold);
          margin-bottom: 8px;
        }
        .gallery-subtitle {
          color: var(--text-secondary);
          font-size: var(--text-md);
        }
        .gallery-toolbar {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 20px;
        }
        .search-box {
          position: relative;
          max-width: 400px;
          margin: 0 auto;
          width: 100%;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }
        .search-input {
          width: 100%;
          padding: 12px 12px 12px 40px;
          border: 2px solid var(--border-color);
          border-radius: 8px;
          font-size: var(--text-md);
          background: var(--bg-secondary);
          transition: border-color 0.2s;
        }
        .search-input:focus {
          border-color: var(--accent);
          background: var(--bg-primary);
        }
        .filter-tabs {
          display: flex;
          gap: 8px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .filter-tab {
          padding: 8px 16px;
          border: 2px solid var(--border-color);
          border-radius: 6px;
          font-size: var(--text-base);
          background: transparent;
          color: var(--text-secondary);
          transition: all 0.2s;
        }
        .filter-tab:hover {
          border-color: var(--accent);
        }
        .filter-tab.active {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
        }
        .category-bar {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 24px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
        }
        .category-group, .difficulty-group {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .category-label {
          flex-shrink: 0;
          padding-top: 6px; /* 与按钮首行文字对齐 */
          font-size: var(--text-sm);
          color: var(--text-secondary);
          font-weight: var(--font-weight-semibold);
        }
        /* 按钮独立 flex-wrap 容器:换行后各行与首行按钮对齐(不以容器左缘起) */
        .filter-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }
        .category-btn, .difficulty-btn {
          padding: 6px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: var(--text-sm);
          background: var(--bg-primary);
          color: var(--text-secondary);
          transition: all 0.2s;
        }
        .category-btn:hover, .difficulty-btn:hover {
          border-color: var(--accent);
        }
        .category-btn.active, .difficulty-btn.active {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
        }
        /* 分类数量徽标:与收藏/作品计数一致 */
        .category-count {
          margin-left: 6px;
          font-size: var(--text-xs);
          color: var(--text-muted);
          opacity: 0.9;
        }
        .category-btn.active .category-count {
          color: rgba(255, 255, 255, 0.85);
        }
        .difficulty-btn.active {
          background: var(--diff-color);
          border-color: var(--diff-color);
        }
        .gallery-content {
          min-height: 400px;
        }
        .templates-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }
        @media (max-width: 1024px) {
          .templates-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 640px) {
          .gallery-page {
            padding: 12px;
          }
          .templates-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          /* 窄卡片下尺寸/品牌/难度徽章允许换行,避免横向溢出 */
          .template-meta {
            flex-wrap: wrap;
            row-gap: 4px;
          }
          .template-brand {
            max-width: 96px;
          }
          /* 分类/难度筛选间距收紧 */
          .category-bar {
            gap: 14px;
            padding: 12px;
          }
          .category-group, .difficulty-group {
            gap: 6px;
          }
          .filter-buttons {
            gap: 6px;
          }
        }
        .template-card {
          background: var(--bg-primary);
          border: 2px solid var(--border-color);
          border-radius: var(--radius-card);
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s;
          z-index: 1;
        }
        .template-card:hover {
          border-color: var(--accent);
          transform: translateY(-4px);
          box-shadow: var(--shadow-card);
        }
        .template-thumbnail {
          position: relative;
          background: var(--bg-primary);
          /* 顶部/左右内边距 8px 让预览图占据卡宽;底部预留 60px 作为下载徽章区,
             徽章落在画布之下(不再遮挡图案),与右上收藏心形同右缘、竖直线对称 */
          padding: 8px 8px 60px;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 140px;
        }
        .template-thumbnail canvas {
          image-rendering: pixelated;
          /* 预览双向铺满:width:100% 让 29×29 的 232px 也放大到卡宽 ——
             此前 max-width 只缩不放,小图(29×29)预览明显小于大图(57×57),
             这是批次不一致的根因;height:auto 保持方形,配合 pixelated 放大不糊 */
          width: 100%;
          height: auto;
          display: block;
        }
        .favorite-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--bg-primary);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(43,36,32,0.12);
          transition: transform 0.2s;
        }
        .favorite-btn:hover {
          transform: scale(1.1);
        }
        .export-btn-wrap {
          position: absolute;
          bottom: 8px;
          right: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .export-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--bg-primary);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(43,36,32,0.12);
          transition: transform 0.2s;
          cursor: pointer;
          color: var(--text-secondary);
        }
        .export-btn:hover:not(:disabled) {
          transform: scale(1.1);
        }
        .export-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        /* 模板下载量:导出按钮下方小徽标,便于看出哪个模板更受欢迎 */
        .download-count {
          font-size: 10px;
          line-height: 1.3;
          color: var(--text-muted);
          background: var(--bg-primary);
          border-radius: 8px;
          padding: 0 5px;
          box-shadow: 0 1px 3px rgba(43,36,32,0.1);
        }
        /* 导出菜单:portal 到 body,useLayoutEffect 按导出按钮位置贴近定位;
           遮罩仅拦截点击(透明),菜单为固定定位下拉框 */
        .export-menu-overlay {
          position: fixed;
          inset: 0;
          background: transparent;
          z-index: 1000;
        }
        .export-menu {
          position: fixed;
          left: 0;
          top: 0;
          width: 260px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(43,36,32,0.2);
          overflow: hidden;
        }
        .export-menu-header {
          padding: 12px 14px 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .export-menu-title {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }
        .export-menu-name {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .export-menu-hint {
          padding: 4px 14px 10px;
          font-size: var(--text-xs);
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-color);
        }
        .export-format-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 14px;
          text-align: left;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--text-primary);
        }
        .export-format-item:hover {
          background: var(--bg-secondary);
        }
        .export-format-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: var(--bg-secondary);
          color: var(--accent);
          flex-shrink: 0;
        }
        .export-format-text {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .export-format-name {
          font-size: var(--text-sm);
          font-weight: 600;
        }
        .export-format-desc {
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        .template-info {
          padding: 12px 16px;
        }
        .template-name {
          font-size: var(--text-lg);
          font-weight: var(--font-weight-semibold);
          margin-bottom: 4px;
          min-height: 1.35em; /* 预留单行高度,名称长短不一也能让卡片信息区等高 */
        }
        .template-meta {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 4px;
        }
        .template-size {
          font-size: var(--text-sm);
          color: var(--text-muted);
        }
        .template-difficulty {
          font-size: var(--text-xs);
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--diff-color);
          color: white;
        }
        /* 拼豆品牌徽章:边框胶囊,点击弹出品牌切换菜单(overridden=已选转换品牌) */
        .template-brand {
          font-size: var(--text-xs);
          padding: 2px 8px;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          line-height: 1.4;
          transition: all 0.15s;
          max-width: 110px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .template-brand:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .template-brand.overridden {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-soft);
        }
        /* 徽章上的向下箭头:标示可展开的下拉按钮;展开时翻转向上 */
        .brand-chevron {
          flex-shrink: 0;
          opacity: 0.55;
          transition: transform 0.15s;
        }
        .template-brand[aria-expanded="true"] .brand-chevron {
          transform: rotate(180deg);
        }
        .brand-convert-icon {
          flex-shrink: 0;
        }
        .brand-menu-overlay {
          position: fixed;
          inset: 0;
          background: transparent;
          z-index: 1001;
        }
        .brand-menu {
          position: fixed;
          left: 0;
          top: 0;
          min-width: 180px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          box-shadow: var(--shadow-card);
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .brand-menu button {
          text-align: left;
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-primary);
          font-size: var(--text-sm);
          cursor: pointer;
          white-space: nowrap;
        }
        .brand-menu button:hover {
          background: var(--bg-secondary);
        }
        .brand-menu button.active {
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }
        /* 填充模板确认对话框:桌面式两栏(左侧方形大预览 | 右侧信息+操作),防误触 */
        .load-confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          box-sizing: border-box;
        }
        .load-confirm-modal {
          display: flex;
          background: var(--bg-primary);
          border-radius: 16px;
          overflow: hidden;
          max-width: 720px; /* PC 焦点内容:更大的浏览尺寸,预览与文案都舒展 */
          width: 100%;
          box-shadow: 0 16px 48px rgba(43,36,32,0.22);
        }
        .load-confirm-preview {
          flex: 0 0 47%;
          background: var(--bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;   /* 去内边距:预览图铺满预览区,沉浸感;圆角由模态框 overflow:hidden 裁切 */
          aspect-ratio: 1 / 1; /* 方形预览区,各尺寸模板等大且更大展示 */
        }
        .load-confirm-preview canvas {
          image-rendering: pixelated;
          width: 100%;   /* 双向铺满方形预览,29×29 也放大,与 57×57 视觉一致 */
          height: 100%;
          display: block;
        }
        .load-confirm-info {
          flex: 1;
          min-width: 0;
          padding: 32px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          text-align: left;
        }
        .load-confirm-title {
          font-size: var(--text-2xl);
          font-weight: var(--font-weight-semibold);
          margin: 0 0 12px;
          color: var(--text-primary);
        }
        .load-confirm-body {
          font-size: var(--text-base);
          color: var(--text-secondary);
          margin: 0 0 24px;
          line-height: 1.6;
        }
        .load-confirm-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-start;
        }
        .load-confirm-actions button {
          padding: 11px 26px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: 600;
          transition: all 0.15s;
        }
        .load-confirm-cancel {
          background: var(--bg-secondary);
          color: var(--text-secondary);
        }
        .load-confirm-cancel:hover {
          background: var(--bg-tertiary);
        }
        .load-confirm-ok {
          background: var(--accent);
          color: white;
        }
        .load-confirm-ok:hover {
          background: var(--accent-hover);
        }
        @media (max-width: 640px) {
          .load-confirm-modal {
            flex-direction: column;
            max-width: 320px;
          }
          .load-confirm-preview {
            flex: none;
            width: 100%;
            aspect-ratio: 1 / 1; /* 移动端同样方形预览区:预览图铺满,无白边 */
            min-height: 0;
            padding: 0;         /* 去内边距,预览图刚好铺满预览区 */
            display: flex;
            align-items: stretch;
            justify-content: stretch;
          }
          .load-confirm-info {
            text-align: center;
            justify-content: flex-start;
            padding: 16px;
          }
          .load-confirm-actions {
            justify-content: center;
          }
        }
        .template-category {
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        .template-colors {
          display: flex;
          gap: 4px;
          padding: 0 16px 12px;
        }
        .color-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
        }
        .color-dot-more {
          height: 12px;
          padding: 0 6px;
          border-radius: 999px;
          font-size: 10px;
          line-height: 12px;
          color: var(--text-secondary);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: var(--text-muted);
        }
        .empty-state svg {
          margin-bottom: 16px;
          opacity: 0.5;
        }
        .empty-state p {
          font-size: var(--text-lg);
          margin-bottom: 4px;
        }
        .empty-state span {
          font-size: var(--text-base);
        }
        .retry-btn {
          margin-top: 18px;
          padding: 8px 20px;
          border: 1px solid var(--accent);
          border-radius: 8px;
          background: var(--accent-soft);
          color: var(--accent);
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .retry-btn:hover { background: var(--accent); color: white; }
        /* 右侧悬浮按钮:右下角贴近右手拇指区,与底部地址栏/操作区域保持合适距离;
           尺寸收敛(46px 圆角方块),不喧宾夺主(参照参考站观感) */
        .gallery-floating {
          position: fixed;
          right: 12px;
          bottom: clamp(96px, 14vh, 140px);
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 300;
        }
        .gallery-float-btn {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          cursor: pointer;
          border: 2px solid var(--float-ink, #3a2f26);
          box-shadow: 0 3px 0 rgba(43, 36, 32, 0.28);
          transition: transform 0.12s, box-shadow 0.12s;
        }
        .gallery-float-btn:active {
          transform: translateY(2px);
          box-shadow: 0 1px 0 rgba(43, 36, 32, 0.28);
        }
        .gallery-float-btn.home { background: var(--accent); border-color: #b65a38; }
        .gallery-float-btn.contact { background: var(--secondary-accent); border-color: #38766c; }
        .empty-login-btn {
          margin-top: 16px;
        }
        .section-title {
          font-size: var(--text-2xl);
          margin-bottom: 20px;
        }
        /* 「我的作品」注册软引导横幅 */
        .local-works-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          margin-bottom: 20px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-left: 3px solid var(--accent);
          border-radius: 8px;
        }
        .local-works-banner .banner-icon {
          flex-shrink: 0;
          color: var(--accent);
        }
        .local-works-banner .banner-text {
          flex: 1;
          min-width: 0;
        }
        .local-works-banner .banner-title {
          margin: 0 0 2px;
          font-size: var(--text-md);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }
        .local-works-banner .banner-body {
          margin: 0;
          font-size: var(--text-sm);
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .local-works-banner .banner-register {
          flex-shrink: 0;
          white-space: nowrap;
        }
        .local-works-banner .banner-dismiss {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
        }
        .local-works-banner .banner-dismiss:hover {
          color: var(--text-primary);
          background: var(--bg-tertiary);
        }
        @media (max-width: 640px) {
          .local-works-banner {
            flex-wrap: wrap;
          }
          .local-works-banner .banner-register {
            margin-left: 34px;
          }
        }
        .works-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 640px) {
          .works-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
        }
        .work-card {
          background: var(--bg-secondary);
          border-radius: var(--radius-card);
          overflow: hidden;
        }
        .work-thumbnail {
          background: var(--bg-primary);
          padding: 12px;
          display: flex;
          justify-content: center;
        }
        .work-info {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .work-name {
          font-weight: var(--font-weight-semibold);
          font-size: var(--text-md);
        }
        .work-size {
          font-size: var(--text-sm);
          color: var(--text-muted);
        }
        .work-date {
          font-size: var(--text-xs);
          color: var(--text-muted);
        }
        .work-actions {
          display: flex;
          gap: 8px;
          padding: 0 12px 12px;
        }
        .work-btn {
          flex: 1;
          padding: 8px;
          border: none;
          border-radius: 4px;
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          cursor: pointer;
          transition: all 0.2s;
        }
        .work-btn.load {
          background: var(--accent);
          color: white;
        }
        .work-btn.load:hover {
          background: var(--accent-hover);
        }
        .work-btn.delete {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }
        .work-btn.delete:hover {
          background: var(--error);
          color: white;
        }
      `}</style>
    </div>
  )
}
