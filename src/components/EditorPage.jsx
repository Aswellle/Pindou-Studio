import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Pencil,
  Eraser,
  PaintBucket,
  Pipette,
  MousePointerClick,
  Lasso,
  SquareDashed,
  Sparkles,
  Undo2,
  Redo2,
  Save,
  ImageDown,
  Palette,
  Maximize2,
  RotateCcw,
  Check,
  ImagePlus,
  X,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import BackButton from './BackButton'
import Canvas from './Canvas'
import EditorCleanupPanel from './EditorCleanupPanel'
import PickDPad from './PickDPad'
import SelectionContextMenu from './SelectionContextMenu'
import { getPalette } from '../data/palettes'
import { calculateColorStats } from '../services/export/PatternDocument'
import { collectColorStats } from '../utils/selectionUtils'
import { selectionBounds, selectionContains } from '../utils/lassoSelection'
import {
  cropCanvas,
  cropCanvasToContent,
  reduceCanvasColors,
  removeCanvasColor,
} from '../utils/editorCleanup'
import './editor.css'

/**
 * 图纸编辑器(/editor)—— 图片转拼豆结果的专用编辑界面。
 *
 * 与画布页的分工:画布页是「从零创作」的全功能工具;编辑器只服务
 * 「量化结果进来后修图」这一件事 —— 画格区复用同一个 Canvas 组件与
 * App 画布状态(useHistory/selection/保存/导出),底部操作台则是为
 * 修图定制的新 UI:图纸用色列表(点选为画笔色,实时重算颗数)、
 * 精简工具行、上下文选区条。不复用 Tools.jsx / MobileToolbar。
 *
 * 操作台的三条布局约束(实机测试后定稿):
 *   1. 高度恒定:选区命令**替换**工具行,而不是在工具行下方追加 ——
 *      否则选区一出现,画布就被挤矮、内容在用户眼皮底下跳;
 *   2. 次级面板(色卡/整理/完成)一律走浮层,不参与文档流;
 *   3. 移动端工具栏隐藏了画布 HUD,这里补一对「适应/重置」悬浮按钮。
 */

const EDITOR_TOOLS = [
  { id: 'pencil', icon: Pencil },
  { id: 'eraser', icon: Eraser },
  { id: 'fill', icon: PaintBucket },
  { id: 'eyedropper', icon: Pipette },
  { id: 'pick', icon: MousePointerClick },
  { id: 'lasso', icon: Lasso },
  { id: 'select', icon: SquareDashed },
]

/** 图纸用色 chip:色块 + 色号 + 颗数,点击设为画笔色 */
function ColorChip({ hex, label, count, active, onClick }) {
  return (
    <button
      type="button"
      className={`editor-color-chip${active ? ' active' : ''}`}
      onClick={onClick}
      title={`${label} · ${count}`}
    >
      <span className="editor-color-swatch" style={{ background: hex }} />
      <span className="editor-color-meta">
        <span className="editor-color-label">{label}</span>
        <span className="editor-color-count">{count}</span>
      </span>
    </button>
  )
}

/**
 * 色卡浮层:当前品牌全部色号 + 色号搜索 + 已用颗数。
 *
 * 之前它内联在操作台里,展开时把画布压到一半;且只有色块没有色号,
 * 触屏没有 hover,用户根本不知道补的是哪一色。浮层同时解决这两点。
 */
