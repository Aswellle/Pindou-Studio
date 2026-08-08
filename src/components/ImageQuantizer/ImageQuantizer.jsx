import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useImageQuantizer } from '../../hooks/useImageQuantizer'
import { getPalette, PALETTE_LIST } from '../../data/palettes'
import './ImageQuantizer.css'

// 拟真珠子渲染 — 径向渐变 + 高光 + 中心孔
function drawBeadPreview(ctx, cx, cy, radius, hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const lighten = (c, f) => Math.min(255, Math.round(c + (255 - c) * f))
  const darken  = (c, f) => Math.max(0,   Math.round(c * (1 - f)))
  const highlight = `rgb(${lighten(r, 0.35)},${lighten(g, 0.35)},${lighten(b, 0.35)})`
  const shadow    = `rgb(${darken(r, 0.18)},${darken(g, 0.18)},${darken(b, 0.18)})`

  const grad = ctx.createRadialGradient(
    cx - radius * 0.25, cy - radius * 0.25, radius * 0.05,
    cx, cy, radius
  )
  grad.addColorStop(0,   highlight)
  grad.addColorStop(0.5, hexColor)
  grad.addColorStop(1.0, shadow)

  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // 月牙形高光
  if (radius >= 3) {
    ctx.beginPath()
    ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.28, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fill()
  }

  // 中心孔（珠子特征）
  if (radius >= 5) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 0.14, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${darken(r,0.3)},${darken(g,0.3)},${darken(b,0.3)},0.7)`
    ctx.fill()
  }
}

/**
 * 放大查看画布 — 大尺寸纯色方块渲染 + pixelated 保持锐利。
 * 默认预览是拟真圆珠(渐变),放大看会有渐变过渡带的"模糊"观感;
 * 放大模式用每格一个纯色块(无渐变),放大后每颗珠子颜色清晰锐利。
 */
function ZoomPreviewCanvas({ result, resolveHex }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !result) return
    const w0 = result.width
    const h0 = result.height
    const cell = Math.min(16, Math.floor(1600 / Math.max(w0, h0))) // 每格 ≤16px,长边 ≤1600px
    const w = w0 * cell
    const h = h0 * cell
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#e8e8e8'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h0; y++) {
      for (let x = 0; x < w0; x++) {
        const hex = resolveHex(result.canvasData[y]?.[x])
        if (hex) {
          ctx.fillStyle = hex
          ctx.fillRect(x * cell, y * cell, cell, cell)
        }
      }
    }
  }, [result, resolveHex])
  return (
    <canvas
      ref={ref}
      style={{ imageRendering: 'pixelated', maxWidth: '95vw', maxHeight: '85vh' }}
    />
  )
}

const GRID_PRESETS = [
  { key: '29x29',   w: 29,  h: 29  },
  { key: '57x57',   w: 57,  h: 57  },
  { key: '114x114', w: 114, h: 114 },
  { key: '140x140', w: 140, h: 140 },
  { key: '57x29',   w: 57,  h: 29  },
  { key: '29x57',   w: 29,  h: 57  },
  { key: 'aspect',  w: null, h: null, aspect: true },
  { key: 'custom',  w: null, h: null },
]

export default function ImageQuantizer({ onApply, onClose }) {
  const { t } = useTranslation()
  const { isProcessing, progress, result, error, quantize, reset } = useImageQuantizer()
  const [zoomPreview, setZoomPreview] = useState(false)

  // 品牌 ID → hex 查找表(预览与放大查看共用)
  const resultColorMap = useMemo(() => {
    const m = {}
    if (result?.quantizedColors) {
      for (const c of result.quantizedColors) m[c.id] = c.hex || c.id
    }
    return m
  }, [result])

  // 只放行合法 hex(品牌 ID 与 '#xyz' 都会污染 canvas fillStyle → 渲染黑块)
  const resolveHex = useCallback((v) => {
    if (!v) return null
    if (typeof v === 'string' && v.startsWith('#')) {
      const test = parseInt(v.slice(1), 16)
      return isNaN(test) ? null : v
    }
    const resolved = resultColorMap[v]
    if (resolved && typeof resolved === 'string' && resolved.startsWith('#')) {
      const test = parseInt(resolved.slice(1), 16)
      return isNaN(test) ? null : resolved
    }
    return null
  }, [resultColorMap])

  const [selectedPalette, setSelectedPalette] = useState('perler')
  const [gridPreset, setGridPreset] = useState('29x29')
  const [gridWidth, setGridWidth] = useState(29)
  const [gridHeight, setGridHeight] = useState(29)
  const [imageAspectRatio, setImageAspectRatio] = useState(1)
  const [longSide, setLongSide] = useState(57)
  const [maxColors, setMaxColors] = useState(12)
  const [hasUserTouchedMaxColors, setHasUserTouchedMaxColors] = useState(false)
  const [dithering, setDithering] = useState('none')
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [removeBackground, setRemoveBackground] = useState(true)
  const [qualityMode, setQualityMode] = useState('high')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [lastGeneratedSettings, setLastGeneratedSettings] = useState(null)
  const [lastGeneratedResult, setLastGeneratedResult] = useState(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [resultGridSize, setResultGridSize] = useState(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const fileInputRef = useRef(null)
  const pendingCloseRef = useRef(false)

  // 根据网格总格数推荐 maxColors — 经专业站 140×215（33色）和 29×29（12色）案例校准
  function suggestMaxColors(w, h) {
    const total = w * h
    if (total <= 900)   return 12
    if (total <= 3600)  return 20
    if (total <= 10000) return 32
    if (total <= 22500) return 48
    return 64
  }

  // 尺寸变化时自动同步推荐值（仅在用户未手动调整时）
  useEffect(() => {
    if (!hasUserTouchedMaxColors) {
      setMaxColors(suggestMaxColors(gridWidth, gridHeight))
    }
  }, [gridWidth, gridHeight, hasUserTouchedMaxColors])

  // 按原图比例模式 — longSide / 宽高比变化时实时更新 gridWidth/gridHeight
  useEffect(() => {
    if (gridPreset !== 'aspect') return
    if (imageAspectRatio >= 1) {
      setGridWidth(longSide)
      setGridHeight(Math.max(9, Math.round(longSide / imageAspectRatio)))
    } else {
      setGridHeight(longSide)
      setGridWidth(Math.max(9, Math.round(longSide * imageAspectRatio)))
    }
  }, [gridPreset, longSide, imageAspectRatio])

  // 跟踪设置是否变化
  const settingsChanged = useCallback(() => {
    if (!lastGeneratedSettings) return false
    return (
      lastGeneratedSettings.selectedPalette !== selectedPalette ||
      lastGeneratedSettings.gridWidth !== gridWidth ||
      lastGeneratedSettings.gridHeight !== gridHeight ||
      lastGeneratedSettings.maxColors !== maxColors ||
      lastGeneratedSettings.dithering !== dithering ||
      lastGeneratedSettings.brightness !== brightness ||
      lastGeneratedSettings.contrast !== contrast ||
      lastGeneratedSettings.removeBackground !== removeBackground ||
      lastGeneratedSettings.qualityMode !== qualityMode
    )
  }, [lastGeneratedSettings, selectedPalette, gridWidth, gridHeight, maxColors, dithering, brightness, contrast, removeBackground, qualityMode])

  // 处理关闭尝试
  const handleCloseAttempt = useCallback(() => {
    if (hasUnsavedChanges && result) {
      setShowUnsavedDialog(true)
      pendingCloseRef.current = true
    } else {
      onClose()
    }
  }, [hasUnsavedChanges, result, onClose])

  // 确认放弃更改
  const handleDiscardChanges = useCallback(() => {
    setShowUnsavedDialog(false)
    setHasUnsavedChanges(false)
    setLastGeneratedResult(null)
    setLastGeneratedSettings(null)
    setHasUserTouchedMaxColors(false)
    if (pendingCloseRef.current) {
      onClose()
      pendingCloseRef.current = false
    }
  }, [onClose])

  // 完全重置：清除图片、结果和所有状态，回到上传界面
  const handleFullReset = useCallback(() => {
    reset()
    setPreviewUrl(null)
    setHasUnsavedChanges(false)
    setLastGeneratedResult(null)
    setLastGeneratedSettings(null)
    setResultGridSize(null)
    setGridPreset('29x29')
    setGridWidth(29)
    setGridHeight(29)
    setHasUserTouchedMaxColors(false)
  }, [reset])

  // 监听设置变化
  useEffect(() => {
    if (result && settingsChanged()) {
      setHasUnsavedChanges(true)
    }
  }, [result, settingsChanged])

  const loadImageAspect = (url) => {
    const img = new Image()
    img.onload = () => setImageAspectRatio(img.width / img.height)
    img.src = url
  }

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      loadImageAspect(url)
      reset()
      setHasUnsavedChanges(false)
      setLastGeneratedResult(null)
      setLastGeneratedSettings(null)
    }
  }, [reset])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      loadImageAspect(url)
      reset()
      setHasUnsavedChanges(false)
      setLastGeneratedResult(null)
      setLastGeneratedSettings(null)
    }
  }, [reset])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragActive(false)
  }, [])

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)
        loadImageAspect(url)
        reset()
        setHasUnsavedChanges(false)
        setLastGeneratedResult(null)
        setLastGeneratedSettings(null)
        break
      }
    }
  }, [reset])

  const handleGenerate = useCallback(async () => {
    if (!previewUrl) return

    try {
      // 保存当前设置用于比较
      const currentSettings = {
        selectedPalette,
        gridWidth,
        gridHeight,
        maxColors,
        dithering,
        brightness,
        contrast,
        removeBackground,
        qualityMode
      }

      const response = await quantize(
        await fetch(previewUrl).then(r => r.blob()),
        {
          gridWidth,
          gridHeight,
          gridSize: Math.max(gridWidth, gridHeight),
          maxColors,
          paletteId: selectedPalette,
          dithering,
          brightness,
          contrast,
          highQuality: qualityMode === 'high',
          removeBackground
        }
      )

      // 保存生成结果
      setLastGeneratedSettings(currentSettings)
      setLastGeneratedResult(response)
      setResultGridSize(Math.max(gridWidth, gridHeight))
      setHasUnsavedChanges(false)
    } catch (err) {
      if (err?.message === 'CANCELLED') return // 用户主动取消,非错误
      console.error('Quantization failed:', err)
    }
  }, [previewUrl, gridWidth, gridHeight, maxColors, selectedPalette, dithering, brightness, contrast, removeBackground, qualityMode, quantize])

  const handleApply = useCallback(() => {
    if (result) {
      const w = result.width || gridWidth
      const h = result.height || gridHeight
      onApply(result.canvasData, {
        palette: selectedPalette,
        gridSize: Math.max(w, h),
        gridWidth: w,
        gridHeight: h,
        colorStats: result.colorStats
      })
      // 清除未保存状态
      setHasUnsavedChanges(false)
      setLastGeneratedResult(null)
      setLastGeneratedSettings(null)
      onClose()
    }
  }, [result, selectedPalette, gridWidth, gridHeight, onApply, onClose])

  const handleClose = useCallback(() => {
    handleCloseAttempt()
  }, [handleCloseAttempt])

  const palette = getPalette(selectedPalette)

  return (
    <div className="image-quantizer-overlay" onClick={handleClose}>
      <div className="image-quantizer-modal" onClick={e => e.stopPropagation()}>
        <div className="quantizer-header">
          <div className="quantizer-header-title">
            <h2>{t('quantizer.title', '图片转拼豆')}</h2>
            <span className="tech-badge" title={t('quantizer.techBadgeHint')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"/>
                <path d="M19 15l0.8 2.2L22 18l-2.2 0.8L19 21l-0.8-2.2L16 18l2.2-0.8L19 15z"/>
              </svg>
              {t('quantizer.techBadge', 'CIEDE2000 智能配色')}
            </span>
          </div>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>

        {/* 步骤指示条 — 上传 → 设置 → 预览，让流程一目了然 */}
        <div className="quantizer-steps">
          <div className={`step-item ${!previewUrl ? 'active' : 'done'}`}>
            <span className="step-dot">{previewUrl ? '✓' : '1'}</span>
            <span className="step-label">{t('quantizer.stepUpload', '上传图片')}</span>
          </div>
          <div className="step-connector" />
          <div className={`step-item ${previewUrl && !result ? 'active' : result ? 'done' : ''}`}>
            <span className="step-dot">{result ? '✓' : '2'}</span>
            <span className="step-label">{t('quantizer.stepConfigure', '调整设置')}</span>
          </div>
          <div className="step-connector" />
          <div className={`step-item ${result ? 'active' : ''}`}>
            <span className="step-dot">3</span>
            <span className="step-label">{t('quantizer.stepResult', '预览成品')}</span>
          </div>
        </div>

        <div className="quantizer-content">
          <div className="upload-section">
            {!previewUrl ? (
              <div
                className={`upload-zone ${isDragActive ? 'drag-active' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  hidden
                />
                <div className="upload-icon-badge">
                  <span className="upload-icon-ring" />
                  <span className="upload-icon">📷</span>
                </div>
                <p className="upload-main-text">
                  {isDragActive ? t('quantizer.dropActive', '松开鼠标上传图片') : t('quantizer.dragDrop', '拖拽图片到这里')}
                </p>
                <p className="upload-or">{t('quantizer.or', '或')}</p>
                <button className="btn btn-secondary">
                  {t('quantizer.browse', '浏览文件')}
                </button>
                <p className="upload-paste">{t('quantizer.paste', '粘贴图片 (Ctrl+V)')}</p>
              </div>
            ) : (
              <div className="preview-section">
                <div className="preview-image-frame">
                  <img src={previewUrl} alt="Preview" className="preview-image" />
                </div>
                <button
                  className="btn btn-ghost change-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('quantizer.changeImage', '更换图片')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  hidden
                />
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3><span className="settings-icon">⚙</span>{t('quantizer.settings', '量化设置')}</h3>

            <div className="setting-item">
              <label>{t('quantizer.palette', '目标色卡')}</label>
              <select
                value={selectedPalette}
                onChange={e => setSelectedPalette(e.target.value)}
                disabled={isProcessing}
              >
                {PALETTE_LIST.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.colorCount} {t('quantizer.colors', '色')})
                  </option>
                ))}
              </select>
              <span className="setting-hint">
                {palette.origin} · {palette.beadSizeLabel}
              </span>
            </div>

            <div className="setting-item">
              <label>{t('quantizer.gridSize', '画布尺寸')}</label>
              <select
                value={gridPreset}
                onChange={e => {
                  const val = e.target.value
                  setGridPreset(val)
                  const preset = GRID_PRESETS.find(p => p.key === val)
                  if (preset && preset.w) {
                    setGridWidth(preset.w)
                    setGridHeight(preset.h)
                  }
                  // aspect / custom 由 useEffect 或用户手动输入驱动
                }}
                disabled={isProcessing}
              >
                {GRID_PRESETS.map(p => (
                  <option key={p.key} value={p.key}>{t('quantizer.presets.' + p.key)}</option>
                ))}
              </select>
              {gridPreset === 'aspect' && (
                <div className="aspect-mode-inputs">
                  <label style={{ fontSize: 12, color: '#666' }}>
                    {t('quantizer.longSide')}: {longSide}
                  </label>
                  <input
                    type="range"
                    min="29"
                    max="200"
                    value={longSide}
                    onChange={e => setLongSide(Number(e.target.value))}
                    disabled={isProcessing}
                  />
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {previewUrl ? (
                      <>{t('quantizer.actualSize')}: <strong>{gridWidth} × {gridHeight}</strong>（{t('quantizer.aspectRatio')} {imageAspectRatio.toFixed(3)}）</>
                    ) : (
                      <>{t('quantizer.uploadFirst')}</>
                    )}
                  </div>
                </div>
              )}
              {gridPreset === 'custom' && (
                <div className="custom-grid-inputs">
                  <input
                    type="number"
                    min="9"
                    max="200"
                    value={gridWidth}
                    onChange={e => setGridWidth(Math.max(9, Math.min(200, Number(e.target.value))))}
                    disabled={isProcessing}
                    placeholder={t('quantizer.widthPlaceholder')}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    min="9"
                    max="200"
                    value={gridHeight}
                    onChange={e => setGridHeight(Math.max(9, Math.min(200, Number(e.target.value))))}
                    disabled={isProcessing}
                    placeholder={t('quantizer.heightPlaceholder')}
                  />
                </div>
              )}
            </div>

            <div className="setting-item">
              <label>
                {t('quantizer.maxColors', '目标颜色数')}: {maxColors}
                {!hasUserTouchedMaxColors && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>
                    （{t('quantizer.autoRecommended')}）
                  </span>
                )}
              </label>
              <input
                type="range"
                min="4"
                max="96"
                value={maxColors}
                onChange={e => {
                  setMaxColors(Number(e.target.value))
                  setHasUserTouchedMaxColors(true)
                }}
                disabled={isProcessing}
              />
              <div className="range-labels">
                <span>4</span>
                <span>96</span>
              </div>
              <span className="setting-hint">
                {t('quantizer.colorHint')}
              </span>
            </div>

            <div className="setting-item">
              <label>{t('quantizer.algorithm')}</label>
              <select
                value={dithering}
                onChange={e => setDithering(e.target.value)}
                disabled={isProcessing}
              >
                <option value="none">{t('quantizer.dithering.none')}</option>
                <option value="floyd-steinberg">{t('quantizer.dithering.floydSteinberg')}</option>
                <option value="ordered">{t('quantizer.dithering.ordered')}</option>
              </select>
              <span className="setting-hint">
                {t('quantizer.algorithmHint')}
              </span>
            </div>

            <div className="setting-item">
              <label>{t('quantizer.quality')}</label>
              <select
                value={qualityMode}
                onChange={e => setQualityMode(e.target.value)}
                disabled={isProcessing}
              >
                <option value="high">{t('quantizer.qualityModes.high')}</option>
                <option value="fast">{t('quantizer.qualityModes.fast')}</option>
              </select>
              <span className="setting-hint">
                {t('quantizer.qualityHint')}
              </span>
            </div>

            <div className="setting-item">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={removeBackground}
                  onChange={e => setRemoveBackground(e.target.checked)}
                  disabled={isProcessing}
                />
                <span>{t('quantizer.removeBackground')}</span>
              </label>
              <span className="setting-hint">
                {t('quantizer.removeBackgroundHint')}
              </span>
            </div>

            <div className="setting-item">
              <label>
                {t('quantizer.brightness')}: {brightness > 0 ? `+${brightness}` : brightness}
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                value={brightness}
                onChange={e => setBrightness(Number(e.target.value))}
                disabled={isProcessing}
              />
              <div className="range-labels">
                <span>-50</span>
                <span>+50</span>
              </div>
            </div>

            <div className="setting-item">
              <label>
                {t('quantizer.contrast')}: {contrast > 0 ? `+${contrast}` : contrast}
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                value={contrast}
                onChange={e => setContrast(Number(e.target.value))}
                disabled={isProcessing}
              />
              <div className="range-labels">
                <span>-50</span>
                <span>+50</span>
              </div>
            </div>
          </div>

          {isProcessing && (
            <div className="progress-section">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="progress-text">
                {t('quantizer.processing', '处理中')}... {progress}%
                <br />
                <small>{t('quantizer.processingAlgo')}</small>
              </span>
            </div>
          )}

          {error && (
            <div className="error-section">
              <span className="error-text">{error}</span>
            </div>
          )}

          {result && (
            <div className="result-section reveal-in">
              <h3>
                <span className="result-sparkle">✨</span>
                {t('quantizer.preview', '预览')}
                {hasUnsavedChanges && (
                  <span className="settings-changed-warning">（{t('quantizer.settingsChanged')}）</span>
                )}
              </h3>
              <div className="result-preview">
                <canvas
                  ref={canvas => {
                    if (canvas && result.canvasData) {
                      const ctx = canvas.getContext('2d')
                      const displayWidth = result.width || (hasUnsavedChanges ? resultGridSize : gridWidth)
                      const displayHeight = result.height || displayWidth
                      const maxDim = Math.max(displayWidth, displayHeight)

                      // CSS 像素尺寸：长边最大 480px(默认预览格子更大,放大观感更清晰)
                      const cssCell = Math.max(Math.min(480 / maxDim, 10), 4)
                      const cssW = Math.max(displayWidth * cssCell, 200)
                      const cssH = Math.max(displayHeight * cssCell, 200)

                      // 物理像素：Retina 清晰渲染，限 2x 避免 4K 屏爆内存
                      const dpr = Math.min(window.devicePixelRatio || 1, 2)
                      canvas.width = cssW * dpr
                      canvas.height = cssH * dpr
                      canvas.style.width = cssW + 'px'
                      canvas.style.height = cssH + 'px'
                      ctx.scale(dpr, dpr)

                      const cellSize = cssCell

                      ctx.fillStyle = '#e8e8e8'
                      ctx.fillRect(0, 0, cssW, cssH)

                      for (let y = 0; y < displayHeight; y++) {
                        for (let x = 0; x < displayWidth; x++) {
                          const raw = result.canvasData[y]?.[x]
                          const hex = resolveHex(raw)
                          if (hex) {
                            const cx = x * cellSize + cellSize / 2
                            const cy = y * cellSize + cellSize / 2
                            const r = Math.max(cellSize / 2 - 0.5, 1)
                            drawBeadPreview(ctx, cx, cy, r, hex)
                          }
                        }
                      }
                    }
                  }}
                />
                {/* 放大查看:大尺寸纯色方块 + pixelated,放大后每颗珠子清晰锐利 */}
                <button
                  className="result-preview-zoom-btn"
                  onClick={() => setZoomPreview(true)}
                  title={t('quantizer.zoomPreview')}
                  aria-label={t('quantizer.zoomPreview')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7"/>
                    <line x1="21" y1="21" x2="16.5" y2="16.5"/>
                    <line x1="11" y1="8" x2="11" y2="14"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                </button>
              </div>
              <div className="color-summary">
                <span>{t('quantizer.colorsUsed', '使用颜色')}: {Object.keys(result.colorStats).length}</span>
                {dithering !== 'none' && <span className="dithering-badge">{t('quantizer.ditheringApplied')}</span>}
                {hasUnsavedChanges && (
                  <span className="regenerate-hint">{t('quantizer.regenerateHint')}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="quantizer-footer">
          {!result ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isProcessing}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                className={`btn btn-primary btn-generate ${previewUrl && !isProcessing ? 'btn-generate-glow' : ''}`}
                onClick={handleGenerate}
                disabled={!previewUrl || isProcessing}
              >
                {!isProcessing && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"/>
                  </svg>
                )}
                {isProcessing ? `${t('quantizer.processing', '处理中')}…` : t('quantizer.generate', '生成图纸')}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-ghost"
                onClick={handleFullReset}
                disabled={isProcessing}
                style={{ marginRight: 'auto' }}
              >
                {t('quantizer.reset', '重新上传')}
              </button>
              <button
                className={`btn ${hasUnsavedChanges ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handleGenerate}
                disabled={isProcessing}
                title={hasUnsavedChanges ? t('quantizer.paramsChangedHint', '参数已变更，点击按新参数重新生成') : ''}
              >
                {isProcessing
                  ? `${t('quantizer.processing', '处理中')}…`
                  : `${t('quantizer.regenerate', '重新生成')}${hasUnsavedChanges ? ' ●' : ''}`}
              </button>
              <button
                className={`btn ${hasUnsavedChanges ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleApply}
                disabled={isProcessing}
              >
                {t('quantizer.applyToCanvas', '应用到画布')}
              </button>
            </>
          )}
        </div>

        {/* 未保存更改对话框 */}
        {showUnsavedDialog && (
          <div className="modal-overlay" onClick={() => setShowUnsavedDialog(false)}>
            <div className="modal-content unsaved-dialog" onClick={e => e.stopPropagation()}>
              <h3>{t('quantizer.unsavedTitle')}</h3>
              <p>{t('quantizer.unsavedBody')}</p>
              <div className="unsaved-dialog-buttons">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowUnsavedDialog(false)
                    pendingCloseRef.current = false
                  }}
                >
                  {t('quantizer.continueEditing')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleDiscardChanges}
                >
                  {t('quantizer.discardClose')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 放大查看 overlay:大尺寸纯色方块,点击任意处关闭 */}
        {zoomPreview && result && (
          <div className="quantizer-zoom" onClick={() => setZoomPreview(false)}>
            <button className="quantizer-zoom-close" onClick={() => setZoomPreview(false)} aria-label={t('common.close')}>×</button>
            <ZoomPreviewCanvas result={result} resolveHex={resolveHex} />
            <p className="quantizer-zoom-hint">{t('quantizer.zoomHint')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
