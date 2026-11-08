#!/usr/bin/env node
/**
 * 构建后处理:用 git 提交历史刷新 dist/sitemap.xml 静态页的 lastmod。
 *
 * 接在 generate-og-snapshots.js 之后(dist/sitemap.xml 已经包含静态 + 动态条目)。
 * 只改静态页,动态条目的 lastmod 来自内容自身的 updated_at,不在这里处理。
 *
 * 失败策略与两个同批脚本一致:任何异常都只是「保留现有值」,不让构建失败。
 * 尤其是 Vercel / GitHub Actions 默认是浅克隆 —— 查不到某页面的历史很正常,
 * 脚本会先尝试补全历史,补不全就沿用模板里的兜底日期。
 *
 * 用法:
 *   node scripts/sitemap-lastmod.mjs           # 正常构建
 *   node scripts/sitemap-lastmod.mjs --verbose # 打印每个页面推导出的日期
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  PAGE_LASTMOD_SOURCES,
  formatGitDate,
  applyLastmods,
} from '../src/features/gallery/sitemapLastmod.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SITEMAP = path.join(ROOT, 'dist', 'sitemap.xml')
const VERBOSE = process.argv.includes('--verbose')

const log = (msg) => console.log(`[sitemap-lastmod] ${msg}`)

/** 跑一条 git 命令;失败返回 null 而不是抛错 */
function git(args, timeout = 15000) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/**
 * 浅克隆里 git log 只看得到窗口内的一小段历史,更早改过的页面会查不到自己的
 * 最近提交。构建环境允许联网时补全历史;拿不到就继续用兜底值。
 */
function ensureFullHistory() {
  if (!fs.existsSync(path.join(ROOT, '.git', 'shallow'))) return true
  const ok = git(['fetch', '--unshallow', '--quiet'], 60000) !== null
  if (!ok) log('浅克隆且拉取完整历史失败,查不到历史的页面沿用现有 lastmod')
  return ok
}

/** 一组源文件最后一次提交的 UTC 日期 */
function lastCommitDate(paths) {
  const out = git(['log', '-1', '--format=%ct', '--', ...paths])
  return out ? formatGitDate(Number(out)) : null
}

function main() {
  if (!fs.existsSync(SITEMAP)) {
    log('dist/sitemap.xml 不存在,跳过(应当接在 vite build 之后执行)')
    return
  }

  ensureFullHistory()

  const dates = {}
  for (const [loc, paths] of Object.entries(PAGE_LASTMOD_SOURCES)) {
    const date = lastCommitDate(paths)
    if (date) {
      dates[loc] = date
      if (VERBOSE) log(`${loc} → ${date}`)
    } else if (VERBOSE) {
      log(`${loc} → 查不到提交历史,沿用现有值`)
    }
  }

  const before = fs.readFileSync(SITEMAP, 'utf8')
  const after = applyLastmods(before, dates)
  if (after === before) {
    log('lastmod 无变化')
    return
  }

  fs.writeFileSync(SITEMAP, after)
  log(`已刷新 ${Object.keys(dates).length} 个静态页的 lastmod`)
}

try {
  main()
} catch (e) {
  // 与快照脚本同策略:SEO 增强失败不阻断部署
  log(`跳过:${e?.message || e}`)
}
