/**
 * Supabase 同域代理与 storage URL 归一化的回归测试。
 *
 * 两个契约:
 * 1. 可用:受限网络(无法直连 *.supabase.co)下,请求需改走站点同源 /sb 基址
 * 2. 安全:头像只允许本项目 avatars bucket 的公共 URL —— avatarUrl 字段 RLS 允许
 *    用户自行写入,不校验则任意登录用户可让全站 img 请求外部追踪地址
 */

import { describe, it, expect } from 'vitest'
import { resolveSupabaseBase, toStorageUrl, SUPABASE_PROXY_PREFIX } from './supabase.js'

const SUPABASE = 'https://gcpjxxxx.supabase.co'
const AVATAR_PATH = '/storage/v1/object/public/avatars/user-1/1.webp'
const page = (host, protocol = 'https:') => ({ protocol, hostname: host, origin: `${protocol}//${host}` })

describe('resolveSupabaseBase', () => {
  it('真实域名下改走同源 /sb 基址', () => {
    expect(resolveSupabaseBase(SUPABASE, page('tangnotes.site')))
      .toBe(`https://tangnotes.site${SUPABASE_PROXY_PREFIX}`)
  })

  it('本地开发直连(不使用代理)', () => {
    expect(resolveSupabaseBase(SUPABASE, page('localhost', 'http:'))).toBe(SUPABASE)
    expect(resolveSupabaseBase(SUPABASE, page('127.0.0.1', 'http:'))).toBe(SUPABASE)
  })

  it('VITE_SUPABASE_PROXY=off 强制直连', () => {
    expect(resolveSupabaseBase(SUPABASE, page('tangnotes.site'), 'off')).toBe(SUPABASE)
  })

  it('非 supabase 域名与缺失配置保持原样', () => {
    expect(resolveSupabaseBase('https://api.example.com', page('tangnotes.site'))).toBe('https://api.example.com')
    expect(resolveSupabaseBase('', page('tangnotes.site'))).toBe('')
    expect(resolveSupabaseBase(SUPABASE, null)).toBe(SUPABASE)
  })
})

describe('toStorageUrl', () => {
  const proxied = `https://tangnotes.site${SUPABASE_PROXY_PREFIX}`

  it('代理生效时把历史直连 URL 改写到同源基址', () => {
    expect(toStorageUrl(`${SUPABASE}${AVATAR_PATH}`, proxied, SUPABASE)).toBe(`${proxied}${AVATAR_PATH}`)
  })

  it('已是当前基址的 URL 保持不变', () => {
    expect(toStorageUrl(`${proxied}${AVATAR_PATH}`, proxied, SUPABASE)).toBe(`${proxied}${AVATAR_PATH}`)
    expect(toStorageUrl(`${SUPABASE}${AVATAR_PATH}`, SUPABASE, SUPABASE)).toBe(`${SUPABASE}${AVATAR_PATH}`)
  })

  it('拒绝外部域名(防任意 avatarUrl 造成全站外链追踪)', () => {
    expect(toStorageUrl(`https://evil.example.com${AVATAR_PATH}`, proxied, SUPABASE)).toBeNull()
    expect(toStorageUrl(`https://evil.example.com/avatars/x.webp`, proxied, SUPABASE)).toBeNull()
  })

  it('拒绝非 avatars 公共路径与脏值', () => {
    expect(toStorageUrl(`${SUPABASE}/storage/v1/object/private/avatars/x.webp`, proxied, SUPABASE)).toBeNull()
    expect(toStorageUrl(`${SUPABASE}/rest/v1/templates`, proxied, SUPABASE)).toBeNull()
    expect(toStorageUrl(null, proxied, SUPABASE)).toBeNull()
    expect(toStorageUrl(undefined, proxied, SUPABASE)).toBeNull()
    expect(toStorageUrl(123, proxied, SUPABASE)).toBeNull()
  })

  it('云端未配置(无基址)时不放行任何 URL', () => {
    expect(toStorageUrl(`${SUPABASE}${AVATAR_PATH}`, '', '')).toBeNull()
  })
})
