import { useState } from 'react'
import i18n from '../i18n'

const KEY = 'saved-works'
const WARN_BYTES = 4 * 1024 * 1024

function load() {
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

/**
 * Encapsulates saved-works localStorage sync.
 * Handles quota warnings and QuotaExceededError in one place.
 */
export function useSavedWorks() {
  const [works, setWorks] = useState(load)

  const saveWork = (newWork) => {
    const updated = [...works, newWork]
    const serialized = JSON.stringify(updated)
    if (serialized.length > WARN_BYTES) {
      const kb = Math.round(serialized.length / 1024)
      if (!window.confirm(`存储空间已使用约 ${kb}KB（接近 5MB 上限），建议先删除部分旧作品。是否继续保存？`)) return false
    }
    try {
      localStorage.setItem(KEY, serialized)
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        alert(i18n.t('errors.storageFull'))
        return false
      }
      throw e
    }
    setWorks(updated)
    return true
  }

  const updateWorks = (updated) => {
    setWorks(updated)
    localStorage.setItem(KEY, JSON.stringify(updated))
  }

  return { works, saveWork, updateWorks }
}
