/**
 * useDownloadCounts — 模板下载计数(自 V1 Gallery 抽出,V2 复用)
 *
 * 本地计数(localStorage 持久)叠加云端模板 download_count:
 * 导出成功立即乐观 +1(本会话内可见),云端再走 RPC 跨用户累计;
 * RPC 成功后回冲乐观增量并触发云库刷新,避免与刷新后的 DB 双算。
 */
import { useState, useCallback } from 'react'
import { supabase } from '../../../services/supabase'

const DOWNLOAD_KEY = 'template-downloads'

export default function useDownloadCounts({ cloudEnabled = false, onCloudSync } = {}) {
  const [localDownloads, setLocalDownloads] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DOWNLOAD_KEY) || '{}') } catch { return {} }
  })
  // 本会话内「DB 尚未吸收」的乐观导出数:导出即 +1 显示(即使 DB 主导)
  const [sessionDelta, setSessionDelta] = useState({})

  const getDownloadCount = useCallback((template) => {
    const local = localDownloads[template.id] || 0
    if (!cloudEnabled) return local
    // 云端:DB 全局计数与本地计数取较大(DB 增长后覆盖本浏览器累计),再叠加乐观增量
    return Math.max(template.downloadCount || 0, local) + (sessionDelta[template.id] || 0)
  }, [cloudEnabled, localDownloads, sessionDelta])

  const bumpDownload = useCallback(async (template) => {
    // 先立即更新本地显示并持久化(localStorage),保证导出后马上 +1、刷新也在
    setSessionDelta(prev => ({ ...prev, [template.id]: (prev[template.id] || 0) + 1 }))
    setLocalDownloads(prev => {
      const next = { ...prev, [template.id]: (prev[template.id] || 0) + 1 }
      try { localStorage.setItem(DOWNLOAD_KEY, JSON.stringify(next)) } catch { /* 配额超限忽略 */ }
      return next
    })
    if (!cloudEnabled) return
    // 显式检查 RPC 返回的 { error }:supabase-js 失败时不抛错,只返回 error 对象
    try {
      const { error } = await supabase.rpc('increment_template_download', { p_id: template.id })
      if (error) {
        console.warn('[download-count] RPC 失败:', error.message, '模板', template.name, template.id)
      } else {
        // DB 已 +1:吸收本次乐观增量(避免与刷新后的 DB 双算),并主动刷新
        // (不依赖 realtime 订阅),让图库卡片计数与后台统计仪表盘同步显示。
        setSessionDelta(prev => ({ ...prev, [template.id]: Math.max(0, (prev[template.id] || 0) - 1) }))
        onCloudSync?.()
      }
    } catch (e) {
      console.warn('[download-count] RPC 异常:', e)
    }
  }, [cloudEnabled, onCloudSync])

  return { getDownloadCount, bumpDownload }
}
