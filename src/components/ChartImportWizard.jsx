/**
 * ChartImportWizard — 已有拼豆图纸截图 → 可编辑项目
 *
 * 规格:docs/agent-spec/03 §4B。
 *
 * 流程(全部接真实数据,没有空按钮):
 *   1. 选图 → imageGuard 门控(类型/字节/像素) → 解码到工作分辨率;
 *   2. 自动检测网格(列数/行数/边界),失败时明确说明并允许手动设置;
 *   3. 用户可改列数/行数、在图上拖框重设边界、切换色卡、开关空白识别;
 *   4. 预览按格渲染映射结果;点格子可指定颜色或标记空白(人工修正);
 *   5. 「载入画布编辑」或「保存为我的作品」——保存走 useSavedWorks,
 *      与手绘/JSON 导入共用同一套本地/云端隔离。
 *
 * 算法在 services/chart/*(纯函数,已单测),本组件只做交互与渲染。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Wand2, AlertTriangle, CheckCircle2, Eye, Save, RotateCcw, Eraser, History } from 'lucide-react'
import { useChartImport } from '../hooks/useChartImport'
import { getPalette, PALETTE_LIST } from '../data/palettes'
import { projectToImportWork } from '../services/project/importProject'
import { saveSession, deleteSession } from '../services/project/chartImportStore'
import { CHART_MAX_DIMENSION } from '../services/chart/chartImport'
import { clientToCanvasPoint } from '../services/chart/pointerMapping'
import { useToast } from './Toast'
import './chartImport.css'

/** 结果预览每格像素(内部坐标),随网格大小收缩 */
function cellPixelSize(cols, rows) {
  const longest = Math.max(cols, rows, 1)
  return Math.max(3, Math.min(18, Math.floor(720 / longest)))
}

function hexFor(value) {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : null
}

