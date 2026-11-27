// deno-lint-ignore-file no-explicit-any

// 「联系我们」留言(线程式 IM):校验 Cloudflare Turnstile 人机验证 → 以
// participant_id(登录用户 id 或访客 localStorage UUID)写入 contact_messages。
// 管理员回复走 RPC admin_reply_contact(author='admin'),访客经 RPC
// get_contact_thread 拉取自己的线程,因此重新打开弹层可见历史与回复。
//
// Secrets:
//   TURNSTILE_SECRET_KEY  必填。Cloudflare Turnstile 的 Secret key(与站点前端
//                         VITE_TURNSTILE_SITE_KEY 配对;未设置时失败关闭,
//                         仅显式 ALLOW_TURNSTILE_SKIP=true 的本地开发跳过)。
// SUPABASE_URL 由 Supabase Edge Function 自动注入。
// 写入密钥不再用 SUPABASE_SERVICE_ROLE_KEY(supabase-js 会把新格式 sb_secret_…
// 放到 Authorization Bearer,平台按 JWT 解析导致 "Invalid JWT" 401),改用：
// 1) 新 API Key 时代自动注入的 SUPABASE_SECRET_KEYS(JSON,键名 'default');
// 2) 直接 fetch PostgREST,密钥只放 `apikey` 头(新密钥的官方用法)。

const SITE_ORIGINS = new Set([
  'https://tangnotes.site',
  'https://www.tangnotes.site',
  'http://localhost:5280',
  'http://127.0.0.1:5280',
])

// Turnstile siteverify 返回的 hostname;只接受站点自己的域名。
const TURNSTILE_HOSTS = new Set(['tangnotes.site', 'www.tangnotes.site', 'localhost', '127.0.0.1'])

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const PARTICIPANT_RE = /^[A-Za-z0-9_-]{4,64}$/

// 解析服务端 Secret key(新密钥格式优先,兜底旧 auto-injected 变量)
function getSecretKey(): string {
  const keysRaw = Deno.env.get('SUPABASE_SECRET_KEYS') || ''
  if (keysRaw) {
    try {
      const keys = JSON.parse(keysRaw)
      const k = keys?.['default']
      if (k) return String(k)
    } catch {
      console.warn('[contact-us] 解析 SUPABASE_SECRET_KEYS 失败')
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}

const verifyTurnstile = async (token: string, remoteIp?: string): Promise<boolean> => {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) {
    // 缺配置必须「失败关闭」:把未设置当成验证通过,等于用一次遗漏就
    // 悄悄关掉了整个防滥用闸门。本地开发需要跳过时显式打开开关。
    if (Deno.env.get('ALLOW_TURNSTILE_SKIP') === 'true') {
      console.warn('[contact-us] TURNSTILE_SECRET_KEY 未设置且 ALLOW_TURNSTILE_SKIP=true,仅本地开发跳过')
      return true
    }
    console.error('[contact-us] TURNSTILE_SECRET_KEY 未配置,拒绝请求')
    return false
  }
  if (!token) return false
  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  if (remoteIp) body.append('remoteip', remoteIp)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    const data: any = await res.json()
    if (data?.success !== true) return false
    // Turnstile 的 success 只说明 token 有效;hostname 必须由服务端再校验,
    // 否则其他站点可以用公开 sitekey 生成 token 复用本函数。
    const hostname = String(data?.hostname || '').toLowerCase()
    if (!hostname || !TURNSTILE_HOSTS.has(hostname)) {
      console.warn('[contact-us] Turnstile hostname 拒绝:', hostname || '(empty)')
      return false
    }
    return true
  } catch (e) {
    console.error('[contact-us] siteverify 异常:', e)
    return false
  }
}

const CORS_ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'
const CORS_ALLOW_METHODS = 'POST, OPTIONS'

