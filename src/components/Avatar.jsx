/**
 * 用户头像 — 登录后显示在顶部导航右侧。
 * 有头像图显示图片;否则显示昵称/邮箱首字符,橙色背景 + 白色文字
 * (与站点 --accent 一致,强对比保证清晰可见)。
 */
import { SUPABASE_URL } from '../services/supabase'

export default function Avatar({ user, size = 32, onClick }) {
  const initial = (user?.nickname || user?.name || user?.email || 'A')[0].toUpperCase()

  // 只渲染本站 avatars bucket 的同源 URL(avatarUrl 字段 RLS 允许用户自行写入,
  // 不校验的话任意登录用户可让全站 img 请求外部追踪地址)
  const avatarUrl = user?.avatarUrl?.startsWith(SUPABASE_URL)
    && user.avatarUrl.includes('/storage/v1/object/public/avatars/')
    ? user.avatarUrl
    : null

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={user.nickname || user.name || user.email}
        className="avatar-img"
        style={{ width: size, height: size }}
        onClick={onClick}
      />
    )
  }
  return (
    <span
      className="avatar-fallback"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      onClick={onClick}
      aria-label={user?.email}
    >
      {initial}
    </span>
  )
}
