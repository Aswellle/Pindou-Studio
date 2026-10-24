/**
 * 用户头像 — 登录后显示在顶部导航右侧,以及个人中心的身份摘要 / 头像编辑区。
 *
 * 视觉:圆形(社交平台通行标准)+ 细边框;有头像图显示图片,否则显示昵称/邮箱
 * 首字符,橙色背景 + 白色文字(与站点 --accent 一致,强对比保证清晰可见)。
 *
 * 样式放在同目录的 Avatar.css 并由本文件导入,不依赖调用方页面 —— Header 只在
 * 非独立页渲染,/profile 这类独立页不挂载 Header,样式留在 Header 里就会丢失。
 */
import { toStorageUrl } from '../services/supabase'
import './Avatar.css'

export default function Avatar({ user, size = 32, onClick }) {
  const initial = (user?.nickname || user?.name || user?.email || 'A')[0].toUpperCase()

  // 只渲染本站 avatars bucket 的 URL(avatarUrl 字段 RLS 允许用户自行写入,
  // 不校验的话任意登录用户可让全站 img 请求外部追踪地址);
  // 历史直连域名会被归一化到当前基址(代理生效后走同源)
  const avatarUrl = toStorageUrl(user?.avatarUrl)

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
