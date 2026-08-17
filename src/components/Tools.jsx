import { useTranslation } from 'react-i18next'
import { useToast } from './Toast'
import { Pencil, Eraser, PaintBucket, Hand, Undo2, Redo2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

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
  onOpenQuantizer
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

  const getCurrentPreset = () => {
    if (isRectangular) {
      return `${currentWidth}x${currentHeight}`
    }
    return String(currentWidth)
  }

  return (
    <div className={`tools-drawer ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="drawer-toggle left-toggle"
        onClick={onToggleCollapse}
        title={collapsed ? t('tools.expand') : t('tools.collapse')}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
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
        </div>

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
        .drawer-toggle {
          position: absolute;
          top: 50%;
          right: -12px;
          transform: translateY(-50%);
          width: 24px;
          height: 48px;
          border-radius: 0 8px 8px 0;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-left: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          transition: all 0.2s ease;
          color: var(--text-secondary);
        }
        .drawer-toggle:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .drawer-toggle.left-toggle {
          right: -12px;
        }
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
      `}</style>
    </div>
  )
}
