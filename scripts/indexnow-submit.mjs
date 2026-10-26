/**
 * IndexNow 提交 —— 把 URL 变更即时通知给参与该协议的搜索引擎
 * (Bing / Yandex / Seznam / Naver 等;Google 不参与,用 Search Console 提交)。
 *
 * Bing 官方指南明确要求:URL 新增 / 内容更新 / URL 移除时通过 IndexNow 通知,
 * 可显著缩短重新抓取时间,并减少 Copilot / grounding 结果里引用到过期 URL 的概率。
 * 指南同时要求「尽可能避免批量提交,流式提交更快更准」—— 所以本脚本默认
 * **只提交真正变化的 URL**,而不是每次全量重发。
 *
 * 前置条件:
 *   1. 站点根目录可访问密钥文件 https://tangnotes.site/<KEY>.txt(内容即密钥本身)
 *      —— 该文件由 public/ 目录一并部署
 *   2. 目标 URL 必须已上线。脚本会先确认线上 build-id 与本次构建一致,再提交;
 *      部署未完成时等待,超时则跳过(下次构建会重新比对,不会漏)。
 *
 * 用法:
 *   node scripts/indexnow-submit.mjs                  # 增量:只提交相对上次记录有变化的 URL
 *   node scripts/indexnow-submit.mjs --all            # 全量:提交 sitemap 里所有 URL
 *   node scripts/indexnow-submit.mjs --dry-run        # 只打印将要提交的 URL,不发请求
 *   node scripts/indexnow-submit.mjs --wait=300       # 最多等 300 秒部署上线(默认 180)
 *   node scripts/indexnow-submit.mjs --state=<path>   # 自定义增量记录文件位置
 *   node scripts/indexnow-submit.mjs --sitemap=https://tangnotes.site/sitemap.xml
 *                                                     # 从线上读取 sitemap(CI 用)
 *
 * 为什么 CI 要读线上 sitemap:
 *   GitHub Actions 里没有 Supabase 凭据,构建出的 dist/sitemap.xml 只有 5 条静态页,
 *   图纸 / 主题 / 合集详情页是 Vercel 构建时才生成并追加进去的。读线上那份才是
 *   「实际已发布的内容」,也顺带证明了部署已完成 —— 不需要再猜时机。
 *
 * 增量记录:默认写 .indexnow-state.json(仓库根,已 gitignore)。CI 里由
 * actions/cache 跨次构建保留;没有记录时(首次运行、缓存被清)自动退化为全量,
 * 不会因为缺状态而漏报。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SITE = 'https://tangnotes.site'
const HOST = 'tangnotes.site'
const KEY = '3d29195e94a2eea80e6f2cd015150c18' // 与 public/<KEY>.txt 同名同内容
const KEY_LOCATION = `${SITE}/${KEY}.txt`
const ENDPOINT = 'https://api.indexnow.org/indexnow'

// IndexNow 单次请求上限 10,000 条。本站远小于该值,但仍分批:
// 单条 URL 有问题时,其他批次不受影响。
const BATCH_SIZE = 500

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const option = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const DRY_RUN = flag('dry-run')
const SUBMIT_ALL = flag('all')
const WAIT_SECONDS = Number(option('wait', '180')) || 0
const STATE_FILE = path.resolve(ROOT, option('state', '.indexnow-state.json'))
const REMOTE_SITEMAP = option('sitemap', '')

// ── sitemap 解析 ────────────────────────────────────────────
//
// 读 dist/sitemap.xml 而不是 public/sitemap.xml:后者只有 5 条静态页,
// 前者才包含构建期生成的图纸 / 主题 / 合集详情页 —— 而这些恰恰是最常变动的。
// dist 不存在时(单独跑脚本、没先 build)退回 public,并给出提示。
// --sitemap=URL 时直接读线上那份(CI 场景,见文件头说明)。
async function readSitemap() {
  if (REMOTE_SITEMAP) {
    const res = await fetchText(REMOTE_SITEMAP, 15000)
    if (!res.ok) throw new Error(`读取线上 sitemap 失败:HTTP ${res.status} ${REMOTE_SITEMAP}`)
    return { file: REMOTE_SITEMAP, xml: res.text }
  }
  const distFile = path.join(ROOT, 'dist', 'sitemap.xml')
  const publicFile = path.join(ROOT, 'public', 'sitemap.xml')
  if (fs.existsSync(distFile)) return { file: distFile, xml: fs.readFileSync(distFile, 'utf-8') }
  console.warn('[indexnow] dist/sitemap.xml 不存在,退回 public/sitemap.xml(仅静态页)。建议先 npm run build。')
  return { file: publicFile, xml: fs.readFileSync(publicFile, 'utf-8') }
}

/** 取出每个 <url> 块的 loc 与 lastmod,lastmod 用来判断内容是否真的变过 */
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
// 记录「上次成功提交时每个 URL 的 lastmod」。下次构建比对:新增 URL、
// lastmod 变化的 URL 才提交。URL 从 sitemap 消失(被删除)时也要通知 ——
// 指南明确要求 URL 移除时通知,否则过期地址会继续出现在搜索结果里。
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
    // 状态写不进去不影响本次提交,只是下次会退化成全量重发
    console.warn(`[indexnow] 状态写入失败(${STATE_FILE}):${e.message}`)
  }
}

