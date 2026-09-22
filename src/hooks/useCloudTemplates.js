import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, SUPABASE_PROXIED } from '../services/supabase'
import { normalizeCustomTemplate } from '../data/templates'

/**
 * 云端模板库(Supabase templates / categories 表)。
 * - 云端启用(VITE_SUPABASE_URL 已配置)时:读/写全部走云,RLS 在服务端
 *   强制「游客只读、仅 admin 可写」。
 * - 云端未启用时:enabled=false,调用方回退到本地模式(localStorage)。
 * 行字段为 snake_case,返回给 UI 时映射为 camelCase。
 */

// 云端请求超时(ms)。移动端弱网、切后台、或会话令牌静默刷新阻塞时,fetch 可能
// 长时间不返回:图库会永久停在「加载中」且没有任何重试入口,表现为「云端模板加载失败」。
// 超时后转入已有的错误+重试界面,并在网络恢复 / 页面重新可见时自动重试。
const CLOUD_TIMEOUT_MS = 15000

const isAbortError = (e) => e?.name === 'AbortError' || /abort/i.test(e?.message || '')

const rowToTemplate = (row) => ({
  id: row.id,
  name: row.name,
  nameZh: row.name_zh,
  category: row.category,
  difficulty: row.difficulty,
  size: row.size,
  colors: Array.isArray(row.colors) ? row.colors : [],
  pattern: row.pattern,
  source: row.source,
  paletteId: row.palette_id || 'perler',
  downloadCount: row.download_count ?? 0,
})

const templateToRow = (t) => ({
  name: t.name,
  name_zh: t.nameZh || null,
  category: t.category,
  difficulty: t.difficulty,
  size: t.size,
  colors: t.colors,
  pattern: t.pattern,
  source: t.source || 'custom',
  palette_id: t.paletteId || 'perler',
})

