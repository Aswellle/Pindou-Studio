/**
 * useGalleryQuery — Gallery V2 URL 状态管理
 *
 * 将搜索词、分类、难度等筛选状态同步到 URLSearchParams，
 * 支持刷新恢复、浏览器前进后退、分享链接。
 *
 * URL 格式: /gallery?q=xxx&cat=animal&diff=easy
 *
 * 主题页/合集页复用同一套筛选:它们也读取 q/cat/diff,
 * 只是作用在各自范围内的模板列表上。
 */

import { useSearchParams } from 'react-router-dom'

/**
 * 「用色数」筛选档位(上限,单位:色)。
 *
 * 图库、主题页、合集页共用同一组档位:三处的语义都是「最多用 N 色」,
 * 档位不一致会让同一个链接在不同页面筛出不同结果,用户无法预期。
 */
export const COLOR_COUNT_TIERS = Object.freeze([4, 8, 12, 16, 24, 32])

/**
 * @returns {{ searchTerm, category, difficulty, setSearchTerm, setCategory, setDifficulty }}
 */
export function useGalleryQuery() {
  const [searchParams, setSearchParams] = useSearchParams()

  const searchTerm = searchParams.get('q') || ''
  const category = searchParams.get('cat') || 'all'
  const difficulty = searchParams.get('diff') || 'all'
  // 用色数量上限:空 = 不限。只接受正整数,非法值当不限处理。
  const rawColors = searchParams.get('colors') || ''
  const maxColors = /^\d+$/.test(rawColors) && Number(rawColors) > 0 ? Number(rawColors) : null

  const setSearchTerm = (value) => {
    const params = new URLSearchParams(searchParams)
    if (value) params.set('q', value)
    else params.delete('q')
    setSearchParams(params, { replace: true })
  }

  const setCategory = (value) => {
    const params = new URLSearchParams(searchParams)
    if (value && value !== 'all') params.set('cat', value)
    else params.delete('cat')
    setSearchParams(params, { replace: true })
  }

  const setDifficulty = (value) => {
    const params = new URLSearchParams(searchParams)
    if (value && value !== 'all') params.set('diff', value)
    else params.delete('diff')
    setSearchParams(params, { replace: true })
  }

  const setMaxColors = (value) => {
    const params = new URLSearchParams(searchParams)
    const n = Number(value)
    if (value && Number.isFinite(n) && n > 0) params.set('colors', String(Math.trunc(n)))
    else params.delete('colors')
    setSearchParams(params, { replace: true })
  }

  /**
   * 一次写入多个筛选值。
   * 连续调用单个 setter 时,每个 setter 都从「当前渲染的 searchParams」构造,
   * 同一 tick 内后一次会覆盖前一次(例如重置三个筛选只剩最后一个生效)。
   * 需要同时改多项时用这个。
   */
  const setFilters = (patch = {}) => {
    const params = new URLSearchParams(searchParams)
    if ('q' in patch) {
      if (patch.q) params.set('q', patch.q)
      else params.delete('q')
    }
    if ('cat' in patch) {
      if (patch.cat && patch.cat !== 'all') params.set('cat', patch.cat)
      else params.delete('cat')
    }
    if ('diff' in patch) {
      if (patch.diff && patch.diff !== 'all') params.set('diff', patch.diff)
      else params.delete('diff')
    }
    if ('colors' in patch) {
      const n = Number(patch.colors)
      if (patch.colors && Number.isFinite(n) && n > 0) params.set('colors', String(Math.trunc(n)))
      else params.delete('colors')
    }
    setSearchParams(params, { replace: true })
  }

  return {
    searchTerm,
    category,
    difficulty,
    maxColors,
    setSearchTerm,
    setCategory,
    setDifficulty,
    setMaxColors,
    setFilters,
  }
}
