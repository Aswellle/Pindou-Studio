import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../Toast'
import './MobileToolbar.css'

const TOOL_ICONS = {
  pencil: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  eraser: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 20H7L3 16l9-9 8 8-4 4" />
      <path d="M6.5 12.5l4 4" />
    </svg>
  ),
  fill: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 0 0 7.78 7.78L19 11z" />
      <path d="M20 23a2 2 0 0 0 2-2c0-1.5-2-2.5-2-4s2-2.5 2-4" />
      <path d="M3 21l3-3" />
    </svg>
  ),
  hand: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 11V6a2 2 0 0 0-4 0v0" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  ),
  // 取色器(吸管):与桌面端 lucide Pipette 同形
  eyedropper: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" />
      <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" />
      <path d="m2 22 .414-.414" />
    </svg>
  ),
  // 矩形选区:虚线方框
  select: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" /><path d="M9 21h1" />
      <path d="M14 3h1" /><path d="M14 21h1" />
      <path d="M3 9v1" /><path d="M21 9v1" />
      <path d="M3 14v1" /><path d="M21 14v1" />
    </svg>
  ),
}

const UndoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
)

const RedoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
)

const ClearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

const GridSizeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

// 魔法魔杖 + 星光(lucide wand-2):表征「图片 → 拼豆」的魔力转化,替代难以辨认的相机
const WandIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/>
    <path d="m14 7 3 3"/>
    <path d="M5 6v4"/>
    <path d="M19 14v4"/>
    <path d="M10 2v2"/>
    <path d="M7 8H3"/>
    <path d="M21 16h-4"/>
    <path d="M11 3H9"/>
  </svg>
)

const ExportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

// 导入项目文件(文件 + 向内箭头):与图片转拼豆并列的第二种导入入口
const ImportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="12" y1="12" x2="12" y2="18" />
    <polyline points="9,15 12,18 15,15" />
  </svg>
)

// 颜色替换(两个重叠色块 + 交换箭头):与桌面端 lucide Replace 同义
const ReplaceIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4a1 1 0 0 1 1-1" />
    <path d="M15 10a1 1 0 0 1-1-1" />
    <path d="M21 4a1 1 0 0 0-1-1" />
    <path d="M21 9a1 1 0 0 1-1 1" />
    <path d="m3 7 3 3 3-3" />
    <path d="M6 10V5a2 2 0 0 1 2-2h2" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
)

// ── 引导 toast 的用户行为记录(localStorage)──────────────────────
// 用途:判断「该用户需要图片转拼豆」或「该用户没发现该功能」。
const BEHAVIOR_KEY = 'bead-studio-behavior'
const GUIDE_DURATION = 5000       // toast 停留时长(ms)
const ENGAGED_TRIGGER_MS = 10000  // 首次访问在画布活跃多久判定「需要该功能」
const RETURNING_SESSION = 2       // 回访次数 ≥ 2 且从未点开过 → 「没发现该功能」

function getBehavior() {
  try { return JSON.parse(localStorage.getItem(BEHAVIOR_KEY)) || {} } catch { return {} }
}
function saveBehavior(b) {
  localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(b))
}

