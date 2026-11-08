/**
 * GalleryPage — Gallery V3(/gallery 主路由):资源发现中心。
 *
 * 信息架构(重构文档 03):
 *   .gallery-explorer
 *   ├── GallerySidebar(桌面 ≥1100px:发现/策展锚点/动态分类/创作入口)
 *   └── .gallery-main
 *       ├── 页头(左对齐) + 紧凑工具栏(搜索 + 筛选入口 + 结果数)
 *       ├── ActiveFilterChips(有筛选才渲染)
 *       ├── GalleryFeedTabs(精选/热门/最新,一级互斥 feed)
 *       └── feed 面板:精选=策展布局(资源/主题/合集),热门/最新=排序网格
 *
 * 状态契约(04 §2):
 *   - feed 与 q/cat/diff/colors 全部走 URL(useGalleryQuery),刷新/前进后退/分享可用;
 *   - 切 feed 不清筛选,筛选不改 feed;
 *   - 精选视图在有筛选时退化为「筛选结果」网格,不再展示无关策展封面。
 * 数据口径:热门=pickPopular 真实下载量;最新=pickLatest 可信 createdAt;
 * 精选资源=后台 gallery_featured_templates 人工策展关系(M5)。
 *
 * 模板动作(收藏/导出/品牌转换/载入画布)沿用既有链路,卡片见 GalleryTemplateCard。
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Search, Share2, SlidersHorizontal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, convertTemplateToBrand, templateDimensions } from '../../data/templates'
import { getPalette } from '../../data/palettes'
import { exportAsPNG } from '../../services/BeadPatternExporter'
import { templateToProject } from '../../services/project/adapters'
import { projectToImportWork } from '../../services/project/importProject'
import { useToast } from '../../components/Toast'
import ThumbnailCanvas from '../../components/ThumbnailCanvas'
import ShareWorkDialog from '../sharing/ShareWorkDialog'
import { useGalleryQuery } from './hooks/useGalleryQuery'
import { templateMatchesQuery } from './hooks/useFilteredTemplates'
import { useGalleryTemplates } from './hooks/useGalleryTemplates'
import useDownloadCounts from './hooks/useDownloadCounts'
import { useGalleryContent } from '../../hooks/useGalleryContent'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import useGalleryFavorites from '../../hooks/useGalleryFavorites'
import { buildDiscoverySections, pickPopular, pickLatest, resolveTemplatesByIds } from './discovery'
import DiscoveryRails from './components/DiscoveryRails'
import GalleryTemplateCard from './components/GalleryTemplateCard'
import GallerySidebar from './components/GallerySidebar'
import GalleryFilterPanel from './components/GalleryFilterPanel'
import GalleryFeedTabs from './components/GalleryFeedTabs'
// 与详情页共享的卡片/菜单/横幅/弹窗样式
import './gallery.css'
// 探索器布局(侧栏/工具栏/tabs/筛选面板)专属作用域样式
import './gallery.explorer.css'

/** feed 视图的结果上限(横向 rail 时代是 12;主网格放大到 48) */
const FEED_LIMIT = 48