function PalettePanel({ palette, colorStats, selectedColor, onSelect, onClose }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const map = new Map()
    for (const c of colorStats) map.set(c.id, c.count)
    return map
  }, [colorStats])

  const nameOf = c => t(`palette.colorNames.${palette.id}.${c.id}`, c.nameZh || c.name)
  const needle = query.trim().toLowerCase()
  const colors = needle
    ? palette.colors.filter(
        c => c.id.toLowerCase().includes(needle) || nameOf(c).toLowerCase().includes(needle)
      )
    : palette.colors

  return createPortal(
    <div className="editor-sheet-overlay" onClick={onClose}>
      <div
        className="editor-sheet"
        role="dialog"
        aria-label={t('palette.title')}
        onClick={e => e.stopPropagation()}
      >
        <div className="editor-sheet-head">
          <h2>
            {t('palette.title')}
            <span className="editor-sheet-sub">{palette.colors.length}</span>
          </h2>
          <button
            type="button"
            className="editor-sheet-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>
        <input
          className="editor-sheet-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('palette.search')}
          aria-label={t('palette.search')}
        />
        <div className="editor-palette-grid">
          {colors.map(c => {
            const count = counts.get(c.id) || 0
            return (
              <button
                key={c.id}
                type="button"
                className={`editor-palette-swatch${selectedColor === c.hex ? ' active' : ''}`}
                title={`${c.id} ${nameOf(c)}${count ? ` · ${count}` : ''}`}
                aria-label={`${c.id} ${nameOf(c)}`}
                onClick={() => {
                  onSelect(c.hex)
                  onClose()
                }}
              >
                <span className="editor-palette-color" style={{ background: c.hex }} />
                <span className="editor-palette-code">{c.id}</span>
                {count > 0 && <span className="editor-palette-count">{count}</span>}
              </button>
            )
          })}
          {colors.length === 0 && <p className="editor-palette-empty">{t('palette.noMatch')}</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * 完成浮层:编辑器的出口。此前用户保存/导出后只能看到「返回」,
 * 而返回会落到空的上传页 —— 完成动作显式给出去向,并区分「保存并退出」
 * 与「只保存/只导出」。
 */
function FinishPanel({ dirty, onClose, onSaveAndExit, onSave, onExport, onExit }) {
  const { t } = useTranslation()
  return createPortal(
    <div className="editor-sheet-overlay" onClick={onClose}>
      <div
        className="editor-sheet editor-finish-sheet"
        role="dialog"
        aria-label={t('editor.finishTitle')}
        onClick={e => e.stopPropagation()}
      >
        <div className="editor-sheet-head">
          <h2>{t('editor.finishTitle')}</h2>
          <button
            type="button"
            className="editor-sheet-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>
        {dirty && <p className="editor-finish-hint">{t('editor.finishDirty')}</p>}
        <div className="editor-finish-actions">
          <button type="button" className="editor-finish-primary" onClick={onSaveAndExit}>
            {t('editor.saveAndExit')}
          </button>
          <button type="button" className="editor-finish-btn" onClick={onSave}>
            {t('common.save')}
          </button>
          <button type="button" className="editor-finish-btn" onClick={onExport}>
            {t('editor.export')}
          </button>
          <button type="button" className="editor-finish-btn ghost" onClick={onExit}>
            {t('editor.exitEditor')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function EditorPage({
  mobile = false,
  canvasProps,
  canvasRef,
  tool,
  onToolChange,
  selectedColor,
  onColorSelect,
  currentPalette,
  canvasData,
  gridSize,
  gridWidth,
  gridHeight,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selection,
  onSelectionCommand,
  onClearSelection,
  canPaste = false,
  fillIncludeEmpty = false,
  onToggleFillIncludeEmpty,
  onNoiseCleanup,
  onExport,
  // 完成流程:canvasSource 用来识别「深链进来的空白编辑器」,
  // onFinishSave = 保存成功后退出(App 负责)
  canvasSource,
  onFinishSave,
  onCropCanvas,
  onOpenReplace,
  onToast,
  // 移动端专属:点选方向盘与长按菜单(桌面布局不传)
  pickCursor,
  onPickMove,
  onPickToggle,
  selectionMenu,
  onCloseSelectionMenu,
  onSelectionMenuCommand,
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const consoleRef = useRef(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  // 单色隔离只影响绘制,不改矩阵:视图态留在本页,App/Canvas 只收一个 hex
  const [isolateColor, setIsolateColor] = useState(null)

  const cols = gridWidth || gridSize
  const rows = gridHeight || gridSize
  const palette = getPalette(currentPalette || 'perler')

  // 图纸用色:与导出图例同一统计口径(calculateColorStats),
  // 每次编辑后自动重算颗数 —— 这是「图纸用色列表」区别于完整色板的核心
  const colorStats = useMemo(
    () => calculateColorStats(canvasData, cols, rows, palette),
    [canvasData, cols, rows, palette]
  )
  const totalBeads = useMemo(() => colorStats.reduce((sum, c) => sum + c.count, 0), [colorStats])
  // 整理面板按「画布上的真实 hex」工作(删色/减色/隔离都直接写这个值);
  // colorStats 是就近归并到品牌色号后的展示口径,两者在量化结果上一致,
  // 但作品再编辑时可能含色卡外颜色 —— 整理必须用真实值,否则会删不掉。
  const usedColors = useMemo(() => collectColorStats(canvasData), [canvasData])

  // 操作台实际高度写入 --mobile-toolbar-h:PickDPad 的悬浮定位读这个变量,
  // 折行/展开面板时方向盘自动跟随(与 MobileToolbar 同款机制)。
  // 互斥性:该变量的写入方只有本页(编辑器路由)与画布页的 MobileToolbar,
  // 两者路由互斥、不会同时挂载 —— 卸载时必须 removeProperty(下方 cleanup),
  // 否则会把编辑器的高度残留到画布页。仅移动布局需要(桌面无消费方)。
  useLayoutEffect(() => {
    if (!mobile) return undefined
    const el = consoleRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const update = () => {
      document.documentElement.style.setProperty('--mobile-toolbar-h', `${el.offsetHeight}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--mobile-toolbar-h')
    }
  }, [mobile])

  // 被隔离的颜色可能被删色/减色/换图之后不再存在:自动退出隔离,
  // 否则画布会整片变淡而用户找不到原因。
  useEffect(() => {
    if (!isolateColor) return
    const stillUsed = usedColors.some(c => c.hex.toLowerCase() === isolateColor.toLowerCase())
    if (!stillUsed) setIsolateColor(null)
  }, [usedColors, isolateColor])

  const handleBack = () => {
    // 有未保存修改时先走完成面板:直接返回会把用户带回空的上传页,
    // 修改只留在草稿里 —— 明确给一次「保存并退出」的机会。
    if (canvasProps.saveState === 'dirty') {
      setFinishOpen(true)
      return
    }
    if (location.key !== 'default') navigate(-1)
    else navigate('/', { replace: true })
  }

  const codeOf = hex => {
    const found = palette.colors.find(c => c.hex?.toLowerCase() === String(hex).toLowerCase())
    return found ? found.id : hex
  }

  const notify = (message, type = 'success') => onToast?.(message, type)

  const handleDeleteColor = hex => {
    const result = removeCanvasColor(canvasData, hex)
    if (!result) return
    canvasProps.onCanvasChange?.(result.data)
    setCleanupOpen(false)
    notify(t('editor.deleteDone', { n: result.removed }))
  }

  const handleReduceColors = keepCount => {
    const result = reduceCanvasColors(canvasData, { keepCount })
    if (!result) return
    canvasProps.onCanvasChange?.(result.data)
    setCleanupOpen(false)
    notify(t('editor.reduceDone', { n: result.after }))
  }

  const handleCrop = mode => {
    const result =
      mode === 'selection'
        ? cropCanvas(canvasData, selectionBounds(selection))
        : cropCanvasToContent(canvasData)
    if (!result) {
      notify(t('editor.cropEmpty'), 'info')
      return
    }
    setCleanupOpen(false)
    onCropCanvas?.(result.data, result.width, result.height)
  }

  const handleToggleIsolate = hex => {
    setIsolateColor(prev => (!hex || prev === hex ? null : hex))
    setCleanupOpen(false)
  }

  // 命令清单:[命令名, i18n 键]。粘贴的禁用逻辑单独由 canPaste 决定(见下方 disabled),
  // 不混入这份清单 —— 三元组的隐式约定(第三项只有 paste 才有)没人读得懂。
  const selectionCommands = [
    ['erase', 'tools.selectionEraseShort'],
    ['fill', 'tools.selectionFillShort'],
    ['copy', 'tools.selectionCopyShort'],
    ['cut', 'tools.selectionCutShort'],
    ['paste', 'tools.selectionPasteShort'],
    ['mirrorH', 'tools.selectionFlipHShort'],
    ['mirrorV', 'tools.selectionFlipVShort'],
    ['rotateCw', 'tools.selectionRotateCwShort'],
    ['rotateCcw', 'tools.selectionRotateCcwShort'],
  ]

  // 深链/刷新进来的空编辑器没有任何可修图的内容:给出明确出口,
  // 而不是让用户面对一整套操作台和 0 颗的空白网格。
  // 用 canvasSource 判定而不是「0 颗」—— 用户可能在编辑器里把珠子全擦掉,
  // 那份图纸仍然有来源,不该被当成空态踢出去。
  const isEmptyDoc = !canvasSource && totalBeads === 0
  if (isEmptyDoc) {
    return (
      <div className="editor-page">
        <header className="editor-head">
          <BackButton size="md" onClick={handleBack} />
          <h1 className="editor-title">{t('editor.title')}</h1>
        </header>
        <div className="editor-empty">
          <span className="editor-empty-icon" aria-hidden="true">
            <ImagePlus size={26} />
          </span>
          <h2>{t('editor.emptyTitle')}</h2>
          <p>{t('editor.emptyHint')}</p>
          <button type="button" className="editor-empty-primary" onClick={() => navigate('/create/image')}>
            {t('editor.goQuantize')}
          </button>
          <button type="button" className="editor-empty-ghost" onClick={() => navigate('/')}>
            {t('editor.goHome')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`editor-page${mobile ? ' editor-page-mobile' : ''}`}>
      <header className="editor-head">
        <BackButton size="md" onClick={handleBack} />
        <h1 className="editor-title">{t('editor.title')}</h1>
        <span className="editor-size-chip">
          {cols} × {rows}
        </span>
        <span className="editor-size-chip">{t('editor.beadCount', { n: totalBeads })}</span>
        <button type="button" className="editor-finish-entry" onClick={() => setFinishOpen(true)}>
          <Check size={15} />
          {t('editor.finish')}
        </button>
      </header>

      <div className="editor-canvas-area">
        <Canvas {...canvasProps} ref={canvasRef} isolateColor={isolateColor} />
        {mobile && (
          <div className="editor-zoom">
            <button
              type="button"
              onClick={() => canvasRef?.current?.fitToScreen?.()}
              aria-label={t('canvas.fitTitle')}
              title={t('canvas.fitTitle')}
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => canvasRef?.current?.resetTransform?.()}
              aria-label={t('canvas.reset')}
              title={t('canvas.reset')}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="editor-console" ref={consoleRef}>
        {/* 行 A:图纸用色(实时颗数)+ 色卡浮层入口 */}
        <div className="editor-color-row">
          <div className="editor-color-list">
            {colorStats.length === 0 && <span className="editor-color-empty">{t('editor.emptyCanvas')}</span>}
            {colorStats.map(c => (
              <ColorChip
                key={c.id}
                hex={c.hex}
                label={c.id}
                count={c.count}
                active={selectedColor === c.hex}
                onClick={() => onColorSelect(c.hex)}
              />
            ))}
          </div>
          <button
            type="button"
            className={`editor-more-btn${paletteOpen ? ' active' : ''}`}
            onClick={() => setPaletteOpen(true)}
          >
            <Palette size={14} />
            {t('editor.palette')}
          </button>
          {isolateColor && (
            <button
              type="button"
              className="editor-isolate-badge"
              onClick={() => setIsolateColor(null)}
              title={t('editor.cleanupIsolateExit')}
            >
              {t('editor.isolateBadge', { code: codeOf(isolateColor) })}
              <X size={12} />
            </button>
          )}
        </div>

        {/* 行 B:工具 ⇄ 选区命令(同一位置替换,高度不变)
            行 C:常驻操作(去噪/撤销/重做/保存/导出) */}
        <div className="editor-tools-row">
          {selection ? (
            <div className="editor-context">
              <div className="editor-selection-scroll" data-testid="editor-selection-bar">
                {selectionCommands.map(([command, key]) => (
                  <button
                    key={command}
                    type="button"
                    className="editor-cmd-btn"
                    disabled={command === 'paste' && !canPaste}
                    onClick={() => onSelectionCommand?.(command)}
                  >
                    {t(key)}
                  </button>
                ))}
                <button
                  type="button"
                  className={`editor-cmd-btn${fillIncludeEmpty ? ' active' : ''}`}
                  onClick={() => onToggleFillIncludeEmpty?.(!fillIncludeEmpty)}
                >
                  {fillIncludeEmpty ? '✓ ' : ''}
                  {t('tools.fillIncludeEmptyShort')}
                </button>
                <button type="button" className="editor-cmd-btn danger" onClick={onClearSelection}>
                  {t('tools.clearSelectionBtn')}
                </button>
              </div>
              <button
                type="button"
                className="editor-context-exit"
                onClick={onClearSelection}
                aria-label={t('tools.clearSelectionBtn')}
                title={t('tools.clearSelectionBtn')}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="editor-tools">
              {EDITOR_TOOLS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`editor-tool-btn${tool === id ? ' active' : ''}`}
                  title={t(`canvas.tool.${id}`)}
                  aria-label={t(`canvas.tool.${id}`)}
                  onClick={() => onToolChange(id)}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
          )}
          <div className="editor-actions">
            <button
              type="button"
              className="editor-action-btn noise"
              title={t('editor.cleanup')}
              aria-label={t('editor.cleanup')}
              onClick={() => setCleanupOpen(true)}
            >
              <Sparkles size={16} />
              <span>{t('editor.cleanup')}</span>
            </button>
            <button
              type="button"
              className="editor-action-btn"
              onClick={onUndo}
              disabled={!canUndo}
              title={t('tools.undoAction')}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="editor-action-btn"
              onClick={onRedo}
              disabled={!canRedo}
              title={t('tools.redoAction')}
            >
              <Redo2 size={16} />
            </button>
            <button
              type="button"
              className="editor-action-btn"
              onClick={canvasProps.onSave}
              title={t('gallery.saveTitle')}
            >
              <Save size={16} />
              {canvasProps.saveState === 'dirty' && <span className="editor-save-dot" />}
            </button>
            <button type="button" className="editor-action-btn" onClick={onExport} title={t('editor.export')}>
              <ImageDown size={16} />
              <span>{t('editor.export')}</span>
            </button>
          </div>
        </div>
      </div>

      {cleanupOpen && (
        <EditorCleanupPanel
          palette={palette}
          usedColors={usedColors}
          hasSelection={Boolean(selection)}
          isolateColor={isolateColor}
          onNoise={() => {
            setCleanupOpen(false)
            onNoiseCleanup?.()
          }}
          onOpenReplace={() => {
            setCleanupOpen(false)
            onOpenReplace?.()
          }}
          onDeleteColor={handleDeleteColor}
          onReduceColors={handleReduceColors}
          onCrop={handleCrop}
          onToggleIsolate={handleToggleIsolate}
          onClose={() => setCleanupOpen(false)}
        />
      )}

      {finishOpen && (
        <FinishPanel
          dirty={canvasProps.saveState === 'dirty'}
          onClose={() => setFinishOpen(false)}
          onSaveAndExit={() => {
            setFinishOpen(false)
            onFinishSave?.()
          }}
          onSave={() => {
            setFinishOpen(false)
            canvasProps.onSave?.()
          }}
          onExport={() => {
            setFinishOpen(false)
            onExport?.()
          }}
          onExit={() => {
            setFinishOpen(false)
            navigate('/')
          }}
        />
      )}

      {paletteOpen && (
        <PalettePanel
          palette={palette}
          colorStats={colorStats}
          selectedColor={selectedColor}
          onSelect={onColorSelect}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {/* 移动端:点选方向盘 + 长按菜单,与画布页同款 */}
      {mobile && tool === 'pick' && (
        <PickDPad
          cursor={pickCursor}
          selected={pickCursor ? selectionContains(selection, pickCursor) : false}
          onMove={onPickMove}
          onToggle={onPickToggle}
        />
      )}
      {mobile && (
        <SelectionContextMenu
          open={Boolean(selectionMenu)}
          x={selectionMenu?.x || 0}
          y={selectionMenu?.y || 0}
          canPaste={canPaste}
          onCommand={onSelectionMenuCommand}
          onClose={onCloseSelectionMenu}
        />
      )}
    </div>
  )
}
