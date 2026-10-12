/**
 * IndexNow 提交 —— 把 URL 变更即时通知给参与该协议的搜索引擎
 * (Bing / Yandex / Seznam / Naver 等;Google 不参与,用 Search Console 提交)。
 *
 * Bing 官方指南明确要求:URL 新增 / 内容更新 / URL 移除时通过 IndexNow 通知,
 * 可显著缩短重新抓取时间,并减少 Copilot / grounding 结果里引用到过期 URL 的概率。
 *
 * 前置条件(部署后才有意义,提交的 URL 必须已上线):
 *   1. 站点根目录可访问密钥文件 https://tangnotes.site/<KEY>.txt(内容即密钥本身)
 *      —— 该文件由本脚本所在仓库的 public/ 目录一并部署
 *   2. 域名与密钥一致(本脚本已硬编码,改域名时同步修改 SITE / KEY)
 *
 * 用法:
 *   node scripts/indexnow-submit.mjs                 # 提交 public/sitemap.xml 中的全部 URL
 *   node scripts/indexnow-submit.mjs /gallery /tutorials   # 只提交指定路径(增量更新用)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SITE = 'https://tangnotes.site'
const HOST = 'tangnotes.site'
const KEY = '3d29195e94a2eea80e6f2cd015150c18' // 与 public/<KEY>.txt 同名同内容
const KEY_LOCATION = `${SITE}/${KEY}.txt`
const ENDPOINT = 'https://api.indexnow.org/indexnow'

function urlsFromSitemap() {
  const xml = fs.readFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), 'utf-8')
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

function resolveTargets(argv) {
  const paths = argv.filter((a) => a.startsWith('/'))
  if (paths.length) return paths.map((p) => (p.startsWith('http') ? p : SITE + p))
  return urlsFromSitemap()
}

const urlList = resolveTargets(process.argv.slice(2))
if (!urlList.length) {
  console.error('没有可提交的 URL')
  process.exit(1)
}

// IndexNow 单次请求上限 10,000 条;本站页面数远小于该值,不做分批
const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
})

// 200/202 = 已接受;具体收录情况到 Bing 站长工具(IndexNow 报告)查询
console.log(`IndexNow ${res.status} ${res.statusText} — 提交 ${urlList.length} 条`)
for (const u of urlList) console.log('  ' + u)
if (!res.ok) {
  console.error(await res.text().catch(() => ''))
  process.exit(1)
}
