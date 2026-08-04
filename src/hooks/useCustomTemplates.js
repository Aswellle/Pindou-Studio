import { useState, useEffect, useCallback } from 'react'
import { normalizeCustomTemplate } from '../data/templates'

/**
 * 自定义模板库 — localStorage 持久化(与 Gallery 的 saved-works 同款模式)。
 * 支持模板的增删改查(JSON 协议上传,见 data/templates.js 的 normalizeCustomTemplate)
 * 与自定义分类的管理。内置模板(TEMPLATES)不经过这里,展示时由 Gallery 合并。
 */
const STORAGE_KEY = 'custom-templates'
const CATEGORY_KEY = 'custom-categories'

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export default function useCustomTemplates() {
  const [templates, setTemplates] = useState(() => load(STORAGE_KEY, []))
  const [categories, setCategories] = useState(() => load(CATEGORY_KEY, []))

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(templates)) } catch { /* 配额满时静默 */ }
  }, [templates])

  useEffect(() => {
    try { localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories)) } catch { /* 配额满时静默 */ }
  }, [categories])

  const addTemplate = useCallback((input) => {
    const res = normalizeCustomTemplate(input)
    if (!res.ok) return res
    const template = { ...res.template, id: `c-${Date.now()}` }
    setTemplates(prev => [...prev, template])
    return { ok: true, template }
  }, [])

  const updateTemplate = useCallback((id, input) => {
    const res = normalizeCustomTemplate(input)
    if (!res.ok) return res
    setTemplates(prev => prev.map(t => (t.id === id ? { ...res.template, id } : t)))
    return { ok: true }
  }, [])

  const deleteTemplate = useCallback((id) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
  }, [])

  const addCategory = useCallback(({ id, label }) => {
    if (!id || !label) return { ok: false, errors: [{ code: 'categoryFieldsRequired' }] }
    if (categories.some(c => c.id === id)) return { ok: false, errors: [{ code: 'categoryExists' }] }
    setCategories(prev => [...prev, { id, label }])
    return { ok: true }
  }, [categories])

  const updateCategory = useCallback((oldId, { id, label }) => {
    setCategories(prev => prev.map(c => (c.id === oldId ? { id, label } : c)))
    // 分类改名时,同步更新引用该分类的自定义模板
    if (id !== oldId) {
      setTemplates(prev => prev.map(t => (t.category === oldId ? { ...t, category: id } : t)))
    }
  }, [])

  const deleteCategory = useCallback((id) => {
    setCategories(prev => prev.filter(c => c.id !== id))
  }, [])

  return {
    templates,
    categories,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    addCategory,
    updateCategory,
    deleteCategory,
  }
}
