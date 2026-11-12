import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Pencil, Eraser, PaintBucket, Pipette, MousePointerClick, Lasso, SquareDashed,
  Sparkles, Undo2, Redo2, Save, ImageDown, Plus, X,
} from 'lucide-react'
import BackButton from './BackButton'
import Canvas from './Canvas'
import PickDPad from './PickDPad'
import SelectionContextMenu from './SelectionContextMenu'
import { getPalette } from '../data/palettes'
import { calculateColorStats } from '../services/export/PatternDocument'
import { selectionContains } from '../utils/lassoSelection'
import './editor.css'

/**
 * 图纸编辑器(/editor)—— 图片转拼豆结果的专用编辑界面。
 *
 * 与画布页的分工:画布页是「从零创作」的全功能工具;编辑器只服务
 * 「量化结果进来后修图」这一件事 —— 画格区复用同一个 Canvas 组件与
 * App 画布状态(useHistory/selection/保存/导出),底部操作台则是为
 * 修图定制的新 UI:图纸用色列表(点选为画笔色,实时重算颗数)、
 * 精简工具行、上下文选区条。不复用 Tools.jsx / MobileToolbar。
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
  const [showMoreColors, setShowMoreColors] = useState(false)

  const cols = gridWidth || gridSize
  const rows = gridHeight || gridSize
  const palette = getPalette(currentPalette || 'perler')

  // 图纸用色:与导出图例同一统计口径(calculateColorStats),
  // 每次编辑后自动重算颗数 —— 这是「图纸用色列表」区别于完整色板的核心
  const colorStats = useMemo(
    () => calculateColorStats(canvasData, cols, rows, palette),
    [canvasData, cols, rows, palette],
  )
  const totalBeads = useMemo(() => colorStats.reduce((sum, c) => sum + c.count, 0), [colorStats])
  const colorName = (c) => t(`palette.colorNames.${palette.id}.${c.id}`, c.nameZh || c.name)

  // 操作台实际高度写入 --mobile-toolbar-h:PickDPad 的悬浮定位读这个变量,
  // 折行/展开「更多颜色」时方向盘自动跟随(与 MobileToolbar 同款机制)
  useLayoutEffect(() => {
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
  }, [])

  const handleBack = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate('/', { replace: true })
  }

  const selectionCommands = [
    ['erase', 'tools.selectionEraseShort'],
    ['fill', 'tools.selectionFillShort'],
    ['copy', 'tools.selectionCopyShort'],
    ['cut', 'tools.selectionCutShort'],
    ['paste', 'tools.selectionPasteShort', canPaste],
    ['mirrorH', 'tools.selectionFlipHShort'],
    ['mirrorV', 'tools.selectionFlipVShort'],
    ['rotateCw', 'tools.selectionRotateCwShort'],
    ['rotateCcw', 'tools.selectionRotateCcwShort'],
  ]

  return (
    <div className={`editor-page${mobile ? ' editor-page-mobile' : ''}`}>
      <header className="editor-head">
        <BackButton size="md" onClick={handleBack} />
        <h1 className="editor-title">{t('editor.title')}</h1>
        <span className="editor-size-chip">{cols} × {rows}</span>
        <span className="editor-size-chip">{t('editor.beadCount', { n: totalBeads })}</span>
      </header>

      <div className="editor-canvas-area">
        <Canvas {...canvasProps} ref={canvasRef} />
      </div>

      <div className="editor-console" ref={consoleRef}>
        {/* 行 A:图纸用色(实时颗数)+ 补色入口 */}
        <div className="editor-color-row">
          <div className="editor-color-list">
            {colorStats.length === 0 && (
              <span className="editor-color-empty">{t('editor.emptyCanvas')}</span>
            )}
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
            className={`editor-more-btn${showMoreColors ? ' active' : ''}`}
            onClick={() => setShowMoreColors(v => !v)}
          >
            {showMoreColors ? <X size={14} /> : <Plus size={14} />}
            {t('editor.moreColors')}
          </button>
        </div>

        {showMoreColors && (
          <div className="editor-extra-colors">
            {palette.colors.map(c => (
              <button
                key={c.id}
                type="button"
                className={`editor-extra-swatch${selectedColor === c.hex ? ' active' : ''}`}
                style={{ background: c.hex }}
                title={`${c.id} ${colorName(c)}`}
                aria-label={`${c.id} ${colorName(c)}`}
                onClick={() => {
                  onColorSelect(c.hex)
                  setShowMoreColors(false)
                }}
              />
            ))}
          </div>
        )}

        {/* 行 C:上下文选区命令(有选区才出现) */}
        {selection && (
          <div className="editor-selection-row" data-testid="editor-selection-bar">
            {selectionCommands.map(([command, key, enabled]) => (
              <button
                key={command}
                type="button"
                className="editor-cmd-btn"
                disabled={enabled === false}
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
              {fillIncludeEmpty ? '✓ ' : ''}{t('tools.fillIncludeEmptyShort')}
            </button>
            <button type="button" className="editor-cmd-btn danger" onClick={onClearSelection}>
              {t('tools.clearSelectionBtn')}
            </button>
          </div>
        )}

        {/* 行 B:工具 + 修图操作 */}
        <div className="editor-tools-row">
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
          <div className="editor-actions">
            <button
              type="button"
              className="editor-action-btn noise"
              title={t('tools.noiseCleanup')}
              onClick={onNoiseCleanup}
            >
              <Sparkles size={16} />
              <span>{t('tools.noiseCleanup')}</span>
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
            <button
              type="button"
              className="editor-action-btn"
              onClick={onExport}
              title={t('editor.export')}
            >
              <ImageDown size={16} />
              <span>{t('editor.export')}</span>
            </button>
          </div>
        </div>
      </div>

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
