import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { normalizeCustomTemplate } from '../data/templates'

/**
 * 云端模板库(Supabase templates / categories 表)。
 * - 云端启用(VITE_SUPABASE_URL 已配置)时:读/写全部走云,RLS 在服务端
 *   强制「游客只读、仅 admin 可写」。
 * - 云端未启用时:enabled=false,调用方回退到本地模式(localStorage)。
 * 行字段为 snake_case,返回给 UI 时映射为 camelCase。
 */
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

  const loadAll = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const [tplRes, catRes] = await Promise.all([
        supabase.from('templates').select('*').order('source').order('created_at'),
        supabase.from('categories').select('*').order('id'),
      ])
      if (tplRes.error) throw tplRes.error
      if (catRes.error) throw catRes.error
      setTemplates(tplRes.data.map(rowToTemplate))
      setCategories(catRes.data)
      setError('')
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) loadAll()
  }, [enabled, loadAll])

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
    addTemplate,
    updateTemplate,
    deleteTemplate,
    addCategory,
    updateCategory,
    deleteCategory,
  }
}
