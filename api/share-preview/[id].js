/**
 * /api/share-preview/:id — 公开分享页的动态 OG Function。
 *
 * /share/:id 经 vercel.json rewrite 进入这里(浏览器地址不变)。社交平台与
 * 不执行 JS 的抓取端直接抓 HTTP HTML,SPA 的 react-helmet-async 帮不上忙;
 * 本函数把 dist/spa.html(SPA 兜底壳)的站点级 meta 换成该分享的真实数据,
 * 再原样返回 —— 浏览器端照常启动 SPA,SharePage 挂载后由 Helmet 接管。
 *
 * 数据边界(与迁移 0033 的 RLS 一致):
 *   · 只用 SUPABASE_URL + SUPABASE_ANON_KEY(anon 角色)查 public.work_shares;
 *     RLS 是权限边界 —— draft / revoked / release gate 关闭时查询一律 0 行,
 *     返回 410,绝不返回任何可公开访问的分享元数据;
 *   · 只读取白名单字段(不取 canvas_data、不碰 works / profiles / owner mapping);
 *   · 不读取、不依赖 SUPABASE_SERVICE_ROLE_KEY;
 *   · 日志只输出结果码,不输出标题/描述/矩阵/访客信息。
 *
 * HTML 改写规则与 ogSnapshot.renderSnapshotHtml 相同口径:替换出来的标签
 * 一律带 data-rh="true"(spa.html 的 description/robots/og:* 都带该属性,
 * canonical/og:url/hreflang 在壳里已被删除,这里重新注入),保证 react-helmet-async
 * 首帧把它们当作「旧标签」清理掉,不会出现两条 description / robots。
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const SHARE_PAGE_TITLE_SUFFIX = ' - 拼豆图纸分享 - 拼豆Studio'
const NOT_FOUND_TITLE = '分享不存在或已被撤销 - 拼豆Studio'
const BUCKET = 'work-share-cards'

/** 壳读取结果缓存(D-13):命中时零磁盘/网络开销,5 分钟后重新解析 */
let shellCache = { value: null, expiresAt: 0 }
const SHELL_CACHE_TTL_MS = 5 * 60 * 1000

/** 只认标准 UUID 形状:与 shareUrl 生成、seoPath.SHARE_DETAIL_RE、迁移 CHECK 一致 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** 分享卡路径只接受 `<share-id>/r1.png`(与 publish_work_share 的校验一致) */
const CARD_PATH_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/r1\.png$/

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** description 控制在 160 字以内(与 clampDescription 口径一致) */
function clampDescription(text, max = 160) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1).trimEnd()}…`
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
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://tangnotes.site'
}

function supabaseBase() {
  const url = envValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  return url ? url.replace(/\/+$/, '') : ''
}

/**
 * 读取 SPA 壳。优先函数 bundle 内的 dist/spa.html(vercel.json includeFiles);
 * 都拿不到时回退到线上站点同路径 —— 两级失败才认为壳不可用。
 */
async function loadShell() {
  const now = Date.now()
  if (shellCache.value && now < shellCache.expiresAt) return shellCache.value

  const candidates = [
    path.join(process.cwd(), 'dist', 'spa.html'),
    path.join(process.cwd(), 'api', 'dist', 'spa.html'),
    path.join(process.cwd(), '..', 'dist', 'spa.html'),
  ]
  for (const file of candidates) {
    try {
      const value = await readFile(file, 'utf8')
      shellCache = { value, expiresAt: now + SHELL_CACHE_TTL_MS }
      return value
    } catch {
      // 换下一个候选路径
    }
  }

  try {
    const response = await fetch(`${siteOrigin()}/spa.html`, { redirect: 'follow' })
    if (response.ok) {
      const value = await response.text()
      shellCache = { value, expiresAt: now + SHELL_CACHE_TTL_MS }
      return value
    }
  } catch {
    // 线上回退也失败:返回 null,由调用方降级为纯文本错误
  }
  return null
}

/**
 * 匿名查询已发布分享的白名单字段。
 *
 * 返回 null 表示「RLS 不可见」(不存在/已撤销/草稿/gate 关闭 —— 四者对 anon
 * 是同一件事,不区分、不泄露状态);'error' 表示上游故障。
 */
async function fetchPublishedShare(shareId) {
  const base = supabaseBase()
  // publishable key 优先:Supabase 已于 2026-10-24 停用 legacy anon/service_role
  // JWT,而项目里的 SUPABASE_ANON_KEY 仍残留旧 JWT(调用会 401)。客户端构建用的
  // VITE_SUPABASE_ANON_KEY 必为有效的新 publishable key,放最前;旧变量只做兜底。
  const anonKey = envValue(
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  )
  if (!base || !anonKey) return 'error'

  const columns = 'id,title,description,author_label,grid_width,grid_height,palette_id,preview_image_path'
  const url = `${base}/rest/v1/work_shares?id=eq.${encodeURIComponent(shareId)}&select=${columns}`
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
    const row = Array.isArray(rows) ? rows[0] : null
    return row || null
  } catch {
    return 'error'
  }
}

/**
 * 把壳的站点级 meta 换成该分享的真实数据。
 * 所有替换值都已 escapeHtml;替换式一律用函数形式,避免标题里的 $& 被展开。
 */
function injectShareMeta(shell, { title, description, canonicalUrl, imageUrl }) {
  const RH = ' data-rh="true"'
  const EOL = shell.includes('\r\n') ? '\r\n' : '\n'
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeCanonical = escapeHtml(canonicalUrl)

  let out = shell
    .replace(/<title>.*?<\/title>/s, () => `<title>${safeTitle}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"[^>]*>/,
      () => `<meta name="description" content="${safeDescription}"${RH} />`,
    )
    // 分享内容默认不进搜索索引;canonical/og:url 在壳里已被删除,挂在 robots 后重新注入
    .replace(
      /<meta name="robots" content="[^"]*"[^>]*>/,
      () => `<meta name="robots" content="noindex, follow"${RH} />${EOL}  <link rel="canonical" href="${safeCanonical}"${RH} />${EOL}  <meta property="og:url" content="${safeCanonical}"${RH} />`,
    )
    .replace(/<meta property="og:title" content="[^"]*"[^>]*>/, () => `<meta property="og:title" content="${safeTitle}"${RH} />`)
    .replace(/<meta property="og:description" content="[^"]*"[^>]*>/, () => `<meta property="og:description" content="${safeDescription}"${RH} />`)
    .replace(/<meta name="twitter:title" content="[^"]*"[^>]*>/, () => `<meta name="twitter:title" content="${safeTitle}"${RH} />`)
    .replace(/<meta name="twitter:description" content="[^"]*"[^>]*>/, () => `<meta name="twitter:description" content="${safeDescription}"${RH} />`)

  if (imageUrl) {
    const safeImage = escapeHtml(imageUrl)
    out = out
      .replace(/<meta property="og:image" content="[^"]*"[^>]*>/, () => `<meta property="og:image" content="${safeImage}"${RH} />`)
      .replace(/<meta name="twitter:image" content="[^"]*"[^>]*>/, () => `<meta name="twitter:image" content="${safeImage}"${RH} />`)
  }
  return out
}

