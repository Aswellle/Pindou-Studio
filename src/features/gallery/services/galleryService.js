/**
 * galleryService — Gallery V2 数据层
 *
 * 将模板、收藏、分类、用户作品等数据逻辑从组件抽离，
 * 支持云端（Supabase）和本地（localStorage）双模式。
 */

import { supabase } from '../../services/supabase'

/**
 * 获取模板列表
 *
 * @param {Object} options
 * @param {boolean} options.cloudEnabled - 是否启用云端
 * @param {Array} options.localTemplates - 本地自定义模板
 * @param {Array} options.cloudTemplates - 云端模板
 * @returns {Promise<Array>} 模板列表
 */
export async function fetchTemplates({ cloudEnabled, localTemplates = [], cloudTemplates = [] }) {
  if (cloudEnabled) {
    return cloudTemplates
  }
  return localTemplates
}

/**
 * 获取分类列表
 *
 * @param {Object} options
 * @param {boolean} options.cloudEnabled
 * @param {Array} options.localCategories
 * @param {Array} options.cloudCategories
 * @returns {Promise<Array>} 分类列表
 */
export async function fetchCategories({ cloudEnabled, localCategories = [], cloudCategories = [] }) {
  if (cloudEnabled) {
    return cloudCategories
  }
  return localCategories
}

/**
 * 切换收藏状态
 *
 * @param {string|number} templateId - 模板 ID
 * @param {Array} favorites - 当前收藏列表
 * @returns {Array>} 更新后的收藏列表
 */
export function toggleFavorite(templateId, favorites) {
  const id = String(templateId)
  const idx = favorites.indexOf(id)
  if (idx >= 0) {
    return favorites.filter(f => f !== id)
  }
  return [...favorites, id]
}

/**
 * 检查是否已收藏
 *
 * @param {string|number} templateId
 * @param {Array} favorites
 * @returns {boolean}
 */
export function isFavorited(templateId, favorites) {
  return favorites.includes(String(templateId))
}

/**
 * 搜索模板
 *
 * @param {Array} templates - 模板列表
 * @param {string} query - 搜索关键词
 * @returns {Array} 匹配的模板
 */
export function searchTemplates(templates, query) {
  if (!query) return templates
  const q = query.toLowerCase()
  return templates.filter(t =>
    (t.name || t.nameZh || '').toLowerCase().includes(q)
  )
}

/**
 * 按分类筛选
 *
 * @param {Array} templates
 * @param {string} category - 分类 ID（'all' 不过滤）
 * @returns {Array}
 */
export function filterByCategory(templates, category) {
  if (!category || category === 'all') return templates
  return templates.filter(t => t.category === category)
}

/**
 * 按难度筛选
 *
 * @param {Array} templates
 * @param {string} difficulty - 难度（'all' 不过滤）
 * @returns {Array}
 */
export function filterByDifficulty(templates, difficulty) {
  if (!difficulty || difficulty === 'all') return templates
  return templates.filter(t => t.difficulty === difficulty)
}

/**
 * 获取收藏列表（localStorage）
 *
 * @returns {Array<string>}
 */
export function getFavoritesFromStorage() {
  try {
    const saved = localStorage.getItem('gallery-favorites')
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

/**
 * 保存收藏列表到 localStorage
 *
 * @param {Array<string>} favorites
 */
export function saveFavoritesToStorage(favorites) {
  localStorage.setItem('gallery-favorites', JSON.stringify(favorites))
}
