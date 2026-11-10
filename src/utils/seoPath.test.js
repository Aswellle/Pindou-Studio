import { describe, it, expect } from 'vitest'
import { canonicalPathFor, isKnownPath } from './seoPath'

describe('canonicalPathFor', () => {
  it('主题/合集/图纸详情/分类聚合自指', () => {
    expect(canonicalPathFor('/gallery/theme/spring', '/gallery')).toBe('/gallery/theme/spring')
    expect(canonicalPathFor('/gallery/collection/pets', '/gallery')).toBe('/gallery/collection/pets')
    expect(canonicalPathFor('/gallery/pattern/42', '/gallery')).toBe('/gallery/pattern/42')
    expect(canonicalPathFor('/gallery/category/animal', '/gallery')).toBe('/gallery/category/animal')
  })

  it('分享详情页自指(只认 UUID 形状)', () => {
    expect(canonicalPathFor('/share/550e8400-e29b-41d4-a716-446655440000', '/')).toBe(
      '/share/550e8400-e29b-41d4-a716-446655440000',
    )
    // 非 UUID 形状不是真实页面,归并到回退路径
    expect(canonicalPathFor('/share/whatever', '/')).toBe('/')
    expect(canonicalPathFor('/share', '/')).toBe('/')
    expect(canonicalPathFor('/share/550e8400-e29b-41d4-a716-446655440000/extra', '/')).toBe('/')
  })

  it('未知 /gallery 子路径归并到图库首页', () => {
    expect(canonicalPathFor('/gallery', '/gallery')).toBe('/gallery')
    expect(canonicalPathFor('/gallery/unknown', '/gallery')).toBe('/gallery')
    expect(canonicalPathFor('/gallery/theme', '/gallery')).toBe('/gallery')
    expect(canonicalPathFor('/gallery/theme/a/b', '/gallery')).toBe('/gallery')
  })

  it('其他页面的深层子路径仍用页面级路径', () => {
    expect(canonicalPathFor('/privacy/v2', '/privacy')).toBe('/privacy')
    expect(canonicalPathFor('/admin/login', '/admin/login')).toBe('/admin/login')
    expect(canonicalPathFor('/', '/')).toBe('/')
  })

  it('去掉末尾斜杠,根路径保持 /', () => {
    expect(canonicalPathFor('/gallery/theme/spring/', '/gallery')).toBe('/gallery/theme/spring')
    expect(canonicalPathFor('///', '/gallery')).toBe('/gallery')
  })

  it('空值回退到页面级路径', () => {
    expect(canonicalPathFor('', '/gallery')).toBe('/gallery')
    expect(canonicalPathFor(null, '/')).toBe('/')
  })
})

describe('isKnownPath · 分享页', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655440000'

  it('合法分享路径返回 true', () => {
    expect(isKnownPath(`/share/${UUID}`)).toBe(true)
    expect(isKnownPath(`/share/${UUID}/`)).toBe(true)
    expect(isKnownPath('/share/550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('非法形状返回 false', () => {
    expect(isKnownPath('/share')).toBe(false)
    expect(isKnownPath('/share/')).toBe(false)
    expect(isKnownPath('/share/abc')).toBe(false)
    expect(isKnownPath(`/share/${UUID}/extra`)).toBe(false)
  })
})
