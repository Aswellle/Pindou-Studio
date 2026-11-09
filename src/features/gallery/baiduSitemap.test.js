import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BAIDU_MOBILE_NS, buildBaiduSitemap } from './baiduSitemap'

/**
 * sitemap 双份策略契约(防回归)。
 *
 * 关键约束:
 *   1. 标准 sitemap 绝不能出现百度移动扩展 —— Google 会报「命名空间不正确」;
 *   2. 百度变体必须带上命名空间,且每个 <url> 都有且仅有一条移动标记;
 *   3. 生成幂等,构建重复执行不会叠加标记;
 *   4. 百度变体不能出现在 robots.txt 里,否则 Google 又会发现并报错。
 */

const ROOT = process.cwd()
const TEMPLATE = readFileSync(join(ROOT, 'public', 'sitemap.xml'), 'utf8')
const ROBOTS = readFileSync(join(ROOT, 'public', 'robots.txt'), 'utf8')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const SCRIPT = readFileSync(join(ROOT, 'scripts', 'generate-baidu-sitemap.mjs'), 'utf8')

const count = (text, re) => (text.match(re) || []).length
// 注释里说明拆分原因时会出现 "xmlns:mobile" 字样,断言只看真实标记
const withoutComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '')

describe('baiduSitemap · 标准 sitemap 保持纯净', () => {
  it('模板里不再出现百度 mobile 命名空间与标记', () => {
    expect(withoutComments(TEMPLATE)).not.toContain('xmlns:mobile')
    expect(withoutComments(TEMPLATE)).not.toContain('<mobile:mobile')
  })

  it('robots.txt 不暴露百度变体(否则 Google 也会去抓)', () => {
    expect(ROBOTS).not.toContain('sitemap-baidu')
  })
})

describe('baiduSitemap · 百度变体生成', () => {
  it('补上命名空间,且每个 <url> 恰好一条移动标记', () => {
    const out = buildBaiduSitemap(TEMPLATE)
    expect(out).toContain(`xmlns:mobile="${BAIDU_MOBILE_NS}"`)
    const urlCount = count(TEMPLATE, /<url>/g)
    expect(urlCount).toBeGreaterThan(0)
    expect(count(out, /<mobile:mobile type="pc,mobile"\/>/g)).toBe(urlCount)
    // 标记只出现在 <url> 块内,且紧跟在 <loc> 之后
    expect(out).toContain('</loc>\n    <mobile:mobile type="pc,mobile"/>')
  })

  it('幂等:重复生成不会叠加命名空间和标记', () => {
    const once = buildBaiduSitemap(TEMPLATE)
    const twice = buildBaiduSitemap(once)
    expect(twice).toBe(once)
    expect(count(twice, new RegExp(`xmlns:mobile="${BAIDU_MOBILE_NS}"`, 'g'))).toBe(1)
  })

  it('非 sitemap 输入原样返回(不让异常输入破坏产物)', () => {
    expect(buildBaiduSitemap('not xml')).toBe('not xml')
    expect(buildBaiduSitemap(null)).toBe(null)
  })
})

describe('baiduSitemap · 构建接线', () => {
  it('build 在 lastmod 刷新之后生成百度变体', () => {
    const build = PKG.scripts.build
    expect(build).toContain('scripts/generate-baidu-sitemap.mjs')
    expect(build.indexOf('scripts/sitemap-lastmod.mjs')).toBeLessThan(
      build.indexOf('scripts/generate-baidu-sitemap.mjs')
    )
  })

  it('生成失败只跳过,不阻断构建', () => {
    expect(SCRIPT).toContain('跳过')
    expect(SCRIPT).toContain('catch')
  })
})
