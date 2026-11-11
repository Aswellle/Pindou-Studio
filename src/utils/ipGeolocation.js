/**
 * IP 归属地查询(后台用户管理的「最近登录 IP」列)。
 *
 * 数据只存原始 IP(迁移 0035),归属地在后台界面**按需**查询:
 *   - 免费地理接口不稳定是常态,查询失败就显示「—」,不能影响列表本身;
 *   - 结果按 IP 做模块级缓存 —— 翻页/实时刷新会反复拿到同一批 IP,
 *     不缓存的话每次刷新都是一排外部请求;
 *   - 失败结果同样入缓存(值 null):列表刷新节奏快,不缓存会对同一个
 *     失败 IP 反复请求。会话内不再重试,刷新页面即可重查。
 *
 * 接口:ipwho.is(HTTPS + CORS,免密钥)。内网/保留地址直接返回 null,
 * 不发请求 —— 这类地址没有归属地可言。
 */

const LOOKUP_TIMEOUT_MS = 6000

const cache = new Map()

/** 内网 / 保留地址:归属地无意义,跳过查询 */
export function isPrivateIp(ip) {
  const s = String(ip || '').trim()
  if (!s) return true
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(s)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(s)
    || /^(::1|f[cd][0-9a-f]{2}:)/i.test(s)
    || s === 'localhost'
  )
}

/** 把接口返回的 国家/省/市 去重拼接(字段缺失安全) */
function formatRegion(data) {
  if (!data || data.success === false) return null
  const parts = [data.country, data.region, data.city]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
  const region = [...new Set(parts)].join(' ')
  return region || null
}

/**
 * 查询 IP 归属地。
 *
 * @param {string} ip
 * @returns {Promise<string|null>} 归属地文本;内网地址或查询失败返回 null
 */
export async function lookupIpRegion(ip) {
  const key = String(ip || '').trim()
  if (!key || isPrivateIp(key)) return null
  if (cache.has(key)) return cache.get(key)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(key)}`, {
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const region = formatRegion(await res.json())
    cache.set(key, region)
    return region
  } catch {
    cache.set(key, null) // 失败也缓存,避免列表每次刷新都重试同一个 IP
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 测试用:清空缓存 */
export function resetIpRegionCache() {
  cache.clear()
}
