import { describe, it, expect } from 'vitest'
import { canonicalPathFor } from './seoPath'

describe('canonicalPathFor', () => {
  it('主题/合集/图纸详情自指', () => {
    expect(canonicalPathFor('/gallery/theme/spring', '/gallery')).toBe('/gallery/theme/spring')
    expect(canonicalPathFor('/gallery/collection/pets', '/gallery')).toBe('/gallery/collection/pets')
    expect(canonicalPathFor('/gallery/pattern/42', '/gallery')).toBe('/gallery/pattern/42')
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
