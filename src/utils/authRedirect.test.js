import { describe, it, expect } from 'vitest'
import { safeNextPath, resolveAuthRedirect, DEFAULT_NEXT_PATH } from './authRedirect'

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