function corsFor(origin: string | null): Record<string, string> {
  const allowOrigin = origin && SITE_ORIGINS.has(origin) ? origin : 'https://tangnotes.site'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
    'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = corsFor(origin)

  if (origin && !SITE_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ ok: false, reason: 'origin_not_allowed' }), {
      status: 403,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors })
  }

  const respond = (obj: any, status: number) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    })

  let body: any
  try {
    body = await req.json()
  } catch {
    return respond({ ok: false, reason: 'invalid_json' }, 400)
  }

  const message = String(body?.message || '').trim()
  const emailRaw = String(body?.email || '').trim()
  const participantId = String(body?.participant_id || '').trim()
  if (!message) return respond({ ok: false, reason: 'empty_message' }, 400)
  if (message.length > 2000) return respond({ ok: false, reason: 'message_too_long' }, 400)
  if (!PARTICIPANT_RE.test(participantId)) {
    return respond({ ok: false, reason: 'invalid_participant' }, 400)
  }
  const email = emailRaw === '' ? null : emailRaw
  if (email) {
    // 长度上限:RFC 5321 允许的最长地址是 254 字符;前端输入框限 120,
    // 服务端不设上限的话,超长字符串会原样落库
    if (email.length > 254) return respond({ ok: false, reason: 'invalid_email' }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond({ ok: false, reason: 'invalid_email' }, 400)
    }
  }

  // Turnstile token 一次性:仅当本次带了 token 才校验(消费它);不带 token 时
  // 交由 RPC 判断该 participant 是否在信任窗口内曾验证通过(会话级信任)。
  const rawToken = String(body?.token || '')
  let verifiedNow = false
  if (rawToken) {
    // remoteip 是 siteverify 的可选一致性信号。x-forwarded-for 采用
    // **最后一个**条目:代理网关把真实客户端 IP 追加在链尾,最左边的
    // 条目是客户端自己带的、可以随意伪造 —— 取左边等于把伪造值交给
    // Cloudflare 校验。cf-connecting-ip 存在时(前置 CF)优先用它。
    const xff = req.headers.get('x-forwarded-for')
    const remoteIp =
      req.headers.get('cf-connecting-ip') ||
      (xff ? xff.split(',').map((s) => s.trim()).filter(Boolean).pop() : undefined)
    verifiedNow = await verifyTurnstile(rawToken, remoteIp)
    if (!verifiedNow) return respond({ ok: false, reason: 'captcha_failed' }, 400)
  }

  const sbUrl = Deno.env.get('SUPABASE_URL')
  const sbKey = getSecretKey()
  if (!sbUrl || !sbKey) {
    return respond({ ok: false, reason: 'not_configured' }, 500)
  }

  // 注册用户的 participant_id 就是 auth UUID:必须带与该 UUID 匹配的有效会话。
  // 访客 UUID 不在 profiles 中,保持匿名;这样匿名者无法把留言注入注册用户线程。
  if (UUID_RE.test(participantId)) {
    let registered = false
    try {
      const profileRes = await fetch(
        `${sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(participantId)}&select=id`,
        { headers: { apikey: sbKey, Accept: 'application/json' } },
      )
      if (!profileRes.ok) {
        console.error('[contact-us] 参与者身份查询失败:', profileRes.status)
        return respond({ ok: false, reason: 'identity_check_failed' }, 503)
      }
      const rows = await profileRes.json()
      registered = Array.isArray(rows) && rows.length > 0
    } catch (e) {
      console.error('[contact-us] 参与者身份查询异常:', e)
      return respond({ ok: false, reason: 'identity_check_failed' }, 503)
    }

    if (registered) {
      const authHeader = req.headers.get('authorization') || ''
      if (!authHeader) return respond({ ok: false, reason: 'auth_required' }, 401)
      try {
        const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
          headers: { apikey: sbKey, Authorization: authHeader },
        })
        if (!userRes.ok) return respond({ ok: false, reason: 'auth_required' }, 401)
        const authUser: any = await userRes.json()
        if (authUser?.id !== participantId) {
          return respond({ ok: false, reason: 'participant_mismatch' }, 403)
        }
      } catch (e) {
        console.error('[contact-us] 会话校验异常:', e)
        return respond({ ok: false, reason: 'auth_required' }, 401)
      }
    }
  }

  // 原子提交:会话级人机验证门禁 + 限流 + 入库(SECURITY DEFINER,仅 service_role)。
  // 新格式 Secret key 仅放 `apikey` 头(放 Authorization Bearer 会被当 JWT 解析 → 401)。
  const rpc = await fetch(`${sbUrl}/rest/v1/rpc/submit_contact_message`, {
    method: 'POST',
    headers: {
      'apikey': sbKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_participant_id: participantId,
      p_email: email,
      p_message: message,
      p_verified_now: verifiedNow,
    }),
  })
  if (!rpc.ok) {
    const errBody = await rpc.text()
    console.error('[contact-us] 提交失败:', rpc.status, errBody.slice(0, 400))
    return respond({ ok: false, reason: 'db_error' }, 500)
  }
  // RPC 返回 'ok' | 'captcha_required' | 'rate_limited'(PostgREST 标量返回带引号)
  const result = (await rpc.text()).replace(/"/g, '').trim()
  if (result === 'captcha_required') return respond({ ok: false, reason: 'captcha_required' }, 400)
  if (result === 'rate_limited') return respond({ ok: false, reason: 'rate_limited' }, 429)
  return respond({ ok: true }, 200)
})
