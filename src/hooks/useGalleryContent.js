/**
 * useGalleryContent — 图库策展内容(主题/合集)的数据源。
 *
 * 与 useCloudTemplates 的分工:
 *   - 模板与分类仍由 useCloudTemplates 负责(旧图库路径不变);
 *   - 本 hook 只负责新增的策展层,失败时返回空集合 + error,
 *     调用方继续渲染旧图库(规格要求:无主题数据或云端故障不得白屏)。
 *
 * 不提供本地回退:主题/合集是云端运营数据,本地凭空造一份会让管理员误以为
 * 已经发布。云端未配置时 enabled=false,UI 直接不渲染发现区块。
 *
 * `active=false` 时挂起加载(画布/教程等页面不需要策展数据),
 * 首次变为 true 才发起请求,避免每次启动都多打四张表。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { createGalleryContentStore } from '../services/gallery/galleryContentStore'
import {
  CONTENT_STATUS,
  sortContent,
  resolveHomeSections,
} from '../services/gallery/contentModel'

/** 只保留已发布对象(公开路由用;与 discovery.publishedOnly 同一语义) */
const publishedOnly = (list) => (list || []).filter((item) => item?.status === CONTENT_STATUS.PUBLISHED)

const EMPTY = {
  themes: [], collections: [], themeLinks: [], collectionLinks: [], homeSections: [],
  themeChildren: [], themeCollections: [],
}

