import { useState, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Helmet } from 'react-helmet-async'
import AuthModal from './components/AuthModal'
import Header from './components/Header'
import Canvas from './components/Canvas'
import ColorPalette from './components/ColorPalette'
import Tools from './components/Tools'
import ExportPanel from './components/ExportPanel'
import ColorStatsBar from './components/ColorStatsBar'
import { useAuth } from './hooks/useAuth'
import { useResponsive } from './hooks/useResponsive'
import { useHistory } from './hooks/useHistory'
import { useSavedWorks } from './hooks/useSavedWorks'
import MobileToolbar from './components/Tools/MobileToolbar'
import MobileColorPalette from './components/ColorPalette/MobileColorPalette'
import { getPalette, PALETTES } from './data/palettes'
import { PrivacyPolicy, TermsOfService } from './components/LegalPages'

const Gallery = lazy(() => import('./components/Gallery'))
const Tutorials = lazy(() => import('./components/Tutorials'))
const ImageQuantizer = lazy(() => import('./components/ImageQuantizer/ImageQuantizer'))

export default function App() {
  // iOS Safari 后台标签页恢复时 100dvh 不会重新计算，导致视口高度错误、
  // flex 布局把导航栏顶到状态栏后面。通过监听 visibilitychange 强制重算。
  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVh();
    document.addEventListener('visibilitychange', setVh);
    window.addEventListener('resize', setVh);
    return () => {
      document.removeEventListener('visibilitychange', setVh);
      window.removeEventListener('resize', setVh);
    };
  }, []);

  const { t } = useTranslation()
  const { user, loading: authLoading, login, register, logout } = useAuth()
  const { isMobile, isTablet } = useResponsive()
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [selectedColor, setSelectedColor] = useState('#E53935')
  const [tool, setTool] = useState('pencil')
  const [gridSize, setGridSize] = useState(29)
  const [gridWidth, setGridWidth] = useState(null)
  const [gridHeight, setGridHeight] = useState(null)
  const { canvasData, canUndo, canRedo, drawCanvas, setCanvas, resetCanvas, undo, redo } = useHistory()
  const { works: savedWorks, saveWork, updateWorks: handleSaveWork } = useSavedWorks()

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [currentPage, setCurrentPage] = useState('canvas')
  const [showQuantizer, setShowQuantizer] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [currentPalette, setCurrentPalette] = useState('perler')
  const [designName, setDesignName] = useState('拼豆图案')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveInputName, setSaveInputName] = useState('')
  const [saveToast, setSaveToast] = useState(false)
  const [fitToast, setFitToast] = useState(false)

  // Initialize blank canvas on first render and when grid size changes with no data
  useEffect(() => {
    if (!canvasData) {
      resetCanvas(Array(gridSize).fill(null).map(() => Array(gridSize).fill(null)))
    }
  }, [gridSize])

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo
  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // Lock body scroll while any modal is open; reset iOS Safari viewport offset on close
  const anyModalOpen = showAuth || showQuantizer || showSaveDialog || showExport
  useEffect(() => {
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.top = `-${window.scrollY}px`
    } else {
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
      window.scrollTo(0, parseInt(scrollY || '0', 10) * -1)
    }
  }, [anyModalOpen])

  const handleClearCanvas = () => {
    if (canvasData && canvasData.every(row => row.every(cell => cell === null))) return
    const rows = gridHeight || gridSize
    const cols = gridWidth || gridSize
    setCanvas(Array(rows).fill(null).map(() => Array(cols).fill(null)))
  }

  const handleOpenSaveDialog = () => {
    setSaveInputName(designName)
    setShowSaveDialog(true)
  }

  const handleConfirmSave = () => {
    const ok = saveWork({
      id: Date.now(),
      name: saveInputName.trim() || designName,
      canvasData,
      gridSize,
      gridWidth: gridWidth ?? null,
      gridHeight: gridHeight ?? null,
      paletteId: currentPalette,
      savedAt: new Date().toISOString()
    })
    if (!ok) return
    setShowSaveDialog(false)
    setSaveToast(true)
    setTimeout(() => setSaveToast(false), 1500)
  }

  const openLogin = () => {
    setAuthMode('login')
    setShowAuth(true)
  }

  const openRegister = () => {
    setAuthMode('register')
    setShowAuth(true)
  }

  const handleGridSizeChange = (newSize) => {
    setGridSize(newSize)
    setGridWidth(null)
    setGridHeight(null)
    resetCanvas(Array(newSize).fill(null).map(() => Array(newSize).fill(null)))
  }

  const handleGridDimensionsChange = (width, height) => {
    if (width === height) {
      setGridSize(width)
      setGridWidth(null)
      setGridHeight(null)
    } else {
      setGridSize(Math.max(width, height))
      setGridWidth(width)
      setGridHeight(height)
    }
    resetCanvas(Array(height).fill(null).map(() => Array(width).fill(null)))
  }

  const handleLoadTemplate = (pattern, size) => {
    setGridSize(size)
    setGridWidth(null)
    setGridHeight(null)
    resetCanvas(pattern)
    setCurrentPage('canvas')
  }

  const handleLoadWork = (work) => {
    setGridSize(work.gridSize)
    setGridWidth(work.gridWidth ?? null)
    setGridHeight(work.gridHeight ?? null)
    setCurrentPalette(work.paletteId || 'perler')
    resetCanvas(work.canvasData)
    setCurrentPage('canvas')
  }

  // 页面切换
  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  // Enhanced resolveToHex for the quantizer apply path: falls back to searching
  // ALL palettes in case the user switched brands after quantizing.
  // Components that always know their palette use colorUtils.resolveToHex instead.
  const resolveToHexAllPalettes = (colorVal, palette) => {
    if (!colorVal) return null
    if (typeof colorVal === 'string' && colorVal.startsWith('#')) return colorVal
    const found = palette.colors.find(c => c.id === colorVal)
    if (found) return found.hex
    for (const p of Object.values(PALETTES)) {
      const hit = p.colors.find(c => c.id === colorVal)
      if (hit) return hit.hex
    }
    console.warn('resolveToHex: 无法解析颜色值', colorVal)
    return null
  }

  const handleQuantizerApply = (quantizedCanvasData, options) => {
    const w = options.gridWidth || options.gridSize
    const h = options.gridHeight || options.gridSize

    // Validate dimensions match
    if (quantizedCanvasData.length !== h) {
      console.error('量化结果高度不匹配:', quantizedCanvasData.length, 'vs', h)
      return
    }
    for (let row = 0; row < h; row++) {
      if (quantizedCanvasData[row].length !== w) {
        console.error('量化结果宽度不匹配 at row', row, ':', quantizedCanvasData[row].length, 'vs', w)
        return
      }
    }

    setGridSize(Math.max(w, h))
    setGridWidth(w !== h ? w : null)
    setGridHeight(w !== h ? h : null)

    // 将品牌 ID（如 'P18'）解析为 hex 字符串，以便 Canvas 正确渲染
    const palette = getPalette(options.palette || currentPalette)
    const resolvedData = quantizedCanvasData.map(row =>
      row.map(cell => resolveToHexAllPalettes(cell, palette))
    )
    resetCanvas(resolvedData)
    if (options.palette) setCurrentPalette(options.palette)
    setCurrentPage('canvas')
    if (w > 50 || h > 50) {
      setFitToast(true)
      setTimeout(() => setFitToast(false), 2500)
    }
  }

  const canvasProps = {
    gridSize,
    gridWidth,
    gridHeight,
    selectedColor,
    tool,
    canvasData,
    onDraw: drawCanvas,
    onCanvasChange: setCanvas,
  }

  // 移动端布局
  const renderMobileLayout = () => (
    <div className="app mobile-layout">
      <Header
        user={user}
        onLogin={openLogin}
        onRegister={openRegister}
        onLogout={logout}
        onSave={currentPage === 'canvas' ? handleOpenSaveDialog : undefined}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        simplified
      />

      {currentPage === 'canvas' ? (
        <>
          <div className="mobile-canvas-area">
            <Canvas {...canvasProps} />
          </div>

          <MobileColorPalette
            selectedColor={selectedColor}
            onColorSelect={setSelectedColor}
            currentPalette={currentPalette}
            onPaletteChange={setCurrentPalette}
            canvasData={canvasData}
          />

          <MobileToolbar
            tool={tool}
            onToolChange={setTool}
            gridSize={gridSize}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            onGridSizeChange={handleGridSizeChange}
            onGridDimensionsChange={handleGridDimensionsChange}
            onUndo={undo}
            onRedo={redo}
            onClear={handleClearCanvas}
            canUndo={canUndo}
            canRedo={canRedo}
            onExport={() => setShowExport(true)}
            onQuantize={() => setShowQuantizer(true)}
          />
        </>
      ) : (
        <div className="mobile-page-area">
          {renderPage()}
        </div>
      )}

      {showExport && (
        <ExportPanel
          canvasData={canvasData}
          gridSize={gridSize}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          designName={designName}
          paletteId={currentPalette}
          onClose={() => setShowExport(false)}
        />
      )}

      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuth(false)}
          onLogin={login}
          onRegister={register}
          onSwitchMode={(mode) => setAuthMode(mode)}
          onNavigatePage={(page) => { setShowAuth(false); handlePageChange(page); }}
        />
      )}

      {showQuantizer && (
        <Suspense fallback={null}>
          <ImageQuantizer
            onApply={handleQuantizerApply}
            onClose={() => setShowQuantizer(false)}
          />
        </Suspense>
      )}

      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="save-dialog" onClick={e => e.stopPropagation()}>
            <h3>{t('gallery.saveTitle')}</h3>
            <label>{t('gallery.saveNameLabel')}</label>
            <input
              autoFocus
              type="text"
              value={saveInputName}
              onChange={e => setSaveInputName(e.target.value)}
              placeholder={t('gallery.saveNamePlaceholder')}
              onKeyDown={e => e.key === 'Enter' && handleConfirmSave()}
            />
            <div className="save-dialog-actions">
              <button className="btn btn-ghost" onClick={() => setShowSaveDialog(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleConfirmSave}>
                {t('gallery.saveConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {saveToast && (
        <div className="save-toast">{t('gallery.savedToast')}</div>
      )}
      {fitToast && (
        <div className="fit-toast">{t('canvas.autoFitToast')}</div>
      )}
    </div>
  )

  // 渲染画布页面（桌面端）
  const renderCanvasPage = () => (
    <div className="workspace">
      <aside className={`sidebar left-sidebar${leftSidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="left-sidebar-top">
          <Tools
            tool={tool}
            onToolChange={setTool}
            gridSize={gridSize}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            onGridSizeChange={handleGridSizeChange}
            onGridDimensionsChange={handleGridDimensionsChange}
            collapsed={leftSidebarCollapsed}
            onToggleCollapse={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            onUndo={undo}
            onRedo={redo}
            onClear={handleClearCanvas}
            canUndo={canUndo}
            canRedo={canRedo}
            onOpenQuantizer={() => setShowQuantizer(true)}
          />
        </div>
        <div className="left-sidebar-bottom">
          <div className="sidebar-divider" />
          <ColorStatsBar
            canvasData={canvasData}
            gridSize={gridSize}
            paletteId={currentPalette}
          />
          <ExportPanel
            canvasData={canvasData}
            gridSize={gridSize}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            designName={designName}
            paletteId={currentPalette}
          />
        </div>
      </aside>

      <div className="canvas-area">
        <Canvas {...canvasProps} />
      </div>

      <aside className="sidebar right-sidebar">
        <ColorPalette
          selectedColor={selectedColor}
          onColorSelect={setSelectedColor}
          currentPalette={currentPalette}
          onPaletteChange={setCurrentPalette}
          collapsed={rightSidebarCollapsed}
          onToggleCollapse={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
        />
      </aside>
    </div>
  )

  // 渲染当前页面
  const renderPage = () => {
    switch (currentPage) {
      case 'gallery':
        return (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>}>
            <Gallery
              onLoadTemplate={handleLoadTemplate}
              onSaveWork={handleSaveWork}
              onLoadWork={handleLoadWork}
              savedWorks={savedWorks}
            />
          </Suspense>
        )
      case 'tutorials':
        return (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>}>
            <Tutorials />
          </Suspense>
        )
      case 'privacy':
        return <PrivacyPolicy onBack={() => handlePageChange('canvas')} />
      case 'terms':
        return <TermsOfService onBack={() => handlePageChange('canvas')} />
      default:
        return renderCanvasPage()
    }
  }

  // 桌面端布局
  const renderDesktopLayout = () => (
    <div className="app desktop-layout">
      <Header
        user={user}
        onLogin={openLogin}
        onRegister={openRegister}
        onLogout={logout}
        onSave={handleOpenSaveDialog}
        currentPage={currentPage}
        onPageChange={handlePageChange}
      />

      <main className="main-content">
        {renderPage()}
      </main>

      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuth(false)}
          onLogin={login}
          onRegister={register}
          onSwitchMode={(mode) => setAuthMode(mode)}
          onNavigatePage={(page) => { setShowAuth(false); handlePageChange(page); }}
        />
      )}

      {showQuantizer && (
        <Suspense fallback={null}>
          <ImageQuantizer
            onApply={handleQuantizerApply}
            onClose={() => setShowQuantizer(false)}
          />
        </Suspense>
      )}

      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="save-dialog" onClick={e => e.stopPropagation()}>
            <h3>{t('gallery.saveTitle')}</h3>
            <label>{t('gallery.saveNameLabel')}</label>
            <input
              autoFocus
              type="text"
              value={saveInputName}
              onChange={e => setSaveInputName(e.target.value)}
              placeholder={t('gallery.saveNamePlaceholder')}
              onKeyDown={e => e.key === 'Enter' && handleConfirmSave()}
            />
            <div className="save-dialog-actions">
              <button className="btn btn-ghost" onClick={() => setShowSaveDialog(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleConfirmSave}>
                {t('gallery.saveConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {saveToast && (
        <div className="save-toast">{t('gallery.savedToast')}</div>
      )}
      {fitToast && (
        <div className="fit-toast">{t('canvas.autoFitToast')}</div>
      )}

      <style>{`
        .left-sidebar {
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          overflow-x: hidden;
          flex-shrink: 0;
          height: calc(100vh - 60px);
          padding: 8px;
          gap: 8px;
          box-sizing: border-box;
        }
        .left-sidebar-top {
          flex-shrink: 0;
        }
        .left-sidebar-bottom {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sidebar-divider {
          height: 1px;
          background: var(--border-color);
          flex-shrink: 0;
        }
        .right-sidebar .palette-drawer {
          height: 100%;
        }
        .left-sidebar.collapsed {
          width: 56px;
          transition: width 0.2s ease;
        }
        .left-sidebar.collapsed .left-sidebar-bottom {
          display: none;
        }
        .left-sidebar.collapsed .left-sidebar-top {
          width: 56px;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
          box-sizing: border-box;
        }
        .save-toast {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--text-primary);
          color: white;
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 14px;
          z-index: 1000;
          pointer-events: none;
          white-space: nowrap;
        }
        .fit-toast {
          position: fixed;
          bottom: 88px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(43, 36, 32, 0.82);
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 13px;
          z-index: 200;
          pointer-events: none;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )

  // 根据当前页面生成动态 meta（SPA 各视图差异化 SEO）
  const seoByPage = {
    canvas: {
      title: '拼豆Studio - 在线拼豆图纸设计工具 | 图片转拼豆',
      description: '免费在线拼豆图纸设计工具，自由绘制拼豆图案，上传图片一键智能转拼豆图纸，支持Perler/Hama/Artkal三大品牌色卡。',
    },
    gallery: {
      title: '拼豆模板图库 - 拼豆Studio | 动物·食物·图标·节日',
      description: '浏览拼豆Studio内置模板图库，包含动物、食物、图标、节日四大分类，简单/中等/困难三档难度，一键加载模板开始创作。',
    },
    tutorials: {
      title: '拼豆教程 - 拼豆Studio | 入门到进阶图文教程',
      description: '拼豆Studio提供6大分类18篇拼豆图文教程，涵盖入门指南、熨烫手法、防变形、配色设计、进阶技巧、作品保护，适合新手和进阶玩家。',
    },
    privacy: {
      title: '隐私政策 - 拼豆Studio',
      description: '拼豆Studio隐私政策：了解我们如何收集、使用和保护您的个人信息。本工具绝大多数数据存储在您的浏览器本地。',
    },
    terms: {
      title: '服务条款 - 拼豆Studio',
      description: '拼豆Studio服务条款：使用本工具即表示您同意遵守本条款。了解您的权利与责任。',
    },
  }
  const seo = seoByPage[currentPage] || seoByPage.canvas

  const appContent = isMobile || isTablet
    ? renderMobileLayout()
    : renderDesktopLayout()

  return (
    <>
      <Helmet>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <link rel="canonical" href={currentPage === 'canvas' ? 'https://tangnotes.site/' : `https://tangnotes.site/?page=${currentPage}`} />
      </Helmet>
      {appContent}
    </>
  )
}