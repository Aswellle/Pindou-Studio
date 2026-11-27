/**
 * /api/ip-region — 管理员专用的 IP 归属地批量查询。
 *
 * 为什么不再由浏览器直连第三方:
 *   · 直连会把管理员的浏览器请求暴露给第三方,且任何拿到后台页面的人都能刷接口;
 *   · 现在只有「带有效管理员会话」的请求能进入,第三方只看到本站服务器的查询,
 *     前端拿到的也只是规范化后的「中国 江苏 南京」,不接触原始响应。
 *
 * 边界:
 *   · 只接受 POST JSON { ips: string[] },最多 50 个;
 *   · 只查公网 IP(拒绝内网/保留地址,避免把内网地址发给第三方);
 *   · 先调用 Supabase is_admin()(与后台同一套角色 + 白名单 + MFA 判据);
 *   · 结果在实例内缓存 6 小时,失败缓存 5 分钟;
 *   · 不记录 IP 到日志。
 */

import { isIP } from 'node:net'
import { formatRegion, isPrivateIp } from '../src/utils/ipRegion.js'

const PROVIDER = 'https://ipwho.is'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FAILURE_TTL_MS = 5 * 60 * 1000
const MAX_IPS = 50
const CONCURRENCY = 6
const LOOKUP_TIMEOUT_MS = 6000

const cache = new Map()

/** 仅测试用:清空实例缓存 */
export function __resetIpRegionServerCache() {
  cache.clear()
}

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return ''
}

function supabaseBase() {
  const url = envValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  return url ? url.replace(/\/+$/, '') : ''
}

function supabaseAnonKey() {
  return envValue(
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  )
}

function json(res, status, payload, cacheControl = 'no-store') {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', cacheControl)
  res.end(JSON.stringify(payload))
}

function cached(ip) {
  const hit = cache.get(ip)
  if (!hit) return null
  if (hit.expiresAt > Date.now()) return { region: hit.region }
  cache.delete(ip)
  return null
}

function remember(ip, region) {
  if (cache.size >= 1000) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(ip, {
    region,
    expiresAt: Date.now() + (region ? CACHE_TTL_MS : FAILURE_TTL_MS),
  })
}

async function verifyAdmin(req, base, anonKey) {
  const auth = String(req.headers?.authorization || '')
  if (!auth.startsWith('Bearer ')) return 'unauthenticated'

  let response
  try {
    response = await fetch(`${base}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
    })
  } catch {
    return 'upstream_error'
  }

  if (response.status === 401 || response.status === 403) return 'unauthenticated'
  if (!response.ok) return 'upstream_error'

  try {
    return (await response.json()) === true ? 'ok' : 'forbidden'
  } catch {
    return 'upstream_error'
  }
}

async function lookupOne(ip) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${PROVIDER}/${encodeURIComponent(ip)}?fields=success,country,region,city`,
      { signal: controller.signal, headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    return formatRegion(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function resolveRegion(ip) {
  const hit = cached(ip)
  if (hit) return hit.region
  const region = await lookupOne(ip)
  remember(ip, region)
  return region
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { error: 'method_not_allowed' })
  }

  const base = supabaseBase()
  const anonKey = supabaseAnonKey()
  if (!base || !anonKey) return json(res, 500, { error: 'not_configured' })

  const auth = await verifyAdmin(req, base, anonKey)
  if (auth === 'unauthenticated') return json(res, 401, { error: 'unauthorized' })
  if (auth === 'forbidden') return json(res, 403, { error: 'forbidden' })
  if (auth !== 'ok') return json(res, 502, { error: 'upstream_error' })

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return json(res, 400, { error: 'invalid_json' })
    }
  }
  if (!body || !Array.isArray(body.ips)) {
    return json(res, 400, { error: 'invalid_ips' })
  }

  const ips = [...new Set(
    body.ips
      .slice(0, MAX_IPS)
      .map((ip) => String(ip || '').trim())
      .filter(Boolean),
  )]

  const regions = {}
  const queryable = []

  for (const ip of ips) {
    // 主机名、内网地址一律不查,避免 SSRF 与把内网信息发给第三方
    if (!isIP(ip) || isPrivateIp(ip)) {
      regions[ip] = null
      continue
    }
    queryable.push(ip)
  }

  for (let i = 0; i < queryable.length; i += CONCURRENCY) {
    const batch = queryable.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async (ip) => {
      regions[ip] = await resolveRegion(ip)
    }))
  }

  return json(res, 200, { regions })
}
