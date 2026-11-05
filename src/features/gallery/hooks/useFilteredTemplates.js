import { useCallback, useMemo } from 'react'
import { useGalleryQuery } from './useGalleryQuery'
import { extractPatternColors } from '../../../data/templates'

/**
 * 单个模板是否命中当前筛选(图库首页 / 主题页 / 合集页共用同一语义)。
 *
 * 搜索要求(02 §6.4):
 *   - 同时比较原始 name、nameZh 与当前语言显示名 —— 不能因为 name 非空
 *     就跳过翻译名;
 *   - 首尾空格去掉后再比较。
 */
export function templateMatchesQuery(
  template,
  { searchTerm = '', category = 'all', difficulty = 'all', maxColors = null } = {},
  resolveName
) {
  const term = String(searchTerm || '')
    .trim()
    .toLowerCase()
  if (term) {
    const haystack = [template?.name, template?.nameZh, resolveName ? resolveName(template) : '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(term)) return false
  }
  if (category !== 'all' && template?.category !== category) return false
  if (difficulty !== 'all' && template?.difficulty !== difficulty) return false
  if (maxColors && extractPatternColors(template.pattern).length > maxColors) return false
  return true
}

/**
 * 在任意模板列表上复用图库的 URL 筛选(q/cat/diff)。
 * 主题页/合集页只需要「给定列表 → 过滤结果」,不重复实现筛选语义。
 *
 * 搜索匹配与图库首页一致:名称同时比较原始 name/nameZh 与 i18n 翻译后的名字
 * (由调用方传入 resolveName,它依赖当前语言;语言切换时列表需要重算)。
 *
 * @param {Array} templates
 * @param {(t:object)=>string} resolveName - 当前语言下的显示名
 * @returns {{filtered:Array, searchTerm, category, difficulty, setSearchTerm, setCategory, setDifficulty, resetFilters}}
 */
export function useFilteredTemplates(templates, resolveName) {
  const {
    searchTerm,
    setSearchTerm,
    category,
    setCategory,
    difficulty,
    setDifficulty,
    maxColors,
    setMaxColors,
    setFilters,
  } = useGalleryQuery()

  const filtered = useMemo(
    () =>
      (templates || []).filter(template =>
        templateMatchesQuery(template, { searchTerm, category, difficulty, maxColors }, resolveName)
      ),
    [templates, searchTerm, category, difficulty, maxColors, resolveName]
  )

  const resetFilters = useCallback(() => {
    // 一次写入三项:连续调用单个 setter 会互相覆盖(见 useGalleryQuery.setFilters)
    setFilters({ q: '', cat: 'all', diff: 'all', colors: '' })
  }, [setFilters])

  return {
    filtered,
    searchTerm,
    category,
    difficulty,
    maxColors,
    setSearchTerm,
    setCategory,
    setDifficulty,
    setMaxColors,
    resetFilters,
  }
}

export default useFilteredTemplates
