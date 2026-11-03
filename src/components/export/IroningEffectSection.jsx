import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPalette } from '../../data/palettes'
import { normalizeCellsToHex } from '../../services/colorUtils'
import { createPatternDocument } from '../../services/export/PatternDocument'
import { renderIroningEffect } from '../../services/export/IroningEffectRenderer'
import { IRONING_EFFECT_PRESETS, DEFAULT_IRONING_PRESET_ID } from '../../services/export/ironingEffectPresets'

/** 图案变更后的防抖:连续绘制时不逐笔触发预览重渲染 */
const PREVIEW_DEBOUNCE_MS = 250

/**
 * IroningEffectSection — 「高级熨烫效果」预览与导出区块(规格 08 §4)。
 *
 * 职责边界(03 文档):
 *   - 只负责材质选择、预览生命周期(Object URL 创建/替换/撤销、进行中渲染的取消)
 *     和导出按钮的发起;下载、确认框、库存记账全部由父级 ExportPanel 处理;
 *   - presetId 只是本区块内的 UI 临时状态,不写入任何持久化数据;
 *   - 预览与导出共用同一渲染器(仅 mode 不同),杜绝「预览≠成品」。
 */
export default function IroningEffectSection({
  canvasData,
  gridSize,
  gridWidth,
  gridHeight,
  paletteId = 'perler',
  designName,
  // 导出进行中(父级共享状态):禁用材质切换与导出按钮,防止并发导出
  isExporting = false,
  // 高级导出守卫:游客不可展开/预览/导出,点击入口改为打开登录引导
  locked = false,
  onRequireAuth,
  /** (presetId) => void — 父级接入 requestExport 确认流程 */
  onRequestExport,
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [presetId, setPresetId] = useState(DEFAULT_IRONING_PRESET_ID)
  const [retryNonce, setRetryNonce] = useState(0)
  const [previewUrl, setPreviewUrl] = useState(null)
  // idle:未展开;loading;ready;error;empty(整张图纸没有已绘制格子)
  const [previewState, setPreviewState] = useState('idle')

  const preset = useMemo(
    () => IRONING_EFFECT_PRESETS.find(p => p.id === presetId) || IRONING_EFFECT_PRESETS[0],
    [presetId]
  )

  const hasPaintedCells = useMemo(
    () => Boolean(canvasData?.some(row => row.some(cell => cell))),
    [canvasData]
  )

  // 历史作品的品牌色号('P18')在构建文档时归一为 hex —— 渲染器只认 hex,
  // 不能把可解析的旧数据当成空格丢掉。
  const palette = useMemo(() => getPalette(paletteId), [paletteId])

  // Object URL 生命周期:替换时撤销旧 URL;卸载、折叠或空态时也撤销。
  const previewUrlRef = useRef(null)
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    []
  )

  // 预览渲染:展开 + 材质/图纸变化 → 防抖后构建文档并渲染。
  // 文档构建放在防抖之后:区块折叠时完全不构建(此前每个提交笔画都会做
  // 两次全网格扫描,折叠状态下白付成本)。
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryNonce 是「重试」触发器,刻意不参与渲染参数
  useEffect(() => {
    if (!expanded || locked || !hasPaintedCells) {
      // 折叠或图纸变空:释放旧预览,blob URL 不常驻
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      setPreviewUrl(null)
      setPreviewState(expanded && !locked ? 'empty' : 'idle')
      return undefined
    }
    let cancelled = false
    const controller = new AbortController()
    setPreviewState('loading')
    const timer = setTimeout(async () => {
      try {
        const doc = createPatternDocument({
          canvasData: normalizeCellsToHex(canvasData, palette),
          gridSize,
          gridWidth,
          gridHeight,
          paletteId,
          designName: designName || '',
          palette,
        })
        const { blob } = await renderIroningEffect(doc, {
          presetId,
          mode: 'preview',
          signal: controller.signal,
        })
        const url = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = url
        setPreviewUrl(url)
        setPreviewState('ready')
      } catch (err) {
        if (err?.name === 'AbortError' || cancelled) return
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current)
          previewUrlRef.current = null
        }
        setPreviewUrl(null)
        setPreviewState('error')
      }
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      // 已发出的渲染也要中止:大图预览不能在切换材质/关闭区块后继续空转
      controller.abort()
    }
  }, [
    expanded,
    locked,
    presetId,
    canvasData,
    gridSize,
    gridWidth,
    gridHeight,
    paletteId,
    designName,
    palette,
    hasPaintedCells,
    retryNonce,
  ])

  const handleRetry = () => setRetryNonce(n => n + 1)

  return (
    <div className="export-section ironing-section">
      <style>{`
        .ironing-toggle {
          width: 100%;
          display: flex;
          align-items: baseline;
          gap: 6px;
          text-align: left;
          background: none;
          border: none;
          padding: 4px 2px;
          cursor: pointer;
        }
        .ironing-toggle:hover .section-title {
          color: var(--text-primary);
        }
        .ironing-toggle .arrow {
          margin-left: auto;
          font-size: var(--text-xs);
          transition: transform 0.2s;
        }
        .ironing-toggle .arrow.up {
          transform: rotate(180deg);
        }
        .ironing-lock {
          flex: none;
          padding: 1px 6px;
          border: 1px solid var(--border-color);
          border-radius: 999px;
          font-size: 10px;
          color: var(--text-muted);
          background: var(--bg-secondary);
        }
        .ironing-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 6px;
        }
        .ironing-material-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
        }
        .ironing-material-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 8px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .ironing-material-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ironing-material-btn.active {
          border-color: var(--secondary-accent);
          background: var(--bg-tertiary);
          font-weight: var(--font-weight-semibold);
        }
        .ironing-swatch {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          border: 1px solid var(--border-color);
          flex: none;
        }
        .ironing-material-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ironing-preview {
          min-height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
        }
        .ironing-placeholder {
          font-size: var(--text-xs);
          color: var(--text-muted);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 12px;
          text-align: center;
        }
        .ironing-retry {
          padding: 4px 12px;
          font-size: var(--text-xs);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          cursor: pointer;
        }
        .ironing-preview-img {
          max-width: 100%;
          max-height: 320px;
          object-fit: contain;
        }
        .ironing-export-btn {
          width: 100%;
        }
        .ironing-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>

      <button
        type="button"
        className="section-heading ironing-toggle"
        aria-expanded={locked ? false : expanded}
        aria-label={locked ? t('auth.gate.ironingTitle') : expanded ? t('export.ironing.collapse') : t('export.ironing.expand')}
        onClick={() => {
          if (locked) {
            onRequireAuth?.()
            return
          }
          setExpanded(v => !v)
        }}
      >
        <span className="section-title">{t('export.ironing.title')}</span>
        {locked && <span className="ironing-lock">{t('auth.gate.locked')}</span>}
        <span className="section-hint">{t('export.ironing.description')}</span>
        <span className={`arrow ${expanded ? 'up' : ''}`} aria-hidden="true">
          ▼
        </span>
      </button>

      {expanded && !locked && (
        <div className="ironing-body">
          <div className="ironing-material-grid" role="group" aria-label={t('export.ironing.title')}>
            {IRONING_EFFECT_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                className={`ironing-material-btn ${p.id === presetId ? 'active' : ''}`}
                aria-pressed={p.id === presetId}
                disabled={isExporting}
                onClick={() => setPresetId(p.id)}
              >
                <span className="ironing-swatch" style={{ background: p.swatchColor }} aria-hidden="true" />
                <span className="ironing-material-label">{t(p.labelKey)}</span>
              </button>
            ))}
          </div>
          <span className="setting-hint">{t(preset.hintKey)}</span>

          <div className="ironing-preview" data-state={previewState}>
            {previewState === 'empty' && (
              <div className="ironing-placeholder">{t('export.ironing.empty')}</div>
            )}
            {previewState === 'loading' && (
              <div className="ironing-placeholder">{t('export.ironing.previewLoading')}</div>
            )}
            {previewState === 'error' && (
              <div className="ironing-placeholder">
                <span>{t('export.ironing.previewFailed')}</span>
                <button type="button" className="ironing-retry" onClick={handleRetry}>
                  {t('export.ironing.retry')}
                </button>
              </div>
            )}
            {previewState === 'ready' && previewUrl && (
              <img
                className="ironing-preview-img"
                src={previewUrl}
                alt={t('export.ironing.previewAlt', { material: t(preset.labelKey) })}
              />
            )}
          </div>

          {/* 读屏播报:预览状态变化走 aria-live;放在独立节点上,不包可交互元素 */}
          <span className="ironing-sr-only" role="status" aria-live="polite">
            {previewState === 'loading'
              ? t('export.ironing.previewLoading')
              : previewState === 'error'
                ? t('export.ironing.previewFailed')
                : previewState === 'empty'
                  ? t('export.ironing.empty')
                  : previewState === 'ready'
                    ? t('export.ironing.selectedMaterial', { material: t(preset.labelKey) })
                    : ''}
          </span>

          <button
            type="button"
            className="btn btn-secondary ironing-export-btn"
            disabled={isExporting || previewState === 'empty'}
            onClick={() => onRequestExport?.(presetId)}
          >
            {t('export.ironing.exportPng')}
          </button>
          <span className="setting-hint">{t('export.ironing.exportDescription')}</span>
        </div>
      )}
    </div>
  )
}
