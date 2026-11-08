/**
 * 百度普通收录 API 推送 —— 把新增/更新的 URL 主动提交给百度。
 *
 * 百度官方要求「新链接生成/发布后立即提交效果最好」,并且明确警告
 * **不要重复提交旧链接**(浪费配额,频繁重复会降低配额甚至失去推送权)。
 * 所以本脚本与 IndexNow 同策略:按 sitemap 的 lastmod 做增量比对,
 * 只推送新增或内容真正变化的 URL。
 *
 * 前置条件:
 *   1. 百度搜索资源平台已添加站点并通过验证;
 *   2. 「普通收录 → API 推送」里拿到 token,配置为环境变量 BAIDU_PUSH_TOKEN
 *      (CI 用 GitHub Secret;本机可放在 shell 环境,不要写进仓库)。
 *   未配置 token 时脚本直接跳过(退出码 0),不阻断构建。
 *
 * 用法:
 *   node scripts/baidu-push.mjs                       # 增量推送(默认读 dist/sitemap.xml)
 *   node scripts/baidu-push.mjs --all                 # 全量推送 sitemap 内全部 URL
 *   node scripts/baidu-push.mjs --dry-run             # 只打印将推送的 URL
 *   node scripts/baidu-push.mjs --wait=300            # 最多等 300 秒部署上线(默认 180)
 *   node scripts/baidu-push.mjs --state=<path>        # 自定义增量记录文件位置
 *   node scripts/baidu-push.mjs --sitemap=https://tangnotes.site/sitemap.xml
 *                                                     # 从线上读取 sitemap(CI 用)
 *
 * 配额:百度对单次请求有 URL 数量上限(本脚本按 1000 条分批),每日配额动态调整。
 * 响应里的 remain 会打印出来,便于观察剩余额度。
 *
 * 增量记录:默认写 .baidu-push-state.json(仓库根,已 gitignore)。CI 里由
 * actions/cache 跨次构建保留;没有记录时退化为全量,不会因为缺状态而漏报。
 * URL 从 sitemap 消失(被删除)时不推送 —— 百度 API 不接收「删除通知」,
 * 推 404 地址只会浪费配额;这类页面由真实的 404 状态自然下线。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SITE = (process.env.BAIDU_PUSH_SITE || 'https://tangnotes.site').replace(/\/+$/, '')
const ENDPOINT = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(SITE)}`

// 百度普通收录单次请求上限为 2000 条;取 1000 留余量,单批失败不影响其他批
const BATCH_SIZE = 1000

const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const option = (name, fallback) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const DRY_RUN = flag('dry-run')
const SUBMIT_ALL = flag('all')
const WAIT_SECONDS = Number(option('wait', '180')) || 0
const STATE_FILE = path.resolve(ROOT, option('state', '.baidu-push-state.json'))
const REMOTE_SITEMAP = option('sitemap', '')

// ── sitemap 解析 ────────────────────────────────────────────
// 与 IndexNow 同一口径:dist 优先(含构建期追加的详情页),其次 public,
// --sitemap=URL 时读线上那份(CI 场景:没有 Supabase 凭据)。
async function readSitemap() {
  if (REMOTE_SITEMAP) {
    const res = await fetchText(REMOTE_SITEMAP, 15000)
    if (!res.ok) throw new Error(`读取线上 sitemap 失败:HTTP ${res.status} ${REMOTE_SITEMAP}`)
    return { file: REMOTE_SITEMAP, xml: res.text }
  }
  const distFile = path.join(ROOT, 'dist', 'sitemap.xml')
  const publicFile = path.join(ROOT, 'public', 'sitemap.xml')
  if (fs.existsSync(distFile)) return { file: distFile, xml: fs.readFileSync(distFile, 'utf-8') }
  console.warn('[baidu] dist/sitemap.xml 不存在,退回 public/sitemap.xml(仅静态页)。建议先 npm run build。')
  return { file: publicFile, xml: fs.readFileSync(publicFile, 'utf-8') }
}

function parseEntries(xml) {
  const entries = []
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const body = block[1]
    const loc = (body.match(/<loc>([^<]+)<\/loc>/) || [])[1]
    if (!loc) continue
    const lastmod = (body.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || ''
    entries.push({ loc: loc.trim(), lastmod: lastmod.trim() })
  }
  return entries
}

// ── 状态 ────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
    if (raw && typeof raw.urls === 'object' && raw.urls) return raw
  } catch {
    // 文件不存在 / 损坏 / 首次运行:当作没有状态,走全量
  }
  return null
}

function saveState(entries) {
  const urls = {}
  for (const e of entries) urls[e.loc] = e.lastmod
  const payload = { updatedAt: new Date().toISOString(), urls }
  try {
    fs.writeFileSync(STATE_FILE, `${JSON.stringify(payload, null, 2)}\n`)
  } catch (e) {
    console.warn(`[baidu] 状态写入失败(${STATE_FILE}):${e.message}`)
  }
}

/**
 * 计算本次要推送的 URL。
 * 只推送新增 + lastmod 变化的;删除的 URL 不推送(百度 API 无删除通知语义)。
 * @returns {{urls:string[], reason:string}}
 */
