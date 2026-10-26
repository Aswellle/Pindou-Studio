import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * IndexNow 链路契约(防回归)。
 *
 * IndexNow 是「代码已经上线之后」才该发生的动作,出错的方式都很安静:
 * 提交了还没上线的 URL(搜索引擎抓到 404)、每次都全量重发(Bing 指南明确反对)、
 * 或者漏掉构建期才生成的图纸详情页。这三种失败在构建和单测里都看不出来,
 * 所以把关键约束锁在源码文本上。
 */

const ROOT = process.cwd()
const SCRIPT = readFileSync(join(ROOT, 'scripts', 'indexnow-submit.mjs'), 'utf8')
const PRERENDER = readFileSync(join(ROOT, 'scripts', 'generate-prerender-html.js'), 'utf8')
const CI = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
const GITIGNORE = readFileSync(join(ROOT, '.gitignore'), 'utf8')

describe('IndexNow · 提交来源', () => {
  it('默认读 dist/sitemap.xml 而不是 public 那份', () => {
    // public/sitemap.xml 只有 5 条静态页;图纸 / 主题 / 合集详情页是构建期
    // 才追加进 dist 的,漏掉它们等于漏掉全站最常变动的部分。
    expect(SCRIPT).toContain("path.join(ROOT, 'dist', 'sitemap.xml')")
    expect(SCRIPT).toContain("path.join(ROOT, 'public', 'sitemap.xml')")
    // dist 优先:先判断 dist 是否存在
    expect(SCRIPT.indexOf("'dist', 'sitemap.xml'")).toBeLessThan(
      SCRIPT.indexOf("'public', 'sitemap.xml'"),
    )
  })

  it('支持从线上 sitemap 读取(CI 里没有 Supabase 凭据)', () => {
    expect(SCRIPT).toContain('--sitemap=')
    expect(SCRIPT).toContain('REMOTE_SITEMAP')
  })
})

describe('IndexNow · 只提交真正变化的 URL', () => {
  it('按 lastmod 比对,而不是每次全量', () => {
    expect(SCRIPT).toContain('lastmod')
    expect(SCRIPT).toContain('prev.urls[e.loc]')
  })

  it('URL 从 sitemap 消失时也要通知(Bing 明确要求)', () => {
    expect(SCRIPT).toContain('removed')
    expect(SCRIPT).toMatch(/被删除的 URL/)
  })

  it('没有历史记录时退化为全量,不静默漏报', () => {
    expect(SCRIPT).toContain('无历史记录,退化为全量')
  })

  it('状态文件不入库(不同机器基线不同)', () => {
    expect(GITIGNORE).toContain('.indexnow-state.json')
  })

  it('只有全部成功才写状态(dry-run 与失败都不写)', () => {
    expect(SCRIPT).toContain('if (!DRY_RUN) {')
    expect(SCRIPT).toContain('saveState(entries)')
  })
})

describe('IndexNow · 部署就绪门禁', () => {
  it('预渲染把 build-id 写进 index.html', () => {
    expect(PRERENDER).toContain('const BUILD_META')
    expect(PRERENDER).toContain('build-id')
  })

  it('所有派生页面都从带 build-id 的版本复制', () => {
    // 漏一处就会出现「首页有标识、子页没有」,探测随机命中时会误判未部署
    expect(PRERENDER).not.toMatch(/injectRoot\(indexHtml,/)
    expect(PRERENDER).not.toMatch(/const spaHtml = indexHtml\n/)
    expect(PRERENDER).not.toMatch(/const notFoundHtml = indexHtml\n/)
    expect(PRERENDER).not.toMatch(/let out = indexHtml\n/)
  })

  it('线上未更新时跳过提交,而不是照发', () => {
    expect(SCRIPT).toContain('waitForDeploy')
    expect(SCRIPT).toContain('本次跳过提交')
  })
})

describe('IndexNow · CI 接线', () => {
  it('只在 push 到 main 时运行,且依赖构建通过', () => {
    expect(CI).toContain('needs: build-and-test')
    expect(CI).toContain("github.ref == 'refs/heads/main'")
  })

  it('提交失败不阻断构建结果', () => {
    // IndexNow 是加速通道,挂了不该让「代码已构建通过」变红
    expect(CI).toContain('continue-on-error: true')
  })

  it('先等部署上线再提交', () => {
    expect(CI).toContain('Wait for deployment')
    expect(CI).toContain('deploy-probe')
  })

  it('跨次构建保留增量基线', () => {
    expect(CI).toContain('actions/cache/restore')
    expect(CI).toContain('indexnow-state-')
  })
})
