/**
 * 后台 IP 归属地查询(经本站 /api/ip-region 代理)。
 *
 * 浏览器不直接请求第三方:代理端点校验管理员会话、只接受公网 IP、批量查询
 * 并在服务端缓存。前端只拿规范化后的「中国 江苏 南京」。
 *
 * 这里再保留一层模块级缓存:后台翻页/实时刷新会反复出现同一批 IP,
 * 没必要每次都打自己的函数。
 */

import { isPrivateIp } from './ipRegion.js'

export { isPrivateIp }

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FAILURE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE = 500

const cache = new Map()

/** 仅测试用:清空模块级缓存 */
export function resetIpRegionCache() {
  cache.clear()
}

function readCache(ip) {
  const hit = cache.get(ip)
  if (!hit) return null
  if (hit.expiresAt > Date.now()) return hit
  cache.delete(ip)
  return null
}

function writeCache(ip, region) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(ip, {
    region,
    expiresAt: Date.now() + (region ? CACHE_TTL_MS : FAILURE_TTL_MS),
  })
}

/**
 * 批量查询 IP 归属地。
 *
 * @param {string[]} ips
 * @param {string} accessToken 管理员 Supabase 会话令牌
 * @returns {Promise<Record<string, string|null>>} ip → 规范化地区(查询失败为 null)
 */
export async function lookupIpRegions(ips, accessToken) {
  const result = {}
  const list = [
    ...new Set((Array.isArray(ips) ? ips : []).map(ip => String(ip || '').trim()).filter(Boolean)),
  ]

  const missing = []
  for (const ip of list) {
    if (isPrivateIp(ip)) {
      result[ip] = null
      continue
    }
    const hit = readCache(ip)
    if (hit) {
      result[ip] = hit.region
    } else {
      missing.push(ip)
    }
  }

  if (!missing.length || !accessToken) {
    for (const ip of missing) result[ip] = null
    return result
  }

  try {
    const res = await fetch('/api/ip-region', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ips: missing }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    for (const ip of missing) {
      const region = typeof data?.regions?.[ip] === 'string' ? data.regions[ip] : null
      result[ip] = region
      writeCache(ip, region)
    }
  } catch {
    for (const ip of missing) {
      result[ip] = null
      writeCache(ip, null)
    }
  }

  return result
}

/** 单 IP 便捷包装 */
export async function lookupIpRegion(ip, accessToken) {
  const key = String(ip || '').trim()
  if (!key) return null
  const map = await lookupIpRegions([key], accessToken)
  return map[key] ?? null
}
