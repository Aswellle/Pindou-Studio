#!/usr/bin/env node
/**
 * 动态内容页 OG 快照生成(构建后处理,接在 generate-prerender-html.js 之后)。
 *
 * 为什么不在 generate-prerender-html.js 里做:
 *   那个脚本只读本地数据(教程、locale),不联网、失败也不影响构建。
 *   这里要访问 Supabase,属于「外部依赖」——网络抖动、表缺失、环境变量没配,
 *   任何一种都不该让整次构建失败。所以单独成脚本,任何异常都降级为「不生成快照」
 *   (SPA 兜底仍在,页面照常可访问,只是没有定制 meta)。
 *
 * 产出:
 *   dist/gallery/theme/<slug>/index.html
 *   dist/gallery/collection/<slug>/index.html
 *   dist/gallery/pattern/<id>/index.html
 *   dist/sitemap.xml(在 public/sitemap.xml 基础上追加动态条目)
 *
 * 为什么用目录 + index.html 而不是 /gallery/theme/<slug>.html:
 *   Vercel 对目录索引天然按 path 解析,不需要额外 rewrite 规则;
 *   而带点的路径会被当作文件、与 SPA 的 cleanUrls 语义纠缠。
 *   请求 /gallery/theme/x 时静态文件优先于 vercel.json 的兜底 rewrite,
 *   未命中的 slug 仍落到 SPA —— 构建后才发布的内容不会 404。
 *
 * 安全:只用 anon key + RLS 公开只读,与浏览器端完全同权。
 * 草稿(status='draft')由 RLS 挡住,这里不做二次过滤也不会泄露。
 *
 * 用法:
 *   node scripts/generate-og-snapshots.js           # 正常构建(无配置则跳过)
 *   node scripts/generate-og-snapshots.js --verbose # 打印每个快照
 *   node scripts/generate-og-snapshots.js --strict  # 有内容但生成失败时退出码 1
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  buildPatternSnapshot,
  buildThemeSnapshot,
  buildCollectionSnapshot,
  buildDynamicSitemap,
  appendToSitemap,
  renderSnapshotHtml,
} from '../src/features/gallery/ogSnapshot.js'
import { ogCardPath, patternContentHash, OG_CARD_WIDTH, OG_CARD_HEIGHT } from '../src/features/gallery/ogCard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const VERBOSE = process.argv.includes('--verbose')
const STRICT = process.argv.includes('--strict')

const FETCH_TIMEOUT_MS = 15000
// 单次构建最多生成多少份快照。33 个模板 + 几十个主题/合集远低于此值;
// 设上限是为了防止数据异常(例如 pattern 字段被误写成超长)时构建时间失控。
const MAX_SNAPSHOTS = 500

function log(...args) {
  console.log('[og-snapshot]', ...args)
}
function debug(...args) {
  if (VERBOSE) console.log('[og-snapshot]', ...args)
}

// ── 环境变量 ────────────────────────────────────────────────
// 与 src/services/supabase.js 同序:VITE_ 前缀优先,其次无前缀(Vercel 注入)。
// 构建机上没有 .env.local 时 Vite 会把 VITE_ 变量替换进产物,但这里跑在 Node 里,
// 需要自己读 .env.local(存在时),否则本地 build 永远拿不到配置。
function loadDotEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    if (process.env[key] !== undefined) continue // 真实环境变量优先
    let value = m[2].trim()
    // 去掉成对引号;占位符(如 "[SENSITIVE]")原样保留,后面会当成「未配置」
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function readConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ''
  const usable = (v) => typeof v === 'string' && /^https?:\/\//.test(v) && v.length > 10
  const usableKey = (v) => typeof v === 'string' && v.length > 20 && !v.startsWith('[')
  return usable(url) && usableKey(key) ? { url: url.replace(/\/+$/, ''), key } : null
}

// ── 数据拉取 ────────────────────────────────────────────────
async function rest(cfg, pathname) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${cfg.url}/rest/v1/${pathname}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      throw new Error(`${pathname} → HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 可选表:表不存在(迁移未执行)时返回空数组,不让整个快照生成失败。
 * 与 galleryContentStore.listOptional 同一判断口径。
 */
async function restOptional(cfg, pathname) {
  try {
    return await rest(cfg, pathname)
  } catch (e) {
    const msg = String(e?.message || e)
    if (/HTTP 404|does not exist|schema cache|42P01|PGRST205/i.test(msg)) {
      debug(`可选表跳过:${pathname}`)
      return []
    }
    throw e
  }
}

async function loadContent(cfg) {
  // 只取已发布内容:与浏览器端公开路由同权,草稿不进快照也不进 sitemap
  const [themes, collections, templates, themeLinks, collectionLinks] = await Promise.all([
    rest(cfg, 'gallery_themes?select=*&status=eq.published&order=sort_order'),
    rest(cfg, 'gallery_collections?select=*&status=eq.published&order=sort_order'),
    rest(cfg, 'templates?select=*&order=created_at'),
    restOptional(cfg, 'gallery_theme_templates?select=*&order=sort_order'),
    restOptional(cfg, 'gallery_collection_templates?select=*&order=sort_order'),
  ])
  return { themes, collections, templates, themeLinks, collectionLinks }
}

/** 行 → 与 galleryContentStore 一致的 UI 形状(只取快照需要的字段) */
function rowToContent(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    curationNote: row.curation_note || '',
    coverUrl: row.cover_url || '',
    status: row.status,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}

function rowToTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    nameZh: row.name_zh,
    paletteId: row.palette_id || 'perler',
    pattern: row.pattern,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}

function linkedTemplates(links, parentKey, parentId, byId) {
  return (links || [])
    .filter((l) => String(l[parentKey]) === String(parentId))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((l) => byId.get(String(l.template_id)))
    .filter(Boolean)
}

// ── HTML 生成 ───────────────────────────────────────────────
// 改写逻辑放在 src/features/gallery/ogSnapshot.js(纯函数、有单测),
// 这里只负责读模板文件与落盘。
function writeSnapshot(indexHtml, snap, site) {
  const canonicalUrl = `${site}${snap.path}`
  const html = renderSnapshotHtml(indexHtml, snap, canonicalUrl, { imageSize: snap.imageSize || null })
  const dir = path.join(DIST, snap.path.replace(/^\//, ''))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html)
  debug(`写入 ${snap.path}/index.html`)
}

// ── 分享卡片 ────────────────────────────────────────────────
// 图纸没有封面字段,不画卡片的话所有图纸分享出去都是同一张站点默认图。
// 卡片是增强项:原生 canvas 装不上(或绘图抛错)时一律降级为「不生成」,
// 快照照常产出,只是 og:image 退回站点默认图。
async function writePatternCard(template) {
  try {
    // 动态 import:模块本身也依赖原生 canvas,顶层 import 失败会连累整个脚本
    const { renderPatternCard } = await import('./og-card-renderer.mjs')
    const png = await renderPatternCard(template, { root: ROOT })
    if (!png) return ''
    const rel = ogCardPath(template.id, patternContentHash(template))
    const file = path.join(DIST, rel.replace(/^\//, ''))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, png)
    debug(`写入 ${rel}`)
    return rel
  } catch (e) {
    debug(`卡片生成失败(${template?.id}):${e?.message || e}`)
    return ''
  }
}

// ── 主流程 ──────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('dist/index.html 不存在:请先执行 vite build')
  }

  loadDotEnvLocal()
  const cfg = readConfig()
  if (!cfg) {
    log('未配置 Supabase 环境变量,跳过动态快照(SPA 兜底仍可用)')
    return
  }

  const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8')
  const site = 'https://tangnotes.site'

  let content
  try {
    content = await loadContent(cfg)
  } catch (e) {
    // 网络/权限问题一律降级:快照是增强项,不能成为发布阻断
    log(`拉取内容失败,跳过快照:${e?.message || e}`)
    if (STRICT) process.exitCode = 1
    return
  }

  const templates = content.templates.map(rowToTemplate)
  const byId = new Map(templates.map((t) => [String(t.id), t]))
  const themes = content.themes.map(rowToContent)
  const collections = content.collections.map(rowToContent)

  const snapshots = []
  let cards = 0
  const cardSize = { width: OG_CARD_WIDTH, height: OG_CARD_HEIGHT }
  for (const t of templates) {
    const ogImage = await writePatternCard(t)
    if (ogImage) cards++
    const snap = buildPatternSnapshot(t, {
      site,
      ogImage,
      // 卡片尺寸已知且固定;没生成卡片时传 null,让 renderSnapshotHtml 删掉
      // 那两行尺寸 meta(保留站点默认图的 1200×630 反而是错的)
      ogImageSize: ogImage ? cardSize : null,
    })
    if (snap) snapshots.push(snap)
  }
  for (const theme of themes) {
    const snap = buildThemeSnapshot(theme, linkedTemplates(content.themeLinks, 'theme_id', theme.id, byId), { site })
    if (snap) snapshots.push(snap)
  }
  for (const collection of collections) {
    const snap = buildCollectionSnapshot(
      collection,
      linkedTemplates(content.collectionLinks, 'collection_id', collection.id, byId),
      { site },
    )
    if (snap) snapshots.push(snap)
  }

  const limited = snapshots.slice(0, MAX_SNAPSHOTS)
  if (snapshots.length > MAX_SNAPSHOTS) {
    log(`快照数量 ${snapshots.length} 超过上限 ${MAX_SNAPSHOTS},只生成前 ${MAX_SNAPSHOTS} 份`)
  }

  let written = 0
  for (const snap of limited) {
    try {
      writeSnapshot(indexHtml, snap, site)
      written++
    } catch (e) {
      log(`生成 ${snap.path} 失败:${e?.message || e}`)
    }
  }

  // sitemap:在 public/sitemap.xml 的静态条目后追加动态条目
  const sitemapSrc = path.join(ROOT, 'public', 'sitemap.xml')
  if (fs.existsSync(sitemapSrc)) {
    const base = fs.readFileSync(sitemapSrc, 'utf-8')
    const dynamic = buildDynamicSitemap({ themes, collections, templates, site })
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), appendToSitemap(base, dynamic))
    debug('sitemap.xml 已追加动态条目')
  }

  log(`完成:${written} 份快照(主题 ${themes.length} / 合集 ${collections.length} / 图纸 ${templates.length}),分享卡片 ${cards} 张`)
  if (STRICT && written < limited.length) process.exitCode = 1
}

main().catch((e) => {
  // 默认不让快照生成失败阻断构建;--strict 时才返回非零
  log(`快照生成异常:${e?.message || e}`)
  if (STRICT) process.exitCode = 1
})
