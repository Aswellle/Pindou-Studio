/**
 * normalizeAuthUser — Supabase Auth User → 个人中心可消费的标准化身份对象。
 *
 * 项目有两类账号(migration 0006):
 *   · 邮箱账号:真实邮箱 + 密码 / 验证码;
 *   · 用户名账号:username 存于 user_metadata,内部以 `${username}@custom.local`
 *     合成邮箱注册到 Supabase Auth。
 *
 * 合成邮箱只用于调用认证 API(登录、改密码要传 email 参数),**永远不展示**。
 * 历史账号可能没有 user_metadata.username,只能从合成邮箱反推 —— 这里两种都认。
 *
 * 纯函数:不读 storage、不碰网络、不依赖 React,便于直接单测。
 */

/** 自定义账号的合成邮箱域名(与 useAuth.registerUsername 保持一致) */
export const CUSTOM_EMAIL_DOMAIN = 'custom.local'
const SYNTHETIC_SUFFIX = `@${CUSTOM_EMAIL_DOMAIN}`

/** 从 user_metadata 里取字符串,非字符串/空白一律当空 */
function metaString(meta, key) {
  const value = meta?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** 日期字段:只有确实是字符串时才保留,否则 null(不虚构时间) */
function dateOrNull(value) {
  return typeof value === 'string' && value ? value : null
}

/**
 * @param {object|null|undefined} sessionUser - supabase.auth 的 User 对象
 * @returns {object|null} 标准化身份对象;输入非法时返回 null
 */
export function normalizeAuthUser(sessionUser) {
  if (!sessionUser || typeof sessionUser !== 'object' || !sessionUser.id) return null

  const email = typeof sessionUser.email === 'string' ? sessionUser.email : ''
  const meta = sessionUser.user_metadata || {}
  const lowerEmail = email.toLowerCase()
  const emailIsSynthetic = lowerEmail.endsWith(SYNTHETIC_SUFFIX)
  const metaUsername = metaString(meta, 'username')

  // 元数据里有 username,或邮箱是合成地址 → 用户名账号。
  // 后者覆盖「早期注册没写 metadata」的历史账号,否则它们会被当成邮箱账号,
  // 界面上直接显示 xxx@custom.local。
  const isUsernameAccount = Boolean(metaUsername) || emailIsSynthetic
  const username =
    metaUsername || (emailIsSynthetic ? email.slice(0, email.length - SYNTHETIC_SUFFIX.length) : '')

  // 邮箱账号的显示名回退到邮箱前缀;用户名账号回退到用户名 —— 都用不到合成域名。
  const emailPrefix = emailIsSynthetic ? '' : email.split('@')[0] || ''
  const metaNickname = metaString(meta, 'nickname')
  const name = metaNickname || username || emailPrefix

  return {
    id: sessionUser.id,
    // 内部认证参数:调用 changePassword 等 API 时需要,但不得作为邮箱展示给用户名账号
    email,
    username,
    authType: isUsernameAccount ? 'username' : 'email',
    name,
    // 昵称/头像的权威来源是 profiles 表,由 useAuth.refreshProfile 回填;
    // 这里的 metaNickname 只作 profiles 为空时的兜底
    nickname: metaNickname,
    metaNickname,
    avatarUrl: '',
    createdAt: dateOrNull(sessionUser.created_at),
    lastSignInAt: dateOrNull(sessionUser.last_sign_in_at),
    // 用户名账号没有真实邮箱,验证状态无意义 → 保持 null,由 UI 显示「不适用」
    emailConfirmedAt: isUsernameAccount ? null : dateOrNull(sessionUser.email_confirmed_at),
    // 邮箱变更确认前 Supabase 把新地址放在 new_email,email 仍是旧地址
    pendingEmail: dateOrNull(sessionUser.new_email),
  }
}

/**
 * 账号标识(用于身份卡副标题):用户名账号显示用户名,邮箱账号显示邮箱。
 * 用户名账号永远拿不到合成地址 —— 这是本模块存在的核心原因。
 */
export function accountIdentity(user) {
  if (!user) return ''
  if (user.authType === 'username') return user.username || ''
  return user.email || ''
}

/**
 * 安全显示名:昵称 → 用户名 → 邮箱前缀 → 固定占位。
 * 不返回合成邮箱的完整字符串。
 */
export function displayNameOf(user) {
  if (!user) return ''
  const nickname = (user.nickname || '').trim()
  if (nickname) return nickname
  if (user.name) return user.name
  if (user.authType === 'username') return user.username || ''
  return (user.email || '').split('@')[0] || ''
}
