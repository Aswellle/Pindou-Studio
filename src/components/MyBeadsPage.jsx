/**
 * MyBeadsPage — /my/beads 个人色卡与库存
 *
 * 规格:docs/agent-spec/05_个人色卡与库存规格.md
 *
 * 三层分离(页面按此组织):
 *   1. 内置色卡目录 —— 只读,可「复制为我的色卡」,不修改内置数据;
 *   2. 我的色卡 —— 名称/品牌/系列/豆径 + 颜色 CRUD(色号唯一、HEX 规范);
 *   3. 我的库存 —— 拥有/缺货/数量(数量空 = 未知,不等于 0);
 *      并把当前图纸的颜色与目标色卡/库存做匹配,预览替代色后一次性改矩阵。
 *
 * 数据访问全部经 useUserPalettes(登录 → Supabase + RLS;未登录 → localStorage)。
 * 画布只存 HEX:删除个人色卡不会让已保存图纸变黑。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Plus, Trash2, Pencil, Copy, Search, Check, X, Package,
  Palette as PaletteIcon, Layers, AlertTriangle, Sparkles, Download, Upload, ClipboardCopy,
} from 'lucide-react'
import { useToast } from '../components/Toast'
import ThumbnailCanvas from '../components/ThumbnailCanvas'
import { useScrollLock } from '../hooks/useScrollLock'
import { PALETTE_LIST, getPalette } from '../data/palettes'
import { useUserPalettes } from '../hooks/useUserPalettes'
import {
  normalizePaletteInput,
  normalizeColorInput,
  paletteKeyForBuiltin,
  paletteKeyForUser,
  PALETTE_ERRORS,
  COLOR_SOURCES,
  DEFAULT_COLOR_SOURCE,
  MAX_PALETTE_NAME,
  MAX_COLOR_CODE,
} from '../services/beads/personalPalette'
import {
  buildBeadBackup,
  parseBeadBackup,
  planMerge,
  BACKUP_ERRORS,
} from '../services/beads/backup'
import {
  matchCanvasToInventory,
  applyColorMapping,
  buildShoppingList,
  MAPPING_STATUS,
  COLOR_STATUS,
  STOCK_STATUS,
  DEFAULT_CLOSE_THRESHOLD,
} from '../services/beads/inventoryMatch'
import './myBeadsPage.css'

const TAB_PALETTES = 'palettes'
const TAB_INVENTORY = 'inventory'
const TAB_MATCH = 'match'

/** 色卡错误码 → i18n 键 */
const PALETTE_ERROR_KEY = {
  [PALETTE_ERRORS.NOT_OBJECT]: 'myBeads.errors.notObject',
  [PALETTE_ERRORS.NAME_REQUIRED]: 'myBeads.errors.nameRequired',
  [PALETTE_ERRORS.NAME_TOO_LONG]: 'myBeads.errors.nameTooLong',
  [PALETTE_ERRORS.NOTE_TOO_LONG]: 'myBeads.errors.noteTooLong',
  [PALETTE_ERRORS.INVALID_BEAD_SIZE]: 'myBeads.errors.invalidBeadSize',
  [PALETTE_ERRORS.CODE_REQUIRED]: 'myBeads.errors.codeRequired',
  [PALETTE_ERRORS.CODE_TOO_LONG]: 'myBeads.errors.codeTooLong',
  [PALETTE_ERRORS.INVALID_HEX]: 'myBeads.errors.invalidHex',
  [PALETTE_ERRORS.DUPLICATE_CODE]: 'myBeads.errors.duplicateCode',
  invalidQuantity: 'myBeads.errors.invalidQuantity',
  storageFull: 'errors.storageFull',
  writeFailed: 'myBeads.errors.writeFailed',
  loadFailed: 'myBeads.errors.loadFailed',
  importFailed: 'myBeads.errors.importFailed',
  notFound: 'myBeads.errors.notFound',
  cloudNotConfigured: 'errors.cloudNotConfigured',
  importLocalOnly: 'myBeads.backup.localOnly',
  [BACKUP_ERRORS.NOT_JSON]: 'myBeads.backup.errors.notJson',
  [BACKUP_ERRORS.NOT_BACKUP]: 'myBeads.backup.errors.notBackup',
  [BACKUP_ERRORS.FUTURE_VERSION]: 'myBeads.backup.errors.futureVersion',
  [BACKUP_ERRORS.TOO_LARGE]: 'myBeads.backup.errors.tooLarge',
  [BACKUP_ERRORS.BAD_SHAPE]: 'myBeads.backup.errors.badShape',
}

/** 颜色匹配状态 → 徽章样式与 i18n 键(库存单独展示,不混在色差徽章里) */
const COLOR_STATUS_META = {
  [COLOR_STATUS.EXACT]: { cls: 'exact', key: 'myBeads.match.status.exact' },
  [COLOR_STATUS.CLOSE]: { cls: 'close', key: 'myBeads.match.status.close' },
  [COLOR_STATUS.POOR]: { cls: 'poor', key: 'myBeads.match.status.poor' },
  [COLOR_STATUS.MISSING]: { cls: 'missing', key: 'myBeads.match.status.missing' },
}

/** 库存状态徽章(未知 ≠ 缺货,分开展示) */
const STOCK_STATUS_META = {
  [STOCK_STATUS.UNKNOWN]: { cls: 'unknown', key: 'myBeads.match.status.unknownInventory' },
  [STOCK_STATUS.SUFFICIENT]: { cls: 'exact', key: 'myBeads.match.stockSufficient' },
  [STOCK_STATUS.SHORTAGE]: { cls: 'poor', key: 'myBeads.match.stockShortage' },
  [STOCK_STATUS.OUT_OF_STOCK]: { cls: 'missing', key: 'myBeads.match.stockOut' },
}

/** 一行可能同时展示「色差徽章」与「库存徽章」;尺寸不兼容优先 */
function statusBadges(item) {
  if (item.mappingStatus === MAPPING_STATUS.INCOMPATIBLE_SIZE) {
    return [{ cls: 'size', key: 'myBeads.match.status.incompatibleSize' }]
  }
  const badges = []
  const color = COLOR_STATUS_META[item.colorStatus]
  if (color) badges.push(color)
  if (item.colorStatus !== COLOR_STATUS.MISSING) {
    const stock = STOCK_STATUS_META[item.stockStatus]
    if (stock) badges.push(stock)
  }
  return badges
}

