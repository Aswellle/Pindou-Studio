/**
 * SEO 路径工具:决定某个前端路由应该用哪条 URL 作为 canonical 基准。
 *
 * 背景:App 的 SEO 配置按 currentPage 归组,`/gallery/*` 全部归为 gallery,
 * 若直接用它拼 canonical,主题/合集/图纸详情都会指向 `/gallery`,
 * 被搜索引擎判为重复内容、无法独立收录。
 *
 * 规则:只有已确认的动态内容页(主题/合集/图纸详情)自指,
 * 其余路径一律回退到页面级规范路径 —— 不信任任意 pathname,
 * 避免把 404 或未知子路径也当成可收录页面。
 */

const GALLERY_DETAIL_RE = /^\/gallery\/(?:theme|collection|pattern)\/[^/]+$/

/**
 * @param {string} pathname - react-router 的 location.pathname
 * @param {string} fallback - 页面级规范路径(如 /gallery)
 * @returns {string} 以 / 开头的规范路径
 */
export function canonicalPathFor(pathname, fallback = '/') {
  if (typeof pathname !== 'string' || !pathname) return fallback
  const clean = pathname.replace(/\/+$/, '') || '/'
  return GALLERY_DETAIL_RE.test(clean) ? clean : fallback
}
