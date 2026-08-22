import { useState, useEffect, lazy, Suspense, useRef, useCallback } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from './i18n'
import { Helmet } from 'react-helmet-async'
import AuthPage from './components/AuthPage'
import AdminLoginPage from './components/AdminLoginPage'
import Header from './components/Header'
import Canvas from './components/Canvas'
import LoadingScreen from './components/LoadingScreen'
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
import PixelPet from './components/PixelPet'
import MobileCanvasInfoBar from './components/MobileCanvasInfoBar'

const Gallery = lazy(() => import('./components/Gallery'))
const Tutorials = lazy(() => import('./components/Tutorials'))
const ImageQuantizer = lazy(() => import('./components/ImageQuantizer/ImageQuantizer'))
// AdminPanel 同步引入:登录后进入后台无懒加载等待,避免画面闪动
import AdminPanel from './components/AdminPanel'

export default function App() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  // 法律页「返回」:优先回退到进入该页前的浏览页(保留上下文,PC/移动端一致);
  // 无可回退历史(如直接深链进入)时兜底回到首页,避免卡死在空白。
  const handleLegalBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

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

  const { user, isAdmin, loading: authLoading, login, register, resetPassword, logout, updateProfile,
    sendOtp, verifyOtp, setPassword, changePassword, registerUsername, loginByUsername, forgotPasswordCustom, usernameExists } = useAuth()
  const cloudStore = useCloudTemplates()
  const { isMobile, isTablet } = useResponsive()
  const canvasRef = useRef(null)
  const [mobileScale, setMobileScale] = useState(1)
  const [selectedColor, setSelectedColor] = useState('#E53935')
  const [tool, setTool] = useState('pencil')
  const [gridSize, setGridSize] = useState(29)
  const [gridWidth, setGridWidth] = useState(null)
  const [gridHeight, setGridHeight] = useState(null)
  const { canvasData, canUndo, canRedo, setCanvas, resetCanvas, undo, redo } = useHistory()

  // 撤销/重做前先丢弃活动笔画,避免笔画进行中 undo 后 mouseUp 时 commitStroke 重推快照回滚
  const handleUndo = useCallback(() => { canvasRef.current?.cancelStroke?.(); undo() }, [undo])
  const handleRedo = useCallback(() => { canvasRef.current?.cancelStroke?.(); redo() }, [redo])
  const { works: savedWorks, worksLoading, syncCount, cloudMirrorCount, saveWork, deleteWork, ackSync } = useSavedWorks(user)

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [showQuantizer, setShowQuantizer] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [currentPalette, setCurrentPalette] = useState('perler')
  const [designName, setDesignName] = useState(() => t('export.defaultName'))
  // 语言切换时同步默认导出名(designName 只作默认值,用户自定义名走 saveInputName)
  useEffect(() => { setDesignName(t('export.defaultName')) }, [i18n.language, t])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveInputName, setSaveInputName] = useState('')
  const [saveToast, setSaveToast] = useState(false)
  const [fitToast, setFitToast] = useState(false)
  const [syncToast, setSyncToast] = useState(false)

  // 登录迁移完成后展示「已同步 N 幅作品到云端」toast
  useEffect(() => {
    if (syncCount == null) return
    setSyncToast(true)
    const timer = setTimeout(() => { setSyncToast(false); ackSync() }, 4000)
    return () => clearTimeout(timer)
  }, [syncCount, ackSync])

  // 从 URL 路径推导当前页面(用于 Header 高亮与条件渲染)
  const currentPage = location.pathname.startsWith('/gallery') ? 'gallery'
    : location.pathname.startsWith('/tutorials') ? 'tutorials'
    : location.pathname.startsWith('/admin/login') ? 'adminLogin'
    : location.pathname.startsWith('/admin') ? 'admin'
    : location.pathname.startsWith('/privacy') ? 'privacy'
    : location.pathname.startsWith('/terms') ? 'terms'
    : location.pathname.startsWith('/login') ? 'login'
    : 'canvas'
  // 独立页(登录/注册/管理员登录/隐私/条款):隐藏站点导航栏与操作按钮,只保留 LOGO + 返回,避免元素冲突
  const isStandalonePage = currentPage === 'login' || currentPage === 'adminLogin' || currentPage === 'privacy' || currentPage === 'terms'

  // Initialize blank canvas on first render and when grid size changes with no data
  useEffect(() => {
    if (!canvasData) {
      resetCanvas(Array(gridSize).fill(null).map(() => Array(gridSize).fill(null)))
    }
  }, [gridSize])

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo
  useEffect(() => {
    const handler = (e) => {
      // 输入控件聚焦时交还原生文本撤销/重做,不拦截
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  // Lock body scroll while any modal is open; reset iOS Safari viewport offset on close
  const anyModalOpen = showQuantizer || showSaveDialog || showExport
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

  const handleConfirmSave = async () => {
    const ok = await saveWork({
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

  const openLogin = () => navigate('/login', { state: { mode: 'login' } })

  const openRegister = () => navigate('/login', { state: { mode: 'register' } })

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

  const handleLoadTemplate = (pattern, size, options = {}) => {
    setGridSize(size)
    setGridWidth(null)
    setGridHeight(null)
    // 载入模板时同步切换到其所属(或用户指定转换的)拼豆品牌色卡
    if (options.palette) setCurrentPalette(options.palette)
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
  const renderAdminLoginPage = () => (
    <AdminLoginPage onLogin={login} />
  )

  const renderAuthPage = () => (
    <AuthPage
      initialMode={location.state?.mode === 'register' ? 'register' : 'login'}
      onLogin={login}
      onRegister={register}
      loginByUsername={loginByUsername}
      registerUsername={registerUsername}
      forgotPasswordCustom={forgotPasswordCustom}
      resetPassword={resetPassword}
      onSendOtp={sendOtp}
      onVerifyOtp={verifyOtp}
      onSetPassword={setPassword}
      usernameExists={usernameExists}
      onUpdateProfile={updateProfile}
    />
  )

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
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClearCanvas}
            canUndo={canUndo}
            canRedo={canRedo}
            onOpenQuantizer={() => setShowQuantizer(true)}
          />
        </div>
        <div className="left-sidebar-bottom">
          <ColorStatsBar
            canvasData={canvasData}
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
        />
      </aside>
    </div>
  )

  // 桌面端布局
  const renderDesktopLayout = () => (
    <div className="app desktop-layout">
      {/* 后台管理页与独立页(登录/隐私/条款)隐藏顶部导航栏 */}
      {currentPage !== 'admin' && !isStandalonePage && (
        <Header
          user={user}
          onLogin={openLogin}
          onRegister={openRegister}
          onLogout={logout}
          onSave={currentPage === 'canvas' ? handleOpenSaveDialog : undefined}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          onUpdateProfile={updateProfile}
          onChangePassword={changePassword}
        />
      )}

      <main className="main-content" style={(currentPage === 'admin' || isStandalonePage) ? { marginTop: 0 } : undefined}>
        <Routes>
          <Route path="/" element={renderCanvasPage()} />
          <Route path="/login" element={renderAuthPage()} />
          <Route path="/gallery" element={
            <Suspense fallback={<LoadingScreen />}>
              <Gallery
                onLoadTemplate={handleLoadTemplate}
                onDeleteWork={deleteWork}
                onLoadWork={handleLoadWork}
                savedWorks={savedWorks}
                worksLoading={worksLoading}
                cloudMirrorCount={cloudMirrorCount}
                cloudStore={cloudStore}
                user={user}
                onLogin={openLogin}
                onRegister={openRegister}
              />
            </Suspense>
          } />
          <Route path="/tutorials" element={
            <Suspense fallback={<LoadingScreen />}>
              <Tutorials />
            </Suspense>
          } />
          <Route path="/admin/login" element={renderAdminLoginPage()} />
          <Route path="/admin" element={
            <AdminPanel
              user={user}
              isAdmin={isAdmin}
              authLoading={authLoading}
              onLogin={() => navigate('/admin/login')}
              onLogout={logout}
              onChangePassword={changePassword}
              cloudStore={cloudStore}
            />
          } />
          <Route path="/privacy" element={<PrivacyPolicy onBack={handleLegalBack} />} />
          <Route path="/privacy/:versionId" element={<PrivacyPolicy onBack={handleLegalBack} />} />
          <Route path="/terms" element={<TermsOfService onBack={handleLegalBack} />} />
          <Route path="/terms/:versionId" element={<TermsOfService onBack={handleLegalBack} />} />
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
            {/* 保存落点提示:匿名 → 本机保存 + 注册软引导;登录 → 云端保存 */}
            {!user ? (
              <div className="save-local-hint">
                <p>{t('auth.saveLocalHint')}</p>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => { setShowSaveDialog(false); openRegister() }}
                >
                  {t('auth.registerAccount')} →
                </button>
              </div>
            ) : (
              <div className="save-local-hint">
                <p>{t('auth.saveCloudHint')}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {saveToast && (
        <div className="save-toast">{user ? t('gallery.savedToastCloud') : t('gallery.savedToast')}</div>
      )}
      {syncToast && (
        <div className="sync-toast">{t('auth.syncToast', { n: syncCount })}</div>
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
        .sync-toast {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--accent);
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
      {/* 后台管理页与独立页(登录/隐私/条款)隐藏顶部导航栏 */}
      {currentPage !== 'admin' && !isStandalonePage && (
        <Header
          user={user}
          onLogin={openLogin}
          onRegister={openRegister}
          onLogout={logout}
          onSave={currentPage === 'canvas' ? handleOpenSaveDialog : undefined}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          onUpdateProfile={updateProfile}
          onChangePassword={changePassword}
          simplified
        />
      )}

      <Routes>
        <Route path="/login" element={renderAuthPage()} />
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
          <Suspense fallback={<LoadingScreen />}>
            <div className="mobile-page-area">
              <Gallery
                onLoadTemplate={handleLoadTemplate}
                onDeleteWork={deleteWork}
                onLoadWork={handleLoadWork}
                savedWorks={savedWorks}
                worksLoading={worksLoading}
                cloudMirrorCount={cloudMirrorCount}
                cloudStore={cloudStore}
                user={user}
                onLogin={openLogin}
                onRegister={openRegister}
              />
            </div>
          </Suspense>
        } />
        <Route path="/tutorials" element={
          <Suspense fallback={<LoadingScreen />}>
            <div className="mobile-page-area">
              <Tutorials />
            </div>
          </Suspense>
        } />
        <Route path="/admin/login" element={renderAdminLoginPage()} />
        <Route path="/admin" element={
          <Suspense fallback={<LoadingScreen />}>
            <AdminPanel
              user={user}
              isAdmin={isAdmin}
              authLoading={authLoading}
              onLogin={() => navigate('/admin/login')}
              onLogout={logout}
              onChangePassword={changePassword}
              cloudStore={cloudStore}
            />
          </Suspense>
        } />
        <Route path="/privacy" element={<PrivacyPolicy onBack={handleLegalBack} />} />
        <Route path="/privacy/:versionId" element={<PrivacyPolicy onBack={handleLegalBack} />} />
        <Route path="/terms" element={<TermsOfService onBack={handleLegalBack} />} />
        <Route path="/terms/:versionId" element={<TermsOfService onBack={handleLegalBack} />} />
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
            {/* 保存落点提示:匿名 → 本机保存 + 注册软引导;登录 → 云端保存 */}
            {!user ? (
              <div className="save-local-hint">
                <p>{t('auth.saveLocalHint')}</p>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => { setShowSaveDialog(false); openRegister() }}
                >
                  {t('auth.registerAccount')} →
                </button>
              </div>
            ) : (
              <div className="save-local-hint">
                <p>{t('auth.saveCloudHint')}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {saveToast && (
        <div className="save-toast">{user ? t('gallery.savedToastCloud') : t('gallery.savedToast')}</div>
      )}
      {syncToast && (
        <div className="sync-toast">{t('auth.syncToast', { n: syncCount })}</div>
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
        .sync-toast {
          position: fixed;
          top: 72px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--accent);
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


  // ── 每页动态 SEO(不改变功能与界面)───────────────────────
  const SEO_CONFIG = {
    canvas: {
      title: '拼豆Studio - 在线拼豆图纸设计工具 | 图片转拼豆 · 支持Perler/Hama/Artkal',
      desc: '免费的在线拼豆图纸设计工具。支持画笔、橡皮、填充、抓手工具自由绘制拼豆图案；上传图片一键智能转换为拼豆图纸(CIEDE2000精准配色)；支持Perler、Hama、Artkal三大品牌色卡；导出专业级PNG/SVG图纸，带色号标注与颜色清单。',
    },
    gallery: {
      title: '拼豆图库与模板 - 拼豆Studio',
      desc: '浏览并收藏拼豆图案模板，按分类与难度筛选，一键载入画布开始创作。支持收藏与作品管理，适合拼豆爱好者和手工达人。',
    },
    tutorials: {
      title: '拼豆教程 - 从入门到进阶 · 拼豆Studio',
      desc: '系统学习拼豆制作：入门指南、熨烫全解、防变形技巧、配色设计、进阶技巧与作品保护，配有图示与温度对照表，新手友好。',
    },
    admin: {
      title: '后台管理 - 拼豆Studio',
      desc: '拼豆Studio 站点后台管理。',
      noindex: true,
    },
    privacy: {
      title: '隐私政策 - 拼豆Studio',
      desc: '了解拼豆Studio如何收集、使用和保护您的个人信息，以及账号验证、云端存储与第三方服务的详细说明。',
    },
    terms: {
      title: '服务条款 - 拼豆Studio',
      desc: '使用拼豆Studio在线拼豆图纸设计工具的服务条款：账户安全、用户内容、模板库与使用规范。',
    },
  }

  const seo = SEO_CONFIG[currentPage] || SEO_CONFIG.canvas
  const canonical = currentPage === 'canvas'
    ? 'https://tangnotes.site/'
    : `https://tangnotes.site/${currentPage}`
  const hreflangHref = (code) => {
    if (code === 'zh-CN') return canonical
    const sep = canonical.includes('?') ? '&' : '?'
    return `${canonical}${sep}lang=${code.toLowerCase()}`
  }
  const seoHelmet = (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.desc} />
      <meta name="robots" content={seo.noindex ? 'noindex, nofollow' : 'index, follow'} />
      <link rel="canonical" href={canonical} />
      {LANGUAGES.map(l => (
        <link key={l.code} rel="alternate" hrefLang={l.code} href={hreflangHref(l.code)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href="https://tangnotes.site/" />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.desc} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://tangnotes.site/og-image.svg" />
      <meta name="twitter:card" content="summary_large_image" />
    </Helmet>
  )

  // 根据设备类型返回对应布局
  return (
    <>
      {seoHelmet}
      {isMobile || isTablet ? renderMobileLayout() : renderDesktopLayout()}
      {/* 拼豆爱宠「豆豆」:仅桌面端,漂浮于视口底部边界线上 */}
      {!(isMobile || isTablet) && <PixelPet />}
    </>
  )
}
