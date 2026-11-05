import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { getPalette } from '../data/palettes'
import {
  createPatternDocument,
  calculateColorStats,
  createBrandColorResolver,
} from '../services/export/PatternDocument'
import { renderPatternDocumentToPNG } from '../services/export/RasterRenderer'
import { renderPatternDocumentToSVG, svgStringToBlob } from '../services/export/VectorRenderer'
import { renderIroningEffect } from '../services/export/IroningEffectRenderer'
import { getIroningEffectPreset } from '../services/export/ironingEffectPresets'
import IroningEffectSection from './export/IroningEffectSection'
import AuthPromptDialog from './auth/AuthPromptDialog'
import { normalizeCellsToHex } from '../services/colorUtils'
import { calculatePhysicalSize } from '../services/BeadPatternExporter'
import { canvasToLegacyWork } from '../services/project/adapters'
import { legacyWorkToProject } from '../services/project/adapters'
import { projectToFileText, projectFileName, downloadProjectFile } from '../services/project/exportProject'

/**
 * 导出质量预设(规格 09 §2「可提供屏幕分享 / 高分辨率 / 打印预设」)。
 *
 * dpi 语义:300 是现有固定 3× 超采样的哨兵值(RasterRenderer / 导出器内部据此分流);
 * 其他值换算成更高倍率(432→6×、576→8×)。两条路径都受同一套面积预算约束,
 * 超限时降级并通过 onScale 回报 —— 预设只是「请求值」,不是承诺。
 */
const QUALITY_PRESETS = {
  screen: { dpi: 300, labelKey: 'export.qualityScreen' },
  high: { dpi: 432, labelKey: 'export.qualityHigh' },
  print: { dpi: 576, labelKey: 'export.qualityPrint' },
}
const QUALITY_ORDER = ['screen', 'high', 'print']

/**
 * 文件名片段净化:作品名来自用户输入,替换各平台文件名非法字符
 * (Windows 保留字符 + 控制字符),并去掉结尾的空白/点(Windows 不允许)。
 */
function sanitizeFileNamePart(part) {
  // 逐字符替换,不用 \u0000-\u001f 正则(控制字符转义触发 noControlCharactersInRegex)
  const cleaned = String(part || '')
    .split('')
    .map(ch => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/g, '')
  return cleaned || 'pattern'
}

