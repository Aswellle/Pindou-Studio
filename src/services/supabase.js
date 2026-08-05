import { createClient } from '@supabase/supabase-js'

// 云端(Supabase)配置。环境变量未配置时,站点自动回退到纯本地模式
// trigger fresh production build with env vars
// (内置模板 + localStorage 自定义模板),云端相关功能显示配置指引。
// 注意:anon key 是公开的(RLS 在服务端强制权限),service_role key 严禁暴露。
// 兼容 VITE_ 前缀(local .env.local)与无前缀(Vercel 环境变量)两种命名
// BUILD_MARKER:v2
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || ""
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  ""

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export const isCloudEnabled = () => supabase !== null

export function getSupabaseUrl() {
  return supabaseUrl
}
