/**
 * MatchWorkspace — 图纸匹配与替色(重构规格 §6)。
 *
 * 三段式:选择目标色卡 → 检查匹配与库存 → 预览并应用。
 * 不是不可返回的向导:任何控件改动都立即重算,用户可随时改参数。
 *
 * 预览隔离:预览矩阵由 mappingPreview 从已接受项临时生成,
 * 真实 canvasData 只有点击「应用」并回调 onApply 时才改变。
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette as PaletteIcon, ShoppingCart, AlertTriangle, ArrowLeft, Copy, Plus } from 'lucide-react'
import ThumbnailCanvas from '../../components/ThumbnailCanvas'
import {
  COLOR_STATUS,
  MAPPING_STATUS,
  STOCK_STATUS,
  buildShoppingList,
  matchCanvasToInventory,
} from '../../services/beads/inventoryMatch'
import { buildMappingPreview, acceptedEntries } from './mappingPreview'
import {
  THRESHOLD_PRESETS,
  resolveThreshold,
  thresholdPresetId,
} from './paletteOptions'

const COLOR_STATUS_KEY = {
  [COLOR_STATUS.EXACT]: 'myBeads.match.status.exact',
  [COLOR_STATUS.CLOSE]: 'myBeads.match.status.close',
  [COLOR_STATUS.POOR]: 'myBeads.match.status.poor',
  [COLOR_STATUS.MISSING]: 'myBeads.match.status.missing',
}

const STOCK_STATUS_KEY = {
  [STOCK_STATUS.UNKNOWN]: 'myBeads.match.status.unknownInventory',
  [STOCK_STATUS.SUFFICIENT]: 'myBeads.match.stockSufficient',
  [STOCK_STATUS.SHORTAGE]: 'myBeads.match.stockShortage',
  [STOCK_STATUS.OUT_OF_STOCK]: 'myBeads.match.stockOut',
}

const TONE = {
  [COLOR_STATUS.EXACT]: 'exact',
  [COLOR_STATUS.CLOSE]: 'close',
  [COLOR_STATUS.POOR]: 'poor',
  [COLOR_STATUS.MISSING]: 'missing',
}

/**
 * 「什么时候用得上」—— 三句话说明使用场景。
 *
 * 这个页面原来的标题是「把当前图纸匹配到色卡」,只在描述操作,
 * 没说清楚它在什么情境下有用,新用户进来只会看到一堆阈值/替色控件。
 * 场景说明放在标题下方(以及无图纸的空状态里),先回答「我为什么要用它」。
 */
function WhenToUse({ t }) {
  return (
    <div className="match-when">
      <h3>{t('myBeads.match.whenTitle')}</h3>
      <ul>
        <li>{t('myBeads.match.when1')}</li>
        <li>{t('myBeads.match.when2')}</li>
        <li>{t('myBeads.match.when3')}</li>
      </ul>
    </div>
  )
}

