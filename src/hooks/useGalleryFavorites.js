/**
 * useGalleryFavorites — 「我的收藏」的唯一数据源。
 *
 * 收藏一直存在 localStorage['gallery-favorites'],但读写逻辑原先埋在
 * GalleryPage 内部。收藏列表移到个人中心后,两处都要读同一份数据:
 * 图库卡片上的心形按钮负责增删,个人中心的收藏分区负责展示与取消。
 * 各自 useState 会导致一边操作、另一边不刷新,所以抽成 hook。
 *
 * 跨组件同步:同一页面里两个实例不会同时挂载(图库与个人中心是不同路由),
 * 但为防「前进后退回到图库时读到旧值」,写盘后广播一个自定义事件,
 * 其它实例收到后重读。不做轮询,也不引入全局 store。
 *
 * 存储格式:内置模板 id 是数字、云端模板 id 是 uuid,一律原样存,
 * 比较时用 String() 归一 —— 与历史数据保持兼容,不迁移、不改写。
 */

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'gallery-favorites'
const SYNC_EVENT = 'gallery-favorites-changed'

function readStored() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed : [] // 脏数据不白屏
  } catch {
    return []
  }
}

export default function useGalleryFavorites() {
  const [favorites, setFavorites] = useState(readStored)

  // 其它实例写入后重读。storage 事件覆盖其它标签页,自定义事件覆盖本页。
  useEffect(() => {
    const reload = () => setFavorites(readStored())
    window.addEventListener(SYNC_EVENT, reload)
    window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) reload() })
    return () => {
      window.removeEventListener(SYNC_EVENT, reload)
    }
  }, [])

  const persist = useCallback((next) => {
    setFavorites(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* 配额满:内存里仍生效,本次会话可用,不阻断交互 */ }
    window.dispatchEvent(new Event(SYNC_EVENT))
  }, [])

  const isFavorite = useCallback(
    (id) => favorites.some((f) => String(f) === String(id)),
    [favorites],
  )

  const toggleFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.some((f) => String(f) === String(id))
        ? prev.filter((f) => String(f) !== String(id))
        : [...prev, id]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch { /* 同上 */ }
      window.dispatchEvent(new Event(SYNC_EVENT))
      return next
    })
  }, [])

  const removeFavorite = useCallback((id) => {
    persist(favorites.filter((f) => String(f) !== String(id)))
  }, [favorites, persist])

  return { favorites, isFavorite, toggleFavorite, removeFavorite }
}