export default function ChartImportWizard({ onLoadProject, onSaveProject }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { image, detection, fileError, busy, sessionId, restored, imageBlob, loadFile, applyManualBounds, build, reset } = useChartImport()

  const [cols, setCols] = useState(29)
  const [rows, setRows] = useState(29)
  const [paletteId, setPaletteId] = useState('mard')
  const [removeBackground, setRemoveBackground] = useState(true)
  const [overrides, setOverrides] = useState({})
  const [selected, setSelected] = useState(null) // { x, y }
  const [saving, setSaving] = useState(false)
  const [dragRect, setDragRect] = useState(null)
  // 是否从历史会话恢复了修正(仅用于界面提示,不参与逻辑)
  const [restoredFromHistory, setRestoredFromHistory] = useState(false)

  const fileInputRef = useRef(null)
  const sourceCanvasRef = useRef(null)
  const resultCanvasRef = useRef(null)
  const dragStartRef = useRef(null)

  const palette = useMemo(() => getPalette(paletteId), [paletteId])

  // 换图时把网格参数同步为检测值,并清空上一张图的人工修正。
  // 只跟随 image 变化:拖动边界会更新 detection,不能因此清掉用户已改的格子。
  // 若这张图有历史会话,则用历史参数覆盖检测值 —— 用户上次调好的列数/行数
  // 与逐格修正都应原样回来。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只跟随 image 变化同步网格参数;detection 变化(拖动边界)不能清掉用户已改的格子
  useEffect(() => {
    if (!detection) return
    if (Number.isInteger(detection.cols) && detection.cols > 0) setCols(detection.cols)
    if (Number.isInteger(detection.rows) && detection.rows > 0) setRows(detection.rows)
    setOverrides({})
    setSelected(null)
    setRestoredFromHistory(false)

    if (restored) {
      if (Number.isInteger(restored.cols) && restored.cols > 0) setCols(restored.cols)
      if (Number.isInteger(restored.rows) && restored.rows > 0) setRows(restored.rows)
      if (typeof restored.paletteId === 'string' && restored.paletteId) setPaletteId(restored.paletteId)
      if (typeof restored.removeBackground === 'boolean') setRemoveBackground(restored.removeBackground)
      if (restored.overrides && typeof restored.overrides === 'object') {
        setOverrides({ ...restored.overrides })
      }
      setRestoredFromHistory(true)
    }
  }, [image]) // eslint-disable-line react-hooks/exhaustive-deps

  // 换色卡/改参数后,旧的逐格修正可能已不适用:保留但重新映射时仍以用户指定为准
  const result = useMemo(() => {
    if (!image || !detection?.bounds) return null
    return build({
      cols,
      rows,
      paletteColors: palette.colors,
      paletteId,
      removeBackground,
      overrides,
    })
  }, [image, detection, build, cols, rows, palette, paletteId, removeBackground, overrides])

  // 源图预览 + 网格边界。canvas 的 CSS 宽度交给样式表,
  // 指针坐标统一用 getBoundingClientRect 换算,不受显示缩放影响。
  useEffect(() => {
    const canvas = sourceCanvasRef.current
    if (!canvas || !image) return
    const { imageData, width, height } = image
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.putImageData(imageData, 0, 0)

    const bounds = detection?.bounds
    if (!bounds) return
    // 网格线用高对比双色描边,深浅底图都能看见
    ctx.lineWidth = Math.max(1, Math.round(Math.max(width, height) / 600))
    ctx.strokeStyle = 'rgba(232, 115, 74, 0.95)'
    ctx.beginPath()
    const stepX = (bounds.x1 - bounds.x0) / Math.max(1, cols)
    const stepY = (bounds.y1 - bounds.y0) / Math.max(1, rows)
    for (let i = 0; i <= cols; i++) {
      const x = Math.round(bounds.x0 + i * stepX) + 0.5
      ctx.moveTo(x, bounds.y0)
      ctx.lineTo(x, bounds.y1)
    }
    for (let j = 0; j <= rows; j++) {
      const y = Math.round(bounds.y0 + j * stepY) + 0.5
      ctx.moveTo(bounds.x0, y)
      ctx.lineTo(bounds.x1, y)
    }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(74, 155, 142, 0.95)'
    ctx.lineWidth = Math.max(2, Math.round(Math.max(width, height) / 240))
    ctx.strokeRect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0)

    if (dragRect) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.strokeRect(dragRect.x, dragRect.y, dragRect.w, dragRect.h)
      ctx.setLineDash([])
    }
  }, [image, detection, cols, rows, dragRect])

  /* ── 结果预览 ────────────────────────────────────────── */
  useEffect(() => {
    const canvas = resultCanvasRef.current
    if (!canvas || !result?.ok) return
    const cells = result.project.grid.cells
    const w = result.project.grid.width
    const h = result.project.grid.height
    const cell = cellPixelSize(w, h)
    canvas.width = w * cell
    canvas.height = h * cell
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const hex = hexFor(cells[y]?.[x])
        if (!hex) continue
        ctx.fillStyle = hex
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
    // 选中格高亮
    if (selected && cell >= 6) {
      ctx.strokeStyle = '#E8734A'
      ctx.lineWidth = Math.max(1, Math.round(cell / 6))
      ctx.strokeRect(selected.x * cell + 0.5, selected.y * cell + 0.5, cell - 1, cell - 1)
    }
  }, [result, selected])

  /* ── 交互 ────────────────────────────────────────────── */
  const handleFile = useCallback(async (file) => {
    if (!file) return
    await loadFile(file)
  }, [loadFile])

  // 参数或逐格修正变化后,把会话写回 IndexedDB(防抖)。
  // 用防抖而不是每次点击都写:连续改十几格会产生几十次写入,
  // 原图 Blob 每次都要落盘,频繁写会拖慢交互。
  // 写入失败不提示 —— 历史修正是附加能力,不能打断主流程。
  //
  // 卸载时必须补一次立即写入:防抖窗口(600ms)内用户直接切走页面或关标签,
  // 最后一两处修正就丢了 —— 而那恰恰是最容易发生的情形(改完立刻关)。
  const pendingSessionRef = useRef(null)

  useEffect(() => {
    if (!sessionId || !imageBlob || !image) {
      pendingSessionRef.current = null
      return undefined
    }
    const payload = {
      id: sessionId,
      imageBlob,
      name: '',
      state: {
        cols,
        rows,
        paletteId,
        removeBackground,
        bounds: detection?.bounds || null,
        overrides,
      },
    }
    pendingSessionRef.current = payload
    const timer = setTimeout(() => {
      saveSession(payload)
      pendingSessionRef.current = null
    }, 600)
    return () => clearTimeout(timer)
  }, [sessionId, imageBlob, image, cols, rows, paletteId, removeBackground, detection, overrides])

  // 卸载补写:只在确实有未落盘改动时执行一次
  useEffect(() => () => {
    const pending = pendingSessionRef.current
    if (pending) saveSession(pending)
  }, [])

  const handleDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer?.files?.[0])
  }

  const handleResultClick = (e) => {
    if (!result?.ok) return
    const canvas = resultCanvasRef.current
    const w = result.project.grid.width
    const h = result.project.grid.height
    // 预览是 object-fit:contain 的非等比缩放,必须按内容区换算;
    // 点在外侧留白里返回 null,不改当前选中格
    const p = clientToCanvasPoint(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height)
    if (!p) return
    const x = Math.floor((p.x / canvas.width) * w)
    const y = Math.floor((p.y / canvas.height) * h)
    if (x < 0 || y < 0 || x >= w || y >= h) return
    setSelected({ x, y })
  }

  const toImagePoint = (e) => {
    const canvas = sourceCanvasRef.current
    // 原图预览同样是 contain 布局:拖框起点落在留白里时夹到最近的边缘,
    // 否则用户从图边外侧开始拖会整个失效;终点也夹住,避免拖出图片后边界为负
    return clientToCanvasPoint(
      e.clientX,
      e.clientY,
      canvas.getBoundingClientRect(),
      canvas.width,
      canvas.height,
      { clamp: true },
    )
  }

  const handleSourcePointerDown = (e) => {
    if (!image) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragStartRef.current = toImagePoint(e)
    setDragRect({ x: dragStartRef.current.x, y: dragStartRef.current.y, w: 0, h: 0 })
  }

  const handleSourcePointerMove = (e) => {
    const start = dragStartRef.current
    if (!start) return
    const p = toImagePoint(e)
    setDragRect({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    })
  }

  const handleSourcePointerUp = () => {
    const start = dragStartRef.current
    dragStartRef.current = null
    const rect = dragRect
    setDragRect(null)
    if (!start || !rect || !image) return
    // 太小的拖拽视为误触,不改边界
    if (rect.w < image.width * 0.05 || rect.h < image.height * 0.05) return
    applyManualBounds({
      x0: Math.round(rect.x),
      y0: Math.round(rect.y),
      x1: Math.round(rect.x + rect.w),
      y1: Math.round(rect.y + rect.h),
    })
  }

  const setOverride = (value) => {
    if (!selected) return
    setOverrides((prev) => ({ ...prev, [`${selected.x},${selected.y}`]: value }))
  }

  const clearOverride = () => {
    if (!selected) return
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[`${selected.x},${selected.y}`]
      return next
    })
  }

  const handleSave = async () => {
    if (!result?.ok || !onSaveProject || saving) return
    setSaving(true)
    try {
      const work = projectToImportWork(result.project)
      const ok = await onSaveProject(work)
      if (ok) {
        toast(t('chartImport.saved'), 'success')
        // 作品已落库,识别会话的历史使命结束:留着只会占空间,
        // 且下次重新选同一张图会莫名其妙带回上一份修正。
        if (sessionId) await deleteSession(sessionId)
        reset()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleLoad = () => {
    if (!result?.ok || !onLoadProject) return
    onLoadProject(result.project)
  }

  const selectedHex = selected && result?.ok
    ? hexFor(result.project.grid.cells[selected.y]?.[selected.x])
    : null

  /* ── 渲染 ────────────────────────────────────────────── */
  if (!image) {
    return (
      <section
        className="chart-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
        aria-label={t('chartImport.chooseImage')}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="chart-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            handleFile(file)
          }}
        />
        <ImagePlus size={30} className="chart-drop-icon" />
        <span className="chart-drop-main">{t('chartImport.chooseImage')}</span>
        <span className="chart-drop-hint">{t('chartImport.dropHint')}</span>
        {busy && <span className="chart-drop-busy">{t('chartImport.detecting')}</span>}
        {fileError && (
          <span className="chart-drop-error" role="alert">
            {t(`quantizer.errors.${fileError}`, t('chartImport.decodeFailed'))}
          </span>
        )}
      </section>
    )
  }

  const detectFailed = detection && detection.status === 'failed'
  const lowConfidence = detection && detection.status === 'low-confidence'

  return (
    <section className="chart-wizard">
      {/* 识别状态 */}
      {restoredFromHistory && (
        <div className="chart-banner ok" role="status">
          <History size={16} />
          <span>{t('chartImport.restoredHistory', { n: Object.keys(overrides).length })}</span>
        </div>
      )}
      {detectFailed && (
        <div className="chart-banner warning" role="status">
          <AlertTriangle size={16} />
          <span>{t('chartImport.detectFailed')}</span>
        </div>
      )}
      {lowConfidence && (
        <div className="chart-banner warning" role="status">
          <AlertTriangle size={16} />
          <span>{t('chartImport.lowConfidence', { confidence: Math.round((detection.confidence || 0) * 100) })}</span>
        </div>
      )}
      {!detectFailed && !lowConfidence && result?.ok && (
        <div className="chart-banner ok" role="status">
          <CheckCircle2 size={16} />
          <span>{t('chartImport.detected', { cols: result.project.grid.width, rows: result.project.grid.height })}</span>
        </div>
      )}

      {/* 参数 */}
      <div className="chart-controls">
        <label className="chart-field">
          <span>{t('chartImport.cols')}</span>
          <input
            type="number"
            min={2}
            max={CHART_MAX_DIMENSION}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
          />
        </label>
        <label className="chart-field">
          <span>{t('chartImport.rows')}</span>
          <input
            type="number"
            min={2}
            max={CHART_MAX_DIMENSION}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
        </label>
        <label className="chart-field">
          <span>{t('chartImport.palette')}</span>
          <select value={paletteId} onChange={(e) => setPaletteId(e.target.value)}>
            {PALETTE_LIST.map((p) => (
              <option key={p.id} value={p.id}>{p.nameZh || p.name}</option>
            ))}
          </select>
        </label>
        <label className="chart-check">
          <input
            type="checkbox"
            checked={removeBackground}
            onChange={(e) => setRemoveBackground(e.target.checked)}
          />
          <span>{t('chartImport.removeBackground')}</span>
        </label>
      </div>

      <p className="chart-tip">{t('chartImport.cropHint')}</p>

      {/* 双预览 */}
      <div className="chart-previews">
        <figure className="chart-preview">
          <figcaption>{t('chartImport.sourcePreview')}</figcaption>
          <canvas
            ref={sourceCanvasRef}
            className="chart-source-canvas"
            onPointerDown={handleSourcePointerDown}
            onPointerMove={handleSourcePointerMove}
            onPointerUp={handleSourcePointerUp}
            onPointerCancel={handleSourcePointerUp}
          />
        </figure>
        <figure className="chart-preview">
          <figcaption>{t('chartImport.resultPreview')}</figcaption>
          {result?.ok ? (
            <canvas
              ref={resultCanvasRef}
              className="chart-result-canvas"
              onClick={handleResultClick}
            />
          ) : (
            <div className="chart-result-empty">
              <AlertTriangle size={16} />
              <span>{t('chartImport.previewUnavailable')}</span>
            </div>
          )}
        </figure>
      </div>

      {/* 统计 */}
      {result?.ok && (
        <dl className="chart-stats">
          <div><dt>{t('chartImport.size')}</dt><dd>{result.project.grid.width} × {result.project.grid.height}</dd></div>
          <div><dt>{t('chartImport.colors')}</dt><dd>{result.stats.colorCount}</dd></div>
          <div><dt>{t('chartImport.beads')}</dt><dd>{result.stats.beadCount}</dd></div>
          <div><dt>{t('chartImport.blanks')}</dt><dd>{result.stats.blankCount}</dd></div>
          <div className={result.stats.uncertainCount > 0 ? 'warn' : ''}>
            <dt>{t('chartImport.uncertain')}</dt>
            <dd>{result.stats.uncertainCount}</dd>
          </div>
        </dl>
      )}
      {result?.ok && result.stats.uncertainCount > 0 && (
        <p className="chart-tip warn">{t('chartImport.uncertainHint', { n: result.stats.uncertainCount })}</p>
      )}

      {/* 逐格修正 */}
      {result?.ok && (
        <div className="chart-correction">
          <div className="chart-correction-head">
            <strong>{t('chartImport.correctionTitle')}</strong>
            <span className="chart-selected">
              {selected
                ? `${t('chartImport.selectedCell')}: (${selected.x + 1}, ${selected.y + 1}) ${selectedHex || t('chartImport.blank')}`
                : t('chartImport.pickCell')}
            </span>
          </div>
          {selected && (
            <>
              <div className="chart-correction-actions">
                <button type="button" className="chart-btn ghost" onClick={() => setOverride(null)}>
                  <Eraser size={14} />{t('chartImport.markBlank')}
                </button>
                <button type="button" className="chart-btn ghost" onClick={clearOverride}>
                  <RotateCcw size={14} />{t('chartImport.restoreAuto')}
                </button>
              </div>
              <div className="chart-swatches" role="listbox" aria-label={t('chartImport.pickColor')}>
                {palette.colors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chart-swatch"
                    style={{ background: c.hex }}
                    title={`${c.id} ${c.nameZh || c.name} ${c.hex}`}
                    aria-label={`${c.id} ${c.hex}`}
                    onClick={() => setOverride(c.hex)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 操作 */}
      <div className="chart-actions">
        <button
          type="button"
          className="chart-btn ghost"
          onClick={() => { reset(); setOverrides({}); setSelected(null); setRestoredFromHistory(false) }}
        >
          {t('chartImport.reselect')}
        </button>
        <button
          type="button"
          className="chart-btn secondary"
          onClick={handleLoad}
          disabled={!result?.ok}
        >
          <Eye size={15} />{t('chartImport.loadToCanvas')}
        </button>
        {onSaveProject && (
          <button
            type="button"
            className="chart-btn primary"
            onClick={handleSave}
            disabled={!result?.ok || saving}
          >
            {saving ? <Wand2 size={15} /> : <Save size={15} />}
            {saving ? t('common.loading') : t('chartImport.saveAsWork')}
          </button>
        )}
      </div>

      <p className="chart-storage-hint">{t('chartImport.storageHint')}</p>
      <p className="chart-storage-hint">{t('chartImport.historyHint')}</p>
    </section>
  )
}
