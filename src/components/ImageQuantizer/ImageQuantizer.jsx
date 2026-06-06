import { useState, useCallback, useRef, useEffect } from 'react'
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

const GRID_PRESETS = [
  { key: '29x29',   label: '29 × 29（标准）',          w: 29,  h: 29  },
  { key: '57x57',   label: '57 × 57（大图）',          w: 57,  h: 57  },
  { key: '114x114', label: '114 × 114（超大）',        w: 114, h: 114 },
  { key: '140x140', label: '140 × 140（专业站）',      w: 140, h: 140 },
  { key: '57x29',   label: '57 × 29（横幅）',          w: 57,  h: 29  },
  { key: '29x57',   label: '29 × 57（竖幅）',          w: 29,  h: 57  },
  { key: 'aspect',  label: '按原图比例（指定长边）',   w: null, h: null, aspect: true },
  { key: 'custom',  label: '自定义宽×高',              w: null, h: null },
]

export default function ImageQuantizer({ onApply, onClose }) {
  const { t } = useTranslation()
  const { isProcessing, progress, result, error, quantize, reset } = useImageQuantizer()

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
          <h2>{t('quantizer.title', '图片转拼豆')}</h2>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>

        <div className="quantizer-content">
          <div className="upload-section">
            {!previewUrl ? (
              <div
                className="upload-zone"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  hidden
                />
                <div className="upload-icon">📷</div>
                <p>{t('quantizer.dragDrop', '拖拽图片到这里')}</p>
                <p className="upload-or">{t('quantizer.or', '或')}</p>
                <button className="btn btn-secondary">
                  {t('quantizer.browse', '浏览文件')}
                </button>
                <p className="upload-paste">{t('quantizer.paste', '粘贴图片 (Ctrl+V)')}</p>
              </div>
            ) : (
              <div className="preview-section">
                <img src={previewUrl} alt="Preview" className="preview-image" />
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
            <h3>{t('quantizer.settings', '量化设置')}</h3>

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
            <div className="result-section">
              <h3>
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

                      // CSS 像素尺寸：长边最大 400px
                      const cssCell = Math.max(Math.min(400 / maxDim, 10), 3)
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

                      // 构建 id→hex 查找表（支持品牌 ID 和 hex 两种格式）
                      const colorMap = {}
                      if (result.quantizedColors) {
                        for (const c of result.quantizedColors) {
                          colorMap[c.id] = c.hex || c.id
                        }
                      }

                      const resolveHex = (v) => {
                        if (!v) return null
                        if (typeof v === 'string' && v.startsWith('#')) {
                          // Validate it's a real hex before returning
                          const test = parseInt(v.slice(1), 16)
                          return isNaN(test) ? null : v
                        }
                        const resolved = colorMap[v]
                        if (resolved && typeof resolved === 'string' && resolved.startsWith('#')) {
                          const test = parseInt(resolved.slice(1), 16)
                          return isNaN(test) ? null : resolved
                        }
                        return null  // Don't pass brand IDs to canvas
                      }

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
                className="btn btn-primary"
                onClick={handleGenerate}
                disabled={!previewUrl || isProcessing}
              >
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
      </div>
    </div>
  )
}