export default function useCloudTemplates() {
  const [enabled] = useState(() => supabase !== null)
  const [loading, setLoading] = useState(enabled)
  const [templates, setTemplates] = useState([])
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')

  // 上一次拉取是否失败(供网络恢复 / 页面重新可见时判断要不要自动重试)
  const failedRef = useRef(false)

  // 拉取模板 + 分类(超时由调用方通过 signal 控制;失败抛错交给调用方)
  const fetchCloudData = useCallback(async (signal) => {
    const [tplRes, catRes] = await Promise.all([
      supabase.from('templates').select('*').order('source').order('created_at').abortSignal(signal),
      supabase.from('categories').select('*').order('id').abortSignal(signal),
    ])
    if (tplRes.error) throw tplRes.error
    if (catRes.error) throw catRes.error
    return { templates: tplRes.data.map(rowToTemplate), categories: catRes.data }
  }, [])

  // 带超时的单次拉取:到点主动 abort,避免请求永久挂起把 UI 锁死在「加载中」
  const fetchWithTimeout = useCallback(async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), CLOUD_TIMEOUT_MS)
    try {
      return await fetchCloudData(ctrl.signal)
    } finally {
      clearTimeout(timer)
    }
  }, [fetchCloudData])

  const loadAll = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const data = await fetchWithTimeout()
      setTemplates(data.templates)
      setCategories(data.categories)
      failedRef.current = false
      setError('')
    } catch (e) {
      failedRef.current = true
      setError(isAbortError(e) ? 'timeout' : (e.message || String(e)))
    } finally {
      setLoading(false)
    }
  }, [fetchWithTimeout])

  useEffect(() => {
    if (enabled) loadAll()
  }, [enabled, loadAll])

  // 静默刷新:重拉模板/分类,不切换 loading(供实时订阅/后台操作后刷新)
  const refresh = useCallback(async () => {
    if (!supabase) return
    try {
      const data = await fetchWithTimeout()
      setTemplates(data.templates)
      setCategories(data.categories)
      failedRef.current = false
      setError('')
    } catch (e) {
      failedRef.current = true
      setError(isAbortError(e) ? 'timeout' : (e.message || String(e)))
    }
  }, [fetchWithTimeout])

  // 自愈:上一次拉取失败(含超时)后,网络恢复或页面重新可见时自动重试。
  // 移动端最常见的就是「切走再回来 / 信号恢复」,不该让用户卡在错误页只能手点重试。
  useEffect(() => {
    if (!enabled || !supabase) return undefined
    const retry = () => { if (failedRef.current) loadAll() }
    const onVisible = () => { if (document.visibilityState === 'visible') retry() }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, loadAll])

  // 实时订阅:模板/分类被增删改(管理员操作或他人)时自动刷新,无需手动刷新/切 tab。
  // 同域代理下 Realtime WebSocket 不可用(vercel rewrite 不转发 WS),跳过订阅,
  // 由「网络恢复 / 页面重新可见」的自动刷新与手动重试兜底。
  useEffect(() => {
    if (!enabled || !supabase || SUPABASE_PROXIED) return undefined
    let t
    const trigger = () => { clearTimeout(t); t = setTimeout(() => refresh(), 400) }
    const ch = supabase
      .channel('tpl-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'templates' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, trigger)
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [enabled, refresh])

  // ── 模板 CRUD(写操作由 RLS 限制为 admin) ──────────────────
  const addTemplate = useCallback(async (input) => {
    if (!supabase) return { ok: false, errors: [{ code: 'cloudNotConfigured' }] }
    const res = normalizeCustomTemplate(input)
    if (!res.ok) return res
    const { data, error: err } = await supabase
      .from('templates')
      .insert(templateToRow(res.template))
      .select()
      .single()
    if (err) return { ok: false, errors: [{ code: 'dbError', detail: err.message }] }
    setTemplates(prev => [...prev, rowToTemplate(data)])
    return { ok: true, template: rowToTemplate(data) }
  }, [])

  const updateTemplate = useCallback(async (id, input) => {
    if (!supabase) return { ok: false, errors: [{ code: 'cloudNotConfigured' }] }
    const res = normalizeCustomTemplate(input)
    if (!res.ok) return res
    const { data, error: err } = await supabase
      .from('templates')
      .update(templateToRow({ ...res.template, source: 'custom' }))
      .eq('id', id)
      .select()
      .single()
    if (err) return { ok: false, errors: [{ code: 'dbError', detail: err.message }] }
    setTemplates(prev => prev.map(t => (t.id === id ? rowToTemplate(data) : t)))
    return { ok: true }
  }, [])

  const deleteTemplate = useCallback(async (id) => {
    if (!supabase) return { ok: false, errors: [{ code: 'cloudNotConfigured' }] }
    const { error: err } = await supabase.from('templates').delete().eq('id', id)
    if (err) return { ok: false, errors: [{ code: 'dbError', detail: err.message }] }
    setTemplates(prev => prev.filter(t => t.id !== id))
    return { ok: true }
  }, [])

  // ── 分类 CRUD ────────────────────────────────────────────
  const addCategory = useCallback(async ({ id, label }) => {
    if (!supabase) return { ok: false, errors: [{ code: 'cloudNotConfigured' }] }
    if (!id || !label) return { ok: false, errors: [{ code: 'categoryFieldsRequired' }] }
    const { error: err } = await supabase.from('categories').insert({ id, label })
    if (err) {
      if (/duplicate/i.test(err.message)) return { ok: false, errors: [{ code: 'categoryExists' }] }
      return { ok: false, errors: [{ code: 'dbError', detail: err.message }] }
    }
    setCategories(prev => [...prev, { id, label }].sort((a, b) => a.id.localeCompare(b.id)))
    return { ok: true }
  }, [])

  const updateCategory = useCallback(async (oldId, { id, label }) => {
    if (!supabase) return { ok: false, errors: [{ code: 'cloudNotConfigured' }] }
    const { error: err } = await supabase.from('categories').update({ id, label }).eq('id', oldId)
    if (err) return { ok: false, errors: [{ code: 'dbError', detail: err.message }] }
    setCategories(prev => prev
      .filter(c => c.id !== oldId)
      .concat([{ id, label }])
      .sort((a, b) => a.id.localeCompare(b.id)))
    // 模板中的分类引用随 id 改名同步(非事务,第二步失败时返回错误让 UI 提示)
    if (id !== oldId) {
      const { error: tplErr } = await supabase
        .from('templates')
        .update({ category: id })
        .eq('category', oldId)
      if (tplErr) return { ok: false, errors: [{ code: 'dbError', detail: tplErr.message }] }
      setTemplates(prev => prev.map(t => (t.category === oldId ? { ...t, category: id } : t)))
    }
    return { ok: true }
  }, [])

  const deleteCategory = useCallback(async (id) => {
    if (!supabase) return { ok: false, errors: [{ code: 'cloudNotConfigured' }] }
    const { error: err } = await supabase.from('categories').delete().eq('id', id)
    if (err) return { ok: false, errors: [{ code: 'dbError', detail: err.message }] }
    setCategories(prev => prev.filter(c => c.id !== id))
    return { ok: true }
  }, [])

  return {
    enabled,
    loading,
    templates,
    categories,
    error,
    loadAll,
    refresh,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    addCategory,
    updateCategory,
    deleteCategory,
  }
}
