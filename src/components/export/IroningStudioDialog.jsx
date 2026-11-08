import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { getPalette } from '../../data/palettes'
import { normalizeCellsToHex } from '../../services/colorUtils'
import { createPatternDocument } from '../../services/export/PatternDocument'
import { renderIroningEffect } from '../../services/export/IroningEffectRenderer'
import { IRONING_EFFECT_PRESETS, DEFAULT_IRONING_PRESET_ID } from '../../services/export/ironingEffectPresets'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useDialogA11y } from '../../hooks/useDialogA11y'

/** 图案变更后的防抖:连续绘制时不逐笔触发预览重渲染 */
const PREVIEW_DEBOUNCE_MS = 250

/**
 * IroningStudioDialog — 「高级熨烫效果」全屏工作室。
 *
 * 为什么独立成浮层而不是留在导出面板里:六种材质要靠「成品样张」选,
 * 熔融预览要看得清细节,导出面板的侧栏宽度两者都放不下。这里给
 * 2 列多行的材质样张墙(图取自 references 实拍样片的裁剪版)+ 大幅
 * 实时预览,导出仍走父级确认流程(requestExport)。
 *
 * 职责边界(与旧 IroningEffectSection 相同):
 *   - presetId 是临时 UI 状态,不写入任何持久化数据;
 *   - 预览与导出共用同一渲染器(仅 mode 不同),杜绝「预览≠成品」;
 *   - Object URL 生命周期:替换撤销旧 URL,卸载/关闭时撤销当前 URL。
 */