/** 分享只接受云端作品:works 表主键是 UUID */
const CLOUD_ID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export default function GalleryPage({ onLoadTemplate, cloudStore, user, onSaveWork, onDeleteWork }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  // feed 与筛选全部走 URL 状态:刷新恢复、前进后退、可分享
  const {
    searchTerm,
    setSearchTerm,
    category,
    setCategory,
    difficulty,
    setDifficulty,
    maxColors,
    setMaxColors,
    feed,
    browse,
    setFeed,
    browseAll,
    clearFiltersAndGoToFeed,
    legacyView,
    clearLegacyView,
    setFilters,
  } = useGalleryQuery()

  // 旧链接 ?view=works / ?view=favorites 指向的视图已搬到个人中心。
  // 静默清掉参数(保留其余筛选),用户看到的仍是模板库,不会被顶成空白。
  useEffect(() => {
    if (legacyView) clearLegacyView()
  }, [legacyView, clearLegacyView])

  // 云端启用时,模板库完全来自云端(RLS 公开只读);未启用时回退本地模式
  // (内置模板 + localStorage 自定义模板,自定义在前)
  const { cloudEnabled, cloudDown, allTemplates, customCategories } = useGalleryTemplates(cloudStore)
  const categoryOptions = useMemo(
    () => [...new Set([...CATEGORIES, ...customCategories.map(c => c.id)])],
    [customCategories]
  )
  // 每个分类下的模板总数;侧栏/筛选面板的计数取同一份
  const categoryCounts = useMemo(() => {
    const counts = {}
    for (const tpl of allTemplates) counts[tpl.category] = (counts[tpl.category] || 0) + 1
    return counts
  }, [allTemplates])
  const getCategoryLabel = cat => {
    const custom = customCategories.find(c => c.id === cat)
    return custom ? custom.label : t(`gallery.categories.${cat}`, cat)
  }

  // 收藏:与个人中心的「我的收藏」分区共用同一份数据(useGalleryFavorites)
  const { isFavorite, toggleFavorite } = useGalleryFavorites()
  const [exportingId, setExportingId] = useState(null)
  // 每模板用户选定的转换品牌(不改云端模板本身;跨卡片/跨 feed 持久)
  const [brandOverride, setBrandOverride] = useState({})
  // 待确认填充到画布的模板(卡片点击不再直接填充,弹窗让用户确认,避免误触)
  const [pendingLoad, setPendingLoad] = useState(null)
  // 弹窗内「创建分享链接」:分享 RPC 只认 works 表里的作品,所以先复制一份
  // 云端作品作为快照来源;分享是独立快照,流程结束(成功/取消/离开页面)后
  // 立即删除这份临时副本 —— 不该混进用户真正的「我的作品」列表。
  const [shareWork, setShareWork] = useState(null)
  const [sharePreparing, setSharePreparing] = useState(false)
  const shareCopyRef = useRef(null)
  const deleteWorkRef = useRef(onDeleteWork)
  useEffect(() => {
    deleteWorkRef.current = onDeleteWork
  }, [onDeleteWork])

  const cleanupShareCopy = useCallback(async () => {
    const temp = shareCopyRef.current
    shareCopyRef.current = null
    if (!temp) return
    try {
      await deleteWorkRef.current?.(temp)
    } catch (error) {
      // 清理失败不阻断任何主流程,只留诊断信息
      console.warn('[share] cleanup temp copy failed', error)
    }
  }, [])

  const closeShareDialog = useCallback(() => {
    setShareWork(null)
    void cleanupShareCopy()
  }, [cleanupShareCopy])

  // 切换页面(组件卸载)时同样要清掉临时副本
  useEffect(
    () => () => {
      void cleanupShareCopy()
    },
    [cleanupShareCopy]
  )
  // 筛选面板开关(触发按钮引用用于锚定定位与焦点归还)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterTriggerRef = useRef(null)
  // 侧栏策展锚点:切到精选 feed 并滚动到对应区块
  const [pendingAnchor, setPendingAnchor] = useState(null)
  // 载入确认弹层打开时锁背景滚动(引用计数)
  useScrollLock(!!pendingLoad)

  // 可访问性(规格 08 §5):载入确认浮层。载入会替换当前画布,
  // 因此必须显式选择「取消」或「载入」,遮罩与 Escape 都不关闭。
  const { ref: loadConfirmRef, dialogProps: loadConfirmDialogProps } = useDialogA11y({
    open: !!pendingLoad,
    onClose: () => setPendingLoad(null),
    label: t('gallery.loadConfirmTitle'),
    role: 'alertdialog',
    dismissible: false,
  })

  // 下载量:本地计数(localStorage 持久)叠加云端模板 download_count(抽出的共享 hook)
  const { getDownloadCount, bumpDownload } = useDownloadCounts({
    cloudEnabled,
    onCloudSync: () => cloudStore?.refresh?.(),
  })

  // 策展内容(主题/合集):与模板数据相互独立,失败时为空集合,旧图库照常可用。
  const galleryContent = useGalleryContent()
  const discoverySections = useMemo(
    () =>
      buildDiscoverySections({
        templates: allTemplates,
        downloadCountOf: getDownloadCount,
        themes: galleryContent.themes,
        collections: galleryContent.collections,
        themeTemplateIds: galleryContent.themeTemplateIds,
        collectionTemplateIds: galleryContent.collectionTemplateIds,
        homeSections: galleryContent.homeSections,
      }),
    [
      allTemplates,
      getDownloadCount,
      galleryContent.themes,
      galleryContent.collections,
      galleryContent.themeTemplateIds,
      galleryContent.collectionTemplateIds,
      galleryContent.homeSections,
    ]
  )
  const discoveryEnabled = galleryContent.enabled && !cloudDown
  // 搜索/分类/难度/用色数任一激活时隐藏策展区块,避免「筛选了却还看到无关推荐」
  const filtersActive = !!searchTerm || category !== 'all' || difficulty !== 'all' || !!maxColors
  const activeFilterCount = [
    searchTerm ? 1 : 0,
    category !== 'all' ? 1 : 0,
    difficulty !== 'all' ? 1 : 0,
    maxColors ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  // 当前语言下的显示名:与卡片/详情页同一口径,供搜索匹配使用
  const resolveTemplateName = useCallback(
    template =>
      template.name
        ? template.nameZh || template.name
        : t(`templates.names.${template.nameKey}`, template.nameKey),
    [t]
  )

  /** 模板创建(上传)日期,按当前语言格式化;无日期(本地模板)返回空串 */
  const formatCreatedDate = useCallback(
    value => {
      if (!value) return ''
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return ''
      try {
        return d.toLocaleDateString(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' })
      } catch {
        return String(value).slice(0, 10)
      }
    },
    [i18n]
  )

  /**
   * 从图库模板创建公开分享链接。
   *
   * 分享 RPC 只认 works 表里当前用户自己的作品,所以先复制一份到
   * 「我的作品」(gallery-copy 语义,源模板不被修改),拿到云端 UUID
   * 后立即对该副本打开分享弹窗。
   */
  const handleShareTemplate = useCallback(
    async template => {
      if (!template || sharePreparing) return
      if (!user) {
        toast(t('share.notLoggedIn'), 'info')
        navigate('/login', { state: { mode: 'register', next: '/gallery', reason: 'shareCopy' } })
        return
      }
      if (!onSaveWork) return
      setSharePreparing(true)
      try {
        const project = templateToProject(template)
        const work = projectToImportWork(project, { savedAt: new Date().toISOString() })
        if (!work) {
          toast(t('errors.saveFailed'), 'error')
          return
        }
        const saved = await onSaveWork({ ...work, sourceTemplateId: template.id })
        if (saved && typeof saved.id === 'string' && CLOUD_ID_RE.test(saved.id)) {
          // 记下临时副本:分享弹窗关闭后立即删除,不留在「我的作品」里
          shareCopyRef.current = saved
          setPendingLoad(null)
          setShareWork(saved)
        } else if (saved) {
          // 本地模式保存成功但没有云端 id:公开分享依赖云端,明确告知而不是静默失败
          toast(t('share.cloudUnavailable'), 'error')
        }
        // saved 为 false 时 saveWork 已 toast 具体失败原因
      } finally {
        setSharePreparing(false)
      }
    },
    [user, onSaveWork, sharePreparing, t, toast, navigate]
  )

  // ── feed 数据(04 §3):过滤先收窄集合,再按 feed 各自的排序派生 ──
  // 复用 useFilteredTemplates 的纯函数:图库、主题页、合集页对同一组 URL
  // 参数必须得到一致结果(同时匹配 name/nameZh/翻译名,并忽略首尾空格)。
  const filteredTemplates = useMemo(
    () =>
      allTemplates.filter(template =>
        templateMatchesQuery(template, { searchTerm, category, difficulty, maxColors }, resolveTemplateName)
      ),
    [allTemplates, searchTerm, category, difficulty, maxColors, resolveTemplateName]
  )
  // 热门:过滤后按真实下载量降序(0 下载不进入);最新:过滤后按可信 createdAt 降序
  const popularTemplates = useMemo(
    () => pickPopular(filteredTemplates, getDownloadCount, FEED_LIMIT),
    [filteredTemplates, getDownloadCount]
  )
  const latestTemplates = useMemo(() => pickLatest(filteredTemplates, FEED_LIMIT), [filteredTemplates])
  // 精选资源:后台人工策展关系(gallery_featured_templates),按 sort_order 解析、
  // 跳过已删除/不可读的 id。关系未加载/为空时整段隐藏,不渲染占位壳。
  const featuredTemplates = useMemo(
    () => resolveTemplatesByIds(allTemplates, galleryContent.featuredTemplateIds || []).templates,
    [allTemplates, galleryContent.featuredTemplateIds]
  )
  // 精选视图区块:popular/latest 已升级为一级 feed,不再作为纵向区块堆在精选下方
  const featuredBlocks = useMemo(
    () => discoverySections.blocks.filter(b => b.kind !== 'popular' && b.kind !== 'latest'),
    [discoverySections]
  )

  // 精选视图是否有可展示的策展内容:没有(本地模式/未配置云端/全部为空)时
  // 退化为完整模板网格 —— 不能让默认首屏变成一片空白。
  // 云端模板已降级(cloudDown)时策展区块不渲染(见 discoveryEnabled),此时
  // 即使内容表加载成功也不能进入策展视图 —— 否则横幅承诺的本地模板回退会被
  // 一个空白面板取代。
  const featuredViewHasCuration =
    featuredTemplates.length > 0 || (discoveryEnabled && featuredBlocks.length > 0)
  // 精选视图的最终形态:有策展内容且无筛选 → 策展布局;否则按结果网格处理
  // 「全部图纸」浏览态(02 §7)显式绕过策展布局,渲染全量网格。
  const showCurationView = feed === 'featured' && !filtersActive && !browse && featuredViewHasCuration

  // 模板生效品牌:优先用户覆盖,否则模板自带 paletteId(缺省 perler)
  const templateBrandId = template => brandOverride[template.id] || template.paletteId || 'perler'
  // 用户指定了不同于模板原始品牌的转换 → 载入/导出前把 pattern 颜色重映射到该品牌
  const templateConvertedPattern = template => {
    const override = brandOverride[template.id]
    if (override && override !== template.paletteId) return convertTemplateToBrand(template.pattern, override)
    return template.pattern
  }

  const handleExportTemplate = async (template, beadStyle, e) => {
    e.stopPropagation()
    setExportingId(template.id)
    try {
      const brand = templateBrandId(template)
      const palette = getPalette(brand)
      // 矩形模板必须传真实宽高,否则旧导出器按 size 单值当正方形裁/补
      const { width, height } = templateDimensions(template)
      await exportAsPNG(
        templateConvertedPattern(template),
        Math.max(width, height),
        brand,
        t(`templates.names.${template.nameKey}`, template.nameKey),
        palette,
        { beadStyle, gridWidth: width, gridHeight: height }
      )
      // 导出成功(任一格式)即计数 +1:本地同步 +1,云端 RPC 后台异步(不阻塞导出状态复位)
      bumpDownload(template)
    } catch (err) {
      console.error('Template export failed:', err)
      // 导出失败给出可自动消失的提示(error 默认常驻,在图库流里会像「孤窗」
      // 一样挡着内容;8s 足够读完,也可悬停暂停)
      toast(t('export.exportFailed'), 'error', 8000)
    } finally {
      setExportingId(null)
    }
  }

  const handleToggleFavorite = (id, e) => {
    e.stopPropagation()
    toggleFavorite(id)
  }

  // 载入模板:有品牌(模板自带或用户覆盖)时转换 pattern 并通知 App 同步切换色卡;
  // 无品牌(内置通用模板)则原样载入,不打扰用户当前色卡。
  const handleTemplateLoad = template => {
    const brand = brandOverride[template.id] || template.paletteId
    const { width, height } = templateDimensions(template)
    const options = {}
    if (brand) options.palette = brand
    if (width !== height) {
      options.gridWidth = width
      options.gridHeight = height
    }
    onLoadTemplate(
      templateConvertedPattern(template),
      Math.max(width, height),
      Object.keys(options).length > 0 ? options : undefined
    )
  }

  const clearAllFilters = () => setFilters({ q: '', cat: 'all', diff: 'all', colors: '' })

  // 侧栏意图(状态在 GalleryPage:侧栏不持有第二份筛选状态)
  // 发现 = 回到默认的精选视图(清筛选、退出全部浏览态);全部图纸 = 显式浏览全集。
  const handleDiscover = () => clearFiltersAndGoToFeed('featured')
  const handleAllTemplates = () => browseAll()
  const handleCurationAnchor = kind => {
    // 策展区块只在「精选 feed + 无筛选」时渲染,先恢复该状态再定位。
    // 必须一次写入:分开清筛选与切 feed 时,第二次导航会以旧参数为基底把筛选写回。
    clearFiltersAndGoToFeed('featured')
    setPendingAnchor(kind)
  }
  // 侧栏分类只改 cat:feed 与其它条件保持不动(单一分类状态源)
  const handleSidebarCategory = cat => setCategory(cat === 'all' ? 'all' : cat)

  // 策展锚点定位:目标区块渲染完成后滚动(尊重 reduced-motion 由浏览器处理)
  useEffect(() => {
    if (!pendingAnchor || feed !== 'featured' || filtersActive) return
    const el = document.getElementById(`gallery-section-${pendingAnchor}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPendingAnchor(null)
    }
  }, [pendingAnchor, feed, filtersActive])

  // feed 面板的网格结果:每个 feed 用自己的集合与空态
  const feedResults =
    feed === 'popular' ? popularTemplates : feed === 'latest' ? latestTemplates : filteredTemplates // featured + 筛选 → 筛选结果全集
  const feedEmptyHint =
    feed === 'popular'
      ? t('gallery.explorer.popularEmpty')
      : feed === 'latest'
        ? t('gallery.explorer.latestEmpty')
        : t('gallery.noResultsHint')
  // 热门/最新在没有筛选时为空,原因是「暂无数据」而不是「匹配不到」:
  // 此时把 feed 自己的说明当作标题,不再显示「没有找到匹配的模板」。
  const emptyWithoutFilters = !filtersActive && feed !== 'featured'
  const emptyTitle = emptyWithoutFilters ? feedEmptyHint : t('gallery.noResults')
  const emptyHint = emptyWithoutFilters ? '' : feedEmptyHint

  /** 卡片公共回调包(feed 网格与精选资源网格共用同一套动作) */
  const renderTemplateGrid = templates => (
    <div className="templates-grid">
      {templates.map(template => (
        <GalleryTemplateCard
          key={template.id}
          template={template}
          categoryLabel={getCategoryLabel(template.category)}
          favorite={isFavorite(template.id)}
          onToggleFavorite={e => handleToggleFavorite(template.id, e)}
          onOpen={() => setPendingLoad(template)}
          exporting={exportingId === template.id}
          onExportTemplate={handleExportTemplate}
          brandId={templateBrandId(template)}
          brandOverridden={Boolean(brandOverride[template.id])}
          onBrandSelect={brandId =>
            setBrandOverride(prev => {
              const next = { ...prev }
              if (!brandId || brandId === template.paletteId) delete next[template.id]
              else next[template.id] = brandId
              return next
            })
          }
          getDownloadCount={getDownloadCount}
        />
      ))}
    </div>
  )

  // 激活筛选 chips(逐项移除;搜索词 chip 与输入框并存)
  const chips = []
  if (searchTerm)
    chips.push({
      key: 'q',
      label: t('gallery.explorer.chipSearch', { q: searchTerm }),
      remove: () => setSearchTerm(''),
    })
  if (category !== 'all')
    chips.push({
      key: 'cat',
      label: t('gallery.explorer.chipCategory', { label: getCategoryLabel(category) }),
      remove: () => setCategory('all'),
    })
  if (difficulty !== 'all')
    chips.push({
      key: 'diff',
      label: t('gallery.explorer.chipDifficulty', { label: t(`gallery.difficulties.${difficulty}`) }),
      remove: () => setDifficulty('all'),
    })
  if (maxColors)
    chips.push({
      key: 'colors',
      label: t('gallery.explorer.chipColors', { n: maxColors }),
      remove: () => setMaxColors(''),
    })

  return (
    <div className="gallery-page">
      {/* 悬浮按钮:联系我们(站内无其它固定入口;返回首页由站点 Header 的 LOGO 覆盖) */}
      <div className="gallery-floating">
        <button
          className="gallery-float-btn contact"
          onClick={() => navigate('/contact')}
          aria-label={t('gallery.contactUs')}
          title={t('gallery.contactUs')}
        >
          <MessageCircle size={20} />
        </button>
      </div>

      <div className="gallery-explorer">
        <GallerySidebar
          feed={feed}
          browse={browse}
          filtersActive={filtersActive}
          category={category}
          categoryOptions={categoryOptions}
          categoryCounts={categoryCounts}
          getCategoryLabel={getCategoryLabel}
          onSelectCategory={handleSidebarCategory}
          onDiscover={handleDiscover}
          onAllTemplates={handleAllTemplates}
          onCurationAnchor={handleCurationAnchor}
          onCreate={() => navigate('/')}
          onOpenProfile={() => navigate('/profile')}
        />

        <div className="gallery-main">
          <header className="gallery-explorer-head">
            <h1 className="gallery-title">{t('gallery.title')}</h1>
            <p className="gallery-subtitle">{t('gallery.subtitle')}</p>
          </header>

          {/* 紧凑工具栏:feed tabs 与搜索/筛选同一行;
              搜索框保持常规宽度并贴近筛选入口,不再横贯整行 */}
          <div className="gallery-toolbar">
            <GalleryFeedTabs feed={feed} onFeedChange={setFeed} />
            <div className="gallery-toolbar-end">
              <div className="gallery-search">
                <Search size={15} className="gallery-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  placeholder={t('gallery.search')}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  aria-label={t('gallery.search')}
                />
              </div>
              <button
                ref={filterTriggerRef}
                type="button"
                className="gallery-filter-trigger"
                aria-haspopup="dialog"
                aria-expanded={filterOpen}
                aria-label={
                  activeFilterCount > 0
                    ? t('gallery.explorer.filterCount', { n: activeFilterCount })
                    : t('gallery.explorer.filter')
                }
                onClick={() => setFilterOpen(v => !v)}
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                <span>{t('gallery.explorer.filter')}</span>
                {activeFilterCount > 0 && <span className="gallery-filter-badge">{activeFilterCount}</span>}
              </button>
              {/* 结果数只描述网格结果:策展视图展示的是人工挑选的区块,
                  用全库模板数会显示一个与屏幕内容无关的数字。 */}
              {!showCurationView && (
                <span className="gallery-result-count" role="status">
                  {t('gallery.explorer.resultCount', { n: feedResults.length })}
                </span>
              )}
            </div>
          </div>

          {/* 激活筛选 chips:逐项移除 + 清除全部;无筛选时不渲染(不留空高度) */}
          {chips.length > 0 && (
            <div className="gallery-chips" aria-label={t('gallery.explorer.filter')}>
              {chips.map(chip => (
                <span key={chip.key} className="gallery-chip">
                  <span className="gallery-chip-label">{chip.label}</span>
                  <button
                    type="button"
                    className="gallery-chip-remove"
                    onClick={chip.remove}
                    aria-label={t('gallery.explorer.removeFilter', { label: chip.label })}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
              <button type="button" className="gallery-chips-clear" onClick={clearAllFilters}>
                {t('gallery.explorer.clearAll')}
              </button>
            </div>
          )}

          {/* 移动端/平板分类横条(桌面由 CSS 隐藏,分类入口在侧栏) */}
          <div className="gallery-catnav" role="navigation" aria-label={t('gallery.explorer.navCategories')}>
            {categoryOptions.map(cat => (
              <button
                key={cat}
                type="button"
                className={`gallery-catnav-btn${category === cat ? ' active' : ''}`}
                aria-pressed={category === cat}
                onClick={() => handleSidebarCategory(cat)}
              >
                {getCategoryLabel(cat)}
                <span className="gallery-catnav-count">
                  {cat === 'all' ? allTemplates.length : categoryCounts[cat] || 0}
                </span>
              </button>
            ))}
          </div>

          <div
            className="gallery-feed-panel"
            id="gallery-feed-panel"
            role="tabpanel"
            aria-labelledby={`gallery-tab-${feed}`}
          >
            {/* 云端不可用:横幅说明 + 已回退本地/内置模板;网络恢复后自动重试 */}
            {cloudDown && (
              <div className="cloud-offline-banner" role="status">
                <div className="cloud-offline-text">
                  <strong>{t('gallery.cloudLoadError')}</strong>
                  <span>{t('gallery.cloudFallbackNotice')}</span>
                  <span className="cloud-offline-reason">
                    {cloudStore?.error === 'timeout'
                      ? t('gallery.cloudErrorTimeout')
                      : t('gallery.cloudLoadErrorHint')}
                  </span>
                </div>
                <button className="retry-btn" onClick={() => cloudStore.loadAll()}>
                  {t('gallery.retry')}
                </button>
              </div>
            )}

            {showCurationView ? (
              /* ── 精选视图:策展布局(数据缺失/失败 → 整块隐藏,不渲染空壳) ── */
              <>
                {featuredTemplates.length > 0 && (
                  <section className="gallery-section" aria-label={t('gallery.explorer.featuredResources')}>
                    <div className="gallery-section-head">
                      <h2>{t('gallery.explorer.featuredResources')}</h2>
                      <span className="gallery-section-hint">
                        {t('gallery.explorer.featuredResourcesHint')}
                      </span>
                    </div>
                    {renderTemplateGrid(featuredTemplates)}
                  </section>
                )}
                {discoveryEnabled && (
                  <DiscoveryRails
                    sections={{ ...discoverySections, blocks: featuredBlocks }}
                    loading={galleryContent.loading}
                    error={galleryContent.error}
                    onOpenTheme={theme => navigate(`/gallery/theme/${encodeURIComponent(theme.slug)}`)}
                    onOpenCollection={collection =>
                      navigate(`/gallery/collection/${encodeURIComponent(collection.slug)}`)
                    }
                    onOpenPattern={template =>
                      navigate(`/gallery/pattern/${encodeURIComponent(template.id)}`)
                    }
                    onViewAllThemes={clearAllFilters}
                    onViewAllCollections={clearAllFilters}
                  />
                )}
              </>
            ) : (
              /* ── 热门/最新/筛选结果:同一网格,各自的数据口径与空态 ── */
              <>
                {feed === 'featured' && (filtersActive || browse) && (
                  <div className="gallery-feed-note" role="note">
                    <strong>
                      {filtersActive ? t('gallery.explorer.resultsTitle') : t('gallery.explorer.navAll')}
                    </strong>
                    <span>
                      {filtersActive ? t('gallery.explorer.resultsHint') : t('gallery.explorer.allHint')}
                    </span>
                  </div>
                )}
                {cloudEnabled && cloudStore?.loading ? (
                  <div className="empty-state">
                    <p>{t('gallery.cloudLoading')}</p>
                  </div>
                ) : cloudEnabled && allTemplates.length === 0 ? (
                  <div className="empty-state">
                    <svg
                      width="64"
                      height="64"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v8" />
                      <path d="M12 16.5v.01" />
                    </svg>
                    <p>{t('gallery.cloudEmpty')}</p>
                    <span>{t('gallery.cloudEmptyHint')}</span>
                  </div>
                ) : feedResults.length === 0 ? (
                  <div className="empty-state">
                    <svg
                      width="64"
                      height="64"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <p>{emptyTitle}</p>
                    {emptyHint && <span>{emptyHint}</span>}
                    {filtersActive && (
                      <button
                        type="button"
                        className="btn btn-primary empty-login-btn"
                        onClick={clearAllFilters}
                      >
                        {t('gallery.discovery.filterReset')}
                      </button>
                    )}
                  </div>
                ) : (
                  renderTemplateGrid(feedResults)
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <GalleryFilterPanel
        open={filterOpen}
        onClose={() => {
          setFilterOpen(false)
          requestAnimationFrame(() => filterTriggerRef.current?.focus?.())
        }}
        triggerRef={filterTriggerRef}
        categoryOptions={categoryOptions}
        categoryCounts={categoryCounts}
        getCategoryLabel={getCategoryLabel}
        category={category}
        onCategory={setCategory}
        difficulty={difficulty}
        onDifficulty={setDifficulty}
        maxColors={maxColors}
        onMaxColors={setMaxColors}
        onReset={clearAllFilters}
      />

      {/* 填充模板到画布:点击卡片后弹出确认,避免误触直接填充+跳转 */}
      {pendingLoad &&
        createPortal(
          (() => {
            // 预览与文案共用同一份真实宽高(数据形状优先,见 templateDimensions)
            const pendingDims = templateDimensions(pendingLoad)
            return (
              <div className="load-confirm-overlay">
                <div
                  className="load-confirm-modal"
                  ref={loadConfirmRef}
                  {...loadConfirmDialogProps}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="load-confirm-preview">
                    <ThumbnailCanvas
                      pattern={pendingLoad.pattern}
                      size={pendingLoad.size}
                      gridWidth={pendingDims.width}
                      gridHeight={pendingDims.height}
                    />
                  </div>
                  <div className="load-confirm-info">
                    <h3 className="load-confirm-title">{resolveTemplateName(pendingLoad)}</h3>
                    <p className="load-confirm-meta">
                      {pendingDims.width} × {pendingDims.height}
                      {pendingLoad.createdAt
                        ? ` · ${t('share.manage.created', { date: formatCreatedDate(pendingLoad.createdAt) })}`
                        : ''}
                    </p>
                    <div className="load-confirm-actions">
                      <button
                        className="load-confirm-ok"
                        onClick={() => {
                          const tpl = pendingLoad
                          setPendingLoad(null)
                          handleTemplateLoad(tpl)
                        }}
                      >
                        {t('gallery.loadToCanvas')}
                      </button>
                      <button
                        className="load-confirm-share"
                        onClick={() => handleShareTemplate(pendingLoad)}
                        disabled={sharePreparing}
                      >
                        <Share2 size={15} aria-hidden="true" />
                        {t('gallery.loadConfirmShare')}
                      </button>
                      <button className="load-confirm-cancel" onClick={() => setPendingLoad(null)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })(),
          document.body
        )}

      {/* 弹窗内「创建分享链接」的产物:对复制出的云端作品走标准分享流程 */}
      {/* 弹窗内「创建分享链接」的产物:关闭即删除临时副本;
          已发布的分享是独立快照,不受源作品删除影响 */}
      <ShareWorkDialog open={!!shareWork} work={shareWork} onClose={closeShareDialog} />
    </div>
  )
}