export default function MatchWorkspace({
  canvasData,
  builtinPalettes,
  userPalettes,
  colorsByPalette,
  inventoryByKey,
  source,
  targetId,
  onSourceChange,
  onBackToCanvas,
  onGoManageColors,
  onGoInventory,
  onCopyBuiltin,
  onNewPalette,
  onApply,
  busy,
}) {
  const { t } = useTranslation()
  const [requiredSize, setRequiredSize] = useState('')
  const [sizeCustom, setSizeCustom] = useState(false)
  const [thresholdRaw, setThresholdRaw] = useState(String(6))
  const [overrides, setOverrides] = useState({})
  const [accepted, setAccepted] = useState({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  const threshold = resolveThreshold(thresholdRaw, 6)

  // 目标色卡候选
  const targetPalette = useMemo(() => {
    if (source === 'builtin') return builtinPalettes.find((p) => p.id === targetId) || null
    return userPalettes.find((p) => p.id === targetId) || null
  }, [source, targetId, builtinPalettes, userPalettes])

  const candidates = useMemo(() => {
    if (!targetPalette) return []
    if (source === 'builtin') {
      return targetPalette.colors.map((c) => ({
        id: c.id,
        code: c.id,
        name: c.nameZh || c.name,
        hex: c.hex,
        beadSizeMm: targetPalette.beadSize,
      }))
    }
    return (colorsByPalette.get(targetPalette.id) || []).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      hex: c.hex,
      beadSizeMm: targetPalette.beadSizeMm ?? null,
    }))
  }, [targetPalette, source, colorsByPalette])

  const targetInventory = useMemo(() => {
    const m = new Map()
    for (const c of candidates) {
      const key = source === 'builtin' ? `builtin:${targetId}:${c.id}` : `user:${targetId}:${c.id}`
      const rec = inventoryByKey.get(key)
      if (rec) m.set(c.id, { quantity: rec.quantity, status: rec.status })
    }
    return m
  }, [candidates, source, targetId, inventoryByKey])

  const matchResult = useMemo(() => {
    if (!canvasData?.length) return { items: [], summary: null }
    return matchCanvasToInventory({
      canvasData,
      candidates,
      inventory: targetInventory,
      requiredBeadSizeMm: requiredSize ? Number(requiredSize) : null,
      closeThreshold: threshold,
    })
  }, [canvasData, candidates, targetInventory, requiredSize, threshold])

  // 手动替色优先于算法结果
  const items = useMemo(() => {
    if (Object.keys(overrides).length === 0) return matchResult.items
    return matchResult.items.map((item) => {
      const overrideId = overrides[item.sourceHex]
      if (!overrideId) return item
      const target = candidates.find((c) => c.id === overrideId)
      if (!target) return item
      return { ...item, targetColor: target, deltaE00: null, autoApplicable: true, manual: true }
    })
  }, [matchResult.items, overrides, candidates])

  const preview = useMemo(
    () => buildMappingPreview(canvasData, items, accepted),
    [canvasData, items, accepted],
  )

  const shopping = useMemo(() => buildShoppingList(items), [items])

  const changeTarget = (nextSource, nextId) => {
    setOverrides({})
    setAccepted({})
    onSourceChange(nextSource, nextId)
  }

  const toggleAccept = (sourceHex) => {
    setAccepted((prev) => {
      const next = { ...prev }
      if (next[sourceHex]) delete next[sourceHex]
      else next[sourceHex] = true
      return next
    })
  }

  const acceptAuto = () => {
    const next = {}
    for (const item of items) {
      if (item.autoApplicable && item.targetColor && item.targetColor.hex !== item.sourceHex) {
        next[item.sourceHex] = true
      }
    }
    setAccepted(next)
  }

  const canApply = preview.changedCells > 0 && preview.selectedColors > 0
  const applyDisabledReason = preview.selectedColors === 0
    ? t('myBeads.match.applyDisabledEmpty')
    : (preview.changedCells === 0 ? t('myBeads.match.applyDisabledNoChange') : '')

  const apply = () => {
    if (!canApply) return
    const entries = acceptedEntries(items, accepted)
    if (entries.length === 0) return
    onApply?.(entries)
    setAccepted({})
  }

  const hasCanvas = !!canvasData && canvasData.some((row) => row.some(Boolean))
  const targetHasNoColors = targetPalette && candidates.length === 0
  // 切到「我的色卡」但一张都没有:这是「还没建色卡」,不是「色卡里没颜色」,
  // 两者该给的下一步不同(复制/新建 vs 去管理颜色)。
  const noUserPalettes = source === 'user' && userPalettes.length === 0

  // ── 空状态:没有可匹配的图纸 ──────────────────────────────
  if (!hasCanvas) {
    return (
      <section className="my-beads-section match-workspace">
        <div className="my-beads-section-head"><h2>{t('myBeads.match.title')}</h2></div>
        <p className="my-beads-hint small">{t('myBeads.match.intro')}</p>

        {/* 空状态下更要说清「这个页面是干什么的」:用户很可能就是在这里
            第一次见到这个功能,只给「去画画」等于把人推走。 */}
        <WhenToUse t={t} />

        <div className="my-beads-empty-action">
          <PaletteIcon size={20} aria-hidden="true" />
          <h3>{t('myBeads.match.noCanvasTitle')}</h3>
          <p className="my-beads-hint small">{t('myBeads.match.noCanvasDesc')}</p>
          <button type="button" className="my-beads-btn primary" onClick={onBackToCanvas}>
            <ArrowLeft size={14} />{t('myBeads.match.backToCanvas')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="my-beads-section match-workspace">
      <div className="my-beads-section-head"><h2>{t('myBeads.match.title')}</h2></div>
      <p className="my-beads-hint small">{t('myBeads.match.intro')}</p>

      <WhenToUse t={t} />

      {/* 三步说明(不是强制向导) */}
      <ol className="match-steps">
        <li><span>1</span>{t('myBeads.match.step1')}</li>
        <li><span>2</span>{t('myBeads.match.step2')}</li>
        <li><span>3</span>{t('myBeads.match.step3')}</li>
      </ol>

      {/* ── 步骤 1:目标色卡 ─────────────────────────────── */}
      <div className="match-config">
        <fieldset className="picker-source">
          <legend>{t('myBeads.match.targetSource')}</legend>
          <div className="segmented" role="group">
            <button
              type="button"
              className={source === 'builtin' ? 'active' : ''}
              aria-pressed={source === 'builtin'}
              onClick={() => changeTarget('builtin', builtinPalettes[0]?.id || '')}
            >
              {t('myBeads.inventory.builtin')}
            </button>
            <button
              type="button"
              className={source === 'user' ? 'active' : ''}
              aria-pressed={source === 'user'}
              onClick={() => changeTarget('user', userPalettes[0]?.id || '')}
            >
              {t('myBeads.inventory.personal')}
            </button>
          </div>
        </fieldset>

        <label className="picker-palette">
          <span>{t('myBeads.match.targetPalette')}</span>
          <select
            value={targetId || ''}
            onChange={(e) => changeTarget(source, e.target.value)}
          >
            {(source === 'builtin' ? builtinPalettes : userPalettes).map((p) => (
              <option key={p.id} value={p.id}>
                {source === 'builtin'
                  ? t(`palette.brand.${p.id}`, p.nameZh || p.name)
                  : p.name}
                {source === 'builtin' && p.beadSize ? ` · ${p.beadSize}mm` : ''}
                {source === 'builtin' ? ` · ${p.colors.length}` : ` · ${(colorsByPalette.get(p.id) || []).length}`}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="my-beads-btn ghost advanced-toggle"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {t('myBeads.match.advanced')}
        </button>

        {showAdvanced && (
          <div className="match-advanced">
            <label className="picker-palette">
              <span>{t('myBeads.match.sizeLabel')}</span>
              <select
                value={sizeCustom ? '__custom__' : requiredSize}
                aria-label={t('myBeads.match.sizeLabel')}
                onChange={(e) => {
                  const next = e.target.value
                  if (next === '__custom__') { setSizeCustom(true); return }
                  setSizeCustom(false)
                  setRequiredSize(next)
                }}
              >
                <option value="">{t('myBeads.match.sizeUnknownOption')}</option>
                <option value="2.6">2.6 mm</option>
                <option value="5">5 mm</option>
                <option value="__custom__">{t('myBeads.match.sizeCustom')}</option>
              </select>
            </label>
            {sizeCustom && (
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                className="qty-input"
                value={requiredSize}
                onChange={(e) => setRequiredSize(e.target.value)}
                aria-label={t('myBeads.match.sizeLabel')}
              />
            )}
            <p className="my-beads-hint small">{t('myBeads.match.sizeHelp')}</p>

            <label className="picker-palette">
              <span>{t('myBeads.match.thresholdLabel')}</span>
              <select
                value={thresholdPresetId(threshold)}
                onChange={(e) => {
                  const preset = THRESHOLD_PRESETS.find((p) => p.id === e.target.value)
                  if (preset) setThresholdRaw(String(preset.value))
                  else setThresholdRaw('0')
                }}
                aria-label={t('myBeads.match.thresholdLabel')}
              >
                {THRESHOLD_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{t(p.key)}</option>
                ))}
                <option value="custom">{t('myBeads.match.thresholdCustom')}</option>
              </select>
            </label>
            {thresholdPresetId(threshold) === 'custom' && (
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                className="qty-input"
                value={thresholdRaw}
                onChange={(e) => setThresholdRaw(e.target.value)}
                aria-label={t('myBeads.match.thresholdLabel')}
              />
            )}
            <p className="my-beads-hint small">
              {t('myBeads.match.thresholdHelp')}
              {' · '}
              {t('myBeads.match.thresholdTech')}
            </p>
          </div>
        )}
      </div>

      {noUserPalettes ? (
        <div className="my-beads-empty-action">
          <PaletteIcon size={20} aria-hidden="true" />
          <h3>{t('myBeads.inventory.noPalettes')}</h3>
          <p className="my-beads-hint small">{t('myBeads.inventory.noPalettesDesc')}</p>
          <div className="empty-actions">
            <button type="button" className="my-beads-btn primary" onClick={onCopyBuiltin}>
              <Copy size={14} />{t('myBeads.gettingStarted.copyBuiltin')}
            </button>
            <button type="button" className="my-beads-btn secondary" onClick={onNewPalette}>
              <Plus size={14} />{t('myBeads.gettingStarted.createCustom')}
            </button>
          </div>
        </div>
      ) : targetHasNoColors ? (
        <div className="my-beads-empty-action">
          <PaletteIcon size={20} aria-hidden="true" />
          <h3>{t('myBeads.match.targetEmpty')}</h3>
          <p className="my-beads-hint small">{t('myBeads.match.targetEmptyDesc')}</p>
          <button type="button" className="my-beads-btn primary" onClick={onGoManageColors}>
            {t('myBeads.match.targetManage')}
          </button>
        </div>
      ) : (
        <>
          {/* ── 步骤 2:预览与结果 ───────────────────────── */}
          <div className="match-previews">
            <figure className="match-preview-figure">
              <figcaption>{t('myBeads.match.source')}</figcaption>
              <div className="my-beads-thumb">
                <ThumbnailCanvas
                  pattern={canvasData}
                  gridWidth={canvasData[0]?.length || 0}
                  gridHeight={canvasData.length}
                />
              </div>
            </figure>
            <figure className="match-preview-figure">
              <figcaption>{t('myBeads.match.previewTitle')}</figcaption>
              <div className="my-beads-thumb">
                <ThumbnailCanvas
                  pattern={preview.pattern}
                  gridWidth={preview.pattern[0]?.length || 0}
                  gridHeight={preview.pattern.length}
                />
              </div>
            </figure>
            <div className="match-preview-stats">
              <span>{t('myBeads.match.previewSelected', { n: preview.selectedColors })}</span>
              <span>{t('myBeads.match.previewCells', { n: preview.changedCells })}</span>
              <span>{t('myBeads.match.summaryColors', { n: matchResult.summary?.colorCount ?? 0 })}</span>
              <span>{t('myBeads.match.summaryShortage', { n: matchResult.summary?.shortageBeads ?? 0 })}</span>
            </div>
            <p className="my-beads-hint small">{t('myBeads.match.previewHint')}</p>
          </div>

          <div className="my-beads-match-actions">
            <button type="button" className="my-beads-btn secondary" onClick={acceptAuto}>
              {t('myBeads.match.acceptAll')}
            </button>
            <button
              type="button"
              className="my-beads-btn primary"
              disabled={busy || !canApply}
              title={applyDisabledReason}
              onClick={apply}
            >
              {t('myBeads.match.apply', { n: preview.selectedColors })}
            </button>
          </div>
          {canApply ? (
            <p className="my-beads-hint small">{t('myBeads.match.applyHint')}</p>
          ) : (
            <p className="my-beads-hint small">{applyDisabledReason}</p>
          )}

          {/* 结果列表:桌面为表格,移动端为卡片(CSS 切换) */}
          <ul className="match-results">
            {items.map((item) => {
              const checked = !!accepted[item.sourceHex]
              const incompatible = item.mappingStatus === MAPPING_STATUS.INCOMPATIBLE_SIZE
              return (
                <li key={item.sourceHex} className={`match-card${checked ? ' accepted' : ''}`}>
                  <label className="match-accept">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!item.targetColor || incompatible}
                      aria-label={`${t('myBeads.match.accept')} ${item.sourceHex}`}
                      onChange={() => toggleAccept(item.sourceHex)}
                    />
                  </label>

                  <div className="match-col match-source">
                    <span className="swatch" style={{ background: item.sourceHex }} aria-hidden="true" />
                    <code>{item.sourceHex}</code>
                  </div>

                  <div className="match-col match-target">
                    {item.targetColor ? (
                      <>
                        <span className="swatch" style={{ background: item.targetColor.hex }} aria-hidden="true" />
                        <code>{item.targetColor.code}</code>
                        <select
                          className="override-select"
                          aria-label={`${t('myBeads.match.manualPickLabel')} ${item.sourceHex}`}
                          value={overrides[item.sourceHex] || item.targetColor.id}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [item.sourceHex]: e.target.value }))}
                        >
                          {candidates.map((c) => (
                            <option key={c.id} value={c.id}>{c.code}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <span className="my-beads-hint small">{t('myBeads.match.noTarget')}</span>
                    )}
                  </div>

                  <div className="match-col match-delta">
                    <span className="match-label">ΔE00</span>
                    <span>{item.deltaE00 === null ? '—' : item.deltaE00.toFixed(2)}</span>
                  </div>

                  <div className="match-col match-needed">
                    <span className="match-label">{t('myBeads.match.needLabel')}</span>
                    <span>{item.requiredCount}</span>
                  </div>

                  <div className="match-col match-stock">
                    <span className="match-label">{t('myBeads.match.stock')}</span>
                    <span>{item.stockCount === null ? t('myBeads.match.unknown') : item.stockCount}</span>
                  </div>

                  <div className="match-col match-shortage">
                    <span className="match-label">{t('myBeads.match.shortageLabel')}</span>
                    <span>{item.shortageCount === null ? '—' : item.shortageCount}</span>
                  </div>

                  <div className="match-col match-badges">
                    {incompatible ? (
                      <span className="status-badge size">{t('myBeads.match.status.incompatibleSize')}</span>
                    ) : (
                      <>
                        <span className={`status-badge ${TONE[item.colorStatus] || 'missing'}`}>
                          {t(COLOR_STATUS_KEY[item.colorStatus] || COLOR_STATUS_KEY[COLOR_STATUS.MISSING])}
                        </span>
                        {item.colorStatus !== COLOR_STATUS.MISSING && (
                          <span className={`status-badge stock-${item.stockStatus}`}>
                            {t(STOCK_STATUS_KEY[item.stockStatus])}
                          </span>
                        )}
                        {item.manual && <span className="status-badge manual">{t('myBeads.match.manual')}</span>}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* ── 步骤 3:采购清单 ─────────────────────────── */}
          <div className="my-beads-shopping">
            <h3><ShoppingCart size={14} aria-hidden="true" />{t('myBeads.match.shoppingTitle')}</h3>
            {shopping.need.length === 0 ? (
              <p className="my-beads-hint small">{t('myBeads.match.shoppingNone')}</p>
            ) : (
              <ul>
                {shopping.need.map((item) => (
                  <li key={item.targetColor.id}>
                    <span className="swatch" style={{ background: item.targetColor.hex }} aria-hidden="true" />
                    <code>{item.targetColor.code}</code>
                    <span>{t('myBeads.match.buy', { n: item.shortageCount })}</span>
                  </li>
                ))}
              </ul>
            )}
            {shopping.unknown.length > 0 && (
              <div className="shopping-unknown">
                <p className="my-beads-hint small">
                  <AlertTriangle size={12} aria-hidden="true" />
                  <strong>{t('myBeads.match.shoppingUnknownTitle')}</strong>
                  {t('myBeads.match.shoppingUnknownDesc')}
                </p>
                <button type="button" className="my-beads-btn ghost" onClick={onGoInventory}>
                  {t('myBeads.match.goInventoryFill')}
                </button>
              </div>
            )}
          </div>
          <p className="my-beads-hint small">{t('myBeads.match.stepHint')}</p>
        </>
      )}
    </section>
  )
}