const CONTENT_TIMEOUT_MS = 15000

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function useGalleryContent({ active = true } = {}) {
  const store = useMemo(() => createGalleryContentStore(supabase), [])
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(!!supabase && active)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!store.enabled) {
      setState(EMPTY)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await withTimeout(store.load(), CONTENT_TIMEOUT_MS)
      if (!aliveRef.current) return
      setState({
        themes: Array.isArray(data.themes) ? data.themes : [],
        collections: Array.isArray(data.collections) ? data.collections : [],
        themeLinks: Array.isArray(data.themeLinks) ? data.themeLinks : [],
        collectionLinks: Array.isArray(data.collectionLinks) ? data.collectionLinks : [],
        homeSections: Array.isArray(data.homeSections) ? data.homeSections : [],
        themeChildren: Array.isArray(data.themeChildren) ? data.themeChildren : [],
        themeCollections: Array.isArray(data.themeCollections) ? data.themeCollections : [],
      })
      setError('')
    } catch (e) {
      if (!aliveRef.current) return
      // 保留空集合,让旧图库继续可用;错误交给调用方显示降级提示
      setState(EMPTY)
      setError(e?.message === 'timeout' ? 'timeout' : (e?.message || String(e)))
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [store])

  useEffect(() => {
    if (!active) return
    load()
  }, [active, load, reloadKey])

  // 网络恢复 / 页面重新可见时自动重试(与 useCloudTemplates 同一策略)
  useEffect(() => {
    if (!store.enabled || !active) return undefined
    const retry = () => { if (error) load() }
    const onVisible = () => { if (document.visibilityState === 'visible') retry() }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [store.enabled, active, error, load])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // 已排序视图:精选优先 + sort_order(公开侧与管理侧共用同一规则)
  const themes = useMemo(() => sortContent(state.themes), [state.themes])
  const collections = useMemo(() => sortContent(state.collections), [state.collections])

  // parentId → 有序 templateId 列表
  const themeTemplateIds = useMemo(() => {
    const m = new Map()
    for (const link of state.themeLinks) {
      if (!m.has(link.theme_id)) m.set(link.theme_id, [])
      m.get(link.theme_id).push(link)
    }
    for (const list of m.values()) {
      list.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    }
    return new Map([...m.entries()].map(([k, v]) => [k, v.map((l) => String(l.template_id))]))
  }, [state.themeLinks])

  const collectionTemplateIds = useMemo(() => {
    const m = new Map()
    for (const link of state.collectionLinks) {
      if (!m.has(link.collection_id)) m.set(link.collection_id, [])
      m.get(link.collection_id).push(link)
    }
    for (const list of m.values()) {
      list.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    }
    return new Map([...m.entries()].map(([k, v]) => [k, v.map((l) => String(l.template_id))]))
  }, [state.collectionLinks])

  const findBySlug = useCallback((list, slug) => {
    const key = String(slug || '').toLowerCase()
    return list.find((item) => String(item.slug || '').toLowerCase() === key) || null
  }, [])

  // 主题嵌套:parentId → 有序子 id 列表(0027;未执行时为空 Map)
  const childThemeIds = useMemo(() => {
    const m = new Map()
    for (const row of state.themeChildren) {
      if (!m.has(row.parent_id)) m.set(row.parent_id, [])
      m.get(row.parent_id).push(row)
    }
    for (const list of m.values()) {
      list.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    }
    return new Map([...m.entries()].map(([k, v]) => [k, v.map((r) => String(r.child_id))]))
  }, [state.themeChildren])

  const themeCollectionIds = useMemo(() => {
    const m = new Map()
    for (const row of state.themeCollections) {
      if (!m.has(row.theme_id)) m.set(row.theme_id, [])
      m.get(row.theme_id).push(row)
    }
    for (const list of m.values()) {
      list.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    }
    return new Map([...m.entries()].map(([k, v]) => [k, v.map((r) => String(r.collection_id))]))
  }, [state.themeCollections])

  // 首页区块:无配置时回退到默认顺序(未执行 0026 的项目行为不变)
  const homeSections = useMemo(() => resolveHomeSections(state.homeSections), [state.homeSections])

  /**
   * 公开路由专用:只返回已发布对象。
   *
   * 管理员凭 RLS 会拿到草稿;若公开路由直接按 slug 查未过滤列表,
   * 管理员访问 /gallery/theme/<草稿 slug> 会看到未发布内容 ——
   * 与「草稿对公众不可见」的规则不一致(分享出去的链接也可能被误判为已上线)。
   * 公开页一律走这里,后台编辑走 themes/collections 原始列表。
   */
  const getPublishedThemeBySlug = useCallback(
    (slug) => findBySlug(publishedOnly(themes), slug),
    [themes, findBySlug]
  )
  const getPublishedCollectionBySlug = useCallback(
    (slug) => findBySlug(publishedOnly(collections), slug),
    [collections, findBySlug]
  )

  const getThemeBySlug = useCallback((slug) => findBySlug(themes, slug), [themes, findBySlug])
  const getCollectionBySlug = useCallback((slug) => findBySlug(collections, slug), [collections, findBySlug])

  const fail = useCallback((errors) => {
    setError(errors?.[0]?.detail || errors?.[0]?.code || 'failed')
    return { ok: false, errors }
  }, [])

  // ── 管理写入(RLS 限制管理员;失败不乐观更新) ──────────────
  const createContent = useCallback(async (kind, input) => {
    const res = await store.createContent(kind, input)
    if (!res.ok) return fail(res.errors)
    await load()
    return res
  }, [store, load, fail])

  const updateContent = useCallback(async (kind, id, input) => {
    const res = await store.updateContent(kind, id, input)
    if (!res.ok) return fail(res.errors)
    await load()
    return res
  }, [store, load, fail])

  const deleteContent = useCallback(async (kind, id) => {
    const res = await store.deleteContent(kind, id)
    if (!res.ok) return fail(res.errors)
    await load()
    return res
  }, [store, load, fail])

  const setLinks = useCallback(async (kind, parentId, templateIds) => {
    const res = await store.setLinks(kind, parentId, templateIds)
    if (!res.ok) return fail(res.errors)
    await load()
    return res
  }, [store, load, fail])

  const saveHomeSections = useCallback(async (sections) => {
    const res = await store.saveHomeSections(sections)
    if (!res.ok) return fail(res.errors)
    await load()
    return res
  }, [store, load, fail])

  const setThemeChildren = useCallback(async (themeId, childIds) => {
    const res = await store.setThemeChildren(themeId, childIds)
    if (!res.ok) return fail(res.errors)
    await load()
    return res
  }, [store, load, fail])

  const setThemeCollections = useCallback(async (themeId, collectionIds) => {
    const res = await store.setThemeCollections(themeId, collectionIds)
    if (!res.ok) return fail(res.errors)
    await load()
    return res
  }, [store, load, fail])

  return {
    enabled: store.enabled,
    loading,
    error,
    clearError: () => setError(''),
    themes,
    collections,
    homeSections,
    childThemeIds,
    themeCollectionIds,
    themeTemplateIds,
    collectionTemplateIds,
    getThemeBySlug,
    getCollectionBySlug,
    getPublishedThemeBySlug,
    getPublishedCollectionBySlug,
    reload,
    createContent,
    updateContent,
    deleteContent,
    setLinks,
    saveHomeSections,
    setThemeChildren,
    setThemeCollections,
  }
}

export default useGalleryContent
