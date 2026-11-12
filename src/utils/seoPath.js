/**
 * SEO 路径工具:决定某个前端路由应该用哪条 URL 作为 canonical 基准。
 *
 * 背景:App 的 SEO 配置按 currentPage 归组,`/gallery/*` 全部归为 gallery,
 * 若直接用它拼 canonical,主题/合集/图纸详情都会指向 `/gallery`,
 * 被搜索引擎判为重复内容、无法独立收录。
 *
 * 规则:只有已确认的动态内容页(主题/合集/图纸详情/分类聚合)自指,
 * 其余路径一律回退到页面级规范路径 —— 不信任任意 pathname,
 * 避免把 404 或未知子路径也当成可收录页面。
 */

const GALLERY_DETAIL_RE = /^\/gallery\/(?:theme|collection|pattern|category)\/[^/]+$/
// 教程文章:/tutorials/<id>。构建期为全部文章生成独立 HTML(自指 canonical +
// 独立 title/description),若这里不退化为页面级路径,React 首帧 Helmet 会把
// 18 篇文章的 canonical 全部改写回 /tutorials —— 搜索端只能看到 1 个页面。
// 形状只认小写短横线 slug,与 src/data/tutorials.*.js 的 id 命名一致。
const TUTORIAL_DETAIL_RE = /^\/tutorials\/[a-z0-9]+(?:-[a-z0-9]+)*$/
// 公开分享页:/share/<uuid>。只认 UUID 形状,与 shareUrl 生成、vercel.json 的
// rewrite(→ /api/share-preview/:id)保持一致;/share/whatever 不是真实页面。
const SHARE_DETAIL_RE = /^\/share\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
// 品牌色卡对照页:/colors/<brand>。品牌 slug 只含小写字母与数字(见
// features/colors/colorCharts.js);未知品牌由 App 的 colorSlug 判定覆盖成 404,
// 与分类聚合页同一套处理。
const COLOR_CHART_RE = /^\/colors\/[a-z0-9]+$/

/**
 * 该路径是否对应一个真实存在的站内页面。
 *
 * 用途:App 用它区分「已知路由」与「404」。此前 `*` 路由直接 `<Navigate to="/" replace />`,
 * 访问一个不存在的地址会被静默改写回首页 —— 用户看不出自己点错了,搜索引擎则会把
 * 无数个乱路径当成首页副本(软 404)。现在未知路径渲染 404 页并标 noindex。
 *
 * 这里只列**确切的**路由形状,不做前缀猜测:`/gallery/whatever` 不是合法页面,
 * 但 `/gallery/theme/spring` 是。
 */
const KNOWN_EXACT = new Set([
  '/', '/login', '/profile', '/gallery', '/tutorials',
  '/create/image', '/editor', '/import', '/my/beads', '/contact', '/faq', '/colors',
  '/ironing', '/bead-calculator', '/bead-patterns', '/pixel-art',
  '/admin', '/admin/login', '/admin/dashboard',
  '/privacy', '/terms',
])
const LEGAL_VERSION_RE = /^\/(?:privacy|terms)\/[^/]+$/

export function isKnownPath(pathname) {
  if (typeof pathname !== 'string' || !pathname) return false
  const clean = pathname.replace(/\/+$/, '') || '/'
  return (
    KNOWN_EXACT.has(clean)
    || GALLERY_DETAIL_RE.test(clean)
    || TUTORIAL_DETAIL_RE.test(clean)
    || COLOR_CHART_RE.test(clean)
    || SHARE_DETAIL_RE.test(clean)
    || LEGAL_VERSION_RE.test(clean)
  )
}

/**
 * @param {string} pathname - react-router 的 location.pathname
 * @param {string} fallback - 页面级规范路径(如 /gallery)
 * @returns {string} 以 / 开头的规范路径
 */
export function canonicalPathFor(pathname, fallback = '/') {
  if (typeof pathname !== 'string' || !pathname) return fallback
  const clean = pathname.replace(/\/+$/, '') || '/'
  return GALLERY_DETAIL_RE.test(clean)
    || TUTORIAL_DETAIL_RE.test(clean)
    || COLOR_CHART_RE.test(clean)
    || SHARE_DETAIL_RE.test(clean)
    ? clean
    : fallback
}