export default function MobileToolbar({
  tool,
  onToolChange,
  gridSize,
  gridWidth,
  gridHeight,
  onGridSizeChange,
  onGridDimensionsChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  onExport,
  onQuantize,
  onImport,
  // M5:选区命令与颜色替换(移动端把命令收进一条紧凑操作条)
  selection,
  onSelectionCommand,
  onClearSelection,
  onOpenReplace,
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [guideVisible, setGuideVisible] = useState(false)
  // 引导气泡定位(JS 测量):fixed 定位 + 左缘/top/箭头偏移,防止窄屏溢出右侧视口
  const [guideStyle, setGuideStyle] = useState(null)
  const guideTimerRef = useRef(null)
  const quantizeBtnRef = useRef(null)
  const guideRef = useRef(null)

  const hideGuide = useCallback(() => {
    setGuideVisible(false)
    if (guideTimerRef.current) clearTimeout(guideTimerRef.current)
  }, [])

  const showGuide = useCallback(() => {
    setGuideVisible(true)
    saveBehavior({ ...getBehavior(), guideShown: true }) // 只引导一次,不反复打扰
    guideTimerRef.current = setTimeout(hideGuide, GUIDE_DURATION)
  }, [hideGuide])

  // 气泡显示后按按钮实际位置定位:气泡中心对准按钮中心,左/上缘 clamp 在视口内,
  // 箭头偏移随气泡移动同步(保证箭头始终指向按钮)
  useLayoutEffect(() => {
    if (!guideVisible) return
    const btn = quantizeBtnRef.current
    const bubble = guideRef.current
    if (!btn || !bubble) return
    const r = btn.getBoundingClientRect()
    const bw = bubble.offsetWidth
    const bh = bubble.offsetHeight
    const left = Math.max(12, Math.min(r.left + r.width / 2 - bw / 2, window.innerWidth - bw - 12))
    const top = Math.max(8, r.top - bh - 12)
    setGuideStyle({ left, top, arrowLeft: r.left + r.width / 2 - left })
  }, [guideVisible])

  // 行为记录 + 引导触发分析:
  // · 没发现该功能:回访 ≥ 2 次却从未点开过图片转拼豆 → 停留片刻后引导
  // · 需要该功能:首次访问就在画布持续活跃(正在创作的人最可能需要转图)
  useEffect(() => {
    const b = getBehavior()
    const sessions = (b.sessions || 0) + 1
    saveBehavior({ ...b, sessions })
    if (b.guideShown || b.quantizerVisited) return
    if (sessions >= RETURNING_SESSION) {
      const t0 = setTimeout(showGuide, 700)
      return () => clearTimeout(t0)
    }
    const start = Date.now()
    const interval = setInterval(() => {
      if (Date.now() - start >= ENGAGED_TRIGGER_MS) {
        clearInterval(interval)
        showGuide()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [showGuide])

  // toast 存续期间,用户进行任何其他操作 → 立刻消失(不打断、不残留)
  useEffect(() => {
    if (!guideVisible) return
    const dismiss = () => hideGuide()
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('touchstart', dismiss)
    document.addEventListener('wheel', dismiss, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('touchstart', dismiss)
      document.removeEventListener('wheel', dismiss)
    }
  }, [guideVisible, hideGuide])

  const handleQuantize = () => {
    saveBehavior({ ...getBehavior(), quantizerVisited: true })
    hideGuide()
    onQuantize()
  }

  const tools = [
    { id: 'pencil', label: t('canvas.tool.pencil') },
    { id: 'eraser', label: t('canvas.tool.eraser') },
    { id: 'fill', label: t('canvas.tool.fill') },
    { id: 'hand', label: t('canvas.tool.hand') },
    { id: 'eyedropper', label: t('canvas.tool.eyedropper') },
    { id: 'select', label: t('canvas.tool.select') },
  ]

  const currentWidth = gridWidth || gridSize
  const currentHeight = gridHeight || gridSize
  const isRectangular = gridWidth !== null && gridHeight !== null

  const handlePresetChange = (e) => {
    const value = e.target.value
    if (value === 'custom') {
      const input = prompt(t('tools.customSizePrompt'), `${currentWidth}x${currentHeight}`)
      if (!input) return
      const parts = input.toLowerCase().split('x').map(s => parseInt(s.trim(), 10))
      if (isNaN(parts[0]) || parts[0] < 9 || parts[0] > 200) {
        toast(t('tools.widthRange'), 'error')
        return
      }
      if (parts.length === 2) {
        if (isNaN(parts[1]) || parts[1] < 9 || parts[1] > 200) {
          toast(t('tools.heightRange'), 'error')
          return
        }
        onGridDimensionsChange(parts[0], parts[1])
      } else {
        onGridDimensionsChange(parts[0], parts[0])
      }
      return
    }
    const parts = value.split('x').map(Number)
    if (parts.length === 2) {
      onGridDimensionsChange(parts[0], parts[1])
    } else {
      onGridSizeChange(parts[0])
    }
  }

  const getCurrentPreset = () => (isRectangular ? `${currentWidth}x${currentHeight}` : String(currentWidth))

  return (
    <div className="mobile-toolbar">
      <div className="toolbar-row toolbar-tools">
        {tools.map((t_item) => (
          <button
            key={t_item.id}
            className={`tool-btn ${tool === t_item.id ? 'active' : ''}`}
            onClick={() => onToolChange(t_item.id)}
          >
            <span className="tool-icon">{TOOL_ICONS[t_item.id]}</span>
            <span className="tool-label">{t_item.label}</span>
          </button>
        ))}
      </div>

      {/* 选区操作条:仅选区工具激活时出现,避免常驻占用底部空间 */}
      {tool === 'select' && (
        <div className="toolbar-row toolbar-selection" data-testid="mobile-selection-bar">
          {selection ? (
            <>
              <span className="selection-size-badge">
                {t('tools.selectionSize', { w: selection.w, h: selection.h })}
              </span>
              <button className="selection-btn" onClick={() => onSelectionCommand?.('fill')}>{t('tools.fillSelection')}</button>
              <button className="selection-btn" onClick={() => onSelectionCommand?.('erase')}>{t('tools.clearSelection')}</button>
              <button className="selection-btn icon" onClick={() => onSelectionCommand?.('mirrorH')} title={t('tools.mirrorH')} aria-label={t('tools.mirrorH')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" /><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" /><path d="M12 2v20" />
                </svg>
              </button>
              <button className="selection-btn icon" onClick={() => onSelectionCommand?.('mirrorV')} title={t('tools.mirrorV')} aria-label={t('tools.mirrorV')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" /><path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M2 12h20" />
                </svg>
              </button>
              <button className="selection-btn icon" onClick={() => onSelectionCommand?.('rotateCw')} title={t('tools.rotateCw')} aria-label={t('tools.rotateCw')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21,3 21,9 15,9" />
                </svg>
              </button>
              <button className="selection-btn icon" onClick={() => onSelectionCommand?.('rotateCcw')} title={t('tools.rotateCcw')} aria-label={t('tools.rotateCcw')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3,3 3,9 9,9" />
                </svg>
              </button>
              <button className="selection-btn" onClick={onClearSelection}>{t('tools.clearSelectionBtn')}</button>
              {/* 拖拽移动没有按钮,只能靠提示告知(规格 04 §2 要求移动有明确入口) */}
              <span className="selection-move-hint">{t('tools.selectionMoveHint')}</span>
            </>
          ) : (
            <span className="selection-size-badge muted">{t('tools.selectionEmpty')}</span>
          )}
        </div>
      )}

      <div className="toolbar-row toolbar-actions">
        {/* 撤销/重做:边框 + 功能名文字,便于一眼分辨 */}
        <button
          className="action-btn text-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title={t('tools.undoAction')}
        >
          <UndoIcon />
          <span className="text-btn-label">{t('tools.undo')}</span>
        </button>
        <button
          className="action-btn text-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title={t('tools.redoAction')}
        >
          <RedoIcon />
          <span className="text-btn-label">{t('tools.redo')}</span>
        </button>
        <button
          className="action-btn"
          onClick={onClear}
          title={t('tools.clearCanvas')}
          aria-label={t('tools.clear')}
        >
          <ClearIcon />
        </button>

        <label className="action-btn grid-size-btn" title={t('tools.canvasSize')} aria-label={t('tools.canvasSize')}>
          <GridSizeIcon />
          <select
            className="grid-size-select"
            value={getCurrentPreset()}
            onChange={handlePresetChange}
            aria-label={t('tools.canvasSize')}
          >
            <optgroup label={`—— ${t('tools.presets.squareGroup')} ——`}>
              <option value="29">29×29 {t('tools.presets.smallIcon')}</option>
              <option value="57">57×57 {t('tools.presets.standard')}</option>
              <option value="87">87×87 {t('tools.presets.large')}</option>
              <option value="114">114×114 {t('tools.presets.extraLarge')}</option>
              <option value="140">140×140 {t('tools.presets.huge')}</option>
              <option value="170">170×170 {t('tools.presets.superHuge')}</option>
            </optgroup>
            <optgroup label={`—— ${t('tools.presets.rectangleGroup')} ——`}>
              <option value="57x29">57×29 {t('tools.presets.landscape')}</option>
              <option value="87x58">87×58 {t('tools.presets.landscape')}</option>
              <option value="114x87">114×87 {t('tools.presets.landscape')}</option>
              <option value="140x105">140×105 {t('tools.presets.landscape')}</option>
              <option value="170x115">170×115 {t('tools.presets.landscape')}</option>
              <option value="29x57">29×57 {t('tools.presets.portrait')}</option>
              <option value="58x87">58×87 {t('tools.presets.portrait')}</option>
              <option value="87x114">87×114 {t('tools.presets.portrait')}</option>
              <option value="105x140">105×140 {t('tools.presets.portrait')}</option>
              <option value="115x170">115×170 {t('tools.presets.portrait')}</option>
            </optgroup>
            <optgroup label={`—— ${t('tools.presets.customGroup')} ——`}>
              <option value="custom">{t('tools.presets.custom')}</option>
            </optgroup>
          </select>
        </label>

        {/* 图片转拼豆:魔法按钮(与导出按钮同构同尺寸,仅填充不同) + 首次发现引导气泡 */}
        <button
          ref={quantizeBtnRef}
          className="action-btn magical"
          onClick={handleQuantize}
          aria-label={t('tools.imageToBead')}
          title={t('tools.imageToBead')}
        >
          <WandIcon />
          <span className="magic-sparkle" aria-hidden="true">✦</span>
        </button>

        {onImport && (
          <button
            className="action-btn"
            onClick={onImport}
            aria-label={t('tools.importFile')}
            title={t('tools.importFile')}
          >
            <ImportIcon />
          </button>
        )}

        {onOpenReplace && (
          <button
            className="action-btn"
            onClick={onOpenReplace}
            aria-label={t('tools.replaceColor')}
            title={t('tools.replaceColor')}
          >
            <ReplaceIcon />
          </button>
        )}

        <button className="action-btn primary" onClick={onExport} aria-label={t('export.title')}>
          <ExportIcon />
        </button>

        {guideVisible && (
          <div
            className="quantize-guide"
            role="tooltip"
            onClick={handleQuantize}
            ref={guideRef}
            style={guideStyle || undefined}
          >
            <span className="guide-text">{t('tools.quantizeGuide')}</span>
            <span
              className="guide-arrow"
              style={guideStyle ? { left: guideStyle.arrowLeft } : undefined}
              aria-hidden="true"
            >
              <i className="tri tri-1" />
              <i className="tri tri-2" />
              <i className="tri tri-3" />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