/**
 * 计算本次要提交的 URL。
 * @returns {{urls:string[], reason:string}}
 */
function selectTargets(entries, prev) {
  if (SUBMIT_ALL) return { urls: entries.map((e) => e.loc), reason: '--all 全量提交' }
  if (!prev) return { urls: entries.map((e) => e.loc), reason: '无历史记录,退化为全量' }

  const changed = []
  for (const e of entries) {
    const before = prev.urls[e.loc]
    if (before === undefined) changed.push(e.loc)
    else if (before !== e.lastmod) changed.push(e.loc)
  }
  // 被删除的 URL:通知搜索引擎尽快移除
  const current = new Set(entries.map((e) => e.loc))
  const removed = Object.keys(prev.urls).filter((u) => !current.has(u))
  return {
    urls: [...changed, ...removed],
    reason: `变化 ${changed.length} 条 / 移除 ${removed.length} 条`,
  }
}

// ── 部署就绪检查 ────────────────────────────────────────────
//
// 提交的 URL 必须已经上线,否则搜索引擎会抓到 404 或旧内容,反而消耗抓取信任。
// 判定依据是本次构建写入的 build-id(见 scripts/generate-prerender-html.js):
// 它只在本次构建的产物里出现,线上能读到就说明这份 dist 已经部署。
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

/**
 * 等待线上出现本次构建。
 * @returns {Promise<boolean>} 是否确认已上线
 */
async function waitForDeploy(buildId) {
  if (!buildId) {
    console.log('[indexnow] 本地没有 build-id(可能未执行 build),跳过部署检查')
    return true
  }
  const deadline = Date.now() + WAIT_SECONDS * 1000
  let attempt = 0
  for (;;) {
    attempt++
    const res = await fetchText(`${SITE}/?indexnow-probe=${buildId}`)
    if (res.ok && res.text.includes(`content="${buildId}"`)) {
      console.log(`[indexnow] 线上已是本次构建 ${buildId}(第 ${attempt} 次探测)`)
      return true
    }
    if (Date.now() >= deadline) {
      console.log(`[indexnow] 等待部署超时(${WAIT_SECONDS}s),线上尚未更新为 ${buildId}。本次跳过提交。`)
      console.log('[indexnow] 下次构建会重新比对 sitemap,变化的 URL 那时仍会被提交,不会漏。')
      return false
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
}

// ── 提交 ────────────────────────────────────────────────────
async function submit(urls) {
  let failed = 0
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE)
    const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: batch }
    if (DRY_RUN) {
      console.log(`[indexnow] (dry-run) 本批 ${batch.length} 条:`)
      for (const u of batch) console.log('  ' + u)
      continue
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      })
      // 200/202 = 已接受;具体收录情况到 Bing 站长工具(IndexNow 报告)查询
      console.log(`[indexnow] ${res.status} ${res.statusText} — 本批 ${batch.length} 条`)
      if (!res.ok) {
        failed++
        console.error((await res.text().catch(() => '')).slice(0, 400))
      }
    } catch (e) {
      failed++
      console.error(`[indexnow] 请求失败:${e.message}`)
    }
  }
  return failed
}

// ── 主流程 ──────────────────────────────────────────────────
const { file, xml } = await readSitemap()
const entries = parseEntries(xml)
if (!entries.length) {
  console.error(`[indexnow] ${file} 里没有可提交的 URL`)
  process.exit(1)
}

const prev = SUBMIT_ALL ? null : loadState()
const { urls, reason } = selectTargets(entries, prev)

const sourceLabel = REMOTE_SITEMAP ? REMOTE_SITEMAP : path.relative(ROOT, file)
console.log(`[indexnow] 来源 ${sourceLabel}:${entries.length} 条 URL`)
console.log(`[indexnow] ${reason}`)

if (!urls.length) {
  console.log('[indexnow] 没有变化,不提交。')
  process.exit(0)
}

// 读线上 sitemap 时,能读到本身就说明部署已完成,不必再等 build-id
const buildId = REMOTE_SITEMAP ? '' : readLocalBuildId()
if (!DRY_RUN && !REMOTE_SITEMAP && !(await waitForDeploy(buildId))) {
  // 部署没上线就提交,等于让搜索引擎去抓还不存在的页面 —— 宁可不提交
  process.exit(0)
}

const failed = await submit(urls)
if (failed) {
  console.error(`[indexnow] ${failed} 个批次失败`)
  process.exit(1)
}
// 只有真正发出去且全部成功才更新状态;dry-run 与失败都不写,
// 否则下次会误以为「已通知」而跳过。
if (!DRY_RUN) {
  saveState(entries)
  console.log(`[indexnow] 完成,状态已写入 ${path.relative(ROOT, STATE_FILE)}`)
}
