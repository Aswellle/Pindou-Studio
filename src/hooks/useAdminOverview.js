import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'

/**
 * 管理概览数据源:admin_overview()(用户/趋势/留言聚合)+ admin_list_registrations()
 * (最近注册名单)。
 *
 * 两个调用并发发出;移动端弱网或令牌静默刷新时 fetch 可能长时间不返回,
 * 因此加超时保护,失败后保留上一次数据并交由页面显示「重试」。
 * error 用代码而非文案('timeout' | 'failed'),文案在组件里走 i18n。
 */

const OVERVIEW_TIMEOUT_MS = 15000
const REGISTRATION_FEED_LIMIT = 8

export const OVERVIEW_ERROR_TIMEOUT = 'timeout'
export const OVERVIEW_ERROR_FAILED = 'failed'

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(OVERVIEW_ERROR_TIMEOUT)), ms)
  promise.then(
    (value) => { clearTimeout(timer); resolve(value) },
    (error) => { clearTimeout(timer); reject(error) },
  )
})

export default function useAdminOverview({ enabled = true } = {}) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    errorDetail: '',
    overview: null,
    registrations: [],
    loadedAt: null,
  })
  const aliveRef = useRef(true)
  const ticketRef = useRef(0)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!supabase || !enabled) {
      setState({ loading: false, error: '', errorDetail: '', overview: null, registrations: [], loadedAt: null })
      return
    }
    const ticket = ticketRef.current + 1
    ticketRef.current = ticket
    setState((prev) => ({ ...prev, loading: true, error: '', errorDetail: '' }))

    try {
      const [overviewRes, feedRes] = await withTimeout(
        Promise.all([
          supabase.rpc('admin_overview'),
          supabase.rpc('admin_list_registrations', { p_limit: REGISTRATION_FEED_LIMIT }),
        ]),
        OVERVIEW_TIMEOUT_MS,
      )
      if (!aliveRef.current || ticket !== ticketRef.current) return

      const failure = overviewRes?.error || feedRes?.error
      if (failure) throw new Error(failure.message || OVERVIEW_ERROR_FAILED)

      setState({
        loading: false,
        error: '',
        errorDetail: '',
        overview: overviewRes?.data || null,
        registrations: Array.isArray(feedRes?.data) ? feedRes.data : [],
        loadedAt: Date.now(),
      })
    } catch (error) {
      if (!aliveRef.current || ticket !== ticketRef.current) return
      const code = error?.message === OVERVIEW_ERROR_TIMEOUT ? OVERVIEW_ERROR_TIMEOUT : OVERVIEW_ERROR_FAILED
      if (code !== OVERVIEW_ERROR_TIMEOUT) console.warn('[admin-overview] 概览数据加载失败', error)
      setState((prev) => ({ ...prev, loading: false, error: code, errorDetail: String(error?.message || '') }))
    }
  }, [enabled])

  useEffect(() => { load() }, [load])

  return { ...state, reload: load }
}
