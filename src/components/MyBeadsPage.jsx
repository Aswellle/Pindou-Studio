/**
 * MyBeadsPage — /my/beads 个人色卡与库存
 *
 * 规格:docs/implementation/Pindou-Studio-my-beads-ui-ux-refactor.md
 *
 * 本文件只做**编排**:持有跨 Tab 的状态与数据访问,把三个工作区交给
 * features/my-beads/ 下的子组件渲染。子组件不重复调用 useUserPalettes。
 *
 * 三个工作区:
 *   1. 我的色卡 —— 创建 / 复制内置色卡 / 颜色 CRUD;
 *   2. 我的库存 —— 逐色登记拥有状态与数量(草稿 + 提交);
 *   3. 图纸匹配 —— 目标色卡、匹配结果、临时预览、明确应用。
 *
 * 数据访问全部经 useUserPalettes(登录 → Supabase + RLS;未登录 → localStorage)。
 * 画布只存 HEX:删除个人色卡不会让已保存图纸变黑。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Plus, Trash2, Pencil, Copy, Search, AlertTriangle,
  Palette as PaletteIcon, Layers, Package, Sparkles, Download, Upload, ClipboardCopy,
} from 'lucide-react'
import { useToast } from '../components/Toast'
import { useScrollLock } from '../hooks/useScrollLock'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { PALETTE_LIST } from '../data/palettes'
import { useUserPalettes } from '../hooks/useUserPalettes'
import {
  normalizePaletteInput,
  normalizeColorInput,
  paletteKeyForUser,
  PALETTE_ERRORS,
  COLOR_SOURCES,
  DEFAULT_COLOR_SOURCE,
  MAX_COLOR_CODE,
} from '../services/beads/personalPalette'
import {
  buildBeadBackup,
  parseBeadBackup,
  planMerge,
  BACKUP_ERRORS,
} from '../services/beads/backup'
import {
  buildCsvTemplate,
  parseColorImport,
  IMPORT_ERRORS,
} from '../services/beads/colorImport'
import { applyColorMapping } from '../services/beads/inventoryMatch'
import PaletteSetupDialog from '../features/my-beads/PaletteSetupDialog'
import CopyBuiltinPaletteDialog from '../features/my-beads/CopyBuiltinPaletteDialog'
import { PaletteEmptyState, CopyResultPanel } from '../features/my-beads/PaletteGettingStarted'
import InventoryWorkspace from '../features/my-beads/InventoryWorkspace'
import MatchWorkspace from '../features/my-beads/MatchWorkspace'
import './myBeadsPage.css'

const TAB_PALETTES = 'palettes'
const TAB_INVENTORY = 'inventory'
const TAB_MATCH = 'match'

const TABS = [
  { id: TAB_PALETTES, icon: Layers, labelKey: 'myBeads.tabs.palettes', hintKey: 'myBeads.tabHints.palettes' },
  { id: TAB_INVENTORY, icon: Package, labelKey: 'myBeads.tabs.inventory', hintKey: 'myBeads.tabHints.inventory' },
  { id: TAB_MATCH, icon: Sparkles, labelKey: 'myBeads.tabs.match', hintKey: 'myBeads.tabHints.match' },
]

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
  [IMPORT_ERRORS.EMPTY]: 'myBeads.colors.import.errors.empty',
  [IMPORT_ERRORS.NO_HEADER]: 'myBeads.colors.import.errors.noHeader',
  [IMPORT_ERRORS.MISSING_COLUMN]: 'myBeads.colors.import.errors.missingColumn',
  [IMPORT_ERRORS.TOO_MANY_ROWS]: 'myBeads.colors.import.errors.tooManyRows',
  [IMPORT_ERRORS.BAD_JSON]: 'myBeads.colors.import.errors.badJson',
  [IMPORT_ERRORS.BAD_SHAPE]: 'myBeads.colors.import.errors.badShape',
}

export default function MyBeadsPage({ user, canvasData, onApplyMapping, works = [], onReassignWorkPalette }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const store = useUserPalettes(user)

  const [tab, setTab] = useState(TAB_PALETTES)
  const [selectedPaletteId, setSelectedPaletteId] = useState(null)
  const [colorSearch, setColorSearch] = useState('')
  const [editingPalette, setEditingPalette] = useState(null) // { id?, ...fields }
  const [editingColor, setEditingColor] = useState(null) // { id?, ...fields }
  const [confirmDelete, setConfirmDelete] = useState(null) // { kind, id?, key?, name/code }
  const [copyTarget, setCopyTarget] = useState(null) // 待复制的内置色卡
  const [copyResult, setCopyResult] = useState(null) // { paletteId, name, colorCount }
  const [colorImport, setColorImport] = useState(null) // { filename, drafts, errors, fatal }
  // 删除被引用色卡时的重新指定目标('' = 保留作品里的 HEX,不改 paletteId)
  const [reassignTargetId, setReassignTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [highlightBuiltin, setHighlightBuiltin] = useState(false)

  const detailRef = useRef(null)
  const builtinRef = useRef(null)

  // 浮层共享一把滚动锁;全部 portal 到 body
  useScrollLock(!!(editingPalette || editingColor || confirmDelete || copyTarget))

  // 可访问性(规格 08 §5):四个浮层各自独立入栈,Escape 只关最上面那层
  const { ref: paletteDialogRef, dialogProps: paletteDialogProps } = useDialogA11y({
    open: !!editingPalette,
    onClose: () => setEditingPalette(null),
    label: editingPalette?.id ? t('myBeads.palettes.editTitle') : t('myBeads.palettes.newTitle'),
  })
  const { ref: colorDialogRef, dialogProps: colorDialogProps } = useDialogA11y({
    open: !!editingColor,
    onClose: () => setEditingColor(null),
    label: editingColor?.id ? t('myBeads.colors.editTitle') : t('myBeads.colors.newTitle'),
  })
  const { ref: deleteDialogRef, dialogProps: deleteDialogProps } = useDialogA11y({
    open: !!confirmDelete,
    onClose: () => { if (!busy) setConfirmDelete(null) },
    disabled: busy,
    label: confirmDelete?.kind === 'palette' ? t('myBeads.palettes.deleteTitle') : t('myBeads.colors.deleteTitle'),
    role: 'alertdialog',
  })
  const { ref: copyDialogRef, dialogProps: copyDialogProps } = useDialogA11y({
    open: !!copyTarget,
    onClose: () => setCopyTarget(null),
    label: t('myBeads.copy.title'),
  })

  const palettes = store.palettes
  const selectedPalette = useMemo(
    () => palettes.find((p) => p.id === selectedPaletteId) || null,
    [palettes, selectedPaletteId],
  )

  const hasCanvas = useMemo(
    () => !!canvasData && canvasData.some((row) => Array.isArray(row) && row.some(Boolean)),
    [canvasData],
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: 切换色卡时清空颜色搜索,selectedPaletteId 只作触发信号
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

  const scrollToDetail = () => {
    // jsdom 没有布局,scrollIntoView 也不一定存在
    if (typeof detailRef.current?.scrollIntoView === 'function') {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

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
      if (!editingPalette.id) {
        setSelectedPaletteId(res.palette.id)
        // 新建后滚到详情区,让用户看到「添加颜色」入口
        setTimeout(scrollToDetail, 0)
      }
    }
  }

  // ── 删除色卡:若被作品引用,提供「保留 HEX / 重新指定色卡 / 取消」──
  const referencingWorks = useMemo(() => {
    if (confirmDelete?.kind !== 'palette') return []
    return (works || []).filter((w) => w.paletteId === confirmDelete.id)
  }, [confirmDelete, works])

  const doDelete = async () => {
    if (!confirmDelete) return
    const target = confirmDelete
    setConfirmDelete(null)
    if (target.kind === 'palette') {
      await run(() => store.deletePalette(target.id), 'myBeads.paletteDeleted')
    } else if (target.kind === 'color') {
      await run(() => store.deleteColor(target.id), 'myBeads.colorDeleted')
    } else if (target.kind === 'inventory') {
      await run(() => store.removeInventory(target.key), 'myBeads.inventory.batchCleared', { n: 1 })
    }
  }

  /** 删除前把引用该色卡的作品重新指定到目标色卡(保留 canvasData 不变) */
  const deletePaletteWithReassign = async (targetPaletteId) => {
    const target = confirmDelete
    if (target?.kind !== 'palette') return
    setConfirmDelete(null)
    setBusy(true)
    try {
      let reassigned = 0
      for (const w of referencingWorks) {
        const ok = await onReassignWorkPalette?.(w, targetPaletteId)
        if (ok) reassigned++
      }
      // 有任何一件没改成功就停下:否则作品会指向一张已被删除的色卡
      if (reassigned < referencingWorks.length) {
        toast(t('myBeads.palettes.reassignFailed', {
          failed: referencingWorks.length - reassigned,
        }), 'error')
        return
      }
      const res = await store.deletePalette(target.id)
      if (!res.ok) {
        toast(errorText(res.errors?.[0]), 'error')
        return
      }
      toast(t('myBeads.palettes.reassignedDeleted', { n: reassigned }), 'success')
    } finally {
      setBusy(false)
    }
  }

  // 打开删除确认时重置「重新指定」目标
  // biome-ignore lint/correctness/useExhaustiveDependencies: 打开删除确认时重置目标,confirmDelete 只作触发信号
  useEffect(() => { setReassignTargetId('') }, [confirmDelete])

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

  // ── 批量颜色导入(CSV / JSON)─────────────────────────────
  const colorFileRef = useRef(null)

  /** 下载 CSV 模板(带 BOM,Excel 直接打开不乱码) */
  const downloadColorTemplate = () => {
    const blob = new Blob([buildCsvTemplate()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pindou-colors-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onColorFilePicked = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedPalette) return
    let text = ''
    try {
      text = await file.text()
    } catch {
      toast(t('myBeads.colors.import.errors.readFailed'), 'error')
      return
    }
    const siblings = store.colorsByPalette.get(selectedPalette.id) || []
    const parsed = parseColorImport(text, { filename: file.name, existingColors: siblings })
    // 预览:即使有错误行也先把可导入的部分展示出来,由用户确认
    setColorImport({
      filename: file.name,
      drafts: parsed.ok ? parsed.drafts : [],
      errors: parsed.errors || [],
      fatal: !parsed.ok,
    })
  }

  /** 用户确认后才写入:整批一次提交,失败则整体不写 */
  const confirmColorImport = async () => {
    if (!colorImport || !selectedPalette) return
    const drafts = colorImport.drafts || []
    if (drafts.length === 0) return
    setBusy(true)
    try {
      const res = await store.addColors(selectedPalette.id, drafts)
      if (!res.ok) {
        toast(errorText(res.errors?.[0]), 'error')
        return
      }
      toast(t('myBeads.colors.import.imported', { n: drafts.length }), 'success')
      setColorImport(null)
    } finally {
      setBusy(false)
    }
  }

  // ── 复制内置色卡(替换 window.prompt)──────────────────────
  const openCopyBuiltin = (builtin) => setCopyTarget(builtin)

  const confirmCopyBuiltin = async (name) => {
    const builtin = copyTarget
    if (!builtin) return
    const res = await run(
      () => store.copyBuiltinPalette(builtin, name),
      'myBeads.copied',
    )
    if (!res?.ok) return // 失败时保持弹层打开,输入不丢
    setCopyTarget(null)
    setTab(TAB_PALETTES)
    setSelectedPaletteId(res.palette.id)
    setCopyResult({
      paletteId: res.palette.id,
      name: res.palette.name,
      colorCount: (res.colors || []).length,
    })
    setTimeout(scrollToDetail, 0)
  }

  /** 空状态里的「复制品牌色卡」:滚动并高亮内置目录 */
  const focusBuiltinDirectory = () => {
    setHighlightBuiltin(true)
    if (typeof builtinRef.current?.scrollIntoView === 'function') {
      builtinRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setTimeout(() => setHighlightBuiltin(false), 2400)
  }

  // ── 库存 ───────────────────────────────────────────────────
  const [invKind, setInvKind] = useState('builtin')
  const [invPaletteId, setInvPaletteId] = useState('perler')

  // 个人色卡增删后修正库存目标,避免指向已删除的色卡
  useEffect(() => {
    if (invKind !== 'user') return
    if (!palettes.some((p) => p.id === invPaletteId)) {
      setInvPaletteId(palettes[0]?.id || '')
    }
  }, [invKind, invPaletteId, palettes])

  const changeInvSource = (next) => {
    setInvKind(next)
    setInvPaletteId(next === 'builtin' ? 'perler' : (palettes[0]?.id || ''))
  }

  const commitQuantity = useCallback(async (color, quantity, status, opts = {}) => {
    const existing = store.inventoryByKey.get(color.key)
    const res = await store.setInventory({
      paletteKey: color.key,
      paletteColorId: invKind === 'user' ? color.id : null,
      quantity,
      status,
      notes: existing?.notes || '',
    })
    if (!res.ok && !opts.silent && res.errors?.[0]) toast(errorText(res.errors[0]), 'error')
    return res
  }, [store, invKind, toast, errorText])

  const clearInventory = useCallback(async (color, opts = {}) => {
    const res = await store.removeInventory(color.key)
    if (!res.ok && !opts.silent && res.errors?.[0]) toast(errorText(res.errors[0]), 'error')
    return res
  }, [store, toast, errorText])

  const onBatchDone = useCallback(({ ok, failed, successKey }) => {
    if (failed > 0) toast(t('myBeads.inventory.batchPartial', { ok, failed }), 'error')
    else toast(t(successKey, { n: ok }), 'success')
  }, [toast, t])

  // ── 匹配 ───────────────────────────────────────────────────
  const [targetKind, setTargetKind] = useState('builtin')
  const [targetId, setTargetId] = useState('perler')

  // 个人色卡增删后修正匹配目标
  useEffect(() => {
    if (targetKind !== 'user') return
    if (!palettes.some((p) => p.id === targetId)) {
      setTargetId(palettes[0]?.id || '')
    }
  }, [targetKind, targetId, palettes])

  const changeMatchTarget = (nextKind, nextId) => {
    setTargetKind(nextKind)
    setTargetId(nextId)
  }

  const applyMapping = (entries) => {
    const res = applyColorMapping(canvasData, entries)
    if (!res.data) { toast(t('myBeads.match.noChange'), 'info'); return }
    onApplyMapping?.(res.data)
    toast(t('myBeads.match.applied', { n: res.changed }), 'success')
    navigate('/')
  }

  // ── 备份导出 / 导入(仅本地模式)───────────────────────────
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
    } catch {
      toast(t('myBeads.backup.errors.readFailed'), 'error')
      return
    }
    const parsed = parseBeadBackup(text)
    if (!parsed.ok) {
      toast(errorText(parsed.errors[0]), 'error')
      return
    }
    const plan = planMerge(store.exportBackup(), parsed.backup)
    const planTotal = plan.palettes.length + plan.colors.length + plan.inventory.length
    if (planTotal === 0) {
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

  // ── 复制结果的后续跳转(规格 §4.3)──────────────────────────
  const goInventoryFromCopy = () => {
    if (!copyResult) return
    setInvKind('user')
    setInvPaletteId(copyResult.paletteId)
    setTab(TAB_INVENTORY)
  }

  const goMatchFromCopy = () => {
    if (!copyResult) return
    setTargetKind('user')
    setTargetId(copyResult.paletteId)
    setTab(TAB_MATCH)
  }

  const goColorsFromCopy = () => {
    if (!copyResult) return
    setTab(TAB_PALETTES)
    setSelectedPaletteId(copyResult.paletteId)
    setTimeout(scrollToDetail, 0)
  }

  const paletteColorCount = selectedPalette
    ? (store.colorsByPalette.get(selectedPalette.id) || []).length
    : 0

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

        {store.mode === 'cloud' && store.pendingLocal > 0 && (
          <div className="my-beads-banner">
            <span>{t('myBeads.pendingLocal', { n: store.pendingLocal })}</span>
            <button type="button" className="my-beads-btn secondary" disabled={busy} onClick={() => run(() => store.importLocal(), 'myBeads.imported')}>
              {t('myBeads.importLocal')}
            </button>
          </div>
        )}

        <nav className="my-beads-tabs" role="tablist" aria-label={t('myBeads.title')}>
          {TABS.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`my-beads-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`my-beads-panel-${id}`}
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />{t(labelKey)}
            </button>
          ))}
        </nav>
        <p className="my-beads-tab-hint">
          {t(TABS.find((x) => x.id === tab)?.hintKey || 'myBeads.tabHints.palettes')}
        </p>

        {/* ═══ 我的色卡 ═══════════════════════════════════════ */}
        {tab === TAB_PALETTES && (
          <div role="tabpanel" id={`my-beads-panel-${TAB_PALETTES}`} aria-labelledby={`my-beads-tab-${TAB_PALETTES}`} className="my-beads-panel">
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
                <PaletteEmptyState
                  onCopyBuiltin={focusBuiltinDirectory}
                  onNewPalette={openNewPalette}
                  hasCanvas={hasCanvas}
                />
              ) : (
                <div className="my-beads-palette-list">
                  {palettes.map((p) => {
                    const count = (store.colorsByPalette.get(p.id) || []).length
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={selectedPaletteId === p.id}
                        className={`my-beads-palette-card ${selectedPaletteId === p.id ? 'active' : ''}`}
                        onClick={() => setSelectedPaletteId(p.id)}
                      >
                        <PaletteIcon size={16} />
                        <span className="name">{p.name}</span>
                        <span className="meta">
                          {p.brandName || t('myBeads.unknown')}
                          {p.beadSizeMm ? ` · ${p.beadSizeMm}mm` : ''}
                          {` · ${t('myBeads.palettes.colorCount', { n: count })}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {copyResult && (
                <CopyResultPanel
                  paletteName={copyResult.name}
                  colorCount={copyResult.colorCount}
                  hasCanvas={hasCanvas}
                  onDismiss={() => setCopyResult(null)}
                  onGoColors={goColorsFromCopy}
                  onGoInventory={goInventoryFromCopy}
                  onGoMatch={goMatchFromCopy}
                  onGoCanvas={() => navigate('/')}
                />
              )}

              {selectedPalette && (
                <div className="my-beads-palette-detail" ref={detailRef}>
                  <div className="my-beads-section-head">
                    <h3>{selectedPalette.name}</h3>
                    <div className="my-beads-row-actions">
                      <button type="button" className="my-beads-btn secondary" onClick={() => openEditPalette(selectedPalette)}>
                        <Pencil size={14} />{t('myBeads.palettes.editInfo')}
                      </button>
                      <button
                        type="button"
                        className="my-beads-icon-btn danger"
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                        onClick={() => setConfirmDelete({ kind: 'palette', id: selectedPalette.id, name: selectedPalette.name })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <dl className="palette-meta">
                    <div><dt>{t('myBeads.palettes.brandName')}</dt><dd>{selectedPalette.brandName || t('myBeads.unknown')}</dd></div>
                    <div><dt>{t('myBeads.palettes.seriesName')}</dt><dd>{selectedPalette.seriesName || t('myBeads.unknown')}</dd></div>
                    <div><dt>{t('myBeads.palettes.beadSize')}</dt><dd>{selectedPalette.beadSizeMm ? `${selectedPalette.beadSizeMm} mm` : t('myBeads.unknown')}</dd></div>
                    <div><dt>{t('myBeads.colors.code')}</dt><dd>{t('myBeads.palettes.colorCount', { n: paletteColorCount })}</dd></div>
                  </dl>

                  {/* 颜色列表支持按色号/名称/HEX 搜索 */}
                  <div className="my-beads-color-toolbar">
                    <label className="my-beads-search my-beads-color-search">
                      <Search size={14} />
                      <input
                        value={colorSearch}
                        onChange={(e) => setColorSearch(e.target.value)}
                        placeholder={t('myBeads.colors.search')}
                        aria-label={t('myBeads.colors.search')}
                      />
                    </label>
                    <button type="button" className="my-beads-btn ghost" onClick={downloadColorTemplate}>
                      <Download size={14} />{t('myBeads.colors.import.template')}
                    </button>
                    <button
                      type="button"
                      className="my-beads-btn ghost"
                      disabled={busy}
                      onClick={() => colorFileRef.current?.click()}
                    >
                      <Upload size={14} />{t('myBeads.colors.import.button')}
                    </button>
                    <button type="button" className="my-beads-btn primary" onClick={openNewColor}>
                      <Plus size={14} />{t('myBeads.colors.new')}
                    </button>
                    <input
                      ref={colorFileRef}
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      className="my-beads-file-input my-beads-color-file-input"
                      onChange={onColorFilePicked}
                    />
                  </div>

                  {/* 导入预览:先看清要写入什么、哪些行有问题,再决定 */}
                  {colorImport && (
                    <div className="my-beads-import-preview" role="region" aria-label={t('myBeads.colors.import.previewTitle')}>
                      <div className="my-beads-import-head">
                        <strong>{t('myBeads.colors.import.previewTitle')}</strong>
                        <span className="my-beads-hint small">{colorImport.filename}</span>
                        <button type="button" className="my-beads-btn ghost" onClick={() => setColorImport(null)}>
                          {t('common.cancel')}
                        </button>
                      </div>
                      <p className="my-beads-hint small">
                        {t('myBeads.colors.import.summary', {
                          ok: colorImport.drafts.length,
                          bad: colorImport.errors.length,
                        })}
                      </p>
                      {colorImport.drafts.length > 0 && (
                        <ul className="my-beads-import-list">
                          {colorImport.drafts.slice(0, 50).map((d) => (
                            <li key={`${d.row}-${d.code}`}>
                              <span className="swatch" style={{ background: d.hex }} />
                              <code>{d.code}</code>
                              <span className="name">{d.name || ''}</span>
                              <span className="hex">{d.hex}</span>
                              <span className={`source-tag ${d.source}`}>
                                {t(`myBeads.colors.sources.${d.source}`)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {colorImport.drafts.length > 50 && (
                        <p className="my-beads-hint small">
                          {t('myBeads.colors.import.more', { n: colorImport.drafts.length - 50 })}
                        </p>
                      )}
                      {colorImport.errors.length > 0 && (
                        <ul className="my-beads-import-errors">
                          {colorImport.errors.slice(0, 20).map((e, i) => (
                            <li key={i}>
                              {e.row ? t('myBeads.colors.import.rowError', { row: e.row }) : ''}
                              {errorText(e)}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="my-beads-import-actions">
                        <button
                          type="button"
                          className="my-beads-btn primary"
                          disabled={busy || colorImport.drafts.length === 0}
                          onClick={confirmColorImport}
                        >
                          {t('myBeads.colors.import.confirm', { n: colorImport.drafts.length })}
                        </button>
                      </div>
                    </div>
                  )}

                  <ColorList
                    colors={filteredColors}
                    totalColors={paletteColorCount}
                    inventoryByKey={store.inventoryByKey}
                    onEdit={(c) => setEditingColor({ ...c, source: c.source || DEFAULT_COLOR_SOURCE })}
                    onDelete={(c) => setConfirmDelete({ kind: 'color', id: c.id, name: c.code })}
                    onCopyHex={copyHex}
                    onAddFirst={openNewColor}
                    onImport={() => colorFileRef.current?.click()}
                    onClearSearch={() => setColorSearch('')}
                    keyFor={(c) => paletteKeyForUser(selectedPalette.id, c.id)}
                    t={t}
                  />
                </div>
              )}

              {/* 内置色卡目录:明确的第二入口 */}
              <div className={`my-beads-builtin${highlightBuiltin ? ' highlighted' : ''}`} ref={builtinRef}>
                <h3>{t('myBeads.builtin.title')}</h3>
                <p className="my-beads-hint small">{t('myBeads.builtin.hint')}</p>
                <div className="my-beads-builtin-grid">
                  {PALETTE_LIST.map((p) => (
                    <div key={p.id} className="my-beads-builtin-card">
                      <div>
                        <strong>{t(`palette.brand.${p.id}`)}</strong>
                        <span>
                          {t('myBeads.builtin.colorCount', { n: p.colors.length })}
                          {p.beadSize ? ` · ${p.beadSize}mm` : ''}
                        </span>
                      </div>
                      <button type="button" className="my-beads-btn ghost" onClick={() => openCopyBuiltin(p)}>
                        <Copy size={14} />{t('myBeads.builtin.copy')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ═══ 我的库存 ═══════════════════════════════════════ */}
        {tab === TAB_INVENTORY && (
          <div role="tabpanel" id={`my-beads-panel-${TAB_INVENTORY}`} aria-labelledby={`my-beads-tab-${TAB_INVENTORY}`} className="my-beads-panel">
            <InventoryWorkspace
              palettes={{ builtin: PALETTE_LIST, user: palettes }}
              colorsByPalette={store.colorsByPalette}
              inventoryByKey={store.inventoryByKey}
              source={invKind}
              paletteId={invPaletteId}
              onSourceChange={changeInvSource}
              onPaletteChange={setInvPaletteId}
              onCopyBuiltin={focusBuiltinDirectory}
              onNewPalette={openNewPalette}
              onGoPaletteColors={() => { setTab(TAB_PALETTES); setSelectedPaletteId(invPaletteId) }}
              onCommitQuantity={commitQuantity}
              onClearRecord={(color, opts) => {
                // 批量清除逐条静默执行;单行清除走确认框(与「缺货」明确区分)
                if (opts?.silent) return clearInventory(color, opts)
                setConfirmDelete({ kind: 'inventory', key: color.key, name: color.code })
                return Promise.resolve({ ok: true, pending: true })
              }}
              onBatchDone={onBatchDone}
              busy={busy}
            />
          </div>
        )}

        {/* ═══ 图纸匹配 ═══════════════════════════════════════ */}
        {tab === TAB_MATCH && (
          <div role="tabpanel" id={`my-beads-panel-${TAB_MATCH}`} aria-labelledby={`my-beads-tab-${TAB_MATCH}`} className="my-beads-panel">
            <MatchWorkspace
              canvasData={canvasData}
              builtinPalettes={PALETTE_LIST}
              userPalettes={palettes}
              colorsByPalette={store.colorsByPalette}
              inventoryByKey={store.inventoryByKey}
              source={targetKind}
              targetId={targetId}
              onSourceChange={changeMatchTarget}
              onBackToCanvas={() => navigate('/')}
              onGoManageColors={() => { setTab(TAB_PALETTES); setSelectedPaletteId(targetId) }}
              onGoInventory={() => { setInvKind('user'); setInvPaletteId(targetId); setTab(TAB_INVENTORY) }}
              onCopyBuiltin={focusBuiltinDirectory}
              onNewPalette={openNewPalette}
              onApply={applyMapping}
              busy={busy}
            />
          </div>
        )}

        {/* 备份:层级低于核心任务(规格 §3.1) */}
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
              className="my-beads-file-input my-beads-backup-file-input"
              onChange={onBackupFilePicked}
            />
            <span className="my-beads-hint small">{t('myBeads.backup.hint')}</span>
          </div>
        )}
      </div>

      {/* ── 色卡新建 / 编辑 ───────────────────────────────── */}
      {editingPalette && createPortal(
        <PaletteSetupDialog
          value={editingPalette}
          palettes={palettes}
          busy={busy}
          dialogRef={paletteDialogRef}
          dialogProps={paletteDialogProps}
          onChange={setEditingPalette}
          onCancel={() => setEditingPalette(null)}
          onSave={savePalette}
        />,
        document.body,
      )}

      {/* ── 复制内置色卡 ──────────────────────────────────── */}
      {copyTarget && createPortal(
        <CopyBuiltinPaletteDialog
          builtin={copyTarget}
          busy={busy}
          dialogRef={copyDialogRef}
          dialogProps={copyDialogProps}
          onCancel={() => setCopyTarget(null)}
          onConfirm={confirmCopyBuiltin}
        />,
        document.body,
      )}

      {/* ── 颜色编辑 ─────────────────────────────────────── */}
      {editingColor && createPortal(
        <div className="my-beads-modal-overlay" onClick={() => setEditingColor(null)}>
          <div className="my-beads-modal" ref={colorDialogRef} {...colorDialogProps} onClick={(e) => e.stopPropagation()}>
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

      {/* ── 删除确认(色卡 / 颜色 / 库存记录)───────────────── */}
      {confirmDelete && createPortal(
        <div className="my-beads-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="my-beads-modal confirm" ref={deleteDialogRef} {...deleteDialogProps} onClick={(e) => e.stopPropagation()}>
            <AlertTriangle size={20} className="warn-icon" />
            <h3>
              {confirmDelete.kind === 'palette' ? t('myBeads.palettes.deleteTitle')
                : confirmDelete.kind === 'color' ? t('myBeads.colors.deleteTitle')
                  : t('myBeads.inventory.clearRecord')}
            </h3>
            <p>
              {confirmDelete.kind === 'inventory'
                ? t('myBeads.inventory.clearConfirm', { code: confirmDelete.name })
                : t('myBeads.deleteBody', { name: confirmDelete.name })}
            </p>
            {confirmDelete.kind !== 'inventory' && (
              <p className="my-beads-hint small">{t('myBeads.deleteKeepCanvas')}</p>
            )}

            {confirmDelete.kind === 'palette' && referencingWorks.length > 0 && (
              <div className="my-beads-reassign">
                <p className="my-beads-hint small">
                  {t('myBeads.palettes.referencedBy', { n: referencingWorks.length })}
                </p>
                <label>
                  <span>{t('myBeads.palettes.reassignTo')}</span>
                  <select
                    value={reassignTargetId}
                    onChange={(e) => setReassignTargetId(e.target.value)}
                    aria-label={t('myBeads.palettes.reassignTo')}
                  >
                    <option value="">{t('myBeads.palettes.keepHex')}</option>
                    {palettes.filter((p) => p.id !== confirmDelete.id).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                {reassignTargetId && (
                  <button
                    type="button"
                    className="my-beads-btn primary"
                    disabled={busy}
                    onClick={() => deletePaletteWithReassign(reassignTargetId)}
                  >
                    {t('myBeads.palettes.reassignAndDelete', { n: referencingWorks.length })}
                  </button>
                )}
              </div>
            )}

            <div className="my-beads-modal-actions">
              <button type="button" className="my-beads-btn ghost" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</button>
              <button type="button" className="my-beads-btn danger" onClick={doDelete}>
                {confirmDelete.kind === 'inventory' ? t('myBeads.inventory.clearConfirmYes') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** 颜色列表(色卡详情内复用;含库存标记、来源徽章、复制 HEX 与编辑/删除) */
function ColorList({
  colors, totalColors, inventoryByKey, onEdit, onDelete, onCopyHex,
  onAddFirst, onImport, onClearSearch, keyFor, t,
}) {
  if (!colors || colors.length === 0) {
    // 区分「这张色卡本来就没有颜色」与「搜索无结果」—— 后者不能提示去添加颜色
    const searched = (totalColors || 0) > 0
    if (searched) {
      return (
        <div className="my-beads-empty-inline">
          <p className="my-beads-hint small">{t('myBeads.colors.searchEmpty')}</p>
          <button type="button" className="my-beads-btn ghost" onClick={onClearSearch}>
            {t('myBeads.palettes.searchClear')}
          </button>
        </div>
      )
    }
    return (
      <div className="my-beads-empty-inline">
        <p className="my-beads-hint small">{t('myBeads.colors.empty')}</p>
        <div className="empty-actions">
          <button type="button" className="my-beads-btn primary" onClick={onAddFirst}>
            <Plus size={14} />{t('myBeads.palettes.addColorFirst')}
          </button>
          <button type="button" className="my-beads-btn secondary" onClick={onImport}>
            <Upload size={14} />{t('myBeads.palettes.importColors')}
          </button>
        </div>
      </div>
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
              <button type="button" className="my-beads-icon-btn" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => onEdit(c)}>
                <Pencil size={14} />
              </button>
              <button type="button" className="my-beads-icon-btn danger" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => onDelete(c)}>
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
