import { useState, useEffect, lazy, Suspense, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import useKeyboardSafe from './hooks/useKeyboardSafe'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import BrandSwitchDialog from './components/BrandSwitchDialog'
import DraftRestorePrompt from './components/DraftRestorePrompt'
import MyBeadsPage from './components/MyBeadsPage'
import SelectionContextMenu from './components/SelectionContextMenu'
import VersionHistoryDialog from './components/VersionHistoryDialog'
import { useToast } from './components/Toast'
import {
  fillSelection,
  clearSelection as clearSelectionRegion,
  mirrorSelection,
  rotateSelection,
  replaceColor,
  moveSelection,
  copyMoveSelection,
  copySelection,
  cutSelection,
  pasteBlock,
  normalizeSelection,
} from './utils/selectionUtils'
import {
  fillLasso,
  clearLasso,
  mirrorLasso,
  rotateLasso,
  moveLasso,
  copyMoveLasso,
  copyLasso,
  cutLasso,
  pasteLasso,
} from './utils/lassoCommands'
import { selectionBounds, selectionContains } from './utils/lassoSelection'
import { toggleCellInSelection } from './utils/pickSelection'
import { removeNoiseBeads } from './utils/noiseCleanup'
import {
  loadFillIncludeEmpty,
  saveFillIncludeEmpty,
  loadDeductInventory,
  saveDeductInventory,
} from './utils/editorPrefs'
import useAutoSave, { useAutoSaveEnabled } from './hooks/useAutoSave'
import { runInventoryDeduction } from './services/beads/inventoryDeduction'
import { createBrandColorResolver } from './services/export/PatternDocument'
import { useUserPalettes } from './hooks/useUserPalettes'
import { useAuth } from './hooks/useAuth'
import { useResponsive } from './hooks/useResponsive'
import { useHistory } from './hooks/useHistory'
import { useSavedWorks } from './hooks/useSavedWorks'
import { useScrollLock } from './hooks/useScrollLock'
import { useDialogA11y } from './hooks/useDialogA11y'
import { canonicalPathFor, isKnownPath } from './utils/seoPath'
import { categorySeo, resolveCategoryBySlug } from './features/gallery/categoryMeta'
// 品牌色卡对照页的 meta 与静态快照共用同一份文案
import { COLOR_CHARTS_SEO, brandSeo, resolveColorBrand } from './features/colors/colorCharts'
import { CALCULATOR_SEO, IRONING_SEO, BEAD_PATTERNS_SEO, PIXEL_ART_SEO } from './features/tools/toolSeo'
import { planBrandSwitch, applyBrandSwitch } from './utils/brandSwitch'
import { canvasToLegacyWork, normalizeLegacyWork } from './services/project/adapters'
import ImportPage from './components/ImportPage'
import MobileToolbar from './components/Tools/MobileToolbar'
import PickDPad from './components/PickDPad'
import useCloudTemplates from './hooks/useCloudTemplates'
import useGalleryFavorites from './hooks/useGalleryFavorites'
import MobileColorPalette from './components/ColorPalette/MobileColorPalette'
import { getPalette, PALETTES } from './data/palettes'
import { PrivacyPolicy, TermsOfService } from './components/LegalPages'
import NotFoundPage from './components/NotFoundPage'
import MobileCanvasInfoBar from './components/MobileCanvasInfoBar'
import AutoSaveStatus from './components/AutoSaveStatus'
const CreateImagePage = lazy(() => import('./components/CreateImagePage'))
// 图纸编辑器:/editor —— 图片转拼豆结果的专用编辑界面(修图操作台,不复用画布页工具栏)
const EditorPage = lazy(() => import('./components/EditorPage'))
import ProfilePage from './components/ProfilePage'
// 联系我们:独立路由页(而非模态框)—— iOS Safari 键盘只收缩 visual viewport,
// 浮层会被顶走露白,且浮层内两个编辑框在键盘弹起后互相挤压
const ContactPage = lazy(() => import('./components/ContactPage'))
// Gallery V2:已对齐 V1 全部功能并通过灰度验证,接任 /gallery 主路由
// (V1 Gallery.jsx 源码转存 _legacy/ 本地归档,不再入库)
const GalleryPage = lazy(() => import('./features/gallery/GalleryPage'))
// 分类聚合页:按 category 字段收窄的可独立收录页面
const CategoryPage = lazy(() => import('./features/gallery/CategoryPage'))
// 图库内容发现(M7):主题 / 合集 / 公共图纸详情
const ThemePage = lazy(() => import('./features/gallery/ThemePage'))
const CollectionPage = lazy(() => import('./features/gallery/CollectionPage'))
const PatternDetailPage = lazy(() => import('./features/gallery/PatternDetailPage'))
// 品牌色卡对照页:/colors 总览 + /colors/<brand> 六个品牌页
const ColorChartsPage = lazy(() => import('./features/colors/ColorChartsPage'))
// 备料工具页:熨烫温度对照 / 豆子数量计算器
const IroningGuidePage = lazy(() => import('./features/tools/IroningGuidePage'))
const BeadCalculatorPage = lazy(() => import('./features/tools/BeadCalculatorPage'))
const BeadPatternsPage = lazy(() => import('./features/tools/BeadPatternsPage'))
const PixelArtPage = lazy(() => import('./features/tools/PixelArtPage'))
// 公开分享落地页(图纸分享):无需登录即可查看 /share/:id
const SharePage = lazy(() => import('./features/sharing/SharePage'))
// 管理概览懒加载:recharts 图表库随之进入独立 chunk,普通用户不下载
const AdminDashboardPage = lazy(() => import('./components/AdminDashboardPage'))
const Tutorials = lazy(() => import('./components/Tutorials'))
// 常见问题:独立内容页,四语言正文来自 data/faq.js
const FaqPage = lazy(() => import('./components/FaqPage'))
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

  const {
    user,
    isAdmin,
    loading: authLoading,
    authAvailable,
    login,
    register,
    resetPassword,
    logout,
    updateProfile,
    sendOtp,
    verifyOtp,
    verifyForgotOtp,
    setPassword,
    setPasswordWithOtp,
    changeEmail,
    verifyPassword,
    setSecurityKey,
    changePassword,
    registerUsername,
    loginByUsername,
    forgotPasswordCustom,
    usernameExists,
  } = useAuth()
  const cloudStore = useCloudTemplates()
  // 收藏在 App 层持有:图库卡片的心形按钮与个人中心的收藏分区是两条路由,
  // 各自 useState 会导致切回来读到旧值。这份实例同时传给两处。
  const { favorites, isFavorite, removeFavorite } = useGalleryFavorites()
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

  // 选区剪贴板:纯内存,不碰系统剪贴板。
  // 不跨网格尺寸清空 —— 复制一块内容后调整画布大小再粘贴是合理操作,
  // 越界部分由 pasteBlock 裁剪。
  const [clipboard, setClipboard] = useState(null)

  // A2 复制拖动开关:打开后拖动选区内部 = 复制一份(原件保留),而不是剪切移动。
  // 桌面端另有 Alt/Option 快捷键,但开关本身对所有端都生效 —— 触屏没有修饰键,
  // 桌面也不该要求用户先知道有个隐藏手势。
  const [copyDrag, setCopyDrag] = useState(false)

  // A3 框选吸附:默认关。早期默认开,但吸附会在指针接近图案边缘时
  // 把焦点拽走 1–2 格 —— 对已经瞄准边界的用户,体感就是「拖了但没完全跟上」,
  // 也就是反馈里的「拖动不管用」。需要精确贴边的用户可自行打开。
  const [snapToEdges, setSnapToEdges] = useState(false)

  // A4 长按上下文菜单:记录触点屏幕坐标,非 null 即打开。
  // 菜单本身不持有「当前选区」——命令仍走 handleSelectionCommand,
  // 与操作条按钮是同一条路径,不会出现两套行为。
  const [selectionMenu, setSelectionMenu] = useState(null)

  // 「点选」工具的光标:方向盘/键盘步进的落点,步进恒为 1 格。
  // 画布 tap/拖扫不走光标(指哪打哪),光标只在需要精确定位时由
  // 方向盘(移动端)或方向键(PC)移动。
  const [pickCursor, setPickCursor] = useState(null)

  // 切页 / 网格尺寸变化(换模板、载入作品、调整画布)后,旧选区坐标可能失效
  // → 清空。普通绘制不改变网格,选区矩形仍然有效,无需清空。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 切页/改网格尺寸时清空选区坐标,这些值只作触发信号
  useEffect(() => {
    setSelection(null)
    setPickCursor(null)
  }, [location.pathname, gridSize, gridWidth, gridHeight])

  // ── 点选:方向盘与键盘步进(步进恒为 1 格)──────────────────
  // 光标为空时初始化到画布中心:第一次按方向键就能立刻看到「即将操作哪格」,
  // 不用先去网格上找落点。越界一律钳制,光标永远在网格内。
  const movePickCursor = useCallback((dx, dy) => {
    setPickCursor(prev => {
      const cols = gridWidth || gridSize
      const rows = gridHeight || gridSize
      const base = prev || { x: Math.floor(cols / 2), y: Math.floor(rows / 2) }
      return {
        x: Math.max(0, Math.min(cols - 1, base.x + dx)),
        y: Math.max(0, Math.min(rows - 1, base.y + dy)),
      }
    })
  }, [gridWidth, gridSize, gridHeight])

  const togglePickCursor = useCallback(() => {
    const cols = gridWidth || gridSize
    const rows = gridHeight || gridSize
    let target = pickCursor
    if (!target) {
      target = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) }
      setPickCursor(target)
    }
    setSelection(prev => toggleCellInSelection(prev, target.x, target.y, cols, rows))
  }, [pickCursor, gridWidth, gridSize, gridHeight])

  // 点选工具下的键盘步进:方向键移动光标,Enter/Space toggle 当前格。
  // 与撤销快捷键同款「输入框聚焦放行」;焦点在按钮上时 Enter/Space 交还
  // 原生激活(否则方向盘按钮会双触发)。方向键在此工具下 preventDefault,
  // 避免页面跟着滚动。
  useEffect(() => {
    if (tool !== 'pick') return undefined
    const handler = e => {
      if (e.isComposing || e.keyCode === 229) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const arrows = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }
      if (arrows[e.key]) {
        e.preventDefault()
        movePickCursor(arrows[e.key][0], arrows[e.key][1])
        return
      }
      if ((e.key === 'Enter' || e.key === ' ') && t?.tagName !== 'BUTTON') {
        e.preventDefault()
        togglePickCursor()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tool, movePickCursor, togglePickCursor])

  // 撤销/重做前先丢弃活动笔画,避免笔画进行中 undo 后 mouseUp 时 commitStroke 重推快照回滚
  const handleUndo = useCallback(() => {
    canvasRef.current?.cancelStroke?.()
    undo()
  }, [undo])
  const handleRedo = useCallback(() => {
    canvasRef.current?.cancelStroke?.()
    redo()
  }, [redo])

  // 规格 04 §3:切换网格 / 载入模板 / 载入作品 / 应用量化结果前,必须丢弃
  // 进行中的笔画。否则旧矩阵的累加器会在下一次 pointerup 时被提交,
  // 把刚载入的内容覆盖掉(Canvas 内也监听 cols/rows 变化,这里是同一份保护,
  // 覆盖「尺寸不变但内容被整体替换」的情况)。
  const replaceCanvas = useCallback(
    nextData => {
      canvasRef.current?.cancelStroke?.()
      resetCanvas(nextData)
    },
    [resetCanvas]
  )
  const {
    works: savedWorks,
    worksLoading,
    worksError,
    syncCount,
    cloudMirrorCount,
    saveState,
    markDirty,
    saveWork,
    updateWork,
    deleteWork,
    ackSync,
    reload: reloadWorks,
    loadVersions,
    rollbackToVersion,
  } = useSavedWorks(user)

  // 画布内容变化 → 标记「未保存」。
  // 只在 canvasData 真的换了一个矩阵对象时触发(useHistory 每次 PUSH/RESET
  // 都产生新引用),因此不会因为无关的重新渲染而误标。
  // 首次挂载时 canvasData 为 null,不标记。
  const firstCanvasRef = useRef(true)
  useEffect(() => {
    if (!canvasData) return
    if (firstCanvasRef.current) {
      firstCanvasRef.current = false
      return
    }
    markDirty()
  }, [canvasData, markDirty])

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [currentPalette, setCurrentPalette] = useState('perler')
  // 选区填充是否连空白格一起填(规格 04 §2:默认不填空白)。偏好持久化在
  // bead_studio_settings 里,与语言共用一份设置;切换后立即写回。
  const [fillIncludeEmpty, setFillIncludeEmpty] = useState(loadFillIncludeEmpty)
  const handleToggleFillIncludeEmpty = useCallback(value => {
    setFillIncludeEmpty(value)
    saveFillIncludeEmpty(value)
  }, [])

  // 导出后扣减库存(规格 05 §3):默认关闭,偏好持久化在 bead_studio_settings
  const [deductInventory, setDeductInventory] = useState(loadDeductInventory)
  const handleToggleDeductInventory = useCallback(value => {
    setDeductInventory(value)
    saveDeductInventory(value)
  }, [])
  // 导出面板需要读库存与色卡,与 /my/beads 共用同一份数据源
  const beadStore = useUserPalettes(user)
  const [designName, setDesignName] = useState(() => t('export.defaultName'))
  // 语言切换时同步默认导出名(designName 只作默认值,用户自定义名走 saveInputName)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 语言切换时同步默认导出名,i18n.language 只作触发信号
  useEffect(() => {
    setDesignName(t('export.defaultName'))
  }, [i18n.language, t])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveInputName, setSaveInputName] = useState('')
  // 当前画布内容的来源类别(导入 / 图库复制 / 手绘),随保存一起落库。
  // 只记录「这份矩阵是怎么来的」,不改变任何画布行为;切换网格/载入作品时同步更新,
  // 否则导入的图纸保存后会被当成手绘作品,重新打开就失去来源。
  const [canvasSource, setCanvasSource] = useState(null)
  // 版本时间线:存的是「正在看哪件作品的历史」,不是版本数据本身 ——
  // 版本由 VersionHistoryDialog 打开时按 work.id 现拉,避免 App 里再维护一份缓存。
  const [versionsWork, setVersionsWork] = useState(null)

  // 登录迁移完成后展示「已同步 N 幅作品到云端」提示。
  // 统一走 toast 系统,不再维护一条独立的顶部气泡。
  useEffect(() => {
    if (syncCount == null) return
    toast(t('auth.syncToast', { n: syncCount }), 'success')
    ackSync()
  }, [syncCount, ackSync, toast, t])

  // 从 URL 路径推导当前页面(用于 Header 高亮与条件渲染)
  const currentPage = location.pathname.startsWith('/gallery')
    ? 'gallery'
    : location.pathname.startsWith('/tutorials')
      ? 'tutorials'
      : location.pathname.startsWith('/faq')
        ? 'faq'
        : location.pathname.startsWith('/colors')
          ? 'colors'
          : location.pathname.startsWith('/ironing')
            ? 'ironing'
            : location.pathname.startsWith('/bead-calculator')
              ? 'beadCalculator'
              : location.pathname.startsWith('/bead-patterns')
                ? 'beadPatterns'
                : location.pathname.startsWith('/pixel-art')
                  ? 'pixelArt'
        : location.pathname.startsWith('/admin/login')
        ? 'adminLogin'
        : location.pathname.startsWith('/admin')
          ? 'admin'
          : location.pathname.startsWith('/privacy')
            ? 'privacy'
            : location.pathname.startsWith('/terms')
              ? 'terms'
              : location.pathname.startsWith('/login')
                ? 'login'
                : location.pathname.startsWith('/create/image')
                  ? 'createImage'
                  : location.pathname.startsWith('/editor')
                    ? 'editor'
                    : location.pathname.startsWith('/import')
                      ? 'import'
                    : location.pathname.startsWith('/my/beads')
                      ? 'myBeads'
                      : location.pathname.startsWith('/contact')
                        ? 'contact'
                        : location.pathname.startsWith('/profile')
                          ? 'profile'
                          : location.pathname.startsWith('/share/')
                            ? 'share'
                            : 'canvas'
  // 404 判定独立于 currentPage:上面是按前缀归组的(/gallery/whatever 仍算 gallery),
  // 这里要求路径形状**确实存在**。两者分开,才能让「渲染 404 页」与「meta 标 noindex」
  // 始终一致 —— 否则 /gallery/whatever 会渲染 404 页却带着图库页的 index,follow。
  const isNotFound = !isKnownPath(location.pathname)
  // 分类聚合页 /gallery/category/<slug>:slug 必须命中静态清单,
  // 未知 slug 与其它不存在路径一样按 404 处理,不生成可收录的软页面。
  const categorySlug = location.pathname.replace(/\/+$/, '').match(/^\/gallery\/category\/([^/]+)$/)?.[1] || ''
  const categoryMeta = categorySlug ? resolveCategoryBySlug(categorySlug) : null
  // 品牌色卡页 /colors/<brand>:品牌必须命中本地色卡;未知品牌按 404 处理,
  // 与分类聚合页同一套判定(页面自己渲染 not-found,meta 走 notFound)。
  const colorSlug = location.pathname.replace(/\/+$/, '').match(/^\/colors\/([^/]+)$/)?.[1] || ''
  const colorBrand = colorSlug ? resolveColorBrand(colorSlug) : null
  const colorNotFound = !!colorSlug && !colorBrand
  // 核心功能页不继承站点导航，页面内部提供自己的返回与操作层。
  const isStandalonePage =
    currentPage === 'login' ||
    currentPage === 'adminLogin' ||
    currentPage === 'privacy' ||
    currentPage === 'terms' ||
    currentPage === 'createImage' ||
    currentPage === 'editor' ||
    currentPage === 'import' ||
    currentPage === 'profile' ||
    currentPage === 'myBeads' ||
    currentPage === 'contact' ||
    currentPage === 'share'

  // iOS Safari 键盘安全(全站统一,防复发机制):
  // 监听 visual viewport 的 resize/scroll 与聚焦,把可视高度写入 --visible-vh、
  // 视口顶部偏移写入 --visible-vh-top。所有需要响应键盘收缩的可滚动容器
  // (floating overlay / 页面 / 面板)引用这两个变量即可随键盘自动收缩复位。
  useKeyboardSafe()

  // 保存作品弹层打开时锁定背景滚动(防 iOS 键盘 pop 起时 body 被顶开)
  // 由 useScrollLock 统一引用计数:与其他弹层叠加时不会互相清锁。
  useScrollLock(showSaveDialog)

  // 可访问性(规格 08 §5):保存作品对话框(桌面 / 移动共用同一份状态)
  const { ref: saveDialogRef, dialogProps: saveDialogProps } = useDialogA11y({
    open: showSaveDialog,
    onClose: () => setShowSaveDialog(false),
    label: t('gallery.saveTitle'),
  })

  // Initialize blank canvas on first render and when grid size changes with no data
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在网格尺寸变化时初始化空画布;canvasData 变化不应触发重置(会覆盖用户绘制)
  useEffect(() => {
    if (!canvasData) {
      resetCanvas(
        Array(gridSize)
          .fill(null)
          .map(() => Array(gridSize).fill(null))
      )
    }
  }, [gridSize])

  // ── 自动保存草稿(规格 03 §7)────────────────────────────────
  // 只进 IndexedDB,不写 `works` 表、不产生历史、失败静默。
  // meta 里的上下文不参与「是否该写」的判定 —— 只有画布内容变了才写,
  // 否则改个名字、切个色卡都会触发一次多余的写盘。
  const [autoSaveEnabled, toggleAutoSave] = useAutoSaveEnabled()
  const autoSave = useAutoSave({
    canvasData,
    meta: {
      gridSize,
      gridWidth,
      gridHeight,
      paletteId: currentPalette,
      name: designName,
      sourceKind: canvasSource,
    },
    enabled: autoSaveEnabled,
  })
  const { readDraft, discardDraft, resetBaseline } = autoSave

  // 草稿恢复提示:启动时读一次。用 ref 挡住重复提示(StrictMode 双执行 / 路由重挂载)。
  const [pendingDraft, setPendingDraft] = useState(null)
  const draftCheckedRef = useRef(false)
  useEffect(() => {
    if (draftCheckedRef.current) return undefined
    draftCheckedRef.current = true
    let cancelled = false
    ;(async () => {
      const draft = await readDraft()
      if (cancelled || !draft) return
      setPendingDraft(draft)
    })()
    return () => {
      cancelled = true
    }
  }, [readDraft])

  const handleRestoreDraft = useCallback(() => {
    const draft = pendingDraft
    if (!draft) return
    const size = Number(draft.gridSize) || (draft.canvasData?.length ?? 0)
    const w = Number(draft.gridWidth) || size
    const h = Number(draft.gridHeight) || size
    setGridSize(Math.max(w, h))
    setGridWidth(w === h ? null : w)
    setGridHeight(w === h ? null : h)
    if (draft.paletteId) setCurrentPalette(draft.paletteId)
    if (draft.sourceKind) setCanvasSource(draft.sourceKind)
    replaceCanvas(draft.canvasData)
    // 恢复后把基线对齐到刚载入的矩阵:这不是「用户画的一笔」,不该立刻再写一次草稿
    resetBaseline(draft.canvasData)
    setPendingDraft(null)
  }, [pendingDraft, replaceCanvas, resetBaseline])

  const handleDiscardDraft = useCallback(async () => {
    setPendingDraft(null)
    await discardDraft()
  }, [discardDraft])

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo
  useEffect(() => {
    const handler = e => {
      // 输入控件聚焦时交还原生文本撤销/重做,不拦截
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      // Shift+Z 在真实浏览器里 e.key 是大写 'Z'(测试里常写成小写 'z',会漏掉这条路径)
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  // 保存/导出弹层同时打开时用 fixed 锁(记录并回滚滚动位置);单独保存弹层只需 overflow 锁。
  // 统一走引用计数,避免与 ImageQuantizer / 版本面板等弹层互相覆盖。
  // 版本面板同样需要滚动锁:它自己内部滚动,背景不应跟着动。
  const anyModalOpen = showSaveDialog || showExport || !!versionsWork
  useScrollLock(anyModalOpen, { fixed: showExport })

  const handleClearCanvas = () => {
    if (canvasData?.every(row => row.every(cell => cell === null))) return
    const rows = gridHeight || gridSize
    const cols = gridWidth || gridSize
    // 清空后画布不再来自任何导入/复制,来源归零(否则会带着旧来源保存)
    setCanvasSource(null)
    // 清空也是一次画布替换:先丢弃活动笔画,避免它随后把旧内容提交回来
    canvasRef.current?.cancelStroke?.()
    setCanvas(
      Array(rows)
        .fill(null)
        .map(() => Array(cols).fill(null))
    )
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
      savedAt: new Date().toISOString(),
      sourceKind: canvasSource,
    })
    if (!work) return
    const ok = await saveWork(work)
    if (!ok) return
    // 显式保存成功 → 草稿已完成使命。留着它下次打开会提示「恢复上次未保存的修改」,
    // 而那份内容其实已经正式存过了,提示只会让用户困惑。
    await discardDraft()
    setShowSaveDialog(false)
    toast(user ? t('gallery.savedToastCloud') : t('gallery.savedToast'), 'success')
  }

  // 顶部登录/注册入口:带上当前路径,成功后回到原页面,而不是一律回首页。
  // 与守卫入口(handleRequireAuth)保持一致,search 也保留(如图库的筛选条件)。
  const openLogin = () =>
    navigate('/login', {
      state: { mode: 'login', next: location.pathname + location.search },
    })

  // 高级导出守卫:带上回跳路径与原因,登录/注册成功后回到当前页面
  const handleRequireAuth = (reason, mode = 'register') => {
    navigate('/login', {
      state: {
        mode: mode === 'login' ? 'login' : 'register',
        next: location.pathname + location.search,
        reason: reason || 'ironing',
      },
    })
  }

  const openRegister = () =>
    navigate('/login', {
      state: { mode: 'register', next: location.pathname + location.search },
    })

  const handleGridSizeChange = newSize => {
    setGridSize(newSize)
    setGridWidth(null)
    setGridHeight(null)
    // 换网格 = 一张新画布,旧的导入/复制来源不再适用
    setCanvasSource(null)
    replaceCanvas(
      Array(newSize)
        .fill(null)
        .map(() => Array(newSize).fill(null))
    )
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
    setCanvasSource(null)
    replaceCanvas(
      Array(height)
        .fill(null)
        .map(() => Array(width).fill(null))
    )
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
    // 公共图纸载入画布 = 图库复制语义(与 /gallery/pattern/:id 的复制一致)
    setCanvasSource('gallery-copy')
    replaceCanvas(pattern)
    navigate('/')
  }

  const handleLoadWork = rawWork => {
    // 载入前归一:旧作品的声明尺寸可能与 canvasData 实际形状不一致,
    // 直接 setGridSize 会让画布网格与数据错位(多出的行画不出来、少的行越界)。
    const work = normalizeLegacyWork(rawWork)
    setGridSize(work.gridSize)
    setGridWidth(work.gridWidth ?? null)
    setGridHeight(work.gridHeight ?? null)
    setCurrentPalette(work.paletteId || 'perler')
    // 来源随作品一起载入:再次保存时不会把「图库复制」退化成「手绘」
    setCanvasSource(work.sourceKind || null)
    replaceCanvas(work.canvasData)
    navigate('/')
  }

  /**
   * 回滚成功后把内容同步进画布。
   *
   * 回滚改的是作品本体,但用户当前可能正在画布上编辑别的内容 ——
   * 不同步进画布,用户会看到「历史显示已回滚、画布还是旧样子」。
   * 走 replaceCanvas 而不是 setCanvas:这是载入,不是用户画的一笔,
   * 不该在撤销栈里多出一条。同时对齐自动保存基线,否则这次载入
   * 会被当成新改动立刻再写一次草稿。
   */
  const handleRollbackVersion = useCallback(
    async (work, version) => {
      const restored = await rollbackToVersion(work, version)
      if (!restored) return null
      setGridSize(restored.gridSize)
      setGridWidth(restored.gridWidth ?? null)
      setGridHeight(restored.gridHeight ?? null)
      setCurrentPalette(restored.paletteId || 'perler')
      replaceCanvas(restored.canvasData)
      resetBaseline(restored.canvasData)
      toast(t('versions.rollbackDone', { time: new Date().toLocaleString() }), 'success')
      return restored
    },
    [rollbackToVersion, replaceCanvas, resetBaseline, toast, t]
  )

  // 导入的项目直接进画布继续编辑(不落库;用户可再点保存决定是否留存)
  const handleLoadImportedProject = project => {
    const grid = project?.grid
    if (!grid || !Array.isArray(grid.cells)) return
    const isSquare = grid.width === grid.height
    setGridSize(Math.max(grid.width, grid.height))
    setGridWidth(isSquare ? null : grid.width)
    setGridHeight(isSquare ? null : grid.height)
    if (project.palette?.paletteId) setCurrentPalette(project.palette.paletteId)
    setCanvasSource(project.source?.kind || 'native-file')
    replaceCanvas(grid.cells.map(row => [...row]))
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
    replaceCanvas(resolvedData)
    // 画布内容来自照片量化(复用既有 Worker 管线),保存时如实记录来源
    setCanvasSource('photo-quantized')
    if (options.palette) setCurrentPalette(options.palette)
    // 不再在这里 navigate('/'):图片转拼豆是独立页面,应用完成后由该页面的 onClose
    // 负责返回(历史回退/深链兜底)。两处各自导航会互相抵消,把用户留在转换页。
    if (w > 50 || h > 50) {
      toast(t('canvas.autoFitToast'), 'info')
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
    onPickColor: hex => {
      setSelectedColor(hex)
      toast(t('tools.pickedColorToast', { hex }), 'success')
    },
    selection,
    onSelectionChange: setSelection,
    // 「点选」工具:逐格 toggle 选区。父组件函数式更新,拖扫连续 toggle 无竞态。
    onPickToggleCell: ({ x, y }) => {
      const cols = gridWidth || gridSize
      const rows = gridHeight || gridSize
      setSelection(prev => toggleCellInSelection(prev, x, y, cols, rows))
    },
    // 点选光标(方向盘/键盘步进的落点),画在 overlay 上
    pickCursor,
    // A2:复制拖动开关(拖动选区内部时是复制而不是剪切)
    copyDrag,
    // A3:框选吸附到已有珠子的边缘
    snapToEdges,
    // A4:长按选区内部弹出上下文菜单(仅移动端传入,桌面端不启用)
    onSelectionLongPress: point => setSelectionMenu(point),
    // M5.2 拖拽移动:画布只在松手时上报一次偏移,这里提交一条历史。
    // 偏移已由画布按 clampMove 钳制,内容不会掉出画布。
    // 保存入口在画布 HUD / 移动端信息条(画布专属动作不进全局顶栏)。
    onSave: handleOpenSaveDialog,
    saveState,
    // A2:`copy` 为 true 时是复制拖动(Alt/Option 或移动端开关),原件保留。
    onSelectionMove: ({ dx, dy, selection: base, copy }) => {
      // A5:套索选区走掩码版,形状跟着一起搬
      const isLasso = base?.kind === 'lasso'
      const result = isLasso
        ? copy
          ? copyMoveLasso(canvasData, base, dx, dy)
          : moveLasso(canvasData, base, dx, dy)
        : copy
          ? copyMoveSelection(canvasData, base, dx, dy)
          : moveSelection(canvasData, base, dx, dy)
      if (result.selection) setSelection(result.selection)
      if (!result.data) return
      setCanvas(result.data)
      toast(
        t(copy ? 'tools.selectionCopiedDragToast' : 'tools.selectionMovedToast', { n: result.changed }),
        'success'
      )
    },
  }

  // ── M5 选区命令 ─────────────────────────────────────────────
  // 粘贴块可能伸出画布(越界部分已被 pasteBlock 裁掉),选框本身要收回网格内,
  // 否则框会画到画布外面。normalizeSelection 用左上/右下两角重建矩形即可。
  const clampSelection = useCallback(
    sel => {
      if (!sel) return null
      const rows = canvasData?.length || 0
      const cols = canvasData?.[0]?.length || 0
      return normalizeSelection(
        { x: sel.x, y: sel.y },
        { x: sel.x + sel.w - 1, y: sel.y + sel.h - 1 },
        cols,
        rows
      )
    },
    [canvasData]
  )

  // 每个命令都只调用一次 setCanvas(单条历史),返回 null 表示无变化、不压栈。
  // ── 编辑器手动去噪 ──────────────────────────────────────────
  // 与品牌转换/替换颜色同一事务模式:一次 setCanvas = 一条撤销;
  // 有选区时只清理选区(点选/套索的异形范围也支持),无选区清理全图。
  // 结果为空图是合法输入(清完就是空),由 removeNoiseBeads 的 changed 判定。
  const handleNoiseCleanup = useCallback(() => {
    canvasRef.current?.cancelStroke?.()
    const { data, changed } = removeNoiseBeads(canvasData, { area: selection })
    if (!data) {
      toast(t('tools.noiseCleanNoneToast'), 'info')
      return
    }
    setCanvas(data)
    toast(t('tools.noiseCleanedToast', { n: changed }), 'success')
  }, [canvasData, selection, setCanvas, toast, t])

  const handleSelectionCommand = useCallback(
    command => {
      // 复制不依赖已有剪贴板,但必须有选区;粘贴反过来 —— 先分别守卫,
      // 否则空剪贴板时点粘贴会得到「请先框选」这种误导性提示。
      if (command === 'paste') {
        if (!clipboard) {
          toast(t('tools.selectionPasteEmpty'), 'error')
          return
        }
      } else if (!selection) {
        toast(t('tools.selectionEmpty'), 'error')
        return
      }

      // A5:套索与矩形共用同一套命令名,按 selection.kind 选择实现。
      // 矩形路径(selection 没有 kind)继续走原来的 selectionUtils —— 一个字节都不改。
      // 套索的剪贴板是掩码块(带 mask),粘贴时按掩码还原形状而不是整块矩形。
      const isLasso = selection?.kind === 'lasso'
      const cmd = {
        fill: isLasso ? fillLasso : fillSelection,
        erase: isLasso ? clearLasso : clearSelectionRegion,
        mirrorH: (d, s) => (isLasso ? mirrorLasso(d, s, 'horizontal') : mirrorSelection(d, s, 'horizontal')),
        mirrorV: (d, s) => (isLasso ? mirrorLasso(d, s, 'vertical') : mirrorSelection(d, s, 'vertical')),
        rotateCw: (d, s) => (isLasso ? rotateLasso(d, s, 'cw') : rotateSelection(d, s, 'cw')),
        rotateCcw: (d, s) => (isLasso ? rotateLasso(d, s, 'ccw') : rotateSelection(d, s, 'ccw')),
      }

      if (command === 'copy') {
        const copied = isLasso ? copyLasso(canvasData, selection) : copySelection(canvasData, selection)
        if (!copied.block) {
          // 整片空白:没有可复制的内容,不覆盖已有剪贴板
          toast(t('tools.selectionCopyEmpty'), 'info')
          return
        }
        setClipboard(copied)
        toast(t('tools.selectionCopiedToast', { w: copied.w, h: copied.h }), 'success')
        return
      }

      if (command === 'cut') {
        const cut = isLasso ? cutLasso(canvasData, selection) : cutSelection(canvasData, selection)
        if (!cut.block) {
          // 整片空白:既没东西可剪,也不该清空已有剪贴板
          toast(t('tools.selectionCopyEmpty'), 'info')
          return
        }
        setClipboard(cut)
        // 剪下与清空是同一条历史:一次撤销回到剪切前,不会先撤出「清空」
        // 再撤一次「复制」,那样中间态(内容没了、剪贴板还在)反而更让人困惑。
        if (cut.data) setCanvas(cut.data)
        toast(t('tools.selectionCutToast', { w: cut.w, h: cut.h }), 'success')
        return
      }

      if (command === 'paste') {
        // 落点:有选区贴到选区左上角,否则贴到画布左上角。
        // 套索选区没有 x/y 字段(形状在掩码里),必须统一走 selectionBounds ——
        // 直接读 selection.x 会拿到 undefined,pasteLasso 内部按 NaN 寻址直接崩。
        const bounds = selectionBounds(selection)
        const ox = bounds ? bounds.x : 0
        const oy = bounds ? bounds.y : 0
        // 套索剪贴板带掩码,必须按掩码贴 —— 否则矩形块里的占位 null
        // 会把落点处原有的珠子抹掉。矩形剪贴板走原来的 pasteBlock。
        const pasted = clipboard.mask
          ? pasteLasso(canvasData, clipboard, ox, oy)
          : pasteBlock(canvasData, clipboard, ox, oy)
        if (!pasted.data) {
          toast(t('tools.selectionPasteNoChange'), 'info')
          if (pasted.selection) {
            setSelection(clipboard.mask ? pasted.selection : clampSelection(pasted.selection))
          }
          return
        }
        setCanvas(pasted.data)
        setSelection(clipboard.mask ? pasted.selection : clampSelection(pasted.selection))
        toast(t('tools.selectionPastedToast', { n: pasted.changed }), 'success')
        return
      }

      let result
      if (command === 'fill')
        result = cmd.fill(canvasData, selection, selectedColor, { includeEmpty: fillIncludeEmpty })
      else if (command === 'erase') result = cmd.erase(canvasData, selection)
      else if (command === 'mirrorH') result = cmd.mirrorH(canvasData, selection)
      else if (command === 'mirrorV') result = cmd.mirrorV(canvasData, selection)
      else if (command === 'rotateCw') result = cmd.rotateCw(canvasData, selection)
      else if (command === 'rotateCcw') result = cmd.rotateCcw(canvasData, selection)
      else return

      if (!result.data) {
        // 内容本来就一样:不写历史,但旋转仍需把选框换成新的宽高
        if (result.selection) setSelection(result.selection)
        // 填充时若整片选区都是空白格且开关关闭,必须给一句提示 ——
        // 否则按钮看起来像坏了(默认不填空白后这是新的空操作来源)。
        if (command === 'fill' && result.skippedEmpty > 0) {
          toast(t('tools.selectionFillNoBeads'), 'info')
        }
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
    },
    [selection, clipboard, canvasData, selectedColor, fillIncludeEmpty, setCanvas, toast, t, clampSelection]
  )

  const handleClearSelection = useCallback(() => setSelection(null), [])

  // A4:菜单里的「取消选区」不是选区命令(它不改矩阵、不压历史),
  // 走 handleClearSelection;其余命令与操作条共用 handleSelectionCommand。
  const handleSelectionMenuCommand = useCallback(
    command => {
      if (command === 'clear') {
        handleClearSelection()
        return
      }
      handleSelectionCommand(command)
    },
    [handleClearSelection, handleSelectionCommand]
  )

  // 选区复制 / 剪切 / 粘贴快捷键(规格 04 §2)。
  //
  // 只在「选区工具 + 条件满足」时接管 Ctrl/Cmd+C / X / V,其余一律放行给浏览器:
  // 页面上选中文字后按 Ctrl+C 必须仍然复制文字,不能因为画布有选区就被抢走。
  // 输入框内的原生复制粘贴同样跳过(与上面的撤销/重做 handler 一致)。
  useEffect(() => {
    const handler = e => {
      if (tool !== 'select') return
      const target = e.target
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
        return
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'c') {
        // 无选区时不接管:留给浏览器复制页面文字
        if (!selection) return
        e.preventDefault()
        handleSelectionCommand('copy')
      } else if (key === 'x') {
        // 剪切与复制同理:无选区时留给浏览器
        if (!selection) return
        e.preventDefault()
        handleSelectionCommand('cut')
      } else if (key === 'v') {
        // 剪贴板为空时不接管:留给浏览器原生粘贴
        if (!clipboard) return
        e.preventDefault()
        handleSelectionCommand('paste')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tool, selection, clipboard, handleSelectionCommand])

  // ── 品牌切换(规格 04 §4)────────────────────────────────────
  // 切色卡有两种语义,必须让用户选:
  //   convert     — 把矩阵 HEX 真正换成目标品牌最近色(一条可撤销历史);
  //   mappingOnly — 只改色号解析口径,矩阵不动(改造前的旧行为)。
  // 空画布没有可转换内容,直接切口径,不弹框打断。
  const [pendingPalette, setPendingPalette] = useState(null)

  const handlePaletteChange = useCallback(
    nextPaletteId => {
      if (!nextPaletteId || nextPaletteId === currentPalette) return
      const hasContent =
        Array.isArray(canvasData) &&
        canvasData.some(row => Array.isArray(row) && row.some(cell => typeof cell === 'string' && cell))
      if (!hasContent) {
        setCurrentPalette(nextPaletteId)
        return
      }
      setPendingPalette(nextPaletteId)
    },
    [canvasData, currentPalette]
  )

  const handleBrandSwitchConvert = useCallback(() => {
    if (!pendingPalette) return
    const plan = planBrandSwitch(canvasData, pendingPalette)
    const result = applyBrandSwitch(canvasData, plan.rows)
    setPendingPalette(null)
    // 先切色号口径:即使矩阵无变化(已经在目标品牌上),用户意图也是换色卡
    setCurrentPalette(pendingPalette)
    if (!result.data) return
    // 一次 setCanvas = 一条历史,撤销即回到切换前的矩阵
    canvasRef.current?.cancelStroke?.()
    setCanvas(result.data)
    toast(t('brandSwitch.convertedToast', { n: result.changed }), 'success')
  }, [pendingPalette, canvasData, setCanvas, toast, t])

  const handleBrandSwitchMappingOnly = useCallback(() => {
    if (!pendingPalette) return
    setCurrentPalette(pendingPalette)
    setPendingPalette(null)
  }, [pendingPalette])

  // 颜色替换:一次事务替换,命中数量在对话框内已确认
  const handleConfirmReplace = useCallback(
    (from, to) => {
      const result = replaceColor(canvasData, from, to)
      setShowReplace(false)
      if (!result.data) return
      setCanvas(result.data)
      toast(t('tools.replacedToast', { n: result.changed }), 'success')
    },
    [canvasData, setCanvas, toast, t]
  )

  // M6:图纸匹配确认后的批量替色。只调用一次 setCanvas → 一条可撤销历史。
  const handleApplyBeadMapping = useCallback(
    nextData => {
      if (!nextData) return
      setCanvas(nextData)
    },
    [setCanvas]
  )

  // 删除个人色卡前,把引用它的作品重新指定到另一张色卡(只改 paletteId,不动 canvasData)
  const handleReassignWorkPalette = useCallback(
    async (work, paletteId) => {
      if (!work || !paletteId) return false
      return updateWork({ ...work, paletteId })
    },
    [updateWork]
  )

  /**
   * 导出成功后扣减库存(规格 05 §3)。
   * - 只在用户开启「导出后记账」时执行;
   * - 未知库存不扣;扣到 0 标记缺货;
   * - 逐条写入,失败数如实提示,不静默丢弃。
   */
  const handleExportComplete = useCallback(async () => {
    if (!canvasData) return
    const resolver = createBrandColorResolver(getPalette(currentPalette).colors)
    // 开关关闭时 runInventoryDeduction 直接返回 skipped,不会写任何库存
    const result = await runInventoryDeduction(
      {
        enabled: deductInventory,
        canvasData,
        inventory: beadStore.inventoryByKey,
        paletteId: currentPalette,
        paletteKind: 'builtin',
        resolveColor: hex => resolver.resolve(hex),
      },
      beadStore.setInventory
    )
    if (result.skipped) return
    if (result.entries.length === 0) {
      if (result.skippedUnknown > 0) toast(t('export.deductSkipped', { n: result.skippedUnknown }), 'info')
      return
    }
    if (result.failed > 0) toast(t('export.deductPartial', { ok: result.ok, failed: result.failed }), 'error')
    else toast(t('export.deductDone', { n: result.totalDeducted, colors: result.ok }), 'success')
  }, [deductInventory, canvasData, currentPalette, beadStore, toast, t])

  // 页面切换(通过路由)
  const handlePageChange = page => {
    if (page === 'canvas') navigate('/')
    else navigate(`/${page}`)
  }

  // 桌面端画布页
  const renderAdminLoginPage = () => <AdminLoginPage onLogin={login} />

  const renderAuthPage = () => (
    <AuthPage
      initialMode={location.state?.mode === 'register' ? 'register' : 'login'}
      // 反向守卫:已登录用户访问 /login 时直接回跳,不再展示表单
      user={user}
      authLoading={authLoading}
      onLogin={login}
      onRegister={register}
      loginByUsername={loginByUsername}
      registerUsername={registerUsername}
      forgotPasswordCustom={forgotPasswordCustom}
      resetPassword={resetPassword}
      onSendOtp={sendOtp}
      onVerifyOtp={verifyOtp}
      onVerifyForgotOtp={verifyForgotOtp}
      onSetPassword={setPassword}
      usernameExists={usernameExists}
      onUpdateProfile={updateProfile}
    />
  )

  const renderCanvasPage = () => (
    <div className="workspace">
      {/* 页面主标题:画布是全屏工具,视觉上不需要大字标题,但页面必须有 h1 ——
          读屏用户靠它确认当前页面,搜索端渲染后的 DOM 也靠它判断主题。
          内容与 index.html 的 title/description 保持同一组关键词,不做关键词堆砌。 */}
      <h1 className="sr-only">拼豆图纸生成器 · 在线制作拼豆图案与像素画</h1>
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
            fillIncludeEmpty={fillIncludeEmpty}
            onToggleFillIncludeEmpty={handleToggleFillIncludeEmpty}
            canPaste={Boolean(clipboard)}
            copyDrag={copyDrag}
            onToggleCopyDrag={setCopyDrag}
            snapToEdges={snapToEdges}
            onToggleSnapToEdges={setSnapToEdges}
            onNoiseCleanup={handleNoiseCleanup}
          />
        </div>
        <div className="left-sidebar-bottom">
          <ColorStatsBar canvasData={canvasData} paletteId={currentPalette} />
          {/* 桌面端侧边栏常驻实例:不传 onClose(有 onClose 会被判定为模态框实例并默认展开) */}
          <ExportPanel
            canvasData={canvasData}
            gridSize={gridSize}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            designName={designName}
            paletteId={currentPalette}
            deductInventory={deductInventory}
            onToggleDeductInventory={handleToggleDeductInventory}
            onExportComplete={handleExportComplete}
            isAuthenticated={!!user}
            authEnabled={authAvailable}
            onRequireAuth={handleRequireAuth}
          />
        </div>
      </aside>

      <main className="canvas-area">
        {/* ref 必须挂在桌面画布上:撤销/重做与「替换画布」都要先 cancelStroke,
            此前只有移动端实例拿到 ref,桌面端的活动笔画无法被丢弃 */}
        <Canvas {...canvasProps} ref={canvasRef} />
      </main>

      <aside className="sidebar right-sidebar">
        <ColorPalette
          selectedColor={selectedColor}
          onColorSelect={setSelectedColor}
          currentPalette={currentPalette}
          onPaletteChange={handlePaletteChange}
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
          currentPage={currentPage}
          onPageChange={handlePageChange}
        />
      )}

      <main
        className="main-content"
        style={currentPage === 'admin' || isStandalonePage ? { marginTop: 0 } : undefined}
      >
        <Routes>
          <Route path="/" element={renderCanvasPage()} />
          <Route path="/login" element={renderAuthPage()} />
          <Route
            path="/gallery"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <GalleryPage
                  onLoadTemplate={handleLoadTemplate}
                  cloudStore={cloudStore}
                  user={user}
                  onSaveWork={saveWork}
                  onDeleteWork={deleteWork}
                />
              </Suspense>
            }
          />
          <Route
            path="/gallery/category/:slug"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <CategoryPage cloudStore={cloudStore} />
              </Suspense>
            }
          />
          <Route
            path="/gallery/theme/:slug"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <ThemePage cloudStore={cloudStore} />
              </Suspense>
            }
          />
          <Route
            path="/gallery/collection/:slug"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <CollectionPage cloudStore={cloudStore} />
              </Suspense>
            }
          />
          <Route
            path="/gallery/pattern/:id"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <PatternDetailPage
                  cloudStore={cloudStore}
                  onSaveProject={saveWork}
                  onLoadTemplate={handleLoadTemplate}
                />
              </Suspense>
            }
          />
          <Route
            path="/tutorials"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <Tutorials />
              </Suspense>
            }
          />
          <Route
            path="/tutorials/:id"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <Tutorials />
              </Suspense>
            }
          />
          <Route
            path="/faq"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <FaqPage />
              </Suspense>
            }
          />
          <Route
            path="/colors"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <ColorChartsPage />
              </Suspense>
            }
          />
          <Route
            path="/colors/:brand"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <ColorChartsPage />
              </Suspense>
            }
          />
          <Route
            path="/ironing"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <IroningGuidePage />
              </Suspense>
            }
          />
          <Route
            path="/bead-calculator"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <BeadCalculatorPage />
              </Suspense>
            }
          />
          <Route
            path="/bead-patterns"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <BeadPatternsPage />
              </Suspense>
            }
          />
          <Route
            path="/pixel-art"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <PixelArtPage />
              </Suspense>
            }
          />
          <Route
            path="/profile"
            element={
              <ProfilePage
                user={user}
                authLoading={authLoading}
                onUpdateProfile={updateProfile}
                onChangePassword={changePassword}
                works={savedWorks}
                worksLoading={worksLoading}
                worksError={worksError}
                cloudMirrorCount={cloudMirrorCount}
                beadStore={beadStore}
                onRetryWorks={reloadWorks}
                onRetryBeads={beadStore.reload}
                // 作品与收藏已从图库搬到个人中心,回调沿用 App 里同一套实例
                onLoadWork={handleLoadWork}
                onDeleteWork={deleteWork}
                // 版本时间线只覆盖本地作品:云端作品的「里程碑版本」策略未定,
                // 传 undefined 让按钮不出现,而不是给一个点了没反应的入口。
                onShowVersions={!user ? setVersionsWork : undefined}
                favorites={favorites}
                isFavorite={isFavorite}
                removeFavorite={removeFavorite}
                cloudStore={cloudStore}
                onLoadTemplate={handleLoadTemplate}
                onSendOtp={sendOtp}
                onSetPasswordWithOtp={setPasswordWithOtp}
                onChangeEmail={changeEmail}
                onVerifyPassword={verifyPassword}
                onSetSecurityKey={setSecurityKey}
                autoSaveEnabled={autoSaveEnabled}
                onToggleAutoSave={toggleAutoSave}
              />
            }
          />

          <Route
            path="/create/image"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <CreateImagePage onApply={handleQuantizerApply} />
              </Suspense>
            }
          />
          <Route
            path="/editor"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <EditorPage
                  canvasProps={canvasProps}
                  canvasRef={canvasRef}
                  tool={tool}
                  onToolChange={setTool}
                  selectedColor={selectedColor}
                  onColorSelect={setSelectedColor}
                  currentPalette={currentPalette}
                  canvasData={canvasData}
                  gridSize={gridSize}
                  gridWidth={gridWidth}
                  gridHeight={gridHeight}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  selection={selection}
                  onSelectionCommand={handleSelectionCommand}
                  onClearSelection={handleClearSelection}
                  canPaste={Boolean(clipboard)}
                  fillIncludeEmpty={fillIncludeEmpty}
                  onToggleFillIncludeEmpty={handleToggleFillIncludeEmpty}
                  onNoiseCleanup={handleNoiseCleanup}
                  onExport={() => setShowExport(true)}
                />
              </Suspense>
            }
          />

          <Route
            path="/import"
            element={<ImportPage onLoadProject={handleLoadImportedProject} onSaveProject={saveWork} />}
          />

          <Route
            path="/my/beads"
            element={
              <MyBeadsPage
                user={user}
                authLoading={authLoading}
                canvasData={canvasData}
                onApplyMapping={handleApplyBeadMapping}
                works={savedWorks}
                onReassignWorkPalette={handleReassignWorkPalette}
              />
            }
          />

          <Route
            path="/contact"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <ContactPage user={user} />
              </Suspense>
            }
          />

          <Route
            path="/share/:id"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <SharePage user={user} authLoading={authLoading} onSaveWork={saveWork} />
              </Suspense>
            }
          />

          <Route
            path="/admin/dashboard"
            element={
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
            }
          />
          <Route path="/admin/login" element={renderAdminLoginPage()} />
          <Route
            path="/admin"
            element={
              <AdminPanel
                user={user}
                isAdmin={isAdmin}
                authLoading={authLoading}
                onLogin={() => navigate('/admin/login')}
                onLogout={logout}
                onChangePassword={changePassword}
                cloudStore={cloudStore}
              />
            }
          />
          <Route path="/privacy" element={<PrivacyPolicy onBack={handleLegalBack} />} />
          <Route path="/privacy/:versionId" element={<PrivacyPolicy onBack={handleLegalBack} />} />
          <Route path="/terms" element={<TermsOfService onBack={handleLegalBack} />} />
          <Route path="/terms/:versionId" element={<TermsOfService onBack={handleLegalBack} />} />
          {/* 未匹配路由:渲染 404 页,不再静默改写地址栏跳回首页(软 404) */}
          <Route path="*" element={<NotFoundPage />} />
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
          deductInventory={deductInventory}
          onToggleDeductInventory={handleToggleDeductInventory}
          onExportComplete={handleExportComplete}
          isAuthenticated={!!user}
          authEnabled={authAvailable}
          onRequireAuth={handleRequireAuth}
          onClose={() => setShowExport(false)}
        />
      )}

      {showSaveDialog &&
        createPortal(
          <div className="modal-overlay">
            <div
              className="save-dialog"
              ref={saveDialogRef}
              {...saveDialogProps}
              onClick={e => e.stopPropagation()}
            >
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
                    onClick={() => {
                      setShowSaveDialog(false)
                      openRegister()
                    }}
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
      {/* M5:颜色替换对话框(桌面/移动布局各渲染一份,共享同一份状态) */}
      <ReplaceColorDialog
        open={showReplace}
        canvasData={canvasData}
        paletteId={currentPalette}
        initialFrom={(() => {
          const b = selectionBounds(selection)
          return b ? (canvasData?.[b.y]?.[b.x] ?? null) : null
        })()}
        onClose={() => setShowReplace(false)}
        onConfirm={handleConfirmReplace}
      />

      {/* 品牌切换预览(规格 04 §4):桌面/移动各一份,共享同一份状态 */}
      <BrandSwitchDialog
        open={Boolean(pendingPalette)}
        canvasData={canvasData}
        fromPaletteId={currentPalette}
        toPaletteId={pendingPalette}
        onClose={() => setPendingPalette(null)}
        onConvert={handleBrandSwitchConvert}
        onMappingOnly={handleBrandSwitchMappingOnly}
      />

      {/* 自动保存草稿的恢复提示(规格 03 §7):只在本机有草稿时出现一次 */}
      <DraftRestorePrompt
        draft={pendingDraft}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
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
        <Route
          path="/"
          element={
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
                  autoSaveState={autoSave.state}
                  onSave={handleOpenSaveDialog}
                  saveState={saveState}
                />
              )}
              <div className="mobile-canvas-area">
                <Canvas {...canvasProps} ref={canvasRef} onTransformChange={setMobileScale} />
              </div>

              <MobileColorPalette
                selectedColor={selectedColor}
                onColorSelect={setSelectedColor}
                currentPalette={currentPalette}
                onPaletteChange={handlePaletteChange}
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
                fillIncludeEmpty={fillIncludeEmpty}
                onToggleFillIncludeEmpty={handleToggleFillIncludeEmpty}
                canPaste={Boolean(clipboard)}
                copyDrag={copyDrag}
                onToggleCopyDrag={setCopyDrag}
                snapToEdges={snapToEdges}
                onToggleSnapToEdges={setSnapToEdges}
                onNoiseCleanup={handleNoiseCleanup}
              />

              {/* 点选方向盘:手指不用贴在网格上就能逐格步进选取,
                  拇指不再挡住目标格;仅 pick 工具显示 */}
              {tool === 'pick' && (
                <PickDPad
                  cursor={pickCursor}
                  selected={pickCursor ? selectionContains(selection, pickCursor) : false}
                  onMove={movePickCursor}
                  onToggle={togglePickCursor}
                />
              )}

              {/* A4 长按上下文菜单:portal 到 body,位置由触点决定 */}
              <SelectionContextMenu
                open={Boolean(selectionMenu)}
                x={selectionMenu?.x || 0}
                y={selectionMenu?.y || 0}
                canPaste={Boolean(clipboard)}
                onCommand={handleSelectionMenuCommand}
                onClose={() => setSelectionMenu(null)}
              />
            </>
          }
        />
        <Route
          path="/gallery"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <GalleryPage
                  onLoadTemplate={handleLoadTemplate}
                  cloudStore={cloudStore}
                  user={user}
                  onSaveWork={saveWork}
                  onDeleteWork={deleteWork}
                />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/gallery/category/:slug"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <CategoryPage cloudStore={cloudStore} />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/gallery/theme/:slug"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <ThemePage cloudStore={cloudStore} />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/gallery/collection/:slug"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <CollectionPage cloudStore={cloudStore} />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/gallery/pattern/:id"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <PatternDetailPage
                  cloudStore={cloudStore}
                  onSaveProject={saveWork}
                  onLoadTemplate={handleLoadTemplate}
                />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/tutorials"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <Tutorials />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/tutorials/:id"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <Tutorials />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/faq"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <FaqPage />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/colors"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <ColorChartsPage />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/colors/:brand"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <ColorChartsPage />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/ironing"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <IroningGuidePage />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/bead-calculator"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <BeadCalculatorPage />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/bead-patterns"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <BeadPatternsPage />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/pixel-art"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <PixelArtPage />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/profile"
          element={
            <div className="mobile-page-area">
              <ProfilePage
                user={user}
                authLoading={authLoading}
                onUpdateProfile={updateProfile}
                onChangePassword={changePassword}
                works={savedWorks}
                worksLoading={worksLoading}
                worksError={worksError}
                cloudMirrorCount={cloudMirrorCount}
                beadStore={beadStore}
                onRetryWorks={reloadWorks}
                onRetryBeads={beadStore.reload}
                // 作品与收藏已从图库搬到个人中心,回调沿用 App 里同一套实例
                onLoadWork={handleLoadWork}
                onDeleteWork={deleteWork}
                // 版本时间线只覆盖本地作品:云端作品的「里程碑版本」策略未定,
                // 传 undefined 让按钮不出现,而不是给一个点了没反应的入口。
                onShowVersions={!user ? setVersionsWork : undefined}
                favorites={favorites}
                isFavorite={isFavorite}
                removeFavorite={removeFavorite}
                cloudStore={cloudStore}
                onLoadTemplate={handleLoadTemplate}
                onSendOtp={sendOtp}
                onSetPasswordWithOtp={setPasswordWithOtp}
                onChangeEmail={changeEmail}
                onVerifyPassword={verifyPassword}
                onSetSecurityKey={setSecurityKey}
                autoSaveEnabled={autoSaveEnabled}
                onToggleAutoSave={toggleAutoSave}
              />
            </div>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
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
          }
        />
        <Route
          path="/create/image"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <CreateImagePage onApply={handleQuantizerApply} />
            </Suspense>
          }
        />
        <Route
          path="/editor"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <EditorPage
                mobile
                canvasProps={canvasProps}
                canvasRef={canvasRef}
                tool={tool}
                onToolChange={setTool}
                selectedColor={selectedColor}
                onColorSelect={setSelectedColor}
                currentPalette={currentPalette}
                canvasData={canvasData}
                gridSize={gridSize}
                gridWidth={gridWidth}
                gridHeight={gridHeight}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
                selection={selection}
                onSelectionCommand={handleSelectionCommand}
                onClearSelection={handleClearSelection}
                canPaste={Boolean(clipboard)}
                fillIncludeEmpty={fillIncludeEmpty}
                onToggleFillIncludeEmpty={handleToggleFillIncludeEmpty}
                onNoiseCleanup={handleNoiseCleanup}
                onExport={() => setShowExport(true)}
                pickCursor={pickCursor}
                onPickMove={movePickCursor}
                onPickToggle={togglePickCursor}
                selectionMenu={selectionMenu}
                onCloseSelectionMenu={() => setSelectionMenu(null)}
                onSelectionMenuCommand={handleSelectionMenuCommand}
              />
            </Suspense>
          }
        />
        <Route
          path="/import"
          element={
            <div className="mobile-page-area">
              <ImportPage onLoadProject={handleLoadImportedProject} onSaveProject={saveWork} />
            </div>
          }
        />
        <Route
          path="/my/beads"
          element={
            <div className="mobile-page-area">
              <MyBeadsPage
                user={user}
                authLoading={authLoading}
                canvasData={canvasData}
                onApplyMapping={handleApplyBeadMapping}
                works={savedWorks}
                onReassignWorkPalette={handleReassignWorkPalette}
              />
            </div>
          }
        />
        {/* 联系我们直接作为 .app 的 flex 子项,不套 .mobile-page-area。
            那个容器是**块级滚动容器**,页面在其中只能拿到内容高度,填不满
            视口 —— 底部于是留出空白;键盘弹起、可见区收缩后,这段空白正好
            露在键盘上方。本页自己的三段式布局需要拿到「整段剩余高度」,
            所以与 /create/image 一样直接挂在 flex 纵向的 .app 下。 */}
        <Route
          path="/contact"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <ContactPage user={user} />
            </Suspense>
          }
        />
        <Route path="/admin/login" element={renderAdminLoginPage()} />
        <Route
          path="/share/:id"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <div className="mobile-page-area">
                <SharePage user={user} authLoading={authLoading} onSaveWork={saveWork} />
              </div>
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
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
          }
        />
        <Route path="/privacy" element={<PrivacyPolicy onBack={handleLegalBack} />} />
        <Route path="/privacy/:versionId" element={<PrivacyPolicy onBack={handleLegalBack} />} />
        <Route path="/terms" element={<TermsOfService onBack={handleLegalBack} />} />
        <Route path="/terms/:versionId" element={<TermsOfService onBack={handleLegalBack} />} />
        {/* 未匹配路由:渲染 404 页,不再静默改写地址栏跳回首页(软 404) */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {showExport && (
        <ExportPanel
          canvasData={canvasData}
          gridSize={gridSize}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          designName={designName}
          paletteId={currentPalette}
          deductInventory={deductInventory}
          onToggleDeductInventory={handleToggleDeductInventory}
          onExportComplete={handleExportComplete}
          // 移动端与桌面端共用同一套高级导出守卫:游客限制屏幕画质,
          // 高分辨率/打印与熨烫效果点击后跳转登录页并说明原因。
          isAuthenticated={!!user}
          authEnabled={authAvailable}
          onRequireAuth={handleRequireAuth}
          onClose={() => setShowExport(false)}
        />
      )}

      {showSaveDialog &&
        createPortal(
          <div className="modal-overlay">
            <div
              className="save-dialog"
              ref={saveDialogRef}
              {...saveDialogProps}
              onClick={e => e.stopPropagation()}
            >
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
                    onClick={() => {
                      setShowSaveDialog(false)
                      openRegister()
                    }}
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
      {/* M5:颜色替换对话框(桌面/移动布局各渲染一份,共享同一份状态) */}
      <ReplaceColorDialog
        open={showReplace}
        canvasData={canvasData}
        paletteId={currentPalette}
        initialFrom={(() => {
          const b = selectionBounds(selection)
          return b ? (canvasData?.[b.y]?.[b.x] ?? null) : null
        })()}
        onClose={() => setShowReplace(false)}
        onConfirm={handleConfirmReplace}
      />

      {/* 品牌切换预览(规格 04 §4):桌面/移动各一份,共享同一份状态 */}
      <BrandSwitchDialog
        open={Boolean(pendingPalette)}
        canvasData={canvasData}
        fromPaletteId={currentPalette}
        toPaletteId={pendingPalette}
        onClose={() => setPendingPalette(null)}
        onConvert={handleBrandSwitchConvert}
        onMappingOnly={handleBrandSwitchMappingOnly}
      />

      {/* 自动保存草稿的恢复提示(规格 03 §7):只在本机有草稿时出现一次 */}
      <DraftRestorePrompt
        draft={pendingDraft}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
      />

      <style>{`
      `}</style>
    </div>
  )

  // ── 每页动态 SEO(不改变功能与界面)───────────────────────
  const SEO_CONFIG = {
    canvas: {
      // 标题长度按「百度 PC 约 30 汉字截断、Google 约 60 字符」收敛:
      // 此前 51 字,品牌名 + 后半段色卡清单都会被切掉,只剩前半句。
      title: '拼豆图纸生成器 - 图片转拼豆与像素画在线制作 | 拼豆Studio',
      desc: '免费在线拼豆图纸生成器：上传图片一键转拼豆图纸，也能自由绘制像素画与网格图案；六大品牌色卡精准配色，导出带色号 PNG/SVG，内置免费模板与教程。',
    },
    gallery: {
      title: '拼豆图纸模板与免费图库 - 拼豆Studio',
      desc: '免费拼豆图纸模板库：按主题与难度筛选像素画图案，一键载入画布制作；支持重映射到 COCO/MARD/Perler 品牌色卡，收藏并云端保存作品。',
    },
    tutorials: {
      title: '拼豆教程 - 新手入门、熨烫温度与配色全攻略 | 拼豆Studio',
      desc: '拼豆新手与进阶教程：工具选择、第一个作品、熨烫温度与防变形、配色设计、成品保护，配图示与温度对照表，可配合在线拼豆图纸工具直接制作。',
    },
    faq: {
      title: '拼豆常见问题 - 使用、导出、色号与商用解答 | 拼豆Studio',
      desc: '拼豆Studio 常见问题：是否需要注册、图片转图纸流程、支持的图片格式与品牌色卡、导出方式、作品保存、分享与商用范围。',
    },
    // 品牌色卡对照页:总览页用固定文案;单个品牌由 brandSeo(palette) 动态生成
    // (见上方 seo 选择),两边共用同一份数据,不会出现首帧换标题。
    colors: {
      title: COLOR_CHARTS_SEO.title,
      desc: COLOR_CHARTS_SEO.desc,
    },
    // 熨烫对照页正文来自中文教程数据,只提供 zh-CN 与 x-default 两个
    // 语言声明 —— 与构建期快照、sitemap 保持一致。
    ironing: {
      title: IRONING_SEO.title,
      desc: IRONING_SEO.desc,
      singleLanguage: true,
    },
    beadCalculator: {
      title: CALCULATOR_SEO.title,
      desc: CALCULATOR_SEO.desc,
    },
    // 图案与像素画落地页正文是中文(目标搜索词为中文),按单语页声明
    beadPatterns: {
      title: BEAD_PATTERNS_SEO.title,
      desc: BEAD_PATTERNS_SEO.desc,
      singleLanguage: true,
    },
    pixelArt: {
      title: PIXEL_ART_SEO.title,
      desc: PIXEL_ART_SEO.desc,
      singleLanguage: true,
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
      // 独立工具页承接「图片转拼豆 / image to perler bead pattern」核心词,
      // 静态正文与 HowTo 结构化数据在 generate-prerender-html.js 里生成。
      title: '图片转拼豆图纸 - 免费在线转换工具 | 拼豆Studio',
      desc: '免费图片转拼豆图纸:上传照片自动生成带品牌色号的网格图纸,可调网格尺寸与颜色数,支持六大品牌色卡,导出 PNG/SVG。',
    },
    import: {
      title: '导入图纸 - 拼豆Studio',
      desc: '把现成的图纸文件导进来继续编辑，或从图纸截图里自动识别格子，保存为仅自己可见的拼豆图纸。',
      noindex: true,
    },
    editor: {
      title: '图纸编辑 - 拼豆Studio',
      desc: '编辑图片转拼豆生成的图纸:按图纸用色修格、点选取舍与去噪,支持撤销重做与导出。',
      noindex: true,
    },
    myBeads: {
      title: '我的色卡与库存 - 拼豆Studio',
      desc: '管理个人拼豆色卡、豆子库存，并把当前图纸的颜色匹配到目标色卡。',
      noindex: true,
    },
    contact: {
      title: '联系我们 - 拼豆Studio',
      desc: '向拼豆Studio 运营者反馈使用问题、提交功能建议或咨询拼豆图纸相关问题，回复会直接显示在会话中。',
      noindex: true,
    },
    // 公开分享页:快照内容默认不进索引(页面自己的 Helmet 会按加载结果细化,
    // 这里是加载中/兜底时的保守值)。robots 具体值由 SharePage 渲染。
    share: {
      title: '拼豆图纸分享 - 拼豆Studio',
      desc: '查看分享的拼豆图纸:尺寸、用豆量与配色一目了然,登录后可复制到自己的作品继续创作。',
      noindex: true,
    },
    privacy: {
      title: '隐私政策 - 拼豆Studio',
      desc: '了解拼豆Studio如何收集、使用和保护您的个人信息，以及账号验证、云端存储与第三方服务的详细说明。',
      // 正文写死在 LegalPages.jsx 里、只有中文,?lang=en 返回的仍是中文内容。
      // 声明 en/ja/ko 变体等于让 hreflang 指向语言不符的页面,Google 会整组忽略 ——
      // 预渲染的 privacy.html 也只写 zh-CN 与 x-default,两边必须一致。
      singleLanguage: true,
    },
    terms: {
      title: '服务条款 - 拼豆Studio',
      desc: '使用拼豆Studio在线拼豆图纸设计工具的服务条款：账户安全、用户内容、模板库与使用规范。',
      singleLanguage: true,
    },
    // 404:不存在的地址。必须 noindex —— 让搜索引擎知道这些 URL 不该被收录,
    // 否则每个乱路径都会作为「标题描述与首页相同」的副本进索引。
    notFound: {
      title: '页面不存在 - 拼豆Studio',
      desc: '该地址没有对应的内容。',
      noindex: true,
    },
  }

  // 404 覆盖:路径形状不存在时,不论 currentPage 归到哪一组,都改用 notFound 的 meta
  const seo = isNotFound || (categorySlug && !categoryMeta) || colorNotFound
    ? SEO_CONFIG.notFound
    : categoryMeta
      ? categorySeo(categoryMeta)
      : colorBrand
        ? brandSeo(colorBrand)
        : SEO_CONFIG[currentPage] || SEO_CONFIG.canvas

  // 各页面对应的规范路径(privacy/terms 的 :versionId 历史版本归并到父路径)
  const CANONICAL_PATH = {
    canvas: '/',
    gallery: '/gallery',
    tutorials: '/tutorials',
    faq: '/faq',
    colors: '/colors',
    ironing: '/ironing',
    beadCalculator: '/bead-calculator',
    beadPatterns: '/bead-patterns',
    pixelArt: '/pixel-art',
    admin: '/admin',
    adminLogin: '/admin/login',
    login: '/login',
    profile: '/profile',
    createImage: '/create/image',
    editor: '/editor',
    import: '/import',
    privacy: '/privacy',
    terms: '/terms',
    myBeads: '/my/beads',
    contact: '/contact',
  }
  const SITE_ORIGIN = 'https://tangnotes.site'
  // 主题/合集/图纸详情/分类聚合是动态内容页,canonical 自指;其余 /gallery/* 子路径
  // 仍归并到 /gallery,避免把未知路径当作可收录页面。
  // 404 页(含不存在的分类 slug)没有自己的规范地址:一律指向站点根,配合 noindex
  // 让搜索引擎把它当作一个不应存在的入口,而不是某个真实页面的别名。
  const baseUrl = isNotFound || (categorySlug && !categoryMeta) || colorNotFound
    ? `${SITE_ORIGIN}/`
    : `${SITE_ORIGIN}${canonicalPathFor(location.pathname, CANONICAL_PATH[currentPage] || '/')}`

  // hreflang 值统一为「语言子标签」(zh-CN 除外),与预渲染 HTML、sitemap.xml 保持一致。
  // canonical 一律自指裸路径:同一个 URL 去掉筛选/语言参数就是它的规范地址。
  // `?lang=en|ja|ko` 只是界面语言偏好(一套静态 HTML 服务所有语言),不再声明为
  // 语言变体 —— 此前这里让 ?lang= 页自指,而静态 HTML 的 canonical 是裸路径,
  // 同一页面出现两套 canonical,正是 GSC「Google 选择的规范网页与用户指定的
  // 不同」的主要来源。要多语言收录必须按语言输出独立路径的 HTML。
  const canonical = baseUrl

  const seoHelmet = (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.desc} />
      <meta
        name="robots"
        content={
          seo.noindex
            ? 'noindex, nofollow'
            : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        }
      />
      <link rel="canonical" href={canonical} />
      {/* 与预渲染 HTML 和 sitemap 保持同一套声明:只保留 zh-CN + x-default */}
      <link rel="alternate" hrefLang="zh-CN" href={baseUrl} />
      <link rel="alternate" hrefLang="x-default" href={baseUrl} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.desc} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://tangnotes.site/og-image.png" />
      <meta name="twitter:card" content="summary_large_image" />
      {/* twitter 三件套必须由 Helmet 统一托管:预渲染 HTML 里写死的同名标签带着
          data-rh 标记,凡是不在 Helmet 渲染集合里的标签,首帧提交时都会被当作
          「上一轮留下的旧标签」删掉。这里补齐后,首页与内容页的 twitter 卡片
          在预渲染、客户端两个阶段都是同一套。 */}
      <meta name="twitter:title" content={seo.title} />
      <meta name="twitter:description" content={seo.desc} />
      <meta name="twitter:image" content="https://tangnotes.site/og-image.png" />
    </Helmet>
  )

  // 根据设备类型返回对应布局
  return (
    <>
      {seoHelmet}
      {isMobile || isTablet ? renderMobileLayout() : renderDesktopLayout()}
      {/* 自动保存状态:桌面 / 平板用顶栏下方的悬浮旁注,不占顶栏布局;
          手机端由 MobileCanvasInfoBar 承载,避免两个提示同时出现。 */}
      {currentPage === 'canvas' && !isMobile && <AutoSaveStatus state={autoSave.state} />}
      {/* 版本时间线:与布局无关,桌面/移动共用同一份,只挂一次。
          组件内部已 createPortal 到 body,不受布局容器影响。 */}
      <VersionHistoryDialog
        open={!!versionsWork}
        work={versionsWork}
        loadVersions={loadVersions}
        onRollback={handleRollbackVersion}
        onClose={() => setVersionsWork(null)}
      />
    </>
  )
}