/** 404/410 的壳:标题改掉,robots 收紧为 noindex, nofollow,不注入 canonical */
function injectGoneMeta(shell) {
  const RH = ' data-rh="true"'
  return shell
    .replace(/<title>.*?<\/title>/s, () => `<title>${NOT_FOUND_TITLE}</title>`)
    .replace(/<meta name="robots" content="[^"]*"[^>]*>/, () => `<meta name="robots" content="noindex, nofollow"${RH} />`)
}

function respondHtml(res, status, html, cacheControl) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', cacheControl)
  res.end(html)
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.end('Method Not Allowed')
    return
  }

  const shareId = String(req.query.id || '')
  if (!UUID_RE.test(shareId)) {
    // 非法形状:与 seoPath.isKnownPath 同口径,按不存在处理
    const shell = await loadShell()
    if (!shell) return respondHtml(res, 404, '<!doctype html><title>404</title>', 'no-store')
    return respondHtml(res, 404, injectGoneMeta(shell), 'no-store')
  }

  const result = await fetchPublishedShare(shareId)
  if (result === 'error') {
    // 上游故障:5xx 让抓取端稍后重试,不回 200 免得把临时失败固化成收录
    const shell = await loadShell()
    if (!shell) return respondHtml(res, 502, '<!doctype html><title>502</title>', 'no-store')
    return respondHtml(res, 502, shell, 'no-store')
  }
  if (!result) {
    // RLS 不可见 = 不存在 / 已撤销 / 草稿 / gate 关闭:410 + noindex
    const shell = await loadShell()
    if (!shell) return respondHtml(res, 410, '<!doctype html><title>410</title>', 'no-store')
    return respondHtml(res, 410, injectGoneMeta(shell), 'no-store')
  }

  const shell = await loadShell()
  if (!shell) return respondHtml(res, 502, '<!doctype html><title>502</title>', 'no-store')

  const shareUrl = `${siteOrigin()}/share/${shareId}`
  const size = Number(result.grid_width) > 0 && Number(result.grid_height) > 0
    ? `${Number(result.grid_width)} × ${Number(result.grid_height)}`
    : ''
  const description = clampDescription(
    [result.description, size ? `尺寸 ${size}` : ''].filter(Boolean).join(' · '),
  )
  const cardPath = typeof result.preview_image_path === 'string' ? result.preview_image_path : ''
  const imageUrl = CARD_PATH_RE.test(cardPath)
    ? `${siteOrigin()}/sb/storage/v1/object/public/${BUCKET}/${cardPath}`
    : ''

  const html = injectShareMeta(shell, {
    title: `${String(result.title || '')}${SHARE_PAGE_TITLE_SUFFIX}`,
    description,
    canonicalUrl: shareUrl,
    imageUrl,
  })
  // 撤销要尽快生效:HTML 只给很短的 CDN 缓存,不给长 TTL(规格 05 §7)
  respondHtml(res, 200, html, 's-maxage=60, stale-while-revalidate=300')
}