export default function MyBeadsPage({ user, canvasData, onApplyMapping }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const store = useUserPalettes(user)

  const [tab, setTab] = useState(TAB_PALETTES)
  const [selectedPaletteId, setSelectedPaletteId] = useState(null)
  const [search, setSearch] = useState('')
  // 色卡详情里的颜色搜索(规格 05 §2 P0:按色号/名称搜索)
  const [colorSearch, setColorSearch] = useState('')
  const [editingPalette, setEditingPalette] = useState(null) // { id?, ...fields }
  const [editingColor, setEditingColor] = useState(null) // { id?, ...fields }
  const [confirmDelete, setConfirmDelete] = useState(null) // { kind:'palette'|'color', id, name }
  // 三个编辑/确认浮层共享一把滚动锁;浮层全部 portal 到 body,避免页面滚动容器
  // 在 iOS 键盘弹起时把 fixed 浮层顶出可视区
  useScrollLock(!!(editingPalette || editingColor || confirmDelete))
  const [busy, setBusy] = useState(false)

  // 匹配页状态
  const [targetKind, setTargetKind] = useState('builtin') // builtin | user
  const [targetId, setTargetId] = useState('perler')
  const [requiredSize, setRequiredSize] = useState('')
  const [closeThreshold, setCloseThreshold] = useState(DEFAULT_CLOSE_THRESHOLD)
  const [overrides, setOverrides] = useState({}) // sourceHex -> 目标色 id(手动选择)

  const palettes = store.palettes
  const selectedPalette = useMemo(
    () => palettes.find((p) => p.id === selectedPaletteId) || null,
    [palettes, selectedPaletteId],
  )

  // 当前色卡的颜色(带搜索过滤);搜索只在选中色卡内生效
  const filteredColors = useMemo(() => {
    if (!selectedPalette) return []
    const list = store.colorsByPalette.get(selectedPalette.id) || []
    const q = colorSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => (
      String(c.code || '').toLowerCase().includes(q)
      || String(c.name || '').toLowerCase().includes(q)
      || String(c.hex || '').toLowerCase().includes(q)
    ))
  }, [selectedPalette, store.colorsByPalette, colorSearch])

  // 切换色卡时清空颜色搜索,避免上一张色卡的查询词让新列表看起来是空的
  useEffect(() => { setColorSearch('') }, [selectedPaletteId])

  /** 复制 HEX(规格 05 §2 P0)。非安全上下文降级为 prompt 展示,不静默失败 */
  const copyHex = useCallback(async (hex) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(hex)
        toast(t('myBeads.colors.copiedHex', { hex }), 'success')
        return
      }
    } catch {
      // 权限被拒 / 非安全上下文:走下面的降级路径
    }
    window.prompt(t('myBeads.colors.copyManual'), hex)
  }, [toast, t])

  // 首次加载后默认选中第一张个人色卡
  useEffect(() => {
    if (!selectedPaletteId && palettes.length > 0) setSelectedPaletteId(palettes[0].id)
    if (selectedPaletteId && !palettes.some((p) => p.id === selectedPaletteId)) {
      setSelectedPaletteId(palettes[0]?.id || null)
    }
  }, [palettes, selectedPaletteId])

  // 错误 → toast(错误码稳定,文案走 i18n)
  const errorText = useCallback((err) => {
    const key = PALETTE_ERROR_KEY[err?.code]
    const base = key ? t(key) : t('myBeads.errors.unknown')
    return err?.detail ? `${base}(${err.detail})` : base
  }, [t])

  useEffect(() => {
    if (!store.error) return
    toast(errorText(store.error), 'error')
    store.clearError()
  }, [store.error, toast, errorText, store])

  const run = useCallback(async (fn, successKey, params) => {
    setBusy(true)
    try {
      const res = await fn()
      if (!res?.ok) {
        if (res?.errors?.[0]) toast(errorText(res.errors[0]), 'error')
        return res
      }
      if (successKey) toast(t(successKey, params), 'success')
      return res
    } finally {
      setBusy(false)
    }
  }, [errorText, toast, t])

  // ── 色卡编辑 ───────────────────────────────────────────────
  const openNewPalette = () => setEditingPalette({
    id: null, name: '', brandName: '', seriesName: '', beadSizeMm: '', notes: '',
  })

  const openEditPalette = (p) => setEditingPalette({
    id: p.id,
    name: p.name,
    brandName: p.brandName || '',
    seriesName: p.seriesName || '',
    beadSizeMm: p.beadSizeMm ?? '',
    notes: p.notes || '',
  })

  const savePalette = async () => {
    if (!editingPalette) return
    const validation = normalizePaletteInput(editingPalette)
    if (!validation.ok) { toast(errorText(validation.errors[0]), 'error'); return }
    const res = await run(
      () => (editingPalette.id
        ? store.updatePalette(editingPalette.id, validation.palette)
        : store.createPalette(validation.palette)),
      'myBeads.saved',
    )
    if (res?.ok) {
      setEditingPalette(null)
      if (!editingPalette.id) setSelectedPaletteId(res.palette.id)
    }
  }

  const doDeletePalette = async () => {
    if (!confirmDelete) return
    const target = confirmDelete
    setConfirmDelete(null)
    if (target.kind === 'palette') {
      await run(() => store.deletePalette(target.id), 'myBeads.paletteDeleted')
    } else {
      await run(() => store.deleteColor(target.id), 'myBeads.colorDeleted')
    }
  }

  // ── 颜色编辑 ───────────────────────────────────────────────
  const openNewColor = () => setEditingColor({
    id: null, code: '', name: '', hex: '#E53935', notes: '', source: DEFAULT_COLOR_SOURCE,
  })

  const saveColor = async () => {
    if (!editingColor || !selectedPalette) return
    const siblings = store.colorsByPalette.get(selectedPalette.id) || []
    const validation = normalizeColorInput(editingColor, {
      existingColors: siblings,
      ignoreId: editingColor.id,
    })
    if (!validation.ok) { toast(errorText(validation.errors[0]), 'error'); return }
    const res = await run(
      () => (editingColor.id
        ? store.updateColor(editingColor.id, validation.color)
        : store.addColor(selectedPalette.id, validation.color)),
      'myBeads.saved',
    )
    if (res?.ok) setEditingColor(null)
  }

  // ── 复制内置色卡 ───────────────────────────────────────────
  const copyBuiltin = async (builtin) => {
    const defaultName = `${t(`palette.brand.${builtin.id}`, builtin.nameZh || builtin.name)} ${t('myBeads.copySuffix')}`
    const name = window.prompt(t('myBeads.copyPrompt'), defaultName)
    if (name === null) return
    const res = await run(
      () => store.copyBuiltinPalette(builtin, name.trim() || defaultName),
      'myBeads.copied',
    )
    if (res?.ok) setSelectedPaletteId(res.palette.id)
  }

  // ── 库存 ───────────────────────────────────────────────────
  // 库存视图:当前选中的是内置色卡还是个人色卡
  const [invKind, setInvKind] = useState('builtin')
  const [invPaletteId, setInvPaletteId] = useState('perler')
  // 状态筛选(规格 05 §3:显示拥有、缺货、数量不足颜色)
  const [stockFilter, setStockFilter] = useState('all')
  // 批量编辑:选中的 paletteKey 集合
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [batchQty, setBatchQty] = useState('')

  const invColors = useMemo(() => {
    if (invKind === 'builtin') {
      return getPalette(invPaletteId).colors.map((c) => ({
        id: c.id,
        code: c.id,
        name: c.nameZh || c.name,
        hex: c.hex,
        key: paletteKeyForBuiltin(invPaletteId, c.id),
        beadSizeMm: getPalette(invPaletteId).beadSize,
      }))
    }
    const list = store.colorsByPalette.get(invPaletteId) || []
    return list.map((c) => ({
      ...c,
      key: paletteKeyForUser(invPaletteId, c.id),
    }))
  }, [invKind, invPaletteId, store.colorsByPalette])

  const filteredInvColors = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = invColors
    if (q) {
      list = list.filter((c) => (
        String(c.code).toLowerCase().includes(q)
        || String(c.name || '').toLowerCase().includes(q)
        || String(c.hex || '').toLowerCase().includes(q)
      ))
    }
    if (stockFilter === 'all') return list
    return list.filter((c) => {
      const rec = store.inventoryByKey.get(c.key)
      switch (stockFilter) {
        case 'owned': return !!rec && rec.status === 'owned' && rec.quantity !== 0
        case 'low': return !!rec && rec.status === 'low'
        case 'out': return !!rec && (rec.status === 'out_of_stock' || rec.quantity === 0)
        case 'unknown': return !rec
        default: return true
      }
    })
  }, [invColors, search, stockFilter, store.inventoryByKey])

  const inventoryStats = useMemo(() => {
    let owned = 0
    let out = 0
    let unknown = 0
    let totalQty = 0
    for (const c of invColors) {
      const rec = store.inventoryByKey.get(c.key)
      if (!rec) { unknown++; continue }
      if (rec.status === 'out_of_stock' || rec.quantity === 0) { out++; continue }
      owned++
      if (rec.quantity !== null && rec.quantity !== undefined) totalQty += rec.quantity
    }
    return { owned, out, unknown, totalQty, total: invColors.length }
  }, [invColors, store.inventoryByKey])

  const updateStock = async (color, patch) => {
    const existing = store.inventoryByKey.get(color.key)
    const res = await store.setInventory({
      paletteKey: color.key,
      paletteColorId: invKind === 'user' ? color.id : null,
      quantity: existing ? existing.quantity : null,
      status: existing ? existing.status : 'owned',
      notes: existing?.notes || '',
      ...patch,
    })
    if (!res.ok && res.errors?.[0]) toast(errorText(res.errors[0]), 'error')
    return res
  }

  // ── 批量库存编辑(规格 05 §3)────────────────────────────────
  const toggleKey = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const visibleKeys = useMemo(() => filteredInvColors.map((c) => c.key), [filteredInvColors])
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k))

  const toggleSelectAllVisible = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k))
      else visibleKeys.forEach((k) => next.add(k))
      return next
    })
  }

  // 切换色卡/视图时清空选择,避免把上一张色卡的键带到新列表
  useEffect(() => { setSelectedKeys(new Set()); setBatchQty('') }, [invKind, invPaletteId])

  /**
   * 批量写入。逐条 await,统计成功/失败 —— 部分失败时如实报告,不假装全部成功。
   * @param {(color, rec) => object} buildPatch
   */
  const runBatch = async (buildPatch, successKey) => {
    const targets = filteredInvColors.filter((c) => selectedKeys.has(c.key))
    if (targets.length === 0) {
      toast(t('myBeads.inventory.batchEmpty'), 'error')
      return
    }
    setBusy(true)
    let ok = 0
    let failed = 0
    try {
      for (const color of targets) {
        const rec = store.inventoryByKey.get(color.key)
        const patch = buildPatch(color, rec)
        if (patch === null) { ok++; continue }
        // 清除记录走 removeInventory,其余走 setInventory
        if (patch.__remove) {
          const res = await store.removeInventory(color.key)
          if (res.ok) ok++
          else failed++
          continue
        }
        const res = await store.setInventory({
          paletteKey: color.key,
          paletteColorId: invKind === 'user' ? color.id : null,
          quantity: rec ? rec.quantity : null,
          status: rec ? rec.status : 'owned',
          notes: rec?.notes || '',
          ...patch,
        })
        if (res.ok) ok++
        else failed++
      }
    } finally {
      setBusy(false)
    }
    if (failed > 0) {
      toast(t('myBeads.inventory.batchPartial', { ok, failed }), 'error')
    } else {
      toast(t(successKey, { n: ok }), 'success')
    }
    setSelectedKeys(new Set())
    setBatchQty('')
  }

  const applyBatchQty = () => {
    const raw = String(batchQty).trim()
    if (raw === '') { toast(t('myBeads.errors.invalidQuantity'), 'error'); return }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) { toast(t('myBeads.errors.invalidQuantity'), 'error'); return }
    const qty = Math.trunc(n)
    runBatch(() => ({ quantity: qty, status: qty === 0 ? 'out_of_stock' : 'owned' }), 'myBeads.inventory.batchQtyDone')
  }

  // 批量改状态:标记缺货时数量归零;标记拥有/不足时保留已有数量(不能把用户填的数字抹掉)
  const applyBatchStatus = (status) => runBatch(
    () => (status === 'out_of_stock' ? { status, quantity: 0 } : { status }),
    'myBeads.inventory.batchStatusDone',
  )
  const clearBatch = () => runBatch((color) => {
    // 清除记录:没有记录时视为已完成(幂等)
    if (!store.inventoryByKey.get(color.key)) return null
    return { __remove: true }
  }, 'myBeads.inventory.batchCleared')

  // ── 备份导出 / 导入(规格 05 §5,仅本地模式)───────────────
  const fileInputRef = useRef(null)

  const exportBackupFile = () => {
    const data = store.exportBackup()
    const backup = buildBeadBackup(data)
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `pindou-beads-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('myBeads.backup.exported'), 'success')
  }

  const onBackupFilePicked = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许再次选择同一文件
    if (!file) return
    let text = ''
    try {
      text = await file.text()
    } catch (err) {
      toast(t('myBeads.backup.errors.readFailed'), 'error')
      return
    }
    const parsed = parseBeadBackup(text)
    if (!parsed.ok) {
      toast(errorText(parsed.errors[0]), 'error')
      return
    }
    const plan = planMerge(store.exportBackup(), parsed.backup)
    const total = plan.palettes.length + plan.colors.length + plan.inventory.length
    if (total === 0) {
      toast(t('myBeads.backup.nothingNew'), 'info')
      return
    }
    setBusy(true)
    try {
      const res = await store.importBackup(plan)
      if (!res.ok) {
        toast(errorText(res.errors?.[0]), 'error')
        return
      }
      toast(t('myBeads.backup.imported', {
        palettes: plan.palettes.length,
        colors: plan.colors.length,
        inventory: plan.inventory.length,
        skipped: plan.skipped.palettes + plan.skipped.colors + plan.skipped.inventory,
      }), 'success')
    } finally {
      setBusy(false)
    }
  }

  // ── 匹配 ───────────────────────────────────────────────────
  const targetCandidates = useMemo(() => {
    if (targetKind === 'builtin') {
      const p = getPalette(targetId)
      return p.colors.map((c) => ({
        id: c.id, code: c.id, name: c.nameZh || c.name, hex: c.hex, beadSizeMm: p.beadSize,
      }))
    }
    const list = store.colorsByPalette.get(targetId) || []
    const palette = palettes.find((p) => p.id === targetId)
    return list.map((c) => ({
      id: c.id, code: c.code, name: c.name, hex: c.hex,
      beadSizeMm: palette?.beadSizeMm ?? null,
    }))
  }, [targetKind, targetId, store.colorsByPalette, palettes])

  const targetInventory = useMemo(() => {
    const m = new Map()
    for (const c of targetCandidates) {
      const key = targetKind === 'builtin'
        ? paletteKeyForBuiltin(targetId, c.id)
        : paletteKeyForUser(targetId, c.id)
      const rec = store.inventoryByKey.get(key)
      if (rec) m.set(c.id, { quantity: rec.quantity, status: rec.status })
    }
    return m
  }, [targetCandidates, targetKind, targetId, store.inventoryByKey])

  const matchResult = useMemo(() => {
    if (!canvasData) return { items: [], summary: null }
    return matchCanvasToInventory({
      canvasData,
      candidates: targetCandidates,
      inventory: targetInventory,
      requiredBeadSizeMm: requiredSize ? Number(requiredSize) : null,
      closeThreshold: Number(closeThreshold) || DEFAULT_CLOSE_THRESHOLD,
    })
  }, [canvasData, targetCandidates, targetInventory, requiredSize, closeThreshold])

  // 用户手动指定的替代色优先于算法结果
  const effectiveItems = useMemo(() => {
    if (Object.keys(overrides).length === 0) return matchResult.items
    return matchResult.items.map((item) => {
      const overrideId = overrides[item.sourceHex]
      if (!overrideId) return item
      const target = targetCandidates.find((c) => c.id === overrideId)
      if (!target) return item
      return {
        ...item,
        targetColor: target,
        deltaE00: null,
        autoApplicable: true,
        manual: true,
      }
    })
  }, [matchResult.items, overrides, targetCandidates])

  const shopping = useMemo(() => buildShoppingList(effectiveItems), [effectiveItems])

  const [accepted, setAccepted] = useState({}) // sourceHex -> true
  useEffect(() => { setAccepted({}); setOverrides({}) }, [targetKind, targetId])

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
    for (const item of effectiveItems) {
      if (item.autoApplicable && item.targetColor && item.targetColor.hex !== item.sourceHex) {
        next[item.sourceHex] = true
      }
    }
    setAccepted(next)
    toast(t('myBeads.match.autoAccepted', { n: Object.keys(next).length }), 'success')
  }

  const applyAccepted = () => {
    const entries = effectiveItems
      .filter((item) => accepted[item.sourceHex] && item.targetColor)
      .map((item) => ({ from: item.sourceHex, to: item.targetColor.hex }))
    if (entries.length === 0) { toast(t('myBeads.match.nothingAccepted'), 'error'); return }
    const res = applyColorMapping(canvasData, entries)
    if (!res.data) { toast(t('myBeads.match.noChange'), 'info'); return }
    onApplyMapping?.(res.data)
    setAccepted({})
    toast(t('myBeads.match.applied', { n: res.changed }), 'success')
    navigate('/')
  }

  // 画布缩略图数据(只用于预览当前图纸)
  const previewPattern = useMemo(() => canvasData || [], [canvasData])

  return (
    <div className="my-beads-page">
      <div className="my-beads-inner">
        <header className="my-beads-bar">
          <button type="button" className="my-beads-back" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <ArrowLeft size={16} />
            <span>{t('common.back')}</span>
          </button>
          <div className="my-beads-title">
            <span className="my-beads-eyebrow">PINDOU STUDIO / BEADS</span>
            <h1>{t('myBeads.title')}</h1>
            <p>{t('myBeads.subtitle')}</p>
          </div>
        </header>

        {/* 存储模式如实说明:云端 / 仅本机 */}
        <p className={`my-beads-mode ${store.mode}`}>
          {store.mode === 'cloud' ? t('myBeads.modeCloud') : t('myBeads.modeLocal')}
        </p>

        {/* 备份(规格 05 §5):本地模式可导出/导入;云端模式隐藏 ——
            云端 id 由数据库生成,备份里的 id 无法原样恢复 */}
        {store.mode === 'local' && (
          <div className="my-beads-backup">
            <button type="button" className="my-beads-btn ghost" onClick={exportBackupFile}>
              <Download size={14} />{t('myBeads.backup.export')}
            </button>
            <button
              type="button"
              className="my-beads-btn ghost"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />{t('myBeads.backup.import')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="my-beads-file-input"
              onChange={onBackupFilePicked}
            />
            <span className="my-beads-hint small">{t('myBeads.backup.hint')}</span>
          </div>
        )}

        {store.mode === 'cloud' && store.pendingLocal > 0 && (
          <div className="my-beads-banner">
            <span>{t('myBeads.pendingLocal', { n: store.pendingLocal })}</span>
            <button type="button" className="my-beads-btn secondary" disabled={busy} onClick={() => run(() => store.importLocal(), 'myBeads.imported')}>
              {t('myBeads.importLocal')}
            </button>
          </div>
        )}

        <nav className="my-beads-tabs" role="tablist">
          <button role="tab" aria-selected={tab === TAB_PALETTES} className={tab === TAB_PALETTES ? 'active' : ''} onClick={() => setTab(TAB_PALETTES)}>
            <Layers size={15} />{t('myBeads.tabs.palettes')}
          </button>
          <button role="tab" aria-selected={tab === TAB_INVENTORY} className={tab === TAB_INVENTORY ? 'active' : ''} onClick={() => setTab(TAB_INVENTORY)}>
            <Package size={15} />{t('myBeads.tabs.inventory')}
          </button>
          <button role="tab" aria-selected={tab === TAB_MATCH} className={tab === TAB_MATCH ? 'active' : ''} onClick={() => setTab(TAB_MATCH)}>
            <Sparkles size={15} />{t('myBeads.tabs.match')}
          </button>
        </nav>

        {/* ═══ 我的色卡 ═══════════════════════════════════════ */}
        {tab === TAB_PALETTES && (
          <section className="my-beads-section">
            <div className="my-beads-section-head">
              <h2>{t('myBeads.palettes.title')}</h2>
              <button type="button" className="my-beads-btn primary" onClick={openNewPalette}>
                <Plus size={15} />{t('myBeads.palettes.new')}
              </button>
            </div>

            {store.loading ? (
              <p className="my-beads-hint">{t('common.loading')}</p>
            ) : palettes.length === 0 ? (
              <p className="my-beads-hint">{t('myBeads.palettes.empty')}</p>
            ) : (
              <div className="my-beads-palette-list">
                {palettes.map((p) => {
                  const count = (store.colorsByPalette.get(p.id) || []).length
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`my-beads-palette-card ${selectedPaletteId === p.id ? 'active' : ''}`}
                      onClick={() => setSelectedPaletteId(p.id)}
                    >
                      <PaletteIcon size={16} />
                      <span className="name">{p.name}</span>
                      <span className="meta">
                        {p.brandName || '—'}
                        {p.beadSizeMm ? ` · ${p.beadSizeMm}mm` : ''}
                        {` · ${count}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {selectedPalette && (
              <div className="my-beads-palette-detail">
                <div className="my-beads-section-head">
                  <h3>{selectedPalette.name}</h3>
                  <div className="my-beads-row-actions">
                    <button type="button" className="my-beads-icon-btn" title={t('common.edit')} onClick={() => openEditPalette(selectedPalette)}>
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="my-beads-icon-btn danger"
                      title={t('common.delete')}
                      onClick={() => setConfirmDelete({ kind: 'palette', id: selectedPalette.id, name: selectedPalette.name })}
                    >
                      <Trash2 size={15} />
                    </button>
                    <button type="button" className="my-beads-btn secondary" onClick={openNewColor}>
                      <Plus size={14} />{t('myBeads.colors.new')}
                    </button>
                  </div>
                </div>
                <p className="my-beads-hint small">{t('myBeads.palettes.deleteHint')}</p>

                {/* 规格 05 §2 P0:颜色列表支持按色号/名称/HEX 搜索 */}
                <label className="my-beads-search my-beads-color-search">
                  <Search size={14} />
                  <input
                    value={colorSearch}
                    onChange={(e) => setColorSearch(e.target.value)}
                    placeholder={t('myBeads.colors.search')}
                    aria-label={t('myBeads.colors.search')}
                  />
                </label>

                <ColorList
                  colors={filteredColors}
                  totalColors={(store.colorsByPalette.get(selectedPalette.id) || []).length}
                  inventoryByKey={store.inventoryByKey}
                  onEdit={(c) => setEditingColor({ ...c, source: c.source || DEFAULT_COLOR_SOURCE })}
                  onDelete={(c) => setConfirmDelete({ kind: 'color', id: c.id, name: c.code })}
                  onCopyHex={copyHex}
                  keyFor={(c) => paletteKeyForUser(selectedPalette.id, c.id)}
                  t={t}
                />
              </div>
            )}

            <div className="my-beads-builtin">
              <h3>{t('myBeads.builtin.title')}</h3>
              <p className="my-beads-hint small">{t('myBeads.builtin.hint')}</p>
              <div className="my-beads-builtin-grid">
                {PALETTE_LIST.map((p) => (
                  <div key={p.id} className="my-beads-builtin-card">
                    <div>
                      <strong>{t(`palette.brand.${p.id}`)}</strong>
                      <span>{t('myBeads.builtin.colorCount', { n: p.colors.length })}</span>
                    </div>
                    <button type="button" className="my-beads-btn ghost" onClick={() => copyBuiltin(p)}>
                      <Copy size={14} />{t('myBeads.builtin.copy')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ 我的库存 ═══════════════════════════════════════ */}
        {tab === TAB_INVENTORY && (
          <section className="my-beads-section">
            <div className="my-beads-section-head">
              <h2>{t('myBeads.inventory.title')}</h2>
            </div>
            <p className="my-beads-hint small">{t('myBeads.inventory.hint')}</p>

            <div className="my-beads-filters">
              <select value={invKind} onChange={(e) => { setInvKind(e.target.value); setInvPaletteId(e.target.value === 'builtin' ? 'perler' : (palettes[0]?.id || '')) }}>
                <option value="builtin">{t('myBeads.inventory.builtin')}</option>
                <option value="user">{t('myBeads.inventory.personal')}</option>
              </select>
              <select value={invPaletteId} onChange={(e) => setInvPaletteId(e.target.value)}>
                {invKind === 'builtin'
                  ? PALETTE_LIST.map((p) => <option key={p.id} value={p.id}>{t(`palette.brand.${p.id}`)}</option>)
                  : palettes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <label className="my-beads-search">
                <Search size={14} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('myBeads.inventory.search')} />
              </label>
              {/* 规格 05 §3:按拥有/不足/缺货/未记录筛选 */}
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                aria-label={t('myBeads.inventory.filterLabel')}
              >
                <option value="all">{t('myBeads.inventory.filterAll')}</option>
                <option value="owned">{t('myBeads.inventory.filterOwned')}</option>
                <option value="low">{t('myBeads.inventory.filterLow')}</option>
                <option value="out">{t('myBeads.inventory.filterOut')}</option>
                <option value="unknown">{t('myBeads.inventory.filterUnknown')}</option>
              </select>
            </div>

            <div className="my-beads-inv-stats">
              <span>{t('myBeads.inventory.ownedCount', { n: inventoryStats.owned })}</span>
              <span>{t('myBeads.inventory.outCount', { n: inventoryStats.out })}</span>
              <span>{t('myBeads.inventory.unknownCount', { n: inventoryStats.unknown })}</span>
              <span>{t('myBeads.inventory.totalQty', { n: inventoryStats.totalQty })}</span>
            </div>

            {/* 批量编辑(规格 05 §3):勾选行后出现,逐条写入并如实报告成功/失败数 */}
            {selectedKeys.size > 0 && (
              <div className="my-beads-batch" role="region" aria-label={t('myBeads.inventory.batchTitle')}>
                <span className="my-beads-batch-count">
                  {t('myBeads.inventory.batchSelected', { n: selectedKeys.size })}
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="qty-input"
                  value={batchQty}
                  onChange={(e) => setBatchQty(e.target.value)}
                  placeholder={t('myBeads.inventory.batchQtyPlaceholder')}
                  aria-label={t('myBeads.inventory.batchQtyPlaceholder')}
                />
                <button type="button" className="my-beads-btn secondary" disabled={busy} onClick={applyBatchQty}>
                  {t('myBeads.inventory.batchSetQty')}
                </button>
                <button type="button" className="my-beads-btn ghost" disabled={busy} onClick={() => applyBatchStatus('owned')}>
                  {t('myBeads.inventory.markOwned')}
                </button>
                <button type="button" className="my-beads-btn ghost" disabled={busy} onClick={() => applyBatchStatus('out_of_stock')}>
                  {t('myBeads.inventory.markOut')}
                </button>
                <button type="button" className="my-beads-btn ghost" disabled={busy} onClick={clearBatch}>
                  {t('myBeads.inventory.batchClear')}
                </button>
                <button type="button" className="my-beads-btn ghost" onClick={() => setSelectedKeys(new Set())}>
                  {t('myBeads.inventory.batchCancel')}
                </button>
              </div>
            )}

            {invColors.length === 0 ? (
              <p className="my-beads-hint">{t('myBeads.inventory.empty')}</p>
            ) : filteredInvColors.length === 0 ? (
              <p className="my-beads-hint">{t('myBeads.inventory.filterEmpty')}</p>
            ) : (
              <>
                <label className="my-beads-select-all">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                  />
                  <span>{t('myBeads.inventory.selectAll')}</span>
                </label>
                <ul className="my-beads-inv-list">
                  {filteredInvColors.map((c) => {
                    const rec = store.inventoryByKey.get(c.key)
                    const qty = rec?.quantity
                    return (
                      <li key={c.key} className={`my-beads-inv-row${selectedKeys.has(c.key) ? ' selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(c.key)}
                          onChange={() => toggleKey(c.key)}
                          aria-label={`${t('myBeads.inventory.selectRow')} ${c.code}`}
                        />
                        <span className="swatch" style={{ background: c.hex }} />
                        <span className="code">{c.code}</span>
                        <span className="name">{c.name || ''}</span>
                        <span className="hex">{c.hex}</span>
                        <div className="stock-controls">
                          <button
                            type="button"
                            className={`stock-btn ${rec ? 'on' : ''}`}
                            title={t('myBeads.inventory.markOwned')}
                            onClick={() => updateStock(c, { status: 'owned' })}
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            className={`stock-btn ${rec?.status === 'out_of_stock' ? 'out' : ''}`}
                            title={t('myBeads.inventory.markOut')}
                            onClick={() => updateStock(c, { status: 'out_of_stock' })}
                          >
                            <X size={13} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="qty-input"
                            value={qty === null || qty === undefined ? '' : qty}
                            placeholder={t('myBeads.inventory.qtyUnknown')}
                            onChange={(e) => {
                              const v = e.target.value
                              updateStock(c, { quantity: v === '' ? null : Math.max(0, Math.trunc(Number(v) || 0)) })
                            }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>
        )}

        {/* ═══ 图纸匹配 ═══════════════════════════════════════ */}
        {tab === TAB_MATCH && (
          <section className="my-beads-section">
            <div className="my-beads-section-head">
              <h2>{t('myBeads.match.title')}</h2>
            </div>
            <p className="my-beads-hint small">{t('myBeads.match.hint')}</p>

            <div className="my-beads-filters">
              <select value={targetKind} onChange={(e) => { setTargetKind(e.target.value); setTargetId(e.target.value === 'builtin' ? 'perler' : (palettes[0]?.id || '')) }}>
                <option value="builtin">{t('myBeads.match.targetBuiltin')}</option>
                <option value="user">{t('myBeads.match.targetPersonal')}</option>
              </select>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {targetKind === 'builtin'
                  ? PALETTE_LIST.map((p) => <option key={p.id} value={p.id}>{t(`palette.brand.${p.id}`)}</option>)
                  : palettes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <label className="my-beads-size">
                <span>{t('myBeads.match.requiredSize')}</span>
                <input type="number" min="0.1" max="20" step="0.1" value={requiredSize} onChange={(e) => setRequiredSize(e.target.value)} placeholder={t('myBeads.match.sizeUnknown')} />
              </label>
              <label className="my-beads-size">
                <span>{t('myBeads.match.threshold')}</span>
                <input type="number" min="0" max="30" step="0.5" value={closeThreshold} onChange={(e) => setCloseThreshold(e.target.value)} />
              </label>
            </div>

            {previewPattern.length === 0 ? (
              <p className="my-beads-hint">{t('myBeads.match.emptyCanvas')}</p>
            ) : (
              <>
                <div className="my-beads-match-preview">
                  <div className="my-beads-thumb">
                    <ThumbnailCanvas
                      pattern={previewPattern}
                      gridWidth={previewPattern[0]?.length || 0}
                      gridHeight={previewPattern.length}
                    />
                  </div>
                  <div className="my-beads-match-summary">
                    <span>{t('myBeads.match.summaryColors', { n: matchResult.summary?.colorCount ?? 0 })}</span>
                    <span>{t('myBeads.match.summaryBeads', { n: matchResult.summary?.requiredBeads ?? 0 })}</span>
                    <span>{t('myBeads.match.summaryShortage', { n: matchResult.summary?.shortageBeads ?? 0 })}</span>
                  </div>
                </div>

                <div className="my-beads-match-actions">
                  <button type="button" className="my-beads-btn secondary" onClick={acceptAuto}>
                    {t('myBeads.match.acceptAuto')}
                  </button>
                  <button type="button" className="my-beads-btn primary" disabled={busy} onClick={applyAccepted}>
                    {t('myBeads.match.apply', { n: Object.keys(accepted).length })}
                  </button>
                </div>

                <div className="my-beads-table-wrap">
                  <table className="my-beads-match-table">
                    <thead>
                      <tr>
                        <th aria-label={t('myBeads.match.accept')}></th>
                        <th>{t('myBeads.match.source')}</th>
                        <th>{t('myBeads.match.target')}</th>
                        <th>ΔE00</th>
                        <th>{t('myBeads.match.required')}</th>
                        <th>{t('myBeads.match.stock')}</th>
                        <th>{t('myBeads.match.shortage')}</th>
                        <th>{t('myBeads.match.statusLabel')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveItems.map((item) => {
                        const checked = !!accepted[item.sourceHex]
                        return (
                          <tr key={item.sourceHex} className={checked ? 'accepted' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!item.targetColor}
                                aria-label={`${t('myBeads.match.accept')} ${item.sourceHex}`}
                                onChange={() => toggleAccept(item.sourceHex)}
                              />
                            </td>
                            <td>
                              <span className="swatch" style={{ background: item.sourceHex }} />
                              <code>{item.sourceHex}</code>
                            </td>
                            <td>
                              {item.targetColor ? (
                                <>
                                  <span className="swatch" style={{ background: item.targetColor.hex }} />
                                  <code>{item.targetColor.code}</code>
                                  <select
                                    className="override-select"
                                    aria-label={t('myBeads.match.manualPick')}
                                    value={overrides[item.sourceHex] || item.targetColor.id}
                                    onChange={(e) => setOverrides((prev) => ({ ...prev, [item.sourceHex]: e.target.value }))}
                                  >
                                    {targetCandidates.map((c) => (
                                      <option key={c.id} value={c.id}>{c.code}</option>
                                    ))}
                                  </select>
                                </>
                              ) : '—'}
                            </td>
                            <td>{item.deltaE00 === null ? '—' : item.deltaE00.toFixed(2)}</td>
                            <td>{item.requiredCount}</td>
                            <td>{item.stockCount === null ? t('myBeads.match.unknown') : item.stockCount}</td>
                            <td>{item.shortageCount === null ? '—' : item.shortageCount}</td>
                            <td>
                              {statusBadges(item).map((badge) => (
                                <span key={badge.key} className={`status-badge ${badge.cls}`}>{t(badge.key)}</span>
                              ))}
                              {item.manual && <span className="status-badge manual">{t('myBeads.match.manual')}</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="my-beads-shopping">
                  <h3>{t('myBeads.match.shoppingTitle')}</h3>
                  {shopping.need.length === 0 ? (
                    <p className="my-beads-hint small">{t('myBeads.match.shoppingEmpty')}</p>
                  ) : (
                    <ul>
                      {shopping.need.map((item) => (
                        <li key={item.targetColor.id}>
                          <span className="swatch" style={{ background: item.targetColor.hex }} />
                          <code>{item.targetColor.code}</code>
                          <span>{t('myBeads.match.buy', { n: item.shortageCount })}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {shopping.unknown.length > 0 && (
                    <p className="my-beads-hint small">
                      {t('myBeads.match.shoppingUnknown', { n: shopping.unknown.length })}
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* ── 色卡编辑弹层(portal 到 body) ─────────────────── */}
      {editingPalette && createPortal(
        <div className="my-beads-modal-overlay" onClick={() => setEditingPalette(null)}>
          <div className="my-beads-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{editingPalette.id ? t('myBeads.palettes.editTitle') : t('myBeads.palettes.newTitle')}</h3>
            <label>
              <span>{t('myBeads.palettes.name')} *</span>
              <input
                value={editingPalette.name}
                maxLength={MAX_PALETTE_NAME}
                onChange={(e) => setEditingPalette({ ...editingPalette, name: e.target.value })}
                placeholder={t('myBeads.palettes.namePlaceholder')}
              />
            </label>
            <label>
              <span>{t('myBeads.palettes.brandName')}</span>
              <input
                value={editingPalette.brandName}
                maxLength={MAX_PALETTE_NAME}
                onChange={(e) => setEditingPalette({ ...editingPalette, brandName: e.target.value })}
              />
            </label>
            <label>
              <span>{t('myBeads.palettes.seriesName')}</span>
              <input
                value={editingPalette.seriesName}
                maxLength={MAX_PALETTE_NAME}
                onChange={(e) => setEditingPalette({ ...editingPalette, seriesName: e.target.value })}
              />
            </label>
            <label>
              <span>{t('myBeads.palettes.beadSize')}</span>
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={editingPalette.beadSizeMm}
                onChange={(e) => setEditingPalette({ ...editingPalette, beadSizeMm: e.target.value })}
                placeholder={t('myBeads.palettes.beadSizePlaceholder')}
              />
            </label>
            <label>
              <span>{t('myBeads.palettes.notes')}</span>
              <textarea
                rows={2}
                value={editingPalette.notes}
                onChange={(e) => setEditingPalette({ ...editingPalette, notes: e.target.value })}
              />
            </label>
            <div className="my-beads-modal-actions">
              <button type="button" className="my-beads-btn ghost" onClick={() => setEditingPalette(null)}>{t('common.cancel')}</button>
              <button type="button" className="my-beads-btn primary" disabled={busy} onClick={savePalette}>{t('common.save')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── 颜色编辑弹层(portal 到 body) ─────────────────── */}
      {editingColor && createPortal(
        <div className="my-beads-modal-overlay" onClick={() => setEditingColor(null)}>
          <div className="my-beads-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{editingColor.id ? t('myBeads.colors.editTitle') : t('myBeads.colors.newTitle')}</h3>
            <label>
              <span>{t('myBeads.colors.code')} *</span>
              <input
                value={editingColor.code}
                maxLength={MAX_COLOR_CODE}
                onChange={(e) => setEditingColor({ ...editingColor, code: e.target.value })}
                placeholder="A1"
              />
            </label>
            <label>
              <span>{t('myBeads.colors.name')}</span>
              <input
                value={editingColor.name || ''}
                onChange={(e) => setEditingColor({ ...editingColor, name: e.target.value })}
              />
            </label>
            <label>
              <span>{t('myBeads.colors.hex')} *</span>
              <div className="my-beads-hex-row">
                <input
                  value={editingColor.hex}
                  onChange={(e) => setEditingColor({ ...editingColor, hex: e.target.value })}
                  placeholder="#RRGGBB"
                />
                <span className="swatch big" style={{ background: normalizeColorInput(editingColor).ok ? editingColor.hex : 'transparent' }} />
              </div>
            </label>
            <label>
              <span>{t('myBeads.colors.notes')}</span>
              <input
                value={editingColor.notes || ''}
                onChange={(e) => setEditingColor({ ...editingColor, notes: e.target.value })}
              />
            </label>
            {/* 规格 05 §2 P0:来源/置信度(原厂色值 / 实测 / 估算) */}
            <label>
              <span>{t('myBeads.colors.source')}</span>
              <select
                value={editingColor.source || DEFAULT_COLOR_SOURCE}
                onChange={(e) => setEditingColor({ ...editingColor, source: e.target.value })}
              >
                {Object.values(COLOR_SOURCES).map((s) => (
                  <option key={s} value={s}>{t(`myBeads.colors.sources.${s}`)}</option>
                ))}
              </select>
            </label>
            <div className="my-beads-modal-actions">
              <button type="button" className="my-beads-btn ghost" onClick={() => setEditingColor(null)}>{t('common.cancel')}</button>
              <button type="button" className="my-beads-btn primary" disabled={busy} onClick={saveColor}>{t('common.save')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── 删除确认(portal 到 body) ─────────────────────── */}
      {confirmDelete && createPortal(
        <div className="my-beads-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="my-beads-modal confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle size={20} className="warn-icon" />
            <h3>{confirmDelete.kind === 'palette' ? t('myBeads.palettes.deleteTitle') : t('myBeads.colors.deleteTitle')}</h3>
            <p>{t('myBeads.deleteBody', { name: confirmDelete.name })}</p>
            <p className="my-beads-hint small">{t('myBeads.deleteKeepCanvas')}</p>
            <div className="my-beads-modal-actions">
              <button type="button" className="my-beads-btn ghost" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</button>
              <button type="button" className="my-beads-btn danger" onClick={doDeletePalette}>{t('common.delete')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** 颜色列表(色卡详情内复用;含库存标记、来源徽章、复制 HEX 与编辑/删除) */
function ColorList({ colors, totalColors, inventoryByKey, onEdit, onDelete, onCopyHex, keyFor, t }) {
  if (!colors || colors.length === 0) {
    // 区分「这张色卡本来就没有颜色」与「搜索无结果」—— 后者不能提示去添加颜色
    const searched = (totalColors || 0) > 0
    return (
      <p className="my-beads-hint small">
        {searched ? t('myBeads.colors.searchEmpty') : t('myBeads.colors.empty')}
      </p>
    )
  }
  return (
    <ul className="my-beads-color-list">
      {colors.map((c) => {
        const rec = inventoryByKey.get(keyFor(c))
        const source = c.source || DEFAULT_COLOR_SOURCE
        return (
          <li key={c.id} className="my-beads-color-row">
            <span className="swatch" style={{ background: c.hex }} />
            <code>{c.code}</code>
            <span className="name">{c.name || ''}</span>
            <span className="hex">{c.hex}</span>
            <span className={`source-tag ${source}`} title={t(`myBeads.colors.sources.${source}`)}>
              {t(`myBeads.colors.sources.${source}`)}
            </span>
            {rec && (
              <span className="inv-tag">
                {rec.quantity === null || rec.quantity === undefined
                  ? t('myBeads.inventory.ownedOnly')
                  : t('myBeads.inventory.qtyTag', { n: rec.quantity })}
              </span>
            )}
            <div className="my-beads-row-actions">
              <button
                type="button"
                className="my-beads-icon-btn"
                title={t('myBeads.colors.copyHex')}
                aria-label={`${t('myBeads.colors.copyHex')} ${c.hex}`}
                onClick={() => onCopyHex?.(c.hex)}
              >
                <ClipboardCopy size={14} />
              </button>
              <button type="button" className="my-beads-icon-btn" title={t('common.edit')} onClick={() => onEdit(c)}>
                <Pencil size={14} />
              </button>
              <button type="button" className="my-beads-icon-btn danger" title={t('common.delete')} onClick={() => onDelete(c)}>
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
