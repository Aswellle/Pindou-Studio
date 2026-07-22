import { useTranslation } from 'react-i18next'

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
        alert(t('tools.widthRange'))
        return
      }
      if (parts.length === 2) {
        if (isNaN(parts[1]) || parts[1] < 9 || parts[1] > 200) {
          alert(t('tools.heightRange'))
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {collapsed ? (
            <path d="M9 18l6-6-6-6"/>
          ) : (
            <path d="M15 18l-6-6 6-6"/>
          )}
        </svg>
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
            <button
              className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
              onClick={() => onToolChange('eraser')}
              title={t('canvas.tool.eraser')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 20H7L3 16l9-9 8 8-4 4"/>
                <path d="M6.5 12.5l4 4"/>
              </svg>
            </button>
            <button
              className={`tool-btn ${tool === 'fill' ? 'active' : ''}`}
              onClick={() => onToolChange('fill')}
              title={t('canvas.tool.fill')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 0 0 7.78 7.78L19 11z"/>
                <path d="M20 23a2 2 0 0 0 2-2c0-1.5-2-2.5-2-4s2-2.5 2-4"/>
                <path d="M3 21l3-3"/>
              </svg>
            </button>
            <button
              className={`tool-btn ${tool === 'hand' ? 'active' : ''}`}
              onClick={() => onToolChange('hand')}
              title={t('canvas.tool.hand')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 11V6a2 2 0 0 0-4 0v0"/>
                <path d="M14 10V4a2 2 0 0 0-4 0v2"/>
                <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
                <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
              </svg>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3,6 5,6 21,6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              {t('tools.clear')}
            </button>
            <button className="action-btn icon-btn" onClick={onUndo} disabled={!canUndo} title={t('tools.undoAction')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6"/>
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
              </svg>
              <span>{t('tools.undo')}</span>
            </button>
            <button className="action-btn icon-btn" onClick={onRedo} disabled={!canRedo} title={t('tools.redoAction')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 7v6h-6"/>
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
              </svg>
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
          font-size: 14px;
          font-weight: 600;
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
          font-size: 11px;
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
          padding: 10px;
          border-radius: 6px;
          border: 2px solid transparent;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
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
          font-size: 13px;
          background: var(--bg-primary);
          cursor: pointer;
        }
        .tool-select:focus {
          border-color: var(--accent);
        }
        .current-size-info {
          margin-top: 6px;
          font-size: 11px;
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
          font-size: 12px;
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
          font-size: 11px;
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
