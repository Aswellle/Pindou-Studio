import { useState } from 'react'

const KEY = 'saved-works'
const WARN_BYTES = 4 * 1024 * 1024

function load() {
  const raw = localStorage.getItem(KEY)
  if (!raw) return []
  try { return JSON.parse(raw) }
  catch { localStorage.removeItem(KEY); return [] }
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
        alert('存储空间已满，请删除部分作品后再保存。')
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
