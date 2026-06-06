import { useState, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
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

const Gallery = lazy(() => import('./components/Gallery'))
const Tutorials = lazy(() => import('./components/Tutorials'))
const ImageQuantizer = lazy(() => import('./components/ImageQuantizer/ImageQuantizer'))

export default function App() {
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
  const { canvasData, canUndo, canRedo, setCanvas, resetCanvas, undo, redo } = useHistory()
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

  const handleClearCanvas = () => {
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
        currentPage={currentPage}
        onPageChange={handlePageChange}
        simplified
      />

      <div className="mobile-canvas-area">
        <Canvas {...canvasProps} />
      </div>

      <MobileColorPalette
        selectedColor={selectedColor}
        onColorSelect={setSelectedColor}
        currentPalette={currentPalette}
        onPaletteChange={setCurrentPalette}
      />

      <MobileToolbar
        tool={tool}
        onToolChange={setTool}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onExport={() => setShowExport(true)}
        onQuantize={() => setShowQuantizer(true)}
      />

      {showExport && (
        <ExportPanel
          canvasData={canvasData}
          gridSize={gridSize}
          designName={designName}
          paletteId={currentPalette}
          onClose={() => setShowExport(false)}
        />
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
        <div className="fit-toast">已自动适应屏幕 · 双击画布可重置</div>
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
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 500;
        }
        .save-dialog {
          background: var(--bg-primary);
          border-radius: 12px;
          padding: 24px;
          width: 360px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.18);
        }
        .save-dialog h3 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }
        .save-dialog label {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: -4px;
        }
        .save-dialog input {
          padding: 10px 12px;
          border: 2px solid var(--border-color);
          border-radius: 8px;
          font-size: 14px;
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .save-dialog input:focus {
          border-color: var(--accent);
          outline: none;
          background: var(--bg-primary);
        }
        .save-dialog-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 4px;
        }
        .save-toast {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: #1a1a1a;
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
          background: rgba(0, 0, 0, 0.72);
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

  // 根据设备类型渲染不同布局
  if (isMobile || isTablet) {
    return renderMobileLayout()
  }

  return renderDesktopLayout()
}