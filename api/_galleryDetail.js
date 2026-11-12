/**
 * 图库详情页存在性校验(共享处理器)。
 *
 * 背景:构建期会为已发布内容生成静态快照(dist/gallery/<type>/<value>/index.html),
 * Vercel 静态文件优先于 rewrite —— 有快照的内容直接命中静态页,不进函数。
 * 只有「没有快照」的请求落到这里,分三种情况:
 *   1. 内容确实存在(构建后才发布,还没进下一轮快照)→ 200 + SPA 壳,页面照常可用;
 *   2. 内容不存在(拼错 id / 已删除)→ 404 + 构建期 404 页,消除软 404;
 *   3. 上游故障 → 200 + SPA 壳(不把临时故障固化成 404,收录安全优先)。
 *
 * 安全:只用 anon/publishable key + RLS 公开读,与浏览器端完全同权;
 * 不存在与无权限对匿名角色是同一件事,不区分、不泄露状态。
 * 日志只输出结果码,不输出内容数据。
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const NOT_FOUND_HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />'
  + '<meta name="robots" content="noindex, nofollow" /><title>页面不存在 - 拼豆Studio</title></head>'
  + '<body><p>页面不存在或已被删除。<a href="/gallery">返回图库</a></p></body></html>'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/i

const TYPES = {
  pattern: { table: 'templates', column: 'id', validate: UUID_RE },
  theme: { table: 'gallery_themes', column: 'slug', validate: SLUG_RE, extraFilter: 'status=eq.published' },
  collection: { table: 'gallery_collections', column: 'slug', validate: SLUG_RE, extraFilter: 'status=eq.published' },
}

const SHELL_CACHE_TTL_MS = 5 * 60 * 1000
const shellCache = { spa: { value: null, expiresAt: 0 }, notFound: { value: null, expiresAt: 0 } }

/** 仅测试用:清空壳缓存(避免跨用例命中上一个用例的 readFile 结果) */
export function __resetGalleryDetailShellCache() {
  shellCache.spa = { value: null, expiresAt: 0 }
  shellCache.notFound = { value: null, expiresAt: 0 }
}

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return ''
}

function siteOrigin() {
  const explicit = envValue('SITE_URL', 'VITE_SITE_URL')
  if (explicit) return explicit.replace(/\/+$/, '')
  // 请求 host 不再作为兜底:x-forwarded-host 可被伪造,曾可经它污染
  // canonical/og:url 并让壳 HTML 从外部域名自取后缓存(审计 run-2 #21)。
  // 兜底链收敛为 VERCEL 平台注入的环境值 → 生产域常量。
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  // 不落 VERCEL_URL:那是部署域名(带访问保护),og:image/canonical 会失效;
  // 直接落到生产域常量(与 generate-prerender-html.js 的 SITE 同源)
  return 'https://tangnotes.site'
}

function supabaseBase() {
  const url = envValue('VITE_SUPABASE_URL', 'SUPABASE_URL')
  return url ? url.replace(/\/+$/, '') : ''
}

/** 读构建产物(dist/spa.html / dist/404.html;vercel.json includeFiles 注入) */
async function loadShell(name) {
  const cache = name === 'spa.html' ? shellCache.spa : shellCache.notFound
  const now = Date.now()
  if (cache.value && now < cache.expiresAt) return cache.value

  const candidates = [
    path.join(process.cwd(), 'dist', name),
    path.join(process.cwd(), 'api', 'dist', name),
    path.join(process.cwd(), '..', 'dist', name),
  ]
  for (const file of candidates) {
    try {
      const value = await readFile(file, 'utf8')
      cache.value = value
      cache.expiresAt = now + SHELL_CACHE_TTL_MS
      return value
    } catch {
      // 换下一个候选路径
    }
  }

  try {
    const response = await fetch(`${siteOrigin()}/${name}`, { redirect: 'follow' })
    if (response.ok) {
      const value = await response.text()
      cache.value = value
      cache.expiresAt = now + SHELL_CACHE_TTL_MS
      return value
    }
  } catch {
    // 两级失败:调用方降级
  }
  return null
}

/**
 * 查询内容是否公开可见。
 * @returns {Promise<'found'|'missing'|'error'>}
 */
async function checkExists(req, type, value) {
  const spec = TYPES[type]
  const base = supabaseBase()
  // 与分享页同一口径:publishable key 优先(legacy anon JWT 已停用)
  const anonKey = envValue(
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  )
  if (!base || !anonKey) return 'error'

  const filters = [`${spec.column}=eq.${encodeURIComponent(value)}`, spec.extraFilter]
    .filter(Boolean)
    .join('&')
  const url = `${base}/rest/v1/${spec.table}?${filters}&select=id&limit=1`
  try {
    const response = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
    })
    if (!response.ok) return 'error'
    const rows = await response.json()
    return Array.isArray(rows) && rows.length > 0 ? 'found' : 'missing'
  } catch {
    return 'error'
  }
}

function respondHtml(res, status, html, cacheControl) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', cacheControl)
  res.end(html)
}

/**
 * @param {'pattern'|'theme'|'collection'} type
 * @param {string} value - id 或 slug
 */
export async function handleGalleryDetail(req, res, { type, value }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.end('Method Not Allowed')
    return
  }

  const spec = TYPES[type]
  if (!spec) {
    res.statusCode = 404
    res.end('Not Found')
    return
  }

  // 形状不合法:直接 404,不发查询
  if (!value || !spec.validate.test(value)) {
    const notFound = await loadShell('404.html')
    return respondHtml(res, 404, notFound || NOT_FOUND_HTML, 's-maxage=60')
  }

  const result = await checkExists(req, type, value)

  if (result === 'found') {
    const shell = await loadShell('spa.html')
    // 壳加载失败:纯文本 200(页面仍可由浏览器端兜底渲染)
    if (!shell) return respondHtml(res, 200, '<!doctype html><title>拼豆Studio</title>', 'no-store')
    return respondHtml(res, 200, shell, 's-maxage=60, stale-while-revalidate=300')
  }

  if (result === 'missing') {
    const notFound = await loadShell('404.html')
    return respondHtml(res, 404, notFound || NOT_FOUND_HTML, 's-maxage=60')
  }

  // 上游故障:不把临时失败固化成 404 —— 返回 SPA 壳,浏览器端可按实时数据渲染
  const shell = await loadShell('spa.html')
  return respondHtml(res, 200, shell || '<!doctype html><title>拼豆Studio</title>', 'no-store')
}