export default function IroningStudioDialog({
  open,
  onClose,
  canvasData,
  gridSize,
  gridWidth,
  gridHeight,
  paletteId = 'perler',
  designName,
  // 导出进行中(父级共享状态):禁用材质切换与导出按钮,防止并发导出
  isExporting = false,
  /** (presetId) => void — 父级接入 requestExport 确认流程 */
  onRequestExport,
}) {
  const { t } = useTranslation()
  const [presetId, setPresetId] = useState(DEFAULT_IRONING_PRESET_ID)
  const [retryNonce, setRetryNonce] = useState(0)
  const [previewUrl, setPreviewUrl] = useState(null)
  // idle:未打开;loading;ready;error;empty(整张图纸没有已绘制格子)
  const [previewState, setPreviewState] = useState('idle')

  useScrollLock(open)

  const { ref, dialogProps } = useDialogA11y({
    open,
    onClose,
    label: t('export.ironing.studioTitle'),
    // 工作室承载材质选择与实时预览的半成品状态:遮罩点击与 Escape 都不关闭,
    // 只允许右上角关闭按钮退出,避免误触丢失正在调整的材质选择
    dismissible: false,
  })

  const preset = useMemo(
    () => IRONING_EFFECT_PRESETS.find(p => p.id === presetId) || IRONING_EFFECT_PRESETS[0],
    [presetId]
  )

  const hasPaintedCells = useMemo(
    () => Boolean(canvasData?.some(row => row.some(cell => cell))),
    [canvasData]
  )

  // 历史作品的品牌色号('P18')在构建文档时归一为 hex —— 渲染器只认 hex
  const palette = useMemo(() => getPalette(paletteId), [paletteId])

  // Object URL 生命周期:替换时撤销旧 URL;卸载、关闭或空态时也撤销
  const previewUrlRef = useRef(null)
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    []
  )

  // 预览渲染:打开 + 材质/图纸变化 → 防抖后构建文档并渲染
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryNonce 是「重试」触发器,刻意不参与渲染参数
  useEffect(() => {
    if (!open || !hasPaintedCells) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      setPreviewUrl(null)
      setPreviewState(open ? 'empty' : 'idle')
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
      // 已发出的渲染也要中止:大图预览不能在切换材质/关闭后继续空转
      controller.abort()
    }
  }, [
    open,
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

  if (!open) return null

  const handleRetry = () => setRetryNonce(n => n + 1)

  // 导出交给父级确认流程:工作室保持打开,父级确认框(1200)盖在本层(1190)之上,
  // 取消导出时用户直接回到工作室继续挑材质
  const handleExport = () => {
    onRequestExport?.(presetId)
  }

  return createPortal(
    // 遮罩不承担关闭职责(防误触退出丢失工作状态):退出只走右上角关闭按钮
    <div className="ironing-studio-overlay">
      <section className="ironing-studio-panel" ref={ref} {...dialogProps} onClick={e => e.stopPropagation()}>
        <header className="ironing-studio-head">
          <div className="ironing-studio-heading">
            <h3>{t('export.ironing.studioTitle')}</h3>
            <p>{t('export.ironing.studioSubtitle')}</p>
          </div>
          <button
            type="button"
            className="ironing-studio-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="ironing-studio-body">
          <div className="ironing-studio-preview">
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
            <div className="ironing-studio-preview-meta">
              <span className="ironing-studio-material">
                {t('export.ironing.selectedMaterial', { material: t(preset.labelKey) })}
              </span>
              <span className="setting-hint">{t(preset.hintKey)}</span>
            </div>
          </div>

          <div className="ironing-studio-styles" role="group" aria-label={t('export.ironing.stylesLabel')}>
            {IRONING_EFFECT_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                className={`ironing-style-card${p.id === presetId ? ' active' : ''}`}
                aria-pressed={p.id === presetId}
                // accessible name 只保留材质名:卡内的样张说明文字不进读屏名,
                // 也不影响按名查找(ExportPanel 测试用精确名定位)
                aria-label={t(p.labelKey)}
                disabled={isExporting}
                onClick={() => setPresetId(p.id)}
              >
                <span className="ironing-style-thumb">
                  <img src={p.showcaseImage} alt="" loading="lazy" />
                </span>
                <span className="ironing-style-name">{t(p.labelKey)}</span>
                <span className="ironing-style-hint">{t(p.hintKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 读屏播报:预览状态变化走 aria-live;独立节点,不包可交互元素 */}
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

        <footer className="ironing-studio-foot">
          <span className="setting-hint">{t('export.ironing.exportDescription')}</span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isExporting || previewState === 'empty'}
            onClick={handleExport}
          >
            {t('export.ironing.exportPng')}
          </button>
        </footer>
      </section>

      <style>{`
        .ironing-studio-panel {
          width: min(1080px, 100%);
          max-height: 100%;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-card, 14px);
          padding: 20px;
          box-shadow: 0 24px 80px rgba(43, 36, 32, 0.28);
        }
        .ironing-studio-head {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .ironing-studio-heading { min-width: 0; }
        .ironing-studio-heading h3 {
          margin: 0 0 2px;
          font-size: var(--text-xl);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }
        .ironing-studio-heading p {
          margin: 0;
          font-size: var(--text-sm);
          color: var(--text-muted);
        }
        .ironing-studio-close {
          margin-left: auto;
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
        }
        .ironing-studio-close:hover { color: var(--text-primary); border-color: var(--text-secondary); }
        .ironing-studio-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 14px;
        }
        @media (min-width: 900px) {
          /* 面板高度锁在视口内:预览区连同底部「当前材质」说明始终完整可见,
             不再依赖面板整体滚动去找下半截 */
          .ironing-studio-panel { overflow: hidden; }
          .ironing-studio-body {
            grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
            /* 行高跟随面板剩余空间伸缩(不是内容高度):两列等高,
               左列预览 + 材质说明按可用高度整体收缩 */
            grid-template-rows: minmax(0, 1fr);
            align-items: stretch;
            flex: 1 1 auto;
            min-height: 0;
          }
          /* 样张墙放不下时只在右列内部滚动,左列预览不被挤出视口 */
          .ironing-studio-styles {
            overflow-y: auto;
            min-height: 0;
            /* 滚动条贴着内容列右缘,不盖卡片 */
            padding-right: 2px;
          }
          .ironing-studio-preview { min-height: 0; }
          /* 极矮窗口(横屏/小笔记本):预览可以再压一点,保证材质说明不被裁掉 */
          .ironing-preview { min-height: 160px; }
        }
        .ironing-studio-preview {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
          height: 100%;
        }
        .ironing-studio-preview-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ironing-studio-material {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }
        /* ── 材质样张墙:2 列多行,实拍样片裁剪图作为材质入口 ── */
        .ironing-studio-styles {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .ironing-style-card {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          padding: 8px;
          text-align: left;
          background: var(--bg-secondary);
          border: 1.5px solid var(--border-color);
          border-radius: 12px;
          cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ironing-style-card:hover { border-color: var(--text-secondary); }
        .ironing-style-card.active {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent);
        }
        .ironing-style-card:disabled { opacity: 0.55; cursor: not-allowed; }
        .ironing-style-thumb {
          display: block;
          border-radius: 8px;
          overflow: hidden;
          aspect-ratio: 2 / 1;
          background: var(--bg-tertiary);
        }
        .ironing-style-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .ironing-style-name {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          color: var(--text-primary);
        }
        .ironing-style-hint {
          font-size: var(--text-xs);
          color: var(--text-muted);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ironing-studio-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ironing-preview {
          /* 占满左列除材质说明外的全部高度(父级 flex 列里弹性伸展) */
          position: relative;
          flex: 1 1 auto;
          min-height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
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
          /* 绝对定位铺满预览框,等比缩放不裁切:框多大图就多大,
             跟随右侧样张墙高度自适应,不再受固定 max-height 限制 */
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          padding: 10px;
          box-sizing: border-box;
          object-fit: contain;
          display: block;
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
        @media (max-width: 640px) {
          .ironing-studio-panel { padding: 14px; }
          /* 单列布局没有样张墙撑高:给预览一个稳定的可视高度 */
          .ironing-preview { min-height: 260px; }
        }
      `}</style>
    </div>,
    document.body
  )
}
