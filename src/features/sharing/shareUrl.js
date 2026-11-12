/**
 * 分享链接与回跳路径的纯函数。
 *
 * 三条硬约束:
 *   1. QR 与分享卡上编码的是**创建分享时所处环境**的分享 URL
 *      (`<当前 origin>/share/<uuid>`):生产环境即 canonical 域名,
 *      本地/预览环境生成的链接在本环境内可直接打开 ——
 *      否则未部署的测试环境里复制的链接永远是「页面不存在」;
 *   2. 分享 id 只接受标准 UUID 形状 —— 任何额外层级、查询串、锚点都不算分享页;
 *   3. 登录回跳只允许**站内分享页**,杜绝 open redirect。
 */

export const SITE_ORIGIN = 'https://tangnotes.site'

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const SHARE_PATH_RE = new RegExp(`^/share/(${UUID})/?$`)

/**
 * 当前访问 origin。浏览器运行时取 window.location,
 * 非浏览器环境(SSR/测试直调)退回生产 canonical 域名。
 */
export function currentOrigin() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }
  return SITE_ORIGIN
}

/** 站内分享页路径(用于路由与 canonical) */
export function sharePath(id) {
  return `/share/${id}`
}

/** 分享链接(QR / 分享卡 / 复制链接共用);显式传 origin 时以调用方为准 */
export function shareUrl(id, origin = currentOrigin()) {
  const base = String(origin || currentOrigin()).replace(/\/+$/, '')
  return `${base}/share/${id}`
}

/** 是否是一条合法的分享页路径(允许末尾斜杠) */
export function isSharePath(pathname) {
  return typeof pathname === 'string' && SHARE_PATH_RE.test(pathname)
}

/** 从路径提取 UUID;不合法返回 null */
export function shareIdFromPath(pathname) {
  if (typeof pathname !== 'string') return null
  const match = SHARE_PATH_RE.exec(pathname)
  return match ? match[1] : null
}

