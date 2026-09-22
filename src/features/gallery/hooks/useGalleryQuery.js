/**
 * useGalleryQuery — Gallery V2 URL 状态管理
 *
 * 将搜索词、分类、难度等筛选状态同步到 URLSearchParams，
 * 支持刷新恢复、浏览器前进后退、分享链接。
 *
 * URL 格式: /gallery?q=xxx&cat=animal&diff=easy
 */

import { useSearchParams } from 'react-router-dom'

/**
 * @returns {{ searchTerm, category, difficulty, setSearchTerm, setCategory, setDifficulty }}
 */
export function useGalleryQuery() {
  const [searchParams, setSearchParams] = useSearchParams()

  const searchTerm = searchParams.get('q') || ''
  const category = searchParams.get('cat') || 'all'
  const difficulty = searchParams.get('diff') || 'all'

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

  return {
    searchTerm,
    category,
    difficulty,
    setSearchTerm,
    setCategory,
    setDifficulty,
  }
}
