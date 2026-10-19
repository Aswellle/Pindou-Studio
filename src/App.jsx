import { useState, useEffect, lazy, Suspense, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import useKeyboardSafe from './hooks/useKeyboardSafe'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, initialLangParam } from './i18n'
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
import ReplaceColorDialog from './components/ReplaceColorDialog'
import MyBeadsPage from './components/MyBeadsPage'
import { useToast } from './components/Toast'
import {
  fillSelection,
  clearSelection as clearSelectionRegion,
  mirrorSelection,
  rotateSelection,
  replaceColor,
} from './utils/selectionUtils'
import { useAuth } from './hooks/useAuth'
import { useResponsive } from './hooks/useResponsive'
import { useHistory } from './hooks/useHistory'
import { useSavedWorks } from './hooks/useSavedWorks'
import { useScrollLock } from './hooks/useScrollLock'
import { canonicalPathFor } from './utils/seoPath'
import { canvasToLegacyWork, normalizeLegacyWork } from './services/project/adapters'
import ImportPage from './components/ImportPage'
import MobileToolbar from './components/Tools/MobileToolbar'
import useCloudTemplates from './hooks/useCloudTemplates'
import MobileColorPalette from './components/ColorPalette/MobileColorPalette'
import { getPalette, PALETTES } from './data/palettes'
import { PrivacyPolicy, TermsOfService } from './components/LegalPages'
import MobileCanvasInfoBar from './components/MobileCanvasInfoBar'
const CreateImagePage = lazy(() => import('./components/CreateImagePage'))
import ProfilePage from './components/ProfilePage'
// Gallery V2:已对齐 V1 全部功能并通过灰度验证,接任 /gallery 主路由
// (V1 Gallery.jsx 源码转存 _legacy/ 本地归档,不再入库)
const GalleryPage = lazy(() => import('./features/gallery/GalleryPage'))
// 图库内容发现(M7):主题 / 合集 / 公共图纸详情
const ThemePage = lazy(() => import('./features/gallery/ThemePage'))
const CollectionPage = lazy(() => import('./features/gallery/CollectionPage'))
const PatternDetailPage = lazy(() => import('./features/gallery/PatternDetailPage'))
// 管理概览懒加载:recharts 图表库随之进入独立 chunk,普通用户不下载
const AdminDashboardPage = lazy(() => import('./components/AdminDashboardPage'))
const Tutorials = lazy(() => import('./components/Tutorials'))
import AdminPanel from './components/AdminPanel'

