import { createClient } from '@supabase/supabase-js'

// 云端(Supabase)配置。环境变量未配置时,站点自动回退到纯本地模式
// (内置模板 + localStorage 自定义模板),云端相关功能显示配置指引。
// 注意:anon key 是公开的(RLS 在服务端强制权限),service_role key 严禁暴露。
// 兼容 VITE_ 前缀(local .env.local)与无前缀(Vercel 环境变量)两种命名
// BUILD_MARKER:v3
const configuredUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || ''
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  ''

// ── 同域反向代理 ──────────────────────────────────────────────
// 部分网络(尤其国内手机蜂窝数据)无法直连 *.supabase.co:DNS/连接直接失败,
// 表现为图库「云端模板加载失败」、无法登录。vercel.json 把 /sb/* 反代到 Supabase
// 源站,前端改用同源基址后只依赖站点自身域名。
// - 默认 auto:真实域名(http/https、非 localhost)且配置的是 supabase 域名时启用
// - VITE_SUPABASE_PROXY=off 可强制直连
export const SUPABASE_PROXY_PREFIX = '/sb'

const isSupabaseHost = host => /(^|\.)supabase\.(co|in)$/.test(host)
const isLocalHost = host => host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
/**
 * IP 字面量(局域网 IPv4、IPv6)一律视为本地访问。
 *
 * 本地预览/开发服务器常用 http://192.168.x.x:端口 或 http://[::1]:端口 打开;
 * 这些地址没有 /sb 反向代理(只有 Vercel 上有),若仍走同源代理,所有 Supabase
 * 请求会命中 SPA 兜底返回 index.html,表现为「网络错误」且发布门禁被误判为关闭。
 */
const isIpHost = host =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || // IPv4(location.hostname 无括号)
  host.includes(':') || // IPv6(location.hostname 带方括号,如 [::1]、[2001:db8::1])
  host.endsWith('.local') // mDNS 局域网主机名

/**
 * 决定实际使用的 Supabase 基址(纯函数,便于测试)。
 * @param {string} configuredUrl - 环境变量里配置的直连地址
 * @param {{protocol:string, hostname:string, origin:string}|null} loc - 当前页面 location
 * @param {'auto'|'off'} mode - VITE_SUPABASE_PROXY
 */
export function resolveSupabaseBase(configuredUrl, loc, mode = 'auto') {
  if (!configuredUrl) return ''
  if (mode === 'off' || !loc) return configuredUrl
  let host = ''
  try {
    host = new URL(configuredUrl).hostname
  } catch {
    return configuredUrl
  }
  if (!isSupabaseHost(host)) return configuredUrl
  if (loc.protocol !== 'http:' && loc.protocol !== 'https:') return configuredUrl
  if (isLocalHost(loc.hostname) || isIpHost(loc.hostname)) return configuredUrl // 本地开发直连(开发机网络可达)
  return `${loc.origin}${SUPABASE_PROXY_PREFIX}`
}

const effectiveUrl = resolveSupabaseBase(
  configuredUrl,
  typeof window !== 'undefined' ? window.location : null,
  import.meta.env.VITE_SUPABASE_PROXY || 'auto'
)

// 认证选项(显式关闭 URL 会话注入与 implicit 流):
//   · detectSessionInUrl:false —— auth-js 默认会在任意路由解析 #access_token=
//     并把浏览者静默换绑到该令牌所属账号(登录 CSRF);本应用全部认证走
//     signInWithOtp 验证码 + verifyOtp,不经 URL 回调,关闭无副作用。
//   · flowType:'pkce' —— 本应用无 OAuth 第三方登录,implicit 流只有默认值
//     在用;PKCE 关掉 access_token 形态的会话注入面。
//   · 导出 AUTH_OPTIONS 供契约测试锁定,防止将来无意改回默认值。
// 注意:useAuth 的 register/resetPasswordForEmail 会生成邮件确认/恢复链接,
// 它们与「关闭 URL 会话检测」不兼容(确认链接将不再自动登录,用户回站手动
// 登录即可;恢复链接请改用 signInWithOtp 验证码流程),两条 UI 已未接线。
export const AUTH_OPTIONS = {
  auth: { detectSessionInUrl: false, flowType: 'pkce' },
}

export const supabase = effectiveUrl && supabaseAnonKey ? createClient(effectiveUrl, supabaseAnonKey, AUTH_OPTIONS) : null

export const isCloudEnabled = () => supabase !== null

// 供头像等 storage 公共 URL 拼接使用(代理生效时为同源基址)
export const SUPABASE_URL = effectiveUrl || ''

// 直连基址:用于识别历史数据里以旧域名存下的头像 URL
export const SUPABASE_DIRECT_URL = configuredUrl || ''

// 是否经同域代理。代理下 Realtime WebSocket 不可用(vercel rewrite 不转发 WS),
// 调用方应跳过实时订阅,依赖「网络恢复 / 页面重新可见」的自动刷新兜底。
export const SUPABASE_PROXIED = !!supabase && effectiveUrl !== configuredUrl

const AVATAR_STORAGE_PATH = '/storage/v1/object/public/avatars/'

/**
 * 把存库的头像 URL 归一化到当前基址。
 * - 只接受指向本项目 avatars bucket 公共路径的 URL(直连域名或代理基址),
 *   保持原有「防任意外部 URL 被当头像加载」的校验
 * - 历史数据里存的是直连域名,代理生效后改写为同源基址,否则受限网络下加载不出来
 */
export function toStorageUrl(raw, currentBase = SUPABASE_URL, directBase = SUPABASE_DIRECT_URL) {
  if (typeof raw !== 'string' || !currentBase) return null
  // 用解析后的 origin 比较,而不是 startsWith:a.b.supabase.co.evil.example
  // 同样以配置基址开头,前缀匹配会把外部域名当成自家存储。
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  const bases = [currentBase, directBase]
    .filter(Boolean)
    .map(base => {
      try {
        const u = new URL(base)
        return { origin: u.origin, path: u.pathname.replace(/\/+$/, '') }
      } catch {
        return null
      }
    })
    .filter(Boolean)
  const matched = bases.find(
    b =>
      b.origin === parsed.origin && (parsed.pathname === b.path || parsed.pathname.startsWith(`${b.path}/`))
  )
  if (!matched) return null
  // 基址本身可能带路径(同域代理的 /sb),先剥掉再判定 avatars 公共路径。
  const rest = parsed.pathname.slice(matched.path.length)
  if (!rest.startsWith(AVATAR_STORAGE_PATH)) return null
  return `${currentBase.replace(/\/+$/, '')}${rest}${parsed.search}`
}
