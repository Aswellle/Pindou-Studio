import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 百度普通收录推送链路契约(防回归)。
 *
 * 与 IndexNow 同批约束:提交必须发生在部署之后、只推真正变化的 URL、
 * token 只能来自环境变量/Secret、状态文件不入库。百度额外的硬规则是
 * 「不要重复提交旧链接」(浪费配额、频繁重复会降权),所以增量策略
 * 同样锁在契约里。
 */

const ROOT = process.cwd()
const SCRIPT = readFileSync(join(ROOT, 'scripts', 'baidu-push.mjs'), 'utf8')
const CI = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
const GITIGNORE = readFileSync(join(ROOT, '.gitignore'), 'utf8')

describe('百度推送 · token 与安全', () => {
  it('token 只从环境变量读取,仓库里不出现真实值', () => {
    expect(SCRIPT).toContain('process.env.BAIDU_PUSH_TOKEN')
    // 不为 token 提供命令行参数入口(避免出现在进程列表/日志里)
    expect(SCRIPT).not.toContain("option('token'")
  })

  it('未配置 token 时跳过且退出码 0(不阻断构建)', () => {
    expect(SCRIPT).toContain('未配置 BAIDU_PUSH_TOKEN,跳过推送')
    expect(SCRIPT).toMatch(/process\.exit\(0\)/)
  })

  it('CI 通过 Secret 注入 token,且提交失败不阻断构建', () => {
    expect(CI).toContain('secrets.BAIDU_PUSH_TOKEN')
    expect(CI).toContain('continue-on-error: true')
  })
})

describe('百度推送 · 只推真正变化的 URL', () => {
  it('按 lastmod 比对,而不是每次全量', () => {
    expect(SCRIPT).toContain('lastmod')
    expect(SCRIPT).toContain('prev.urls[e.loc]')
  })

  it('没有历史记录时退化为全量', () => {
    expect(SCRIPT).toContain('无历史记录,退化为全量')
  })

  it('删除的 URL 不推送(百度 API 无删除通知语义)', () => {
    // 推 404 地址只会浪费配额;脚本注释里写明该取舍
    expect(SCRIPT).toContain('不推送')
    expect(SCRIPT).not.toMatch(/removed\.length/)
  })

  it('状态文件不入库', () => {
    expect(GITIGNORE).toContain('.baidu-push-state.json')
  })

  it('只有全部成功才写状态(dry-run 与失败都不写)', () => {
    expect(SCRIPT).toContain('if (!DRY_RUN) {')
    expect(SCRIPT).toContain('saveState(entries)')
  })
})

describe('百度推送 · 接口与部署门禁', () => {
  it('使用百度普通收录端点、text/plain 逐行 URL、站点参数', () => {
    expect(SCRIPT).toContain('data.zz.baidu.com/urls')
    expect(SCRIPT).toContain('site=')
    expect(SCRIPT).toContain('encodeURIComponent(SITE)')
    expect(SCRIPT).toContain('text/plain')
    expect(SCRIPT).toContain('batch.join')
  })

  it('解析 success/remain 并校验响应,避免把失败当成功写状态', () => {
    expect(SCRIPT).toContain('payload.success')
    expect(SCRIPT).toContain('remain')
    expect(SCRIPT).toContain('响应缺少 success 字段')
  })

  it('线上未更新时跳过推送', () => {
    expect(SCRIPT).toContain('waitForDeploy')
    expect(SCRIPT).toContain('本次跳过推送')
  })
})

describe('百度推送 · CI 接线', () => {
  it('只在 push 到 main 时运行,且依赖构建通过', () => {
    expect(CI).toContain('baidu-push:')
    // 与 indexnow 同款门禁(两个 job 各有一段,断言存在即可)
    expect(CI).toMatch(/baidu-push:[\s\S]*?needs: build-and-test/)
    expect(CI).toMatch(/baidu-push:[\s\S]*?github\.ref == 'refs\/heads\/main'/)
  })

  it('先等部署上线再提交,并跨次构建保留增量基线', () => {
    expect(CI).toMatch(/baidu-push:[\s\S]*?Wait for deployment/)
    expect(CI).toMatch(/baidu-push:[\s\S]*?steps\.deploy\.outputs\.live == 'true'/)
    expect(CI).toContain('baidu-push-state-')
  })
})
