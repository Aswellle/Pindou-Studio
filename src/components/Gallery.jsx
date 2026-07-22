import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TEMPLATES, CATEGORIES, DIFFICULTIES } from '../data/templates'
import { getPalette } from '../data/palettes'
import { exportAsPNG } from '../services/BeadPatternExporter'

const CELL_SIZE = 8

const resolveToHex = (colorVal, palette) => {
  if (!colorVal) return null
  if (typeof colorVal === 'string' && colorVal.startsWith('#')) return colorVal
  const found = palette.colors.find(c => c.id === colorVal)
  return found ? found.hex : colorVal
}

export default function Gallery({ onLoadTemplate, onSaveWork, onLoadWork, savedWorks = [] }) {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedDifficulty, setSelectedDifficulty] = useState('all')
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('gallery-favorites')
    return saved ? JSON.parse(saved) : []
  })
  const [showFavorites, setShowFavorites] = useState(false)
  const [showMyWorks, setShowMyWorks] = useState(false)
  const [exportMenuId, setExportMenuId] = useState(null)
  const [exportingId, setExportingId] = useState(null)

  useEffect(() => {
    localStorage.setItem('gallery-favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    if (!exportMenuId) return
    const close = () => setExportMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [exportMenuId])

  const filteredTemplates = TEMPLATES.filter(template => {
    const translatedName = t(`templates.names.${template.nameKey}`, template.nameKey)
    const matchesSearch = translatedName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    const matchesDifficulty = selectedDifficulty === 'all' || template.difficulty === selectedDifficulty
    const matchesFavorite = !showFavorites || favorites.includes(template.id)
    return matchesSearch && matchesCategory && matchesDifficulty && matchesFavorite
  })

  const toggleFavorite = (id, e) => {
    e.stopPropagation()
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
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
      const palette = getPalette('perler')
      await exportAsPNG(
        template.pattern,
        template.size,
        'perler',
        t(`templates.names.${template.nameKey}`, template.nameKey),
        palette,
        { beadStyle, gridWidth: null, gridHeight: null }
      )
    } finally {
      setExportingId(null)
    }
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
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {t(`gallery.categories.${cat}`)}
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
            {savedWorks.length === 0 ? (
              <div className="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 9h18"/>
                  <path d="M9 21V9"/>
                </svg>
                <p>{t('gallery.noWorks')}</p>
                <span>{t('gallery.noWorksHint')}</span>
              </div>
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
                          onClick={() => {
                            const newWorks = savedWorks.filter((_, i) => i !== index)
                            onSaveWork(newWorks)
                          }}
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
                onClick={() => onLoadTemplate(template.pattern, template.size)}
              >
                <div className="template-thumbnail">
                  <ThumbnailCanvas pattern={template.pattern} size={template.size} />
                  <button
                    className={`favorite-btn ${favorites.includes(template.id) ? 'active' : ''}`}
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

                  {exportMenuId === template.id && (
                    <div className="export-menu" role="menu" onClick={e => e.stopPropagation()}>
                      <button role="menuitem" onClick={e => handleExportTemplate(template, 'professional', e)}>
                        {t('gallery.exportProfessional')}
                      </button>
                      <button role="menuitem" onClick={e => handleExportTemplate(template, 'realistic', e)}>
                        {t('gallery.exportRealistic')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="template-info">
                  <h3 className="template-name">{t(`templates.names.${template.nameKey}`, template.nameKey)}</h3>
                  <div className="template-meta">
                    <span className="template-size">{template.size} x {template.size}</span>
                    <span
                      className="template-difficulty"
                      style={{ '--diff-color': getDifficultyColor(template.difficulty) }}
                    >
                      {t(`gallery.difficulties.${template.difficulty}`)}
                    </span>
                  </div>
                  <span className="template-category">{t(`gallery.categories.${template.category}`)}</span>
                </div>
                <div className="template-colors">
                  {template.colors.map((color, i) => (
                    <span
                      key={i}
                      className="color-dot"
                      style={{ backgroundColor: color }}
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
          font-size: 28px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .gallery-subtitle {
          color: var(--text-secondary);
          font-size: 14px;
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
          font-size: 14px;
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
          font-size: 13px;
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
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 600;
        }
        .category-btn, .difficulty-btn {
          padding: 6px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 12px;
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
        .export-menu {
          position: absolute;
          bottom: 44px;
          right: 8px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(43,36,32,0.14);
          z-index: 10;
          overflow: hidden;
          min-width: 210px;
        }
        .export-menu button {
          display: block;
          width: 100%;
          padding: 10px 16px;
          text-align: left;
          font-size: 13px;
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
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .template-meta {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 4px;
        }
        .template-size {
          font-size: 12px;
          color: var(--text-muted);
        }
        .template-difficulty {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--diff-color);
          color: white;
        }
        .template-category {
          font-size: 11px;
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
          font-size: 16px;
          margin-bottom: 4px;
        }
        .empty-state span {
          font-size: 13px;
        }
        .section-title {
          font-size: 20px;
          margin-bottom: 20px;
        }
        .works-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
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
          font-weight: 600;
          font-size: 14px;
        }
        .work-size {
          font-size: 12px;
          color: var(--text-muted);
        }
        .work-date {
          font-size: 11px;
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
          font-size: 12px;
          font-weight: 600;
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

function ThumbnailCanvas({ pattern, size }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pattern) return

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size * CELL_SIZE, size * CELL_SIZE)

    for (let y = 0; y < size && y < pattern.length; y++) {
      for (let x = 0; x < size && pattern[y] && x < pattern[y].length; x++) {
        if (pattern[y][x]) {
          ctx.fillStyle = pattern[y][x]
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1)
        }
      }
    }
  }, [pattern, size])

  return (
    <canvas
      ref={canvasRef}
      width={size * CELL_SIZE}
      height={size * CELL_SIZE}
      style={{ imageRendering: 'pixel' }}
    />
  )
}
