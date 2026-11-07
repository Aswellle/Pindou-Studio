import { describe, it, expect } from 'vitest'
import { safeNextPath, resolveAuthRedirect, signedInRedirectTarget, DEFAULT_NEXT_PATH } from './authRedirect'

describe('safeNextPath', () => {
  it('接受站内绝对路径', () => {
    expect(safeNextPath('/')).toBe('/')
    expect(safeNextPath('/profile')).toBe('/profile')
    expect(safeNextPath('/gallery/pattern/123?tab=colors')).toBe('/gallery/pattern/123?tab=colors')
  })

  it('拒绝开放重定向与协议地址', () => {
    expect(safeNextPath('//evil.example.com')).toBe(DEFAULT_NEXT_PATH)
    expect(safeNextPath('https://evil.example.com')).toBe(DEFAULT_NEXT_PATH)
    expect(safeNextPath('javascript:alert(1)')).toBe(DEFAULT_NEXT_PATH)
  })

  it('拒绝反斜杠与控制字符', () => {
    expect(safeNextPath('/\\evil.example.com')).toBe(DEFAULT_NEXT_PATH)
    expect(safeNextPath('/path\nSet-Cookie: x')).toBe(DEFAULT_NEXT_PATH)
  })

  it('非字符串或空值退回首页', () => {
    expect(safeNextPath(null)).toBe(DEFAULT_NEXT_PATH)
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT_PATH)
    expect(safeNextPath('')).toBe(DEFAULT_NEXT_PATH)
    expect(safeNextPath(123)).toBe(DEFAULT_NEXT_PATH)
  })
})

describe('resolveAuthRedirect', () => {
  it('优先使用路由 state 中的回跳路径与原因', () => {
    expect(resolveAuthRedirect({
      state: { next: '/profile', reason: 'ironing' },
      search: '?next=/gallery',
    })).toEqual({ next: '/profile', reason: 'ironing' })
  })

  it('无 state 时支持 ?next= 查询参数', () => {
    expect(resolveAuthRedirect({ search: '?next=%2Fgallery%3Ftab%3Dmine' })).toEqual({
      next: '/gallery?tab=mine',
      reason: null,
    })
  })

  it('未知原因不进入文案分支', () => {
    expect(resolveAuthRedirect({ state: { reason: 'unknown' } }).reason).toBeNull()
    // 每个守卫入口都要能在登录页展示原因文案,新增 reason 时同步 i18n
    // (键名规则:auth.gate.<reason>Title,reason 必须是 camelCase)
    for (const reason of ['profile', 'myBeads', 'ironing', 'quality', 'shareCopy']) {
      expect(resolveAuthRedirect({ state: { reason } }).reason).toBe(reason)
    }
  })

  it('非法 next 一律回首页', () => {
    expect(resolveAuthRedirect({ state: { next: 'https://evil.example.com' } }).next).toBe('/')
    expect(resolveAuthRedirect({ search: '?next=//evil.example.com' }).next).toBe('/')
  })

  it('空 location 安全退化', () => {
    expect(resolveAuthRedirect(null)).toEqual({ next: '/', reason: null })
    expect(resolveAuthRedirect(undefined)).toEqual({ next: '/', reason: null })
  })
})

describe('signedInRedirectTarget', () => {
  it('已登录用户回到守卫来源', () => {
    expect(signedInRedirectTarget({
      state: { next: '/profile', reason: 'profile' },
    })).toBe('/profile')
    expect(signedInRedirectTarget({ search: '?next=%2Fgallery' })).toBe('/gallery')
  })

  it('目标仍是登录页时回首页,避免原地循环', () => {
    expect(signedInRedirectTarget({ state: { next: '/login' } })).toBe(DEFAULT_NEXT_PATH)
    expect(signedInRedirectTarget({ search: '?next=%2Flogin%3Fnext%3D%252Flogin' })).toBe(DEFAULT_NEXT_PATH)
    expect(signedInRedirectTarget({ state: { next: '/login/history' } })).toBe(DEFAULT_NEXT_PATH)
    expect(signedInRedirectTarget({ state: { next: '/login#top' } })).toBe(DEFAULT_NEXT_PATH)
  })

  it('无回跳地址时回首页', () => {
    expect(signedInRedirectTarget(null)).toBe(DEFAULT_NEXT_PATH)
    expect(signedInRedirectTarget({})).toBe(DEFAULT_NEXT_PATH)
  })
})
