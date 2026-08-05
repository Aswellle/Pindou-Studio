import { useState, useEffect, lazy, Suspense, useRef } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
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
import useCloudTemplates from './hooks/useCloudTemplates'
import MobileColorPalette from './components/ColorPalette/MobileColorPalette'
import { getPalette, PALETTES } from './data/palettes'
import { PrivacyPolicy, TermsOfService } from './components/LegalPages'
import MobileCanvasInfoBar from './components/MobileCanvasInfoBar'

const Gallery = lazy(() => import('./components/Gallery'))
const Tutorials = lazy(() => import('./components/Tutorials'))
const ImageQuantizer = lazy(() => import('./components/ImageQuantizer/ImageQuantizer'))
const AdminPanel = lazy(() => import('./components/AdminPanel'))

export default function App() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  // iOS Safari 视口测量
  useEffect(() => {
    const setVh = () => {
      const inner = window.innerHeight || 0
      const visual = window.visualViewport?.height ?? inner
      const vh = Math.min(inner, visual) * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
    }
    const measureNextFrame = () => requestAnimationFrame(setVh)
    const onShow = (e) => { if (e.persisted) measureNextFrame() }
    setVh()
    document.addEventListener('visibilitychange', measureNextFrame)
    window.addEventListener('pageshow', onShow)
    window.addEventListener('resize', setVh)
    window.visualViewport?.addEventListener('resize', setVh)
    return () => {
      document.removeEventListener('visibilitychange', measureNextFrame)
      window.removeEventListener('pageshow', onShow)
      window.removeEventListener('resize', setVh)
      window.visualViewport?.removeEventListener('resize', setVh)
    }
  }, [])

  const { user, isAdmin, loading: authLoading, login, register, resetPassword, logout } = useAuth()
  const cloudStore = useCloudTemplates()
  const { isMobile, isTablet } = useResponsive()
  const canvasRef = useRef(null)
  const [mobileScale, setMobileScale] = useState(1)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [selectedColor, setSelectedColor] = useState('#E53935')
  const [tool, setTool] = useState('pencil')
  const [gridSize, setGridSize] = useState(29)
  const [gridWidth, setGridWidth] = useState(null)
  const [gridHeight, setGridHeight] = useState(null)
  const { canvasData, canUndo, canRedo, setCanvas, resetCanvas, undo, redo } = useHistory()
  const { works: savedWorks, saveWork, updateWorks: handleSaveWork } = useSavedWorks()

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [showQuantizer, setShowQuantizer] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [currentPalette, setCurrentPalette] = useState('perler')
  const [designName, setDesignName] = useState('拼豆图案')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveInputName, setSaveInputName] = useState('')
  const [saveToast, setSaveToast] = useState(false)
  const [fitToast, setFitToast] = useState(false)

  // 从 URL 路径推导当前页面(用于 Header 高亮与条件渲染)
  const currentPage = location.pathname.startsWith('/gallery') ? 'gallery'
    : location.pathname.startsWith('/tutorials') ? 'tutorials'
    : location.pathname.startsWith('/admin') ? 'admin'
    : location.pathname.startsWith('/privacy') ? 'privacy'
    : location.pathname.startsWith('/terms') ? 'terms'
    : 'canvas'

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
    navigate('/')
  }

  const handleLoadWork = (work) => {
    setGridSize(work.gridSize)
    setGridWidth(work.gridWidth ?? null)
    setGridHeight(work.gridHeight ?? null)
    setCurrentPalette(work.paletteId || 'perler')
    resetCanvas(work.canvasData)
    navigate('/')
  }

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

    const palette = getPalette(options.palette || currentPalette)
    const resolvedData = quantizedCanvasData.map(row =>
      row.map(cell => resolveToHexAllPalettes(cell, palette))
    )
    resetCanvas(resolvedData)
    if (options.palette) setCurrentPalette(options.palette)
    navigate('/')
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
    committedData: canvasData,
    onCanvasChange: setCanvas,
  }

  // 页面切换(通过路由)
  const handlePageChange = (page) => {
    if (page === 'canvas') navigate('/')
    else navigate(`/${page}`)
  }

  // 桌面端画布页
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
          <ColorStatsBar
            canvasData={canvasData}
            gridSize={gridSize}
            paletteId={currentPalette}
          />
          {/* 桌面端侧边栏常驻实例:不传 onClose(有 onClose 会被判定为模态框实例并默认展开) */}
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

      <main className="canvas-area">
        <Canvas {...canvasProps} />
      </main>

      <aside className="sidebar right-sidebar">
        <ColorPalette
          selectedColor={selectedColor}
          onColorSelect={setSelectedColor}
          currentPalette={currentPalette}
          onPaletteChange={setCurrentPalette}
          collapsed={rightSidebarCollapsed}
          onToggleCollapse={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
          canvasData={canvasData}
        />
      </aside>
    </div>
  )

  // 桌面端布局
  const renderDesktopLayout = () => (
    <div className="app desktop-layout">
      {/* 后台管理页隐藏顶部导航栏,专注管理界面 */}
      {currentPage !== 'admin' && (
        <Header
          user={user}
          onLogin={openLogin}
          onRegister={openRegister}
          onLogout={logout}
          onSave={currentPage === 'canvas' ? handleOpenSaveDialog : undefined}
          currentPage={currentPage}
          onPageChange={handlePageChange}
        />
      )}

      <main className="main-content" style={currentPage === 'admin' ? { marginTop: 0 } : undefined}>
        <Routes>
          <Route path="/" element={renderCanvasPage()} />
          <Route path="/gallery" element={
            <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>}>
              <Gallery
                onLoadTemplate={handleLoadTemplate}
                onSaveWork={handleSaveWork}
                onLoadWork={handleLoadWork}
                savedWorks={savedWorks}
                cloudStore={cloudStore}
              />
            </Suspense>
          } />
          <Route path="/tutorials" element={
            <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>}>
              <Tutorials />
            </Suspense>
          } />
          <Route path="/admin" element={
            <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>}>
              <AdminPanel
                user={user}
                isAdmin={isAdmin}
                authLoading={authLoading}
                onLogin={openLogin}
                onLogout={logout}
                onResetPassword={resetPassword}
                cloudStore={cloudStore}
              />
            </Suspense>
          } />
          <Route path="/privacy" element={<PrivacyPolicy onBack={() => navigate('/')} />} />
          <Route path="/terms" element={<TermsOfService onBack={() => navigate('/')} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

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
          onResetPassword={resetPassword}
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
          padding: 12px 24px;
          border-radius: 20px;
          font-size: var(--text-base);
          z-index: 1100;
          box-shadow: var(--shadow-card);
          animation: toastIn 0.3s ease;
        }
        .fit-toast {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--secondary-accent);
          color: white;
          padding: 12px 24px;
          border-radius: 20px;
          font-size: var(--text-base);
          z-index: 1100;
          box-shadow: var(--shadow-card);
          animation: toastIn 0.3s ease;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )

  // 移动端布局
  const renderMobileLayout = () => (
    <div className="app mobile-layout">
      {/* 后台管理页隐藏顶部导航栏,专注管理界面 */}
      {currentPage !== 'admin' && (
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
      )}

      <Routes>
        <Route path="/" element={
          <>
            <MobileCanvasInfoBar
              gridSize={gridSize}
              gridWidth={gridWidth}
              gridHeight={gridHeight}
              scale={mobileScale}
              onReset={() => canvasRef.current?.resetTransform()}
              onFit={() => canvasRef.current?.fitToScreen()}
            />
            <div className="mobile-canvas-area">
              <Canvas
                {...canvasProps}
                ref={canvasRef}
                onTransformChange={setMobileScale}
              />
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
        } />
        <Route path="/gallery" element={
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>}>
            <div className="mobile-page-area">
              <Gallery
                onLoadTemplate={handleLoadTemplate}
                onSaveWork={handleSaveWork}
                onLoadWork={handleLoadWork}
                savedWorks={savedWorks}
                cloudStore={cloudStore}
              />
            </div>
          </Suspense>
        } />
        <Route path="/tutorials" element={
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>}>
            <div className="mobile-page-area">
              <Tutorials />
            </div>
          </Suspense>
        } />
        <Route path="/admin" element={
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>}>
            <AdminPanel
              user={user}
              isAdmin={isAdmin}
              authLoading={authLoading}
              onLogin={openLogin}
              onLogout={logout}
              onResetPassword={resetPassword}
              cloudStore={cloudStore}
            />
          </Suspense>
        } />
        <Route path="/privacy" element={<PrivacyPolicy onBack={() => navigate('/')} />} />
        <Route path="/terms" element={<TermsOfService onBack={() => navigate('/')} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

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
          onResetPassword={resetPassword}
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
          padding: 12px 24px;
          border-radius: 20px;
          font-size: var(--text-base);
          z-index: 1100;
          box-shadow: var(--shadow-card);
          animation: toastIn 0.3s ease;
        }
        .fit-toast {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--secondary-accent);
          color: white;
          padding: 12px 24px;
          border-radius: 20px;
          font-size: var(--text-base);
          z-index: 1100;
          box-shadow: var(--shadow-card);
          animation: toastIn 0.3s ease;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )

  // 根据设备类型返回对应布局
  return isMobile || isTablet ? renderMobileLayout() : renderDesktopLayout()
}
