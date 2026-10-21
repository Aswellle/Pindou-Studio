/**
 * useUserPalettes — 个人色卡 / 库存的统一数据源(M6)。
 *
 * 双模式(与 useSavedWorks 同思路):
 *   - 登录且 Supabase 已配置 → 云端仓库(RLS:仅本人可读写);
 *   - 未登录 / 未配置云端 → 本地仓库(localStorage,带版本、损坏备份、配额上报)。
 *
 * 云端加载失败时**不回退成本地数据**:那会让用户以为写进了云端,实际只写在本机。
 * 页面会显示错误与重试入口,本地数据原样保留。
 *
 * 登录后本机已有的色卡不会自动合并(避免静默改归属);页面提供显式「导入本机色卡」。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { createCloudBeadStore } from '../services/beads/cloudBeadStore'
import {
  createLocalBeadStore,
  readLocalBeadState,
  resetLocalBeadStore,
} from '../services/beads/localBeadStore'
import {
  parsePaletteKey,
  paletteKeyForUser,
  buildPaletteFromBuiltin,
} from '../services/beads/personalPalette'

const EMPTY = { palettes: [], colors: [], inventory: [] }

function normalizeLoaded(data) {
  return {
    palettes: Array.isArray(data?.palettes) ? data.palettes : [],
    colors: Array.isArray(data?.colors) ? data.colors : [],
    inventory: Array.isArray(data?.inventory) ? data.inventory : [],
  }
}

export function useUserPalettes(user) {
  const isCloud = !!user && !!supabase
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pendingLocal, setPendingLocal] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  // 仓库随登录态切换;localStorage 实例在模块内构造时读取一次。
  // 云端仓库需要 userId 写入 user_id 列(RLS 的 with check 同时校验它 = auth.uid())
  const store = useMemo(
    () => (isCloud ? createCloudBeadStore(supabase, user?.id || null) : createLocalBeadStore()),
    [isCloud, user?.id]
  )
  const storeRef = useRef(store)
  useEffect(() => { storeRef.current = store }, [store])

  // 本机待导入数量(仅在云端模式下有意义)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey 只作强制重载的触发信号
  useEffect(() => {
    if (!isCloud) { setPendingLocal(0); return }
    const { state: local } = readLocalBeadState()
    setPendingLocal(local.palettes.length)
  }, [isCloud, reloadKey])

  const refresh = useCallback(async () => {
    const current = storeRef.current
    setLoading(true)
    setError(null)
    try {
      const data = await current.load()
      setState(normalizeLoaded(data))
    } catch (e) {
      // 云端失败:保留空列表 + 错误横幅,不把本地数据冒充云端数据
      setState(EMPTY)
      setError({ code: 'loadFailed', detail: e?.message || String(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: store 通过 storeRef 读取,避免每次 store 换引用都重跑;reloadKey 作触发信号
  useEffect(() => {
    let cancelled = false
    const current = storeRef.current
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const data = await current.load()
        if (!cancelled) setState(normalizeLoaded(data))
      } catch (e) {
        if (!cancelled) {
          setState(EMPTY)
          setError({ code: 'loadFailed', detail: e?.message || String(e) })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // user?.id:资料刷新(昵称/头像)不触发重载
  }, [store, user?.id, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const fail = useCallback((errors) => {
    setError(errors?.[0] || { code: 'unknown' })
    return { ok: false, errors: errors || [{ code: 'unknown' }] }
  }, [])

  // ── 色卡 CRUD ─────────────────────────────────────────────
  const createPalette = useCallback(async (input) => {
    const res = await storeRef.current.createPalette(input)
    if (!res.ok) return fail(res.errors)
    setState((s) => ({ ...s, palettes: [...s.palettes, res.palette] }))
    return res
  }, [fail])

  /** 复制内置色卡为个人色卡(独立 ID;内置数据永不被修改) */
  const copyBuiltinPalette = useCallback(async (builtin, name) => {
    if (!builtin) return fail([{ code: 'notFound' }])
    const { palette, colors } = buildPaletteFromBuiltin(builtin, { name })
    if (!palette) return fail([{ code: 'notFound' }])
    const res = await storeRef.current.createPaletteWithColors(palette, colors)
    if (!res.ok) return fail(res.errors)
    setState((s) => ({
      ...s,
      palettes: [...s.palettes, res.palette],
      colors: [...s.colors, ...(res.colors || [])],
    }))
    return res
  }, [fail])

  const updatePalette = useCallback(async (id, patch) => {
    const existing = state.palettes.find((p) => p.id === id)
    if (!existing) return fail([{ code: 'notFound' }])
    const res = await storeRef.current.updatePalette(id, { ...existing, ...patch })
    if (!res.ok) return fail(res.errors)
    setState((s) => ({
      ...s,
      palettes: s.palettes.map((p) => (p.id === id ? res.palette : p)),
    }))
    return res
  }, [fail, state.palettes])

  const deletePalette = useCallback(async (id) => {
    const res = await storeRef.current.deletePalette(id)
    if (!res.ok) return fail(res.errors)
    setState((s) => {
      const colorIds = new Set(s.colors.filter((c) => c.paletteId === id).map((c) => c.id))
      return {
        ...s,
        palettes: s.palettes.filter((p) => p.id !== id),
        colors: s.colors.filter((c) => c.paletteId !== id),
        inventory: s.inventory.filter(
          (i) => !colorIds.has(i.paletteColorId)
            && !String(i.paletteKey || '').startsWith(`user:${id}:`)
        ),
      }
    })
    return res
  }, [fail])

  // ── 颜色 CRUD ─────────────────────────────────────────────
  const addColor = useCallback(async (paletteId, input) => {
    const siblings = state.colors.filter((c) => c.paletteId === paletteId)
    const res = await storeRef.current.addColor(paletteId, input, siblings)
    if (!res.ok) return fail(res.errors)
    setState((s) => ({ ...s, colors: [...s.colors, res.color] }))
    return res
  }, [fail, state.colors])

  /**
   * 批量添加颜色(CSV/JSON 导入)。整批一次写入:任何一行不合法则整体拒绝,
   * 不会出现「导入了一半」的状态。
   */
  const addColors = useCallback(async (paletteId, inputs) => {
    const siblings = state.colors.filter((c) => c.paletteId === paletteId)
    const res = await storeRef.current.addColors(paletteId, inputs, siblings)
    if (!res.ok) return fail(res.errors)
    setState((s) => ({ ...s, colors: [...s.colors, ...(res.colors || [])] }))
    return res
  }, [fail, state.colors])

  const updateColor = useCallback(async (id, patch) => {
    const existing = state.colors.find((c) => c.id === id)
    if (!existing) return fail([{ code: 'notFound' }])
    const siblings = state.colors.filter((c) => c.paletteId === existing.paletteId)
    const res = await storeRef.current.updateColor(id, { ...existing, ...patch }, siblings)
    if (!res.ok) return fail(res.errors)
    setState((s) => ({
      ...s,
      colors: s.colors.map((c) => (c.id === id ? res.color : c)),
    }))
    return res
  }, [fail, state.colors])

  const deleteColor = useCallback(async (id) => {
    const res = await storeRef.current.deleteColor(id)
    if (!res.ok) return fail(res.errors)
    setState((s) => ({
      ...s,
      colors: s.colors.filter((c) => c.id !== id),
      inventory: s.inventory.filter((i) => i.paletteColorId !== id),
    }))
    return res
  }, [fail])

  // ── 库存 ──────────────────────────────────────────────────
  const setInventory = useCallback(async (payload) => {
    const res = await storeRef.current.setInventory(payload)
    if (!res.ok) return fail(res.errors)
    setState((s) => {
      const rest = s.inventory.filter((i) => i.paletteKey !== payload.paletteKey)
      return { ...s, inventory: [...rest, res.record] }
    })
    return res
  }, [fail])

  const removeInventory = useCallback(async (paletteKey) => {
    const res = await storeRef.current.removeInventory(paletteKey)
    if (!res.ok) return fail(res.errors)
    setState((s) => ({
      ...s,
      inventory: s.inventory.filter((i) => i.paletteKey !== paletteKey),
    }))
    return res
  }, [fail])

  // ── 登录后显式导入本机色卡 ─────────────────────────────────
  const importLocal = useCallback(async () => {
    if (!isCloud) return { ok: false, errors: [{ code: 'notCloud' }] }
    const { state: local } = readLocalBeadState()
    if (local.palettes.length === 0) return { ok: true, imported: 0 }
    let imported = 0
    try {
      for (const p of local.palettes) {
        const pres = await storeRef.current.createPalette(p)
        if (!pres.ok) throw new Error(pres.errors?.[0]?.code || 'createPaletteFailed')
        const idMap = new Map()
        for (const c of local.colors.filter((c) => c.paletteId === p.id)) {
          const cres = await storeRef.current.addColor(pres.palette.id, c, [])
          if (!cres.ok) throw new Error(cres.errors?.[0]?.code || 'addColorFailed')
          idMap.set(c.id, cres.color.id)
        }
        for (const inv of local.inventory.filter(
          (i) => String(i.paletteKey || '').startsWith(`user:${p.id}:`)
        )) {
          const parsed = parsePaletteKey(inv.paletteKey)
          const newColorId = parsed ? idMap.get(parsed.colorId) : null
          if (!newColorId) continue
          await storeRef.current.setInventory({
            paletteKey: paletteKeyForUser(pres.palette.id, newColorId),
            paletteColorId: newColorId,
            quantity: inv.quantity,
            status: inv.status,
            notes: inv.notes,
          })
        }
        imported++
      }
      // 内置色卡的库存记录原样搬运(键不变)
      for (const inv of local.inventory.filter(
        (i) => String(i.paletteKey || '').startsWith('builtin:')
      )) {
        await storeRef.current.setInventory({
          paletteKey: inv.paletteKey,
          paletteColorId: null,
          quantity: inv.quantity,
          status: inv.status,
          notes: inv.notes,
        })
      }
      // 全部成功后才清空本机,避免半途失败导致本地数据丢失
      resetLocalBeadStore()
      setPendingLocal(0)
      await refresh()
      return { ok: true, imported }
    } catch (e) {
      setError({ code: 'importFailed', detail: e?.message || String(e) })
      return { ok: false, errors: [{ code: 'importFailed', detail: e?.message }] }
    }
  }, [isCloud, refresh])

  // ── 备份导出 / 本地导入(规格 05 §5)─────────────────────────
  /** 导出当前数据为备份对象(纯数据,不含账号信息) */
  const exportBackup = useCallback(() => ({
    palettes: state.palettes,
    colors: state.colors,
    inventory: state.inventory,
  }), [state])

  /**
   * 合并导入备份。仅本地模式支持:云端模式下 id 由数据库生成,
   * 无法保留备份里的 id,去重语义会变 —— 那需要另一套 remap 流程。
   */
  const importBackup = useCallback(async (plan) => {
    if (isCloud) return { ok: false, errors: [{ code: 'importLocalOnly' }] }
    const res = await storeRef.current.mergeBackup(plan)
    if (!res.ok) return fail(res.errors)
    await refresh()
    return res
  }, [isCloud, refresh, fail])

  // 库存按 paletteKey 索引,匹配页/库存页共用
  const inventoryByKey = useMemo(() => {
    const m = new Map()
    for (const i of state.inventory) m.set(i.paletteKey, i)
    return m
  }, [state.inventory])

  const colorsByPalette = useMemo(() => {
    const m = new Map()
    for (const c of state.colors) {
      if (!m.has(c.paletteId)) m.set(c.paletteId, [])
      m.get(c.paletteId).push(c)
    }
    for (const list of m.values()) list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    return m
  }, [state.colors])

  return {
    mode: isCloud ? 'cloud' : 'local',
    loading,
    error,
    clearError: () => setError(null),
    palettes: state.palettes,
    colors: state.colors,
    colorsByPalette,
    inventory: state.inventory,
    inventoryByKey,
    pendingLocal,
    reload,
    createPalette,
    copyBuiltinPalette,
    updatePalette,
    deletePalette,
    addColor,
    addColors,
    updateColor,
    deleteColor,
    setInventory,
    removeInventory,
    importLocal,
    exportBackup,
    importBackup,
  }
}
