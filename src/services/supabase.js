import { createClient } from '@supabase/supabase-js'

// 云端(Supabase)配置。环境变量未配置时,站点自动回退到纯本地模式
// (内置模板 + localStorage 自定义模板),云端相关功能显示配置指引。
// 注意:anon key 是公开的(RLS 在服务端强制权限),service_role key 严禁暴露。
// 兼容 VITE_ 前缀(local .env.local)与无前缀(Vercel 环境变量)两种命名
// BUILD_MARKER:v3
const configuredUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || ""
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  ""

// ── 同域反向代理 ──────────────────────────────────────────────
// 部分网络(尤其国内手机蜂窝数据)无法直连 *.supabase.co:DNS/连接直接失败,
// 表现为图库「云端模板加载失败」、无法登录。vercel.json 把 /sb/* 反代到 Supabase
// 源站,前端改用同源基址后只依赖站点自身域名。
// - 默认 auto:真实域名(http/https、非 localhost)且配置的是 supabase 域名时启用
// - VITE_SUPABASE_PROXY=off 可强制直连
export const SUPABASE_PROXY_PREFIX = '/sb'

const isSupabaseHost = (host) => /(^|\.)supabase\.(co|in)$/.test(host)
const isLocalHost = (host) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]'

function resolveEffectiveUrl() {
  if (!configuredUrl) return ''
  if ((import.meta.env.VITE_SUPABASE_PROXY || 'auto') === 'off') return configuredUrl
  if (typeof window === 'undefined') return configuredUrl
  let host = ''
  try { host = new URL(configuredUrl).hostname } catch { return configuredUrl }
  if (!isSupabaseHost(host)) return configuredUrl
  const { protocol, hostname, origin } = window.location
  if (protocol !== 'http:' && protocol !== 'https:') return configuredUrl
  if (isLocalHost(hostname)) return configuredUrl // 本地开发直连(开发机网络可达)
  return `${origin}${SUPABASE_PROXY_PREFIX}`
}

const effectiveUrl = resolveEffectiveUrl()

export const supabase =
  effectiveUrl && supabaseAnonKey
    ? createClient(effectiveUrl, supabaseAnonKey)
    : null

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
export function toStorageUrl(raw) {
  if (typeof raw !== 'string' || !raw.includes(AVATAR_STORAGE_PATH)) return null
  const base = [SUPABASE_URL, SUPABASE_DIRECT_URL].filter(Boolean).find((b) => raw.startsWith(b))
  return base ? `${SUPABASE_URL}${raw.slice(base.length)}` : null
}
