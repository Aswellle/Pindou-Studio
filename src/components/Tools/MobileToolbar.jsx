import { useTranslation } from 'react-i18next'
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
}

const UndoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
)

const RedoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

const ExportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

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
}) {
  const { t } = useTranslation()

  const tools = [
    { id: 'pencil', label: t('canvas.tool.pencil') },
    { id: 'eraser', label: t('canvas.tool.eraser') },
    { id: 'fill', label: t('canvas.tool.fill') },
    { id: 'hand', label: t('canvas.tool.hand') },
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

      <div className="toolbar-row toolbar-actions">
        <button
          className="action-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title={t('tools.undoAction')}
          aria-label={t('tools.undo')}
        >
          <UndoIcon />
        </button>
        <button
          className="action-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title={t('tools.redoAction')}
          aria-label={t('tools.redo')}
        >
          <RedoIcon />
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

        <button className="action-btn" onClick={onQuantize} aria-label={t('tools.imageToBead')}>
          <CameraIcon />
        </button>
        <button className="action-btn primary" onClick={onExport} aria-label={t('export.title')}>
          <ExportIcon />
        </button>
      </div>
    </div>
  )
}
