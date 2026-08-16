import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { normalizeCustomTemplate, TEMPLATES } from '../data/templates'
import zhCN from '../i18n/locales/zh-CN.json'
import enUS from '../i18n/locales/en-US.json'

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

  // ── 本地数据一次性迁移到云端(管理员操作) ───────────────────
  // 将内置模板(源码)与 localStorage 自定义模板 + 自定义分类 upsert 进云端,
  // (source, name) 唯一约束保证幂等,重复执行不产生重复。
  const migrateLocalToCloud = useCallback(async () => {
    if (!supabase) return { ok: false, message: 'cloudNotConfigured' }
    let inserted = 0
    try {
      // 内置模板:name 取英文名(en-US),nameZh 取中文名(zh-CN)
      for (const tpl of TEMPLATES) {
        const name = enUS.templates?.names?.[tpl.nameKey] || tpl.nameKey
        const nameZh = zhCN.templates?.names?.[tpl.nameKey] || tpl.nameKey
        const { error } = await supabase.from('templates').upsert(
          templateToRow({
            name,
            nameZh,
            category: tpl.category,
            difficulty: tpl.difficulty,
            size: tpl.size,
            colors: tpl.colors,
            pattern: tpl.pattern,
            source: 'builtin',
          }),
          { onConflict: 'source,name' }
        )
        if (error) throw error
        inserted++
      }

      // 本机自定义模板(localStorage)
      let custom = []
      try {
        custom = JSON.parse(localStorage.getItem('custom-templates') || '[]')
      } catch { custom = [] }
      for (const tpl of custom) {
        const { error } = await supabase.from('templates').upsert(
          templateToRow({
            name: tpl.name,
            nameZh: tpl.nameZh,
            category: tpl.category,
            difficulty: tpl.difficulty,
            size: tpl.size,
            colors: tpl.colors || [],
            pattern: tpl.pattern,
            source: 'custom',
          }),
          { onConflict: 'source,name' }
        )
        if (error) throw error
        inserted++
      }

      // 自定义分类
      let localCategories = []
      try {
        localCategories = JSON.parse(localStorage.getItem('custom-categories') || '[]')
      } catch { localCategories = [] }
      for (const cat of localCategories) {
        const { error } = await supabase.from('categories').upsert(
          { id: cat.id, label: cat.label },
          { onConflict: 'id' }
        )
        if (error) throw error
      }

      await loadAll()
      return { ok: true, count: inserted }
    } catch (e) {
      return { ok: false, message: e.message || String(e) }
    }
  }, [loadAll])

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
    migrateLocalToCloud,
  }
}
