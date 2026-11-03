/**
 * 登录后的安全回跳地址。
 *
 * 守卫入口会把「用户原本要去的站内路径」放进 location.state.next(或 ?next=),
 * 登录/注册成功后回到那里,而不是一律回首页。只接受站内绝对路径:
 *   - 必须以单个 '/' 开头(拒绝 '//evil.com'、'https://…' 这类开放重定向);
 *   - 拒绝反斜杠(部分浏览器把 '\' 当路径分隔符)与控制字符;
 *   - 其他情况一律退回 '/'。
 */

export const DEFAULT_NEXT_PATH = '/'

/**
 * @param {unknown} next - 待校验的回跳路径
 * @returns {string} 可安全用于 navigate 的站内路径
 */
export function safeNextPath(next) {
  if (typeof next !== 'string') return DEFAULT_NEXT_PATH
  const value = next.trim()
  if (!value.startsWith('/')) return DEFAULT_NEXT_PATH
  if (value.startsWith('//')) return DEFAULT_NEXT_PATH
  if (value.includes('\\')) return DEFAULT_NEXT_PATH
  // 控制字符(含换行)可被用于绕过前缀检查
  if ([...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) {
    return DEFAULT_NEXT_PATH
  }
  return value
}

const GATE_REASONS = new Set(['profile', 'ironing', 'quality'])

/**
 * 从登录页的 location 中解析回跳路径与守卫原因。
 * 优先取路由 state(应用内跳转),其次取 ?next= 查询参数(直接分享的链接)。
 *
 * @param {{state?: object, search?: string}} location - react-router 的 location
 * @returns {{next: string, reason: string|null}}
 */
export function resolveAuthRedirect(location) {
  const state = location?.state && typeof location.state === 'object' ? location.state : {}
  let queryNext = null
  try {
    queryNext = new URLSearchParams(location?.search || '').get('next')
  } catch {
    queryNext = null
  }
  const next = safeNextPath(state.next || queryNext)
  const reason = GATE_REASONS.has(state.reason) ? state.reason : null
  return { next, reason }
}
