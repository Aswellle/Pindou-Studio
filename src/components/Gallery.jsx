import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { TEMPLATES, CATEGORIES, DIFFICULTIES, extractPatternColors, convertTemplateToBrand } from '../data/templates'
import { getPalette, PALETTE_LIST } from '../data/palettes'
import { exportAsPNG } from '../services/BeadPatternExporter'
import useCustomTemplates from '../hooks/useCustomTemplates'
import ThumbnailCanvas from './ThumbnailCanvas'

const CELL_SIZE = 8

const resolveToHex = (colorVal, palette) => {
  if (!colorVal) return null
  if (typeof colorVal === 'string' && colorVal.startsWith('#')) return colorVal
  const found = palette.colors.find(c => c.id === colorVal)
  return found ? found.hex : colorVal
}

export default function Gallery({ onLoadTemplate, onDeleteWork, onLoadWork, savedWorks = [], worksLoading, cloudMirrorCount = 0, cloudStore, user, onLogin, onRegister }) {
  const { t } = useTranslation()
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
  // 模板生效品牌:优先用户覆盖,否则模板自带 paletteId(缺省 perler)
  const templateBrandId = (template) => brandOverride[template.id] || template.paletteId || 'perler'
  // 用户指定了不同于模板原始品牌的转换 → 载入/导出前把 pattern 颜色重映射到该品牌
  const templateConvertedPattern = (template) => {
    const override = brandOverride[template.id]
    if (override && override !== template.paletteId) return convertTemplateToBrand(template.pattern, override)
    return template.pattern
  }
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
    } catch (err) {
      console.error('Template export failed:', err)
      alert(t('export.exportFailed')) // 此前 try/finally 无 catch,canvas 分配失败成为未处理 rejection
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
          {categoryOptions.map(cat => (
            <button
              key={cat}
              className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {getCategoryLabel(cat)}
            </button>
          ))}
        </div>
        <div className="difficulty-group">
          <span className="category-label">{t('gallery.difficulty')}</span>
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
                onClick={() => handleTemplateLoad(template)}
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
                  <button
                    className="export-btn"
                    onClick={e => {
                      e.stopPropagation()
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

                  {exportMenuId === template.id && createPortal(
                    // portal 到 document.body:彻底脱离模板卡片的 overflow:hidden 与
                    // 任何祖先 transform/包含块陷阱,对话框永不被卡片边框裁剪
                    <div
                      className="export-menu-overlay"
                      onClick={e => { e.stopPropagation(); setExportMenuId(null) }}
                    >
                      <div className="export-menu" role="menu" onClick={e => e.stopPropagation()}>
                        <button role="menuitem" onClick={e => handleExportTemplate(template, 'professional', e)}>
                          {t('gallery.exportProfessional')}
                        </button>
                        <button role="menuitem" onClick={e => handleExportTemplate(template, 'realistic', e)}>
                          {t('gallery.exportRealistic')}
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
                      onClick={(e) => { e.stopPropagation(); setBrandMenuId(brandMenuId === template.id ? null : template.id) }}
                      title={t('gallery.brandConvert')}
                      aria-label={t('gallery.brandConvert')}
                      aria-expanded={brandMenuId === template.id}
                      aria-haspopup="menu"
                    >
                      {t(`palette.brand.${templateBrandId(template)}`)}
                      {brandOverride[template.id] && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4v5h5"/><path d="M20 20v-5h-5"/><path d="M20 15a8 8 0 0 0-14.6-4L4 9"/><path d="M4 9a8 8 0 0 0 14.6 4L20 9"/>
                        </svg>
                      )}
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
                    <div className="brand-menu" role="menu" onClick={e => e.stopPropagation()}>
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
                  {extractPatternColors(template.pattern).map((color, i) => (
                    <span
                      key={i}
                      className="color-dot"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .category-label {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          font-weight: var(--font-weight-semibold);
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
        .difficulty-btn.active {
          background: var(--diff-color);
          border-color: var(--diff-color);
        }
        .gallery-content {
          min-height: 400px;
        }
        .templates-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        @media (max-width: 640px) {
          .gallery-page {
            padding: 12px;
          }
          .templates-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
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
          padding: 16px;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 140px;
        }
        .template-thumbnail canvas {
          image-rendering: pixelated;
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
        .export-btn {
          position: absolute;
          bottom: 8px;
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
        /* 导出对话框由 .export-menu-overlay(fixed 全屏遮罩 + flex 居中)承载,
           portal 渲染到 document.body,不被卡片容器裁剪 */
        .export-menu-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          box-sizing: border-box;
        }
        .export-menu {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(43,36,32,0.2);
          overflow: hidden;
          width: min(320px, 100%);
        }
        .export-menu button {
          display: block;
          width: 100%;
          padding: 10px 16px;
          text-align: left;
          font-size: var(--text-base);
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--text-primary);
        }
        .export-menu button:hover {
          background: var(--bg-secondary);
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
        .brand-menu-overlay {
          position: fixed;
          inset: 0;
          background: transparent;
          z-index: 1001;
        }
        .brand-menu {
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
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