export default function ExportPanel({
  canvasData,
  gridSize,
  gridWidth,
  gridHeight,
  designName,
  paletteId = 'perler',
  onClose,
  // 规格 05 §3:只有用户主动开启「导出后记账」才扣减库存;默认关闭
  deductInventory = false,
  onToggleDeductInventory,
  onExportComplete,
  // 高级导出守卫:游客只开放屏幕画质;熨烫效果整体需登录。
  // authEnabled=false(站点未配置账号系统)时不做限制,避免出现无法注册的死胡同。
  isAuthenticated = false,
  authEnabled = false,
  onRequireAuth,
}) {
  const { t } = useTranslation()
  const effectiveName = designName || t('export.defaultName')
  // Passing onClose signals this instance is the mobile modal entry point —
  // it should open already expanded instead of requiring a second click.
  const isModal = !!onClose
  const [showExport, setShowExport] = useState(isModal)
  const [exportProgress, setExportProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [exportInfo, setExportInfo] = useState('') // 导出后显示实际分辨率(验证超采样生效)
  // 超采样降级:实际倍率低于请求倍率时置为 { actual, requested }。
  // 规格 09 §4.3 要求「用户选择高质量但实际降级时,界面必须报告真实结果」。
  const [scaleInfo, setScaleInfo] = useState(null)
  const [beadStyle, setBeadStyle] = useState('professional')
  // 导出质量预设:screen 走现有 3× 超采样(默认),high/print 走 DPI 路径。
  // 只影响 PNG 专业图纸;SVG 是矢量,不需要倍率。
  const [quality, setQuality] = useState('screen')
  // 游客(且站点启用账号系统)被限制在屏幕画质;高分辨率/打印与熨烫效果引导登录
  const needsAuth = authEnabled && !isAuthenticated
  const effectiveQuality = needsAuth ? 'screen' : quality
  const [authPrompt, setAuthPrompt] = useState(null) // 'quality' | 'ironing' | null
  // 登录态切换(如退出登录)时把已选的高画质收回,避免状态绕过守卫
  useEffect(() => {
    if (needsAuth && quality !== 'screen') setQuality('screen')
  }, [needsAuth, quality])
  const palette = getPalette(paletteId)
  const panelRef = useRef(null)

  // Desktop sidebar instance: when expanding, scroll the panel fully into
  // view within the scrolling .left-sidebar ancestor. Skip for the mobile
  // modal, which already renders full-height and has its own overlay scroll.
  useEffect(() => {
    if (!showExport || isModal || !panelRef.current) return
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      // 只滚动 .left-sidebar 本身:scrollIntoView 会级联滚动「所有」可滚动祖先,
      // 包括 overflow:hidden 的 .main-content/.app 等。平板横屏可视视口被浏览器
      // UI 压缩时这些祖先存在溢出,级联会把右栏(画布 + 色卡)一起抬高无法还原。
      const scroller = panel.closest('.left-sidebar')
      if (!scroller) return
      const panelRect = panel.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      const targetTop = panelRect.bottom - scrollerRect.top - scroller.clientHeight
      if (targetTop > scroller.scrollTop) {
        scroller.scrollTo({ top: targetTop, behavior: 'smooth' })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [showExport, isModal])

  // 导出任务取消:组件卸载时中止进行中的分帧导出
  // (此前 rAF 分帧无取消机制,模态关闭后导出继续后台跑完整个网格)
  const exportAbortRef = useRef(null)
  useEffect(() => {
    return () => exportAbortRef.current?.abort()
  }, [])

  // 浮层可访问性(规格 08 §5):role/aria-modal/Escape/焦点归还。
  // 移动端入口是模态,桌面端是侧栏抽屉 —— 只有模态才承担 dialog 语义。
  // 导出进行中也允许关闭:Escape / 点遮罩 / 点关闭按钮三条路径必须一致,
  // 单独屏蔽 Escape 会让键盘用户被困在一个「点了没反应」的面板里。
  // 中止由卸载 cleanup 负责(exportAbortRef.abort),不会留下后台跑完的任务。
  const { ref: modalRef, dialogProps: modalDialogProps } = useDialogA11y({
    open: isModal,
    onClose,
    label: t('export.title'),
  })

  // Actual dimensions (support rectangular grids)
  const actualWidth = gridWidth || gridSize
  const actualHeight = gridHeight || gridSize

  const handleExportImage = async () => {
    if (!canvasData || isExporting) return
    setIsExporting(true)
    setExportError(null)
    setScaleInfo(null) // 每次导出重置:上一次的降级提示不能留在这一次
    try {
      // PatternDocument → RasterRenderer:完整版式图纸(表头/图例/色号面板/双标尺),
      // 分帧渲染 + 可取消;beadStyle 决定专业(方块+色号)或拟真(立体珠子)画法
      const doc = createPatternDocument({
        canvasData,
        gridSize,
        gridWidth,
        gridHeight,
        paletteId,
        designName: effectiveName,
        beadStyle,
        // 品牌色卡:hex 解析为品牌色号,专业图纸色号标注/图例与图库导出同语义
        palette,
      })
      const abortCtrl = new AbortController()
      exportAbortRef.current = abortCtrl
      try {
        const blob = await renderPatternDocumentToPNG(doc, {
          // 质量预设 → DPI。screen 传 300 走固定 3×(现状不变);
          // high/print 换算成更高倍率(432→6×、576→8×)。
          dpi: QUALITY_PRESETS[effectiveQuality]?.dpi ?? 300,
          onProgress: p => setExportProgress(Math.round(p * 100)),
          // 与图库路径一致:回传实际导出分辨率,UI 显示确认超采样生效
          onResolution: (w, h) => setExportInfo(`${w}×${h}`),
          // 面积预算降级时把实际倍率带回来(规格 09 §4.3:必须报告真实结果)
          onScale: (actual, requested) => setScaleInfo(actual < requested ? { actual, requested } : null),
          signal: abortCtrl.signal,
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = `bead-pattern-${actualWidth}x${actualHeight}.png`
        link.href = url
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        markExportOk()
      } catch (err) {
        if (err?.name === 'AbortError') return // 组件卸载取消,非错误
        throw err
      } finally {
        exportAbortRef.current = null
      }
    } catch (err) {
      if (err?.name === 'AbortError') return // 组件卸载取消,非错误
      console.error('Export failed:', err)
      setExportError(t('export.exportFailed'))
    } finally {
      exportAbortRef.current = null
      setIsExporting(false)
    }
  }

  const handleExportText = () => {
    // 生成带颜色编号的文本图纸
    const today = new Date().toISOString().split('T')[0]
    // 色号解析与 PNG/SVG 图例共用同一解析器:精确 hex 命中 → CIEDE2000 就近,
    // 否则不在色卡里的 hex 会输出 '--'/'??',而图例里却有对应品牌色号
    const codeResolver = createBrandColorResolver(palette.colors)

    let text = `拼豆图纸\n`
    text += `${actualWidth} x ${actualHeight} 格子\n`
    text += `日期：${today}\n`
    text += `${'═'.repeat(Math.max(actualWidth, actualHeight) * 3 + 10)}\n\n`

    // 颜色对照表(按使用频率排序)。与图例同源:按品牌色号归并,
    // 两个不同 hex 落到同一色号时合并成一行,颜色数与导出图例一致;
    // 同时列出该色号对应的品牌色值,方便对着实物豆子核对
    const sortedColors = calculateColorStats(canvasData, actualWidth, actualHeight, palette)
    text += `【颜色对照表】\n`
    sortedColors.forEach(({ id, hex, count }) => {
      text += `  [${id}] ${hex} - ${count}颗\n`
    })
    text += '\n'

    // 带编号的图纸
    text += `【图纸】每格一个数字，00表示空\n`
    text += `${'─'.repeat(Math.max(actualWidth, actualHeight) * 3 + 3)}\n`

    // 列编号
    text += '   '
    for (let x = 0; x < actualWidth; x++) {
      text += String.fromCharCode(65 + (x % 26)) // A, B, C... 循环
    }
    text += '\n'

    for (let y = 0; y < actualHeight; y++) {
      text += `${String(y + 1).padStart(3, ' ')} `
      for (let x = 0; x < actualWidth; x++) {
        const color = canvasData[y]?.[x]
        if (color) {
          text += codeResolver.codeFor(color) || '??'
        } else {
          text += '  '
        }
        text += ' '
      }
      text += '\n'
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.download = `bead-pattern-${actualWidth}x${actualHeight}.txt`
    link.href = URL.createObjectURL(blob)
    link.click()
    markExportOk()
  }

  const handleExportSVG = () => {
    if (!canvasData) return
    // PatternDocument → VectorRenderer:完整版式矢量图纸,与 PNG 同一版式族
    const doc = createPatternDocument({
      canvasData,
      gridSize,
      gridWidth,
      gridHeight,
      paletteId,
      designName: effectiveName,
      beadStyle,
      // 品牌色卡:hex 解析为品牌色号,专业图纸色号标注/图例与 PNG 同语义
      palette,
    })
    const svgString = renderPatternDocumentToSVG(doc)
    const blob = svgStringToBlob(svgString)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `bead-pattern-${actualWidth}x${actualHeight}.svg`
    link.href = url
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    markExportOk()
  }

  // ── 导出工程文件(.pindou.json)────────────────────────────
  // 与 PNG/SVG 不同:这是可无损重新导入继续编辑的工程文件,不渲染。
  // 走 canvasToLegacyWork → legacyWorkToProject 复用既有尺寸推导,
  // 保证导出的宽高与画布实际数据一致(与 M3 的保存路径同源)。
  const handleExportProjectFile = () => {
    if (!canvasData) return
    const work = canvasToLegacyWork({
      canvasData,
      name: effectiveName,
      paletteId,
      id: null,
    })
    if (!work) {
      setExportError(t('export.exportFailed'))
      return
    }
    const project = legacyWorkToProject(work, { id: undefined })
    if (!project) {
      setExportError(t('export.exportFailed'))
      return
    }
    project.name = effectiveName
    project.source = { ...project.source, kind: 'native-file' }
    const text = projectToFileText(project)
    if (!text) {
      setExportError(t('export.exportFailed'))
      return
    }
    downloadProjectFile(text, projectFileName(project, effectiveName))
    setExportInfo(t('export.projectFileSaved'))
    markExportOk()
  }

  // ── 高级熨烫效果导出 ─────────────────────────────────────
  // 独立于图纸导出链路:只产出效果图,不经过 markExportOk/notifyExported,
  // 因此永远不会触发 onExportComplete(库存记账只针对图纸导出)。
  const handleExportIroningEffect = async presetId => {
    if (!canvasData || isExporting) return
    setIsExporting(true)
    setExportProgress(0)
    setExportError(null)
    setScaleInfo(null)
    setExportInfo('')
    try {
      const doc = createPatternDocument({
        // 旧作品可能保留品牌色号('P18'):渲染器只认 hex,先按当前色卡归一
        canvasData: normalizeCellsToHex(canvasData, palette),
        gridSize,
        gridWidth,
        gridHeight,
        paletteId,
        designName: effectiveName,
        palette,
      })
      const abortCtrl = new AbortController()
      exportAbortRef.current = abortCtrl
      const { blob } = await renderIroningEffect(doc, {
        presetId,
        mode: 'export',
        quality: effectiveQuality,
        signal: abortCtrl.signal,
        onProgress: p => setExportProgress(Math.round(p * 100)),
        onResolution: (w, h) => setExportInfo(`${w}×${h}`),
        onScale: (actual, requested) => setScaleInfo(actual < requested ? { actual, requested } : null),
      })
      const materialLabel = t(getIroningEffectPreset(presetId).labelKey)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `${sanitizeFileNamePart(effectiveName)}-${t('export.ironing.title')}-${materialLabel}-${actualWidth}x${actualHeight}.png`
      link.href = url
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      if (err?.name === 'AbortError') return // 组件卸载取消,非错误
      console.error('Ironing effect export failed:', err)
      setExportError(t('export.exportFailed'))
    } finally {
      exportAbortRef.current = null
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  // ── 导出确认流程:空画布拦截 + 有内容时确认 ──────────────
  const [confirmExport, setConfirmExport] = useState(null) // { type: 'empty' } | { type: 'confirm', label, handler }

  // 确认框是独立浮层(外层遮罩的兄弟节点),单独入栈 —— 两层同时打开时
  // Escape 只关确认框,不会连导出面板一起关掉。
  const { ref: confirmRef, dialogProps: confirmDialogProps } = useDialogA11y({
    open: !!confirmExport,
    onClose: () => setConfirmExport(null),
    label: confirmExport?.type === 'empty' ? t('export.emptyTitle') : t('export.confirmTitle'),
  })
  // 导出成功后回调父组件(用于库存扣减);只有导出真正完成才触发
  // 导出成功标记:各 handler 内部 catch 错误后正常返回,不能靠 promise 是否 resolve 判断
  const exportOkRef = useRef(false)
  const markExportOk = () => {
    exportOkRef.current = true
  }
  const notifyExported = () => {
    if (!exportOkRef.current) return
    exportOkRef.current = false
    onExportComplete?.()
  }
  const hasPaintedCells = useMemo(
    () => canvasData?.some(row => row.some(cell => cell)) || false,
    [canvasData]
  )

  // 导出流程按「有没有副作用」分级,减少无意义的确认步骤:
  //   空画布 → 拦截提示;开启库存扣减 → 确认框(要动数据);
  //   其余(纯下载文件)→ 直接导出,不弹确认。
  const runExport = handler => {
    exportOkRef.current = false
    Promise.resolve(handler()).then(() => notifyExported())
  }
  const requestExport = (label, desc, styleName, handler) => {
    if (!canvasData) return
    if (!hasPaintedCells) {
      setConfirmExport({ type: 'empty' })
      return
    }
    if (deductInventory) {
      setConfirmExport({ type: 'confirm', label, desc, styleName, handler })
      return
    }
    runExport(handler)
  }

  // 专业图纸当前风格名称(用于确认框展示)
  const currentStyleName =
    beadStyle === 'professional' ? t('gallery.exportProfessional') : t('gallery.exportRealistic')

  // 高级导出守卫:先解释解锁内容与登录收益,再分流到注册/登录;「稍后再说」不阻断游客创作
  const authPromptDialog = (
    <AuthPromptDialog
      open={!!authPrompt}
      reason={authPrompt || 'ironing'}
      onClose={() => setAuthPrompt(null)}
      onGoAuth={mode => {
        const reason = authPrompt
        setAuthPrompt(null)
        onRequireAuth?.(reason, mode)
      }}
    />
  )

  const panel = (
    <div className="export-panel" ref={panelRef}>
      <button className="export-toggle" onClick={() => setShowExport(!showExport)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7,10 12,15 17,10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {t('export.title')}
        {!isModal && <span className={`arrow ${showExport ? 'up' : ''}`}>▼</span>}
        {isModal && (
          <span
            className="export-modal-close"
            role="button"
            aria-label={t('common.close')}
            onClick={e => {
              e.stopPropagation()
              onClose()
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
        )}
      </button>

      {showExport && (
        <div className="export-content">
          {/* ① 图纸风格:从「拼好的珠子」到导出物之间唯一要做的决策。
              两张可点卡片替代下拉框,选中态即所见;说明只保留当前选中那条 */}
          <div className="export-section">
            <div className="style-cards" role="radiogroup" aria-label={t('export.styleLabel')}>
              <button
                type="button"
                role="radio"
                aria-checked={beadStyle === 'professional'}
                className={`style-card${beadStyle === 'professional' ? ' active' : ''}`}
                onClick={() => setBeadStyle('professional')}
              >
                <span className="style-card-name">{t('gallery.exportProfessional')}</span>
                <span className="style-card-desc">{t('export.professionalHint')}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={beadStyle === 'realistic'}
                className={`style-card${beadStyle === 'realistic' ? ' active' : ''}`}
                onClick={() => setBeadStyle('realistic')}
              >
                <span className="style-card-name">{t('gallery.exportRealistic')}</span>
                <span className="style-card-desc">{t('export.realisticHint')}</span>
              </button>
            </div>
          </div>

          {/* ② 主导出:按钮文案跟随风格,点一下直接出图 */}
          <div className="export-section">
            <button
              onClick={() =>
                requestExport(
                  beadStyle === 'professional' ? t('export.ctaSheet') : t('export.ctaShowcase'),
                  beadStyle === 'professional' ? t('export.professionalDesc') : t('export.realisticDesc'),
                  currentStyleName,
                  handleExportImage
                )
              }
              className="btn btn-primary btn-pattern"
              disabled={isExporting}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {isExporting
                ? `${t('export.exporting')} ${exportProgress}%`
                : beadStyle === 'professional'
                  ? t('export.ctaSheet')
                  : t('export.ctaShowcase')}
            </button>
            {isExporting && (
              <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, margin: '4px 0' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${exportProgress}%`,
                    background: 'var(--secondary-accent)',
                    borderRadius: 2,
                    transition: 'width 0.1s',
                  }}
                />
              </div>
            )}
            {exportError && (
              <div style={{ fontSize: 11, color: 'var(--error)', padding: '4px 2px', lineHeight: 1.4 }}>
                {exportError}
              </div>
            )}
            {exportInfo && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--secondary-accent)',
                  padding: '4px 2px',
                  lineHeight: 1.4,
                }}
              >
                ✓ {t('export.resolution')}: {exportInfo}
                {scaleInfo && (
                  /* 规格 09 §4.3:降级必须报告真实结果,不能只显示分辨率假装达标 */
                  <span style={{ color: 'var(--warning)', marginLeft: 6 }}>
                    ·{' '}
                    {t('export.scaleDegraded', {
                      actual: scaleInfo.actual,
                      requested: scaleInfo.requested,
                    })}
                  </span>
                )}
              </div>
            )}

            {/* 物理尺寸信息:珠径按当前品牌色卡取值 ——
                COCO/Artkal 是 2.6mm,Perler/Hama/MARD 是 5mm。
                此前固定按 2.6mm 算,29×29 的 Perler 图纸显示 75.4mm(实际 145mm)。 */}
            {(() => {
              const beadSizeMm = palette?.beadSize || 5
              const phys = calculatePhysicalSize(actualWidth, actualHeight, beadSizeMm)
              return (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 2px' }}>
                  {t('export.physicalSize', '物理尺寸')} {phys.widthMm}×{phys.heightMm}mm · {beadSizeMm}mm/
                  {t('export.beadUnit', '颗')}
                </div>
              )
            })()}
          </div>

          {/* ③ 其他格式:同一套风格设置的另外三种载体 */}
          <div className="export-section">
            <div className="section-heading">
              <span className="section-title">{t('export.otherFormats')}</span>
            </div>
            <div className="export-buttons">
              <button
                onClick={() =>
                  requestExport(
                    t('export.patternSheetSVG'),
                    t('export.svgDesc'),
                    currentStyleName,
                    handleExportSVG
                  )
                }
                className="btn btn-secondary"
                disabled={isExporting}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="12,2 2,7 12,12 22,7 12,2" />
                  <polyline points="2,17 12,22 22,17" />
                  <polyline points="2,12 12,17 22,12" />
                </svg>
                {t('export.patternSheetSVG')}
              </button>
              <button
                onClick={() => requestExport(t('export.text'), t('export.textDesc'), null, handleExportText)}
                className="btn btn-secondary"
                disabled={isExporting}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                {t('export.text')}
              </button>
              {/* 工程文件:可重新导入继续编辑(与 PNG/SVG 成品导出互补) */}
              <button
                onClick={() =>
                  requestExport(
                    t('export.projectFile'),
                    t('export.projectFileDesc'),
                    null,
                    handleExportProjectFile
                  )
                }
                className="btn btn-secondary"
                disabled={isExporting}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="12" y1="12" x2="12" y2="18" />
                  <polyline points="15,15 12,18 9,15" />
                </svg>
                {t('export.projectFile')}
              </button>
            </div>
          </div>

          {/* ④ 更多选项:低频设置默认折叠,不占首屏;库存扣减开启后导出前会确认 */}
          <details className="export-advanced">
            <summary>{t('export.advancedOptions')}</summary>
            <div className="export-advanced-body">
              {/* 输出质量预设(规格 09 §2):只影响 PNG。预设是「请求值」,
                  实际倍率仍受设备面积预算约束,降级时导出结果区会报告真实倍率 */}
              <div className="export-style-group">
                <label className="style-label" htmlFor="export-quality-select">
                  {t('export.qualityLabel')}
                </label>
                <select
                  id="export-quality-select"
                  value={quality}
                  onChange={e => {
                    const next = e.target.value
                    if (needsAuth && next !== 'screen') {
                      // 不静默改值:打开引导浮层解释原因,选择仍停在屏幕画质
                      setAuthPrompt('quality')
                      return
                    }
                    setQuality(next)
                  }}
                  className="style-select"
                >
                  {QUALITY_ORDER.map(key => (
                    <option key={key} value={key}>
                      {t(QUALITY_PRESETS[key].labelKey)}
                      {needsAuth && key !== 'screen' ? ` · ${t('auth.gate.locked')}` : ''}
                    </option>
                  ))}
                </select>
                {needsAuth && <span className="setting-hint">{t('auth.gate.qualityHint')}</span>}
              </div>

              {/* 规格 05 §3:只有用户主动开启才在导出后扣减库存,默认关闭 */}
              {onToggleDeductInventory && (
                <div className="export-style-group">
                  <label className="export-v2-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(deductInventory)}
                      onChange={e => onToggleDeductInventory(e.target.checked)}
                    />
                    <span>{t('export.deductInventory')}</span>
                  </label>
                  <span className="setting-hint">{t('export.deductInventoryHint')}</span>
                </div>
              )}
            </div>
          </details>

          <div className="export-divider" />

          {/* 高级熨烫效果:成品效果模拟(规格 08 §4)。默认折叠;
              预览与导出共用同一渲染器,只产出效果图、不走库存记账。 */}
          <div className="export-divider" />

          <IroningEffectSection
            canvasData={canvasData}
            gridSize={gridSize}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            paletteId={paletteId}
            designName={effectiveName}
            isExporting={isExporting}
            locked={needsAuth}
            onRequireAuth={() => setAuthPrompt('ironing')}
            onRequestExport={presetId => {
              const materialLabel = t(getIroningEffectPreset(presetId).labelKey)
              requestExport(
                t('export.ironing.exportPng'),
                t('export.ironing.exportDescription'),
                materialLabel,
                () => handleExportIroningEffect(presetId)
              )
            }}
          />
        </div>
      )}

      <style>{`
        .export-panel {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          width: 100%;
        }
        .export-toggle {
          width: 100%;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: var(--text-base);
          font-weight: var(--font-weight-semibold);
          background: none;
          border: none;
          cursor: pointer;
          transition: background 0.2s;
        }
        .export-toggle:hover {
          background: var(--bg-secondary);
        }
        .arrow {
          margin-left: auto;
          font-size: var(--text-xs);
          transition: transform 0.2s;
        }
        .arrow.up {
          transform: rotate(180deg);
        }
        .export-content {
          padding: 0 12px 12px;
        }
        .export-stats {
          display: flex;
          gap: 16px;
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .stat {
          display: flex;
          flex-direction: column;
        }
        .stat-value {
          font-size: var(--text-xl);
          font-weight: var(--font-weight-semibold);
        }
        .stat-label {
          font-size: var(--text-xs);
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .color-legend {
          margin-bottom: 12px;
        }
        .color-legend h4 {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .legend-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          background: var(--bg-secondary);
          border-radius: 4px;
        }
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          border: 1px solid var(--border-color);
        }
        .legend-count {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-weight: var(--font-weight-semibold);
        }
        .export-buttons {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .export-buttons .btn {
          justify-content: flex-start;
          padding: 10px 12px;
          font-size: var(--text-sm);
        }
        .export-divider {
          height: 1px;
          background: var(--border-color);
          margin: 8px 0;
        }
        .btn-pattern {
          background: linear-gradient(135deg, var(--accent) 0%, #c25a34 100%);
          color: white;
          border: none;
          font-weight: var(--font-weight-semibold);
        }
        .btn-pattern:hover {
          background: linear-gradient(135deg, #c25a34 0%, #a84a29 100%);
        }
        .export-style-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px 0 2px;
        }
        .style-label {
          font-size: var(--text-xs);
          font-weight: var(--font-weight-semibold);
          color: var(--text-secondary);
        }
        .style-select {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          color: var(--text-primary);
        }
        .setting-hint {
          font-size: var(--text-xs);
          color: var(--text-muted);
          line-height: 1.3;
        }
        /* 风格选择卡片:导出物之间唯一的用户决策,选中态用浅橙填充表达 */
        .style-cards {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .style-card {
          display: flex;
          flex-direction: column;
          gap: 2px;
          width: 100%;
          padding: 8px 10px;
          text-align: left;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          font-family: inherit;
        }
        .style-card:hover {
          border-color: var(--text-muted);
        }
        .style-card.active,
        .style-card.active:hover {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border-color));
          background: var(--accent-soft);
        }
        .style-card-name {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }
        .style-card.active .style-card-name {
          color: var(--accent-hover);
        }
        .style-card-desc {
          font-size: var(--text-xs);
          color: var(--text-muted);
          line-height: 1.4;
        }
        /* 更多选项:低频设置默认折叠,摘要行低存在感 */
        .export-advanced {
          margin-top: 10px;
          border-top: 1px dashed var(--border-color);
          padding-top: 8px;
        }
        .export-advanced summary {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 2px;
          font-size: var(--text-sm);
          color: var(--text-secondary);
          cursor: pointer;
          list-style: none;
          user-select: none;
        }
        .export-advanced summary::-webkit-details-marker {
          display: none;
        }
        .export-advanced summary::before {
          content: '▸';
          font-size: var(--text-xs);
          color: var(--text-muted);
          transition: transform 0.15s;
        }
        .export-advanced[open] summary::before {
          transform: rotate(90deg);
        }
        .export-advanced summary:hover {
          color: var(--text-primary);
        }
        .export-advanced-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 6px 2px 2px;
        }
        .export-modal-close {
          margin-left: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 4px;
          color: var(--text-muted);
          transition: all 0.2s;
        }
        .export-modal-close:hover {
          color: var(--text-primary);
          background: var(--bg-tertiary);
        }
        .export-section {
          padding-top: 10px;
        }
        .section-heading {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-bottom: 8px;
        }
        .section-title {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-bold);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  )

  // ── 导出确认 / 空画布提示 模态框(PC 与移动端共用) ─────────
  const confirmDialog = confirmExport && (
    <div className="modal-overlay export-confirm-overlay" onClick={() => setConfirmExport(null)}>
      <div
        className="export-confirm-dialog"
        ref={confirmRef}
        {...confirmDialogProps}
        onClick={e => e.stopPropagation()}
      >
        {confirmExport.type === 'empty' ? (
          <>
            <div className="export-confirm-icon empty">✕</div>
            <h3>{t('export.emptyTitle')}</h3>
            <p>{t('export.emptyText')}</p>
            <button className="btn btn-primary" onClick={() => setConfirmExport(null)}>
              {t('export.gotIt')}
            </button>
          </>
        ) : (
          <>
            <div className="export-confirm-icon">⤓</div>
            <h3>{t('export.confirmTitle')}</h3>
            <p>{t('export.confirmText')}</p>
            <div className="export-settings-summary">
              <div className="export-setting-row">
                <span className="export-setting-key">{t('export.formatLabel')}</span>
                <span className="export-setting-value">{confirmExport.label}</span>
              </div>
              <div className="export-setting-row">
                <span className="export-setting-key">{t('export.descLabel')}</span>
                <span className="export-setting-value">{confirmExport.desc}</span>
              </div>
              {confirmExport.styleName && (
                <div className="export-setting-row">
                  <span className="export-setting-key">{t('export.styleLabel')}</span>
                  <span className="export-setting-value">{confirmExport.styleName}</span>
                </div>
              )}
            </div>
            <div className="export-confirm-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setConfirmExport(null)
                  exportOkRef.current = false
                  Promise.resolve(confirmExport.handler()).then(() => notifyExported())
                }}
              >
                {t('export.confirmBtn')}
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmExport(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </>
        )}
        <style>{`
          .export-confirm-overlay { z-index: 1200; }
          .export-confirm-dialog {
            background: var(--bg-primary);
            border-radius: var(--radius-card);
            padding: 28px 24px;
            width: min(380px, 92vw);
            text-align: center;
            box-shadow: 0 20px 60px rgba(43, 36, 32, 0.2);
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
          }
          .export-confirm-icon {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: var(--accent-soft);
            color: var(--accent);
            font-size: 26px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .export-confirm-icon.empty {
            background: var(--warning-bg);
            color: var(--warning);
          }
          .export-confirm-dialog h3 {
            margin: 0;
            font-size: var(--text-xl);
          }
          .export-confirm-dialog p {
            margin: 0;
            color: var(--text-secondary);
            font-size: var(--text-md);
            line-height: 1.6;
            word-break: break-word;
          }
          .export-confirm-dialog .btn { margin-top: 4px; }
          .export-confirm-actions {
            display: flex;
            gap: 10px;
            justify-content: center;
          }
          .export-settings-summary {
            width: 100%;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 10px 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            text-align: left;
          }
          .export-setting-row {
            display: flex;
            gap: 10px;
            font-size: var(--text-sm);
            line-height: 1.5;
          }
          .export-setting-key {
            color: var(--text-muted);
            flex-shrink: 0;
            min-width: 40px;
          }
          .export-setting-value {
            color: var(--text-primary);
            font-weight: 500;
          }
        `}</style>
      </div>
    </div>
  )

  if (!isModal)
    return (
      <>
        {panel}
        {confirmDialog}
        {authPromptDialog}
      </>
    )

  // portal 到 body:导出浮层含输入项,移出 .app 挂载到 body 下,避免 iOS 上
  // 滚动容器/祖先 stacking context 影响 fixed 定位(键盘弹出错位)
  return createPortal(
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="export-modal-content"
          ref={modalRef}
          {...modalDialogProps}
          onClick={e => e.stopPropagation()}
        >
          {panel}
        </div>
      </div>
      {/* 确认框必须是外层浮层的兄弟节点:此前嵌在 .modal-overlay 内部,点击确认框
          的遮罩(关闭确认框)会冒泡到外层 onClick 把整个导出面板一起关掉,
          用户取消导出后要重新打开面板再选一遍参数。 */}
      {confirmDialog}
      {authPromptDialog}
      <style>{`
        .export-modal-content {
          width: min(420px, 92vw);
          /* 上限随视觉视口收缩(--visible-vh):iOS 键盘弹起时按布局视口 80vh 会裁底 */
          max-height: calc(var(--visible-vh, 100vh) - 32px);
          overflow-y: auto;
        }
      `}</style>
    </>,
    document.body
  )
}
