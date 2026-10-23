import { useTranslation } from 'react-i18next'
import { useToast } from './Toast'
import {
  Pencil, Eraser, PaintBucket, Hand, Undo2, Redo2, Trash2, ChevronLeft, ChevronRight, FileJson,
  Pipette, SquareDashed, Replace, FlipHorizontal2, FlipVertical2, RotateCw, RotateCcw, X,
  Copy, ClipboardPaste,
} from 'lucide-react'

export default function Tools({
  tool,
  onToolChange,
  gridSize,
  gridWidth,
  gridHeight,
  onGridSizeChange,
  onGridDimensionsChange,
  collapsed,
  onToggleCollapse,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  onOpenQuantizer,
  onOpenImport,
  // M5:选区与颜色替换
  selection,
  onSelectionCommand,
  onClearSelection,
  onOpenReplace,
  // 选区填充是否包含空白格(默认 false,规格 04 §2)
  fillIncludeEmpty = false,
  onToggleFillIncludeEmpty,
  // 剪贴板里有没有内容:只用于禁用「粘贴」按钮,内容本身留在 App 层
  canPaste = false,
  // A2:复制拖动开关(拖动选区内部 = 复制一份,而不是搬走原件)
  copyDrag = false,
  onToggleCopyDrag,
}) {
  const { t } = useTranslation()
  const toast = useToast()

  const currentWidth = gridWidth || gridSize
  const currentHeight = gridHeight || gridSize
  const isRectangular = gridWidth !== null && gridHeight !== null

  const handlePresetChange = (e) => {
    const value = e.target.value
    if (value === 'custom') {
      const input = prompt(t('tools.customSizePrompt'), `${currentWidth}x${currentHeight}`)
      if (!input) return
      const parts = input.toLowerCase().split('x').map(s => parseInt(s.trim(), 10))
      if (Number.isNaN(parts[0]) || parts[0] < 9 || parts[0] > 200) {
        toast(t('tools.widthRange'), 'error')
        return
      }
      if (parts.length === 2) {
        if (Number.isNaN(parts[1]) || parts[1] < 9 || parts[1] > 200) {
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

  const getCurrentPreset = () => {
    if (isRectangular) {
      return `${currentWidth}x${currentHeight}`
    }
    return String(currentWidth)
  }

  return (
    <div className={`tools-drawer ${collapsed ? 'collapsed' : ''}`}>
      <button
        className={`drawer-toggle left-toggle${collapsed ? ' is-collapsed' : ''}`}
        onClick={onToggleCollapse}
        title={collapsed ? t('tools.expand') : t('tools.collapse')}
        aria-expanded={!collapsed}
        aria-controls="tools-drawer"
        aria-label={collapsed ? t('tools.expand') : t('tools.collapse')}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        <span className="drawer-toggle-label">{collapsed ? t('tools.expand') : t('tools.collapse')}</span>
      </button>

      <div className="tools-content">
        <h3 className="tools-title">{t('tools.title')}</h3>

        <div className="tool-group">
          <div className="tool-icons">
            <button
              className={`tool-btn ${tool === 'pencil' ? 'active' : ''}`}
              onClick={() => onToolChange('pencil')}
              title={t('canvas.tool.pencil')}
            >
              <Pencil size={20} />
            </button>
            <button
              className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
              onClick={() => onToolChange('eraser')}
              title={t('canvas.tool.eraser')}
            >
              <Eraser size={20} />
            </button>
            <button
              className={`tool-btn ${tool === 'fill' ? 'active' : ''}`}
              onClick={() => onToolChange('fill')}
              title={t('canvas.tool.fill')}
            >
              <PaintBucket size={20} />
            </button>
            <button
              className={`tool-btn ${tool === 'hand' ? 'active' : ''}`}
              onClick={() => onToolChange('hand')}
              title={t('canvas.tool.hand')}
            >
              <Hand size={20} />
            </button>
          </div>
          {/* 第二排:取色与矩形选区。与第一排同宽同高,保持 2×3 网格观感 */}
          <div className="tool-icons tool-icons-secondary">
            <button
              className={`tool-btn ${tool === 'eyedropper' ? 'active' : ''}`}
              onClick={() => onToolChange('eyedropper')}
              title={t('canvas.tool.eyedropper')}
            >
              <Pipette size={20} />
            </button>
            <button
              className={`tool-btn ${tool === 'select' ? 'active' : ''}`}
              onClick={() => onToolChange('select')}
              title={t('canvas.tool.select')}
            >
              <SquareDashed size={20} />
            </button>
          </div>
        </div>

        {/* 选区命令:仅在选区工具且有选区时展开,不占常驻空间。
            按钮排成单列(图标 + 文字,左对齐):侧栏只有 200px,两列布局下
            「顺时针旋转」这类标签会顶出按钮边界;单列保证任何语言都不换行、不溢出。 */}
        {tool === 'select' && (
          <div className="tool-group selection-group">
            <label className="tool-label">{t('tools.selection')}</label>
            {selection ? (
              <>
                <div className="selection-size">
                  {t('tools.selectionSize', { w: selection.w, h: selection.h })}
                </div>
                <div className="selection-actions">
                  <button className="action-btn" onClick={() => onSelectionCommand?.('fill')} title={t('tools.fillSelection')}>
                    <PaintBucket size={15} /><span className="action-btn-label">{t('tools.fillSelection')}</span>
                  </button>
                  <button className="action-btn" onClick={() => onSelectionCommand?.('erase')} title={t('tools.clearSelection')}>
                    <Eraser size={15} /><span className="action-btn-label">{t('tools.clearSelection')}</span>
                  </button>
                  {/* 复制 / 粘贴:纯内存剪贴板,不碰系统剪贴板。
                      粘贴以当前选区左上角为落点(无选区时贴到画布左上角),越界裁剪。 */}
                  <button className="action-btn" onClick={() => onSelectionCommand?.('copy')} title={t('tools.copySelection')}>
                    <Copy size={15} /><span className="action-btn-label">{t('tools.copySelection')}</span>
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => onSelectionCommand?.('paste')}
                    disabled={!canPaste}
                    title={t('tools.pasteSelection')}
                  >
                    <ClipboardPaste size={15} /><span className="action-btn-label">{t('tools.pasteSelection')}</span>
                  </button>
                  <button className="action-btn" onClick={() => onSelectionCommand?.('mirrorH')} title={t('tools.mirrorH')}>
                    <FlipHorizontal2 size={15} /><span className="action-btn-label">{t('tools.mirrorH')}</span>
                  </button>
                  <button className="action-btn" onClick={() => onSelectionCommand?.('mirrorV')} title={t('tools.mirrorV')}>
                    <FlipVertical2 size={15} /><span className="action-btn-label">{t('tools.mirrorV')}</span>
                  </button>
                  <button className="action-btn" onClick={() => onSelectionCommand?.('rotateCw')} title={t('tools.rotateCw')}>
                    <RotateCw size={15} /><span className="action-btn-label">{t('tools.rotateCw')}</span>
                  </button>
                  <button className="action-btn" onClick={() => onSelectionCommand?.('rotateCcw')} title={t('tools.rotateCcw')}>
                    <RotateCcw size={15} /><span className="action-btn-label">{t('tools.rotateCcw')}</span>
                  </button>
                  <button className="action-btn selection-clear" onClick={onClearSelection} title={t('tools.clearSelectionBtn')}>
                    <X size={15} /><span className="action-btn-label">{t('tools.clearSelectionBtn')}</span>
                  </button>
                </div>
                {/* 规格 04 §2:默认只改已有珠子;需要连空白一起填时由这个开关显式打开 */}
                <label className="selection-fill-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(fillIncludeEmpty)}
                    onChange={(e) => onToggleFillIncludeEmpty?.(e.target.checked)}
                  />
                  <span>{t('tools.fillIncludeEmpty')}</span>
                </label>
                {/* A2:桌面端也留一个开关。Alt/Option 拖动是快捷方式,但按住修饰键
                    拖动的手势没有任何视觉提示,只靠它等于要求用户猜。 */}
                <label className="selection-fill-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(copyDrag)}
                    onChange={(e) => onToggleCopyDrag?.(e.target.checked)}
                  />
                  <span>{t('tools.copyDragHint')}</span>
                </label>
                {/* 拖拽移动没有按钮,只能靠提示告知(规格 04 §2 要求移动有明确入口) */}
                <p className="selection-hint">{t('tools.selectionMoveHint')}</p>
              </>
            ) : (
              <p className="selection-hint">{t('tools.selectionEmpty')}</p>
            )}
          </div>
        )}

        <div className="tool-group">
          <label className="tool-label">{t('tools.canvasSize')}</label>
          <select
            value={getCurrentPreset()}
            onChange={handlePresetChange}
            className="tool-select"
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
          {isRectangular && (
            <div className="current-size-info">
              {currentWidth} × {currentHeight}（{currentWidth * currentHeight} {t('tools.cells')}）
            </div>
          )}
        </div>

        <div className="tool-group">
          <label className="tool-label">{t('tools.quickActions')}</label>
          <div className="quick-actions">
            <button className="action-btn clear-btn" onClick={onClear} title={t('tools.clearCanvas')}>
              <Trash2 size={16} />
              {t('tools.clear')}
            </button>
            <button className="action-btn icon-btn" onClick={onUndo} disabled={!canUndo} title={t('tools.undoAction')}>
              <Undo2 size={18} />
              <span>{t('tools.undo')}</span>
            </button>
            <button className="action-btn icon-btn" onClick={onRedo} disabled={!canRedo} title={t('tools.redoAction')}>
              <Redo2 size={18} />
              <span>{t('tools.redo')}</span>
            </button>
          </div>
        </div>

        <div className="tool-group">
          <label className="tool-label">{t('tools.import')}</label>
          <button className="action-btn quantizer-btn" onClick={onOpenQuantizer} title={t('tools.imageToBead')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21,15 16,10 5,21"/>
            </svg>
            {t('tools.imageToBead')}
          </button>
          {onOpenImport && (
            <button className="action-btn import-btn" onClick={onOpenImport} title={t('tools.importFile')}>
              <FileJson size={16} />
              {t('tools.importFile')}
            </button>
          )}
          {onOpenReplace && (
            <button className="action-btn replace-btn" onClick={onOpenReplace} title={t('tools.replaceColor')}>
              <Replace size={16} />
              {t('tools.replaceColor')}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .tools-drawer {
          position: relative;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px;
          width: 200px;
          transition: width 0.3s ease;
        }
        .tools-drawer.collapsed {
          width: 56px;
          padding: 12px 8px;
        }
        .tools-drawer.collapsed .tools-content {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }
        .tools-content {
          transition: opacity 0.2s ease, visibility 0.2s ease;
        }
        /* 作用域限定在 .tools-drawer,避免与 ColorPalette 的同名 .drawer-toggle 全局样式串扰
           (此前 ColorPalette 的 left:-12px 泄漏到左栏,把按钮挤到屏幕外) */
        .tools-drawer .drawer-toggle {
          /* 辅助角色:小巧低调的胶囊,不与工具栏/色卡等主角抢视觉 */
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 12;
          height: 23px;
          padding: 0 8px;
          border-radius: 999px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          font-weight: 500;
          color: var(--text-muted);
          white-space: nowrap;
          opacity: 0.85;
          transition: all 0.18s ease;
        }
        .tools-drawer .drawer-toggle .drawer-toggle-label { line-height: 1; }
        .tools-drawer .drawer-toggle:hover {
          background: var(--accent-soft);
          border-color: var(--accent);
          color: var(--accent);
          opacity: 1;
        }
        /* 收起(窄条)时:小巧圆形图标按钮,居中置顶 */
        .tools-drawer.collapsed .drawer-toggle {
          top: 8px;
          right: 50%;
          transform: translateX(50%);
          width: 24px;
          padding: 0;
          justify-content: center;
        }
        .tools-drawer.collapsed .drawer-toggle:hover { transform: translateX(50%) scale(1.06); }
        .tools-drawer.collapsed .drawer-toggle-label { display: none; }
        .tools-title {
          font-size: var(--text-md);
          font-weight: var(--font-weight-semibold);
          margin-bottom: 16px;
        }
        .collapsed .tools-title {
          display: none;
        }
        .tool-group {
          margin-bottom: 20px;
        }
        .tool-group:last-child {
          margin-bottom: 0;
        }
        .tool-label {
          display: block;
          font-size: var(--text-xs);
          font-weight: var(--font-weight-medium);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .tool-icons {
          display: flex;
          gap: 4px;
        }
        /* 第二排工具(取色/选区)与第一排保持同宽同高,上下留一点呼吸 */
        .tool-icons-secondary {
          margin-top: 4px;
        }
        .selection-group {
          padding: 10px;
          border-radius: 8px;
          background: var(--bg-secondary);
        }
        .selection-size {
          font-size: var(--text-xs);
          color: var(--secondary-accent);
          font-weight: var(--font-weight-semibold);
          margin-bottom: 6px;
          font-variant-numeric: tabular-nums;
        }
        .selection-actions {
          display: grid;
          grid-template-columns: 1fr;
          gap: 4px;
        }
        /* 按钮内「图标 + 文字」单行排列,文字允许省略号但不换行、不溢出:
           侧栏 200px 减去内边距后可用宽度约 140px,四字中文标签(如「顺时针旋转」)
           在 --text-xs(12px)下约 60px + 图标 15px + 间距,留有余量。 */
        .selection-actions .action-btn {
          width: 100%;
          min-width: 0;
          font-size: var(--text-xs);
          padding: 7px 8px;
          gap: 6px;
          justify-content: flex-start;
          white-space: nowrap;
          overflow: hidden;
        }
        .selection-actions .action-btn svg { flex-shrink: 0; }
        .action-btn-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .selection-actions .selection-clear {
          margin-top: 2px;
          color: var(--text-muted);
        }
        /* 「含空白格」开关:一行 checkbox + 文字,窄侧栏下允许换行但不溢出 */
        .selection-fill-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
          font-size: var(--text-xs);
          color: var(--text-secondary);
          cursor: pointer;
          line-height: 1.4;
        }
        .selection-fill-toggle input {
          flex-shrink: 0;
          width: 14px;
          height: 14px;
          accent-color: var(--accent);
          cursor: pointer;
        }
        .selection-fill-toggle span {
          min-width: 0;
        }
        .selection-hint {
          font-size: var(--text-xs);
          color: var(--text-muted);
          line-height: 1.5;
        }
        .tool-btn {
          flex: 1;
          /* min-width:0 允许按钮收缩到内容宽度以下,配合较窄的水平内边距,
             保证 4 个按钮 + 间隙始终容纳在工具栏内,不溢出侧栏边框 */
          min-width: 0;
          padding: 10px 6px;
          border-radius: 6px;
          border: 2px solid transparent;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .tool-btn svg {
          flex-shrink: 0;
        }
        .tool-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
        .tool-btn.active {
          background: var(--accent);
          color: white;
        }
        .tool-select {
          width: 100%;
          padding: 10px 12px;
          border: 2px solid var(--border-color);
          border-radius: 6px;
          font-size: var(--text-base);
          background: var(--bg-primary);
          cursor: pointer;
        }
        .tool-select:focus {
          border-color: var(--accent);
        }
        .current-size-info {
          margin-top: 6px;
          font-size: var(--text-xs);
          color: var(--text-muted);
          text-align: center;
        }
        .quick-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .clear-btn {
          grid-column: 1 / -1;
        }
        .action-btn {
          flex: 1;
          padding: 8px;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: var(--bg-primary);
          font-size: var(--text-sm);
          font-weight: var(--font-weight-medium);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.15s;
        }
        .action-btn:hover {
          border-color: var(--accent);
          background: var(--bg-secondary);
        }
        .action-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .icon-btn {
          flex-direction: column;
          gap: 3px;
          padding: 8px 4px;
        }
        .icon-btn span {
          font-size: var(--text-xs);
          line-height: 1;
        }
        .quantizer-btn {
          width: 100%;
          color: var(--accent);
          border-color: var(--accent);
        }
        .quantizer-btn:hover {
          background: var(--accent);
          color: white;
        }
        .replace-btn {
          width: 100%;
          color: var(--secondary-accent);
          border-color: var(--secondary-accent);
        }
        .replace-btn:hover {
          background: var(--secondary-accent);
          color: white;
        }
        .quantizer-btn,
        .import-btn,
        .replace-btn {
          width: 100%;
          margin-bottom: 6px;
        }
        .quantizer-btn:last-child,
        .import-btn:last-child,
        .replace-btn:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  )
}
