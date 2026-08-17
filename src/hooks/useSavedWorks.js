import { useState, useEffect, useCallback, useRef } from 'react'
import i18n from '../i18n'
import { supabase } from '../services/supabase'
import { useToast } from '../components/Toast'

const KEY = 'saved-works'
// 云端作品计数镜像:登录时更新,登出后「我的作品」空态可提示"作品在云端,登录查看"
const MIRROR_KEY = 'cloud-works-mirror'
const WARN_BYTES = 4 * 1024 * 1024

function loadLocal() {
  const raw = localStorage.getItem(KEY)
  if (!raw) return []
  try { return JSON.parse(raw) }
  catch {
    // 先备份再删除:损坏可能只是多标签页并发写的暂时性截断,避免永久丢失
    try { localStorage.setItem(KEY + '-corrupt', raw) } catch { /* 备份失败不阻塞 */ }
    localStorage.removeItem(KEY)
    return []
  }
}

function readMirror() {
  try {
    const m = JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null')
    return m && typeof m.count === 'number' ? m : { count: 0 }
  } catch { return { count: 0 } }
}

// 云端行 <-> UI work 字段映射(snake_case <-> camelCase)
const rowToWork = (row) => ({
  id: row.id,
  name: row.name,
  canvasData: row.canvas_data,
  gridSize: row.grid_size,
  gridWidth: row.grid_width,
  gridHeight: row.grid_height,
  paletteId: row.palette_id,
  savedAt: row.saved_at,
})
const workToRow = (w) => ({
  name: w.name,
  canvas_data: w.canvasData,
  grid_size: w.gridSize,
  grid_width: w.gridWidth ?? null,
  grid_height: w.gridHeight ?? null,
  palette_id: w.paletteId || 'perler',
  saved_at: w.savedAt,
})
// 登录迁移去重键:与 0002_works.sql 的唯一索引 (user_id, saved_at, name) 对应
const dedupKey = (w) => `${w.savedAt}|${w.name}`

/**
 * 作品持久化:本地(localStorage)与云端(Supabase works 表)双模式。
 * - 登录(云端已配置)时:云端为唯一数据源;登录瞬间把本机作品一次性
 *   upsert 进云端(幂等去重),成功后清空本机,并返回迁移数量 syncCount。
 * - 登出 / 未登录 / 云端未配置时:回到本机模式(原有行为)。
 * - cloudMirrorCount:最近一次登录态下的云端作品数(登出后空态提示用)。
 */
export function useSavedWorks(user) {
  const toast = useToast()
  const [works, setWorks] = useState(() => loadLocal())
  const [worksLoading, setWorksLoading] = useState(false)
  const [syncCount, setSyncCount] = useState(null)
  const [cloudMirrorCount, setCloudMirrorCount] = useState(() => readMirror().count)
  const worksRef = useRef(works)
  useEffect(() => { worksRef.current = works }, [works])

  const isCloud = useCallback(() => !!user && !!supabase, [user])

  // 云端模式下作品变化时同步镜像计数(登出后「我的作品」空态提示依赖它)
  useEffect(() => {
    if (isCloud()) {
      localStorage.setItem(MIRROR_KEY, JSON.stringify({ count: works.length }))
      setCloudMirrorCount(works.length)
    }
  }, [works, isCloud])

  // 登录态切换:cloud <-> local。登录时加载云端作品 + 一次性迁移本机作品。
  useEffect(() => {
    let cancelled = false
    const cloud = !!user && !!supabase
    if (cloud) {
      setWorksLoading(true)
      ;(async () => {
        try {
          const { data, error } = await supabase
            .from('works')
            .select('*')
            .eq('user_id', user.id)
            .order('saved_at', { ascending: false })
          if (error) throw error
          if (cancelled) return
          const cloudWorks = (data || []).map(rowToWork)

          // 本机作品一次性合并进云端:savedAt+name 去重,upsert 幂等
          const local = loadLocal()
          const existing = new Set(cloudWorks.map(dedupKey))
          const seen = new Set()
          const toPush = local.filter((w) => {
            const k = dedupKey(w)
            if (existing.has(k) || seen.has(k)) return false
            seen.add(k)
            return true
          })
          let migrated = 0
          if (toPush.length > 0) {
            const { data: pushed, error: insErr } = await supabase
              .from('works')
              .upsert(toPush.map((w) => ({ ...workToRow(w), user_id: user.id })), {
                onConflict: 'user_id,saved_at,name',
              })
              .select()
            if (insErr) throw insErr
            migrated = (pushed || []).length
            cloudWorks.push(...(pushed || []).map(rowToWork))
            cloudWorks.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
          }
          if (cancelled) return
          // 迁移成功后清空本机(作品已在云端)
          localStorage.removeItem(KEY)
          setWorks(cloudWorks)
          if (migrated > 0) setSyncCount(migrated)
        } catch (e) {
          // 云端拉取/迁移失败:回退到本机作品,保证「我的作品」不空、不丢数据
          console.error('云端作品加载失败,回退到本机作品:', e)
          if (!cancelled) setWorks(loadLocal())
        } finally {
          if (!cancelled) setWorksLoading(false)
        }
      })()
    } else {
      setWorks(loadLocal())
      setWorksLoading(false)
    }
    return () => { cancelled = true }
    // 依赖 user?.id:昵称/头像等资料刷新(refreshProfile 生成新对象)不触发重拉
  }, [user?.id])

  // 保存:云端直接落库;本机走原有配额/异常保护
  const saveWork = useCallback(async (work) => {
    if (isCloud()) {
      try {
        const { data, error } = await supabase
          .from('works')
          .insert({ ...workToRow(work), user_id: user.id })
          .select()
          .single()
        if (error) throw error
        setWorks((prev) => [rowToWork(data), ...prev])
        return true
      } catch (e) {
        console.error('云端保存失败:', e)
        toast(i18n.t('errors.saveFailed'), 'error')
        return false
      }
    }
    const updated = [...worksRef.current, work]
    const serialized = JSON.stringify(updated)
    if (serialized.length > WARN_BYTES) {
      const kb = Math.round(serialized.length / 1024)
      if (!window.confirm(`存储空间已使用约 ${kb}KB（接近 5MB 上限），建议先删除部分旧作品。是否继续保存？`)) return false
    }
    try {
      localStorage.setItem(KEY, serialized)
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        toast(i18n.t('errors.storageFull'), 'error')
        return false
      }
      throw e
    }
    setWorks(updated)
    return true
  }, [isCloud, user])

  // 删除:云端删行;本机写回过滤后的列表
  const deleteWork = useCallback(async (work) => {
    if (isCloud()) {
      try {
        const { error } = await supabase.from('works').delete().eq('id', work.id)
        if (error) throw error
        setWorks((prev) => prev.filter((w) => w.id !== work.id))
      } catch (e) {
        console.error('云端删除失败:', e)
        toast(i18n.t('errors.deleteFailed'), 'error')
      }
      return
    }
    const updated = worksRef.current.filter((w) => w.id !== work.id)
    try {
      localStorage.setItem(KEY, JSON.stringify(updated))
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        toast(i18n.t('errors.storageFull'), 'error')
        return
      }
      throw e
    }
    setWorks(updated)
  }, [isCloud])

  // 同步 toast 已展示后调用,重置迁移计数
  const ackSync = useCallback(() => setSyncCount(null), [])

  return {
    works,
    worksLoading,
    syncCount,
    cloudMirrorCount,
    saveWork,
    deleteWork,
    ackSync,
  }
}