function selectTargets(entries, prev) {
  if (SUBMIT_ALL) return { urls: entries.map(e => e.loc), reason: '--all 全量推送' }
  if (!prev) return { urls: entries.map(e => e.loc), reason: '无历史记录,退化为全量' }

  const changed = []
  for (const e of entries) {
    const before = prev.urls[e.loc]
    if (before === undefined) changed.push(e.loc)
    else if (before !== e.lastmod) changed.push(e.loc)
  }
  return { urls: changed, reason: `新增/变化 ${changed.length} 条` }
}

// ── 部署就绪检查(与 IndexNow 同口径) ──────────────────────
function readLocalBuildId() {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf-8')
    const m = html.match(/<meta name="build-id" content="([^"]+)"\s*\/?>/)
    return m ? m[1] : ''
  } catch {
    return ''
  }
}

async function fetchText(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } })
    return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '' }
  } catch (e) {
    return { ok: false, status: 0, text: '', error: e.message }
  } finally {
    clearTimeout(timer)
  }
}

async function waitForDeploy(buildId) {
  if (!buildId) {
    console.log('[baidu] 本地没有 build-id(可能未执行 build),跳过部署检查')
    return true
  }
  const deadline = Date.now() + WAIT_SECONDS * 1000
  let attempt = 0
  for (;;) {
    attempt++
    const res = await fetchText(`${SITE}/?baidu-probe=${buildId}`)
    if (res.ok && res.text.includes(`content="${buildId}"`)) {
      console.log(`[baidu] 线上已是本次构建 ${buildId}(第 ${attempt} 次探测)`)
      return true
    }
    if (Date.now() >= deadline) {
      console.log(`[baidu] 等待部署超时(${WAIT_SECONDS}s),本次跳过推送。下次构建会重新比对,不会漏。`)
      return false
    }
    await new Promise(r => setTimeout(r, 5000))
  }
}

// ── 推送 ────────────────────────────────────────────────────
async function submit(urls, token) {
  let failed = 0
  const endpoint = `${ENDPOINT}&token=${encodeURIComponent(token)}`
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE)
    if (DRY_RUN) {
      console.log(`[baidu] (dry-run) 本批 ${batch.length} 条:`)
      for (const u of batch) console.log(`  ${u}`)
      continue
    }
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: batch.join('\n'),
      })
      const text = await res.text().catch(() => '')
      if (!res.ok) {
        failed++
        console.error(`[baidu] ${res.status} ${res.statusText}:${text.slice(0, 300)}`)
        continue
      }
      let payload = null
      try {
        payload = JSON.parse(text)
      } catch {
        // 响应不是 JSON:当作失败,避免误写状态
      }
      if (!payload || typeof payload.success !== 'number') {
        failed++
        console.error(`[baidu] 响应缺少 success 字段:${text.slice(0, 300)}`)
        continue
      }
      const remain = typeof payload.remain === 'number' ? `,剩余配额 ${payload.remain}` : ''
      const invalid =
        Array.isArray(payload.not_valid) && payload.not_valid.length
          ? `,无效 ${payload.not_valid.length} 条`
          : ''
      console.log(`[baidu] 成功 ${payload.success} 条${remain}${invalid} — 本批 ${batch.length} 条`)
    } catch (e) {
      failed++
      console.error(`[baidu] 请求失败:${e.message}`)
    }
  }
  return failed
}

// ── 主流程 ──────────────────────────────────────────────────
const token = process.env.BAIDU_PUSH_TOKEN || ''
if (!token) {
  console.log('[baidu] 未配置 BAIDU_PUSH_TOKEN,跳过推送(在百度搜索资源平台获取 token 后配置)')
  process.exit(0)
}

const { file, xml } = await readSitemap()
const entries = parseEntries(xml)
if (!entries.length) {
  console.error(`[baidu] ${file} 里没有可推送的 URL`)
  process.exit(1)
}

const prev = SUBMIT_ALL ? null : loadState()
const { urls, reason } = selectTargets(entries, prev)

const sourceLabel = REMOTE_SITEMAP ? REMOTE_SITEMAP : path.relative(ROOT, file)
console.log(`[baidu] 来源 ${sourceLabel}:${entries.length} 条 URL`)
console.log(`[baidu] ${reason}`)

if (!urls.length) {
  console.log('[baidu] 没有变化,不推送。')
  process.exit(0)
}

// 读线上 sitemap 时,能读到本身就说明部署已完成,不必再等 build-id
const buildId = REMOTE_SITEMAP ? '' : readLocalBuildId()
if (!DRY_RUN && !REMOTE_SITEMAP && !(await waitForDeploy(buildId))) {
  process.exit(0)
}

const failed = await submit(urls, token)
if (failed) {
  console.error(`[baidu] ${failed} 个批次失败`)
  process.exit(1)
}
// 只有真正发出去且全部成功才写状态;dry-run 与失败都不写
if (!DRY_RUN) {
  saveState(entries)
  console.log(`[baidu] 完成,状态已写入 ${path.relative(ROOT, STATE_FILE)}`)
}