export default function App() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  // 法律页「返回」:优先回退到进入该页前的浏览页(保留上下文,PC/移动端一致);
  // 无可回退历史(如直接深链进入)时兜底回到首页,避免卡死在空白。
  const handleLegalBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  // iOS Safari 视口测量已由 useKeyboardSafe 统一处理(监听 visualViewport + 键盘 focusin/focusout,
  // 同时更新 --vh 与 --visible-vh),此处不再重复注册。

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

  // M5:矩形选区与颜色替换。
  // selection 只描述矩形(网格坐标),真正的矩阵变更全部走 setCanvas,
  // 因此每个命令天然是「一次撤销回到原矩阵」。
  const [selection, setSelection] = useState(null)
  const [showReplace, setShowReplace] = useState(false)

  // 切页 / 网格尺寸变化(换模板、载入作品、调整画布)后,旧选区坐标可能失效
  // → 清空。普通绘制不改变网格,选区矩形仍然有效,无需清空。
  useEffect(() => {
    setSelection(null)
  }, [location.pathname, gridSize, gridWidth, gridHeight])

  // 撤销/重做前先丢弃活动笔画,避免笔画进行中 undo 后 mouseUp 时 commitStroke 重推快照回滚
  const handleUndo = useCallback(() => { canvasRef.current?.cancelStroke?.(); undo() }, [undo])
  const handleRedo = useCallback(() => { canvasRef.current?.cancelStroke?.(); redo() }, [redo])
  const { works: savedWorks, worksLoading, syncCount, cloudMirrorCount, saveWork, deleteWork, ackSync } = useSavedWorks(user)

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
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
    : location.pathname.startsWith('/create/image') ? 'createImage'
    : location.pathname.startsWith('/import') ? 'import'
    : location.pathname.startsWith('/my/beads') ? 'myBeads'
    : location.pathname.startsWith('/profile') ? 'profile'
    : 'canvas'
  // 核心功能页不继承站点导航，页面内部提供自己的返回与操作层。
  const isStandalonePage = currentPage === 'login' || currentPage === 'adminLogin' || currentPage === 'privacy' || currentPage === 'terms' || currentPage === 'createImage' || currentPage === 'import' || currentPage === 'profile' || currentPage === 'myBeads'

  // iOS Safari 键盘安全(全站统一,防复发机制):
  // 监听 visual viewport 的 resize/scroll 与聚焦,把可视高度写入 --visible-vh、
  // 视口顶部偏移写入 --visible-vh-top。所有需要响应键盘收缩的可滚动容器
  // (floating overlay / 页面 / 面板)引用这两个变量即可随键盘自动收缩复位。
  useKeyboardSafe()

  // 保存作品弹层打开时锁定背景滚动(防 iOS 键盘 pop 起时 body 被顶开)
  // 由 useScrollLock 统一引用计数:与其他弹层叠加时不会互相清锁。
  useScrollLock(showSaveDialog)

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

  // 保存/导出弹层同时打开时用 fixed 锁(记录并回滚滚动位置);单独保存弹层只需 overflow 锁。
  // 统一走引用计数,避免与 ContactUsModal / ImageQuantizer 等弹层互相覆盖。
  const anyModalOpen = showSaveDialog || showExport
  useScrollLock(anyModalOpen, { fixed: showExport })

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
    // 作品字段由 adapter 统一构造:尺寸以 canvasData 实际形状为准,
    // 不再手工拼 gridSize/gridWidth/gridHeight(三者历史上会与数据不一致)。
    const work = canvasToLegacyWork({
      canvasData,
      name: saveInputName.trim() || designName,
      paletteId: currentPalette,
      id: Date.now(),
      savedAt: new Date().toISOString()
    })
    if (!work) return
    const ok = await saveWork(work)
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
    // 矩形模板由 Gallery 传入真实宽高;方形模板不传,沿用旧的 size 单值语义
    const width = Number(options.gridWidth) || size
    const height = Number(options.gridHeight) || size
    if (width === height) {
      setGridSize(width)
      setGridWidth(null)
      setGridHeight(null)
    } else {
      setGridSize(Math.max(width, height))
      setGridWidth(width)
      setGridHeight(height)
    }
    // 载入模板时同步切换到其所属(或用户指定转换的)拼豆品牌色卡
    if (options.palette) setCurrentPalette(options.palette)
    resetCanvas(pattern)
    navigate('/')
  }

  const handleLoadWork = (rawWork) => {
    // 载入前归一:旧作品的声明尺寸可能与 canvasData 实际形状不一致,
    // 直接 setGridSize 会让画布网格与数据错位(多出的行画不出来、少的行越界)。
    const work = normalizeLegacyWork(rawWork)
    setGridSize(work.gridSize)
    setGridWidth(work.gridWidth ?? null)
    setGridHeight(work.gridHeight ?? null)
    setCurrentPalette(work.paletteId || 'perler')
    resetCanvas(work.canvasData)
    navigate('/')
  }

  // 导入的项目直接进画布继续编辑(不落库;用户可再点保存决定是否留存)
  const handleLoadImportedProject = (project) => {
    const grid = project?.grid
    if (!grid || !Array.isArray(grid.cells)) return
    const isSquare = grid.width === grid.height
    setGridSize(Math.max(grid.width, grid.height))
    setGridWidth(isSquare ? null : grid.width)
    setGridHeight(isSquare ? null : grid.height)
    if (project.palette?.paletteId) setCurrentPalette(project.palette.paletteId)
    resetCanvas(grid.cells.map(row => [...row]))
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
    // 不再在这里 navigate('/'):图片转拼豆是独立页面,应用完成后由该页面的 onClose
    // 负责返回(历史回退/深链兜底)。两处各自导航会互相抵消,把用户留在转换页。
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
    // M5:取色器把颜色写回当前选中色;选区由画布拖出、App 持有
    onPickColor: (hex) => {
      setSelectedColor(hex)
      toast(t('tools.pickedColorToast', { hex }), 'success')
    },
    selection,
    onSelectionChange: setSelection,
  }

  // ── M5 选区命令 ─────────────────────────────────────────────
  // 每个命令都只调用一次 setCanvas(单条历史),返回 null 表示无变化、不压栈。
  const handleSelectionCommand = useCallback((command) => {
    if (!selection) {
      toast(t('tools.selectionEmpty'), 'error')
      return
    }
    let result
    if (command === 'fill') result = fillSelection(canvasData, selection, selectedColor)
    else if (command === 'erase') result = clearSelectionRegion(canvasData, selection)
    else if (command === 'mirrorH') result = mirrorSelection(canvasData, selection, 'horizontal')
    else if (command === 'mirrorV') result = mirrorSelection(canvasData, selection, 'vertical')
    else if (command === 'rotateCw') result = rotateSelection(canvasData, selection, 'cw')
    else if (command === 'rotateCcw') result = rotateSelection(canvasData, selection, 'ccw')
    else return

    if (!result.data) {
      // 内容本来就一样:不写历史,但旋转仍需把选框换成新的宽高
      if (result.selection) setSelection(result.selection)
      return
    }
    setCanvas(result.data)
    if (result.selection) setSelection(result.selection)
    // 旋转后宽高互换,选框跟随;其余命令保持原选区
    const toastKey = {
      fill: 'tools.selectionFilledToast',
      erase: 'tools.selectionClearedToast',
      mirrorH: 'tools.selectionMirroredToast',
      mirrorV: 'tools.selectionMirroredToast',
      rotateCw: 'tools.selectionRotatedToast',
      rotateCcw: 'tools.selectionRotatedToast',
    }[command]
    if (toastKey) toast(t(toastKey, { n: result.changed }), 'success')
  }, [selection, canvasData, selectedColor, setCanvas, toast, t])

  const handleClearSelection = useCallback(() => setSelection(null), [])

  // 颜色替换:一次事务替换,命中数量在对话框内已确认
  const handleConfirmReplace = useCallback((from, to) => {
    const result = replaceColor(canvasData, from, to)
    setShowReplace(false)
    if (!result.data) return
    setCanvas(result.data)
    toast(t('tools.replacedToast', { n: result.changed }), 'success')
  }, [canvasData, setCanvas, toast, t])

  // M6:图纸匹配确认后的批量替色。只调用一次 setCanvas → 一条可撤销历史。
  const handleApplyBeadMapping = useCallback((nextData) => {
    if (!nextData) return
    setCanvas(nextData)
  }, [setCanvas])

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
            onOpenQuantizer={() => navigate('/create/image')}
            onOpenImport={() => navigate('/import')}
            selection={selection}
            onSelectionCommand={handleSelectionCommand}
            onClearSelection={handleClearSelection}
            onOpenReplace={() => setShowReplace(true)}
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
        />
      )}

      <main className="main-content" style={(currentPage === 'admin' || isStandalonePage) ? { marginTop: 0 } : undefined}>
        <Routes>
          <Route path="/" element={renderCanvasPage()} />
          <Route path="/login" element={renderAuthPage()} />
          <Route path="/gallery" element={
            <Suspense fallback={<LoadingScreen />}>
              <GalleryPage
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
          <Route path="/gallery/theme/:slug" element={
            <Suspense fallback={<LoadingScreen />}>
              <ThemePage cloudStore={cloudStore} />
            </Suspense>
          } />
          <Route path="/gallery/collection/:slug" element={
            <Suspense fallback={<LoadingScreen />}>
              <CollectionPage cloudStore={cloudStore} />
            </Suspense>
          } />
          <Route path="/gallery/pattern/:id" element={
            <Suspense fallback={<LoadingScreen />}>
              <PatternDetailPage
                cloudStore={cloudStore}
                onSaveProject={saveWork}
                onLoadTemplate={handleLoadTemplate}
              />
            </Suspense>
          } />
          <Route path="/tutorials" element={
            <Suspense fallback={<LoadingScreen />}>
              <Tutorials />
            </Suspense>
          } />
          <Route path="/profile" element={
            <ProfilePage
              user={user}
              authLoading={authLoading}
              onLogout={logout}
              onUpdateProfile={updateProfile}
              onChangePassword={changePassword}
            />
          } />

          <Route path="/create/image" element={
            <Suspense fallback={<LoadingScreen />}>
              <CreateImagePage onApply={handleQuantizerApply} />
            </Suspense>
          } />

          <Route path="/import" element={
            <ImportPage
              onLoadProject={handleLoadImportedProject}
              onSaveProject={saveWork}
            />
          } />

          <Route path="/my/beads" element={
            <MyBeadsPage
              user={user}
              canvasData={canvasData}
              onApplyMapping={handleApplyBeadMapping}
            />
          } />

          <Route path="/admin/dashboard" element={
            <Suspense fallback={<LoadingScreen />}>
              <AdminDashboardPage
                cloudStore={cloudStore}
                user={user}
                isAdmin={isAdmin}
                authLoading={authLoading}
                onLogin={() => navigate('/admin/login')}
                onLogout={logout}
              />
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

      {showSaveDialog && createPortal(
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="save-dialog" onClick={e => e.stopPropagation()}>
            <h3>{t('gallery.saveTitle')}</h3>
            <label>{t('gallery.saveNameLabel')}</label>
            {/* 移动端不自动聚焦(规格 08 §5):autoFocus 会立刻唤起键盘,
                用户刚点「保存」就被键盘盖掉半屏,还与浮层收缩动画互相竞争,
                iOS 上容易把弹层顶出可视区。桌面端保持原有自动聚焦。 */}
            <input
              autoFocus={!isMobile && !isTablet}
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
        </div>,
        document.body
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

      {/* M5:颜色替换对话框(桌面/移动布局各渲染一份,共享同一份状态) */}
      <ReplaceColorDialog
        open={showReplace}
        canvasData={canvasData}
        paletteId={currentPalette}
        initialFrom={selection ? canvasData?.[selection.y]?.[selection.x] : null}
        onClose={() => setShowReplace(false)}
        onConfirm={handleConfirmReplace}
      />

      <style>{`
        .left-sidebar {
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          overflow-x: hidden;
          flex-shrink: 0;
          /* 高度跟随 workspace(其高度基于 --vh),不要用字面 100vh:
             平板横屏时浏览器 UI 压缩可视视口(--vh < 1vh),字面 vh 会让
             侧边栏高于 workspace,使其上方 overflow:hidden 的祖先(.main-content
             /.app 等)产生可滚动溢出,展开导出面板的 scrollIntoView 会级联
             滚动这些祖先,把右栏(画布 + 色卡)一起抬高且无法还原。 */
          height: 100%;
          min-height: 0;
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
          simplified={isMobile}
        />
      )}

      <Routes>
        <Route path="/login" element={renderAuthPage()} />
        <Route path="/" element={
          <>
            {/* 平板(≥640px)用画布内悬浮胶囊展示尺寸/缩放/重置/适应,
                不再渲染手机版顶部横幅,避免与 Canvas 的 .canvas-info 重复 */}
            {isMobile && (
              <MobileCanvasInfoBar
                gridSize={gridSize}
                gridWidth={gridWidth}
                gridHeight={gridHeight}
                scale={mobileScale}
                onReset={() => canvasRef.current?.resetTransform()}
                onFit={() => canvasRef.current?.fitToScreen()}
              />
            )}
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
              onUndo={handleUndo}
              onRedo={handleRedo}
              onClear={handleClearCanvas}
              canUndo={canUndo}
              canRedo={canRedo}
              onExport={() => setShowExport(true)}
              onQuantize={() => navigate('/create/image')}
              onImport={() => navigate('/import')}
              selection={selection}
              onSelectionCommand={handleSelectionCommand}
              onClearSelection={handleClearSelection}
              onOpenReplace={() => setShowReplace(true)}
            />
          </>
        } />
        <Route path="/gallery" element={
          <Suspense fallback={<LoadingScreen />}>
            <div className="mobile-page-area">
              <GalleryPage
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
        <Route path="/gallery/theme/:slug" element={
          <Suspense fallback={<LoadingScreen />}>
            <div className="mobile-page-area">
              <ThemePage cloudStore={cloudStore} />
            </div>
          </Suspense>
        } />
        <Route path="/gallery/collection/:slug" element={
          <Suspense fallback={<LoadingScreen />}>
            <div className="mobile-page-area">
              <CollectionPage cloudStore={cloudStore} />
            </div>
          </Suspense>
        } />
        <Route path="/gallery/pattern/:id" element={
          <Suspense fallback={<LoadingScreen />}>
            <div className="mobile-page-area">
              <PatternDetailPage
                cloudStore={cloudStore}
                onSaveProject={saveWork}
                onLoadTemplate={handleLoadTemplate}
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
        <Route path="/profile" element={
          <div className="mobile-page-area">
            <ProfilePage
              user={user}
              authLoading={authLoading}
              onLogout={logout}
              onUpdateProfile={updateProfile}
              onChangePassword={changePassword}
            />
          </div>
        } />
        <Route path="/admin/dashboard" element={
          <div className="mobile-page-area">
            <Suspense fallback={<LoadingScreen />}>
              <AdminDashboardPage
                cloudStore={cloudStore}
                user={user}
                isAdmin={isAdmin}
                authLoading={authLoading}
                onLogin={() => navigate('/admin/login')}
                onLogout={logout}
              />
            </Suspense>
          </div>
        } />
        <Route path="/create/image" element={
          <Suspense fallback={<LoadingScreen />}>
            <CreateImagePage onApply={handleQuantizerApply} />
          </Suspense>
        } />
        <Route path="/import" element={
          <div className="mobile-page-area">
            <ImportPage
              onLoadProject={handleLoadImportedProject}
              onSaveProject={saveWork}
            />
          </div>
        } />
        <Route path="/my/beads" element={
          <div className="mobile-page-area">
            <MyBeadsPage
              user={user}
              canvasData={canvasData}
              onApplyMapping={handleApplyBeadMapping}
            />
          </div>
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

      {showSaveDialog && createPortal(
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="save-dialog" onClick={e => e.stopPropagation()}>
            <h3>{t('gallery.saveTitle')}</h3>
            <label>{t('gallery.saveNameLabel')}</label>
            {/* 移动端不自动聚焦(规格 08 §5):autoFocus 会立刻唤起键盘,
                用户刚点「保存」就被键盘盖掉半屏,还与浮层收缩动画互相竞争,
                iOS 上容易把弹层顶出可视区。桌面端保持原有自动聚焦。 */}
            <input
              autoFocus={!isMobile && !isTablet}
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
        </div>,
        document.body
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

      {/* M5:颜色替换对话框(桌面/移动布局各渲染一份,共享同一份状态) */}
      <ReplaceColorDialog
        open={showReplace}
        canvasData={canvasData}
        paletteId={currentPalette}
        initialFrom={selection ? canvasData?.[selection.y]?.[selection.x] : null}
        onClose={() => setShowReplace(false)}
        onConfirm={handleConfirmReplace}
      />

      <style>{`
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
      title: '拼豆Studio - 免费在线拼豆图纸生成,图片转像素拼豆|COCO/MARD/Artkal等6大色卡',
      desc: '免费的在线拼豆图纸生成工具：自由绘制或上传图片一键转像素拼豆，CIEDE2000精准配色；支持 COCO/MARD/Artkal 等 6 大品牌色卡与专业 PNG/SVG 图纸导出，新手与亲子友好。',
    },
    gallery: {
      title: '拼豆图库与模板 - 拼豆Studio',
      desc: '浏览并收藏拼豆图案模板，按分类与难度筛选，一键载入画布开始创作。支持收藏与作品管理，适合拼豆爱好者和手工达人。',
    },
    tutorials: {
      title: '拼豆教程 - 从入门到进阶 · 拼豆Studio',
      desc: '系统学习拼豆制作：入门指南、熨烫全解、防变形技巧、配色设计、进阶技巧与作品保护，配有图示与温度对照表，新手友好。',
    },
    // ── 工具页 / 私有页 ────────────────────────────────────
    // 这些页面此前没有独立配置,会回退到首页的 title/description 且 index,follow,
    // 造成同一份标题描述出现在多个 URL(重复内容)。统一 noindex:站内可达、不参与索引。
    admin: {
      title: '后台管理 - 拼豆Studio',
      desc: '拼豆Studio 站点后台管理。',
      noindex: true,
    },
    adminLogin: {
      title: '管理员登录 - 拼豆Studio',
      desc: '拼豆Studio 管理后台登录入口。',
      noindex: true,
    },
    login: {
      title: '登录 / 注册 - 拼豆Studio',
      desc: '登录或注册拼豆Studio账号，把拼豆作品与收藏保存到云端。',
      noindex: true,
    },
    profile: {
      title: '个人资料 - 拼豆Studio',
      desc: '管理拼豆Studio账号资料、昵称与头像。',
      noindex: true,
    },
    createImage: {
      title: '图片转拼豆 - 拼豆Studio',
      desc: '上传图片，一键生成像素拼豆图纸。',
      noindex: true,
    },
    import: {
      title: '导入图纸 - 拼豆Studio',
      desc: '导入 .pindou.json 原生项目文件或模板 JSON，校验后保存为仅自己可见的拼豆图纸。',
      noindex: true,
    },
    myBeads: {
      title: '我的色卡与库存 - 拼豆Studio',
      desc: '管理个人拼豆色卡、豆子库存，并把当前图纸的颜色匹配到目标色卡。',
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

  // 各页面对应的规范路径(privacy/terms 的 :versionId 历史版本归并到父路径)
  const CANONICAL_PATH = {
    canvas: '/', gallery: '/gallery', tutorials: '/tutorials', admin: '/admin',
    adminLogin: '/admin/login', login: '/login', profile: '/profile',
    createImage: '/create/image', import: '/import', privacy: '/privacy', terms: '/terms',
    myBeads: '/my/beads',
  }
  const SITE_ORIGIN = 'https://tangnotes.site'
  // 主题/合集/图纸详情是动态内容页,canonical 自指;其余 /gallery/* 子路径
  // 仍归并到 /gallery,避免把未知路径当作可收录页面。
  const baseUrl = `${SITE_ORIGIN}${canonicalPathFor(location.pathname, CANONICAL_PATH[currentPage] || '/')}`

  // hreflang 值统一为「语言子标签」(zh-CN 除外),与预渲染 HTML、sitemap.xml 保持一致。
  // 此前 Helmet 输出 en-US/ja-JP/ko-KR 而静态文件写 en/ja/ko,同一语言两个值,
  // 搜索引擎无法把语言变体归入同一组 → 多语言定向失效。
  const HREFLANG = { 'zh-CN': 'zh-CN', 'en-US': 'en', 'ja-JP': 'ja', 'ko-KR': 'ko' }
  const hreflangHref = (code) => (code === 'zh-CN' ? baseUrl : `${baseUrl}?lang=${HREFLANG[code]}`)

  // canonical:?lang= 直达页自指(与上方 hreflang 互指,否则会被判为首页副本);
  // 无该参数时自指裸路径。必须依据「请求进来的 URL」而非当前界面语言 ——
  // 浏览器语言自动切换不等于用户访问的是语言版本 URL(i18n 初始化会把 ?lang= 从地址栏移除,
  // 故用模块加载时捕获的 initialLangParam)。
  const canonical = initialLangParam && initialLangParam !== 'zh-CN'
    ? `${baseUrl}?lang=${HREFLANG[initialLangParam]}`
    : baseUrl

  const seoHelmet = (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.desc} />
      <meta name="robots" content={seo.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'} />
      <link rel="canonical" href={canonical} />
      {LANGUAGES.map(l => (
        <link key={l.code} rel="alternate" hrefLang={HREFLANG[l.code]} href={hreflangHref(l.code)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={baseUrl} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.desc} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://tangnotes.site/og-image.png" />
      <meta name="twitter:card" content="summary_large_image" />
    </Helmet>
  )

  // 根据设备类型返回对应布局
  return (
    <>
      {seoHelmet}
      {isMobile || isTablet ? renderMobileLayout() : renderDesktopLayout()}
    </>
  )
}
