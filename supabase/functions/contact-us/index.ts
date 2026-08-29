// deno-lint-ignore-file no-explicit-any

// 「联系我们」留言(线程式 IM):校验 Cloudflare Turnstile 人机验证 → 以
// participant_id(登录用户 id 或访客 localStorage UUID)写入 contact_messages。
// 管理员回复走 RPC admin_reply_contact(author='admin'),访客经 RPC
// get_contact_thread 拉取自己的线程,因此重新打开弹层可见历史与回复。
//
// Secrets:
//   TURNSTILE_SECRET_KEY  必填。Cloudflare Turnstile 的 Secret key(与站点前端
//                         VITE_TURNSTILE_SITE_KEY 配对;未设置时跳过验证——仅供本地开发)。
// SUPABASE_URL 由 Supabase Edge Function 自动注入。
// 写入密钥不再用 SUPABASE_SERVICE_ROLE_KEY(supabase-js 会把新格式 sb_secret_…
// 放到 Authorization Bearer,平台按 JWT 解析导致 "Invalid JWT" 401,即此前
// 前端「发送失败」根因),改用：1) 新 API Key 时代自动注入的 SUPABASE_SECRET_KEYS
// (JSON,键名 'default' = 服务端 Secret key);2) 直接 fetch PostgREST,密钥只放
// `apikey` 头(新密钥的官方用法)。

// 解析服务端 Secret key(新密钥格式优先,兜底旧 auto-injected 变量)
function getSecretKey(): string {
  const keysRaw = Deno.env.get('SUPABASE_SECRET_KEYS') || ''
  if (keysRaw) {
    try {
      const keys = JSON.parse(keysRaw)
      const k = keys?.['default']
      if (k) return String(k)
    } catch (e) {
      console.warn('[contact-us] 解析 SUPABASE_SECRET_KEYS 失败:', e)
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
}

const verifyTurnstile = async (token: string, remoteIp?: string): Promise<boolean> => {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) {
    // 未配置密钥(本地开发):跳过人机验证,交由后端写入。生产必须配置。
    console.warn('[contact-us] TURNSTILE_SECRET_KEY 未设置,跳过人机验证')
    return true
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
    return data?.success === true
  } catch (e) {
    console.error('[contact-us] siteverify 异常:', e)
    return false
  }
}

// CORS:浏览器跨域调用(站点域 tangnotes.site → 函数域 *.supabase.co)前会先发
// OPTIONS 预检;之前没处理预检 + 没有响应头,浏览器直接拦掉真实 POST,JS 层看到
// 网络错误 —— 此前用 curl 验证时不会触发(curl 不执行 CORS),因此一直被漏掉。
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (obj: any, status: number) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })

const PARTICIPANT_RE = /^[A-Za-z0-9_-]{4,64}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, reason: 'invalid_json' }, 400)
  }

  const message = String(body?.message || '').trim()
  const emailRaw = String(body?.email || '').trim()
  const participantId = String(body?.participant_id || '').trim()
  if (!message) return json({ ok: false, reason: 'empty_message' }, 400)
  if (message.length > 2000) return json({ ok: false, reason: 'message_too_long' }, 400)
  if (!PARTICIPANT_RE.test(participantId)) {
    return json({ ok: false, reason: 'invalid_participant' }, 400)
  }
  const email = emailRaw === '' ? null : emailRaw
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, reason: 'invalid_email' }, 400)
  }

  // Turnstile token 一次性:仅当本次带了 token 才校验(消费它);不带 token 时
  // 交由 RPC 判断该 participant 是否在信任窗口内曾验证通过(会话级信任)。
  const rawToken = String(body?.token || '')
  let verifiedNow = false
  if (rawToken) {
    const remoteIp =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      undefined
    verifiedNow = await verifyTurnstile(rawToken, remoteIp)
    if (!verifiedNow) return json({ ok: false, reason: 'captcha_failed' }, 400)
  }

  const sbUrl = Deno.env.get('SUPABASE_URL')
  const sbKey = getSecretKey()
  if (!sbUrl || !sbKey) {
    return json({ ok: false, reason: 'not_configured' }, 500)
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
    return json({ ok: false, reason: 'db_error' }, 500)
  }
  // RPC 返回 'ok' | 'captcha_required' | 'rate_limited'(PostgREST 标量返回带引号)
  const result = (await rpc.text()).replace(/"/g, '').trim()
  if (result === 'captcha_required') return json({ ok: false, reason: 'captcha_required' }, 400)
  if (result === 'rate_limited') return json({ ok: false, reason: 'rate_limited' }, 429)
  return json({ ok: true }, 200)
})
